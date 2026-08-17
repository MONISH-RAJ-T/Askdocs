import os
import traceback
from supabase import create_client, Client

def get_supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables in the environment.")
    return create_client(url, key)

def save_batch_chunks(
    document_id: str,
    user_id: str,
    chunks_data: list[dict],
    embeddings: list[list[float]],
    chunk_index_offset: int
) -> bool:
    """
    Saves a batch of extracted document chunks and their generated vector embeddings to Supabase.
    """
    supabase = get_supabase_client()
    try:
        records = []
        for i, (chunk_item, embedding) in enumerate(zip(chunks_data, embeddings)):
            records.append({
                "document_id": document_id,
                "user_id": user_id,
                "content": chunk_item["content"],
                "chunk_index": chunk_index_offset + i,
                "embedding": embedding,
                "metadata": chunk_item["metadata"]
            })

        batch_size = 50
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            supabase.table("document_chunks").insert(batch).execute()

        print(f"Batch successfully inserted {len(records)} chunks starting at index {chunk_index_offset}")
        return True

    except Exception as e:
        err_msg = f"Database batch insertion failed: {str(e)}"
        print(f"Error during chunk database insertion for document {document_id}: {err_msg}")
        traceback.print_exc()
        try:
            supabase.table("documents").update({
                "status": "failed",
                "error_message": err_msg
            }).eq("id", document_id).execute()
        except Exception as db_err:
            pass
        return False

def finalize_document_status(document_id: str, total_pages: int, total_chunks: int):
    """
    Updates the document status to 'ready' after all batches are completed.
    """
    supabase = get_supabase_client()
    supabase.table("documents").update({
        "status": "ready",
        "page_count": total_pages,
        "chunk_count": total_chunks,
        "error_message": None
    }).eq("id", document_id).execute()
    print(f"Document {document_id} marked as ready. Total pages: {total_pages}, Total chunks: {total_chunks}")
