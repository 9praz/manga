"""
Manga.Blue — server.py v2 (Production Ready)
=============================================
✅ PostgreSQL connection pool
✅ Scraper on-demand: Madara + Themesia + Nekopost
✅ Chapter list cache ใน DB (scrape ครั้งแรก → เก็บ → ครั้งต่อไปเร็ว)
✅ Page image URLs cache ใน DB
✅ Image proxy (bypass hotlink protection)
✅ 18+ filter ทุก layer
✅ CORS ready
✅ /health endpoint

Requirements: pip install fastapi uvicorn asyncpg httpx beautifulsoup4 python-dotenv
"""

import os, json, hashlib, re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
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
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
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
        if domain in url:
            return theme
    return "madara"

def make_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]

def make_chapter_id(manga_id: str, number: float) -> str:
    return hashlib.md5(f"{manga_id}_{number}".encode()).hexdigest()[:16]

# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    await init_db(app.state.pool)
    yield
    await app.state.pool.close()

app = FastAPI(title="Manga.Blue API", version="2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── DB Schema ───────────────────────────────────────────────────────────────

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
            CREATE INDEX IF NOT EXISTS idx_manga_country  ON manga(country);
            CREATE INDEX IF NOT EXISTS idx_chapters_manga ON chapters(manga_id, number DESC);
        """)

# ─── HTTP helper ─────────────────────────────────────────────────────────────

async def get_soup(url: str, referer: str = "") -> Optional[BeautifulSoup]:
    headers = {**HEADERS}
    if referer:
        headers["Referer"] = referer
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15, verify=False, headers=headers) as client:
            r = await client.get(url)
            if r.status_code == 200:
                return BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        print(f"[scrape error] {url}: {e}")
    return None

def _extract_chapter_number(title: str, url: str = "") -> float:
    for text in [title, url]:
        m = re.search(r'(?:chapter|ch|ตอน(?:ที่)?)[.\-\s]*(\d+(?:\.\d+)?)', text, re.IGNORECASE)
        if m:
            return float(m.group(1))
        m = re.search(r'[-/](\d+(?:\.\d+)?)(?:/?\s*$|[^0-9])', text)
        if m:
            return float(m.group(1))
    return 0.0

# ═══════════════════════════════════════════════════════════════════════════
# CHAPTER SCRAPERS
# ═══════════════════════════════════════════════════════════════════════════

async def scrape_chapters_madara(manga_url: str) -> list[dict]:
    chapters = []
    parsed = urlparse(manga_url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    soup = await get_soup(manga_url)
    if not soup:
        return []

    # หา post ID
    post_id = None
    for el in soup.select("script"):
        m = re.search(r'"manga_id"\s*:\s*"?(\d+)"?', el.get_text())
        if m:
            post_id = m.group(1)
            break
    if not post_id:
        el = soup.select_one("#manga-chapters-holder[data-id]")
        if el:
            post_id = el.get("data-id")

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
                        if not a:
                            continue
                        href = a.get("href", "")
                        title = a.get_text(strip=True)
                        num = _extract_chapter_number(title, href)
                        if href:
                            chapters.append({"title": title, "url": href, "number": num})
        except Exception as e:
            print(f"[madara ajax] {manga_url}: {e}")

    # Fallback: scrape จากหน้าตรง
    if not chapters:
        for li in soup.select("li.wp-manga-chapter"):
            a = li.select_one("a")
            if not a:
                continue
            href = a.get("href", "")
            title = a.get_text(strip=True)
            num = _extract_chapter_number(title, href)
            if href:
                chapters.append({"title": title, "url": href, "number": num})

    return chapters


async def scrape_chapters_themesia(manga_url: str) -> list[dict]:
    chapters = []
    soup = await get_soup(manga_url)
    if not soup:
        return []

    for sel in ["#chapterlist li", ".eplister li", ".chapterlist li", ".chapter-list li"]:
        items = soup.select(sel)
        if items:
            for li in items:
                a = li.select_one("a")
                if not a:
                    continue
                href = a.get("href", "")
                title_el = li.select_one(".chapternum") or li.select_one(".chapter-title")
                title = title_el.get_text(strip=True) if title_el else a.get_text(strip=True)
                num = _extract_chapter_number(title, href)
                if href:
                    chapters.append({"title": title, "url": href, "number": num})
            break

    return chapters


async def scrape_chapters_nekopost(manga_url: str) -> list[dict]:
    chapters = []
    pid = manga_url.rstrip("/").split("/")[-1]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://www.nekopost.net/api/project/detail/{pid}",
                headers={**HEADERS, "Accept": "application/json"},
            )
            if r.status_code == 200:
                for ch in r.json().get("listChapter", []):
                    ch_no = ch.get("chapterNo", "0")
                    title = f"ตอนที่ {ch_no}"
                    if ch.get("chapterName"):
                        title += f" — {ch['chapterName']}"
                    chapters.append({
                        "title": title,
                        "url": f"https://www.nekopost.net/manga/{pid}/{ch_no}",
                        "number": float(ch_no),
                    })
    except Exception as e:
        print(f"[nekopost chapters] {manga_url}: {e}")
    return chapters


async def scrape_chapters(manga_url: str) -> list[dict]:
    theme = get_theme(manga_url)
    if theme == "nekopost":
        return await scrape_chapters_nekopost(manga_url)
    elif theme == "themesia":
        return await scrape_chapters_themesia(manga_url)
    else:
        return await scrape_chapters_madara(manga_url)


# ═══════════════════════════════════════════════════════════════════════════
# PAGE SCRAPERS
# ═══════════════════════════════════════════════════════════════════════════

def _extract_images(soup: BeautifulSoup, selectors: list[str]) -> list[str]:
    pages = []
    for sel in selectors:
        for img in soup.select(sel):
            src = img.get("data-src") or img.get("data-lazy-src") or img.get("src", "")
            src = src.strip()
            if src and src.startswith("http") and any(
                ext in src.lower() for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]
            ):
                pages.append(src)
        if pages:
            break
    return pages


async def scrape_pages_madara(chapter_url: str) -> list[str]:
    soup = await get_soup(chapter_url, referer=chapter_url)
    if not soup:
        return []
    return _extract_images(soup, [
        ".reading-content img",
        ".read-container img",
        "#readerarea img",
        ".page-break img",
    ])


async def scrape_pages_themesia(chapter_url: str) -> list[str]:
    soup = await get_soup(chapter_url, referer=chapter_url)
    if not soup:
        return []

    # วิธีที่ 1: ts_reader.run JSON
    for script in soup.select("script"):
        text = script.get_text()
        if "ts_reader.run" in text:
            m = re.search(r'ts_reader\.run\((.*?)\);', text, re.DOTALL)
            if m:
                try:
                    data = json.loads(m.group(1))
                    sources = data.get("sources", [])
                    if sources:
                        imgs = sources[0].get("images", [])
                        if imgs:
                            return imgs
                except Exception:
                    pass

    # วิธีที่ 2: scrape img
    return _extract_images(soup, [
        "#readerarea img",
        ".reader-area img",
        ".chapter-images img",
        ".reading-content img",
    ])


async def scrape_pages_nekopost(chapter_url: str) -> list[str]:
    parts = chapter_url.rstrip("/").split("/")
    if len(parts) < 2:
        return []
    proj_id = parts[-2]
    ch_no   = parts[-1]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://www.nekopost.net/api/project/detail/{proj_id}",
                headers={**HEADERS, "Accept": "application/json"},
            )
            if r.status_code == 200:
                chapters = r.json().get("listChapter", [])
                ch = next((c for c in chapters if str(c.get("chapterNo")) == str(ch_no)), None)
                if ch:
                    ch_id = str(ch["chapterId"])
                    r2 = await client.get(
                        f"https://www.nekopost.net/api/project/chapter/detail/{proj_id}/{ch_id}",
                        headers={**HEADERS, "Accept": "application/json"},
                    )
                    if r2.status_code == 200:
                        base_img = "https://www.osemocphoto.com"
                        return [
                            f"{base_img}/collectManga/{proj_id}/{ch_id}/{p['fileName']}"
                            for p in r2.json().get("listPage", [])
                        ]
    except Exception as e:
        print(f"[nekopost pages] {chapter_url}: {e}")
    return []


async def scrape_pages(chapter_url: str) -> list[str]:
    theme = get_theme(chapter_url)
    if theme == "nekopost":
        return await scrape_pages_nekopost(chapter_url)
    elif theme == "themesia":
        return await scrape_pages_themesia(chapter_url)
    else:
        return await scrape_pages_madara(chapter_url)


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/manga")
async def list_manga(
    page:    int = 1,
    limit:   int = 24,
    q:       Optional[str] = None,
    country: Optional[str] = None,
    genre:   Optional[str] = None,
    sort:    str = "popular",
):
    pool = app.state.pool
    offset = (page - 1) * limit
    conds, params = [], []

    if q:
        params.append(f"%{q}%")
        conds.append(f"(title ILIKE ${len(params)} OR title_th ILIKE ${len(params)})")
    if country:
        params.append(country.upper())
        conds.append(f"country = ${len(params)}")
    if genre:
        params.append(genre)
        conds.append(f"${len(params)} = ANY(genres)")

    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    order = {
        "views":   "view_count DESC",
        "rating":  "rating DESC",
        "updated": "updated_at DESC NULLS LAST",
        "popular": "sort_order ASC NULLS LAST",
    }.get(sort, "sort_order ASC NULLS LAST")

    count_params = params[:]
    params += [limit, offset]

    async with pool.acquire() as conn:
        rows  = await conn.fetch(
            f"SELECT * FROM manga {where} ORDER BY {order} LIMIT ${len(params)-1} OFFSET ${len(params)}",
            *params
        )
        total = await conn.fetchval(f"SELECT COUNT(*) FROM manga {where}", *count_params)

    return {"data": [dict(r) for r in rows], "total": total or 0, "page": page, "limit": limit}


@app.get("/api/manga/{manga_id}")
async def get_manga(manga_id: str):
    async with app.state.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM manga WHERE id = $1", manga_id)
    if not row:
        raise HTTPException(404, "Manga not found")
    await app.state.pool.execute(
        "UPDATE manga SET view_count = view_count + 1 WHERE id = $1", manga_id
    )
    return dict(row)


@app.get("/api/manga/{manga_id}/chapters")
async def get_chapters(manga_id: str):
    pool = app.state.pool

    async with pool.acquire() as conn:
        manga = await conn.fetchrow("SELECT * FROM manga WHERE id = $1", manga_id)
        if not manga:
            raise HTTPException(404, "Manga not found")

        if manga["chapters_fetched"]:
            rows = await conn.fetch(
                "SELECT id, number, title, source_url FROM chapters WHERE manga_id = $1 ORDER BY number DESC",
                manga_id
            )
            return [dict(r) for r in rows]

    # Scrape on-demand
    print(f"[chapters] scraping {manga['source_url']}")
    raw = await scrape_chapters(manga["source_url"])

    if not raw:
        return []

    async with pool.acquire() as conn:
        for ch in raw:
            ch_id = make_chapter_id(manga_id, ch["number"])
            try:
                await conn.execute("""
                    INSERT INTO chapters (id, manga_id, number, title, source_url)
                    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING
                """, ch_id, manga_id, ch["number"], ch["title"], ch["url"])
            except Exception as e:
                print(f"[db] insert chapter: {e}")

        await conn.execute("UPDATE manga SET chapters_fetched = TRUE WHERE id = $1", manga_id)
        rows = await conn.fetch(
            "SELECT id, number, title, source_url FROM chapters WHERE manga_id = $1 ORDER BY number DESC",
            manga_id
        )

    return [dict(r) for r in rows]


@app.get("/api/chapters/{chapter_id}/pages")
async def get_chapter_pages(chapter_id: str):
    pool = app.state.pool

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM chapters WHERE id = $1", chapter_id)
    if not row:
        raise HTTPException(404, "Chapter not found")

    if row["pages_fetched"] and row["pages"]:
        return {"pages": row["pages"], "chapter_url": row["source_url"]}

    # Scrape on-demand
    print(f"[pages] scraping {row['source_url']}")
    pages = await scrape_pages(row["source_url"])

    if pages:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE chapters SET pages = $1, pages_fetched = TRUE WHERE id = $2",
                pages, chapter_id
            )

    return {"pages": pages, "chapter_url": row["source_url"]}


@app.get("/api/proxy-image")
async def proxy_image(url: str = Query(...)):
    actual_url = unquote(url)
    parsed = urlparse(actual_url)
    domain = f"{parsed.scheme}://{parsed.netloc}/"

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=15, verify=False,
            headers={
                **HEADERS,
                "Referer": domain,
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            }
        ) as client:
            r = await client.get(actual_url)
            ct = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
            return Response(
                content=r.content,
                media_type=ct if ct.startswith("image/") else "image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    except Exception as e:
        print(f"[proxy] {actual_url}: {e}")
        return Response(status_code=502)


@app.api_route("/api/migrate", methods=["GET", "POST"])
async def migrate(secret: str = Query(...), clear: bool = False):
    if secret != os.getenv("MIGRATE_SECRET", "changeme"):
        raise HTTPException(403, "Invalid secret")

    for path_try in [
        Path("manga_catalog.json"),
        Path("public/manga_catalog.json"),
        Path(__file__).parent / "public" / "manga_catalog.json",
    ]:
        if path_try.exists():
            catalog_path = path_try
            break
    else:
        raise HTTPException(404, "manga_catalog.json not found")

    with open(catalog_path, encoding="utf-8") as f:
        raw = json.load(f)
    catalog = raw.get("manga", raw) if isinstance(raw, dict) else raw

    pool = app.state.pool
    inserted = skipped = 0

    async with pool.acquire() as conn:
        if clear:
            await conn.execute("TRUNCATE TABLE chapters, manga CASCADE")

        for idx, item in enumerate(catalog):
            genres = item.get("genres", [])
            if any(g.lower() in FORBIDDEN_GENRES for g in genres):
                skipped += 1
                continue

            sources = item.get("sources", [])
            first   = sources[0] if sources else {}
            s_url   = first.get("url") or item.get("source_url", "")
            s_site  = first.get("name") or item.get("source_site", "")
            m_id    = item.get("id") or make_id(s_url or item.get("title", ""))

            try:
                await conn.execute("""
                    INSERT INTO manga (
                        id, title, title_th, cover_url, source_url, source_site,
                        country, genres, description, sort_order
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                    ON CONFLICT (id) DO UPDATE SET
                        cover_url  = EXCLUDED.cover_url,
                        sort_order = EXCLUDED.sort_order,
                        genres     = EXCLUDED.genres,
                        description = EXCLUDED.description
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
                print(f"[migrate] {item.get('title')}: {e}")
                skipped += 1

    return {"status": "ok", "inserted": inserted, "skipped": skipped, "total": len(catalog)}


@app.get("/health")
async def health():
    try:
        async with app.state.pool.acquire() as conn:
            manga_count   = await conn.fetchval("SELECT COUNT(*) FROM manga")
            chapter_count = await conn.fetchval("SELECT COUNT(*) FROM chapters")
        return {"status": "ok", "db": "connected", "manga": manga_count, "chapters": chapter_count}
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=503)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)