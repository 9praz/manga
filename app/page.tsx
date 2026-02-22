"use client";
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  Loader2, Sun, Moon, ChevronRight, ChevronLeft, ChevronDown,
  Globe, Search as SearchIcon, X, Play, List, Info,
  BookOpen, ExternalLink, Flame, RefreshCw
} from 'lucide-react';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface Source  { name: string; url: string; }
interface Manga   { title: string; cover: string; genres: string[]; desc?: string; country?: string; sources: Source[]; }
interface Catalog { total: number; genre_list: string[]; manga: Manga[]; }
interface Chapter { title: string; url: string; }

// ─────────────────────────────────────────────────────────
// Cover proxy — รูปทุกใบต้องผ่าน /api/proxy-image
// ─────────────────────────────────────────────────────────
function proxyCover(url: string): string {
  if (!url) return '';
  if (url.startsWith('/api/proxy-image')) return url;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

// ─────────────────────────────────────────────────────────
// Source priority
// ─────────────────────────────────────────────────────────
const SOURCE_PRIORITY = [
  "Manga168","MangaKimi","Mangastep","LamiManga","PopsManga",
  "ReaperTrans","TanukiManga","Makimaaaaa","SpeedManga","ToomTamManga",
  "Sodsaime","Doodmanga","ManhuaBug","ManhuaKey","ManhuaThai",
  "ManhwaBreakup","Nekopost",
];
function getBestSource(sources: Source[]): Source {
  for (const name of SOURCE_PRIORITY) {
    const s = sources.find(s => s.name === name);
    if (s) return s;
  }
  return sources[0];
}

// ─────────────────────────────────────────────────────────
// Chapter fetcher
// ─────────────────────────────────────────────────────────
async function fetchChapters(manga: Manga): Promise<Chapter[]> {
  const best = getBestSource(manga.sources);
  if (best.url.includes("nekopost.net")) {
    const pid = best.url.split("/").pop();
    try {
      const res = await fetch(`https://www.nekopost.net/api/project/detail/${pid}`,
        { signal: AbortSignal.timeout(8000) });
      const json = await res.json();
      return (json.listChapter || [])
        .sort((a: any, b: any) => parseFloat(b.chapterNo) - parseFloat(a.chapterNo))
        .map((ch: any) => ({
          title: `ตอนที่ ${ch.chapterNo}${ch.chapterName?' — '+ch.chapterName:''}`,
          url: `https://www.nekopost.net/manga/${pid}/${ch.chapterId}`,
        }));
    } catch { return []; }
  }
  try {
    const res = await fetch(
      `http://localhost:8000/api/chapters?manga_url=${encodeURIComponent(best.url)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.chapters?.length) return data.chapters;
    }
  } catch { }
  return [];
}

// ─────────────────────────────────────────────────────────
// Country labels
// ─────────────────────────────────────────────────────────
const COUNTRY_LABEL: Record<string, string> = {
  JP: "🇯🇵 มังงะญี่ปุ่น",
  KR: "🇰🇷 มังงะเกาหลี",
  CN: "🇨🇳 มังงะจีน",
  OTHER: "🌐 อื่นๆ",
};
const COUNTRY_LABEL_EN: Record<string, string> = {
  JP: "🇯🇵 Japanese",
  KR: "🇰🇷 Korean",
  CN: "🇨🇳 Chinese",
  OTHER: "🌐 Other",
};

// ─────────────────────────────────────────────────────────
// UI Text
// ─────────────────────────────────────────────────────────
const T = {
  th: {
    readNow:"อ่านตอนนี้", genres:"หมวดหมู่", all:"ทั้งหมด",
    country:"ประเทศ",
    searchPlaceholder:"ค้นหาชื่อมังงะ...", recommended:"มังงะแนะนำ",
    readFirst:"เริ่มอ่านตอนแรก", readLatest:"อ่านตอนล่าสุด",
    chapterList:"รายชื่อตอน", selectCh:"— เลือกตอน —",
    noChapters:"ไม่พบตอน", sources:"แหล่งที่มา",
    noDesc:"ไม่มีเรื่องย่อ", synopsis:"เรื่องย่อ",
    allTitles:"รายการทั้งหมด (เรียงตามความนิยม)",
    searchResult:"ผลการค้นหา", toggleLang:"English",
    noFile:"ไม่พบ manga_catalog.json",
    serverOff:"server.py ไม่ได้รัน — กดแหล่งที่มาเพื่ออ่านโดยตรง",
    openDirect:"อ่านที่ต้นฉบับ",
    popularity:"ความนิยม",
  },
  en: {
    readNow:"Read Now", genres:"Genres", all:"All",
    country:"Country",
    searchPlaceholder:"Search manga...", recommended:"Recommended",
    readFirst:"Read First Chapter", readLatest:"Read Latest",
    chapterList:"Chapter List", selectCh:"— Select chapter —",
    noChapters:"No chapters found", sources:"Sources",
    noDesc:"No description", synopsis:"Synopsis",
    allTitles:"All Titles (by popularity)",
    searchResult:"Search Result", toggleLang:"ภาษาไทย",
    noFile:"manga_catalog.json not found",
    serverOff:"server.py offline — use source links to read",
    openDirect:"Read at Source",
    popularity:"Popularity",
  },
};

// ─────────────────────────────────────────────────────────
// Banner
// ─────────────────────────────────────────────────────────
const BannerSlider = memo(({ items, onOpen, t }: {
  items: Manga[], onOpen: (m: Manga) => void, t: typeof T.th
}) => {
  const [cur, setCur] = useState(0);
  useEffect(() => {
    if (!items.length) return;
    const id = setInterval(() => setCur(p => (p+1) % items.length), 7000);
    return () => clearInterval(id);
  }, [items.length]);
  if (!items.length) return null;

  return (
    <section className="px-4 md:px-6 max-w-7xl mx-auto">
      <div className="relative h-[320px] md:h-[420px] rounded-[2rem] overflow-hidden bg-zinc-900">
        {items.map((m, i) => {
          const cover = proxyCover(m.cover);
          return (
            <div key={i}
              className={`absolute inset-0 cursor-pointer transition-opacity duration-1000 ${i===cur?'opacity-100 z-10':'opacity-0 pointer-events-none'}`}
              onClick={() => onOpen(m)}>
              <img src={cover} className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-25" alt="" aria-hidden />
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="relative z-10 h-full flex items-end md:items-center px-8 md:px-12 pb-8 md:pb-0 gap-7">
                {/* Cover — ชัดเจน ไม่เบลอ */}
                <img src={cover} alt={m.title}
                  className="hidden md:block h-56 w-auto aspect-[2/3] object-cover rounded-xl shadow-2xl border border-white/10 flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                <div className="text-white flex-1">
                  <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.3em] mb-1.5">{t.recommended}</p>
                  <h2 className="text-2xl md:text-3xl font-black mb-2.5 leading-tight line-clamp-2">{m.title}</h2>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {m.country && (
                      <span className="bg-blue-600/30 border border-blue-500/30 px-2.5 py-1 rounded-full text-[9px] font-black text-blue-300">
                        {m.country === 'JP' ? '🇯🇵' : m.country === 'KR' ? '🇰🇷' : '🇨🇳'} {m.country}
                      </span>
                    )}
                    {m.genres.slice(0,3).map((g,gi) => (
                      <span key={gi} className="bg-white/10 border border-white/10 px-2.5 py-1 rounded-full text-[9px] font-bold text-zinc-300">{g}</span>
                    ))}
                    <span className="text-zinc-500 text-[9px] self-center">{m.sources.length} แหล่ง</span>
                  </div>
                  {m.desc && <p className="text-zinc-400 text-xs leading-relaxed line-clamp-2 mb-4 max-w-lg hidden md:block">{m.desc}</p>}
                  <button className="bg-white text-black px-7 py-2.5 rounded-full text-[11px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2 w-fit">
                    {t.readNow} <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <div className="absolute bottom-3 right-5 flex gap-1.5 z-20">
          {items.map((_,i) => (
            <button key={i} onClick={() => setCur(i)}
              className={`rounded-full transition-all ${i===cur?'w-5 h-1.5 bg-white':'w-1.5 h-1.5 bg-white/30'}`} />
          ))}
        </div>
      </div>
    </section>
  );
});
BannerSlider.displayName = 'BannerSlider';

// ─────────────────────────────────────────────────────────
// MangaCard
// ─────────────────────────────────────────────────────────
const COUNTRY_FLAG: Record<string,string> = { JP:"🇯🇵", KR:"🇰🇷", CN:"🇨🇳", OTHER:"🌐" };

const MangaCard = memo(({ m, onOpen }: { m: Manga, onOpen: (m: Manga) => void }) => {
  const [err, setErr] = useState(false);
  const src = err
    ? `https://placehold.co/300x420/111827/3b82f6?text=${encodeURIComponent(m.title.slice(0,12))}`
    : proxyCover(m.cover);

  return (
    <div onClick={() => onOpen(m)} className="group cursor-pointer select-none">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 transition-transform duration-300 group-hover:scale-95 ring-1 ring-transparent group-hover:ring-blue-500/40">
        <img src={src} alt={m.title} loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setErr(true)} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[7px] font-black text-white">THAI</div>
        {m.country && (
          <div className="absolute bottom-1.5 left-1.5 text-[10px]">{COUNTRY_FLAG[m.country] || ''}</div>
        )}
        {m.sources.length > 1 && (
          <div className="absolute top-1.5 right-1.5 bg-blue-600 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black text-white">{m.sources.length}</div>
        )}
      </div>
      <div className="mt-1.5">
        <h3 className="text-[10px] font-bold leading-snug line-clamp-2 group-hover:text-blue-500 transition-colors">{m.title}</h3>
        {m.genres.length > 0 && (
          <p className="text-[8px] text-zinc-500 mt-0.5 truncate">{m.genres.slice(0,2).join(' · ')}</p>
        )}
      </div>
    </div>
  );
});
MangaCard.displayName = 'MangaCard';

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
const PER_PAGE = 30;

export default function HomePage() {
  const [catalog, setCatalog]       = useState<Catalog|null>(null);
  const [catalogErr, setCatalogErr] = useState("");
  const [loading, setLoading]       = useState(true);

  const [all, setAll]               = useState<Manga[]>([]);
  const [display, setDisplay]       = useState<Manga[]>([]);
  const [banner, setBanner]         = useState<Manga[]>([]);
  const [genres, setGenres]         = useState<string[]>([]);

  const [genre, setGenre]           = useState("");
  const [countryFilter, setCountryFilter] = useState("");  // "JP" | "KR" | "CN" | ""
  const [query, setQuery]           = useState("");
  const [lang, setLang]             = useState<'th'|'en'>('th');
  const [dark, setDark]             = useState(true);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [mOpen, setMOpen]           = useState(false);
  const [mManga, setMManga]         = useState<Manga|null>(null);
  const [mChaps, setMChaps]         = useState<Chapter[]>([]);
  const [mLoading, setMLoading]     = useState(false);
  const [dropOpen, setDropOpen]     = useState(false);
  const [serverUp, setServerUp]     = useState<boolean|null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const t = T[lang];

  useEffect(() => {
    const d = localStorage.getItem('manga-theme') !== 'light';
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
  }, []);

  useEffect(() => {
    fetch('http://localhost:8000/api/catalog/stats',{signal:AbortSignal.timeout(2000)})
      .then(r=>setServerUp(r.ok)).catch(()=>setServerUp(false));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/manga_catalog.json');
        if (!res.ok) throw new Error();
        const data: Catalog = await res.json();
        setAll(data.manga);
        setGenres(data.genre_list || []);
        setCatalog(data);
        // Banner = top 5 ที่มีรูปและ desc (เรียง popularity แล้ว)
        const b = data.manga.filter(m => m.cover && m.desc).slice(0, 5);
        setBanner(b.length ? b : data.manga.filter(m => m.cover).slice(0, 5));
        setDisplay(data.manga.slice(0, PER_PAGE));
        setTotalPages(Math.ceil(data.manga.length / PER_PAGE));
      } catch { setCatalogErr(t.noFile); }
      finally { setLoading(false); }
    })();
  }, []);

  // Filter
  useEffect(() => {
    if (!all.length) return;
    const q = query.toLowerCase().trim();
    let f = all;
    if (q) f = f.filter(m => m.title.toLowerCase().includes(q));
    if (genre) f = f.filter(m => m.genres.includes(genre));
    if (countryFilter) f = f.filter(m => m.country === countryFilter);
    // catalog ถูก sort popularity แล้ว — ไม่ต้อง sort ใหม่
    const start = (page-1)*PER_PAGE;
    setDisplay(f.slice(start, start+PER_PAGE));
    setTotalPages(Math.max(1, Math.ceil(f.length/PER_PAGE)));
  }, [query, genre, countryFilter, page, all]);

  useEffect(() => {
    document.body.style.overflow = mOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mOpen]);

  const openModal = useCallback(async (manga: Manga) => {
    setMManga(manga); setMChaps([]); setMLoading(true);
    setMOpen(true); setDropOpen(false);
    const chapters = await fetchChapters(manga);
    setMChaps(chapters); setMLoading(false);
  }, []);

  const goPage = (p: number) => {
    setPage(p);
    listRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  const paginationGroup = () => {
    const s = Math.max(page-2,1), e = Math.min(s+4,totalPages);
    return Array.from({length:Math.max(0,e-s+1)},(_,i)=>s+i);
  };

  // ─── Loading / Error
  if (loading) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] gap-3">
      <Loader2 className="w-7 h-7 text-blue-600 animate-spin"/>
      <p className="text-xs text-zinc-500 animate-pulse">กำลังโหลด catalog...</p>
    </div>
  );
  if (catalogErr) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] gap-5 px-8 text-center">
      <BookOpen size={40} className="text-zinc-700"/>
      <h2 className="text-lg font-black text-zinc-300">ยังไม่มี Catalog</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-left text-xs font-mono text-zinc-400 max-w-sm w-full space-y-2">
        <p className="text-green-400">py aggregator.py</p>
        <p className="text-blue-400">copy manga_catalog.json public\</p>
      </div>
      <button onClick={()=>window.location.reload()}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-black hover:bg-blue-500">
        <RefreshCw size={14}/> ลองใหม่
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 pb-16">

      {/* Server offline */}
      {serverUp === false && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] bg-zinc-900/95 border border-zinc-700 text-zinc-400 text-[10px] font-bold px-4 py-2 rounded-full shadow-xl whitespace-nowrap pointer-events-none">
          ⚠️ {t.serverOff}
        </div>
      )}

      {/* ═══ MODAL ═══ */}
      {mOpen && mManga && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/85"
          onClick={e => { if (e.target===e.currentTarget) setMOpen(false); }}>
          <div className="bg-white dark:bg-[#0d0d0d] w-full md:max-w-4xl h-[90vh] md:h-[85vh] rounded-t-[1.5rem] md:rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <button onClick={()=>setMOpen(false)}
              className="absolute top-4 right-4 z-50 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 border border-white/10">
              <X size={16}/>
            </button>

            {/* Hero */}
            <div className="relative h-36 md:h-44 shrink-0 overflow-hidden">
              <img src={proxyCover(mManga.cover)} className="w-full h-full object-cover blur-2xl scale-110 opacity-20 absolute inset-0" alt=""/>
              <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#0d0d0d] to-transparent"/>
              <div className="absolute bottom-0 left-6 md:left-10 translate-y-1/2">
                {/* Cover ชัด */}
                <img src={proxyCover(mManga.cover)}
                  className="w-20 md:w-28 aspect-[2/3] object-cover rounded-xl shadow-2xl border-2 border-white dark:border-zinc-800"
                  alt={mManga.title}
                  onError={e=>{(e.target as HTMLImageElement).src=`https://placehold.co/200x280/111827/3b82f6?text=${encodeURIComponent(mManga.title.slice(0,10))}`;}}/>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-14 md:pt-18 pb-8 px-6 md:px-10">
              <div className="flex flex-col md:flex-row gap-6 md:gap-8">

                {/* Left */}
                <div className="flex-1 min-w-0 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      {mManga.country && (
                        <span className="text-xs">{COUNTRY_FLAG[mManga.country]||''}</span>
                      )}
                      <h1 className="text-xl md:text-2xl font-black leading-tight">{mManga.title}</h1>
                    </div>
                    {mManga.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {mManga.genres.map((g,i)=>(
                          <span key={i} className="bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full text-[10px] font-bold text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">{g}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">{t.synopsis}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{mManga.desc || t.noDesc}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">{t.sources} ({mManga.sources.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mManga.sources.map((src,i)=>(
                        <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                          onClick={e=>e.stopPropagation()}
                          className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 transition-colors">
                          {src.name} <ExternalLink size={8}/>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right */}
                <div className="w-full md:w-60 shrink-0">
                  {mLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
                      <Loader2 size={22} className="text-blue-600 animate-spin"/>
                      <span className="text-xs text-zinc-500">กำลังโหลดตอน...</span>
                    </div>
                  ) : mChaps.length > 0 ? (
                    <div className="space-y-2">
                      <a href={mChaps[mChaps.length-1].url} target="_blank" rel="noopener noreferrer"
                        onClick={e=>e.stopPropagation()}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-colors shadow-md">
                        <Play size={14} fill="currentColor"/> {t.readFirst}
                      </a>
                      {mChaps.length > 1 && (
                        <a href={mChaps[0].url} target="_blank" rel="noopener noreferrer"
                          onClick={e=>e.stopPropagation()}
                          className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-colors border border-zinc-200 dark:border-zinc-700">
                          {t.readLatest}
                        </a>
                      )}
                      <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <button onClick={()=>setDropOpen(v=>!v)}
                          className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                          <span className="flex items-center gap-2"><List size={13} className="text-blue-500"/> {t.chapterList} ({mChaps.length})</span>
                          <ChevronDown size={14} className={`text-zinc-400 transition-transform ${dropOpen?'rotate-180':''}`}/>
                        </button>
                        {dropOpen && (
                          <div className="border-t border-zinc-200 dark:border-zinc-800 max-h-48 overflow-y-auto">
                            {mChaps.map((ch,i)=>(
                              <a key={i} href={ch.url} target="_blank" rel="noopener noreferrer"
                                onClick={e=>e.stopPropagation()}
                                className="block px-4 py-2.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 transition-colors">
                                {ch.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ไม่มีตอน → แสดง source links โดยตรง */
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Info size={14} className="text-zinc-400 flex-shrink-0"/>
                        <p className="text-[10px] font-bold text-zinc-500">{t.noChapters}</p>
                      </div>
                      <p className="text-[9px] text-zinc-500 mb-3">{t.openDirect}:</p>
                      {mManga.sources.map((src,i)=>(
                        <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                          onClick={e=>e.stopPropagation()}
                          className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg text-[10px] font-bold text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 transition-colors">
                          {src.name} <ExternalLink size={9}/>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <header className="sticky top-0 z-50 px-4 md:px-6 py-3 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-zinc-100 dark:border-zinc-900">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <h1 className="text-lg font-black italic text-blue-600 tracking-tight uppercase shrink-0">MANGA.BLUE</h1>
          <div className="flex-1 max-w-sm flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 px-3.5 py-2 rounded-xl border border-transparent focus-within:border-blue-500/40 transition-colors">
            <SearchIcon size={14} className="text-zinc-400 shrink-0"/>
            <input type="text" placeholder={t.searchPlaceholder} value={query}
              onChange={e=>{setQuery(e.target.value);setPage(1);}}
              className="bg-transparent outline-none w-full text-sm placeholder:text-zinc-500 dark:placeholder:text-zinc-600"/>
            {query && <button onClick={()=>{setQuery("");setPage(1);}}><X size={12} className="text-zinc-400 hover:text-zinc-600"/></button>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {catalog && <span className="text-[10px] text-zinc-500 font-bold hidden md:block">{catalog.total.toLocaleString()} เรื่อง</span>}
            <button onClick={()=>setLang(l=>l==='th'?'en':'th')}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-[10px] font-black bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-blue-600 border border-zinc-200 dark:border-zinc-800">
              <Globe size={11}/> {t.toggleLang}
            </button>
            <button onClick={()=>{
              const d=!dark; setDark(d);
              localStorage.setItem('manga-theme',d?'dark':'light');
              document.documentElement.classList.toggle('dark',d);
            }} className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40">
              {dark?<Sun size={15}/>:<Moon size={15}/>}
            </button>
          </div>
        </div>
      </header>

      <main className="mt-6 space-y-7">
        {/* Banner */}
        {!query && !genre && !countryFilter && page===1 && (
          <BannerSlider items={banner} onOpen={openModal} t={t}/>
        )}

        {/* ═══ Country filter tabs ═══ */}
        <section className="px-4 md:px-6 max-w-7xl mx-auto">
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">{t.country}</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
            {[{code:"", labelTH:"🌐 ทั้งหมด", labelEN:"🌐 All"}, {code:"JP",labelTH:"🇯🇵 ญี่ปุ่น",labelEN:"🇯🇵 Japanese"}, {code:"KR",labelTH:"🇰🇷 เกาหลี",labelEN:"🇰🇷 Korean"}, {code:"CN",labelTH:"🇨🇳 จีน",labelEN:"🇨🇳 Chinese"}].map(item=>(
              <button key={item.code} onClick={()=>{setCountryFilter(item.code);setPage(1);}}
                className={`px-4 py-2 rounded-full text-[10px] font-black whitespace-nowrap flex-shrink-0 transition-all
                  ${countryFilter===item.code?'bg-blue-600 text-white shadow':'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-blue-600'}`}>
                {lang==='th'?item.labelTH:item.labelEN}
              </button>
            ))}
          </div>
        </section>

        {/* ═══ Genre filter ═══ */}
        <section className="px-4 md:px-6 max-w-7xl mx-auto" ref={listRef}>
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">{t.genres}</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
            <button onClick={()=>{setGenre("");setPage(1);}}
              className={`px-3.5 py-2 rounded-full text-[10px] font-black whitespace-nowrap flex-shrink-0 transition-all
                ${!genre?'bg-blue-600 text-white shadow':'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-blue-600'}`}>
              {t.all}
            </button>
            {genres.map(g=>(
              <button key={g} onClick={()=>{setGenre(g);setPage(1);}}
                className={`px-3.5 py-2 rounded-full text-[10px] font-black whitespace-nowrap flex-shrink-0 transition-all
                  ${genre===g?'bg-blue-600 text-white shadow':'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-blue-600'}`}>
                {g}
              </button>
            ))}
          </div>
        </section>

        {/* ═══ Grid ═══ */}
        <section className="px-4 md:px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={14} className="text-orange-500 animate-pulse"/>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
              {query
                ? `${t.searchResult}: "${query}" — ${display.length}`
                : genre || countryFilter
                  ? `${genre||''} ${countryFilter?`(${countryFilter})`:''} — ${display.length} เรื่อง`
                  : `${t.allTitles} — หน้า ${page}/${totalPages}`}
            </span>
          </div>

          {display.length===0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
              <SearchIcon size={24} className="opacity-20"/>
              <p className="text-sm font-bold">ไม่พบมังงะ</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4">
              {display.map((m,i)=>(
                <MangaCard key={`${m.title}-${i}`} m={m} onOpen={openModal}/>
              ))}
            </div>
          )}

          {totalPages>1 && !query && (
            <div className="mt-10 flex items-center justify-center gap-1.5">
              <button onClick={()=>goPage(Math.max(1,page-1))} disabled={page===1}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500 disabled:opacity-30 hover:text-blue-600 transition-colors">
                <ChevronLeft size={14}/>
              </button>
              {paginationGroup().map(p=>(
                <button key={p} onClick={()=>goPage(p)}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black transition-all
                    ${page===p?'bg-blue-600 text-white scale-110':'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:text-blue-600'}`}>
                  {p}
                </button>
              ))}
              <button onClick={()=>goPage(Math.min(totalPages,page+1))} disabled={page===totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500 disabled:opacity-30 hover:text-blue-600 transition-colors">
                <ChevronRight size={14}/>
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}