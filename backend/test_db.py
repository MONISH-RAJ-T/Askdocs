import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")

supabase = create_client(url, key)

try:
    print("Testing folders table...")
    res = supabase.table("folders").select("*").limit(1).execute()
    print("Folders success:", res.data)
except Exception as e:
    print("Folders error:", str(e))

try:
    print("Testing documents table for file_size...")
    res = supabase.table("documents").select("file_size").limit(1).execute()
    print("Documents success:", res.data)
except Exception as e:
    print("Documents error:", str(e))
