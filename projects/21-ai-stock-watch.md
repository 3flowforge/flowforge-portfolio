# Daily AI Stock Watch: Anthropic (ANT) + AI Stocks to Telegram

**Problem:** Anyone following the AI trade checks five apps every morning: a price app, a news site, X, a broker. The facts are scattered and the "why did it move?" part takes the longest.

**Solution:** Every weekday morning, one Telegram message has everything:
- **Anthropic (ANT)** in detail: last close, day change, change since the $83 IPO price, 52-week range, volume vs. average.
- **AI watchlist** sorted best to worst (Nvidia, Microsoft, Meta, AMD, Broadcom, TSMC, Palantir, plus Amazon and Alphabet as major Anthropic investors). Moves of 5% or more are flagged.
- **News from the last 24 hours**, in two groups: Anthropic, and the AI sector. Duplicates across outlets are removed, and headlines already sent in the last 3 days are skipped.
- **AI brief** (Gemini): the main story in one line, why Anthropic moved, the mood in AI stocks, and up to 3 things to watch. It is told to use only the prices and headlines it is given and to **never give buy/sell advice**. The AI returns JSON in a fixed schema, and the message is still sent without it if the AI step fails.

**Stack:** n8n Schedule · HTTP Request (Yahoo Finance chart API, Google News RSS) · Code · Basic LLM Chain + Structured Output Parser · Gemini · Telegram

**Workflow file:** [`workflows/ai-stock-watch-v1.json`](../workflows/ai-stock-watch-v1.json) (13 nodes)

**Result (tested 20 Nov 2026 on real market data, Code nodes run outside n8n):**
```
📈 AI Stock Watch · US close 2026-11-20
🔴 Anthropic (ANT) $87.25  -10.21%
since IPO +5.12% (IPO $83.00, trading day 2) · range $85.63–$115.10 · vol 173.7M
AI stocks (close · day · 5 days)
🟢 GOOGL $278.28 · +2.06% · -5.91% 🤝
🔴 NVDA  $136.58 · -6.44% · -16.13% ⚠️
🔴 AMD   $446.23 · -8.78% · -16.45% ⚠️  …
📰 Anthropic news
• "This is a painful tech sell-off": Anthropic shares slump (Axios)
• Anthropic stock is down during its second day of trading … (NBC News)  …
```
- A new listing with only 2 trading days works: the 5-day change shows "n/a" instead of a wrong number, and day 1 is compared with the IPO price.
- If one ticker fails, the others are still sent and the message says which one is missing.
- The whole report fits in one Telegram message. If it gets too long, it is split cleanly.

**Demo:** Video coming soon.

## Setup
1. Import `ai-stock-watch-v1.json` into n8n.
2. Add a **Google Gemini** credential (free tier is enough: 1 call per day) and a **Telegram** credential. Put your chat id in `Send to Telegram`.
3. Click **Execute workflow** to test, then **Publish**. It runs Tuesday–Saturday at 7:00 AM (GMT+7), right after the US market closes.

## Adapting it for a client
- Edit the tickers in the `Watchlist` node (any Yahoo symbol: stocks, ETFs, crypto such as `BTC-USD`, Vietnamese stocks such as `FPT.VN`).
- Edit the topics in `News Queries`.
- Send to Slack, Discord or email instead of Telegram, or send a second short alert when a ticker moves more than X%.
- Swap Gemini for Claude or DeepSeek (same chain, different model node).
- **For commercial use, change data sources:** the Yahoo chart endpoint is unofficial, and Google News RSS is licensed for personal use only. Use a licensed API instead: Finnhub, Polygon/Massive, Alpha Vantage or Marketaux.

