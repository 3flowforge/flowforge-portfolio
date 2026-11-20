# AI Booking Bot That Understands Natural Language

**Problem:** Button-based booking bots feel robotic, and pure AI booking bots are risky: an LLM can confirm a slot that is already taken or invent opening hours.

**Solution:** Patients type the way they talk: "Can I get a cleaning next Tuesday afternoon?", "something after 3 on Friday", "the second one", "actually make it Thursday". The design splits the work:
- **The AI only understands** the message: an Information Extractor turns it into structured fields (intent, service, date, time of day, exact time, chosen option, name, phone).
- **Code decides** availability: it merges the fields with the conversation state, checks real free slots in the appointments table, offers up to 4 options, then collects name → phone → confirmation. Because the slot choice is deterministic, the bot **cannot double-book or invent hours**.
- Saves the appointment and alerts the clinic on Telegram. It uses the same appointments table as the 24-hour reminder workflow.
- **Gemini, DeepSeek or Claude** can be used for understanding. Pick the default in one place, or switch per message with `/gemini`, `/deepseek` or `/claude`.

**Stack:** n8n Chat Trigger · Information Extractor · Model Selector · Gemini / DeepSeek / Claude · Code (luxon) · Data Tables · Telegram

**Demo business:** Smile Dental Clinic (fictional): check-up & cleaning, whitening, emergency visits. Mon–Fri, 9 AM–5 PM Central Time.

**Workflow file:** [`workflows/booking-bot-ai-v1.json`](../workflows/booking-bot-ai-v1.json)

**Result (tested 20 Nov 2026, live on a self-hosted n8n):**
```
Patient: Can I get a cleaning next Tuesday afternoon?
Bot:     1. Tue 24 Nov, 1:00 PM  2. Tue 24 Nov, 2:00 PM  3. 3:00 PM  4. 4:00 PM
Patient: the second one          → Bot: Tue 24 Nov, 2:00 PM is free. May I have your full name?
Patient: Test Patient            → Bot: What's the best phone number for your reminder?
Patient: 555-010-0199            → Bot: Please confirm … +15550100199. Shall I book it?
Patient: yes                     → Bot: You're booked! … (Telegram alert sent to the clinic)
```
- Asking for the same slot again ("cleaning next Tuesday at 2pm") → "That exact time is not available" with the nearest free times: **no double booking**.
- "actually make it Thursday morning, whitening" → switches service and day in one sentence.
- Each reply takes 1–2 seconds with DeepSeek.

**Demo:** Video coming soon.

## Setup
1. Use the `appointments` and `booking_sessions` tables from the [booking bot project](07-appointment-booking-bot.md).
2. Add at least one AI credential (Gemini has a free tier) and your Telegram credential.
3. Publish and open the public chat URL.

## Adapting it for a client
- Edit `CLINIC` (name, time zone, hours) and `SERVICES` (duration, price) at the top of `Booking Logic`.
- Sync with Google Calendar or Cal.com instead of a table.
- Add WhatsApp or Messenger as the chat channel.
