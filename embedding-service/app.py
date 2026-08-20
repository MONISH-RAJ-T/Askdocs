import sys
import os
import spaces
import gradio as gr

# Ensure the parent directory is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import everything we need from the existing FastAPI app modules
from dotenv import load_dotenv
load_dotenv()

from fastapi import Header, HTTPException, BackgroundTasks, status, Depends
from pydantic import BaseModel

from app.services.embedder import get_embedder
from app.services.extractor import extract_text_from_pdf_bytes
from app.services.chunker import RecursiveCharacterTextSplitter
from app.db_writer import get_supabase_client, save_batch_chunks, finalize_document_status
from app.main import process_document_task, verify_api_key, EmbedRequest, EmbedResponse, ProcessRequest

# --- ZeroGPU requirement: at least one @spaces.GPU function wired to a Gradio event ---
@spaces.GPU
def dummy_gpu_keepalive():
    """Dummy function to satisfy ZeroGPU startup detection."""
    return "GPU OK"

# --- Build the Gradio Blocks interface ---
with gr.Blocks(title="AskDocs Embedding Service") as demo:
    gr.Markdown(
        """
        # 📚 AskDocs Embedding & OCR Service
        
        This Hugging Face Space hosts the SentenceTransformers embedding generation API 
        and the PyMuPDF/Groq Vision OCR pipeline for AskDocs.
        
        ### 🔌 API Endpoints:
        * **`/health`** (GET) - Check if the service is online.
        * **`/embed`** (POST) - Generate embeddings for text passages/queries.
        * **`/process`** (POST) - Queue PDF documents for chunking and embedding.
        
        *This service is secured with `X-HF-API-Key` headers.*
        """
    )
    # Hidden button wired to the GPU function so ZeroGPU's static analyzer finds it
    btn = gr.Button("ZeroGPU Keep-Alive", visible=False)
    out = gr.Textbox(visible=False)
    btn.click(fn=dummy_gpu_keepalive, inputs=[], outputs=[out])

# --- Register custom FastAPI routes on Gradio's internal FastAPI app ---
# Gradio Blocks exposes the underlying FastAPI app via demo.app
# We add our REST API endpoints here so they coexist with the Gradio UI

@demo.app.get("/health")
def health_check():
    return {"status": "healthy"}

@demo.app.post("/embed", response_model=EmbedResponse)
def embed_endpoint(payload: EmbedRequest, _=Depends(verify_api_key)):
    """Exposes embedding generation. Supports batching queries and passages."""
    embedder = get_embedder()
    if payload.is_query:
        embeddings = embedder.embed_queries(payload.texts)
    else:
        embeddings = embedder.embed_passages(payload.texts)
    return EmbedResponse(embeddings=embeddings)

@demo.app.post("/process", status_code=status.HTTP_202_ACCEPTED)
def process_endpoint(payload: ProcessRequest, background_tasks: BackgroundTasks, _=Depends(verify_api_key)):
    """Fire-and-forget endpoint that queues PDF processing in a background task."""
    background_tasks.add_task(
        process_document_task,
        document_id=payload.document_id,
        user_id=payload.user_id,
        storage_path=payload.storage_path,
        groq_api_key=payload.groq_api_key
    )
    return {"message": "Document queued for processing."}

# --- Eagerly load the embedding model at import time ---
print("Pre-loading embedding model...")
get_embedder()
print("Embedding model loaded and ready.")

# --- Launch using Gradio's native launcher (required for ZeroGPU) ---
if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
