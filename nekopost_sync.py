import requests
import time
from supabase import create_client

SUPABASE_URL = "https://fpcpydkenqkuscevyvao.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwY3B5ZGtlbnFrdXNjZXZ5dmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDUyNjYsImV4cCI6MjA4NzE4MTI2Nn0.7wf6zU5DzxXOji-zVhhfKSJixbDHCVKONNQoAP_NxoA" # ใส่คีย์ยาวๆ ของคุณ

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def sync_all():
    page = 1
    while True:
        url = "https://www.nekopost.net/api/project/latest"
        payload = {"projectType": "m", "paging": {"pageNo": page, "pageSize": 36}}
        headers = {
            "Referer": "https://www.nekopost.net/", 
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers)
            if response.status_code != 200:
                break
                
            items = response.json().get('listChapter', [])
            if not items:
                break
                
            for item in items:
                p_id = str(item['pid'])
                data = {
                    "project_id": p_id,
                    "title": item['projectName'],
                    "current_chapter": str(item['chapterNo']),
                    "cover_url": f"https://www.osemocphoto.com/collectManga/{p_id}/{p_id}_cover.jpg"
                }
                supabase.table("manga_updates").upsert(data, on_conflict="project_id").execute()
            
            print(f"Synced Page: {page} | Items: {len(items)}")
            page += 1
            time.sleep(1.5)
            
        except Exception as e:
            print(f"Error: {e}")
            break

if __name__ == "__main__":
    sync_all()