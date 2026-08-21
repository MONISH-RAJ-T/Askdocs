import httpx
from app.config import settings

class EmbeddingClient:
    def __init__(self):
        self.base_url = settings.hf_embedding_url.rstrip("/")
        print(f"DEBUG: EmbeddingClient initialized with base_url: '{self.base_url}'")
        # Verify header shared secret
        self.headers = {
            "X-HF-API-Key": settings.hf_api_secret_key,
            "Content-Type": "application/json"
        }
        # Configure a generous 60-second read timeout for Hugging Face cold starts
        self.timeout = httpx.Timeout(60.0, connect=10.0)


    def get_query_embedding(self, query: str) -> list[float]:
        """
        Calls Hugging Face /embed endpoint to generate a vector embedding
        for the user's question query.
        """
        url = f"{self.base_url}/embed"
        payload = {
            "texts": [query],
            "is_query": True
        }
        
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, json=payload, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                # Returns the first embedding in the response list
                return data["embeddings"][0]
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Hugging Face embedding service returned error status {e.response.status_code}: {e.response.text}")
        except Exception as e:
            raise RuntimeError(f"Failed to communicate with Hugging Face embedding service: {str(e)}")

    def trigger_document_processing(self, document_id: str, user_id: str, storage_path: str) -> None:
        """
        Triggers background document parsing and embedding on Hugging Face Spaces.
        Fire-and-forget, returns immediately.
        """
        url = f"{self.base_url}/process"
        payload = {
            "document_id": document_id,
            "user_id": user_id,
            "storage_path": storage_path,
            "groq_api_key": settings.groq_api_key
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, json=payload, headers=self.headers)
                # HF /process should return 202 immediately
                response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Failed to trigger PDF background processing on Hugging Face: {e.response.status_code}")
        except Exception as e:
            raise RuntimeError(f"Failed to contact Hugging Face background worker: {str(e)}")
