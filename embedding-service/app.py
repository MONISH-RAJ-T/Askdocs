import sys
import os
import time
import spaces
import gradio as gr

# Ensure the embedding-service root is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from fastapi import BackgroundTasks, Depends, Request, HTTPException, status
from app.services.embedder import get_embedder
from app.main import process_document_task, verify_api_key, EmbedRequest, EmbedResponse, ProcessRequest

# --- Eagerly load the embedding model at import time ---
print("Pre-loading embedding model...")
get_embedder()
print("Embedding model loaded and ready.")

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
    btn = gr.Button("ZeroGPU Keep-Alive", visible=False)
    out = gr.Textbox(visible=False)
    btn.click(fn=dummy_gpu_keepalive, inputs=[], outputs=[out])

# --- Define our API route handler functions (standalone, no decorator) ---

def health_check():
    return {"status": "healthy"}

def embed_endpoint(payload: EmbedRequest, request: Request):
    """Exposes embedding generation. Supports batching queries and passages."""
    # Manual API key check since we're using add_api_route
    api_key = request.headers.get("X-HF-API-Key", "")
    expected = os.environ.get("HF_API_SECRET_KEY", "")
    if api_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid API key.")
    
    embedder = get_embedder()
    if payload.is_query:
        embeddings = embedder.embed_queries(payload.texts)
    else:
        embeddings = embedder.embed_passages(payload.texts)
    return EmbedResponse(embeddings=embeddings)

def process_endpoint(payload: ProcessRequest, background_tasks: BackgroundTasks, request: Request):
    """Fire-and-forget endpoint that queues PDF processing in a background task."""
    # Manual API key check
    api_key = request.headers.get("X-HF-API-Key", "")
    expected = os.environ.get("HF_API_SECRET_KEY", "")
    if api_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid API key.")

    background_tasks.add_task(
        process_document_task,
        document_id=payload.document_id,
        user_id=payload.user_id,
        storage_path=payload.storage_path,
        groq_api_key=payload.groq_api_key
    )
    return {"message": "Document queued for processing."}


if __name__ == "__main__":
    # Launch Gradio non-blocking so demo.app is the real post-launch FastAPI app
    demo.launch(server_name="0.0.0.0", server_port=7860, prevent_thread_lock=True)

    # NOW register routes on the real serving app (post-launch demo.app)
    # Gradio recreates demo.app during launch(), so routes must be added AFTER launch()
    demo.app.add_api_route("/health", health_check, methods=["GET"])
    demo.app.add_api_route("/embed", embed_endpoint, methods=["POST"], response_model=EmbedResponse)
    demo.app.add_api_route("/process", process_endpoint, methods=["POST"], status_code=202)

    print("Custom API routes registered on post-launch app:")
    for route in demo.app.routes:
        if hasattr(route, 'path') and route.path in ["/health", "/embed", "/process"]:
            print(f"  ✓ {route.methods} {route.path}")

    # Keep the main thread alive so the background server keeps running
    while True:
        time.sleep(10)
