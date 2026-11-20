/**
 * Bot.gs: Telegram in both directions.
 *   webhook mode: deploy as Web app, run setTelegramWebhook() once.
 *   polling mode: no web app; pollTelegram() runs every minute (up to ~1 min delay).
 *
 * Only people listed in the Team sheet (by telegram_chat_id) can use the bot.
 */

var HELP_TEXT = [
  '<b>Just type what to remember</b>, for example:',
  '• <i>Send the Acme invoice Friday 3pm</i>',
  '• <i>Remind Linh to call the supplier tomorrow morning, urgent</i>',
  '• <i>Team standup every weekday 9:30, remind me 10 min before</i>',
  '• <i>Nhắc tôi nộp báo cáo thuế 17h ngày 25</i>',
  '',
  '/today: what is due today and overdue',
  '/list: all my open tasks',
  '/done 12: mark task #12 done',
  '/cancel 12: cancel task #12',
  '/myid: show your chat id',
  '',
  'No AI? Use: <code>Task | 2026-11-21 15:00 | 30 | weekly</code>'
].join('\n');

// ---------- Entry points ----------

function doPost(e) {
  try {
    var secret = getSecret('WEBHOOK_SECRET', true);
    if (!e || !e.parameter || e.parameter.secret !== secret) return ContentService.createTextOutput('forbidden');
    var update = JSON.parse(e.postData.contents);
    handleUpdate_(update);
  } catch (err) {
    logEvent('ERROR', 'webhook_failed', String(err && err.stack || err));
  }
  return ContentService.createTextOutput('ok'); // always answer, so Telegram does not resend
}

function doGet() {
  return ContentService.createTextOutput('Reminder bot is running.');
}

/** Polling mode: fetch new updates since the last stored offset. */
function pollTelegram() {
  // Guard with the cache (not the script lock: handlers take the script lock themselves).
  var cache = CacheService.getScriptCache();
  if (cache.get('polling')) return;
  cache.put('polling', '1', 55);
  try {
    var props = PropertiesService.getScriptProperties();
    var offset = toInt_(props.getProperty('TG_OFFSET'), 0);
    var updates = tg_('getUpdates', { offset: offset, timeout: 0, allowed_updates: ['message', 'callback_query'] });
    updates.forEach(function (u) {
      props.setProperty('TG_OFFSET', String(u.update_id + 1)); // move on even if handling fails
      handleUpdate_(u);
    });
  } catch (err) {
    logEvent('ERROR', 'poll_failed', String(err));
  } finally {
    cache.remove('polling');
  }
}

/** Run once after deploying the Web app (Deploy → New deployment → Web app, access: Anyone). */
function setTelegramWebhook() {
  var url = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || ScriptApp.getService().getUrl();
  if (!url) throw new Error('Deploy the script as a Web app first, or set Script Property WEBAPP_URL');
  var secret = getSecret('WEBHOOK_SECRET', true);
  tg_('setWebhook', {
    url: url + '?secret=' + encodeURIComponent(secret),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
  var info = tg_('getWebhookInfo', {});
  logEvent('INFO', 'webhook_set', 'pending=' + info.pending_update_count + ' last_error=' + (info.last_error_message || 'none'));
  try { SpreadsheetApp.getUi().alert('Webhook set.\nLast error: ' + (info.last_error_message || 'none')); } catch (e) { /* run from editor */ }
}

/** Switch to polling: removes the webhook (Telegram allows only one of the two). */
function deleteTelegramWebhook() {
  tg_('deleteWebhook', { drop_pending_updates: false });
  logEvent('INFO', 'webhook_deleted', '');
}

// ---------- Update handling ----------

function handleUpdate_(update) {
  // Telegram may deliver the same update twice (retries). Skip duplicates for 6 hours.
  var cache = CacheService.getScriptCache();
  var key = 'upd_' + update.update_id;
  if (cache.get(key)) return;
  cache.put(key, '1', 21600);

  var chatId = update.message ? update.message.chat.id : null;
  try {
    return routeUpdate_(update);
  } catch (err) {
    logEvent('ERROR', 'update_failed', String(err && err.stack || err));
    if (chatId) { try { tgSend(chatId, '⚠️ Something went wrong. Please try again in a minute.'); } catch (e) { /* ignore */ } }
  }
}

function routeUpdate_(update) {
  if (update.callback_query) return handleCallback_(update.callback_query);
  var msg = update.message;
  if (!msg || !msg.text) return;

  var chatId = msg.chat.id;
  var team = getTeam_();
  var me = memberByChat_(team, chatId);
  var cmd = parseCommand(msg.text);

  if (cmd && (cmd.cmd === 'myid' || cmd.cmd === 'start') && !me) {
    return tgSend(chatId, 'Your chat id: <code>' + chatId + '</code>\nAsk your admin to add it to the Team sheet.');
  }
  if (!me) {
    logEvent('WARN', 'unknown_chat', chatId + ' ' + (msg.from && msg.from.username || ''));
    return tgSend(chatId, 'Sorry, you are not on this team yet. Your chat id: <code>' + chatId + '</code>');
  }

  if (cmd) return handleCommand_(cmd, me, chatId);
  return handleFreeText_(msg.text, me, team, chatId);
}

function handleCommand_(cmd, me, chatId) {
  var table = readTable_(SHEETS.TASKS);
  var mine = table.rows.filter(function (t) { return t.assignee === me.name && t.status === STATUS.OPEN; });
  switch (cmd.cmd) {
    case 'start':
    case 'help':
      return tgSend(chatId, '👋 Hi ' + escapeHtml(me.name) + '!\n\n' + HELP_TEXT);
    case 'myid':
      return tgSend(chatId, 'Your chat id: <code>' + chatId + '</code>');
    case 'list':
      if (!mine.length) return tgSend(chatId, 'No open tasks. 🎉');
      mine.sort(function (a, b) { return toDate_(a.due_at) - toDate_(b.due_at); });
      return tgSend(chatId, '<b>Your open tasks</b>\n' + mine.slice(0, 40).map(taskLine_).join('\n'));
    case 'today':
      var g = groupForDigest(mine, new Date());
      var out = [];
      if (g.overdue.length) out.push('<b>Overdue</b>', g.overdue.map(taskLine_).join('\n'));
      if (g.today.length) out.push('<b>Today</b>', g.today.map(taskLine_).join('\n'));
      return tgSend(chatId, out.length ? out.join('\n') : 'Nothing due today. 🎉');
    case 'done':
    case 'cancel':
      return withLock_(function () {
        var t2 = readTable_(SHEETS.TASKS);
        var t = findTask_(t2, cmd.arg.replace('#', ''));
        if (!t || !canTouch_(me, t)) return tgSend(chatId, 'Task #' + escapeHtml(cmd.arg) + ' not found.');
        var now = new Date();
        var patch = cmd.cmd === 'done' ? planDone(t, now) : { status: STATUS.CANCELLED, next_remind_at: '' };
        var rolled = patch.rolled; delete patch.rolled;
        updateRow_(t2, t, patch);
        logEvent('INFO', 'task_' + cmd.cmd, '#' + t.id + ' by ' + me.name);
        if (rolled) return tgSend(chatId, '✅ Done. Next time: ' + fmtDate(t.due_at));
        return tgSend(chatId, (cmd.cmd === 'done' ? '✅ Done: ' : '🗑 Cancelled: ') + escapeHtml(t.task));
      });
    default:
      return tgSend(chatId, HELP_TEXT);
  }
}

function handleFreeText_(text, me, team, chatId) {
  var cfg = getConfig();
  var now = new Date();
  var names = team.map(function (m) { return String(m.name); });
  var parsed = parseManual(text, tzOffset(now));

  if (!parsed && cfg.AI_PROVIDER !== 'none') {
    try {
      parsed = aiParseTask(text, {
        offset: tzOffset(now),
        tz: cfg.TIMEZONE,
        nowText: Utilities.formatDate(now, cfg.TIMEZONE, "EEEE yyyy-MM-dd'T'HH:mm:ssXXX"),
        sender: me.name,
        team: names,
        defaultBefore: cfg.DEFAULT_REMIND_BEFORE_MIN
      });
    } catch (err) {
      logEvent('ERROR', 'ai_failed', String(err));
      return tgSend(chatId, '⚠️ I could not reach the AI right now. Please use:\n<code>Task | 2026-11-21 15:00 | 30</code>');
    }
  }
  if (!parsed) return tgSend(chatId, HELP_TEXT);

  var v = validateParsed(parsed, now, names);
  if (!v.ok) {
    logEvent('INFO', 'parse_rejected', v.error + ': ' + text.slice(0, 200));
    return tgSend(chatId, escapeHtml(v.clarify || 'Sorry, I did not get that. Try: "Call Anna tomorrow 10am".'));
  }

  return withLock_(function () {
    var t = addTask(v.task, me.name, text);
    logEvent('INFO', 'task_added', '#' + t.id + ' for ' + t.assignee + ' by ' + me.name);
    var lines = ['📌 <b>Saved</b>', taskLine_(t), 'First reminder: ' + fmtDate(t.next_remind_at)];
    if (t.assignee !== me.name) {
      lines.push('Assigned to ' + escapeHtml(t.assignee));
      var other = memberByName_(team, t.assignee);
      try {
        if (other) notify(other, { html: '📥 <b>New task from ' + escapeHtml(me.name) + '</b>\n' + taskLine_(t), subject: 'New task: ' + t.task });
      } catch (err) { logEvent('ERROR', 'assign_notify_failed', String(err)); }
    }
    return tgSend(chatId, lines.join('\n'), [[{ text: '↩️ Undo', callback_data: 'undo:' + t.id }]]);
  });
}

function handleCallback_(cb) {
  var parts = String(cb.data || '').split(':');
  var action = parts[0], id = parts[1];
  var chatId = cb.message && cb.message.chat.id;
  var me = memberByChat_(getTeam_(), cb.from.id) || memberByChat_(getTeam_(), chatId);
  if (!me) return tgAnswer(cb.id, 'Not allowed');

  withLock_(function () {
    var table = readTable_(SHEETS.TASKS);
    var t = findTask_(table, id);
    if (!t || !canTouch_(me, t)) return tgAnswer(cb.id, 'Task not found');
    var now = new Date();
    var cfg = getConfig();
    var patch, note;
    if (action === 'done') { patch = planDone(t, now); note = patch.rolled ? '✅ Done · next: ' + fmtDate(patch.due_at) : '✅ Done'; }
    else if (action === 'snooze1h') { patch = planSnooze('1h', now); note = '⏰ Snoozed to ' + fmtDate(patch.next_remind_at, 'HH:mm'); }
    else if (action === 'tomorrow') { patch = planSnooze('tomorrow', now, cfg.WORK_START_HOUR); note = '📅 Moved to ' + fmtDate(patch.next_remind_at); }
    else if (action === 'undo') { patch = { status: STATUS.CANCELLED, next_remind_at: '' }; note = '↩️ Removed'; }
    else return tgAnswer(cb.id, '');
    delete patch.rolled;
    updateRow_(table, t, patch);
    logEvent('INFO', 'button_' + action, '#' + t.id + ' by ' + me.name);
    tgAnswer(cb.id, note);
    if (cb.message) tgEdit(chatId, cb.message.message_id, cb.message.text ? escapeHtml(cb.message.text) + '\n\n<b>' + escapeHtml(note) + '</b>' : note, []);
  });
}

/** Members act on their own tasks; admins on any task. */
function canTouch_(me, t) {
  return t.assignee === me.name || t.created_by === me.name || String(me.is_admin).toUpperCase() === 'TRUE';
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Busy, please try again');
  try { return fn(); } finally { lock.releaseLock(); }
}
