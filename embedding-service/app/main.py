import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Header, HTTPException, BackgroundTasks, status, Depends
from pydantic import BaseModel
from contextlib import asynccontextmanager

from app.services.embedder import get_embedder
from app.services.extractor import extract_text_from_pdf_bytes
from app.services.chunker import RecursiveCharacterTextSplitter
from app.db_writer import get_supabase_client, save_batch_chunks, finalize_document_status

API_SECRET_KEY = os.environ.get("HF_API_SECRET_KEY")

def verify_api_key(x_hf_api_key: str = Header(None)):
    """
    Dependency to secure endpoints using a shared API secret key.
    If HF_API_SECRET_KEY is defined in the environment, requests must provide it.
    """
    if API_SECRET_KEY and x_hf_api_key != API_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authorization header X-HF-API-Key."
        )

def process_document_task(document_id: str, user_id: str, storage_path: str, groq_api_key: str | None = None):
    """
    Async background task that downloads the PDF, extracts text in dynamic batches,
    chunks it with overlap, embeds it, and writes the vectors to Supabase iteratively.
    """
    supabase = get_supabase_client()
    try:
        print(f"Starting background processing for document {document_id} (Path: {storage_path})")
        
        # Update status to processing
        supabase.table("documents").update({"status": "processing", "error_message": None}).eq("id", document_id).execute()

        # Download PDF bytes directly from Supabase Storage
        file_data = supabase.storage.from_("pdf-uploads").download(storage_path)
        if not file_data:
            raise ValueError(f"Could not retrieve PDF data from storage for path: {storage_path}")

        # The extractor now yields batches of pages dynamically based on char limit
        page_generator = extract_text_from_pdf_bytes(file_data, groq_api_key=groq_api_key, document_id=document_id)
        
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        doc_name = os.path.basename(storage_path)
        embedder = get_embedder()
        
        total_pages = 0
        total_chunks = 0
        carryover_text = ""
        
        for batch_index, batch_pages in enumerate(page_generator):
            if not batch_pages:
                continue
                
            print(f"--- Processing Batch {batch_index + 1} ---")
            chunks_data = []
            
            for page in batch_pages:
                page_num = page["page_number"]
                page_section = page.get("section")  # May be None if no boundary detected
                total_pages += 1
                
                # Prepend carryover text from previous page/batch to ensure zero context loss
                raw_text = page["text"].strip()
                if not raw_text:
                    continue
                
                # If a section label exists, prepend it into the chunk text so the 
                # embedding model can distinguish between exams/chapters during search
                if page_section:
                    raw_text = f"[Section: {page_section}]\n{raw_text}"
                    
                page_text = carryover_text + "\n" + raw_text if carryover_text else raw_text
                
                page_chunks = splitter.split_text(page_text)
                
                # Take the last 250 characters as carryover for the next page to overlap seamlessly
                if len(page_text) > 250:
                    carryover_text = page_text[-250:]
                else:
                    carryover_text = ""
                
                for chunk in page_chunks:
                    chunks_data.append({
                        "content": chunk,
                        "metadata": {
                            "page": page_num,
                            "source": doc_name,
                            "section": page_section  # Store for future filtered search
                        }
                    })

            if not chunks_data:
                continue

            print(f"Generated {len(chunks_data)} text chunks for Batch {batch_index + 1}. Running embedding generation...")

            # Generate embeddings for this batch
            chunk_texts = [c["content"] for c in chunks_data]
            embeddings = embedder.embed_passages(chunk_texts)

            # Save batch to DB
            success = save_batch_chunks(document_id, user_id, chunks_data, embeddings, chunk_index_offset=total_chunks)
            if not success:
                raise RuntimeError(f"Failed to save batch {batch_index + 1} to database.")
                
            total_chunks += len(chunks_data)
            
        if total_chunks == 0:
            raise ValueError("Document processing resulted in zero text chunks.")
            
        # Finalize the document status
        finalize_document_status(document_id, total_pages, total_chunks)

    except Exception as e:
        err_msg = str(e)
        print(f"Critical error during background processing of document {document_id}: {err_msg}")
        try:
            # Mark document processing as failed and store the error message
            supabase.table("documents").update({
                "status": "failed",
                "error_message": err_msg
            }).eq("id", document_id).execute()
        except Exception as update_err:
            print(f"Failed to update document status to failed: {str(update_err)}")

# Pydantic schemas
class EmbedRequest(BaseModel):
    texts: list[str]
    is_query: bool = False

class EmbedResponse(BaseModel):
    embeddings: list[list[float]]

class ProcessRequest(BaseModel):
    document_id: str
    user_id: str
    storage_path: str
    groq_api_key: str | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Eagerly load the model on startup so it is cached in RAM
    get_embedder()
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/embed", response_model=EmbedResponse, dependencies=[Depends(verify_api_key)])
def embed_endpoint(payload: EmbedRequest):
    """
    Exposes embedding generation. Supports batching queries and passages.
    """
    embedder = get_embedder()
    if payload.is_query:
        embeddings = embedder.embed_queries(payload.texts)
    else:
        embeddings = embedder.embed_passages(payload.texts)
    return EmbedResponse(embeddings=embeddings)

@app.post("/process", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(verify_api_key)])
def process_endpoint(payload: ProcessRequest, background_tasks: BackgroundTasks):
    """
    Fire-and-forget endpoint that queues PDF processing in a background task
    and returns 202 Accepted immediately.
    """
    background_tasks.add_task(
        process_document_task,
        document_id=payload.document_id,
        user_id=payload.user_id,
        storage_path=payload.storage_path,
        groq_api_key=payload.groq_api_key
    )
    return {"message": "Document queued for processing."}
