/**
 * Main.gs: sheet setup, triggers, the reminder loop and the daily digest.
 *
 * Triggers (created by installTriggers):
 *   runReminders     every 5 minutes
 *   sendDailyDigest  every day at DIGEST_HOUR
 *   pollTelegram     every minute (only when BOT_MODE = polling)
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Reminder Bot')
    .addItem('1. Set up sheets', 'setupSheets')
    .addItem('2. Install triggers', 'installTriggers')
    .addItem('3. Connect Telegram (webhook)', 'setTelegramWebhook')
    .addSeparator()
    .addItem('Run reminders now', 'runReminders')
    .addItem('Send digest now', 'sendDailyDigest')
    .addItem('Send test message to admins', 'sendTestMessage')
    .addToUi();
}

// ---------- Sheets ----------

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found. Run "Set up sheets" first.');
  return sh;
}

/** Reads a sheet into objects. Each object keeps its 1-based row number in _row. */
function readTable_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var headers = values.shift().map(function (h) { return String(h).trim(); });
  return {
    sheet: sh,
    headers: headers,
    rows: values.map(function (r, i) {
      var o = { _row: i + 2 };
      headers.forEach(function (h, j) { o[h] = r[j]; });
      return o;
    })
  };
}

/** Writes only the fields in patch (keeps user edits in other cells). */
function updateRow_(table, row, patch) {
  Object.keys(patch).forEach(function (k) {
    var col = table.headers.indexOf(k);
    if (col < 0) return;
    table.sheet.getRange(row._row, col + 1).setValue(patch[k] === null ? '' : patch[k]);
    row[k] = patch[k];
  });
}

function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  var make = function (name, headers) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  };
  var tasks = make(SHEETS.TASKS, TASK_HEADERS);
  make(SHEETS.TEAM, TEAM_HEADERS);
  make(SHEETS.LOG, LOG_HEADERS);
  var cfgSheet = make(SHEETS.CONFIG, ['key', 'value']);
  if (cfgSheet.getLastRow() === 1) {
    var rows = Object.keys(DEFAULT_CONFIG).map(function (k) { return [k, DEFAULT_CONFIG[k]]; });
    cfgSheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
  ['due_at', 'next_remind_at', 'last_sent_at', 'created_at'].forEach(function (h) {
    var col = TASK_HEADERS.indexOf(h) + 1;
    tasks.getRange(2, col, tasks.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  var status = SpreadsheetApp.newDataValidation().requireValueInList(['open', 'done', 'cancelled'], true).build();
  tasks.getRange(2, TASK_HEADERS.indexOf('status') + 1, tasks.getMaxRows() - 1, 1).setDataValidation(status);
  var repeat = SpreadsheetApp.newDataValidation().requireValueInList(REPEATS, true).build();
  tasks.getRange(2, TASK_HEADERS.indexOf('repeat') + 1, tasks.getMaxRows() - 1, 1).setDataValidation(repeat);

  _cfgCache = null;
  var tz = getConfig().TIMEZONE;
  ss.setSpreadsheetTimeZone(tz);
  if (Session.getScriptTimeZone() !== tz) {
    SpreadsheetApp.getUi().alert('Time zone mismatch: script = ' + Session.getScriptTimeZone() + ', Config = ' + tz +
      '.\nSet "timeZone" in appsscript.json (Project Settings → show manifest) to ' + tz + '.');
  }
  logEvent('INFO', 'setup', 'Sheets ready');
}

function installTriggers() {
  var cfg = getConfig();
  var ours = ['runReminders', 'sendDailyDigest', 'pollTelegram'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (ours.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runReminders').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(cfg.DIGEST_HOUR).create();
  if (cfg.BOT_MODE === 'polling') ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();
  logEvent('INFO', 'triggers_installed', 'mode=' + cfg.BOT_MODE + ', digest=' + cfg.DIGEST_HOUR + 'h');
}

// ---------- Team ----------

function getTeam_() {
  return readTable_(SHEETS.TEAM).rows.filter(function (m) {
    return m.name && String(m.active).toUpperCase() !== 'FALSE';
  });
}

function memberByChat_(team, chatId) {
  return team.filter(function (m) { return String(m.telegram_chat_id) === String(chatId); })[0] || null;
}

function memberByName_(team, name) {
  return team.filter(function (m) { return String(m.name) === String(name); })[0] || null;
}

// ---------- Tasks ----------

/** Adds a task row. Returns the new task object. Caller should hold the script lock. */
function addTask(fields, createdBy, source) {
  var table = readTable_(SHEETS.TASKS);
  var maxId = table.rows.reduce(function (m, r) { return Math.max(m, toInt_(r.id, 0)); }, 0);
  var now = new Date();
  var t = {
    id: maxId + 1,
    task: fields.task,
    assignee: fields.assignee || createdBy,
    due_at: fields.due_at,
    remind_before_min: fields.remind_before_min,
    repeat: fields.repeat || 'none',
    priority: fields.priority || 'normal',
    status: STATUS.OPEN,
    notes: '',
    next_remind_at: '',
    remind_count: 0,
    last_sent_at: '',
    created_by: createdBy,
    created_at: now,
    source: String(source || '').slice(0, 500)
  };
  var first = firstRemindAt(t.due_at, t.remind_before_min);
  t.next_remind_at = first.getTime() < now.getTime() ? t.due_at : first;
  table.sheet.appendRow(TASK_HEADERS.map(function (h) { return t[h]; }));
  return t;
}

function findTask_(table, id) {
  return table.rows.filter(function (r) { return String(r.id) === String(id); })[0] || null;
}

function taskLine_(t) {
  var icon = t.priority === 'high' ? '🔴' : (t.priority === 'low' ? '⚪' : '🟡');
  var rep = normalizeRepeat(t.repeat) !== 'none' ? ' 🔁' + t.repeat : '';
  return icon + ' <code>#' + t.id + '</code> ' + escapeHtml(t.task) + ' · <i>' + fmtDate(t.due_at) + '</i>' + rep;
}

// ---------- Reminder loop (every 5 minutes) ----------

function runReminders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { logEvent('WARN', 'reminders_skipped', 'lock busy'); return; }
  try {
    var cfg = getConfig();
    var now = new Date();
    var team = getTeam_();
    var table = readTable_(SHEETS.TASKS);
    var sent = 0, failed = 0;

    table.rows.forEach(function (t) {
      if (!t.task || String(t.status || STATUS.OPEN).toLowerCase() !== STATUS.OPEN) return;
      var due = toDate_(t.due_at);
      if (!due) return;
      // Tasks typed straight into the sheet: fill in the missing schedule.
      var neverScheduled = t.next_remind_at === '' && toInt_(t.remind_count, 0) === 0 && !t.last_sent_at;
      if (t.status === '' || !t.id || neverScheduled) {
        var before = t.remind_before_min === '' ? cfg.DEFAULT_REMIND_BEFORE_MIN : t.remind_before_min;
        var first = firstRemindAt(due, before);
        updateRow_(table, t, {
          id: t.id || (Math.max.apply(null, table.rows.map(function (r) { return toInt_(r.id, 0); })) + 1),
          status: STATUS.OPEN, remind_before_min: before, remind_count: 0,
          next_remind_at: first.getTime() < now.getTime() ? due : first,
          created_at: t.created_at || now
        });
      }
      var next = toDate_(t.next_remind_at);
      if (!next || next.getTime() > now.getTime()) return;

      var member = memberByName_(team, t.assignee);
      if (!member) {
        updateRow_(table, t, { next_remind_at: '', notes: 'No active team member named "' + t.assignee + '"' });
        logEvent('ERROR', 'unknown_assignee', '#' + t.id + ' ' + t.assignee);
        failed++;
        return;
      }
      try {
        notify(member, reminderMessage_(t, now));
        var patch = planAfterSend(t, now, { overdueRepeatHours: cfg.OVERDUE_REPEAT_HOURS, maxOverdue: cfg.MAX_OVERDUE_REMINDERS });
        var rolled = patch.rolled, exhausted = patch.exhausted;
        delete patch.rolled; delete patch.exhausted;
        updateRow_(table, t, patch);
        if (rolled) logEvent('INFO', 'repeat_missed_rolled', '#' + t.id + ' → ' + fmtDate(t.due_at));
        if (exhausted) logEvent('INFO', 'nags_exhausted', '#' + t.id + ' stays open (shown in digest)');
        sent++;
      } catch (err) {
        failed++;
        // Retry this task on the next run, 10 minutes later, instead of hammering the channel.
        updateRow_(table, t, { next_remind_at: new Date(now.getTime() + 10 * MINUTE) });
        logEvent('ERROR', 'send_failed', '#' + t.id + ' → ' + member.name + ' (' + member.channel + '): ' + err);
      }
    });

    if (sent || failed) logEvent(failed ? 'WARN' : 'INFO', 'reminders_run', 'sent=' + sent + ' failed=' + failed);
    if (failed) alertAdmins_('⚠️ ' + failed + ' reminder(s) failed. See the Log sheet.');
  } catch (err) {
    logEvent('ERROR', 'reminders_crashed', String(err && err.stack || err));
    alertAdmins_('❌ Reminder run crashed: ' + escapeHtml(String(err)));
  } finally {
    lock.releaseLock();
  }
}

function reminderMessage_(t, now) {
  var kind = reminderKind(t, now);
  var head = kind === 'upcoming' ? '⏰ <b>Coming up</b>' : (kind === 'due' ? '🔔 <b>Due now</b>' : '❗ <b>Overdue</b>');
  var lines = [head, taskLine_(t)];
  if (t.notes) lines.push('📝 ' + escapeHtml(t.notes));
  if (t.created_by && t.created_by !== t.assignee) lines.push('From: ' + escapeHtml(t.created_by));
  return { html: lines.join('\n'), subject: 'Reminder: ' + t.task, taskId: t.id };
}

// ---------- Daily digest ----------

function sendDailyDigest() {
  try {
    var now = new Date();
    var tasks = readTable_(SHEETS.TASKS).rows;
    getTeam_().forEach(function (m) {
      if (String(m.digest).toUpperCase() === 'FALSE') return;
      var mine = tasks.filter(function (t) { return t.assignee === m.name; });
      var g = groupForDigest(mine, now);
      if (!g.overdue.length && !g.today.length && !g.soon.length) return;
      var lines = ['☀️ <b>Good morning, ' + escapeHtml(String(m.name).split(' ')[0]) + '</b>'];
      var brief = aiDigestSummary(m, g);
      if (brief) lines.push('<i>' + escapeHtml(brief) + '</i>');
      if (g.overdue.length) lines.push('\n<b>Overdue</b>', g.overdue.map(taskLine_).join('\n'));
      if (g.today.length) lines.push('\n<b>Today</b>', g.today.map(taskLine_).join('\n'));
      if (g.soon.length) lines.push('\n<b>Next 3 days</b>', g.soon.map(taskLine_).join('\n'));
      lines.push('\nMark done: /done &lt;id&gt;');
      try {
        notify(m, { html: lines.join('\n'), subject: 'Your tasks for ' + fmtDate(now, 'EEE d MMM') });
      } catch (err) {
        logEvent('ERROR', 'digest_failed', m.name + ': ' + err);
      }
    });
    logEvent('INFO', 'digest_sent', '');
  } catch (err) {
    logEvent('ERROR', 'digest_crashed', String(err && err.stack || err));
    alertAdmins_('❌ Daily digest crashed: ' + escapeHtml(String(err)));
  }
}

// ---------- Logging and admin alerts ----------

function logEvent(level, event, detail) {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.LOG);
    if (sh) sh.appendRow([new Date(), level, event, String(detail || '').slice(0, 1000)]);
    // Keep the log short.
    if (sh && sh.getLastRow() > 2000) sh.deleteRows(2, 500);
  } catch (e) { /* logging must never break the bot */ }
  console.log(level + ' ' + event + ' ' + (detail || ''));
}

/** Telegram alert to every is_admin member, at most once per 30 minutes per message. */
function alertAdmins_(html) {
  try {
    var cache = CacheService.getScriptCache();
    var key = 'alert_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, html));
    if (cache.get(key)) return;
    cache.put(key, '1', 1800);
    getTeam_().forEach(function (m) {
      if (String(m.is_admin).toUpperCase() === 'TRUE' && m.telegram_chat_id) tgSend(m.telegram_chat_id, html);
    });
  } catch (e) { console.error('alert failed: ' + e); }
}

function sendTestMessage() {
  getTeam_().forEach(function (m) {
    if (String(m.is_admin).toUpperCase() === 'TRUE') notify(m, { html: '✅ <b>Reminder bot is connected</b>\nChannel: ' + m.channel, subject: 'Test' });
  });
}
