import re
from supabase import create_client, Client
from app.config import settings

class StorageService:
    def __init__(self):
        # Initialized using service role credentials to allow admin storage functions
        self.client: Client = create_client(settings.supabase_url, settings.supabase_service_key)
        self.bucket_name = "pdf-uploads"

    def generate_signed_upload_url(self, user_id: str, filename: str) -> dict:
        """
        Generates an S3-compatible signed upload URL (PUT method)
        allowing the browser to upload the file directly.
        Path pattern: {user_id}/{sanitized_filename}
        """
        # Sanitize filename (allow alphanumerics, underscores, hyphens, and periods)
        sanitized_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
        storage_path = f"{user_id}/{sanitized_name}"

        try:
            # Generates a signed upload URL valid for 5 minutes
            response = self.client.storage.from_(self.bucket_name).create_signed_upload_url(storage_path)
            return {
                "signed_url": response["signed_url"],
                "storage_path": storage_path
            }
        except Exception as e:
            raise RuntimeError(f"Supabase storage presign generation error: {str(e)}")
