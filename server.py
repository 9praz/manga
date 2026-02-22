"""
Manga.Blue — server.py v2.2 (Ultra Stable Edition)
=================================================
ปรับปรุง: 
- เพิ่มระบบ Error Tracking เพื่อแจ้งสาเหตุ Code 500 ให้ชัดเจน
- ปรับปรุง Scraping Logic ให้ทนทานต่อโครงสร้างเว็บที่เปลี่ยนไป
- เพิ่ม Database Transaction เพื่อป้องกันข้อมูลพัง
"""

import os, json, hashlib, re, traceback
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

def get_theme(url: str) -> str:
    for domain, theme in SITE_THEMES.items():
        if domain in url: return theme
    return "madara"

def make_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]

def make_chapter_id(manga_id: str, number: float) -> str:
    return hashlib.md5(f"{manga_id}_{number}".encode()).hexdigest()[:16]

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    await init_db(app.state.pool)
    yield
    await app.state.pool.close()

app = FastAPI(title="Manga.Blue API", version="2.2", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

async def get_soup(url: str, referer: str = "") -> Optional[BeautifulSoup]:
    headers = {**HEADERS, "Referer": referer} if referer else {**HEADERS}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15, verify=False, headers=headers) as client:
            r = await client.get(url)
            if r.status_code == 200: return BeautifulSoup(r.text, "html.parser")
    except Exception as e: print(f"[scrape error] {url}: {e}")
    return None

def _extract_chapter_number(title: str, url: str = "") -> float:
    for text in [title, url]:
        if not text: continue
        m = re.search(r'(?:chapter|ch|ตอน(?:ที่)?)[.\-\s]*(\d+(?:\.\d+)?)', text, re.IGNORECASE)
        if m: return float(m.group(1))
        m = re.search(r'[-/](\d+(?:\.\d+)?)(?:/?\s*$|[^0-9])', text)
        if m: return float(m.group(1))
    return 0.0

# --- Scrapers ---
async def scrape_chapters_madara(manga_url: str) -> List[Dict]:
    chapters = []
    parsed = urlparse(manga_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    soup = await get_soup(manga_url)
    if not soup: return []

    post_id = None
    for el in soup.select("script"):
        m = re.search(r'"manga_id"\s*:\s*"?(\d+)"?', el.get_text())
        if m: 
            post_id = m.group(1)
            break
    
    if post_id:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=15, verify=False) as client:
                r = await client.post(
                    f"{base}/wp-admin/admin-ajax.php",
                    data={"action": "manga_get_chapters", "manga": post_id},
                    headers={**HEADERS, "Referer": manga_url, "X-Requested-With": "XMLHttpRequest"},
                )
                if r.status_code == 200 and r.text.strip():
                    ch_soup = BeautifulSoup(r.text, "html.parser")
                    for li in ch_soup.select("li.wp-manga-chapter"):
                        a = li.select_one("a")
                        if not a: continue
                        href, title = a.get("href", ""), a.get_text(strip=True)
                        chapters.append({"title": title, "url": href, "number": _extract_chapter_number(title, href)})
        except: pass

    if not chapters:
        for li in soup.select("li.wp-manga-chapter"):
            a = li.select_one("a")
            if not a: continue
            href, title = a.get("href", ""), a.get_text(strip=True)
            chapters.append({"title": title, "url": href, "number": _extract_chapter_number(title, href)})
    return chapters

async def scrape_chapters_themesia(manga_url: str) -> List[Dict]:
    chapters = []
    soup = await get_soup(manga_url)
    if not soup: return []
    for sel in ["#chapterlist li", ".eplister li", ".chapterlist li"]:
        items = soup.select(sel)
        if items:
            for li in items:
                a = li.select_one("a")
                if not a: continue
                href = a.get("href", "")
                title_el = li.select_one(".chapternum") or li.select_one(".chapter-title")
                title = title_el.get_text(strip=True) if title_el else a.get_text(strip=True)
                chapters.append({"title": title, "url": href, "number": _extract_chapter_number(title, href)})
            break
    return chapters

async def scrape_chapters_nekopost(manga_url: str) -> List[Dict]:
    chapters = []
    pid = manga_url.rstrip("/").split("/")[-1]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"https://www.nekopost.net/api/project/detail/{pid}")
            if r.status_code == 200:
                data = r.json()
                for ch in data.get("listChapter", []):
                    ch_no = ch.get("chapterNo", "0")
                    chapters.append({
                        "title": f"ตอนที่ {ch_no}" + (f" — {ch['chapterName']}" if ch.get("chapterName") else ""),
                        "url": f"https://www.nekopost.net/manga/{pid}/{ch_no}",
                        "number": float(ch_no),
                    })
    except Exception as e: print(f"[nekopost error] {e}")
    return chapters

async def scrape_chapters(manga_url: str) -> List[Dict]:
    theme = get_theme(manga_url)
    if theme == "nekopost": return await scrape_chapters_nekopost(manga_url)
    if theme == "themesia": return await scrape_chapters_themesia(manga_url)
    return await scrape_chapters_madara(manga_url)

# --- Endpoints ---
@app.get("/api/manga")
async def list_manga(page: int = 1, limit: int = 24, q: Optional[str] = None, country: Optional[str] = None, genre: Optional[str] = None, sort: str = "popular"):
    pool = app.state.pool
    offset = (page - 1) * limit
    conds, params = [], []
    if q: params.append(f"%{q}%"); conds.append(f"(title ILIKE ${len(params)} OR title_th ILIKE ${len(params)})")
    if country: params.append(country.upper()); conds.append(f"country = ${len(params)}")
    if genre: params.append(genre); conds.append(f"${len(params)} = ANY(genres)")
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    order = {"views": "view_count DESC", "rating": "rating DESC", "updated": "updated_at DESC NULLS LAST"}.get(sort, "sort_order ASC NULLS LAST")
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"SELECT * FROM manga {where} ORDER BY {order} LIMIT ${len(params)+1} OFFSET ${len(params)+2}", *params, limit, offset)
        total = await conn.fetchval(f"SELECT COUNT(*) FROM manga {where}", *params)
    return {"data": [dict(r) for r in rows], "total": total or 0, "page": page, "limit": limit}

@app.get("/api/manga/{manga_id}")
async def get_manga(manga_id: str):
    async with app.state.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM manga WHERE id = $1", manga_id)
        if not row: return JSONResponse(status_code=404, content={"detail": "Manga not found"})
        await conn.execute("UPDATE manga SET view_count = view_count + 1 WHERE id = $1", manga_id)
        return dict(row)

@app.get("/api/manga/{manga_id}/chapters")
async def get_chapters(manga_id: str):
    pool = app.state.pool
    try:
        async with pool.acquire() as conn:
            manga = await conn.fetchrow("SELECT * FROM manga WHERE id = $1", manga_id)
            if not manga: return JSONResponse(status_code=404, content={"detail": "Manga not found"})
            
            # 1. ถ้ามีใน DB อยู่แล้ว คืนค่าทันที
            if manga["chapters_fetched"]:
                rows = await conn.fetch("SELECT id, number, title, source_url FROM chapters WHERE manga_id = $1 ORDER BY number DESC", manga_id)
                return [dict(r) for r in rows]
            
            source_url = manga.get("source_url")
            if not source_url: return JSONResponse(status_code=400, content={"detail": "Source URL missing"})

        # 2. เริ่มขูดข้อมูล
        raw = await scrape_chapters(source_url)
        if not raw: return []

        # 3. บันทึกลง DB ด้วย Transaction เพื่อความปลอดภัย
        async with pool.acquire() as conn:
            async with conn.transaction():
                for ch in raw:
                    ch_num = ch.get("number", 0.0)
                    ch_id = make_chapter_id(manga_id, ch_num)
                    await conn.execute("""
                        INSERT INTO chapters (id, manga_id, number, title, source_url) 
                        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING
                    """, ch_id, manga_id, ch_num, ch.get("title"), ch.get("url"))
                await conn.execute("UPDATE manga SET chapters_fetched = TRUE WHERE id = $1", manga_id)
            
            rows = await conn.fetch("SELECT id, number, title, source_url FROM chapters WHERE manga_id = $1 ORDER BY number DESC", manga_id)
            return [dict(r) for r in rows]

    except Exception as e:
        err_msg = f"{type(e).__name__}: {str(e)}"
        print(f"[Critical Error] {err_msg}")
        print(traceback.format_exc())
        return JSONResponse(status_code=500, content={"detail": err_msg})

@app.get("/api/proxy-image")
async def proxy_image(url: str = Query(...)):
    actual_url = unquote(url)
    domain = f"{urlparse(actual_url).scheme}://{urlparse(actual_url).netloc}/"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15, verify=False, headers={**HEADERS, "Referer": domain}) as client:
            r = await client.get(actual_url)
            return Response(content=r.content, media_type=r.headers.get("content-type", "image/jpeg"), headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"})
    except: return Response(status_code=502)

@app.get("/health")
async def health():
    try:
        async with app.state.pool.acquire() as conn:
            m_count = await conn.fetchval("SELECT COUNT(*) FROM manga")
            return {"status": "ok", "db": "connected", "manga": m_count}
    except Exception as e: return JSONResponse({"status": "error", "detail": str(e)}, status_code=503)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)