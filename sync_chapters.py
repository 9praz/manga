"""
sync_chapters.py
รัน script นี้บนเครื่องของคุณ (ไม่ใช่ Railway)
จะ scrape chapters จากทุกเว็บแล้วส่งขึ้น Railway DB

Usage:
    python sync_chapters.py              # scrape ทุกเรื่อง
    python sync_chapters.py --limit 50   # scrape แค่ 50 เรื่องแรก
    python sync_chapters.py --reset      # ล้าง cache แล้ว scrape ใหม่
"""
import asyncio, sys, re, json, hashlib, argparse
from urllib.parse import urlparse
import httpx
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# ── Config ─────────────────────────────────────────────────
API_BASE = "https://manga-production-6994.up.railway.app"
SECRET   = "changeme"   # เปลี่ยนถ้า MIGRATE_SECRET ใน Railway ต่างออกไป

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
}

NEKO_BASE = "https://www.nekopost.net"
NEKO_IMG  = "https://www.osemocphoto.com"

SITE_THEMES = {
    "catzaa.com":"madara","doodmanga.com":"madara","manhuabug.com":"madara",
    "manhuakey.com":"madara","manhuathai.com":"madara","manhwabreakup.com":"madara",
    "mangalami.com":"themesia","makimaaaaa.com":"themesia","manga1688.com":"themesia",
    "mangakimi.com":"themesia","mangastep.com":"themesia","moon-toon.com":"themesia",
    "one-manga.com":"themesia","popsmanga.com":"themesia","reapertrans.com":"themesia",
    "speed-manga.com":"themesia","tanuki-manga.com":"themesia","toomtam-manga.com":"themesia",
    "nekopost.net":"nekopost",
}

def get_theme(url):
    for domain, theme in SITE_THEMES.items():
        if domain in url: return theme
    return "madara"

def make_chapter_id(manga_id, number):
    return hashlib.md5(f"{manga_id}_{number}".encode()).hexdigest()[:16]

def extract_number(text, url=""):
    for pat in [
        r'(?:chapter|ch|chap|ep|ตอนที่|ตอน)[.\s\-_]*(\d+(?:\.\d+)?)',
        r'[-/](\d+(?:\.\d+)?)(?:[-/]|$)',
        r'(\d+(?:\.\d+)?)',
    ]:
        m = re.search(pat, text, re.I)
        if m: return float(m.group(1))
    return 0.0

# ── Scrapers ────────────────────────────────────────────────
async def scrape_madara(session, manga_id, source_url):
    soup = None
    ajax = source_url.rstrip('/') + '/ajax/chapters/'
    try:
        r = await session.post(ajax, headers={**HEADERS,'X-Requested-With':'XMLHttpRequest','Referer':source_url},
                               impersonate="chrome120", timeout=20)
        if r.status_code == 200 and len(r.text.strip()) > 100:
            soup = BeautifulSoup(r.text, 'html.parser')
    except: pass

    if not soup:
        try:
            r = await session.get(source_url, headers=HEADERS, impersonate="chrome120", timeout=20)
            soup = BeautifulSoup(r.text, 'html.parser')
        except: return []

    SELECTORS = [
        'li.wp-manga-chapter a', 'li.a-h.wleft a', '.chapter-item a',
        '.eplister li a', '.eplisterfull li a', '.bxcl li a',
        'ul.clstyle li a', '#chapter_list li a',
    ]
    chapters, seen = [], set()
    for sel in SELECTORS:
        for a in soup.select(sel):
            url = (a.get('href') or '').strip()
            if not url or url in seen: continue
            if not re.search(r'/chapter[-/]?\d|/\d+/?$', url, re.I): continue
            seen.add(url)
            title = a.get_text(strip=True)
            num = extract_number(title, url)
            chapters.append({'id': make_chapter_id(manga_id, num),
                             'number': num, 'title': title or f'Chapter {int(num)}',
                             'source_url': url})
        if chapters: break
    chapters.sort(key=lambda x: x['number'], reverse=True)
    return chapters

async def scrape_nekopost(session, manga_id, source_url):
    pid = source_url.rstrip('/').split('/')[-1]
    hdrs = {**HEADERS, 'Referer': NEKO_BASE+'/', 'Accept': 'application/json'}
    try:
        r = await session.get(f"{NEKO_BASE}/api/as/m/project/{pid}/chapter-list",
                              headers=hdrs, timeout=20)
        if r.status_code == 200:
            data = r.json()
            ch_list = data.get('listChapter') or (data if isinstance(data, list) else [])
            chapters = []
            for ch in ch_list:
                num = float(ch.get('chapterNo', 0) or 0)
                if num == 0: continue
                num_str = str(int(num)) if num == int(num) else str(num)
                chapters.append({'id': make_chapter_id(manga_id, num),
                                 'number': num, 'title': f'ตอนที่ {num_str}',
                                 'source_url': f"{NEKO_BASE}/manga/{pid}/{num_str}/0"})
            chapters.sort(key=lambda x: x['number'], reverse=True)
            return chapters
    except: pass
    return []

# ── Upload to Railway ───────────────────────────────────────
async def upload_chapters(client: httpx.AsyncClient, manga_id, chapters):
    """ส่ง chapters ขึ้น Railway ผ่าน ingest endpoint"""
    if not chapters: return 0
    try:
        r = await client.post(
            f"{API_BASE}/api/ingest-chapters",
            json={"manga_id": manga_id, "chapters": chapters, "secret": SECRET},
            timeout=30,
        )
        if r.status_code == 200:
            return r.json().get("inserted", 0)
    except Exception as e:
        print(f"    ⚠️  Upload error: {e}")
    return 0

# ── Main ────────────────────────────────────────────────────
async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="จำนวนเรื่องที่จะ scrape (0 = ทั้งหมด)")
    parser.add_argument("--reset", action="store_true", help="ล้าง chapters cache ก่อน scrape")
    args = parser.parse_args()

    # ล้าง cache ถ้าต้องการ
    if args.reset:
        async with httpx.AsyncClient() as c:
            r = await c.get(f"{API_BASE}/api/reset-chapters-cache?secret={SECRET}", timeout=30)
            print(f"🗑️  Reset cache: {r.json()}")

    # โหลด manga list จาก Railway
    print("📋 โหลดรายชื่อมังงะจาก Railway...")
    all_manga = []
    async with httpx.AsyncClient() as c:
        page = 1
        while True:
            r = await c.get(f"{API_BASE}/api/manga?page={page}&limit=100", timeout=30)
            data = r.json()
            items = data.get("data", [])
            if not items: break
            all_manga.extend(items)
            if len(all_manga) >= data.get("total", 0): break
            page += 1

    if args.limit:
        all_manga = all_manga[:args.limit]

    print(f"📚 พบมังงะ {len(all_manga)} เรื่อง\n")

    success, failed, skipped = 0, 0, 0

    async with AsyncSession() as scrape_session, httpx.AsyncClient() as upload_client:
        for i, manga in enumerate(all_manga, 1):
            mid = manga["id"]
            title = manga["title"][:40]
            source_url = manga.get("source_url", "")
            theme = get_theme(source_url)

            print(f"[{i:3d}/{len(all_manga)}] {title:<42} [{theme}]", end=" ", flush=True)

            if not source_url:
                print("⏭️  ไม่มี source_url")
                skipped += 1
                continue

            try:
                if theme == "nekopost":
                    chapters = await scrape_nekopost(scrape_session, mid, source_url)
                else:
                    chapters = await scrape_madara(scrape_session, mid, source_url)

                if chapters:
                    n = await upload_chapters(upload_client, mid, chapters)
                    print(f"✅ {len(chapters)} ตอน (บันทึก {n})")
                    success += 1
                else:
                    print("❌ ไม่พบตอน")
                    failed += 1
            except Exception as e:
                print(f"💥 {e}")
                failed += 1

            await asyncio.sleep(0.5)  # ไม่ให้ spam เว็บเร็วเกินไป

    print(f"\n{'─'*60}")
    print(f"✅ สำเร็จ: {success}  ❌ ล้มเหลว: {failed}  ⏭️ ข้าม: {skipped}")
    print(f"🎉 เสร็จแล้ว! เปิด localhost:3000 แล้วลองอ่านได้เลยครับ")

if __name__ == "__main__":
    asyncio.run(main())
