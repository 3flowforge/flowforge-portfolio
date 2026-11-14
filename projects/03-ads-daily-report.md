# Daily Meta Ads + Shopify Sales Report

**Problem:** A store owner opens Ads Manager and Shopify every morning to work out yesterday's ROAS.

**Solution:** Every day at 8 AM, n8n pulls yesterday's spend by campaign and orders from Shopify, computes ROAS and CPA, and Claude writes a 5-line summary with one recommendation. Sent to Telegram or Slack.

**Stack:** n8n · Meta Marketing API · Shopify Admin API · Claude API · Telegram

**Result:** Working demo on sample data — turns 7 days of campaign rows into a 6-line report with ROAS/CPA vs the recent average and one budget recommendation, in under a second. Replaces a ~30-minute manual morning check.

**Workflow file:** [`workflows/ads-daily-report-v1.json`](../workflows/ads-daily-report-v1.json)

**Sample output:**
```
Daily Ads Report - 2026-11-13
Spend $60.20 | Revenue $398.00 | Orders 7 | ROAS 6.61

By campaign:
- Retargeting 30d: spend $18.30, ROAS 11.58 (+1% vs 6-day avg), CPA $4.58
- Cat Tree - Broad: spend $41.90, ROAS 4.44 (+25% vs 6-day avg), CPA $13.97

Recommendation: Scale "Cat Tree - Broad" by 15-20%: ROAS is up 25% vs the recent average.
```

**Demo:** Video coming soon.


