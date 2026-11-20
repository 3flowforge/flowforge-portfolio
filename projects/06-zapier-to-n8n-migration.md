# Zapier → n8n Migration: Lead Router

**Problem:** A service business pays for Zapier tasks on every form lead: log it, alert sales, add it to the CRM. As lead volume grows, the bill jumps to the next task tier — and duplicates and junk emails still get through.

**Solution:** The same flow rebuilt in self-hosted n8n, with two upgrades Zapier needs extra steps for: email validation and duplicate removal. Hot leads (budget ≥ $1,000 and an urgent timeline) trigger an instant alert; everyone else goes to a nurture list.

**Stack:** n8n (self-hosted) · Webhook (Typeform / Webflow / any form) · Telegram (or Slack / Gmail) · Google Sheets or Mailchimp for nurture

**Result:** Working demo. 6 messy test submissions → 1 duplicate and 1 invalid email removed → 2 hot-lead alerts delivered to Telegram, 2 leads routed to nurture. Unlimited runs for the cost of a small server.

**Workflow file:** [`workflows/zapier-migration-lead-router-v1.json`](../workflows/zapier-migration-lead-router-v1.json)

**Demo:** Video coming soon.

## Before and after

| Step | Zapier (before) | n8n (after) |
| --- | --- | --- |
| Trigger | New form entry | Webhook `POST /lead-intake` |
| Clean name, email, phone | 2–3 Formatter steps | 1 Code node (`Normalize`) |
| Reject bad emails, duplicates | Not built in (needs extra steps/storage) | 1 Code node (`Validate & Dedupe`) |
| Log every lead | Google Sheets — 1 task per lead | Google Sheets / Mailchimp — no per-run fee |
| Hot lead? | Filter | IF node |
| Alert sales | Slack/Gmail — 1 task | Telegram/Slack/Gmail — no per-run fee |
| Add to CRM | HubSpot — 1 task | HubSpot node — no per-run fee |

## Cost example (1,500 leads/month, 40% qualified)

| | Zapier Professional | n8n self-hosted |
| --- | --- | --- |
| Billable runs/month | 1,500 + 600 × 2 = **2,700 tasks** (Filters and Formatter are free) | Unlimited |
| Plan needed | 5,000-task tier — **$89/month** (annual billing) | Small VPS — **$10–30/month** |
| Per year | **~$1,068** | **~$120–360** |

Estimated saving: **~$700–950 per year (65–90%)**, before counting the fix for duplicates. A one-off migration usually pays for itself within the first few months.

Prices as published in 2026 — check the client's actual plan and current pricing before quoting. Sources: [Zapier pricing guide (Zapier blog, updated Jun 2026)](https://zapier.com/blog/zapier-pricing/), [Zapier pricing tiers and n8n self-host cost (Toolradar, updated Nov 2026)](https://toolradar.com/blog/zapier-pricing-2026).
