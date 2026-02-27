"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import Image from 'next/image';
import {
  Loader2, Sun, Moon, ChevronRight, ChevronLeft, ChevronDown,
  Search as SearchIcon, X, Play, List, BookOpen, Flame, Globe
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ ใช้ next/image optimization แทน proxy โดยตรง
// next/image จะ resize + compress + serve จาก CDN อัตโนมัติ
const optimizedSrc = (url: string) =>
  url && url.startsWith('http') && !url.includes('placehold.co') ? url : url;

const COUNTRIES = [
  { key: 'all',   label: 'ทั้งหมด', flag: '🌏' },
  { key: 'japan', label: 'ญี่ปุ่น', flag: '🇯🇵' },
  { key: 'korea', label: 'เกาหลี',  flag: '🇰🇷' },
  { key: 'china', label: 'จีน',     flag: '🇨🇳' },
];

export interface Manga {
  id: string;
  title: string;
  cover: string;
  genres: string[];
  country: string;
  view_count: number;
  rating_avg: number;
}
interface Chapter { id: string; title: string; url: string; number: number; }

const PER_PAGE = 24;

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

// ─── BANNER SLIDER ───
// ✅ preload รูป banner แรก — ผู้ใช้เห็นรูปทันทีโดยไม่ต้องรอ
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
            {/* ✅ priority=true บน banner แรก = preload ทันที */}
            <Image
              src={optimizedSrc(m.cover)}
              alt=""
              fill
              sizes="100vw"
              className="object-cover scale-110 blur-2xl opacity-25"
              priority={i === 0}
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="relative z-10 h-full flex items-end md:items-center px-8 md:px-12 pb-8 md:pb-0 gap-7">
              <div className="hidden md:block relative h-48 w-32 rounded-xl shadow-2xl border border-white/10 flex-shrink-0 bg-zinc-800 overflow-hidden">
                <Image
                  src={optimizedSrc(m.cover)}
                  alt={m.title}
                  fill
                  sizes="128px"
                  className="object-cover"
                  priority={i === 0}
                />
              </div>
              <div className="text-white flex-1">
                <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.3em] mb-1.5">มังงะแนะนำ</p>
                <h2 className="text-2xl md:text-3xl font-black mb-2.5 leading-tight line-clamp-2">{m.title}</h2>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {m.genres.slice(0, 3).map(g => (
                    <span key={g} className="bg-white/10 border border-white/10 px-2.5 py-1 rounded-full text-[9px] font-bold text-zinc-300">{g}</span>
                  ))}
                </div>
                <button className="bg-white text-black px-7 py-2.5 rounded-full text-[11px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2 w-fit">
                  อ่านตอนนี้ <ChevronRight size={12} />
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

// ─── MANGA CARD ───
// ✅ next/image lazy load อัตโนมัติ + serve รูป resize แล้วจาก CDN
const MangaCard = memo(({ m, onOpen, priority }: { m: Manga, onOpen: (m: Manga) => void, priority?: boolean }) => {
  const [err, setErr] = useState(false);
  const src = err
    ? `https://placehold.co/300x420/111827/3b82f6?text=${encodeURIComponent(m.title.slice(0, 12))}`
    : optimizedSrc(m.cover);
  const flag = COUNTRIES.find(c => c.key === m.country)?.flag || '🌏';

  return (
    <div onClick={() => onOpen(m)} className="group cursor-pointer select-none">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 transition-transform duration-300 group-hover:scale-95 ring-1 ring-transparent group-hover:ring-blue-500/40">
        <Image
          src={src}
          alt={m.title}
          fill
          // ✅ sizes บอก browser ขนาดจริงที่แสดง — โหลดรูปขนาดพอดี ไม่เปลือง bandwidth
          sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 20vw, (max-width: 1280px) 16vw, 12vw"
          className="object-cover"
          // ✅ 8 การ์ดแรกโหลดทันที ที่เหลือ lazy
          priority={priority}
          onError={() => setErr(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] font-black text-white">{flag}</div>
      </div>
      <div className="mt-1.5">
        <h3 className="text-[10px] font-bold leading-snug line-clamp-2 group-hover:text-blue-500 transition-colors">{m.title}</h3>{true && (<div className="flex items-center gap-0.5 mt-0.5"><span className="text-yellow-400 text-[9px]">?</span><span className="text-[9px] font-bold text-zinc-400">{m.rating_avg.toFixed(1)}</span></div>)}
      </div>
    </div>
  );
});
MangaCard.displayName = 'MangaCard';

// ─── MAIN ───
export default function MangaClient({ mangas: initialMangas }: { mangas: Manga[] }) {
  const [dark, setDark]                       = useState(true);
  const [query, setQuery]                     = useState("");
  const [page, setPage]                       = useState(1);
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [selectedGenre, setSelectedGenre]     = useState("all");

  const [mOpen, setMOpen]       = useState(false);
  const [mManga, setMManga]     = useState<Manga | null>(null);
  const [mChaps, setMChaps]     = useState<Chapter[]>([]);
  const [mLoading, setMLoading] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = localStorage.getItem('manga-theme') !== 'light';
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
  }, []);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    initialMangas.forEach(m => m.genres?.forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [initialMangas]);

  const { total, totalPages, mangas } = useMemo(() => {
    let f = initialMangas;
    if (selectedCountry !== 'all') f = f.filter(m => m.country === selectedCountry);
    if (selectedGenre !== 'all')   f = f.filter(m => m.genres.includes(selectedGenre));
    if (query) {
      const q = query.toLowerCase();
      f = f.filter(m => m.title.toLowerCase().includes(q));
    }
    const total      = f.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const safePage   = Math.min(page, totalPages);
    const start      = (safePage - 1) * PER_PAGE;
    return { total, totalPages, mangas: f.slice(start, start + PER_PAGE) };
  }, [initialMangas, page, query, selectedCountry, selectedGenre]);

  const banner = useMemo(() => initialMangas.slice(0, 5), [initialMangas]);

  const openModal = useCallback(async (manga: Manga) => {
    setMManga(manga); setMChaps([]); setMLoading(true); setMOpen(true); setDropOpen(false);
    const { data } = await supabase
      .from('chapters')
      .select('id, chapter_title, source_url')
      .eq('manga_title', manga.title);
    if (data) {
      const sorted = [...data].sort((a, b) =>
        extractChapterNum(b.chapter_title) - extractChapterNum(a.chapter_title)
      );
      setMChaps(sorted.map(ch => ({
        id:     ch.id,
        number: extractChapterNum(ch.chapter_title),
        title:  ch.chapter_title
          .replace(/^(?:Manhwa|Manhua|Manga)(?:Color|BW)?\s*/i, '')
          .replace(/\s*(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*$/i, '')
          .trim() || ch.chapter_title,
        url: ch.source_url,
      })));
    }
    setMLoading(false);
  }, []);

  const resetFilters = useCallback(() => { setSelectedCountry('all'); setSelectedGenre('all'); setQuery(''); setPage(1); }, []);
  const goPage = useCallback((p: number) => {
    setPage(p);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const paginationGroup = useMemo(() => {
    const s = Math.max(page - 2, 1);
    const e = Math.min(s + 4, totalPages);
    return Array.from({ length: Math.max(0, e - s + 1) }, (_, i) => s + i);
  }, [page, totalPages]);

  const hasActiveFilter = selectedCountry !== 'all' || selectedGenre !== 'all' || query !== '';

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 pb-16">

      {/* ─── MODAL ─── */}
      {mOpen && mManga && (
        <div
          className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/85"
          onClick={e => { if (e.target === e.currentTarget) setMOpen(false); }}
        >
          <div className="bg-white dark:bg-[#0d0d0d] w-full md:max-w-4xl h-[90vh] md:h-[85vh] rounded-t-[1.5rem] md:rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800 relative">
            <button onClick={() => setMOpen(false)} className="absolute top-4 right-4 z-50 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 border border-white/10">
              <X size={16} />
            </button>
            <div className="relative h-36 md:h-44 shrink-0 overflow-hidden bg-zinc-800">
              <Image src={optimizedSrc(mManga.cover)} alt="" fill sizes="100vw" className="object-cover blur-2xl scale-110 opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#0d0d0d] to-transparent" />
              <div className="absolute bottom-0 left-6 md:left-10 translate-y-1/2 z-10">
                <div className="relative w-20 md:w-28 aspect-[2/3] rounded-xl shadow-2xl border-2 border-white dark:border-zinc-800 bg-zinc-800 overflow-hidden">
                  <Image src={optimizedSrc(mManga.cover)} alt={mManga.title} fill sizes="112px" className="object-cover" />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pt-14 md:pt-18 pb-8 px-6 md:px-10">
              <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                <div className="flex-1 min-w-0 space-y-3">
                  <h1 className="text-xl md:text-2xl font-black leading-tight">{mManga.title}</h1>
                  {mManga.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {[...new Set(mManga.genres)].map((g, i) => (
                        <span key={`${g}-${i}`} className="px-2 py-0.5 bg-blue-600/10 text-blue-500 dark:text-blue-400 rounded-full text-[10px] font-bold border border-blue-500/20">{g}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-400 font-bold">
                    {COUNTRIES.find(c => c.key === mManga.country)?.flag}{' '}
                    {COUNTRIES.find(c => c.key === mManga.country)?.label || mManga.country}
                  </p>
                </div>
                <div className="w-full md:w-64 shrink-0">
                  {mLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-600" /></div>
                  ) : mChaps.length > 0 ? (
                    <div className="space-y-2">
                      <a href={`/manga/${encodeURIComponent(mManga.id)}/read/${mChaps[0].id}`}
                        className="w-full bg-blue-600 text-white flex justify-center items-center py-3 rounded-xl font-black text-sm hover:bg-blue-500 transition-colors">
                        <Play size={14} className="mr-2" /> ล่าสุด
                      </a>
                      <a href={`/manga/${encodeURIComponent(mManga.id)}/read/${mChaps[mChaps.length - 1].id}`}
                        className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white flex justify-center items-center py-3 rounded-xl font-black text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                        <BookOpen size={14} className="mr-2" /> ตอนแรก
                      </a>
                      <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mt-2">
                        <button onClick={() => setDropOpen(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-bold">
                          <span><List size={13} className="inline mr-1 text-blue-500" /> รายชื่อตอน ({mChaps.length})</span>
                          <ChevronDown size={14} className={dropOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>
                        {dropOpen && (
                          <div className="border-t border-zinc-200 dark:border-zinc-800 max-h-52 overflow-y-auto">
                            {mChaps.map((ch, i) => (
                              <a key={i} href={`/manga/${encodeURIComponent(mManga.id)}/read/${ch.id}`}
                                className="block px-4 py-2.5 text-[10px] font-bold border-b border-zinc-100 dark:border-zinc-800/50 hover:text-blue-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                {ch.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <a href={`/manga/${encodeURIComponent(mManga.id)}`}
                        className="w-full block text-center text-[10px] text-zinc-400 hover:text-blue-500 py-2 font-bold">
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
          <div className="flex-1 max-w-sm flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 px-3.5 py-2 rounded-xl border border-transparent focus-within:border-blue-500/40 transition-colors">
            <SearchIcon size={14} className="text-zinc-400 shrink-0" />
            <input
              type="text"
              placeholder="ค้นหาชื่อมังงะ..."
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
                const d = !dark; setDark(d);
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
        <div className="flex items-center gap-2 flex-wrap">
          <Globe size={12} className="text-zinc-400" />
          {COUNTRIES.map(c => (
            <button key={c.key} onClick={() => { setSelectedCountry(c.key); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all ${
                selectedCountry === c.key
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}>
              {c.flag} {c.label}
            </button>
          ))}
        </div>
        {availableGenres.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => { setSelectedGenre('all'); setPage(1); }}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                selectedGenre === 'all' ? 'bg-orange-500 text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}>
              ทุกประเภท
            </button>
            {availableGenres.map(g => (
              <button key={g} onClick={() => { setSelectedGenre(g); setPage(1); }}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                  selectedGenre === g ? 'bg-orange-500 text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}>
                {g}
              </button>
            ))}
          </div>
        )}
        {hasActiveFilter && (
          <button onClick={resetFilters} className="text-[10px] text-zinc-400 hover:text-red-500 font-bold flex items-center gap-1">
            <X size={10} /> ล้าง filter ทั้งหมด
          </button>
        )}
      </div>

      {/* ─── MAIN ─── */}
      <main className="mt-5 space-y-7">
        {!query && page === 1 && selectedCountry === 'all' && selectedGenre === 'all' && (
          <BannerSlider items={banner} onOpen={openModal} />
        )}

        <section className="px-4 md:px-6 max-w-7xl mx-auto" ref={listRef}>
          <div className="flex items-center gap-2 mb-4">
            <Flame size={14} className="text-orange-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
              {query
                ? `ผลการค้นหา: "${query}" — ${total} เรื่อง`
                : `รายการทั้งหมด — หน้า ${Math.min(page, totalPages)}/${totalPages} (${total} เรื่อง)`}
            </span>
          </div>

          {mangas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
              <SearchIcon size={24} className="opacity-20" />
              <p className="text-sm font-bold">ไม่พบมังงะที่ตรงกับ filter</p>
              <button onClick={resetFilters} className="text-xs text-blue-500 font-bold hover:underline">ล้าง filter</button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4">
              {mangas.map((m, i) => (
                <MangaCard
                  key={m.id}
                  m={m}
                  onOpen={openModal}
                  // ✅ 8 การ์ดแรกโหลดทันที (above the fold) ที่เหลือ lazy
                  priority={i < 8}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-1.5">
              <button onClick={() => goPage(Math.max(1, page - 1))} disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              {paginationGroup.map(pg => (
                <button key={pg} onClick={() => goPage(pg)}
                  className={`w-8 h-8 rounded-xl text-xs font-black ${page === pg ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-900'}`}>
                  {pg}
                </button>
              ))}
              <button onClick={() => goPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


