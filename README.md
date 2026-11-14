# FlowForge AI — Automation Portfolio

**Workflows that run while you sleep.**

I'm Hoa Phan, an AI automation engineer based in Vietnam (GMT+7). I build **n8n + Claude** workflows that save small businesses and e-commerce stores hours of repetitive work every week.

## Projects

| Project | What it does | Stack |
| --- | --- | --- |
| [AI Email Support for Shopify](projects/01-shopify-ai-email.md) | Reads support emails, looks up the order, drafts a reply in your tone | n8n · Gmail · Shopify · Claude |
| [Invoice PDF → Google Sheets](projects/02-invoice-pdf-extractor.md) | Extracts supplier, lines, tax and totals from PDFs and flags mismatches | n8n · Google Drive · Claude · Sheets |
| [Daily Ads + Sales Report](projects/03-ads-daily-report.md) | Morning ROAS/CPA summary with one recommendation, sent to Telegram | n8n · Meta API · Shopify · Claude |
| [RAG Chatbot on Company Docs](projects/04-rag-chatbot.md) | Answers only from your documents, cites sources, admits when it doesn't know | n8n AI Agent · Claude · vector store |
| [AI Lead Qualification](projects/05-lead-qualification.md) | Scores form leads, alerts on hot ones, sends a personalised first email | n8n · Claude · Sheets/HubSpot · Slack |

## Try it

[`workflows/invoice-extractor-starter.json`](workflows/invoice-extractor-starter.json) — import into n8n, add a Header Auth credential (`x-api-key` = your Anthropic API key), run. It extracts a sample invoice into JSON and checks that line items add up to the total.

Sample (fictional) data for every project is in [`sample-data/`](sample-data/).

## How I work

- Clear scope and fixed price before starting
- Error handling, retries and alerts in every workflow
- Handover with a 2-minute video and a one-page guide
- Your credentials stay in your accounts — never in workflow files

## Hire me

Find me on Upwork (link coming soon) or email **3flowforge@gmail.com**.
