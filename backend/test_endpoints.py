import asyncio
from app.routers.storage import get_storage_usage
from app.routers.folders import get_folders, create_folder, FolderCreate

async def main():
    user_id = "test_user_id"
    try:
        res = await get_storage_usage(user_id)
        print("Storage usage:", res)
    except Exception as e:
        print("Storage error:", str(e))
        import traceback
        traceback.print_exc()
        
    try:
        res = await get_folders(user_id)
        print("Folders get:", res)
    except Exception as e:
        print("Folders get error:", str(e))
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
