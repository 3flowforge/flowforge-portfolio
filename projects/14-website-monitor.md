# Multi-Site Monitor: Uptime, SSL, Domain and Hosting Expiry

**Problem:** Agencies and freelancers look after dozens of client websites. They find out a site is down when the client calls, and an SSL certificate, domain or hosting plan expires because the renewal email went to someone who left.

**Solution:** One table lists every site (client, URL, optional keyword, hosting provider, hosting renewal date). Two n8n workflows watch them:
- **Uptime check (every 5 minutes):** HTTP status, response time and an optional "page must contain this text" check. It alerts once when a site goes down (after 2 failed checks in a row, to avoid false alarms), stays quiet while it is still down, and sends a "RECOVERED after N min" message when it comes back.
- **Daily expiry report (8 AM):** SSL certificate expiry (read from the TLS handshake), domain expiry (looked up via RDAP, no paid API) and hosting renewal dates. Each item is flagged OK, warning (≤ 30 days) or critical (≤ 7 days or expired), grouped by client.

**Stack:** n8n Schedule · Data Table · Code (HTTP, TLS, RDAP) · Telegram

**Result:** Working demo with 5 sites across 3 demo clients:
- Uptime run 1 alerted on 2 real failures (`expired.badssl.com`: "certificate has expired"; an endpoint returning HTTP 503). Run 2 sent no duplicate alerts. Pointing the URL back to a healthy page produced "RECOVERED after 1 min".
- The daily report listed domain expiry for every site with RDAP data, and flagged one hosting plan expiring in 12 days and one already 3 days past renewal.

**Workflow files:** [`workflows/site-monitor-uptime-v1.json`](../workflows/site-monitor-uptime-v1.json) · [`workflows/site-monitor-daily-v1.json`](../workflows/site-monitor-daily-v1.json)

**Demo:** Video coming soon.

## Setup
1. Create a Data Table `monitored_sites` with the columns: `name, client, url, keyword, hosting_provider, hosting_expires, active, status, fail_count, down_since, last_status_code, response_ms, last_error, last_checked, ssl_expires, ssl_days_left, ssl_issuer, domain_expires, domain_days_left, hosting_days_left`.
2. Import both workflows, then pick that table in each Data Table node and your Telegram credential in the Telegram nodes.
3. SSL checks need the Node.js `tls` module in Code nodes. Self-hosted n8n: add `NODE_FUNCTION_ALLOW_BUILTIN=tls` to the container environment and restart.
4. Publish both workflows.

## Adapting it for a client
- Change the warning thresholds (30 / 7 days) at the top of `Check Expiry`.
- Send alerts to Slack, email or a client-specific Telegram group per site.
- Add a weekly PDF uptime report for the client.
