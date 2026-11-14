# Invoice PDF → Google Sheets with AI Validation

**Problem:** An accountant types data from 100+ supplier invoices into a spreadsheet every month.

**Solution:** Drop PDFs into a Google Drive folder; n8n sends each file to Claude, which returns structured JSON (supplier, date, line items, tax, total). A check flags invoices where line items don't add up.

**Stack:** n8n · Google Drive · Claude API (PDF input) · Google Sheets · Slack alerts

**Result:** In progress — results and numbers will be added after testing.

**Demo:** Video coming soon.


