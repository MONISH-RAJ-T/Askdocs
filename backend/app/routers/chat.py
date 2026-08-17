from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest, ConversationCreate, ConversationResponse, MessageResponse
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.db_service import DatabaseService
from app.services.embedding_client import EmbeddingClient
from app.services.llm_service import LLMService
from app.services.rate_limiter import chat_limiter
import json

router = APIRouter(prefix="/api/chat", tags=["chat"])
db_service = DatabaseService()
embedding_client = EmbeddingClient()
llm_service = LLMService()

@router.post("/conversations", response_model=ConversationResponse)
def create_conversation(payload: ConversationCreate, user: User = Depends(get_current_user)):
    """
    Creates a new chat conversation session.
    """
    try:
        return db_service.create_conversation(user.id, payload.document_id, payload.title)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create conversation: {str(e)}"
        )

@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(document_id: str, user: User = Depends(get_current_user)):
    """
    Lists previous conversations for the given document.
    """
    return db_service.get_conversations(user.id, document_id)

@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, user: User = Depends(get_current_user)):
    """
    Deletes a conversation and its messages.
    """
    try:
        db_service.delete_conversation(conversation_id, user.id)
        return {"status": "success", "message": "Conversation deleted"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete conversation: {str(e)}"
        )

@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
def get_messages(conversation_id: str, user: User = Depends(get_current_user)):
    """
    Fetches message history for a conversation.
    """
    try:
        return db_service.get_messages(conversation_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load messages: {str(e)}"
        )

@router.post("/ask")
def ask_document(request: Request, payload: ChatRequest, user: User = Depends(get_current_user)):
    """
    HTTP POST streaming endpoint.
    Retrieves matching chunks, formats source metadata citations,
    streams LLM answers, and saves messages to the database history.
    """
    chat_limiter.check(request)
    try:
        # Verify document status
        doc_status = db_service.get_document_status(payload.document_id, user.id)
        if doc_status != "ready":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Document is not ready for chat. Status: '{doc_status}'."
            )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    try:
        # Save user message to database if in a conversation session
        if payload.conversation_id:
            try:
                db_service.create_message(payload.conversation_id, "user", payload.question)
            except Exception as msg_err:
                print(f"[CHAT WARNING] Failed to save user query: {str(msg_err)}")

        # 1. Fetch query vector embedding from Hugging Face Space
        query_vector = embedding_client.get_query_embedding(payload.question)

        # 2. Query matching chunks using cosine similarity
        # Limit is 20 to get broader coverage for aggregate questions (e.g. "list all common questions")
        matched_chunks = db_service.search_similar_chunks(
            query_embedding=query_vector,
            user_id=user.id,
            document_id=payload.document_id,
            threshold=0.10,
            limit=20
        )

        # Identify unique pages that matched, maintaining top matches priority
        unique_pages = []
        for chunk in matched_chunks:
            meta = chunk.get("metadata") or {}
            page_num = meta.get("page")
            if page_num is not None and page_num not in unique_pages:
                unique_pages.append(page_num)
                
        # Limit to top 10 unique pages to give Gemini broad document coverage, and sort chronologically
        unique_pages = sorted(unique_pages[:10])

        # 3. Retrieve all chunks for these unique pages to reconstruct full parent pages
        context_texts = []
        for page_num in unique_pages:
            try:
                page_chunks = db_service.get_chunks_for_page(payload.document_id, page_num)
                if page_chunks:
                    # Reconstruct the page text in order of chunk_index
                    page_text = "\n".join([c["content"] for c in page_chunks])
                    
                    # Extract source and section metadata
                    meta = page_chunks[0].get("metadata") or {}
                    source_name = meta.get("source", "Document")
                    page_section = meta.get("section")
                    
                    # Prepend section metadata if available
                    section_tag = f"[Section: {page_section}]\n" if page_section else ""
                    
                    context_texts.append(
                        f"[Source: {source_name}, Page {page_num}]:\n{section_tag}{page_text}"
                    )
            except Exception as page_err:
                print(f"[CHAT WARNING] Failed to reconstruct page {page_num}: {str(page_err)}")

        # 4. Format chat history structures
        history_list = [{"role": msg.role, "content": msg.content} for msg in payload.history]

        # 5. Stream response and capture complete tokens in interceptor to save to DB
        def event_generator():
            full_response_text = ""
            for item in llm_service.generate_streaming_response(
                context_chunks=context_texts,
                question=payload.question,
                history=history_list
            ):
                if item.startswith("data: "):
                    payload_str = item[6:].strip()
                    if payload_str != "[DONE]":
                        try:
                            data_json = json.loads(payload_str)
                            if "token" in data_json:
                                full_response_text += data_json["token"]
                        except Exception:
                            pass
                yield item

            # Interceptor complete: save assistant output to database
            if payload.conversation_id and full_response_text.strip():
                try:
                    db_service.create_message(payload.conversation_id, "assistant", full_response_text)
                except Exception as msg_err:
                    print(f"[CHAT WARNING] Failed to save assistant answer: {str(msg_err)}")

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing similarity search or chat compilation: {str(e)}"
        )
