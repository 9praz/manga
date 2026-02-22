"""
aggregator.py v4
✅ ตัดเว็บ 18+ ออกทั้งเว็บ (รวม mixed-adult)
✅ keyword filter ครอบคลุมภาษาไทยสะกดต่างๆ
✅ จำแนกประเภท: Manga(JP) / Manhwa(KR) / Manhua(CN) / Thai-Original
✅ เรียงตาม popularity (จำนวนแหล่งที่มา + genre weight)
✅ description จากหน้า detail
output: manga_catalog.json → copy ไปใน public/
"""
import asyncio, json, re, sys, unicodedata
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "th-TH,th;q=0.9,en;q=0.7",
}

# ═══════════════════════════════════════════════════════════
# 🔞 LAYER 1 — เว็บ 18+ และ mixed-adult: ตัดออกทั้งหมด
# ═══════════════════════════════════════════════════════════
SKIP_SITES = {
    # 18+ ทั้งเว็บ
    "EcchiDoujin", "GodDoujin", "DoujinLc", "DoujinZa",
    "NTRManga", "MikuDoujin", "Niceoppai",
    # mixed-adult (มีเนื้อหาผสม 18+ ปนอยู่มาก)
    "Cat300",           # มี Glory Hole, God Bless You (nude)
    "MangaLc",          # มีเนื้อหา ecchi/mature ปน
    "MangaIsekaiThai",  # บางส่วนมี mature content
}

# ═══════════════════════════════════════════════════════════
# 🔞 LAYER 2 — Title/URL keyword blacklist
# ครอบคลุมทั้ง EN, TH-romanized, TH-อาราบิก
# ═══════════════════════════════════════════════════════════
ADULT_TITLE_KW = {
    # English
    "doujin","hentai","18+","adult","r-18","r18","xxx","erotic","erotica",
    "smut","ntr","netorare","shotacon","lolicon","incest","rape","ahegao",
    "paizuri","futanari","femdom","bdsm","uncensor","ecchi","nsfw",
    "nude","naked","sex","porn","lewd","pervert","horny","boob","breast",
    "glory hole","god bless you",  # specific known titles
    # ภาษาไทย (สะกดตรง)
    "โดจิน","โป๊","อนาจาร","เอ็นทีอาร์","ผู้ใหญ่เท่านั้น",
    "ลามก","สื่อลามก","ลักเพศ","ข่มขืน","ล่วงละเมิด",
    # ภาษาไทย (สะกดอาราบิก / ทับศัพท์)
    "เฮนไต","เฮ็นไต","เอ็ตจิ","เอ็ทจิ","เอ็ดจิ","เอ็คจิ",
    "เอ็นทีอาร์","เอ็นทีอาร","เน็ทโอรา","เน็ตโตะราเระ",
    "ชอตะคอน","โชตะคอน","โลลิคอน","โลลิ","ล่วงประเวณี",
    "ฟุทานาริ","ฟุทานา","ยาโออิ","ยูริ","เฟ็มดอม",
    "อินเซ็สต์","อินเซส",
}

# ═══════════════════════════════════════════════════════════
# 🔞 LAYER 3 — Genre tag blacklist
# ═══════════════════════════════════════════════════════════
ADULT_GENRE_TAGS = {
    "hentai","ecchi","mature","adult","smut","18+","r-18","r18","nsfw",
    "ntr","netorare","yaoi","yuri","shotacon","lolicon",
    "incest","doujinshi","erotic","erotica","femdom","bdsm","nude",
    # ภาษาไทย
    "เฮนไต","เอ็ตจิ","ยาโออิ","ยูริ","โลลิคอน","โดจิน",
}

# ═══════════════════════════════════════════════════════════
# 🌍 Country classifier — ตรวจจาก tag/keyword
# ═══════════════════════════════════════════════════════════
COUNTRY_TAGS = {
    # JP
    "manga": "JP", "shounen": "JP", "shoujo": "JP", "seinen": "JP",
    "josei": "JP", "isekai": "JP",
    # KR
    "manhwa": "KR", "webtoon": "KR", "murim": "KR",
    # CN
    "manhua": "CN", "cultivation": "CN", "wuxia": "CN", "xianxia": "CN",
    "donghua": "CN",
    # ภาษาไทย
    "โชเน็น": "JP", "โชโจ": "JP", "เซย์เน็น": "JP",
    "มันฮวา": "KR", "เว็บตูน": "KR",
    "มันฮวา": "KR",
}

def classify_country(genres: list[str], title: str, sources: list[dict]) -> str:
    """ตรวจสอบประเทศต้นกำเนิด"""
    genres_lower = [g.lower() for g in genres]
    for g in genres_lower:
        if g in COUNTRY_TAGS:
            return COUNTRY_TAGS[g]
    # ตรวจจากชื่อเว็บต้นทาง
    source_names = {s["name"].lower() for s in sources}
    if any("manhwa" in n or "manhwa" in n for n in source_names):
        return "KR"
    if any("manhua" in n for n in source_names):
        return "CN"
    # ตรวจจากชื่อเรื่อง (Korean/Chinese characters)
    if re.search(r'[\uac00-\ud7af]', title):
        return "KR"
    if re.search(r'[\u4e00-\u9fff]', title):
        return "CN"
    return "JP"  # default

# ═══════════════════════════════════════════════════════════
# Genre mapping
# ═══════════════════════════════════════════════════════════
GENRE_MAP = {
    # TH → EN
    "ต่อสู้":"Action","แอคชั่น":"Action","ผจญภัย":"Adventure",
    "แฟนตาซี":"Fantasy","เหนือธรรมชาติ":"Supernatural",
    "มาร์เชียลอาร์ต":"Martial Arts","อิเซไก":"Isekai","เวทมนตร์":"Magic",
    "ไซไฟ":"Sci-Fi","หุ่นยนต์":"Mecha","ดราม่า":"Drama",
    "ตลก":"Comedy","คอมเมดี้":"Comedy","โรแมนติก":"Romance",
    "ลึกลับ":"Mystery","สยองขวัญ":"Horror","ระทึกขวัญ":"Thriller",
    "จิตวิทยา":"Psychological","ชีวิตประจำวัน":"Slice of Life",
    "กีฬา":"Sports","ชีวิตในโรงเรียน":"School Life",
    "ประวัติศาสตร์":"Historical","ทหาร":"Military",
    "ดนตรี":"Music","อาหาร":"Cooking","ทำอาหาร":"Cooking","เกม":"Game",
    "โชเน็น":"Shounen","โชโจ":"Shoujo","เซย์เน็น":"Seinen",
    "เกิดใหม่":"Reincarnation","วายร้าย":"Villainess",
    "มันฮวา":"Manhwa","มังฮวา":"Manhwa",
    "เว็บตูน":"Webtoon",
    # EN
    "action":"Action","adventure":"Adventure","fantasy":"Fantasy",
    "supernatural":"Supernatural","martial arts":"Martial Arts",
    "cultivation":"Cultivation","isekai":"Isekai","magic":"Magic",
    "sci-fi":"Sci-Fi","science fiction":"Sci-Fi","mecha":"Mecha",
    "drama":"Drama","comedy":"Comedy","romance":"Romance",
    "mystery":"Mystery","horror":"Horror","thriller":"Thriller",
    "psychological":"Psychological","slice of life":"Slice of Life",
    "sports":"Sports","school life":"School Life","historical":"Historical",
    "military":"Military","music":"Music","cooking":"Cooking","game":"Game",
    "harem":"Harem","shounen":"Shounen","shoujo":"Shoujo",
    "seinen":"Seinen","josei":"Josei",
    "manhwa":"Manhwa","manhua":"Manhua","manga":"Manga",
    "webtoon":"Webtoon","reincarnation":"Reincarnation",
    "regression":"Regression","system":"System","dungeon":"Dungeon",
    "leveling":"Leveling","hunter":"Hunter","villainess":"Villainess",
    "murim":"Murim","cyberpunk":"Cyberpunk","wuxia":"Wuxia",
    "xianxia":"Xianxia","gender bender":"Gender Bender",
    "gender-bender":"Gender Bender","genderbender":"Gender Bender",
}

GENRE_SKIP = {
    "th","en","all","new","update","completed","ongoing","latest","popular",
    "hot","read","more","chapter","vol","ep","episode","page","next","prev",
    "home","menu","search","login","register","thai","ไทย","translation","แปล",
}

def normalize_genres(raw: list[str]) -> list[str]:
    result = set()
    for g in raw:
        g = g.strip()
        if re.match(r'^[\d\s\.\-\/\+]+$', g):
            continue
        if len(g) < 2:
            continue
        key = g.lower()
        if key in GENRE_SKIP:
            continue
        if key in GENRE_MAP:
            result.add(GENRE_MAP[key])
        elif g.isascii() and len(g) >= 3 and not g[0].isdigit():
            result.add(g.title())
    return sorted(result)

def is_safe(title: str, url: str = "", genres: list = []) -> bool:
    combined = (title + " " + url).lower()
    for kw in ADULT_TITLE_KW:
        if kw in combined:
            return False
    genres_lower = {g.lower() for g in genres}
    if genres_lower & ADULT_GENRE_TAGS:
        return False
    return True

# ═══════════════════════════════════════════════════════════
# 🌐 เว็บที่ดึงได้ (ตัด 18+ ออกแล้ว)
# ═══════════════════════════════════════════════════════════
SITES = [
    # Madara (SFW only)
    {"name":"Catzaa",         "url":"https://catzaa.com",               "theme":"madara"},
    {"name":"Doodmanga",      "url":"https://www.doodmanga.com",        "theme":"madara"},
    {"name":"ManhuaBug",      "url":"https://www.manhuabug.com",        "theme":"madara"},
    {"name":"ManhuaKey",      "url":"https://www.manhuakey.com",        "theme":"madara"},
    {"name":"ManhuaThai",     "url":"https://www.manhuathai.com",       "theme":"madara"},
    {"name":"ManhwaBreakup",  "url":"https://www.manhwabreakup.com",    "theme":"madara"},
    # Themesia (SFW only)
    {"name":"LamiManga",      "url":"https://mangalami.com",            "theme":"themesia"},
    {"name":"Makimaaaaa",     "url":"https://makimaaaaa.com",           "theme":"themesia"},
    {"name":"Manga168",       "url":"https://manga1688.com",            "theme":"themesia"},
    {"name":"MangaKimi",      "url":"https://www.mangakimi.com",        "theme":"themesia"},
    {"name":"Mangastep",      "url":"https://mangastep.com",            "theme":"themesia"},
    {"name":"Moodtoon",       "url":"https://moon-toon.com",            "theme":"themesia"},
    {"name":"OneManga",       "url":"https://one-manga.com",            "theme":"themesia"},
    {"name":"PopsManga",      "url":"https://popsmanga.com",            "theme":"themesia"},
    {"name":"ReaperTrans",    "url":"https://reapertrans.com",          "theme":"themesia"},
    {"name":"Sodsaime",       "url":"https://www.xn--l3c0azab5a2gta.com","theme":"themesia"},
    {"name":"SpeedManga",     "url":"https://speed-manga.com",          "theme":"themesia"},
    {"name":"TanukiManga",    "url":"https://www.tanuki-manga.com",     "theme":"themesia"},
    {"name":"ToomTamManga",   "url":"https://toomtam-manga.com",        "theme":"themesia"},
    # Special
    {"name":"Nekopost",       "url":"https://www.nekopost.net",         "theme":"nekopost"},
    # 🔞 ข้ามทั้งหมด: EcchiDoujin, GodDoujin, DoujinLc, DoujinZa,
    #                 NTRManga, MikuDoujin, Niceoppai,
    #                 Cat300, MangaLc, MangaIsekaiThai
]

def norm_title(t: str) -> str:
    t = unicodedata.normalize("NFKC", t.lower().strip())
    return re.sub(r"[^a-z0-9ก-๙\u4e00-\u9fff\uac00-\ud7af]", "", t)

# ═══════════════════════════════════════════════════════════
# Genre extractor — ถูกต้อง ไม่ดึง .bt span
# ═══════════════════════════════════════════════════════════
def _card_genres(item) -> list[str]:
    for sel in [".genres a",".mgen a",".genre a",".wp-manga-tags-list a","a[rel='tag']",".cat-item a"]:
        found = [el.get_text(strip=True) for el in item.select(sel) if el.get_text(strip=True)]
        if found:
            return normalize_genres(found)
    return []

# ═══════════════════════════════════════════════════════════
# Item extractors
# ═══════════════════════════════════════════════════════════
def _extract_items(soup, base_url: str, source_name: str, sub_path="manga") -> list:
    results = []
    # Themesia .bsx
    for item in soup.select(".bsx"):
        a = item.select_one("a")
        if not a: continue
        title = (item.select_one(".tt") or item.select_one("h2") or a).get_text(strip=True)
        href = a.get("href","")
        img = item.select_one("img")
        cover = (img.get("data-src") or img.get("src","")) if img else ""
        if title and href:
            results.append({"title":title.strip(),"url":href,"cover":cover,
                            "source":source_name,"genres":_card_genres(item)})
    if results: return results
    # Madara .page-item-detail
    for item in soup.select(".page-item-detail, .c-image-hover"):
        a = item.select_one(f"a[href*='/{sub_path}/']") or item.select_one("a")
        if not a: continue
        title = a.get("title") or ""
        if not title:
            t_el = item.select_one(".post-title, h3")
            title = t_el.get_text(strip=True) if t_el else a.get_text(strip=True)
        href = a.get("href","")
        img = item.select_one("img")
        cover = (img.get("data-src") or img.get("src","")) if img else ""
        if title and href and base_url in href:
            results.append({"title":title.strip(),"url":href,"cover":cover,
                            "source":source_name,"genres":_card_genres(item)})
    return results

# ═══════════════════════════════════════════════════════════
# Description + genre from detail page
# ═══════════════════════════════════════════════════════════
async def fetch_detail(session: AsyncSession, url: str) -> tuple[str, list[str]]:
    try:
        r = await session.get(url, headers=HEADERS, impersonate="chrome120", timeout=12)
        if r.status_code != 200: return "", []
        soup = BeautifulSoup(r.text, "html.parser")
        desc = ""
        for sel in [".summary__content p",".entry-content p",".manga-excerpt p",
                    "#syn-target p",".description-summary p",".summary_content p"]:
            el = soup.select_one(sel)
            if el:
                d = el.get_text(strip=True)
                if len(d) > 30: desc = d[:500]; break
        raw_genres = []
        for sel in [".genres-content a",".wp-manga-tags-list a",
                    ".mg_genres .summary-content a",".genres a","a[rel='tag']"]:
            found = [el.get_text(strip=True) for el in soup.select(sel)]
            if found: raw_genres = found; break
        return desc, normalize_genres(raw_genres)
    except: return "", []

# ═══════════════════════════════════════════════════════════
# Fetchers
# ═══════════════════════════════════════════════════════════
async def fetch_madara(session, site):
    results, base, sub = [], site["url"].rstrip("/"), site.get("sub_path","manga")
    if site["name"] == "Catzaa":
        for p in range(1,5):
            try:
                data = {"action":"madara_load_more","page":str(p-1),
                        "template":"madara-core/content/content-archive-manga",
                        "vars[orderby]":"meta_value_num","vars[order]":"DESC",
                        "vars[meta_key]":"_latest_update"}
                r = await session.post(f"{base}/wp-admin/admin-ajax.php",data=data,
                    headers={**HEADERS,"Referer":base+"/"},impersonate="chrome120",timeout=15)
                if r.status_code != 200 or not r.text.strip(): break
                items = _extract_items(BeautifulSoup(r.text,"html.parser"),base,site["name"])
                if not items: break
                results.extend(items)
            except Exception as e: print(f"  ⚠️ {site['name']} p{p}: {e}"); break
        if results: return results
    for page in range(1,4):
        try:
            r = await session.get(f"{base}/{sub}/?m_orderby=new&page={page}",
                headers=HEADERS,impersonate="chrome120",timeout=15)
            if r.status_code != 200: break
            items = _extract_items(BeautifulSoup(r.text,"html.parser"),base,site["name"],sub)
            if not items: break
            results.extend(items)
        except Exception as e: print(f"  ⚠️ {site['name']} p{page}: {e}"); break
    return results

async def fetch_themesia(session, site):
    results, base, sub = [], site["url"].rstrip("/"), site.get("sub_path","manga")
    for page in range(1,5):
        try:
            r = await session.get(f"{base}/{sub}/?page={page}&order=update",
                headers=HEADERS,impersonate="chrome120",timeout=15)
            if r.status_code != 200: break
            items = _extract_items(BeautifulSoup(r.text,"html.parser"),base,site["name"])
            if not items: break
            results.extend(items)
        except Exception as e: print(f"  ⚠️ {site['name']} p{page}: {e}"); break
    return results

async def fetch_nekopost(session, _):
    results = []
    base = "https://www.nekopost.net"
    fh   = "https://www.osemocphoto.com"
    hdrs = {**HEADERS,"Referer":f"{base}/","Content-Type":"application/json","Accept":"application/json"}
    for p in range(1,8):
        try:
            body = json.dumps({"type":"mc","paging":{"pageNo":p,"pageSize":15}})
            r = await session.post(f"{base}/api/project/list/popular",data=body,
                headers=hdrs,impersonate="chrome120",timeout=15)
            if r.status_code != 200: break
            items = r.json().get("listProject",[])
            if not items: break
            for item in items:
                pid = str(item.get("pid",""))
                title = item.get("projectName","")
                ver = item.get("coverVersion")
                cover = f"{fh}/collectManga/{pid}/{pid}_cover.jpg"
                if ver: cover += f"?ver={ver}"
                cat = item.get("categoryName") or ""
                genres = normalize_genres([c.strip() for c in cat.split(",") if c.strip()])
                if title and pid:
                    results.append({"title":title,"url":f"{base}/manga/{pid}",
                                   "cover":cover,"source":"Nekopost","genres":genres})
        except Exception as e: print(f"  ⚠️ Nekopost p{p}: {e}"); break
    return results

async def fetch_site(session, site):
    t = site["theme"]
    if t == "madara":   return await fetch_madara(session,site)
    if t == "themesia": return await fetch_themesia(session,site)
    if t == "nekopost": return await fetch_nekopost(session,site)
    return []

# ═══════════════════════════════════════════════════════════
# Phase 2: Enrich descriptions
# ═══════════════════════════════════════════════════════════
async def enrich(session, catalog, max_items=200):
    sem = asyncio.Semaphore(10)
    enriched = 0
    async def one(m):
        nonlocal enriched
        async with sem:
            wp = next((s for s in m["sources"] if "nekopost" not in s["url"]), None)
            if not wp: return
            desc, detail_genres = await fetch_detail(session, wp["url"])
            if desc: m["desc"] = desc; enriched += 1
            if detail_genres:
                safe = [g for g in set(m["genres"]) | set(detail_genres)
                        if g.lower() not in ADULT_GENRE_TAGS]
                m["genres"] = sorted(safe)
    await asyncio.gather(*[one(m) for m in catalog[:max_items]])
    print(f"  📝 Enriched desc: {enriched}/{min(max_items,len(catalog))}")

# ═══════════════════════════════════════════════════════════
# Dedup + classify + popularity score
# ═══════════════════════════════════════════════════════════
# Genre weights สำหรับ popularity score
POPULAR_GENRES = {
    "Action":10,"Adventure":8,"Fantasy":8,"Martial Arts":7,
    "Manhwa":6,"Manhua":5,"Isekai":7,"Cultivation":6,
    "Romance":5,"Drama":4,"Comedy":4,"System":5,"Leveling":6,
}

def popularity_score(m: dict) -> int:
    score = len(m["sources"]) * 10
    for g in m.get("genres",[]):
        score += POPULAR_GENRES.get(g, 0)
    if m.get("desc"): score += 5
    if m.get("cover"): score += 2
    return score

def dedup(all_manga: list) -> list:
    seen: dict[str,int] = {}
    result = []
    for m in all_manga:
        key = norm_title(m["title"])
        if not key: continue
        if key not in seen:
            seen[key] = len(result)
            result.append({"title":m["title"],"cover":m.get("cover",""),
                          "genres":list(m.get("genres",[])),"desc":"",
                          "country":"","sources":[{"name":m["source"],"url":m["url"]}]})
        else:
            idx = seen[key]
            ex = {s["name"] for s in result[idx]["sources"]}
            if m["source"] not in ex:
                result[idx]["sources"].append({"name":m["source"],"url":m["url"]})
            merged = set(result[idx]["genres"]) | set(m.get("genres",[]))
            result[idx]["genres"] = sorted(merged)
            if not result[idx]["cover"] and m.get("cover"):
                result[idx]["cover"] = m["cover"]
    # classify country
    for m in result:
        m["country"] = classify_country(m["genres"], m["title"], m["sources"])
    return result

# ═══════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════
async def main():
    print(f"🚀 Phase 1: ดึง catalog จาก {len(SITES)} เว็บ (ตัด 18+ ออกแล้ว)\n")
    all_manga, total_filtered = [], 0
    sem = asyncio.Semaphore(6)

    async def run(site):
        async with sem:
            print(f"  ⏳ {site['name']:20s} [{site['theme']}]")
            items = await fetch_site(session, site)
            safe = [i for i in items if is_safe(i["title"],i["url"],i.get("genres",[]))]
            removed = len(items) - len(safe)
            label = "✅" if safe else "⚠️"
            extra = f"  🔞 กรอง {removed}" if removed else ""
            print(f"  {label} {site['name']:20s} → {len(safe)}{extra}")
            return safe, removed

    async with AsyncSession() as session:
        results = await asyncio.gather(*[run(s) for s in SITES], return_exceptions=True)
        for i, r in enumerate(results):
            if isinstance(r, tuple):
                items, removed = r
                all_manga.extend(items); total_filtered += removed
            else: print(f"  💥 {SITES[i]['name']}: {r}")

        print(f"\n📊 {len(all_manga)} entries | 🔞 กรอง: {total_filtered}")
        catalog = dedup(all_manga)
        print(f"✨ dedup: {len(catalog)} เรื่อง\n")

        print("📝 Phase 2: description (200 เรื่องแรก)...")
        await enrich(session, catalog, 200)

    # Sort by popularity
    catalog.sort(key=lambda x: -popularity_score(x))

    # Genre stats
    genre_stats: dict[str,int] = {}
    for m in catalog:
        for g in m["genres"]:
            genre_stats[g] = genre_stats.get(g,0) + 1

    valid_genres = sorted(g for g,c in genre_stats.items() if c >= 2)

    # Country stats
    country_stats = {"JP":0,"KR":0,"CN":0,"OTHER":0}
    for m in catalog:
        country_stats[m.get("country","OTHER")] = country_stats.get(m.get("country","OTHER"),0) + 1

    print(f"\n🌍 ประเทศต้นกำเนิด: 🇯🇵JP={country_stats['JP']} 🇰🇷KR={country_stats['KR']} 🇨🇳CN={country_stats['CN']}")
    print(f"🏷️  Genres ({len(valid_genres)}): {', '.join(valid_genres[:10])}...")

    output = {
        "total": len(catalog),
        "genre_list": valid_genres,
        "country_stats": country_stats,
        "manga": catalog,
    }

    with open("manga_catalog.json","w",encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n💾 manga_catalog.json ({len(catalog)} เรื่อง) — เรียงตาม popularity แล้ว")
    print("📁 copy manga_catalog.json public\\manga_catalog.json")

asyncio.run(main())