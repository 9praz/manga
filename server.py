import os, json as json_module, hashlib, re, asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

import asyncpg
import httpx
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession as CurlSession
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────
def get_theme(url: str) -> str:
    for domain, theme in SITE_THEMES.items():
        if domain in url:
            return theme
    return "madara"

def make_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]

def make_chapter_id(manga_id: str, number: float) -> str:
    return hashlib.md5(f"{manga_id}_{number}".encode()).hexdigest()[:16]

AD_URL_KEYWORDS = {
    "manga-bl", "manga-bh", "manga-kr", "readmangathai",
    "banner", "advertis", "sponsor", "promo", "adsense",
}

AD_LINK_DOMAINS = {
    "manga-bl.com", "manga-bh.com", "manga-kr.com", "readmangathai.com",
    "facebook.com", "line.me", "bit.ly", "goo.gl", "shorturl.at",
}

# รูป placeholder ที่ไม่ใช่หน้ามังงะจริง
PLACEHOLDER_PATTERNS = {
    "data:image", "placeholder", "loading", "spinner",
    "1x1", "blank", "empty", ".svg", "default-image",
}

def is_ad_or_placeholder(src: str, img_tag, chapter_url: str) -> bool:
    """ตรวจว่ารูปนี้เป็นโฆษณาหรือ placeholder"""
    src_lower = src.lower()

    # 1. URL มีคีย์เวิร์ดโฆษณา
    if any(kw in src_lower for kw in AD_URL_KEYWORDS):
        return True

    # 2. URL เป็น placeholder/data URI/SVG ขนาดเล็ก
    if any(p in src_lower for p in PLACEHOLDER_PATTERNS):
        return True

    # 3. img อยู่ใน <a> ที่ชี้ไปเว็บอื่น (โฆษณาแบบ clickable)
    try:
        parent_a = img_tag.find_parent("a")
        if parent_a and parent_a.get("href"):
            href = parent_a["href"]
            href_host = urlparse(href).netloc.lower().replace("www.", "")
            ch_host   = urlparse(chapter_url).netloc.lower().replace("www.", "")
            if href_host and href_host != ch_host:
                # ชี้ไปเว็บอื่น = โฆษณา
                return True
    except Exception:
        pass

    return False


def extract_chapter_number(text: str, url: str = "") -> float:
    for pattern in [
        r'(?:chapter|ch|chap|ep|ตอนที่|ตอน)[.\s\-_]*(\d+(?:\.\d+)?)',
        r'[-/](\d+(?:\.\d+)?)(?:[-/]|$)',
        r'(\d+(?:\.\d+)?)',
    ]:
        m = re.search(pattern, text, re.I)
        if m:
            return float(m.group(1))
    parts = url.rstrip('/').split('/')
    for part in reversed(parts):
        m = re.search(r'(\d+(?:\.\d+)?)', part)
        if m:
            return float(m.group(1))
    return 0.0

# ─────────────────────────────────────────────────────────
# Database Setup
# ─────────────────────────────────────────────────────────
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
            CREATE INDEX IF NOT EXISTS idx_manga_views    ON manga(view_count DESC);
            CREATE INDEX IF NOT EXISTS idx_chapters_manga ON chapters(manga_id, number DESC);
        """)
        # Migration: เพิ่ม column ที่อาจหายไปใน schema เก่า
        migrations = [
            "ALTER TABLE manga    ADD COLUMN IF NOT EXISTS chapters_fetched BOOLEAN DEFAULT FALSE",
            "ALTER TABLE manga    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
            "ALTER TABLE chapters ADD COLUMN IF NOT EXISTS pages_fetched BOOLEAN DEFAULT FALSE",
            "ALTER TABLE chapters ADD COLUMN IF NOT EXISTS pages TEXT[]",
            "ALTER TABLE chapters ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ",
        ]
        for sql in migrations:
            try:
                await conn.execute(sql)
            except Exception:
                pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    await init_db(app.state.pool)
    yield
    await app.state.pool.close()

# ─────────────────────────────────────────────────────────
# App Init
# ─────────────────────────────────────────────────────────
app = FastAPI(title="Manga.Blue API", version="3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────
# Scrapers — Madara / Themesia (WordPress manga theme)
# ─────────────────────────────────────────────────────────
async def scrape_chapters_madara(session: CurlSession, manga_id: str, source_url: str) -> list:
    soup = None
    # ลอง AJAX endpoint ก่อน (Madara/Themesia ใช้วิธีนี้)
    ajax_url = source_url.rstrip('/') + '/ajax/chapters/'
    try:
        resp = await session.post(
            ajax_url,
            headers={**HEADERS, 'X-Requested-With': 'XMLHttpRequest', 'Referer': source_url},
            impersonate="chrome120", timeout=20,
        )
        if resp.status_code == 200 and len(resp.text.strip()) > 100:
            soup = BeautifulSoup(resp.text, 'html.parser')
    except Exception:
        pass

    # Fallback: โหลด manga page โดยตรง
    if not soup:
        try:
            resp = await session.get(source_url, headers=HEADERS, impersonate="chrome120", timeout=20)
            soup = BeautifulSoup(resp.text, 'html.parser')
        except Exception:
            return []

    chapters = []
    seen_urls = set()

    # Madara selectors
    CHAPTER_SELECTORS = [
        'li.wp-manga-chapter a',          # Madara standard
        'li.a-h.wleft a',                 # Madara alt
        '.chapter-item a',                # generic
        '.eplister li a',                 # Themesia standard
        '.eplisterfull li a',             # Themesia full list
        '.bxcl li a',                     # Themesia alt
        'ul.clstyle li a',                # Themesia clstyle
        '#chapter_list li a',             # id-based fallback
    ]

    for selector in CHAPTER_SELECTORS:
        for a in soup.select(selector):
            ch_url = (a.get('href') or '').strip()
            if not ch_url or ch_url in seen_urls:
                continue
            # ตรวจว่าเป็น chapter URL จริง (มี /chapter หรือตัวเลข)
            if not re.search(r'/chapter[-/]?\d|/\d+/?$', ch_url, re.I):
                continue
            seen_urls.add(ch_url)
            title = a.get_text(strip=True)
            number = extract_chapter_number(title, ch_url)
            ch_id = make_chapter_id(manga_id, number)
            chapters.append({
                'id': ch_id,
                'manga_id': manga_id,
                'number': number,
                'title': title or f'Chapter {int(number)}',
                'source_url': ch_url,
            })
        if chapters:
            break  # ใช้ selector แรกที่ได้ผลลัพธ์

    chapters.sort(key=lambda x: x['number'], reverse=True)
    return chapters


async def scrape_pages_madara(session: CurlSession, chapter_url: str) -> list:
    try:
        ch_host = urlparse(chapter_url).netloc.lower().replace("www.", "")
        resp = await session.get(
            chapter_url,
            headers={**HEADERS, 'Referer': f"https://{ch_host}/"},
            impersonate="chrome120", timeout=25,
        )
        soup = BeautifulSoup(resp.text, 'html.parser')
        images = []

        # ── วิธีที่ 1: ts_reader.run() ──
        for script in soup.find_all('script'):
            text = script.string or ''
            m = re.search(r'ts_reader\.run\((\{.*?\})\s*\)', text, re.DOTALL)
            if m:
                try:
                    data = json_module.loads(m.group(1))
                    for source in data.get('sources', []):
                        for img_url in source.get('images', []):
                            if img_url and img_url.startswith('http'):
                                images.append(img_url.strip())
                except Exception:
                    pass
            m2 = re.search(r'chapter_preloaded_images\s*=\s*(\[.*?\])', text, re.DOTALL)
            if m2:
                try:
                    urls = json_module.loads(m2.group(1))
                    images.extend([u.strip() for u in urls if u and u.startswith('http')])
                except Exception:
                    pass

        if images:
            return images

        # ── วิธีที่ 2: HTML img tags (fallback) ──
        container = (
            soup.select_one('.reading-content') or
            soup.select_one('.chapter-content') or
            soup.select_one('#readerarea') or
            soup.select_one('.entry-content') or
            soup
        )
        for img in container.select('img'):
            src = (
                img.get('data-src') or img.get('data-lazy-src') or
                img.get('data-original') or img.get('data-url') or
                img.get('data-full-url') or img.get('src') or ''
            ).strip()
            if not src or not src.startswith('http'):
                continue
            if is_ad_or_placeholder(src, img, chapter_url):
                continue
            images.append(src)

        return images
    except Exception:
        return []


# ─────────────────────────────────────────────────────────
# Scrapers — Nekopost (Thai site with JSON API)
# ─────────────────────────────────────────────────────────
NEKO_BASE = "https://www.nekopost.net"
NEKO_IMG  = "https://www.osemocphoto.com"

def _neko_pid(source_url: str) -> str:
    """ดึง project ID จาก nekopost URL"""
    return source_url.rstrip('/').split('/')[-1]

async def scrape_chapters_nekopost(client: CurlSession, manga_id: str, source_url: str) -> list:
    pid = _neko_pid(source_url)
    neko_headers = {**HEADERS, 'Referer': NEKO_BASE + '/', 'Accept': 'application/json'}

    chapters = []
    try:
        resp = await client.get(
            f"{NEKO_BASE}/api/as/m/project/{pid}/chapter-list",
            headers=neko_headers,
            timeout=20,
        )
        if resp.status_code == 200:
            data = resp.json()
            ch_list = data.get('listChapter') or (data if isinstance(data, list) else [])
            for ch in ch_list:
                number = float(ch.get('chapterNo', 0) or 0)
                if number == 0:
                    continue
                num_str = str(int(number)) if number == int(number) else str(number)
                ch_id = make_chapter_id(manga_id, number)
                chapters.append({
                    'id': ch_id,
                    'manga_id': manga_id,
                    'number': number,
                    'title': f"ตอนที่ {num_str}",
                    'source_url': f"{NEKO_BASE}/manga/{pid}/{num_str}/0",
                })
            chapters.sort(key=lambda x: x['number'], reverse=True)
            return chapters
    except Exception:
        pass

    # Fallback: scrape HTML
    try:
        resp = await client.get(source_url, headers=HEADERS, timeout=20)
        soup = BeautifulSoup(resp.text, 'html.parser')
        for a in soup.select('a[href*="/manga/"]'):
            href = a.get('href', '')
            if f'/manga/{pid}/' not in href:
                continue
            title = a.get_text(strip=True)
            number = extract_chapter_number(title, href)
            if number == 0:
                continue
            ch_id = make_chapter_id(manga_id, number)
            chapters.append({
                'id': ch_id,
                'manga_id': manga_id,
                'number': number,
                'title': title or f"ตอนที่ {int(number)}",
                'source_url': href,
            })
        chapters.sort(key=lambda x: x['number'], reverse=True)
    except Exception:
        pass

    return chapters


async def scrape_pages_nekopost(client: CurlSession, chapter_url: str) -> list:
    # URL: https://www.nekopost.net/manga/{pid}/{chapter_no}/0
    parts = chapter_url.rstrip('/').split('/')
    neko_headers = {**HEADERS, 'Referer': NEKO_BASE + '/', 'Accept': 'application/json'}

    try:
        # parts[-1] = "0" (page index), parts[-2] = chapter_no, parts[-3] = pid
        if len(parts) >= 3:
            pid = parts[-3]
            chapter_no = parts[-2]
        else:
            return []

        resp = await client.get(
            f"{NEKO_BASE}/api/as/m/project/{pid}/{chapter_no}/0",
            headers=neko_headers,
            timeout=20,
        )
        if resp.status_code == 200:
            data = resp.json()
            pages = []
            for page in (data.get('listPage') or []):
                img_path = page.get('fileName', '')
                if img_path:
                    pages.append(f"{NEKO_IMG}/collectManga/{pid}/{chapter_no}/{img_path}")
            if pages:
                return pages
    except Exception:
        pass

    # Fallback: scrape HTML
    try:
        resp = await client.get(chapter_url, headers=HEADERS, timeout=20)
        soup = BeautifulSoup(resp.text, 'html.parser')
        pages = []
        for img in soup.select('img.img-fluid, .reading-content img, img[src*="osemocphoto"]'):
            src = (img.get('data-src') or img.get('src') or '').strip()
            if src and 'data:image' not in src:
                pages.append(src)
        return pages
    except Exception:
        return []


# ─────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────

@app.get("/api/reset-pages-cache")
async def reset_pages_cache(secret: str = Query(...)):
    """Reset pages_fetched ทั้งหมด เพื่อ force re-scrape ครั้งถัดไป"""
    if secret != os.getenv("MIGRATE_SECRET", "changeme"):
        raise HTTPException(403, "Invalid secret")
    async with app.state.pool.acquire() as conn:
        await conn.execute(
            "UPDATE chapters SET pages_fetched = FALSE, pages = NULL WHERE pages_fetched = TRUE"
        )
    return {"status": "ok", "message": "Pages cache cleared"}


@app.get("/api/reset-chapters-cache")
async def reset_chapters_cache(secret: str = Query(...)):
    """Reset chapters_fetched ทั้งหมด เพื่อ re-scrape chapter list ใหม่"""
    if secret != os.getenv("MIGRATE_SECRET", "changeme"):
        raise HTTPException(403, "Invalid secret")
    async with app.state.pool.acquire() as conn:
        await conn.execute("DELETE FROM chapters")
        await conn.execute("UPDATE manga SET chapters_fetched = FALSE")
    return {"status": "ok", "message": "Chapters cache cleared — will re-scrape on next request"}


@app.post("/api/ingest-chapters")
async def ingest_chapters(payload: dict):
    """รับ chapters จาก local scraper แล้วบันทึกลง DB"""
    if payload.get("secret") != os.getenv("MIGRATE_SECRET", "changeme"):
        raise HTTPException(403, "Invalid secret")
    manga_id = payload.get("manga_id")
    chapters = payload.get("chapters", [])
    if not manga_id or not chapters:
        raise HTTPException(400, "manga_id and chapters required")
    inserted = 0
    async with app.state.pool.acquire() as conn:
        for ch in chapters:
            try:
                await conn.execute("""
                    INSERT INTO chapters (id, manga_id, number, title, source_url)
                    VALUES ($1,$2,$3,$4,$5)
                    ON CONFLICT (id) DO NOTHING
                """, ch["id"], manga_id, float(ch["number"]), ch["title"], ch["source_url"])
                inserted += 1
            except Exception:
                pass
        await conn.execute("UPDATE manga SET chapters_fetched=TRUE WHERE id=$1", manga_id)
    return {"status": "ok", "inserted": inserted}


@app.get("/health")
async def health():
    return {"status": "ok", "version": "3.0"}


@app.get("/api/manga")
async def list_manga(
    page: int = 1,
    limit: int = 24,
    q: Optional[str] = None,
    sort: Optional[str] = None,
    country: Optional[str] = None,
    genre: Optional[str] = None,
):
    pool = app.state.pool
    offset = (page - 1) * limit
    conditions, params = [], []

    if q:
        conditions.append(f"(title ILIKE ${len(params)+1} OR title_th ILIKE ${len(params)+1})")
        params.append(f"%{q}%")
    if country:
        conditions.append(f"country = ${len(params)+1}")
        params.append(country.upper())
    if genre:
        conditions.append(f"${len(params)+1} = ANY(genres)")
        params.append(genre)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    order = "ORDER BY view_count DESC, sort_order ASC" if sort == "views" else "ORDER BY sort_order ASC"
    pi, po = len(params)+1, len(params)+2

    async with pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM manga {where}", *params)
        rows  = await conn.fetch(
            f"SELECT * FROM manga {where} {order} LIMIT ${pi} OFFSET ${po}",
            *params, limit, offset
        )

    return {
        "data":  [dict(r) for r in rows],
        "total": total,
        "page":  page,
        "limit": limit,
    }


@app.get("/api/manga/{manga_id}")
async def get_manga(manga_id: str):
    async with app.state.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM manga WHERE id = $1", manga_id)
    if not row:
        raise HTTPException(404, "Manga not found")
    return dict(row)


@app.get("/api/manga/{manga_id}/chapters")
async def get_chapters(manga_id: str):
    pool = app.state.pool

    async with pool.acquire() as conn:
        manga = await conn.fetchrow("SELECT * FROM manga WHERE id = $1", manga_id)
        if not manga:
            raise HTTPException(404, "Manga not found")

        # ถ้า scrape แล้ว คืนจาก DB เลย
        if manga['chapters_fetched']:
            rows = await conn.fetch(
                "SELECT * FROM chapters WHERE manga_id = $1 ORDER BY number DESC",
                manga_id
            )
            if rows:
                return [dict(r) for r in rows]

    # Scrape on-demand
    source_url = manga['source_url'] or ''
    theme = get_theme(source_url)

    async with CurlSession() as client:
        if theme == 'nekopost':
            chapters = await scrape_chapters_nekopost(client, manga_id, source_url)
        else:
            chapters = await scrape_chapters_madara(client, manga_id, source_url)

    if not chapters:
        return []

    # บันทึก chapters ลง DB
    async with pool.acquire() as conn:
        for ch in chapters:
            await conn.execute("""
                INSERT INTO chapters (id, manga_id, number, title, source_url)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO NOTHING
            """, ch['id'], manga_id, ch['number'], ch['title'], ch['source_url'])

        await conn.execute(
            "UPDATE manga SET chapters_fetched = TRUE WHERE id = $1",
            manga_id
        )

    return chapters


@app.get("/api/chapters/{chapter_id}/pages")
async def get_pages(chapter_id: str, force: bool = False):
    pool = app.state.pool

    async with pool.acquire() as conn:
        chapter = await conn.fetchrow("SELECT * FROM chapters WHERE id = $1", chapter_id)
        if not chapter:
            raise HTTPException(404, "Chapter not found")

        # ถ้า scrape แล้วและไม่ได้ force → คืนจาก DB เลย
        if chapter['pages_fetched'] and chapter['pages'] and not force:
            return {"pages": list(chapter['pages'])}

    # Scrape on-demand
    source_url = chapter['source_url'] or ''
    theme = get_theme(source_url)

    async with CurlSession() as client:
        if theme == 'nekopost':
            pages = await scrape_pages_nekopost(client, source_url)
        else:
            pages = await scrape_pages_madara(client, source_url)

    if pages:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE chapters SET pages = $1, pages_fetched = TRUE WHERE id = $2",
                pages, chapter_id
            )

    return {"pages": pages}


@app.get("/api/proxy-image")
async def proxy_image(url: str = Query(...)):
    clean_url = unquote(url)

    # กำหนด Referer ตาม domain
    referer = 'https://www.nekopost.net/'
    for domain in SITE_THEMES:
        if domain in clean_url:
            referer = f"https://{domain}/"
            break

    headers = {**HEADERS, 'Referer': referer}

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            resp = await client.get(clean_url, headers=headers)
        content_type = resp.headers.get('Content-Type', 'image/jpeg')
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={'Cache-Control': 'public, max-age=86400'},
        )
    except Exception as e:
        raise HTTPException(502, f"Image fetch failed: {e}")


# ─────────────────────────────────────────────────────────
# Migration endpoint (เติมข้อมูลจาก manga_catalog.json)
# ─────────────────────────────────────────────────────────
@app.api_route("/api/migrate", methods=["GET", "POST"])
async def migrate(secret: str = Query(...), clear: bool = False):
    if secret != os.getenv("MIGRATE_SECRET", "changeme"):
        raise HTTPException(403, "Invalid secret")

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
            if any(g.lower() in FORBIDDEN_GENRES for g in genres):
                continue

            s_url  = item.get("sources", [{}])[0].get("url")  or item.get("source_url", "")
            s_site = item.get("sources", [{}])[0].get("name") or item.get("source_site", "Unknown")
            m_id   = item.get("id") or make_id(s_url or item.get("title", ""))

            try:
                await conn.execute("""
                    INSERT INTO manga (id, title, title_th, cover_url, source_url, source_site,
                                      country, genres, description, sort_order)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                    ON CONFLICT (id) DO UPDATE SET
                        cover_url  = EXCLUDED.cover_url,
                        genres     = EXCLUDED.genres,
                        sort_order = EXCLUDED.sort_order
                """,
                    m_id,
                    item.get("title", ""),
                    item.get("title_th"),
                    item.get("cover") or item.get("cover_url"),
                    s_url, s_site,
                    (item.get("country") or "JP").upper(),
                    genres,
                    item.get("desc") or item.get("description"),
                    idx,
                )
                inserted += 1
            except Exception as e:
                print(f"Error migrating {item.get('title')}: {e}")

    return {"status": "ok", "inserted": inserted, "total": len(catalog)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)
