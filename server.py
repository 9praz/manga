import os, json, hashlib, re, traceback, asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List, Dict
from urllib.parse import unquote, urlparse

import asyncpg
import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/mangablue")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
}

FORBIDDEN_GENRES = {
    "harem","adult","ecchi","smut","mature","18+","r-18","r18","nsfw",
    "hentai","ntr","netorare","yaoi","yuri","shotacon","lolicon",
    "incest","doujinshi","erotic","erotica","femdom","bdsm","nude",
}

SITE_THEMES = {
    "catzaa.com": "madara", "doodmanga.com": "madara",
    "manhuabug.com": "madara", "manhuakey.com": "madara",
    "manhuathai.com": "madara", "manhwabreakup.com": "madara",
    "mangalami.com": "themesia", "makimaaaaa.com": "themesia",
    "manga1688.com": "themesia", "mangakimi.com": "themesia",
    "mangastep.com": "themesia", "moon-toon.com": "themesia",
    "one-manga.com": "themesia", "popsmanga.com": "themesia",
    "reapertrans.com": "themesia", "speed-manga.com": "themesia",
    "tanuki-manga.com": "themesia", "toomtam-manga.com": "themesia",
    "nekopost.net": "nekopost",
}

# --- Helpers ---
def get_theme(url: str) -> str:
    for domain, theme in SITE_THEMES.items():
        if domain in url: return theme
    return "madara"

def make_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]

def make_chapter_id(manga_id: str, number: float) -> str:
    return hashlib.md5(f"{manga_id}_{number}".encode()).hexdigest()[:16]

# --- Database Setup ---
async def init_db(pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS manga (
                id               TEXT PRIMARY KEY,
                title            TEXT NOT NULL,
                title_th         TEXT,
                cover_url        TEXT,
                source_url       TEXT,
                source_site      TEXT,
                country          TEXT,
                status           TEXT DEFAULT 'ongoing',
                genres           TEXT[],
                description      TEXT,
                rating           FLOAT DEFAULT 0,
                view_count       BIGINT DEFAULT 0,
                sort_order       INTEGER DEFAULT 9999,
                chapters_fetched BOOLEAN DEFAULT FALSE,
                updated_at       TIMESTAMPTZ,
                created_at       TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS chapters (
                id            TEXT PRIMARY KEY,
                manga_id      TEXT REFERENCES manga(id) ON DELETE CASCADE,
                number        FLOAT NOT NULL,
                title         TEXT,
                source_url    TEXT NOT NULL,
                pages         TEXT[],
                pages_fetched BOOLEAN DEFAULT FALSE,
                published_at  TIMESTAMPTZ,
                created_at    TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_manga_sort     ON manga(sort_order ASC NULLS LAST);
            CREATE INDEX IF NOT EXISTS idx_chapters_manga ON chapters(manga_id, number DESC);
        """)

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    await init_db(app.state.pool)
    yield
    await app.state.pool.close()

# --- App Init ---
app = FastAPI(title="Manga.Blue API", version="2.3", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Scrapers & Endpoints (เหมือนเดิมที่ปรับปรุงแล้ว) ---
# ... (ฟังก์ชัน get_soup, scrape_chapters ต่างๆ ให้คงไว้ตามเดิม) ...
# [หมายเหตุ: เพื่อความกระชับ ผมจะข้ามไปส่วนที่เป็นจุดบอดที่ทำให้มังงะหายครับ]

@app.get("/api/manga")
async def list_manga(page: int = 1, limit: int = 24, q: Optional[str] = None):
    pool = app.state.pool
    offset = (page - 1) * limit
    async with pool.acquire() as conn:
        if q:
            rows = await conn.fetch("SELECT * FROM manga WHERE title ILIKE $1 OR title_th ILIKE $1 ORDER BY sort_order ASC LIMIT $2 OFFSET $3", f"%{q}%", limit, offset)
        else:
            rows = await conn.fetch("SELECT * FROM manga ORDER BY sort_order ASC LIMIT $1 OFFSET $2", limit, offset)
    return [dict(r) for r in rows]

# ─── จุดสำคัญ: Migration Endpoint (ต้องมีเพื่อเติมข้อมูลมังงะ) ──────────────────

@app.api_route("/api/migrate", methods=["GET", "POST"])
async def migrate(secret: str = Query(...), clear: bool = False):
    if secret != os.getenv("MIGRATE_SECRET", "changeme"):
        raise HTTPException(403, "Invalid secret")

    # หาไฟล์ catalog
    catalog_path = Path("manga_catalog.json")
    if not catalog_path.exists():
        raise HTTPException(404, "manga_catalog.json not found")

    with open(catalog_path, encoding="utf-8") as f:
        data = json.load(f)
    
    catalog = data.get("manga", data) if isinstance(data, dict) else data
    pool = app.state.pool
    inserted = 0

    async with pool.acquire() as conn:
        if clear:
            await conn.execute("TRUNCATE TABLE chapters, manga CASCADE")

        for idx, item in enumerate(catalog):
            genres = item.get("genres", [])
            if any(g.lower() in FORBIDDEN_GENRES for g in genres): continue

            s_url = item.get("sources", [{}])[0].get("url") or item.get("source_url", "")
            s_site = item.get("sources", [{}])[0].get("name") or item.get("source_site", "Unknown")
            m_id = item.get("id") or make_id(s_url or item.get("title", ""))

            try:
                await conn.execute("""
                    INSERT INTO manga (id, title, title_th, cover_url, source_url, source_site, country, genres, description, sort_order)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                    ON CONFLICT (id) DO UPDATE SET 
                        cover_url = EXCLUDED.cover_url, 
                        genres = EXCLUDED.genres, 
                        sort_order = EXCLUDED.sort_order
                """, m_id, item.get("title", ""), item.get("title_th"), item.get("cover") or item.get("cover_url"), s_url, s_site, (item.get("country") or "JP").upper(), genres, item.get("desc") or item.get("description"), idx)
                inserted += 1
            except Exception as e:
                print(f"Error migrating {item.get('title')}: {e}")

    return {"status": "ok", "inserted": inserted, "total": len(catalog)}

# ... (Endpoints อื่นๆ get_chapters, proxy_image, health) ...

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)