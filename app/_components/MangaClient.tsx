"use client";
// app/_components/MangaClient.tsx
// ⚡ v3 — filter/pagination ย้ายไปฝั่ง Server แล้ว
//   Client รับแค่ data หน้าปัจจุบัน → payload เล็กลง ~90%
//   filter = navigate URL ใหม่ → SEO-friendly, shareable links
//   ไม่มี client-side fetch ยกเว้น openModal (lazy)
import React, { useState, useRef, useCallback, useMemo, memo, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Sun, Moon, ChevronRight, ChevronLeft, ChevronDown,
  Search as SearchIcon, X, Play, List, BookOpen, Flame, Globe,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const COUNTRIES = [
  { key: 'all',   label: 'ทั้งหมด', flag: '🌏' },
  { key: 'japan', label: 'ญี่ปุ่น', flag: '🇯🇵' },
  { key: 'korea', label: 'เกาหลี',  flag: '🇰🇷' },
  { key: 'china', label: 'จีน',     flag: '🇨🇳' },
] as const;

export interface Manga {
  id: string;
  title: string;
  cover: string;
  genres: string[];
  country: string;
  desc?: string;
  view_count: number;
  rating_avg: number;
  rating_count: number;
}

interface Chapter { id: string; title: string; number: number; }

interface Props {
  mangas: Manga[];
  banner: Manga[];
  availableGenres: string[];
  total: number;
  totalPages: number;
  currentPage: number;
  currentQ: string;
  currentGenre: string;
  currentCountry: string;
}

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

// ─── URL builder helper ───────────────────────────────────────────────────────
function buildUrl(params: Record<string, string>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== 'all' && v !== '1') sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `/?${s}` : '/';
}

// ─── BANNER SLIDER ────────────────────────────────────────────────────────────
const BannerSlider = memo(function BannerSlider({ items }: { items: Manga[] }) {
  const [cur, setCur] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setCur((c) => (c + 1) % items.length), 7000);
  }, [items.length]);

  React.useEffect(() => {
    if (!items.length) return;
    startTimer();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [items.length, startTimer]);

  const goTo = useCallback((i: number) => { setCur(i); startTimer(); }, [startTimer]);

  if (!items.length) return null;

  return (
    <section className="px-4 md:px-6 max-w-7xl mx-auto">
      <div className="relative h-[360px] md:h-[420px] rounded-[2rem] overflow-hidden bg-zinc-900">
        {items.map((m, i) => (
          <a
            key={m.id}
            href={`/manga/${encodeURIComponent(m.id)}`}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === cur ? 1 : 0, pointerEvents: i === cur ? 'auto' : 'none', zIndex: i === cur ? 10 : 0 }}
          >
            <Image src={m.cover} alt="" fill sizes="100vw" className="object-cover scale-110 blur-2xl opacity-30" priority={i === 0} aria-hidden />
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent md:block hidden" />
            <div className="relative z-10 h-full flex flex-col md:flex-row md:items-center px-5 md:px-12 pb-5 md:pb-0 gap-4 md:gap-7 justify-end md:justify-start">
              <div className="relative shrink-0 mx-auto md:mx-0 w-[100px] h-[133px] md:w-[140px] md:h-[187px] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-white/15 overflow-hidden bg-zinc-800">
                <Image src={m.cover} alt={m.title} fill sizes="(max-width: 768px) 100px, 140px" className="object-cover object-top" priority={i === 0} />
              </div>
              <div className="text-white flex-1 text-center md:text-left">
                <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.3em] mb-1">มังงะแนะนำ</p>
                <h2 className="text-lg md:text-3xl font-black mb-1.5 leading-tight line-clamp-2">{m.title}</h2>
                <div className="flex flex-wrap gap-1 mb-2 justify-center md:justify-start">
                  {m.genres.slice(0, 3).map((g) => (
                    <span key={g} className="bg-white/10 border border-white/10 px-2 py-0.5 rounded-full text-[8px] font-bold text-zinc-300">{g}</span>
                  ))}
                </div>
                <div className="flex items-center gap-3 mb-3 justify-center md:justify-start text-zinc-400">
                  {(m.rating_avg ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold">
                      <span className="text-yellow-400">★</span>{m.rating_avg.toFixed(1)}
                    </span>
                  )}
                  {(m.view_count ?? 0) > 0 && (
                    <span className="text-[10px]">
                      👁 {m.view_count >= 1_000_000 ? `${(m.view_count/1_000_000).toFixed(1)}M` : m.view_count >= 1000 ? `${(m.view_count/1000).toFixed(1)}K` : m.view_count} ครั้ง
                    </span>
                  )}
                </div>
                {m.desc && <p className="text-zinc-400 text-[11px] leading-relaxed mb-3 line-clamp-2 max-w-md mx-auto md:mx-0">{m.desc}</p>}
                <span className="inline-flex items-center gap-2 bg-white text-black px-5 py-2 rounded-full text-[11px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors">
                  อ่านตอนนี้ <ChevronRight size={11} />
                </span>
              </div>
            </div>
          </a>
        ))}
        <div className="absolute bottom-3 right-4 flex gap-1.5 z-20">
          {items.map((_, i) => (
            <button key={i} onClick={(e) => { e.preventDefault(); goTo(i); }} aria-label={`Slide ${i + 1}`}
              className={`rounded-full transition-all duration-300 ${i === cur ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30'}`} />
          ))}
        </div>
      </div>
    </section>
  );
});

// ─── MANGA CARD ───────────────────────────────────────────────────────────────
const MangaCard = memo(function MangaCard({ m, priority }: { m: Manga; priority?: boolean }) {
  const flag = COUNTRIES.find((c) => c.key === m.country)?.flag || '🌏';
  return (
    <a href={`/manga/${encodeURIComponent(m.id)}`} className="group cursor-pointer select-none block">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 transition-transform duration-300 group-hover:scale-95 ring-1 ring-transparent group-hover:ring-blue-500/40">
        <Image src={m.cover} alt={m.title} fill sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 20vw, (max-width: 1280px) 16vw, 12vw" className="object-cover" priority={priority} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] font-black text-white">{flag}</div>
      </div>
      <div className="mt-1.5">
        <h3 className="text-[10px] font-bold leading-snug line-clamp-2 group-hover:text-blue-500 transition-colors">{m.title}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          {(m.rating_avg ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <span className="text-yellow-400 text-[9px]">★</span>
              <span className="text-[9px] font-bold text-zinc-400">{m.rating_avg.toFixed(1)}</span>
            </span>
          )}
          {(m.view_count ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <span className="text-[8px] text-zinc-600">👁</span>
              <span className="text-[9px] text-zinc-500">
                {m.view_count >= 1_000_000 ? `${(m.view_count/1_000_000).toFixed(1)}M` : m.view_count >= 1_000 ? `${(m.view_count/1_000).toFixed(1)}K` : m.view_count}
              </span>
            </span>
          )}
        </div>
      </div>
    </a>
  );
});

// ─── chapter cache ────────────────────────────────────────────────────────────
const chapterCache = new Map<string, Chapter[]>();

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function MangaClient({
  mangas,
  banner,
  availableGenres,
  total,
  totalPages,
  currentPage,
  currentQ,
  currentGenre,
  currentCountry,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  // dark mode — sync จาก localStorage ไม่ flicker
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('manga-theme') !== 'light';
  });

  // search input เก็บ local state เพื่อ debounce
  const [inputQ, setInputQ] = useState(currentQ);

  // modal state
  const [mOpen, setMOpen]       = useState(false);
  const [mManga, setMManga]     = useState<Manga | null>(null);
  const [mChaps, setMChaps]     = useState<Chapter[]>([]);
  const [mLoading, setMLoading] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  // ── navigate helper ──────────────────────────────────────────────────────────
  const navigate = useCallback((params: Record<string, string>) => {
    startTransition(() => {
      router.push(buildUrl(params));
      listRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
  }, [router]);

  const setFilter = useCallback((key: string, value: string) => {
    navigate({ page: '1', q: currentQ, genre: currentGenre, country: currentCountry, [key]: value });
  }, [navigate, currentQ, currentGenre, currentCountry]);

  // debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((v: string) => {
    setInputQ(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      navigate({ page: '1', q: v, genre: currentGenre, country: currentCountry });
    }, 400);
  }, [navigate, currentGenre, currentCountry]);

  const resetFilters = useCallback(() => {
    setInputQ('');
    navigate({ page: '1', q: '', genre: 'all', country: 'all' });
  }, [navigate]);

  const goPage = useCallback((p: number) => {
    navigate({ page: String(p), q: currentQ, genre: currentGenre, country: currentCountry });
  }, [navigate, currentQ, currentGenre, currentCountry]);

  const toggleDark = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('manga-theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  // modal
  const openModal = useCallback(async (manga: Manga) => {
    setMManga(manga);
    setMOpen(true);
    setDropOpen(false);
    if (chapterCache.has(manga.title)) {
      setMChaps(chapterCache.get(manga.title)!);
      setMLoading(false);
      return;
    }
    setMChaps([]);
    setMLoading(true);
    const { data } = await supabase.from('chapters').select('id, chapter_title').eq('manga_title', manga.title);
    if (data) {
      const sorted = [...data]
        .sort((a, b) => extractChapterNum(b.chapter_title) - extractChapterNum(a.chapter_title))
        .map((ch) => ({
          id: ch.id as string,
          number: extractChapterNum(ch.chapter_title),
          title: (ch.chapter_title as string).replace(/^(?:Manhwa|Manhua|Manga)(?:Color|BW)?\s*/i, '').trim() || ch.chapter_title,
        }));
      chapterCache.set(manga.title, sorted);
      setMChaps(sorted);
    }
    setMLoading(false);
  }, []);

  const paginationGroup = useMemo(() => {
    const s = Math.max(currentPage - 2, 1);
    const e = Math.min(s + 4, totalPages);
    return Array.from({ length: Math.max(0, e - s + 1) }, (_, i) => s + i);
  }, [currentPage, totalPages]);

  const hasActiveFilter = currentCountry !== 'all' || currentGenre !== 'all' || currentQ !== '';
  const showBanner = !currentQ && currentPage === 1 && currentCountry === 'all' && currentGenre === 'all';

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 pb-16">

      {/* ─── MODAL ─── */}
      {mOpen && mManga && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/85"
          onClick={(e) => { if (e.target === e.currentTarget) setMOpen(false); }}>
          <div className="bg-white dark:bg-[#0d0d0d] w-full md:max-w-4xl h-[90vh] md:h-[85vh] rounded-t-[1.5rem] md:rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800 relative">
            <button onClick={() => setMOpen(false)} className="absolute top-4 right-4 z-50 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 border border-white/10" aria-label="ปิด">
              <X size={16} />
            </button>
            <div className="relative h-36 md:h-44 shrink-0 overflow-hidden bg-zinc-800">
              <Image src={mManga.cover} alt="" fill sizes="100vw" className="object-cover blur-2xl scale-110 opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#0d0d0d] to-transparent" />
              <div className="absolute bottom-0 left-6 md:left-10 translate-y-1/2 z-10">
                <div className="relative w-20 md:w-28 aspect-[2/3] rounded-xl shadow-2xl border-2 border-white dark:border-zinc-800 bg-zinc-800 overflow-hidden">
                  <Image src={mManga.cover} alt={mManga.title} fill sizes="112px" className="object-cover" />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pt-14 md:pt-18 pb-8 px-6 md:px-10">
              <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                <div className="flex-1 min-w-0 space-y-3">
                  <h2 className="text-xl md:text-2xl font-black leading-tight">{mManga.title}</h2>
                  {mManga.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {mManga.genres.map((g) => (
                        <span key={g} className="px-2 py-0.5 bg-blue-600/10 text-blue-500 dark:text-blue-400 rounded-full text-[10px] font-bold border border-blue-500/20">{g}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-400 font-bold">
                    {COUNTRIES.find((c) => c.key === mManga.country)?.flag}{' '}
                    {COUNTRIES.find((c) => c.key === mManga.country)?.label || mManga.country}
                  </p>
                </div>
                <div className="w-full md:w-64 shrink-0">
                  {mLoading ? (
                    <div className="flex justify-center py-10">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
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
                        <button onClick={() => setDropOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-bold">
                          <span><List size={13} className="inline mr-1 text-blue-500" /> รายชื่อตอน ({mChaps.length})</span>
                          <ChevronDown size={14} className={dropOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>
                        {dropOpen && (
                          <div className="border-t border-zinc-200 dark:border-zinc-800 max-h-52 overflow-y-auto">
                            {mChaps.map((ch) => (
                              <a key={ch.id} href={`/manga/${encodeURIComponent(mManga.id)}/read/${ch.id}`}
                                className="block px-4 py-2.5 text-[10px] font-bold border-b border-zinc-100 dark:border-zinc-800/50 hover:text-blue-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                {ch.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <a href={`/manga/${encodeURIComponent(mManga.id)}`} className="w-full block text-center text-[10px] text-zinc-400 hover:text-blue-500 py-2 font-bold">
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
          <a href="/" className="text-lg font-black italic text-blue-600 tracking-tight uppercase shrink-0">MANGA.COM</a>
          <div className="flex-1 max-w-sm flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 px-3.5 py-2 rounded-xl border border-transparent focus-within:border-blue-500/40 transition-colors">
            <SearchIcon size={14} className="text-zinc-400 shrink-0 pointer-events-none" />
            <input
              type="search"
              placeholder="ค้นหาชื่อมังงะ..."
              value={inputQ}
              onChange={(e) => handleSearch(e.target.value)}
              className="bg-transparent outline-none w-full text-sm"
            />
            {inputQ && (
              <button onClick={() => { setInputQ(''); navigate({ page: '1', q: '', genre: currentGenre, country: currentCountry }); }} aria-label="ล้าง">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* loading indicator */}
            {isPending && <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />}
            <span className="text-[10px] text-zinc-500 font-bold hidden md:block tabular-nums">{total} เรื่อง</span>
            <button onClick={toggleDark} className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40 transition-colors" aria-label={dark ? 'Light mode' : 'Dark mode'}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* ─── FILTER BAR ─── */}
      <div className="px-4 md:px-6 max-w-7xl mx-auto mt-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Globe size={12} className="text-zinc-400" />
          {COUNTRIES.map((c) => (
            <button key={c.key} onClick={() => setFilter('country', c.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all ${
                currentCountry === c.key
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}>
              {c.flag} {c.label}
            </button>
          ))}
        </div>

        {availableGenres.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setFilter('genre', 'all')}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                currentGenre === 'all' ? 'bg-orange-500 text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}>
              ทุกประเภท
            </button>
            {availableGenres.map((g) => (
              <button key={g} onClick={() => setFilter('genre', g)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black transition-all ${
                  currentGenre === g ? 'bg-orange-500 text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}>
                {g}
              </button>
            ))}
          </div>
        )}

        {hasActiveFilter && (
          <button onClick={resetFilters} className="text-[10px] text-zinc-400 hover:text-red-500 font-bold flex items-center gap-1 transition-colors">
            <X size={10} /> ล้าง filter ทั้งหมด
          </button>
        )}
      </div>

      {/* ─── MAIN ─── */}
      <main className="mt-5 space-y-7">
        {showBanner && <BannerSlider items={banner} />}

        <section className="px-4 md:px-6 max-w-7xl mx-auto" ref={listRef}>
          <div className="flex items-center gap-2 mb-4">
            <Flame size={14} className="text-orange-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
              {currentQ
                ? `ผลการค้นหา: "${currentQ}" — ${total} เรื่อง`
                : `รายการทั้งหมด — หน้า ${Math.min(currentPage, totalPages)}/${totalPages} (${total} เรื่อง)`}
            </span>
          </div>

          {/* ── overlay ตอน pending ── */}
          <div className={`transition-opacity duration-200 ${isPending ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            {mangas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
                <SearchIcon size={24} className="opacity-20" />
                <p className="text-sm font-bold">ไม่พบมังงะที่ตรงกับ filter</p>
                <button onClick={resetFilters} className="text-xs text-blue-500 font-bold hover:underline">ล้าง filter</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4">
                {mangas.map((m, i) => (
                  <MangaCard key={m.id} m={m} priority={i < 8} />
                ))}
              </div>
            )}
          </div>

          {/* ── PAGINATION ── */}
          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-1.5">
              <button onClick={() => goPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="หน้าก่อน"
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 disabled:opacity-30 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                <ChevronLeft size={14} />
              </button>
              {paginationGroup.map((pg) => (
                <button key={pg} onClick={() => goPage(pg)} aria-label={`หน้า ${pg}`} aria-current={currentPage === pg ? 'page' : undefined}
                  className={`w-8 h-8 rounded-xl text-xs font-black transition-colors ${
                    currentPage === pg ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}>
                  {pg}
                </button>
              ))}
              <button onClick={() => goPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label="หน้าถัดไป"
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 disabled:opacity-30 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}