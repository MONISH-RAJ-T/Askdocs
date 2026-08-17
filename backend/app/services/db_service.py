from supabase import create_client, Client
from app.config import settings

class DatabaseService:
    def __init__(self):
        # Service client for admin/database operations
        self.client: Client = create_client(settings.supabase_url, settings.supabase_service_key)

    def create_document_record(self, user_id: str, name: str, file_size: int, storage_path: str) -> dict:
        """
        Creates a new document record with status = 'pending' in Supabase.
        """
        data = {
            "user_id": user_id,
            "name": name,
            "file_size": file_size,
            "storage_path": storage_path,
            "status": "pending"
        }
        response = self.client.table("documents").insert(data).execute()
        if not response.data:
            raise RuntimeError("Database error: failed to create document record.")
        return response.data[0]

    def get_document_status(self, document_id: str, user_id: str) -> str:
        """
        Retrieves the processing status of a specific document.
        """
        response = self.client.table("documents").select("status").eq("id", document_id).eq("user_id", user_id).execute()
        if not response.data:
            raise ValueError("Document not found or access denied.")
        return response.data[0]["status"]

    def get_user_documents(self, user_id: str) -> list[dict]:
        """
        Lists all documents uploaded by a specific user.
        """
        response = self.client.table("documents").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return response.data or []

    def update_document_status(self, document_id: str, status: str) -> None:
        """
        Updates the processing status of a document.
        """
        self.client.table("documents").update({"status": status}).eq("id", document_id).execute()

    def search_similar_chunks(
        self,
        query_embedding: list[float],
        user_id: str,
        document_id: str,
        threshold: float = 0.35,  # Tuned threshold to prevent low-relevance results
        limit: int = 5
    ) -> list[dict]:
        """
        Performs vector similarity search on document chunks using Supabase RPC.
        Filters by user_id and document_id.
        """
        params = {
            "query_embedding": query_embedding,
            "match_threshold": threshold,
            "match_count": limit,
            "filter_user_id": user_id,
            "filter_document_id": document_id
        }
        
        response = self.client.rpc("match_document_chunks", params).execute()
        return response.data or []

    def get_chunks_for_page(self, document_id: str, page_number: int) -> list[dict]:
        """
        Retrieves all chunks for a specific page of a document, ordered by chunk_index.
        """
        response = self.client.table("document_chunks")\
            .select("content, chunk_index, metadata")\
            .eq("document_id", document_id)\
            .eq("metadata->page", page_number)\
            .order("chunk_index", desc=False)\
            .execute()
        return response.data or []

    def get_document_details(self, document_id: str, user_id: str) -> dict:
        """
        Retrieves complete metadata details of a specific document.
        """
        response = self.client.table("documents").select("*").eq("id", document_id).eq("user_id", user_id).execute()
        if not response.data:
            raise ValueError("Document not found or access denied.")
        return response.data[0]

    def rename_document(self, document_id: str, user_id: str, new_name: str) -> dict:
        """
        Renames a document.
        """
        response = self.client.table("documents").update({"name": new_name}).eq("id", document_id).eq("user_id", user_id).execute()
        if not response.data:
            raise ValueError("Document not found or access denied.")
        return response.data[0]

    def assign_folder_to_document(self, document_id: str, user_id: str, folder_id: str | None) -> dict:
        """
        Assigns or removes a document from a folder.
        """
        response = self.client.table("documents").update({"folder_id": folder_id}).eq("id", document_id).eq("user_id", user_id).execute()
        if not response.data:
            raise ValueError("Document not found or access denied.")
        return response.data[0]

    def delete_document(self, document_id: str, user_id: str) -> dict:
        """
        Deletes a document record. Cascading deletes will remove associated chunks in database.
        Returns the deleted document object to retrieve the storage path.
        """
        response = self.client.table("documents").delete().eq("id", document_id).eq("user_id", user_id).execute()
        if not response.data:
            raise ValueError("Document not found or access denied.")
        return response.data[0]

    def create_conversation(self, user_id: str, document_id: str, title: str) -> dict:
        """
        Creates a new chat conversation session.
        """
        data = {
            "user_id": user_id,
            "document_id": document_id,
            "title": title
        }
        response = self.client.table("conversations").insert(data).execute()
        if not response.data:
            raise RuntimeError("Database error: failed to create conversation.")
        return response.data[0]

    def get_conversations(self, user_id: str, document_id: str) -> list[dict]:
        """
        Lists all conversations for a specific document and user.
        """
        response = self.client.table("conversations").select("*").eq("user_id", user_id).eq("document_id", document_id).order("created_at", desc=True).execute()
        return response.data or []

    def delete_conversation(self, conversation_id: str, user_id: str) -> None:
        """
        Deletes a conversation and its messages. Validates ownership via user_id.
        """
        response = self.client.table("conversations").delete().eq("id", conversation_id).eq("user_id", user_id).execute()
        if not response.data:
            raise ValueError("Conversation not found or access denied.")

    def get_messages(self, conversation_id: str, user_id: str) -> list[dict]:
        """
        Retrieves all messages in a conversation. Validates ownership via user_id.
        """
        # Validate conversation ownership first
        owner_check = self.client.table("conversations").select("id").eq("id", conversation_id).eq("user_id", user_id).execute()
        if not owner_check.data:
            raise ValueError("Conversation not found or access denied.")

        response = self.client.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=False).execute()
        return response.data or []

    def create_message(self, conversation_id: str, role: str, content: str) -> dict:
        """
        Appends a message to a conversation.
        """
        data = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content
        }
        response = self.client.table("messages").insert(data).execute()
        if not response.data:
            raise RuntimeError("Database error: failed to insert message.")
        return response.data[0]
