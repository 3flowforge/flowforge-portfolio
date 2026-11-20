# AI Task Reminder Bot: Google Sheets + Telegram

**Problem:** Small teams track tasks in a spreadsheet, but nobody opens the spreadsheet. Deadlines slip, and the owner ends up chasing people in chat.

**Solution:** The Google Sheet stays the single source of truth, and a bot brings it to people where they already are.
- **Type it like you say it.** "Remind Linh to call the supplier tomorrow morning, urgent" or "Nhắc tôi nộp báo cáo thuế 17h ngày 25". AI turns the message into a row (task, due time, assignee, priority, repeat). **Code checks the result** before saving: dates in the past, unknown people or broken JSON are rejected and the bot asks again.
- **Reminders that escalate.** "Coming up" before the deadline, "Due now" on time, then up to 3 "Overdue" nudges. Each one has **✅ Done · ⏰ +1h · 📅 Tomorrow** buttons that update the sheet.
- **Repeating tasks** (daily, weekdays, weekly, monthly) move to the next date when marked done.
- **Morning digest** per person: overdue, today, next 3 days, plus a 2-line AI brief on what to do first.
- **Many channels:** Telegram (two-way), Slack, Discord, Google Chat and email (one-way). Each team member picks a channel in the sheet.
- Tasks typed straight into the sheet are picked up too. No AI key? A simple `Task | 2026-11-21 15:00 | 30` format still works.

**Stack:** Google Apps Script · Google Sheets · Telegram Bot API · Gemini or Claude · Slack/Discord/Google Chat webhooks · Gmail

**Cost to run:** $0 for a small team. It uses a free Google account and the Gemini free tier, with no server or n8n needed.

**Code:** [`apps-script/task-reminder/`](../apps-script/task-reminder/) (6 files, copy into the Apps Script editor) · sample data in [`sample-data/task-reminder/`](../sample-data/task-reminder/)

**Result (tested 20 Nov 2026, against a mocked Sheets/Telegram/AI environment, 28 checks):**
```
You:  Remind Linh to call the supplier about the late order tomorrow morning, urgent
Bot:  📌 Saved
      🔴 #1 Call the supplier about the late order · Sat 21 Nov, 09:00
      First reminder: Sat 21 Nov, 08:30 · Assigned to Linh Tran     [↩️ Undo]
Linh: 📥 New task from Hoa Phan …
08:30 Linh: ⏰ Coming up …   09:00 🔔 Due now …   [✅ Done] [⏰ +1h] [📅 Tomorrow]
```
- "do the old thing yesterday": the AI's date is in the past, so code refuses it and the bot asks for a new time.
- The same Telegram update delivered twice creates one task, not two.
- ✅ Done on a weekly task moves it to next week instead of closing it.
- A teammate cannot close someone else's task; admins can.

**Demo:** Video coming soon.

## How it works
```
Telegram message ──► doPost (Web app) ──► AI parses → JSON ──► code validates ──► new row in Tasks
                                                                                      │
Time trigger, every 5 min ──► runReminders: rows where next_remind_at ≤ now ──► notify() on the member's channel
                                                              │                           (Telegram / Slack / Discord / Chat / email)
                                                              └─► next_remind_at, remind_count updated
Time trigger, daily ──► sendDailyDigest (+ AI brief)
Errors ──► Log sheet + Telegram alert to admins (max once per 30 min)
```

## Setup (about 15 minutes)
1. Create a Google Sheet → **Extensions → Apps Script**. Add the 6 files from `apps-script/task-reminder/` (`Lib`, `Config`, `Channels`, `Ai`, `Main`, `Bot`). In Project Settings, tick "Show appsscript.json" and paste the manifest. Set `timeZone` to your time zone.
2. Create a bot with **@BotFather** and copy the token.
3. **Project Settings → Script properties:** `TELEGRAM_TOKEN`, `WEBHOOK_SECRET` (any long random string), and `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`.
4. Reload the sheet → **Reminder Bot → 1. Set up sheets**. Check `TIMEZONE` and `AI_PROVIDER` in the Config sheet.
5. **Deploy → New deployment → Web app** (Execute as: Me, Access: Anyone) → **Reminder Bot → 3. Connect Telegram**.
6. Message the bot `/myid`, put the number in the Team sheet (`channel = telegram`, `is_admin = TRUE`).
7. **Reminder Bot → 2. Install triggers.** Done: type a task to the bot.

If Telegram can't deliver to the Web app URL, set `BOT_MODE = polling` in Config, run `deleteTelegramWebhook`, then install the triggers again. The bot then checks for messages every minute.

## Adapting it for a client
- **Channels:** set `channel` per person. For Slack, Discord or Google Chat, put the webhook URL in Script Properties (e.g. `SLACK_WEBHOOK_SALES`) and write only its name in `channel_target`, so no secrets are kept in the sheet.
- Add WhatsApp, Zalo or Microsoft Teams as another case in `notify()`.
- Pull tasks from a CRM, Google Calendar or a form instead of chat.
- Rules per client: quiet hours, a manager copied on overdue tasks, weekly team report.

