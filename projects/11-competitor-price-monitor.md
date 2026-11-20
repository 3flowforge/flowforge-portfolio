# Competitor Price Monitor

**Problem:** E-commerce owners check competitor sites by hand, and still miss price drops that cost them sales.

**Solution:** Every morning n8n reads the competitor's product page, extracts each product's price and stock, compares it with yesterday, saves the new prices, and sends one Telegram message listing only what changed. No change, no message.

**Stack:** n8n HTTP Request · Code (HTML parsing) · n8n Data Table · Schedule · Telegram

**Result:** Working demo against [books.toscrape.com](https://books.toscrape.com) (a site built for scraping practice):
- Run 1 saved a baseline for 11 products and sent nothing
- With two prices changed, run 2 sent exactly one alert:

```
COMPETITOR PRICE WATCH
2 change(s) across 11 tracked products - 1 price drop(s), consider matching:
- It's Only the Himalayas: £50.17 -> £45.17 (-10%)
- Full Moon over Noah's Ark: £46.43 -> £49.43 (+6.5%)
```
- Run 3 found no changes and stayed quiet

**Workflow file:** [`workflows/competitor-price-monitor-v1.json`](../workflows/competitor-price-monitor-v1.json)

**Demo:** Video coming soon.

## Notes for real clients
- Only monitor public pages, respect the site's terms and robots.txt, and keep requests to once or twice a day.
- Each competitor site needs its own parsing rules; many stores also expose a product JSON feed that is easier and more stable.
- Add-ons: Google Sheets price history, a weekly chart, or automatic price matching through the Shopify API.
