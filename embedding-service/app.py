import sys
import os
import uvicorn
import gradio as gr

# Ensure the parent directory is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.main import app as fastapi_app

# Define a simple Gradio UI so Hugging Face Space shows a helpful dashboard
with gr.Blocks(title="AskDocs Embedding Service") as demo:
    gr.Markdown(
        """
        # 📚 AskDocs Embedding & OCR Service
        
        This Hugging Face Space hosts the SentenceTransformers embedding generation API and the PyMuPDF/Groq Vision OCR pipeline for AskDocs.
        
        ### 🔌 API Endpoints:
        * **`/health`** (GET) - Check if the service is online.
        * **`/embed`** (POST) - Generate embeddings for text passages/queries.
        * **`/process`** (POST) - Queue PDF documents for chunking and embedding.
        
        *This service is secured with `X-HF-API-Key` headers.*
        """
    )

# Mount the Gradio UI onto the FastAPI app at root "/"
# This serves the Gradio dashboard on the main page while keeping FastAPI endpoints functional
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    # Hugging Face Spaces exposes port 7860 to route traffic
    uvicorn.run(app, host="0.0.0.0", port=7860)
