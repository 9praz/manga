import os
import json
import hashlib
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

import asyncpg
import httpx
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv

load_dotenv()

# ตั้งค่า Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/mangablue")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # สร้าง Connection Pool เพื่อความสเถียรในการใช้งานบนมือถือ/แท็บเล็ต
    app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    await init_db(app.state.pool)
    yield
    await app.state.pool.close()

app = FastAPI(title="Manga.Blue API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

async def init_db(pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        # สร้าง Table มังงะ (รองรับ sort_order สำหรับความนิยม)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS manga (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                title_th    TEXT,
                cover_url   TEXT,
                source_url  TEXT,
                source_site TEXT,
                country     TEXT,
                status      TEXT,
                genres      TEXT[],
                description TEXT,
                rating      FLOAT DEFAULT 0,
                view_count  BIGINT DEFAULT 0,
                sort_order  INTEGER,
                updated_at  TIMESTAMPTZ,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS chapters (
                id          TEXT PRIMARY KEY,
                manga_id    TEXT REFERENCES manga(id) ON DELETE CASCADE,
                number      FLOAT NOT NULL,
                title       TEXT,
                source_url  TEXT NOT NULL,
                pages       TEXT[],
                published_at TIMESTAMPTZ,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_manga_sort ON manga(sort_order ASC NULLS LAST);
            CREATE INDEX IF NOT EXISTS idx_chapters_manga ON chapters(manga_id);
        """)

def make_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]

# --- API ENDPOINTS ---

@app.get("/api/manga")
async def list_manga(page: int = 1, limit: int = 24, q: Optional[str] = None):
    pool: asyncpg.Pool = app.state.pool
    offset = (page - 1) * limit
    
    # ดึงข้อมูลโดยเรียงตาม sort_order (ที่ Aggregator คำนวณความนิยมมาให้)
    conds = []
    params = []
    if q:
        params.append(f"%{q}%")
        conds.append(f"(title ILIKE ${len(params)} OR title_th ILIKE ${len(params)})")
    
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    params += [limit, offset]
    
    query = f"SELECT * FROM manga {where} ORDER BY sort_order ASC NULLS LAST LIMIT ${len(params)-1} OFFSET ${len(params)}"
    
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM manga {where}", *params[:-2] if q else [])
    
    return {"data": [dict(r) for r in rows], "total": total or 0}

@app.get("/api/manga/{manga_id}")
async def get_manga(manga_id: str):
    async with app.state.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM manga WHERE id = $1", manga_id)
    if not row: raise HTTPException(404)
    return dict(row)

@app.get("/api/manga/{manga_id}/chapters")
async def get_chapters(manga_id: str):
    async with app.state.pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM chapters WHERE manga_id = $1 ORDER BY number DESC", manga_id)
    return [dict(r) for r in rows]

@app.get("/api/chapters/{chapter_id}/pages")
async def get_pages(chapter_id: str):
    async with app.state.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT source_url, pages FROM chapters WHERE id = $1", chapter_id)
        if not row: raise HTTPException(404)
        if row['pages']: return {"pages": row['pages']}
        
        # ดึงรูปจากต้นทางแบบเรียลไทม์ (Scraper)
        url = row['source_url']
        if "nekopost.net/manga/" in url:
            try:
                parts = url.strip("/").split("/")
                m_id, ch_no = parts[-2], parts[-1]
                async with httpx.AsyncClient() as client:
                    # ต้องหา chapterId จริงจาก API รายละเอียดก่อน (เพื่อความแม่นยำ)
                    r = await client.get(f"https://www.nekopost.net/api/project/chapter/detail/{m_id}/{ch_no}")
                    data = r.json()
                    pages = [f"https://www.osemocphoto.com/collectManga/{m_id}/{ch_no}/{p['fileName']}" for p in data.get("listPage", [])]
                    await app.state.pool.execute("UPDATE chapters SET pages = $1 WHERE id = $2", pages, chapter_id)
                    return {"pages": pages}
            except: pass
    return {"pages": []}

@app.get("/api/proxy-image")
async def proxy_image(url: str):
    actual_url = unquote(url)
    domain = f"{urlparse(actual_url).scheme}://{urlparse(actual_url).netloc}/"
    async with httpx.AsyncClient(verify=False) as client:
        try:
            r = await client.get(actual_url, headers={"User-Agent": "Mozilla/5.0", "Referer": domain}, timeout=10)
            return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"))
        except: return Response(status_code=500)

@app.api_route("/api/migrate", methods=["GET", "POST"])
async def migrate(secret: str = Query(...), clear: bool = False):
    if secret != os.getenv("MIGRATE_SECRET", "changeme"): raise HTTPException(403)
    
    path = Path("manga_catalog.json")
    if not path.exists(): raise HTTPException(404, detail="JSON file not found")
    
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
        catalog = data.get("manga", [])

    async with app.state.pool.acquire() as conn:
        if clear: await conn.execute("TRUNCATE TABLE chapters, manga CASCADE;")
        
        inserted_count = 0
        for idx, item in enumerate(catalog):
            # --- ระบบกรองแนวที่ไม่ต้องการ (Safe Filter) ---
            genres = item.get("genres", [])
            forbidden = ['Harem', 'Adult', 'Ecchi', 'Smut', 'Mature']
            if any(g in forbidden for g in genres):
                continue

            first_src = item.get("sources", [{}])[0]
            s_url = first_src.get("url", "")
            m_id = item.get("id") or make_id(s_url or item.get("title"))
            
            # 1. บันทึกข้อมูลมังงะ (รวม sort_order จาก Aggregator)
            await conn.execute("""
                INSERT INTO manga (id, title, title_th, cover_url, source_url, source_site, country, genres, description, sort_order)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order, cover_url = EXCLUDED.cover_url
            """, m_id, item.get("title"), item.get("title_th"), item.get("cover"), s_url, first_src.get("name"), 
               item.get("country"), genres, item.get("desc"), idx)

            # 2. ดึงรายชื่อตอนจาก Nekopost ลง Database (Deep Migrate)
            if "nekopost.net/manga/" in s_url:
                nk_id = s_url.split("/")[-1]
                async with httpx.AsyncClient() as client:
                    try:
                        r = await client.get(f"https://www.nekopost.net/api/project/detail/{nk_id}", timeout=5)
                        if r.status_code == 200:
                            for ch in r.json().get("listChapter", []):
                                await conn.execute("""
                                    INSERT INTO chapters (id, manga_id, number, title, source_url)
                                    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING
                                """, str(ch['chapterId']), m_id, float(ch['chapterNo']), ch['chapterName'], 
                                   f"https://www.nekopost.net/manga/{nk_id}/{ch['chapterNo']}")
                    except: pass
            inserted_count += 1
            
    return {"status": "success", "inserted": inserted_count}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)