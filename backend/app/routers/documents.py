from fastapi import APIRouter, Depends, HTTPException, status, Request
from app.schemas.documents import PresignRequest, PresignResponse, DocumentResponse, DocumentUpdate
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.storage_service import StorageService
from app.services.db_service import DatabaseService
from app.services.embedding_client import EmbeddingClient
from app.services.rate_limiter import upload_limiter

router = APIRouter(prefix="/api/documents", tags=["documents"])
storage_service = StorageService()
db_service = DatabaseService()
embedding_client = EmbeddingClient()

@router.post("/presign", response_model=PresignResponse)
def get_presigned_url(request: Request, payload: PresignRequest, user: User = Depends(get_current_user)):
    """
    Generates a signed upload URL for the PDF bucket in Supabase Storage,
    enabling direct browser uploads.
    """
    upload_limiter.check(request)
    
    # Force PDF validation
    if not payload.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only digital PDF files are supported."
        )

    # Size limit validation (10 MB = 10 * 1024 * 1024 bytes)
    if payload.filesize > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 10 MB limit."
        )

    # Generate presigned PUT upload parameters
    result = storage_service.generate_signed_upload_url(user.id, payload.filename)

    # Create document record in database under user profile
    doc_record = db_service.create_document_record(
        user_id=user.id,
        name=payload.filename,
        file_size=payload.filesize,
        storage_path=result["storage_path"]
    )

    return PresignResponse(
        signed_url=result["signed_url"],
        storage_path=result["storage_path"],
        document_id=doc_record["id"]
    )

@router.post("/process/{document_id}", status_code=status.HTTP_202_ACCEPTED)
def trigger_processing(document_id: str, user: User = Depends(get_current_user)):
    """
    Updates the document status to 'processing' and calls the Hugging Face Space
    background task to handle pdf parsing and embedding generation asynchronously.
    """
    try:
        # Check current status
        current_status = db_service.get_document_status(document_id, user.id)
        if current_status not in ["pending", "failed"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Document is already in '{current_status}' state."
            )

        # Retrieve the storage path for HF Spaces
        response = db_service.client.table("documents")\
            .select("storage_path")\
            .eq("id", document_id)\
            .eq("user_id", user.id)\
            .execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found."
            )

        storage_path = response.data[0]["storage_path"]

        # Mark as processing
        db_service.update_document_status(document_id, "processing")

        # Call Hugging Face API (non-blocking call)
        embedding_client.trigger_document_processing(
            document_id=document_id,
            user_id=user.id,
            storage_path=storage_path
        )
        return {"message": "Document processing triggered."}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        # Reset status if trigger failed
        print(f"CRITICAL ERROR in trigger_processing: {str(e)}")
        import traceback
        traceback.print_exc()
        db_service.update_document_status(document_id, "failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initiate background parsing: {str(e)}"
        )


@router.get("/{document_id}/status")
def get_status(document_id: str, user: User = Depends(get_current_user)):
    """
    Retrieves the document status and error metrics. Polled by Next.js frontend.
    """
    try:
        doc = db_service.get_document_details(document_id, user.id)
        return {
            "status": doc["status"],
            "error_message": doc.get("error_message"),
            "page_count": doc.get("page_count"),
            "chunk_count": doc.get("chunk_count")
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.patch("/{document_id}/rename", response_model=DocumentResponse)
def rename_document(document_id: str, new_name: str, user: User = Depends(get_current_user)):
    """
    Renames an uploaded document.
    """
    try:
        if not new_name.lower().endswith(".pdf"):
            new_name = f"{new_name}.pdf"
        return db_service.rename_document(document_id, user.id, new_name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.patch("/{document_id}/folder", response_model=DocumentResponse)
def assign_folder(document_id: str, folder_id: str | None = None, user: User = Depends(get_current_user)):
    """
    Assigns or removes a document from a folder.
    """
    try:
        return db_service.assign_folder_to_document(document_id, user.id, folder_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.patch("/{document_id}", response_model=DocumentResponse)
def update_document(document_id: str, payload: DocumentUpdate, user: User = Depends(get_current_user)):
    """
    Updates a document's metadata (e.g. folder_id).
    """
    try:
        # Verify ownership first
        doc = db_service.get_document_details(document_id, user.id)
        
        update_data = payload.model_dump(exclude_unset=True)
        if not update_data:
            return doc
            
        res = db_service.client.table("documents").update(update_data).eq("id", document_id).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update document")
            
        return res.data[0]
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update document: {str(e)}"
        )

@router.delete("/{document_id}")
def delete_document(document_id: str, user: User = Depends(get_current_user)):
    """
    Deletes a document from DB and cascade deletes from storage bucket.
    """
    try:
        # Delete from DB
        deleted_doc = db_service.delete_document(document_id, user.id)
        # Delete object from storage
        storage_service.client.storage.from_("pdf-uploads").remove([deleted_doc["storage_path"]])
        return {"message": "Document successfully deleted."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document files: {str(e)}"
        )

@router.get("/{document_id}/view")
def view_document(document_id: str, user: User = Depends(get_current_user)):
    """
    Generates a temporary presigned read url for displaying the PDF in the frontend.
    """
    try:
        doc = db_service.get_document_details(document_id, user.id)
        res = storage_service.client.storage.from_("pdf-uploads").create_signed_url(doc["storage_path"], 3600)
        # Handle dict or helper return values
        signed_url = None
        if isinstance(res, dict):
            signed_url = res.get("signedURL") or res.get("signed_url")
        else:
            signed_url = getattr(res, "signedURL", None) or getattr(res, "signed_url", None)
            
        if not signed_url:
            # Try parsing from raw string if direct return
            signed_url = str(res)
            
        return {"url": signed_url}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate document preview link: {str(e)}"
        )

@router.post("/{document_id}/retry", status_code=status.HTTP_202_ACCEPTED)
def retry_processing(document_id: str, user: User = Depends(get_current_user)):
    """
    Retries processing a failed document. Resets database chunks and updates status.
    """
    try:
        doc = db_service.get_document_details(document_id, user.id)
        # Update status and clear error
        db_service.update_document_status(document_id, "processing")
        db_service.client.table("documents").update({"error_message": None}).eq("id", document_id).execute()
        
        # Trigger background processing
        embedding_client.trigger_document_processing(
            document_id=document_id,
            user_id=user.id,
            storage_path=doc["storage_path"]
        )
        return {"message": "Document queued for reprocessing."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        db_service.update_document_status(document_id, "failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initiate document retry: {str(e)}"
        )

@router.get("", response_model=list[DocumentResponse])
def list_documents(user: User = Depends(get_current_user)):
    """
    Lists all documents uploaded by the authenticated user.
    """
    docs = db_service.get_user_documents(user.id)
    return docs
