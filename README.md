# 📚 BulkScraper v6 — คู่มือการใช้งาน

> Manga scraper สำหรับดึงข้อมูลมังงะจากเว็บต่างๆ แล้ว push ขึ้น Supabase

---

## 📋 สารบัญ

- [ติดตั้ง](#ติดตั้ง)
- [ตั้งค่าครั้งแรก](#ตั้งค่าครั้งแรก)
- [การใช้งานปกติ (Full Run)](#การใช้งานปกติ-full-run)
- [คำสั่งแต่ละ Phase](#คำสั่งแต่ละ-phase)
- [คำสั่งพิเศษ](#คำสั่งพิเศษ)
- [Reset & Re-run](#reset--re-run)
- [แก้ปัญหาที่พบบ่อย](#แก้ปัญหาที่พบบ่อย)
- [การตั้งค่า Workers](#การตั้งค่า-workers)

---

## ติดตั้ง

```powershell
pip install requests beautifulsoup4 httpx supabase rich selenium
```

---

## ตั้งค่าครั้งแรก

เปิดไฟล์ `bulk_scraper_v6.py` แก้ค่าที่บรรทัด 203–208:

```python
SUPABASE_URL   = "https://xxxx.supabase.co"        # URL จาก Supabase Dashboard
SUPABASE_KEY   = "eyJ..."                           # service_role key
STORAGE_BUCKET = "mangas"                           # ชื่อ Storage bucket
TABLE_CHAPTERS = "chapters"                         # ชื่อ table chapters
DB_PATH        = "bulk_progress.db"                 # ไฟล์ SQLite local
```

### Supabase Tables ที่ต้องมี

**Table: `mangas`**
| column | type | หมายเหตุ |
|--------|------|----------|
| id | int4 | auto |
| title | text | primary key (on_conflict) |
| cover_url | text | |
| description | text | default '' |
| genres | jsonb | array |
| country | text | JP/KR/CN/TH |
| view_count | int4 | default 0 |
| rating_avg | numeric | default 0 |
| rating_count | int4 | default 0 |

**Table: `chapters`**
| column | type | หมายเหตุ |
|--------|------|----------|
| id | uuid | auto |
| manga_title | text | FK → mangas.title |
| chapter_title | text | |
| image_urls | jsonb | array of URLs |
| cover_url | text | |
| created_at | timestamp | |

---

## การใช้งานปกติ (Full Run)

รันครั้งแรกหรือ scrape เว็บใหม่ทั้งหมด:

```powershell
# 1. รวบ URL ทั้งหมดจากเว็บ
python bulk_scraper_v6.py catalog --url https://go-manga.com

# 2. ดึง meta (ชื่อ, ปก, rating, view, description) + push Supabase
python bulk_scraper_v6.py meta --workers 80

# 3. ดึงรูปทุกตอน + upload Storage
python bulk_scraper_v6.py images --workers 48
```

---

## คำสั่งแต่ละ Phase

### Phase 1 — Catalog (รวบ URL)

```powershell
# ดึงจากเว็บเดียว
python bulk_scraper_v6.py catalog --url https://go-manga.com

# ดึงจากหลายเว็บพร้อมกัน (ใส่ URL ใน sites.txt ทีละบรรทัด)
python bulk_scraper_v6.py catalog --sites sites.txt
```

**ตัวอย่าง `sites.txt`:**
```
https://go-manga.com
https://อีกเว็บ.com
# บรรทัดที่ขึ้นต้นด้วย # = comment
```

---

### Phase 2 — Meta (ดึงข้อมูลมังงะ)

```powershell
# รันปกติ
python bulk_scraper_v6.py meta --workers 80

# ไม่ push Supabase (เทสเฉยๆ)
python bulk_scraper_v6.py meta --workers 80 --no-push

# เทสแค่ 3 เรื่องก่อน
python bulk_scraper_v6.py meta --workers 4 --limit 3
```

**ข้อมูลที่ดึงได้:**
- ชื่อมังงะ, ปก, คำอธิบาย (description)
- แนว (genres), ประเทศ, สถานะ (ongoing/completed)
- rating_avg, rating_count
- view_count (6 strategies: CSS → WP API → selector scan → label → class → schema.org)
- รายชื่อตอนทั้งหมด

---

### Phase 3 — Images (ดึงรูป + upload)

```powershell
# รันปกติ (แนะนำ workers 16–48)
python bulk_scraper_v6.py images --workers 48

# ไม่ upload Supabase
python bulk_scraper_v6.py images --workers 48 --no-push

# เทสแค่ 3 มังงะแรก
python bulk_scraper_v6.py images --workers 16 --limit 3
```

---

### ดูสถานะ

```powershell
python bulk_scraper_v6.py status
```

---

## คำสั่งพิเศษ

### Retry เฉพาะที่ fail

```powershell
# retry ทั้ง meta และ images ที่ fail
python bulk_scraper_v6.py retry --what all

# retry เฉพาะ meta
python bulk_scraper_v6.py retry --what meta

# retry เฉพาะ images
python bulk_scraper_v6.py retry --what images
```

### Reset meta แล้วดึงใหม่ (ไม่ลบ chapters)

```powershell
# ใช้ไฟล์ reset_meta.py
python reset_meta.py
python bulk_scraper_v6.py meta --workers 80
```

---

## Reset & Re-run

### Reset ทุกอย่าง (local DB + Supabase + Storage)

```powershell
python bulk_scraper_v6.py reset-db --supabase
```

⚠️ **ลบข้อมูลทั้งหมดใน Supabase** — ใช้เมื่อต้องการ scrape ใหม่จากศูนย์

### หลัง reset รัน full pipeline:

```powershell
python bulk_scraper_v6.py catalog --url https://go-manga.com
python bulk_scraper_v6.py meta --workers 80
python bulk_scraper_v6.py images --workers 48
```

---

## แก้ปัญหาที่พบบ่อย

### ❌ `catalog ได้ 0 URLs`
- เว็บอาจ redirect จาก `go-manga.com` → `www.go-manga.com`
- แก้ไขแล้วในไฟล์ปัจจุบัน (origin_alt detection)
- ลองรัน `catalog` ใหม่หลังอัปเดตไฟล์

### ❌ `views=0` ทุกเรื่อง
- go-manga โหลด view count ผ่าน JS
- scraper ใช้ WP REST API เป็น fallback อัตโนมัติ
- ถ้ายังเป็น 0 แปลว่าเว็บนั้นไม่ได้เปิด API หรือไม่มี view count

### ❌ `ไม่สามารถเชื่อมต่อ Database ได้` (หน้าเว็บ)
- Supabase query มี column ที่ไม่มีใน DB
- เช็ค `select()` ใน `app/page.tsx` ว่า column ตรงกับ DB ไหม

### ❌ `invalid int value` ตอนรัน images
```powershell
# ถูก
python bulk_scraper_v6.py images --workers 16

# ผิด (ไม่รับ float)
python bulk_scraper_v6.py images --workers 0.05
```

### ❌ PowerShell `&&` ไม่ทำงาน
```powershell
# ใช้ ; แทน
python bulk_scraper_v6.py catalog --url https://go-manga.com; python bulk_scraper_v6.py meta --workers 80; python bulk_scraper_v6.py images --workers 48
```

---

## การตั้งค่า Workers

แนะนำสำหรับ **RTX 5070Ti + 9800X3D + 32GB + เน็ต 500/1000**:

| Phase | Command | แนะนำ | สูงสุด | หมายเหตุ |
|-------|---------|--------|--------|----------|
| catalog | — | — | — | ไม่มี workers |
| meta | `--workers` | **80** | 120 | เพิ่มได้ถ้าเน็ตเร็ว |
| images | `--workers` | **48** | 48 | สูงสุดที่โค้ดรองรับ |

---

## เพิ่มเว็บใหม่

scraper รองรับทุกเว็บอัตโนมัติผ่าน `auto_probe_site()` แต่ถ้าต้องการ fine-tune เพิ่มใน `SITES` dict:

```python
"example.com": {
    "layer":           "fast",          # fast / chrome / auto
    "series_re":       r"^/manga/[^/]+/?$",
    "chapter_re":      r"^/manga/[^/]+/chapter-\d+",
    "chapter_css":     ".chapter-list a",
    "img_css":         ".reading-content img",
    "cover_css":       ".series-cover img",
    "title_css":       "h1.series-title",
    "desc_css":        ".series-description",
    "genre_css":       ".genre-list a",
    "rating_css":      "[itemprop='ratingValue']",
    "rating_count_css":"meta[itemprop='ratingCount']",
    "view_count_css":  "span.view-count",   # CSS ของเว็บนั้นๆ
    "img_filter":      "ts_reader",         # ts_reader / network / css
},
```

ถ้าไม่ใส่ config เว็บจะถูก auto-detect ทุก field อัตโนมัติ

---

## Git Push

```powershell
git add .
git commit -m "your message"
git push
```
