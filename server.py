@app.get("/api/manga/{manga_id}/chapters")
async def get_chapters(manga_id: str):
    pool = app.state.pool
    try:
        async with pool.acquire() as conn:
            # 1. ตรวจสอบข้อมูลมังงะ
            manga = await conn.fetchrow("SELECT id, source_url, chapters_fetched FROM manga WHERE id = $1", manga_id)
            if not manga:
                return JSONResponse(status_code=404, content={"detail": "Manga not found"})
            
            # 2. ถ้าเคยดึงข้อมูลแล้ว ให้คืนค่าจาก DB ทันที
            if manga["chapters_fetched"]:
                rows = await conn.fetch(
                    "SELECT id, number, title, source_url FROM chapters WHERE manga_id = $1 ORDER BY number DESC",
                    manga_id
                )
                return [dict(r) for r in rows]
            
            source_url = manga["source_url"]

        # 3. เริ่มการขูดข้อมูล (Scraping)
        print(f"[Log] Scraping chapters from: {source_url}")
        raw_chapters = await scrape_chapters(source_url)
        
        if not raw_chapters:
            return []

        # 4. บันทึกลง Database ด้วย Transaction เพื่อความสมบูรณ์ของข้อมูล
        async with pool.acquire() as conn:
            async with conn.transaction():
                for ch in raw_chapters:
                    # ป้องกันค่าที่เป็น None หรือโครงสร้างข้อมูลผิดพลาด
                    ch_num = ch.get("number", 0.0)
                    ch_title = ch.get("title", f"Chapter {ch_num}")
                    ch_url = ch.get("url")
                    
                    if not ch_url: continue
                    
                    ch_id = make_chapter_id(manga_id, ch_num)
                    
                    await conn.execute("""
                        INSERT INTO chapters (id, manga_id, number, title, source_url)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (id) DO NOTHING
                    """, ch_id, manga_id, ch_num, ch_title, ch_url)
                
                # อัปเดตสถานะว่าดึงข้อมูลเสร็จแล้ว
                await conn.execute("UPDATE manga SET chapters_fetched = TRUE WHERE id = $1", manga_id)
            
            # ดึงข้อมูลที่บันทึกแล้วส่งกลับไป
            rows = await conn.fetch(
                "SELECT id, number, title, source_url FROM chapters WHERE manga_id = $1 ORDER BY number DESC",
                manga_id
            )
            return [dict(r) for r in rows]

    except Exception as e:
        # พิมพ์ Error ลง Log ของ Railway เพื่อให้ตรวจสอบได้
        error_trace = traceback.format_exc()
        print(f"[Critical Error] {error_trace}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal Server Error: {str(e)}"}
        )