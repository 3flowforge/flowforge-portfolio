# Appointment Booking Bot + 24h Reminders (Dental Clinic)

**Problem:** A clinic's front desk spends hours on the phone booking visits, and no-shows leave expensive gaps in the schedule.

**Solution:** A chat assistant on the clinic website books appointments 24/7: the patient picks a service, chooses from real free time slots, leaves a name and phone, and confirms. The clinic is notified instantly. A second workflow checks every 15 minutes and sends a reminder 24 hours before each visit, marking it so nobody gets reminded twice.

**Stack:** n8n (Chat Trigger, Data Tables, Code, Schedule) · Telegram for clinic alerts · Google Calendar / Twilio SMS / WhatsApp as production add-ons

**Result:** Working demo, tested end to end on n8n:
- 2 patients booked through the chat, each in 7 messages
- The second patient was never offered the slot the first patient had just taken (no double booking)
- Clinic received a "NEW BOOKING" alert for each booking
- Reminder run picked only the visit due inside the window, sent it, and flagged it as reminded

**Workflow files:**
- [`workflows/booking-bot-chat-v1.json`](../workflows/booking-bot-chat-v1.json) — the chat assistant
- [`workflows/booking-reminders-v1.json`](../workflows/booking-reminders-v1.json) — the reminder job

**Demo:** Video coming soon.

## Sample conversation

```
Patient: hi
Bot:     Hi! I'm the booking assistant for Smile Dental Clinic. What would you like to book?
         1. Check-up & cleaning (45 min)
         2. Teeth whitening (60 min)
         3. Emergency visit (30 min)
Patient: 1
Bot:     Great, Check-up & cleaning. Next available times (Central Time):
         1. Mon 16 Nov, 9:00 AM   2. Mon 16 Nov, 1:00 PM
         3. Tue 17 Nov, 9:00 AM   4. Tue 17 Nov, 1:00 PM ...
Patient: 3
Bot:     Tue 17 Nov, 9:00 AM it is. What's your full name?
Patient: Jane Doe
Bot:     Thanks, Jane! What's the best phone number to reach you?
Patient: (512) 555-0188
Bot:     Please confirm: Check-up & cleaning, Tue 17 Nov 9:00 AM, Jane Doe, +15125550188. Reply YES to book.
Patient: yes
Bot:     You're booked! We'll send a reminder 24 hours before.
```

## How it works

| Workflow | Steps |
| --- | --- |
| Chat assistant | Chat message → load the patient's conversation state → load booked slots → decide the next reply → save state → if confirmed: save appointment + alert clinic → reply |
| Reminders | Every 15 min → load booked, not-yet-reminded visits → keep those starting within 24h → send reminder → mark as reminded |

## Setup on your own n8n

1. Create two Data Tables:
   - `booking_sessions`: `sessionId` (string), `state` (string)
   - `appointments`: `sessionId`, `patient_name`, `phone`, `service`, `start_iso`, `start_label`, `status` (all string), `reminded` (boolean)
2. Import both workflow files, then re-select the tables in every Data Table node.
3. Add a Telegram credential and Chat ID to the Telegram nodes.
4. Edit clinic name, time zone, opening hours and services at the top of the `Booking Assistant` code node.
5. Publish both workflows. The chat page URL appears in the Chat Trigger node.

## Production upgrades
- Write each booking to Google Calendar and read busy times from it
- Send the patient reminder by SMS (Twilio) or WhatsApp instead of the clinic chat
- Add cancel/reschedule, and a Claude step to understand free-text requests ("next Tuesday afternoon")
