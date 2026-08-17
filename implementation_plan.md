# Implementation Plan: 3-Service PDF RAG Chatbot

This document details the complete architecture and implementation steps for the Digital PDF RAG Chatbot using a clean **3-service split architecture** designed for 100+ concurrent applicants.

---

## 1. Three Services Overview

```
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│     FRONTEND         │   │      BACKEND          │   │  EMBEDDING SERVICE   │
│  Next.js on Vercel   │   │  FastAPI on Render    │   │ FastAPI on HF Spaces │
│  (Free Tier)         │   │  (Free Tier)          │   │  (Free Tier)         │
│                      │   │                       │   │                      │
│ - Login / Signup UI  │   │ - Auth (JWT verify)   │   │ - Loads bge-base     │
│ - PDF Upload UI      │   │ - Presigned URL gen   │   │   model in memory    │
│ - Chat interface     │   │ - Fire-and-forget HF  │   │ - POST /embed        │
│ - Mermaid rendering  │   │ - Groq LLM streaming  │   │ - POST /process      │
│ - Status polling     │   │ - Supabase DB ops     │   │ - Downloads PDF from │
└──────────────────────┘   └──────────────────────┘   │   Supabase Storage   │
                                                       └──────────────────────┘
```

### Hosting at a Glance

| Service | Tech | Host | Cost | RAM |
|:---|:---|:---|:---|:---|
| **Frontend** | Next.js | Vercel | Free | N/A (CDN) |
| **Backend** | FastAPI | Render | Free | ~80MB (no model) |
| **Embedding** | FastAPI | Hugging Face Spaces | Free | ~600MB of 16GB |
| **Database** | Supabase | Supabase | Free | Managed |
| **Storage** | Supabase Storage | Supabase | Free | 1GB |
| **LLM** | Groq API | Groq Cloud | Free tier | N/A |

---

## 2. System Goals & Scope
- **Target Audience:** Up to 100+ concurrent applicants.
- **Input Constraints:** Digital PDFs only, maximum 10 MB per file.
- **Core User Flow:**
  1. **Auth:** Signup/Login via Supabase Auth (managed by Backend).
  2. **Upload:** Browser uploads PDF directly to Supabase Storage via presigned URL (bypasses Vercel + Render limits entirely). Backend triggers async processing.
  3. **Processing:** HF Spaces downloads the PDF, extracts text, chunks it, generates embeddings, and writes to Supabase DB.
  4. **Status:** Frontend polls backend status endpoint every 3 seconds.
  5. **Chat:** Backend orchestrates RAG pipeline and streams Groq answer tokens to the frontend in real-time.

---

## 3. Folder Structure (Monorepo)

```
d:\projects\RAG\
│
├── backend/                    # FastAPI Backend → Deploys to Render Free
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             # FastAPI entry, CORS, register routers
│   │   ├── config.py           # Settings: env vars (Supabase, Groq, HF URL)
│   │   ├── prompts.py          # All LLM prompt templates in one isolated file
│   │   │
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py         # POST /auth/signup, POST /auth/login
│   │   │   ├── documents.py    # POST /documents/presign, POST /documents/process,
│   │   │   │                   # GET  /documents/{id}/status, GET /documents
│   │   │   └── chat.py         # POST /chat/ask (SSE streaming response)
│   │   │
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py      # Supabase Auth API calls (signup/login)
│   │   │   ├── storage_service.py   # Supabase Storage presigned URL generation
│   │   │   ├── embedding_client.py  # httpx client → calls HF /embed and /process
│   │   │   ├── db_service.py        # Supabase DB: insert docs, update status, vector search
│   │   │   └── llm_service.py       # Groq streaming (reads prompts.py)
│   │   │
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py         # SignUpRequest, LoginRequest, TokenResponse
│   │   │   ├── documents.py    # PresignRequest, PresignResponse, DocumentResponse
│   │   │   └── chat.py         # ChatRequest, ChatMessage (multi-turn history)
│   │   │
│   │   └── models/
│   │       ├── __init__.py
│   │       ├── user.py         # User entity
│   │       └── document.py     # Document + Chunk entities
│   │
│   ├── requirements.txt        # fastapi, uvicorn, supabase, groq, httpx, pyjwt, pymupdf
│   └── .env.example
│
├── embedding-service/           # Python AI Microservice → Deploys to HF Spaces Free
│   ├── app/
│   │   ├── main.py              # FastAPI entry (POST /process, POST /embed)
│   │   ├── services/
│   │   │   ├── extractor.py     # PyMuPDF PDF text extraction
│   │   │   ├── chunker.py       # Recursive character text splitting
│   │   │   └── embedder.py      # Batch embedding (BAAI/bge-base-en-v1.5, 768 dims)
│   │   └── db_writer.py         # Supabase Python client (writes chunks + updates status)
│   │
│   ├── download_model.py        # Pre-downloads bge-base-en-v1.5 at build time
│   ├── requirements.txt         # fastapi, uvicorn, sentence-transformers, pymupdf, supabase
│   └── README.md                # HF Spaces metadata (sdk: docker, app_port: 7860)
│
└── frontend/                    # Next.js App → Deploys to Vercel Free
    ├── app/
    │   ├── (auth)/
    │   │   ├── login/
    │   │   │   └── page.tsx     # Login UI
    │   │   └── signup/
    │   │   │   └── page.tsx     # Signup UI
    │   ├── page.tsx             # Protected Dashboard (upload + chat)
    │   ├── layout.tsx
    │   └── globals.css
    │
    ├── components/
    │   ├── UploadZone.tsx       # Drag-and-drop upload → presign → direct PUT to Supabase Storage
    │   ├── DocumentList.tsx     # Sidebar showing files with status badges
    │   ├── ChatWindow.tsx       # Scrollable chat message list
    │   ├── ChatBubble.tsx       # Renders Markdown + Mermaid blocks
    │   └── Mermaid.tsx          # Client-side Mermaid SVG compiler
    │
    ├── lib/
    │   └── api.ts               # Typed fetch client for Backend API calls
    │
    ├── package.json
    └── tailwind.config.ts
```

---

## 4. Production-Safe Upload Flow (Resolving All Vercel Blockers)

```
Step 1: POST /documents/presign (Backend on Render)
        Body: { filename, filesize }
        → Validates PDF type and size (≤ 10MB)
        → Creates document record in DB with status = "pending"
        → Generates Supabase Storage Signed Upload URL (S3-compatible presign)
        → Returns: { signed_url, document_id }

Step 2: PUT signed_url (Browser → Supabase Storage DIRECTLY)
        → Bypasses both Vercel AND Render entirely
        → No file size limit, no timeout

Step 3: POST /documents/process (Backend on Render)
        Body: { document_id }
        → Updates status = "processing"
        → Calls HF Spaces POST /process (FIRE-AND-FORGET, does not await)
        → Returns 202 Accepted immediately (< 200ms)

Step 4: HF Spaces processes asynchronously (no user waiting)
        → Downloads PDF from Supabase Storage
        → Extracts text (PyMuPDF)
        → Chunks text (Recursive splitting: 1000 chars, 200 overlap)
        → Generates batch embeddings (bge-base-en-v1.5, 768 dims)
        → Inserts chunks + vectors into Supabase
        → Updates document status → "ready"

Step 5: Frontend Polling
        → GET /documents/{id}/status every 3 seconds
        → Shows spinner until status = "ready"
```

---

## 5. Chat Flow (SSR Streaming)

```
POST /chat/ask  (Backend on Render)
Body: { document_id, question, history: [...] }

Backend:
  1. Calls HF POST /embed({ text: question }) → gets 768d query vector
  2. Calls Supabase RPC match_document_chunks → gets top-5 context chunks
  3. Builds prompt using prompts.py template (injects context + history)
  4. Opens Groq streaming connection
  5. Streams Groq tokens back to browser via SSE (Server-Sent Events)

Frontend (ChatBubble.tsx):
  → Renders each token as it arrives (word-by-word typing effect)
  → Detects ```mermaid blocks and sends to Mermaid.tsx for SVG rendering
  → Detects markdown tables and renders styled HTML tables
```

---

## 6. Security & Operational Optimization for Production

To guarantee production stability under load and protect all microservices, we implement three key operational details:

1. **Hugging Face Cold Start Protection:**
   - Hugging Face Spaces can take 30–60 seconds to boot from sleep. 
   - We will configure the HTTP client in `embedding_client.py` on Render with a **60-second read timeout** (instead of the default 5–10s) using `httpx.Client(timeout=60.0)`. This prevents the Render backend from timing out while Hugging Face wakes up.
2. **API Endpoint Protection:**
   - Since Hugging Face Spaces are public, anyone could call your `/embed` or `/process` endpoint.
   - We will configure a shared API token key (`HF_API_SECRET_KEY`) set as an environment variable in both Render and Hugging Face. The Render backend will attach `X-HF-API-Key: <secret>` in headers, and Hugging Face will verify this header middleware to block unauthorized traffic.
3. **Local Token Verification:**
   - The Render backend will verify the user's Supabase authentication token locally on every API request. It uses the Supabase Project JWT Secret to decode and check the signature, completely avoiding database Round-Trip Time (RTT) for auth checks.

---

## 7. Database Schema (Supabase PostgreSQL + pgvector)

```sql
create extension if not exists vector;

create table public.documents (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    file_size integer not null,
    storage_path text not null,
    status text not null default 'pending', -- pending | processing | ready | failed
    error_message text,
    page_count integer,
    chunk_count integer,
    created_at timestamptz default now() not null
);

create table public.document_chunks (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    content text not null,
    chunk_index integer not null,
    metadata jsonb,
    embedding vector(768) not null
);

create index on public.document_chunks using hnsw (embedding vector_cosine_ops);
create index on public.document_chunks (user_id);
create index on public.documents (user_id);

create or replace function match_document_chunks (
  query_embedding vector(768), match_threshold float,
  match_count int, filter_user_id uuid
)
returns table (id uuid, content text, metadata jsonb, similarity float)
language plpgsql as $$
begin
  return query
  select dc.id, dc.content, dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.user_id = filter_user_id
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding limit match_count;
end; $$;
```

---

## 8. Production Risk Matrix (All Resolved)

| Risk | Status | Solution |
|:---|:---|:---|
| Vercel 4.5MB body limit | ✅ Resolved | Browser uploads directly to Supabase Storage |
| Render 10s timeout on upload | ✅ Resolved | Fire-and-forget 202 pattern |
| HF cold start blocking users | ✅ Resolved | Async processing — user never waits synchronously |
| Render cold start (15 min idle) | ⚠️ Managed | Only affects first chat request after idle. Groq streaming handles the rest |
| Supabase DB pauses (inactivity) | ⚠️ Managed | Schedule a weekly background ping or upgrade when going fully live |
| HF /process endpoint security | ✅ Resolved | Backend sends a shared secret header; HF validates it |

---

## 9. Implementation Phases

### Phase 1: Supabase Setup
- Enable `pgvector`, run all SQL table scripts.
- Create private Storage bucket `pdf-uploads`.
- Configure Supabase Auth (Email/Password).

### Phase 2: HF Embedding Service
- Build `embedding-service/` with `download_model.py`, `extractor.py`, `chunker.py`, `embedder.py`.
- Expose `POST /process` and `POST /embed` endpoints.
- Configure `README.md` for Docker SDK and deploy to HF Spaces.

### Phase 3: FastAPI Backend
- Build `backend/` with full router/service/schema/model structure.
- Implement `storage_service.py` for S3-compatible presigned URLs.
- Implement `llm_service.py` with Groq SSE streaming using `prompts.py`.
- Deploy to Render Free (no model = only ~80MB RAM).

### Phase 4: Next.js Frontend
- Initialize Next.js with App Router and TailwindCSS.
- Build Login, Signup, and protected Dashboard pages.
- Build `UploadZone.tsx` using presign → direct PUT → process → poll pattern.
- Build `ChatBubble.tsx` with Markdown + Mermaid rendering.

### Phase 5: Integration & Verification
- Test 10MB PDF upload end-to-end.
- Test streaming chat (word-by-word rendering).
- Test Mermaid diagram rendering from AI response.
- Test multi-user isolation (Account A cannot see Account B's documents).
