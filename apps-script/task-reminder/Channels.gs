/**
 * Channels.gs: one notify() for every platform.
 * Telegram is two-way (buttons, free-text tasks). Slack, Discord, Google Chat and email are one-way.
 *
 * Team sheet:
 *   channel = telegram | slack | discord | gchat | email
 *   channel_target = Script Property NAME holding the webhook URL (slack/discord/gchat),
 *                    or an email address (email). Not needed for telegram.
 */

/** UrlFetch with retry on 429 / 5xx / network errors. Returns { code, json, text }. */
function fetchWithRetry(url, options, maxTries) {
  maxTries = maxTries || 3;
  options = options || {};
  options.muteHttpExceptions = true;
  var last;
  for (var i = 0; i < maxTries; i++) {
    try {
      var res = UrlFetchApp.fetch(url, options);
      var code = res.getResponseCode();
      var text = res.getContentText();
      var json = null;
      try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
      if (code === 429 || code >= 500) {
        var wait = (json && json.parameters && json.parameters.retry_after) ? json.parameters.retry_after * 1000 : 1000 * Math.pow(2, i);
        last = { code: code, json: json, text: text };
        if (i < maxTries - 1) Utilities.sleep(Math.min(wait, 20000));
        continue;
      }
      return { code: code, json: json, text: text };
    } catch (err) {
      last = { code: 0, json: null, text: String(err) };
      if (i < maxTries - 1) Utilities.sleep(1000 * Math.pow(2, i));
    }
  }
  return last;
}

// ---------- Telegram ----------

function tg_(method, payload) {
  var token = getSecret('TELEGRAM_TOKEN', true);
  var res = fetchWithRetry('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
  if (!res.json || !res.json.ok) {
    throw new Error('Telegram ' + method + ' failed (' + res.code + '): ' + String(res.text).slice(0, 300));
  }
  return res.json.result;
}

function tgSend(chatId, html, buttons) {
  var payload = { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (buttons) payload.reply_markup = { inline_keyboard: buttons };
  return tg_('sendMessage', payload);
}

function tgEdit(chatId, messageId, html, buttons) {
  var payload = { chat_id: chatId, message_id: messageId, text: html, parse_mode: 'HTML' };
  payload.reply_markup = { inline_keyboard: buttons || [] };
  try { return tg_('editMessageText', payload); } catch (e) { return null; } // "message is not modified" is fine
}

function tgAnswer(callbackId, text) {
  try { tg_('answerCallbackQuery', { callback_query_id: callbackId, text: text || '' }); } catch (e) { /* ignore */ }
}

function reminderButtons(taskId) {
  return [[
    { text: '✅ Done', callback_data: 'done:' + taskId },
    { text: '⏰ +1h', callback_data: 'snooze1h:' + taskId },
    { text: '📅 Tomorrow', callback_data: 'tomorrow:' + taskId }
  ]];
}

// ---------- One-way webhooks ----------

function webhookUrl_(member) {
  var name = String(member.channel_target || '').trim();
  if (!name) throw new Error('Team "' + member.name + '": channel_target is empty');
  if (/^https?:\/\//i.test(name)) throw new Error('Team "' + member.name + '": put the webhook URL in Script Properties, and its NAME in channel_target');
  return getSecret(name, true);
}

function postJson_(url, body) {
  var res = fetchWithRetry(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body) });
  if (res.code < 200 || res.code >= 300) throw new Error('Webhook failed (' + res.code + '): ' + String(res.text).slice(0, 200));
}

/** Telegram HTML → plain text with simple markdown for Slack / Discord / Google Chat. */
function htmlToMarkdown_(html, bold) {
  return String(html)
    .replace(/<b>(.*?)<\/b>/g, bold + '$1' + bold)
    .replace(/<i>(.*?)<\/i>/g, '_$1_')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Send to a team member on their channel.
 * msg = { html, subject, taskId (optional: adds buttons on Telegram) }
 */
function notify(member, msg) {
  var channel = String(member.channel || 'telegram').toLowerCase();
  switch (channel) {
    case 'telegram':
      if (!member.telegram_chat_id) throw new Error('Team "' + member.name + '": telegram_chat_id is empty');
      return tgSend(member.telegram_chat_id, msg.html, msg.taskId ? reminderButtons(msg.taskId) : null);
    case 'slack':
      return postJson_(webhookUrl_(member), { text: htmlToMarkdown_(msg.html, '*') });
    case 'discord':
      return postJson_(webhookUrl_(member), { content: htmlToMarkdown_(msg.html, '**').slice(0, 1990) });
    case 'gchat':
      return postJson_(webhookUrl_(member), { text: htmlToMarkdown_(msg.html, '*') });
    case 'email':
      return MailApp.sendEmail({
        to: member.channel_target,
        subject: msg.subject || 'Reminder',
        htmlBody: String(msg.html).replace(/\n/g, '<br>')
      });
    default:
      throw new Error('Unknown channel "' + channel + '" for ' + member.name);
  }
}
