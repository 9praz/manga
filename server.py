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

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/mangablue")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

@asynccontextmanager
async def lifespan(app: FastAPI):
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
                sort_order  SERIAL,
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
        """)

def make_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]

@app.get("/api/manga")
async def list_manga(
    country: Optional[str] = None,
    genre:   Optional[str] = None,
    q:       Optional[str] = None,
    page:    int = 1,
    limit:   int = 24,
):
    pool: asyncpg.Pool = app.state.pool
    offset = (page - 1) * limit
    conds, params = [], []

    if country:
        params.append(country.upper())
        conds.append(f"country = ${len(params)}")
    if genre:
        params.append(genre)
        conds.append(f"${len(params)} = ANY(genres)")
    if q:
        params.append(f"%{q}%")
        conds.append(f"(title ILIKE ${len(params)} OR title_th ILIKE ${len(params)})")

    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    
    params += [limit, offset]
    query = f"""
        SELECT * FROM manga {where} 
        ORDER BY sort_order ASC 
        LIMIT ${len(params)-1} OFFSET ${len(params)}
    """
    
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM manga {where}", *params[:-2])
        
    return {"data": [dict(r) for r in rows], "total": total, "page": page, "limit": limit}

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
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT source_url, pages FROM chapters WHERE id = $1", chapter_id)
        if not row: raise HTTPException(404)
        if row["pages"]: return {"pages": row["pages"]}
        
        pages = await fetch_pages_logic(row["source_url"])
        if pages:
            await conn.execute("UPDATE chapters SET pages = $1 WHERE id = $2", pages, chapter_id)
        return {"pages": pages}

async def fetch_pages_logic(url: str) -> list[str]:
    try:
        if "nekopost.net" in url:
            parts = url.strip("/").split("/")
            m_id, c_id = parts[-2], parts[-1]
            async with httpx.AsyncClient() as client:
                r = await client.get(f"https://www.nekopost.net/api/project/chapter/detail/{m_id}/{c_id}", timeout=10)
                if r.status_code == 200:
                    data = r.json()
                    return [f"https://www.osemocphoto.com/collectManga/{m_id}/{c_id}/{p['fileName']}" for p in data.get("listPage", [])]
    except: pass
    return []

@app.get("/api/proxy-image")
async def proxy_image(url: str):
    actual_url = unquote(url)
    domain = f"{urlparse(actual_url).scheme}://{urlparse(actual_url).netloc}/"
    async with httpx.AsyncClient(verify=False) as client:
        try:
            r = await client.get(actual_url, headers={"User-Agent": "Mozilla/5.0", "Referer": domain}, timeout=10, follow_redirects=True)
            return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"))
        except: return Response(status_code=500)

@app.api_route("/api/migrate", methods=["GET", "POST"])
async def migrate(secret: str = Query(...), clear: bool = False):
    if secret != os.getenv("MIGRATE_SECRET", "changeme"): raise HTTPException(403)
    path = Path(__file__).parent / "public" / "manga_catalog.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
        catalog = data.get("manga", [])
    
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        if clear: await conn.execute("TRUNCATE TABLE chapters, manga CASCADE;")
        
        for idx, item in enumerate(catalog):
            first_src = item.get("sources", [{}])[0]
            s_url = item.get("url") or first_src.get("url", "")
            m_id = item.get("id") or make_id(s_url or item.get("title"))
            
            await conn.execute("""
                INSERT INTO manga (id, title, title_th, cover_url, source_url, source_site, country, genres, description, sort_order)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order, cover_url = EXCLUDED.cover_url
            """, m_id, item.get("title"), item.get("title_th"), item.get("cover"), s_url, first_src.get("name"), 
               item.get("country", "JP"), item.get("genres", []), item.get("desc"), idx)
    return {"status": "success", "total": len(catalog)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)