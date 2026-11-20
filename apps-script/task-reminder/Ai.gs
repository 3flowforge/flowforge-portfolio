/**
 * Ai.gs: the AI only UNDERSTANDS the message and returns JSON.
 * Code (validateParsed in Lib.gs) decides what is saved: dates in the past, unknown people
 * or broken JSON are rejected and the bot asks again.
 */

var TASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_task', 'task', 'due_at', 'remind_before_min', 'repeat', 'priority', 'assignee', 'clarify'],
  properties: {
    is_task: { type: 'boolean' },
    task: { type: 'string' },
    due_at: { type: ['string', 'null'] },
    remind_before_min: { type: 'integer' },
    repeat: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly'] },
    priority: { type: 'string', enum: ['high', 'normal', 'low'] },
    assignee: { type: ['string', 'null'] },
    clarify: { type: ['string', 'null'] }
  }
};

function buildTaskPrompt_(text, ctx) {
  var system = [
    'You turn a chat message into a reminder for a task bot. Reply with JSON only, matching this schema:',
    JSON.stringify(TASK_SCHEMA),
    'Rules:',
    '- "task": short imperative, same language as the user, max 120 characters. Remove the time words.',
    '- "due_at": ISO 8601 with the offset ' + ctx.offset + ' (example 2026-11-21T15:00:00' + ctx.offset + ').',
    '  Resolve relative dates ("tomorrow", "next Friday", "thứ 6 tuần sau", "chiều mai") from NOW.',
    '  If only a day is given, use 09:00. "morning"=09:00, "noon"=12:00, "afternoon"=14:00, "evening"=19:00.',
    '  If no time or date at all, set due_at null and ask in "clarify".',
    '- "remind_before_min": minutes before due_at for the first reminder. Use what the user says',
    '  ("1 hour before" = 60). Otherwise ' + ctx.defaultBefore + '.',
    '- "repeat": daily, weekdays, weekly, monthly or none.',
    '- "priority": high only if the user says urgent/important/ASAP/gấp; low if "whenever"/"no rush".',
    '- "assignee": a team member name if the message assigns the task to someone else',
    '  ("remind Linh to...", "nhắc Minh..."), else null. Team: ' + (ctx.team.join(', ') || 'none') + '.',
    '- "is_task": false for greetings, questions or anything that is not a reminder. Put a short reply in "clarify".',
    '- "clarify": a short question in the user\'s language when something is missing, else null.',
    'Never invent a date the user did not imply.'
  ].join('\n');
  var user = 'NOW: ' + ctx.nowText + '\nTIME ZONE: ' + ctx.tz + '\nSENDER: ' + ctx.sender + '\nMESSAGE: ' + text;
  return { system: system, user: user };
}

/** Returns the parsed object (not yet validated). Throws on API failure. */
function aiParseTask(text, ctx) {
  var p = buildTaskPrompt_(text, ctx);
  var raw = aiComplete_(p.system, p.user, TASK_SCHEMA, 2048);
  return parseJsonLoose_(raw);
}

/** Short summary for the daily digest. Returns '' when AI is off or fails. */
function aiDigestSummary(member, groups) {
  var cfg = getConfig();
  if (!cfg.AI_DIGEST || cfg.AI_PROVIDER === 'none') return '';
  var list = function (arr) { return arr.map(function (t) { return '- [' + t.priority + '] ' + t.task + ' (due ' + fmtDate(t.due_at) + ')'; }).join('\n') || '- none'; };
  var system = 'You write a 2-sentence morning brief for a busy person. Plain text, no greeting, no lists. ' +
    'Say what to do first and why (overdue and high priority first). Same language as the task titles.';
  var user = 'Name: ' + member.name + '\nOVERDUE:\n' + list(groups.overdue) + '\nTODAY:\n' + list(groups.today) + '\nNEXT 3 DAYS:\n' + list(groups.soon);
  try {
    return String(aiComplete_(system, user, null, 1024) || '').trim().slice(0, 600);
  } catch (e) {
    logEvent('WARN', 'ai_digest_failed', String(e));
    return '';
  }
}

function aiComplete_(system, user, schema, maxTokens) {
  var cfg = getConfig();
  if (cfg.AI_PROVIDER === 'claude') return callClaude_(system, user, schema, maxTokens);
  if (cfg.AI_PROVIDER === 'gemini') return callGemini_(system, user, schema, maxTokens);
  throw new Error('AI_PROVIDER is "none"');
}

/** Google Gemini REST (generateContent). Free tier is enough for a small team. */
function callGemini_(system, user, schema, maxTokens) {
  var cfg = getConfig();
  var key = getSecret('GEMINI_API_KEY', true);
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cfg.GEMINI_MODEL) + ':generateContent';
  var body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    // Keep this high: reasoning tokens count toward the limit and can cut the JSON in half.
    generationConfig: { maxOutputTokens: Math.max(maxTokens, 2048) }
  };
  if (schema) body.generationConfig.responseMimeType = 'application/json';
  var res = fetchWithRetry(url, {
    method: 'post', contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(body)
  });
  if (res.code !== 200 || !res.json) throw new Error('Gemini ' + res.code + ': ' + String(res.text).slice(0, 300));
  var cand = res.json.candidates && res.json.candidates[0];
  var parts = cand && cand.content && cand.content.parts;
  if (!parts) throw new Error('Gemini: empty response (' + (cand && cand.finishReason) + ')');
  return parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('');
}

/** Anthropic Messages API over raw HTTP (Apps Script has no official SDK). */
function callClaude_(system, user, schema, maxTokens) {
  var cfg = getConfig();
  var key = getSecret('ANTHROPIC_API_KEY', true);
  var model = String(cfg.CLAUDE_MODEL);
  var body = {
    model: model,
    max_tokens: Math.max(maxTokens, 4096),
    system: system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'low' }   // simple extraction: low effort is enough and cheaper
  };
  if (schema) body.output_config.format = { type: 'json_schema', schema: schema };
  var headers = { 'x-api-key': key, 'anthropic-version': '2026-10-21' };
  if (/opus|sonnet|fable/.test(model)) {
    // Server-side fallback if the model declines a request (not available for Haiku).
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  var res = fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', headers: headers, payload: JSON.stringify(body)
  });
  if (res.code !== 200 || !res.json) throw new Error('Claude ' + res.code + ': ' + String(res.text).slice(0, 300));
  if (res.json.stop_reason === 'refusal') throw new Error('Claude declined the request');
  if (res.json.stop_reason === 'max_tokens') throw new Error('Claude output was cut off (max_tokens)');
  return (res.json.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
}

/** Accepts raw JSON or JSON wrapped in ```json fences. */
function parseJsonLoose_(text) {
  var s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch (e) {
    var m = s.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* fall through */ } }
  }
  return null;
}
