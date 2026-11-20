/**
 * Config.gs: settings live in the "Config" sheet; secrets live in Script Properties.
 * Never put API keys, bot tokens or webhook URLs in the sheet or in this file.
 *
 * Script Properties (Project Settings → Script properties):
 *   TELEGRAM_TOKEN      Bot token from @BotFather
 *   WEBHOOK_SECRET      Any long random string (protects the web app URL)
 *   GEMINI_API_KEY      Optional, if AI_PROVIDER = gemini
 *   ANTHROPIC_API_KEY   Optional, if AI_PROVIDER = claude
 *   SLACK_WEBHOOK_xxx / DISCORD_WEBHOOK_xxx / GCHAT_WEBHOOK_xxx   Optional, named in Team.channel_target
 */

var DEFAULT_CONFIG = {
  TIMEZONE: 'Asia/Ho_Chi_Minh',     // must match appsscript.json "timeZone"
  BOT_MODE: 'webhook',               // webhook | polling
  AI_PROVIDER: 'gemini',             // gemini | claude | none
  GEMINI_MODEL: 'gemini-flash-latest',
  CLAUDE_MODEL: 'claude-opus-5-5',   // claude-haiku-5-5 is the low-cost option
  DIGEST_HOUR: 8,                    // daily digest, local hour (0-23)
  AI_DIGEST: 'TRUE',                 // let AI write a 2-line summary on top of the digest
  WORK_START_HOUR: 9,                // "Tomorrow" snooze goes to this hour
  DEFAULT_REMIND_BEFORE_MIN: 30,
  OVERDUE_REPEAT_HOURS: 2,
  MAX_OVERDUE_REMINDERS: 3
};

var SHEETS = { TASKS: 'Tasks', TEAM: 'Team', CONFIG: 'Config', LOG: 'Log' };

var _cfgCache = null;

function getConfig() {
  if (_cfgCache) return _cfgCache;
  var cfg = {};
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { cfg[k] = DEFAULT_CONFIG[k]; });
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.CONFIG);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var key = String(r[0]).trim();
      if (key && r[1] !== '') cfg[key] = r[1];
    });
  }
  cfg.DIGEST_HOUR = toInt_(cfg.DIGEST_HOUR, 8);
  cfg.WORK_START_HOUR = toInt_(cfg.WORK_START_HOUR, 9);
  cfg.DEFAULT_REMIND_BEFORE_MIN = toInt_(cfg.DEFAULT_REMIND_BEFORE_MIN, 30);
  cfg.OVERDUE_REPEAT_HOURS = Math.max(1, toInt_(cfg.OVERDUE_REPEAT_HOURS, 2));
  cfg.MAX_OVERDUE_REMINDERS = Math.max(0, toInt_(cfg.MAX_OVERDUE_REMINDERS, 3));
  cfg.AI_PROVIDER = String(cfg.AI_PROVIDER).toLowerCase();
  cfg.BOT_MODE = String(cfg.BOT_MODE).toLowerCase();
  cfg.AI_DIGEST = String(cfg.AI_DIGEST).toUpperCase() === 'TRUE';
  _cfgCache = cfg;
  return cfg;
}

function getSecret(name, required) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v && required) throw new Error('Missing Script Property: ' + name);
  return v;
}

/** "+07:00" for the configured time zone at the given moment. */
function tzOffset(date) {
  return Utilities.formatDate(date || new Date(), getConfig().TIMEZONE, 'XXX');
}

function fmtDate(d, pattern) {
  return Utilities.formatDate(toDate_(d), getConfig().TIMEZONE, pattern || 'EEE d MMM, HH:mm');
}
