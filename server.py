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

            CREATE INDEX IF NOT EXISTS idx_chapters_manga_id ON chapters(manga_id);
            CREATE INDEX IF NOT EXISTS idx_manga_country     ON manga(country);
            CREATE INDEX IF NOT EXISTS idx_manga_rating      ON manga(rating DESC);
            CREATE INDEX IF NOT EXISTS idx_manga_view_count  ON manga(view_count DESC);
        """)

def make_id(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]

@app.get("/api/manga")
async def list_manga(
    country: Optional[str] = None,
    genre:   Optional[str] = None,
    status:  Optional[str] = None,
    sort:    str = "updated",
    q:       Optional[str] = None,
    page:    int = 1,
    limit:   int = 24,
):
    pool: asyncpg.Pool = app.state.pool
    offset = (page - 1) * limit

    conditions = []
    params = []

    if country:
        params.append(country.upper())
        conditions.append(f"country = ${len(params)}")

    if genre:
        params.append(genre)
        conditions.append(f"${len(params)} = ANY(genres)")

    if status:
        params.append(status)
        conditions.append(f"status = ${len(params)}")

    if q:
        params.append(f"%{q}%")
        conditions.append(f"(title ILIKE ${len(params)} OR title_th ILIKE ${len(params)})")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    order_map = {
        "updated": "updated_at DESC NULLS LAST",
        "rating":  "rating DESC",
        "views":   "view_count DESC",
    }
    order = order_map.get(sort, "updated_at DESC NULLS LAST")

    params += [limit, offset]
    query = f"""
        SELECT id, title, title_th, cover_url, source_url, source_site,
               country, status, genres, rating, view_count, updated_at
        FROM manga
        {where}
        ORDER BY {order}
        LIMIT ${len(params)-1} OFFSET ${len(params)}
    """

    count_query = f"SELECT COUNT(*) FROM manga {where}"

    async with pool.acquire() as conn:
        rows  = await conn.fetch(query, *params)
        total = await conn.fetchval(count_query, *params[:-2])

    return {
        "data":  [dict(r) for r in rows],
        "total": total,
        "page":  page,
        "limit": limit,
    }


@app.get("/api/manga/{manga_id}")
async def get_manga(manga_id: str):
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM manga WHERE id = $1", manga_id)
    if not row:
        raise HTTPException(404, "Manga not found")
    return dict(row)


@app.get("/api/manga/{manga_id}/chapters")
async def get_chapters(manga_id: str):
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT 1 FROM manga WHERE id = $1", manga_id)
        if not exists:
            raise HTTPException(404, "Manga not found")

        rows = await conn.fetch("""
            SELECT id, number, title, source_url, published_at
            FROM chapters
            WHERE manga_id = $1
            ORDER BY number DESC
        """, manga_id)

    return [dict(r) for r in rows]


@app.get("/api/chapters/{chapter_id}/pages")
async def get_pages(chapter_id: str, background_tasks: BackgroundTasks):
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, source_url, pages FROM chapters WHERE id = $1", chapter_id
        )
    if not row:
        raise HTTPException(404, "Chapter not found")

    if row["pages"]:
        return {"pages": row["pages"]}

    pages = await scrape_chapter_pages(row["source_url"])
    if pages:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE chapters SET pages = $1 WHERE id = $2",
                pages, chapter_id
            )
    return {"pages": pages}


async def scrape_chapter_pages(source_url: str) -> list[str]:
    return []


@app.get("/api/proxy-image")
async def proxy_image(url: str):
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    actual_url = unquote(url)
    parsed_uri = urlparse(actual_url)
    domain = f"{parsed_uri.scheme}://{parsed_uri.netloc}/"
    
    async with httpx.AsyncClient(verify=False) as client:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": domain,
                "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
            }
            response = await client.get(actual_url, headers=headers, timeout=10.0, follow_redirects=True)
            
            if response.status_code != 200:
                return Response(status_code=response.status_code)
            
            return Response(
                content=response.content,
                media_type=response.headers.get("content-type", "image/jpeg")
            )
        except Exception as e:
            return Response(status_code=500)


@app.api_route("/api/migrate", methods=["GET", "POST"])
async def migrate_from_json(secret: str = Query(...)):
    if secret != os.getenv("MIGRATE_SECRET", "changeme"):
        raise HTTPException(403, "Invalid secret")

    catalog_path = Path(__file__).parent / "public" / "manga_catalog.json"
    if not catalog_path.exists():
        raise HTTPException(404, "manga_catalog.json not found")

    with open(catalog_path, encoding="utf-8") as f:
        data = json.load(f)
        catalog: list[dict] = data.get("manga") or data.get("items") or data.get("results") or data
        
    pool: asyncpg.Pool = app.state.pool
    inserted = 0
    skipped  = 0

    async with pool.acquire() as conn:
        for item in catalog:
            first_source = item.get("sources", [{}])[0] if item.get("sources") else {}
            source_url = item.get("source_url") or item.get("url") or first_source.get("url")
            source_site = item.get("source_site") or item.get("source") or first_source.get("name")
            
            manga_id = item.get("id") or make_id(source_url or item.get("title", ""))
            
            cover_img = item.get("cover") or item.get("cover_url") or item.get("thumbnail")
            desc_text = item.get("desc") or item.get("description")
            
            try:
                await conn.execute("""
                    INSERT INTO manga (
                        id, title, title_th, cover_url, source_url, source_site,
                        country, status, genres, description, rating, view_count, updated_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                    ON CONFLICT (id) DO UPDATE SET
                        title       = EXCLUDED.title,
                        cover_url   = EXCLUDED.cover_url,
                        source_url  = EXCLUDED.source_url,
                        source_site = EXCLUDED.source_site,
                        description = EXCLUDED.description,
                        genres      = EXCLUDED.genres,
                        updated_at  = EXCLUDED.updated_at
                """,
                    manga_id,
                    item.get("title", ""),
                    item.get("title_th"),
                    cover_img,
                    source_url,
                    source_site,
                    (item.get("country") or "JP").upper(),
                    item.get("status", "ongoing"),
                    item.get("genres") or [],
                    desc_text,
                    float(item.get("rating") or 0),
                    int(item.get("view_count") or item.get("views") or 0),
                    item.get("updated_at"),
                )
                inserted += 1
            except Exception as e:
                print(f"Error inserting {item.get('title')}: {e}")
                skipped += 1

    return {"inserted": inserted, "skipped": skipped, "total": len(catalog)}


@app.get("/health")
async def health():
    try:
        async with app.state.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return JSONResponse({"status": "error", "db": str(e)}, status_code=503)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)