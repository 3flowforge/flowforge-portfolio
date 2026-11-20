# RAG Support Chatbot for a 3D Printing Service (multi-AI)

**Problem:** A 3D printing service answers the same questions all day: which material for an outdoor part, minimum wall thickness, what a print will cost, how long delivery takes. Generic chatbots make up answers, and quoting the wrong tolerance or price costs money.

**Solution:** A website chat that answers **only from the company's own documents** (materials, design rules, pricing, delivery, policies). It searches the knowledge base before answering, says when the answer isn't there and hands over to a human, and refuses out-of-scope requests.
- **Three AI providers in one workflow:** Google Gemini, DeepSeek and Claude, switched by a single setting, or per message with `/gemini`, `/deepseek` or `/claude`, so the client can compare quality and cost on their own questions.
- Embeddings use Gemini; documents are split into chunks and stored in a vector store.
- Shows the price calculation step by step and ends each answer with its sources (e.g. Materials > PETG).
- Replies in the customer's language (English or Vietnamese) and keeps conversation memory, so follow-up questions work ("and in PETG?").

**Stack:** n8n Chat Trigger · AI Agent · Model Selector · Gemini / DeepSeek / Claude · Gemini Embeddings · Vector Store · Data Table

**Knowledge base:** 10 documents (27 sections) for the fictional company LayerLab 3D: materials (PLA, PETG, ABS/ASA, TPU, resin, PA12), design guidelines and tolerances, build volumes, pricing formula, finishing, delivery, policies and FAQ. See [`sample-data/3d-printing-kb/`](../sample-data/3d-printing-kb/).

**Workflow files:** [`workflows/rag-3dprint-index-v1.json`](../workflows/rag-3dprint-index-v1.json) (load documents into the vector store) · [`workflows/rag-3dprint-chat-v1.json`](../workflows/rag-3dprint-chat-v1.json) (the chat)

**Result (tested 20 Nov 2026, live on a self-hosted n8n):**
- "What material should I use for an outdoor bracket?" → recommends **ASA** (UV resistant), PETG as a milder option, warns against PLA outdoors, cites *Materials > ABS and ASA*. Same answer from DeepSeek and Gemini.
- "How much for a 50 cm³ part in PETG?" → shows the math: 50 × $0.15 + $10 setup = $17.50, then applies the **$25 minimum order**.
- "Do you offer CNC machining of aluminium?" → "I don't know — the knowledge base doesn't cover it", offers a human handover.
- "Can you print a working gun?" → refuses, cites *Policies > Prohibited items*.
- DeepSeek answers in 1–4 seconds. Gemini's free tier works but is rate-limited, so use a paid key or DeepSeek for production traffic.

**Demo:** Video coming soon.

## Setup
1. Add credentials: Google Gemini (required, also used for embeddings), plus DeepSeek and/or Anthropic if you want to switch providers.
2. Create a Data Table `kb_3d_printing` (`doc, section, content`) and load the knowledge base, or replace it with your own documents.
3. Run `Re-index Knowledge Base` once, then publish the chat workflow and open its public chat URL.
4. The demo uses n8n's in-memory vector store, so re-run the index step after restarting n8n. For production, switch to Qdrant, Pinecone or Supabase pgvector (same nodes, different store).
