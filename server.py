import asyncio
import sys
import logging
import re
import json
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession
from urllib.parse import urlparse
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AllInOneManga")

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

async def _fetch(url: str, is_api=False):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json" if is_api else "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7"
    }
    async with AsyncSession() as session:
        try:
            return await session.get(url, headers=headers, impersonate="chrome120", timeout=20)
        except Exception as e:
            logger.error(f"💥 Fetch Error: {e}")
            return None

async def _fetch_zeist_chapters(manga_url: str, session: AsyncSession) -> list:
    chapters = []
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    r = await session.get(manga_url, headers=headers, impersonate="chrome120", timeout=20)
    if not r or not r.text:
        return chapters

    soup = BeautifulSoup(r.text, "html.parser")

    # ── ชั้น A: ดึงจาก JSON ที่ฝังใน <script>
    for script in soup.find_all("script"):
        raw = script.string or ""
        for pattern in [
            r'(?:var\s+)?chapterList\s*=\s*(\[.*?\])\s*;',
            r'(?:var\s+)?chapters\s*=\s*(\[.*?\])\s*;',
            r'"chapter_list"\s*:\s*(\[.*?\])',
            r'\"chapters\"\s*:\s*(\[.*?\])',
        ]:
            m = re.search(pattern, raw, re.S)
            if m:
                try:
                    data = json.loads(m.group(1))
                    for item in data:
                        url_val = item.get("url") or item.get("link") or item.get("href") or ""
                        title_val = (item.get("title") or item.get("name") or
                                     item.get("chapter") or item.get("label") or "")
                        if url_val and "http" in url_val:
                            chapters.append({"title": str(title_val), "url": url_val})
                    if chapters:
                        logger.info(f"✅ Zeist JSON script found: {len(chapters)} chapters")
                        return chapters
                except:
                    pass

    # ── ชั้น B: JSON-LD
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            for key in ["hasPart", "episode", "chapter"]:
                parts = data.get(key, [])
                if isinstance(parts, list):
                    for part in parts:
                        u = part.get("url") or part.get("@id") or ""
                        t = part.get("name") or part.get("headline") or ""
                        if u and "http" in u:
                            chapters.append({"title": t, "url": u})
            if chapters:
                logger.info(f"✅ JSON-LD found: {len(chapters)} chapters")
                return chapters
        except:
            pass

    # ── ชั้น C: Blogger/Atom Feed
    parsed = urlparse(manga_url)
    manga_slug = parsed.path.strip("/").split("/")[-1]
    feed_urls = [
        f"{parsed.scheme}://{parsed.netloc}/feeds/posts/default/-/{manga_slug}?alt=json&max-results=500",
        f"{parsed.scheme}://{parsed.netloc}/feeds/posts/default?alt=json&max-results=500&q={manga_slug}",
    ]
    for feed_url in feed_urls:
        try:
            rf = await session.get(feed_url, headers={**headers, "Accept": "application/json"},
                                   impersonate="chrome120", timeout=15)
            if rf and rf.status_code == 200:
                feed_data = rf.json()
                entries = feed_data.get("feed", {}).get("entry", [])
                for entry in entries:
                    title = entry.get("title", {}).get("$t", "")
                    links = entry.get("link", [])
                    href = next((l.get("href", "") for l in links if l.get("rel") == "alternate"), "")
                    if href and "http" in href:
                        chapters.append({"title": title, "url": href})
                if chapters:
                    logger.info(f"✅ Blogger Feed found: {len(chapters)} chapters")
                    return chapters
        except Exception as e:
            logger.warning(f"Feed fetch error: {e}")

    # ── ชั้น D: Zeist/Blogspot selectors
    zeist_selectors = [
        ".chapter-list li a", ".episodelist a", ".eps-item a",
        "ul.episodelist li a", "#chapter-list a", ".chapterlist a",
        "div.eplister li a", "div.bixbox.bxcl li a",
        ".ls-title a", "li.ep-item a", ".lchx a",
        "a[href*='/chapter/']", "a[href*='/ch-']", "a[href*='-chapter-']",
    ]
    for sel in zeist_selectors:
        for a in soup.select(sel):
            href = a.get("href", "")
            title = a.get_text(strip=True)
            if href and "http" in href and title and href not in [c['url'] for c in chapters]:
                chapters.append({"title": title, "url": href})
        if chapters:
            logger.info(f"✅ Zeist selector [{sel}] found: {len(chapters)} chapters")
            return chapters

    return chapters


@app.get("/api/chapters")
async def get_chapters(manga_url: str):
    chapters = []

    # 🐈 ค่าย Nekopost
    if "nekopost.net" in manga_url:
        project_id = manga_url.strip("/").split("/")[-1]
        r = await _fetch(f"https://api.osemocphoto.com/frontAPI/getProjectInfo/{project_id}/th", is_api=True)
        if r and r.status_code == 200:
            data = r.json()
            for ch in data.get("chapterList", []):
                chapters.append({
                    "title": f"Ep. {ch['chapterNo']} {ch.get('chapterName', '')}".strip(),
                    "url": f"https://www.nekopost.net/manga/{project_id}/{ch['chapterId']}"
                })
        return {"chapters": chapters}

    async with AsyncSession() as session:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        r = await session.get(manga_url, headers=headers, impersonate="chrome120", timeout=20)

        if r and r.text:
            soup = BeautifulSoup(r.text, "html.parser")

            # 🎯 ชั้นที่ 1: selector มาตรฐาน
            selectors = [
                "#chapterlist a", ".eplister a", ".wp-manga-chapter > a", ".page-item-detail > a",
                ".listing-chapters_wrap a", "ul.main li a", ".chapter-list a", ".chbox a",
                ".main-version a", ".chapter-title a", ".eplister ul li a"
            ]
            for sel in selectors:
                for a in soup.select(sel):
                    href, title = a.get("href"), a.get_text(strip=True)
                    if href and title and "http" in href and href not in [c['url'] for c in chapters]:
                        chapters.append({"title": title, "url": href})

            # 🎯 ชั้นที่ 2: AJAX /ajax/chapters/
            if not chapters:
                ajax_url = manga_url.rstrip('/') + "/ajax/chapters/"
                r_ajax = await session.post(ajax_url, headers=headers, impersonate="chrome120")
                if r_ajax and r_ajax.status_code == 200:
                    soup_ajax = BeautifulSoup(r_ajax.text, "html.parser")
                    for a in soup_ajax.select(".wp-manga-chapter a, li a"):
                        href, title = a.get("href"), a.get_text(strip=True)
                        if href and title and "http" in href and href not in [c['url'] for c in chapters]:
                            chapters.append({"title": title, "url": href})

            # 🎯 ชั้นที่ 3: admin-ajax.php
            if not chapters:
                manga_id_tag = soup.select_one(
                    "#manga-chapters-holder, .wp-manga-action-button, input.rating-post-id, #wp-manga-current-manga, [data-post]"
                )
                # เพิ่ม: ดึงจาก div.bookmark[data-id] (รูปแบบของ manga1688.com)
                if not manga_id_tag:
                    manga_id_tag = soup.select_one("div.bookmark[data-id], div[class*='bookmark'][data-id]")

                manga_id = None
                if manga_id_tag:
                    manga_id = manga_id_tag.get("data-id") or manga_id_tag.get("value") or manga_id_tag.get("data-post")

                if manga_id:
                    # ⚡ ดึง ajaxUrl จาก ts_configs ก่อน (รองรับ subdomain เช่น www2.manga1688.com)
                    # ถ้าไม่มีค่อย fallback เป็น domain เดิม
                    admin_ajax_url = None
                    for script in soup.find_all("script"):
                        raw = script.string or ""
                        m = re.search(r'"ajaxUrl"\s*:\s*"([^"]+)"', raw)
                        if m:
                            admin_ajax_url = m.group(1).replace('\\/', '/')
                            logger.info(f"✅ Found ajaxUrl from ts_configs: {admin_ajax_url}")
                            break
                    if not admin_ajax_url:
                        p = urlparse(manga_url)
                        admin_ajax_url = f"{p.scheme}://{p.netloc}/wp-admin/admin-ajax.php"
                        logger.info(f"⚠️ ajaxUrl not found in script, fallback: {admin_ajax_url}")

                    r_ajax2 = await session.post(
                        admin_ajax_url,
                        data={"action": "manga_get_chapters", "manga": manga_id},
                        headers=headers, impersonate="chrome120"
                    )
                    if r_ajax2 and r_ajax2.status_code == 200:
                        soup_ajax2 = BeautifulSoup(r_ajax2.text, "html.parser")
                        for a in soup_ajax2.select("a"):
                            href, title = a.get("href"), a.get_text(strip=True)
                            if href and title and "http" in href and href not in [c['url'] for c in chapters]:
                                chapters.append({"title": title, "url": href})

            # 🆕 ชั้นที่ 4: Zeist/Blogger/Mangabooth
            if not chapters:
                logger.info(f"🔍 Trying Zeist/Blogger strategy for: {manga_url}")
                chapters = await _fetch_zeist_chapters(manga_url, session)

    def extract_num(t):
        match = re.search(r'(\d+(?:\.\d+)?)', t)
        return float(match.group(1)) if match else 0.0

    def clean_title(t):
        # ดึงเฉพาะ "Chapter X" หรือ "Ep. X" ออกมา ตัดขยะที่ซ้ำและวันที่ออก
        m = re.match(r'^((?:Chapter|Ep\.?|Episode|Vol\.?)\s*[\d.]+)', t.strip(), re.IGNORECASE)
        if m:
            return m.group(1).strip()
        # ลบวันที่
        t = re.sub(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+,\s+\d{4}', '', t)
        t = re.sub(r'\d{4}-\d{2}-\d{2}', '', t)
        t = t.strip()
        if len(t) > 60:
            t = t[:60].rsplit(' ', 1)[0]
        return t.strip('- ').strip()

    for c in chapters:
        c['title'] = clean_title(c['title'])

    chapters.sort(key=lambda x: extract_num(x['title']), reverse=True)
    return {"chapters": chapters}


@app.get("/api/images")
async def get_images(chapter_url: str):
    images = []

    # 🐈 Nekopost
    if "nekopost.net" in chapter_url:
        parts = chapter_url.strip("/").split("/")
        r = await _fetch(f"https://api.osemocphoto.com/frontAPI/getChapterDetail/{parts[-2]}/{parts[-1]}", is_api=True)
        if r and r.status_code == 200:
            data = r.json()
            images = [f"{data.get('host', '')}{p.get('pageName', '')}" for p in data.get("pageItem", [])]
        return {"images": images}

    r = await _fetch(chapter_url)
    if not r or not r.text:
        return {"images": []}

    # ⚡ ts_reader.run(...)
    json_match = re.search(r'ts_reader\.run\((.*?)\);', r.text, re.S)
    if json_match:
        raw_urls = re.findall(r'"(https?://[^"]+)"', json_match.group(1))
        for u in raw_urls:
            clean_url = u.replace('\\/', '/')
            if any(ext in clean_url.lower() for ext in ['.jpg', '.png', '.jpeg', '.webp']):
                if clean_url not in images:
                    images.append(clean_url)
        if images:
            return {"images": images}

    soup = BeautifulSoup(r.text, "html.parser")

    # 🆕 ดึงรูปจาก JSON ใน <script>
    for script in soup.find_all("script"):
        raw = script.string or ""
        for pattern in [
            r'(?:var\s+)?imageList\s*=\s*(\[.*?\])\s*;',
            r'(?:var\s+)?images\s*=\s*(\[.*?\])\s*;',
            r'"imageList"\s*:\s*(\[.*?\])',
            r'\"pages\"\s*:\s*(\[.*?\])',
            r'(?:var\s+)?pages\s*=\s*(\[.*?\])\s*;',
        ]:
            m = re.search(pattern, raw, re.S)
            if m:
                try:
                    data = json.loads(m.group(1))
                    for item in data:
                        if isinstance(item, str) and "http" in item:
                            if item not in images:
                                images.append(item)
                        elif isinstance(item, dict):
                            src = item.get("url") or item.get("src") or item.get("image") or ""
                            if src and "http" in src and src not in images:
                                images.append(src)
                    if images:
                        logger.info(f"✅ Found {len(images)} images from inline JSON")
                        return {"images": images}
                except:
                    pass

    # 🎯 selector มาตรฐาน + Zeist
    img_selectors = [
        ".reading-content img", ".wp-manga-chapter-img img", ".wp-manga-chapter-img",
        ".page-break img", "#readerarea img", ".entry-content img",
        "#image-container img", ".list-image-detail img", ".chapter-image img",
        "img.lazyload",
        "#Baca_Komik img", ".imgbox img", ".reader-area img",
        "#chapter-image img", ".chapter-content img", ".read-area img",
        "div#img-holder img", "#komik-image img",
    ]
    for sel in img_selectors:
        for img in soup.select(sel):
            src = (img.get("data-src") or img.get("data-lazy-src") or
                   img.get("data-cfsrc") or img.get("data-altsrc") or
                   img.get("data-original") or img.get("src"))
            if src and "http" in src:
                src = src.strip()
                if "logo" not in src.lower() and "banner" not in src.lower() and src not in images:
                    images.append(src)

    return {"images": images}


@app.get("/api/proxy_image")
async def proxy_image(url: str, source_url: str = None):
    clean_url = url.replace('\\/', '/')
    p_img = urlparse(clean_url)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Host": p_img.netloc,
        "Connection": "keep-alive"
    }

    async with AsyncSession() as session:
        strategies = []
        if source_url:
            p_src = urlparse(source_url)
            strategies.append({"Referer": source_url, "Origin": f"{p_src.scheme}://{p_src.netloc}"})
            domain_parts = p_src.netloc.split('.')
            if len(domain_parts) >= 2:
                root_domain = f"{p_src.scheme}://{domain_parts[-2]}.{domain_parts[-1]}"
                strategies.append({"Referer": f"{root_domain}/", "Origin": root_domain})

        img_base = f"{p_img.scheme}://{p_img.netloc}"
        strategies.append({"Referer": f"{img_base}/", "Origin": img_base})
        strategies.append({"Referer": "https://www.google.com/"})
        strategies.append({})

        for extra in strategies:
            current_headers = headers.copy()
            current_headers.update(extra)
            try:
                r = await session.get(clean_url, headers=current_headers, impersonate="chrome120", timeout=12)
                if r.status_code == 200:
                    return Response(content=r.content, media_type=r.headers.get("Content-Type", "image/jpeg"))
            except:
                continue

        return Response(status_code=403)


# 🔧 Debug endpoint - ใช้ตรวจสอบ HTML structure ของเว็บที่โหลดไม่ได้
@app.get("/api/debug")
async def debug_page(manga_url: str):
    async with AsyncSession() as session:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        r = await session.get(manga_url, headers=headers, impersonate="chrome120", timeout=20)
        soup = BeautifulSoup(r.text, "html.parser")

        results = {}

        for el in soup.find_all(attrs={"data-id": True}):
            key = f"data-id | {el.name} | class={' '.join(el.get('class', []))}"
            results[key] = el.get("data-id")

        for el in soup.find_all(attrs={"data-post": True}):
            key = f"data-post | {el.name} | class={' '.join(el.get('class', []))}"
            results[key] = el.get("data-post")

        for el in soup.find_all("input", type="hidden"):
            key = f"input hidden | id={el.get('id', '')} | name={el.get('name', '')}"
            results[key] = el.get("value", "")

        scripts_with_chapter = []
        for s in soup.find_all("script"):
            t = s.string or ""
            if "chapter" in t.lower() and len(t) > 50:
                scripts_with_chapter.append(t[:600])

        return {
            "status": r.status_code,
            "data_attrs": results,
            "chapter_scripts_preview": scripts_with_chapter[:3]
        }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

# ═══════════════════════════════════════════════════
# 🔍 CATALOG SEARCH API (ต้องรัน aggregator.py ก่อน)
# ═══════════════════════════════════════════════════
import os
from fastapi import Query as QParam

_catalog = []

def _load_catalog():
    global _catalog
    if os.path.exists("manga_catalog.json"):
        with open("manga_catalog.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            _catalog = data.get("manga", [])
        logger.info(f"✅ Catalog loaded: {len(_catalog)} titles")

def _normalize(t: str) -> str:
    import unicodedata
    t = t.lower().strip()
    t = unicodedata.normalize("NFKC", t)
    t = re.sub(r"[^a-z0-9ก-๙\u4e00-\u9fff\uac00-\ud7af\s]", "", t)
    return t

@app.on_event("startup")
async def on_startup():
    _load_catalog()

@app.get("/api/catalog/search")
async def catalog_search(q: str = QParam(""), limit: int = 50, page: int = 1):
    if not _catalog:
        return {"error": "Catalog ว่าง — รัน aggregator.py ก่อนครับ", "total": 0, "results": []}
    if not q.strip():
        start = (page - 1) * limit
        return {"total": len(_catalog), "page": page, "results": _catalog[start:start+limit]}
    q_n = _normalize(q)
    results = []
    for m in _catalog:
        t_n = _normalize(m["title"])
        if q_n == t_n:
            results.insert(0, m)
        elif q_n in t_n:
            results.append(m)
    return {"total": len(results), "query": q, "results": results[:limit]}

@app.get("/api/catalog/stats")
async def catalog_stats():
    src = {}
    multi = sum(1 for m in _catalog if len(m.get("sources", [])) > 1)
    for m in _catalog:
        for s in m.get("sources", []):
            src[s["name"]] = src.get(s["name"], 0) + 1
    return {"total": len(_catalog), "multi_source": multi,
            "by_source": dict(sorted(src.items(), key=lambda x: -x[1]))}

@app.get("/api/catalog/reload")
async def catalog_reload():
    _load_catalog()
    return {"ok": True, "total": len(_catalog)}
