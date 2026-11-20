# Workflow Error Alerts and Error Log

**Problem:** Automations fail silently. A token expires or an API goes down, and nobody notices until a customer complains days later.

**Solution:** One shared error workflow is attached to every client workflow. The moment any step fails, the team gets a Telegram alert with the workflow name, the failing step, the error and a link to the run. Every failure is also logged to a table for the monthly maintenance report.

**Stack:** n8n Error Trigger · Code · Telegram (or Slack/email) · n8n Data Table

**Result:** Working demo. A simulated "Shopify API returned 503" failure produced this alert within seconds and one row in the error log:

```
WORKFLOW FAILED
portfolio-error-demo
Step: Fetch Shopify Orders
Error: Shopify API returned 503 Service Unavailable while fetching new orders
Time: 15 Nov 2026, 17:37
```

**Workflow files:** [`workflows/error-alerts-v1.json`](../workflows/error-alerts-v1.json) · [`workflows/error-demo.json`](../workflows/error-demo.json)

**Demo:** Video coming soon.

## Setup
1. Create a Data Table `error_log` with string columns `workflow`, `node`, `message`, `execution_url`, `happened_at`.
2. Import `error-alerts-v1.json`, add the Telegram credential and Chat ID, select the table, then **Publish** it (on n8n 2.x the error workflow must be published).
3. In every other workflow: Settings → Error workflow → `portfolio-error-alerts-v1`.
