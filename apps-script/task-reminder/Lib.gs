/**
 * Lib.gs: pure logic (no Apps Script services), so it can be unit-tested in Node.
 * Test: node 03-portfolio/20-ai-task-reminder/test/lib.test.js
 */

var REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
var PRIORITIES = ['high', 'normal', 'low'];
var STATUS = { OPEN: 'open', DONE: 'done', CANCELLED: 'cancelled' };

var TASK_HEADERS = [
  'id', 'task', 'assignee', 'due_at', 'remind_before_min', 'repeat', 'priority',
  'status', 'notes', 'next_remind_at', 'remind_count', 'last_sent_at', 'created_by',
  'created_at', 'source'
];
var TEAM_HEADERS = ['name', 'telegram_chat_id', 'channel', 'channel_target', 'digest', 'active', 'is_admin'];
var LOG_HEADERS = ['time', 'level', 'event', 'detail'];

var MINUTE = 60 * 1000;
var HOUR = 60 * MINUTE;

function toDate_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toInt_(v, fallback) {
  var n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function normalizeRepeat(v) {
  var s = String(v || 'none').trim().toLowerCase();
  return REPEATS.indexOf(s) >= 0 ? s : 'none';
}

function normalizePriority(v) {
  var s = String(v || 'normal').trim().toLowerCase();
  return PRIORITIES.indexOf(s) >= 0 ? s : 'normal';
}

/** First reminder: N minutes before the due time (or at the due time when N = 0). */
function firstRemindAt(due, remindBeforeMin) {
  var d = toDate_(due);
  if (!d) return null;
  return new Date(d.getTime() - Math.max(0, toInt_(remindBeforeMin, 0)) * MINUTE);
}

/** Next due date for a repeating task, strictly after `after`. Uses local (script) time. */
function nextOccurrence(due, repeat, after) {
  var d = new Date(toDate_(due).getTime());
  var limit = toDate_(after) || d;
  var day = d.getDate();
  var guard = 0;
  do {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'weekdays') {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    } else if (repeat === 'monthly') {
      var m = d.getMonth() + 1;
      var y = d.getFullYear() + Math.floor(m / 12);
      m = m % 12;
      var last = new Date(y, m + 1, 0).getDate();
      d = new Date(y, m, Math.min(day, last), d.getHours(), d.getMinutes(), 0, 0);
    } else return null;
    guard++;
  } while (d.getTime() <= limit.getTime() && guard < 1000);
  return d;
}

/**
 * What kind of reminder is due now.
 * upcoming: before the due time · due: first one at/after due · overdue: nags after that.
 */
function reminderKind(task, now) {
  var due = toDate_(task.due_at);
  if (now.getTime() < due.getTime()) return 'upcoming';
  return toInt_(task.remind_count, 0) === 0 ? 'due' : 'overdue';
}

/**
 * Schedule after a reminder was sent. Returns a patch for the task row.
 * cfg: { overdueRepeatHours, maxOverdue }
 */
function planAfterSend(task, now, cfg) {
  var due = toDate_(task.due_at);
  var kind = reminderKind(task, now);
  var patch = { last_sent_at: now };
  if (kind === 'upcoming') {
    patch.next_remind_at = due;
    patch.remind_count = toInt_(task.remind_count, 0);
    return patch;
  }
  var count = toInt_(task.remind_count, 0) + 1;
  patch.remind_count = count;
  if (count <= cfg.maxOverdue) {
    patch.next_remind_at = new Date(now.getTime() + cfg.overdueRepeatHours * HOUR);
    return patch;
  }
  // Nags exhausted.
  var repeat = normalizeRepeat(task.repeat);
  if (repeat !== 'none') {
    return rollRepeat(task, now, patch);
  }
  patch.next_remind_at = '';
  patch.exhausted = true;
  return patch;
}

/** Move a repeating task to its next occurrence and reset counters. */
function rollRepeat(task, now, patch) {
  patch = patch || {};
  var next = nextOccurrence(task.due_at, normalizeRepeat(task.repeat), now);
  patch.due_at = next;
  patch.status = STATUS.OPEN;
  patch.remind_count = 0;
  patch.next_remind_at = firstRemindAt(next, task.remind_before_min);
  if (patch.next_remind_at.getTime() <= now.getTime()) patch.next_remind_at = next;
  patch.rolled = true;
  return patch;
}

/** Patch when the user taps ✅ Done. Repeating tasks roll forward instead of closing. */
function planDone(task, now) {
  if (normalizeRepeat(task.repeat) !== 'none') return rollRepeat(task, now, { last_sent_at: task.last_sent_at || '' });
  return { status: STATUS.DONE, next_remind_at: '' };
}

/** Snooze: '1h' | '3h' | 'tomorrow' (tomorrow at workStartHour local time). */
function planSnooze(option, now, workStartHour) {
  var t;
  if (option === '1h') t = new Date(now.getTime() + HOUR);
  else if (option === '3h') t = new Date(now.getTime() + 3 * HOUR);
  else {
    t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, workStartHour || 9, 0, 0, 0);
  }
  return { next_remind_at: t };
}

/** Validate the AI result. Code, not the model, decides what gets saved. */
function validateParsed(obj, now, teamNames) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not_json' };
  if (obj.is_task === false) return { ok: false, error: 'not_task', clarify: obj.clarify || null };
  var task = String(obj.task || '').trim();
  if (!task) return { ok: false, error: 'no_task', clarify: obj.clarify || null };
  if (task.length > 200) task = task.slice(0, 197) + '...';
  if (!obj.due_at) return { ok: false, error: 'no_due', clarify: obj.clarify || 'When should I remind you?' };
  var due = toDate_(obj.due_at);
  if (!due) return { ok: false, error: 'bad_due', clarify: 'I could not read that date. Try "tomorrow 3pm".' };
  if (due.getTime() < now.getTime() - 5 * MINUTE) {
    return { ok: false, error: 'past_due', clarify: 'That time is already in the past. When should I remind you?' };
  }
  if (due.getTime() > now.getTime() + 730 * 24 * HOUR) return { ok: false, error: 'too_far', clarify: 'Please pick a date within 2 years.' };
  var before = Math.min(10080, Math.max(0, toInt_(obj.remind_before_min, 0)));
  var assignee = obj.assignee ? String(obj.assignee).trim() : '';
  if (assignee && teamNames && teamNames.length) {
    var match = findName(assignee, teamNames);
    if (!match) return { ok: false, error: 'unknown_assignee', clarify: 'I do not know "' + assignee + '". Team: ' + teamNames.join(', ') };
    assignee = match;
  }
  return {
    ok: true,
    task: {
      task: task,
      due_at: due,
      remind_before_min: before,
      repeat: normalizeRepeat(obj.repeat),
      priority: normalizePriority(obj.priority),
      assignee: assignee
    }
  };
}

/** Case/diacritic-insensitive name match: "linh" matches "Linh Tran". */
function findName(name, names) {
  var key = foldText(name);
  for (var i = 0; i < names.length; i++) if (foldText(names[i]) === key) return names[i];
  for (var j = 0; j < names.length; j++) if (foldText(names[j]).split(' ')[0] === key) return names[j];
  return null;
}

function foldText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

/** "/done 12" → { cmd: 'done', arg: '12' }. Strips "@BotName". */
function parseCommand(text) {
  var m = String(text || '').trim().match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), arg: (m[2] || '').trim() };
}

/**
 * Manual fallback when AI is off or fails: "Task | 2026-11-21 15:00 | 30 | weekly"
 * (time zone offset is added by the caller via `offset`, e.g. "+07:00").
 */
function parseManual(text, offset) {
  var parts = String(text || '').split('|').map(function (s) { return s.trim(); });
  if (parts.length < 2 || !parts[0]) return null;
  var m = parts[1].match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var iso = m[1] + '-' + m[2] + '-' + m[3] + 'T' + ('0' + m[4]).slice(-2) + ':' + m[5] + ':00' + (offset || 'Z');
  return {
    is_task: true,
    task: parts[0],
    due_at: iso,
    remind_before_min: toInt_(parts[2], 0),
    repeat: parts[3] || 'none',
    priority: 'normal',
    assignee: null
  };
}

function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Tasks for the digest: overdue, due today, next 3 days. */
function groupForDigest(tasks, now) {
  var startTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4);
  var out = { overdue: [], today: [], soon: [] };
  tasks.forEach(function (t) {
    if (t.status !== STATUS.OPEN) return;
    var due = toDate_(t.due_at);
    if (!due) return;
    if (due.getTime() < now.getTime()) out.overdue.push(t);
    else if (due.getTime() < startTomorrow.getTime()) out.today.push(t);
    else if (due.getTime() < horizon.getTime()) out.soon.push(t);
  });
  var byDue = function (a, b) { return toDate_(a.due_at) - toDate_(b.due_at); };
  out.overdue.sort(byDue); out.today.sort(byDue); out.soon.sort(byDue);
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = {
    REPEATS: REPEATS, STATUS: STATUS, firstRemindAt: firstRemindAt, nextOccurrence: nextOccurrence,
    reminderKind: reminderKind, planAfterSend: planAfterSend, planDone: planDone, planSnooze: planSnooze,
    validateParsed: validateParsed, findName: findName, parseCommand: parseCommand, parseManual: parseManual,
    escapeHtml: escapeHtml, groupForDigest: groupForDigest
  };
}
