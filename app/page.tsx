"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  Loader2, Sun, Moon, ChevronRight, ChevronLeft, ChevronDown,
  Search as SearchIcon, X, Play, List,
  BookOpen, Flame, RefreshCw, Globe
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ztvchypgeoeiijjhclnh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0dmNoeXBnZW9laWlqamhjbG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NDc1NzUsImV4cCI6MjA4NzMyMzU3NX0.ifHhClrpORNR0_JR_Q04q8b_yHbrEgSuIrPf5aaFX-Y";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ ส่งรูปภาพทุกใบผ่าน proxy (แก้ hotlink, stream ไม่โหลดลงเครื่อง)
const p = (url: string) =>
  url && url.startsWith('http') && !url.includes('placehold.co')
    ? `/api/proxy-image?url=${encodeURIComponent(url)}`
    : url;

// ─── หมวดหมู่ประเทศ ───
const COUNTRIES = [
  { key: 'all',   label: 'ทั้งหมด',     flag: '🌏' },
  { key: 'japan', label: 'ญี่ปุ่น',     flag: '🇯🇵' },
  { key: 'korea', label: 'เกาหลี',      flag: '🇰🇷' },
  { key: 'china', label: 'จีน',         flag: '🇨🇳' },
];

interface Manga {
  id: string;
  title: string;
  cover: string;
  genres: string[];
  country: string;
  desc?: string;
  sources: { name: string; url: string }[];
}
interface Chapter { id: string; title: string; url: string; number: number; }

const T = {
  readNow:"อ่านตอนนี้", recommended:"มังงะแนะนำ",
  readFirst:"ตอนแรก", chapterList:"รายชื่อตอน",
  synopsis:"เรื่องย่อ", allTitles:"รายการทั้งหมด",
  searchResult:"ผลการค้นหา", searchPlaceholder:"ค้นหาชื่อมังงะ...",
  noFile:"ไม่สามารถเชื่อมต่อ Database ได้", loading:"กำลังโหลด...",
  allGenres:"ทุกประเภท",
};

function extractChapterNum(title: string): number {
  if (!title) return 0;
  const ep = title.match(/ep\.?\s*0*(\d+)/i);
  if (ep) return parseInt(ep[1]);
  const th = title.match(/(?:ตอน(?:ที่)?|chapter|ch\.?)\s*\.?\s*0*(\d+)/i);
  if (th) return parseInt(th[1]);
  const nums = title.match(/\d+/g);
  if (nums) return parseInt(nums[nums.length - 1]);
  return 0;
}

// ─────────────────────── BANNER SLIDER ───────────────────────
const BannerSlider = memo(({ items, onOpen }: { items: Manga[], onOpen: (m: Manga) => void }) => {
  const [cur, setCur] = useState(0);
  useEffect(() => {
    if (!items.length) return;
    const id = setInterval(() => setCur(c => (c + 1) % items.length), 7000);
    return () => clearInterval(id);
  }, [items.length]);
  if (!items.length) return null;

  return (
    <section className="px-4 md:px-6 max-w-7xl mx-auto">
      <div className="relative h-[300px] md:h-[400px] rounded-[2rem] overflow-hidden bg-zinc-900">
        {items.map((m, i) => (
          <div
            key={i}
            className={`absolute inset-0 cursor-pointer transition-opacity duration-1000 ${i === cur ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'}`}
            onClick={() => onOpen(m)}
          >
            <img src={p(m.cover)} className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-25" alt="" aria-hidden />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="relative z-10 h-full flex items-end md:items-center px-8 md:px-12 pb-8 md:pb-0 gap-7">
              <div className="hidden md:block h-48 w-auto aspect-[2/3] rounded-xl shadow-2xl border border-white/10 flex-shrink-0 bg-zinc-800 overflow-hidden">
                <img src={p(m.cover)} alt={m.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <div className="text-white flex-1">
                <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.3em] mb-1.5">{T.recommended}</p>
                <h2 className="text-2xl md:text-3xl font-black mb-2.5 leading-tight line-clamp-2">{m.title}</h2>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {m.genres.slice(0, 3).map(g => (
                    <span key={g} className="bg-white/10 border border-white/10 px-2.5 py-1 rounded-full text-[9px] font-bold text-zinc-300">{g}</span>
                  ))}
                </div>
                <button className="bg-white text-black px-7 py-2.5 rounded-full text-[11px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2 w-fit">
                  {T.readNow} <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
        <div className="absolute bottom-3 right-5 flex gap-1.5 z-20">
          {items.map((_, i) => (
            <button key={i} onClick={() => setCur(i)} className={`rounded-full transition-all ${i === cur ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30'}`} />
          ))}
        </div>
      </div>
    </section>
  );
});
BannerSlider.displayName = 'BannerSlider';

// ─────────────────────── MANGA CARD ───────────────────────
const MangaCard = memo(({ m, onOpen }: { m: Manga, onOpen: (m: Manga) => void }) => {
  const [err, setErr] = useState(false);
  const src = err
    ? `https://placehold.co/300x420/111827/3b82f6?text=${encodeURIComponent(m.title.slice(0, 12))}`
    : m.cover;

  const countryFlag = COUNTRIES.find(c => c.key === m.country)?.flag || '🌏';

  return (
    <div onClick={() => onOpen(m)} className="group cursor-pointer select-none">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 transition-transform duration-300 group-hover:scale-95 ring-1 ring-transparent group-hover:ring-blue-500/40">
        <img
          src={p(src)}
          alt={m.title}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setErr(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] font-black text-white">
          {countryFlag}
        </div>
      </div>
      <div className="mt-1.5">
        <h3 className="text-[10px] font-bold leading-snug line-clamp-2 group-hover:text-blue-500 transition-colors">{m.title}</h3>
      </div>
    </div>
  );
});
MangaCard.displayName = 'MangaCard';

const PER_PAGE = 24;

// ─────────────────────── HOME PAGE ───────────────────────
export default function HomePage() {
  const [allData, setAllData]         = useState<Manga[]>([]);
  const [mangas, setMangas]           = useState<Manga[]>([]);
  const [total, setTotal]             = useState(0);
  const [banner, setBanner]           = useState<Manga[]>([]);
  const [loading, setLoading]         = useState(true);
  const [catalogErr, setCatalogErr]   = useState("");

  const [query, setQuery]             = useState("");
  const [dark, setDark]               = useState(true);
  const [page, setPage]               = useState(1);
  const [totalPages, setTotalPages]   = useState(1);

  // ─── Filter state ───
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [selectedGenre,   setSelectedGenre]   = useState("all");

  // ─── Modal state ───
  const [mOpen,    setMOpen]    = useState(false);
  const [mManga,   setMManga]   = useState<Manga | null>(null);
  const [mChaps,   setMChaps]   = useState<Chapter[]>([]);
  const [mLoading, setMLoading] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = localStorage.getItem('manga-theme') !== 'light';
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
  }, []);

  // ─── Load data from Supabase ───
  // ✅ FIX: Supabase มี default limit 1,000 rows → ใช้ pagination loop ดึงทุก manga
  useEffect(() => {
    setLoading(true);

    const loadAllMangas = async () => {
      const mangaMap = new Map<string, Manga>();
      const PAGE_SIZE = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('chapters')
          .select('manga_title, cover_url, chapter_title, source_url, genres, country')
          .order('manga_title', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        data.forEach((row: any) => {
          if (!mangaMap.has(row.manga_title)) {
            const finalCover =
              row.cover_url && row.cover_url.trim() !== ''
                ? row.cover_url
                : `https://placehold.co/400x600/1f2937/3b82f6?text=${encodeURIComponent(row.manga_title.slice(0, 15))}`;

            mangaMap.set(row.manga_title, {
              id:      row.manga_title,
              title:   row.manga_title,
              cover:   finalCover,
              genres:  Array.isArray(row.genres) ? [...new Set(row.genres as string[])] : [],
              country: row.country || 'japan',
              desc:    `อัปเดต: ${row.chapter_title}`,
              sources: [{ name: "Source", url: row.source_url || "#" }],
            });
          }
        });

        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      const uniqueMangas = Array.from(mangaMap.values());
      setAllData(uniqueMangas);
      setBanner(uniqueMangas.slice(0, 5));
      setCatalogErr("");
      setLoading(false);
    };

    loadAllMangas().catch(err => {
      console.error(err);
      setCatalogErr(T.noFile);
      setLoading(false);
    });
  }, []);

  // ─── Collect all available genres from loaded data ───
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    allData.forEach(m => m.genres?.forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [allData]);

  // ─── Filter + paginate ───
  useEffect(() => {
    let filtered = allData;

    if (selectedCountry !== 'all')
      filtered = filtered.filter(m => m.country === selectedCountry);

    if (selectedGenre !== 'all')
      filtered = filtered.filter(m => m.genres.includes(selectedGenre));

    if (query)
      filtered = filtered.filter(m =>
        m.title.toLowerCase().includes(query.toLowerCase())
      );

    setTotal(filtered.length);
    setTotalPages(Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
    const start = (page - 1) * PER_PAGE;
    setMangas(filtered.slice(start, start + PER_PAGE));
  }, [allData, page, query, selectedCountry, selectedGenre]);

  // ─── Open manga modal ───
  const openModal = useCallback(async (manga: Manga) => {
    setMManga(manga); setMChaps([]); setMLoading(true);
    setMOpen(true); setDropOpen(false);
const { data } = await supabase
  .from('chapters')
  .select('id, chapter_title, source_url')
  .eq('manga_title', manga.title);
if (data) {
  const sorted = [...data].sort((a, b) =>
    extractChapterNum(b.chapter_title) - extractChapterNum(a.chapter_title)
  );
  setMChaps(sorted.map((ch) => ({
    id:     ch.id,
    number: extractChapterNum(ch.chapter_title),
        title:  ch.chapter_title
                    .replace(/^(?:Manhwa|Manhua|Manga)(?:Color|BW)?\s*/i, '')
                    .replace(/\s*(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*$/i, '')
                    .trim()
                    || ch.chapter_title,
        url:    ch.source_url,
      })));
    }
    setMLoading(false);
  }, []);

  const resetFilters = () => {
    setSelectedCountry('all');
    setSelectedGenre('all');
    setQuery('');
    setPage(1);
  };

  const goPage = (p: number) => {
    setPage(p);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const paginationGroup = () => {
    const s = Math.max(page - 2, 1);
    const e = Math.min(s + 4, totalPages);
    return Array.from({ length: Math.max(0, e - s + 1) }, (_, i) => s + i);
  };

  const hasActiveFilter = selectedCountry !== 'all' || selectedGenre !== 'all' || query !== '';

  // ─── Loading / Error screens ───
  if (loading && allData.length === 0) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] gap-3">
      <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
      <p className="text-xs text-zinc-500 animate-pulse">{T.loading}</p>
    </div>
  );
  if (catalogErr) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] gap-5 px-8 text-center">
      <BookOpen size={40} className="text-zinc-700" />
      <h2 className="text-lg font-black text-zinc-300">ไม่สามารถเชื่อมต่อ Database ได้</h2>
      <button onClick={() => window.location.reload()} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-black hover:bg-blue-500">
        <RefreshCw size={14} /> ลองใหม่
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 pb-16">

      {/* ─── MANGA MODAL ─── */}
      {mOpen && mManga && (
        <div
          className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/85"
          onClick={e => { if (e.target === e.currentTarget) setMOpen(false); }}
        >
          <div className="bg-white dark:bg-[#0d0d0d] w-full md:max-w-4xl h-[90vh] md:h-[85vh] rounded-t-[1.5rem] md:rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800 relative">
            <button onClick={() => setMOpen(false)} className="absolute top-4 right-4 z-50 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 border border-white/10">
              <X size={16} />
            </button>

            {/* Cover hero */}
            <div className="relative h-36 md:h-44 shrink-0 overflow-hidden bg-zinc-800">
              <img src={p(mManga.cover)} className="w-full h-full object-cover blur-2xl scale-110 opacity-20 absolute inset-0" alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#0d0d0d] to-transparent" />
              <div className="absolute bottom-0 left-6 md:left-10 translate-y-1/2">
                <div className="w-20 md:w-28 aspect-[2/3] rounded-xl shadow-2xl border-2 border-white dark:border-zinc-800 bg-zinc-800 overflow-hidden">
                  <img src={p(mManga.cover)} className="w-full h-full object-cover" alt={mManga.title} />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pt-14 md:pt-18 pb-8 px-6 md:px-10">
              <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                <div className="flex-1 min-w-0 space-y-3">
                  <h1 className="text-xl md:text-2xl font-black leading-tight">{mManga.title}</h1>

                  {/* Genres */}
                  {mManga.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {[...new Set(mManga.genres)].map((g, i) => (
                        <span key={`${g}-${i}`} className="px-2 py-0.5 bg-blue-600/10 text-blue-500 dark:text-blue-400 rounded-full text-[10px] font-bold border border-blue-500/20">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Country */}
                  <p className="text-[10px] text-zinc-400 font-bold">
                    {COUNTRIES.find(c => c.key === mManga.country)?.flag}{' '}
                    {COUNTRIES.find(c => c.key === mManga.country)?.label || mManga.country}
                  </p>
                </div>

                {/* Chapter list */}
                <div className="w-full md:w-64 shrink-0">
                  {mLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="animate-spin text-blue-600" />
                    </div>
                  ) : mChaps.length > 0 ? (
                    <div className="space-y-2">
                      {/* ปุ่มอ่านตอนล่าสุด */}
                      <a
                        href={`/manga/${encodeURIComponent(mManga.id)}/read/${mChaps[0].id}`}
                        className="w-full bg-blue-600 text-white flex justify-center py-3 rounded-xl font-black text-sm hover:bg-blue-500 transition-colors"
                      >
                        <Play size={14} className="mr-2" /> ล่าสุด
                      </a>
                      {/* ปุ่มอ่านตอนแรก */}
                      <a
                        href={`/manga/${encodeURIComponent(mManga.id)}/read/${mChaps[mChaps.length - 1].id}`}
                        className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white flex justify-center py-3 rounded-xl font-black text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <BookOpen size={14} className="mr-2" /> {T.readFirst}
                      </a>

                      {/* Dropdown ทุกตอน */}
                      <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mt-2">
                        <button
                          onClick={() => setDropOpen(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-bold"
                        >
                          <span><List size={13} className="inline mr-1 text-blue-500" /> {T.chapterList} ({mChaps.length})</span>
                          <ChevronDown size={14} className={dropOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>
                        {dropOpen && (
                          <div className="border-t border-zinc-200 dark:border-zinc-800 max-h-52 overflow-y-auto">
                            {mChaps.map((ch, i) => (
                              <a
                                key={i}
                                href={`/manga/${encodeURIComponent(mManga.id)}/read/${ch.id}`}
                                className="block px-4 py-2.5 text-[10px] font-bold border-b border-zinc-100 dark:border-zinc-800/50 hover:text-blue-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                              >
                                {ch.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ลิงก์ไปหน้ารายละเอียดเต็ม */}
                      <a
                        href={`/manga/${encodeURIComponent(mManga.id)}`}
                        className="w-full block text-center text-[10px] text-zinc-400 hover:text-blue-500 py-2 font-bold"
                      >
                        ดูรายละเอียดทั้งหมด →
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-50 px-4 md:px-6 py-3 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-zinc-100 dark:border-zinc-900">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <h1 className="text-lg font-black italic text-blue-600 tracking-tight uppercase shrink-0">MANGA.BLUE</h1>
          <div className="flex-1 max-w-sm flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 px-3.5 py-2 rounded-xl focus-within:border-blue-500/40 border border-transparent transition-colors">
            <SearchIcon size={14} className="text-zinc-400" />
            <input
              type="text"
              placeholder={T.searchPlaceholder}
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              className="bg-transparent outline-none w-full text-sm"
            />
            {query && <button onClick={() => { setQuery(""); setPage(1); }}><X size={12} /></button>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-bold hidden md:block">{total} เรื่อง</span>
            <button
              onClick={() => {
                const d = !dark;
                setDark(d);
                localStorage.setItem('manga-theme', d ? 'dark' : 'light');
                document.documentElement.classList.toggle('dark', d);
              }}
              className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* ─── FILTER BAR ─── */}
      <div className="px-4 md:px-6 max-w-7xl mx-auto mt-4 space-y-3">

        {/* หมวดหมู่ประเทศ */}
        <div className="flex items-center gap-2 flex-wrap">
          <Globe size={12} className="text-zinc-400" />
          {COUNTRIES.map(c => (
            <button
              key={c.key}
              onClick={() => { setSelectedCountry(c.key); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all ${
                selectedCountry === c.key
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              {c.flag} {c.label}
            </button>
          ))}
        </div>

        {/* หมวดหมู่ประเภทมังงะ (แสดงเฉพาะถ้ามีข้อมูล genre ใน DB) */}
        {availableGenres.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => { setSelectedGenre('all'); setPage(1); }}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                selectedGenre === 'all'
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              {T.allGenres}
            </button>
            {availableGenres.map(g => (
              <button
                key={g}
                onClick={() => { setSelectedGenre(g); setPage(1); }}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                  selectedGenre === g
                    ? 'bg-orange-500 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* ปุ่ม Reset filter ถ้ามี filter ที่ active */}
        {hasActiveFilter && (
          <button
            onClick={resetFilters}
            className="text-[10px] text-zinc-400 hover:text-red-500 font-bold flex items-center gap-1"
          >
            <X size={10} /> ล้าง filter ทั้งหมด
          </button>
        )}
      </div>

      <main className="mt-5 space-y-7">
        {/* Banner (เฉพาะหน้าแรก ไม่มี filter) */}
        {!query && page === 1 && selectedCountry === 'all' && selectedGenre === 'all' && (
          <BannerSlider items={banner} onOpen={openModal} />
        )}

        {/* Manga Grid */}
        <section className="px-4 md:px-6 max-w-7xl mx-auto" ref={listRef}>
          <div className="flex items-center gap-2 mb-4">
            <Flame size={14} className="text-orange-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
              {query
                ? `${T.searchResult}: "${query}" — ${total} เรื่อง`
                : `${T.allTitles} — หน้า ${page}/${totalPages} (${total} เรื่อง)`}
            </span>
          </div>

          {mangas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
              <SearchIcon size={24} className="opacity-20" />
              <p className="text-sm font-bold">ไม่พบมังงะที่ตรงกับ filter</p>
              <button onClick={resetFilters} className="text-xs text-blue-500 font-bold hover:underline">
                ล้าง filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4">
              {mangas.map((m, i) => <MangaCard key={i} m={m} onOpen={openModal} />)}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-1.5">
              <button
                onClick={() => goPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              {paginationGroup().map(pg => (
                <button
                  key={pg}
                  onClick={() => goPage(pg)}
                  className={`w-8 h-8 rounded-xl text-xs font-black ${page === pg ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-900'}`}
                >
                  {pg}
                </button>
              ))}
              <button
                onClick={() => goPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}