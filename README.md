# AskDocs 📚

AskDocs is a high-throughput, secure **PDF RAG Chatbot** built on a scalable **3-service split architecture**. It allows users to upload digital or scanned PDF documents, automatically chunks and vectorizes their content, and hosts real-time streaming chat sessions using Groq as the primary LLM (optimized to preserve rate limits) and Gemini as a seamless fallback.

---

## 🌟 Key Features

* **3-Service Split Architecture:** Designed to optimize resources and bypass size/timeout limitations entirely on free tier hosting (Next.js client on Vercel, FastAPI backend on Render, local Embedder model on Hugging Face Spaces).
* **Dual-LLM Intelligent Orchestration:** 
  * Uses **Groq (Llama 3.1 8B)** as the primary model for real-time SSE streaming.
  * Context size is optimized to **5,000 characters per page** (safely fitting full pages/resumes under the 6,000 TPM limit).
  * Automatically detects token limits/rate limits and falls back seamlessly to **Gemini (2.5 Flash)** to protect your daily Gemini API quota.
* **Hybrid OCR Extraction:** Downloads PDFs from storage, extracts digital text instantly with PyMuPDF, and falls back to **Groq Vision (Llama 3.2)** for scanned pages, tables, or diagrams.
* **Semantic Vector Search:** Integrates **Supabase pgvector** using Cosine similarity matching (`bge-base-en-v1.5` embeddings) restricted strictly to document scope and user IDs to prevent data leakages.
* **Glassmorphic UI Workspace:** Premium Next.js dashboard featuring:
  * Direct S3/Supabase upload (bypasses server body size limits).
  * Real-time document processing status tracking (`pending` -> `processing` -> `ready` -> `failed`) with premium custom toast notifications.
  * Error-tolerant **Mermaid diagram compiler** for rendering visual flowcharts directly from chat responses.
  * Sleek customized toast prompts and premium confirmation modals (replaces native browser alerts).

---

## 📁 Repository Structure

```text
d:\projects\RAG\
├── backend/                       # FastAPI Core API Backend Service
│   ├── app/
│   │   ├── routers/               # Auth, Chat, Folder, and Document routers
│   │   ├── services/              # JWT validator, DB operations, LLM Orchestration
│   │   ├── config.py              # Environment configuration loader
│   │   └── main.py                # App entrypoint & CORS setup
│   └── requirements.txt
│
├── embedding-service/             # Local sentence-transformers & OCR Service
│   ├── app/
│   │   ├── services/              # Chunker, Embedder, and OCR Extractor
│   │   └── main.py                # Embedding endpoints (/embed, /process)
│   └── requirements.txt
│
└── frontend/                      # Next.js App Router UI
    ├── app/                       # Dashboard page, login, signup routes
    ├── components/                # Glassmorphic views (Documents, Chat, Folders, Custom Modals)
    └── package.json
```

---

## ⚙️ Database Schema & SQL Configuration

Run the following scripts in your **Supabase SQL Editor** to enable `pgvector` and prepare tables:

```sql
-- 1. Enable Vector Extension
create extension if not exists vector;

-- 2. Create Documents Metadata Table
create table public.documents (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    file_size integer not null,
    storage_path text not null,
    status text not null default 'pending', -- pending | processing | ready | failed
    created_at timestamptz default now() not null
);

-- 3. Create Document Chunks and Embeddings Table
create table public.document_chunks (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    content text not null,
    chunk_index integer not null,
    metadata jsonb,
    embedding vector(768) not null -- 768 dimensions for BAAI/bge-base-en-v1.5
);

-- 4. Create HNSW Cosine Similarity Index
create index on public.document_chunks using hnsw (embedding vector_cosine_ops);
create index on public.document_chunks (user_id);
create index on public.documents (user_id);

-- 5. Create Document-Scoped Vector Similarity Search Function
create or replace function match_document_chunks (
  query_embedding vector(768), match_threshold float,
  match_count int, filter_user_id uuid, filter_document_id uuid
)
returns table (id uuid, content text, metadata jsonb, similarity float)
language plpgsql as $$
begin
  return query
  select dc.id, dc.content, dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.user_id = filter_user_id
    and dc.document_id = filter_document_id
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding limit match_count;
end; $$;
```

---

## 🔑 Environment Variables Setup

Create a `.env` file in each respective service directory:

### A. Backend (`backend/.env`)
```env
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>
SUPABASE_JWT_SECRET=<your-jwt-secret>
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIzaSy...
HF_EMBEDDING_URL=http://localhost:7860
HF_API_SECRET_KEY=rag_shared_secret_api_key_header_7860
```

### B. Embedding Service (`embedding-service/.env`)
```env
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>
HF_API_SECRET_KEY=rag_shared_secret_api_key_header_7860
GEMINI_API_KEY=AIzaSy...
```

### C. Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

---

## 🚀 How to Run Locally

Follow these steps in separate terminal screens:

### Step 1: Start the Embedding Service
```powershell
cd embedding-service
.\venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 7860
```

### Step 2: Start the FastAPI Backend
```powershell
cd backend
.\venv\Scripts\activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Step 3: Start the Next.js Frontend
```powershell
cd frontend
npm run dev
```

Open **`http://localhost:3000`** in your browser to start using AskDocs!
