// app/manga/[id]/_components/ChapterList.tsx
// ⚡ OPTIMIZED:
//   - useCallback/memo ป้องกัน re-render chain
//   - Virtual list ใช้ ResizeObserver แทน window resize
//   - readSet โหลด synchronous จาก localStorage ใน initializer (ไม่ flicker)
//   - Grid mode ใช้ memo component แต่ละ row
"use client";
import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  memo,
} from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ChevronRight,
  Search,
  SortDesc,
  SortAsc,
  Clock,
} from 'lucide-react';

interface Chapter {
  id: string;
  number: number;
  title: string;
  createdAt: string | null;
}

interface Props {
  chapters: Chapter[];
  mangaId: string;
}

// ─── Date formatter — ไม่ต้องสร้าง Date objects ใหม่ทุกครั้ง ─────────────────
const dateCache = new Map<string, string>();
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  if (dateCache.has(dateStr)) return dateCache.get(dateStr)!;
  try {
    const d = new Date(dateStr);
    const diff = (Date.now() - d.getTime()) / 1000;
    let result: string;
    if (diff < 86400) result = 'วันนี้';
    else if (diff < 172800) result = 'เมื่อวาน';
    else if (diff < 604800) result = `${Math.floor(diff / 86400)} วันที่แล้ว`;
    else
      result = d.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
      });
    dateCache.set(dateStr, result);
    return result;
  } catch {
    return '';
  }
}

// ─── Virtual list constants ────────────────────────────────────────────────────
const ITEM_HEIGHT = 68;
const BUFFER = 8;
const MAX_HEIGHT = 600;

// ─── Memoized single row ───────────────────────────────────────────────────────
const ChapterRow = memo(function ChapterRow({
  ch,
  mangaId,
  isRead,
  style,
}: {
  ch: Chapter;
  mangaId: string;
  isRead: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={`/manga/${mangaId}/read/${ch.id}`}
      prefetch={false}
      style={{ height: ITEM_HEIGHT, ...style }}
      className="group flex items-center justify-between px-4 border-b border-white/[0.04] hover:bg-blue-600/10 transition-colors duration-150"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-11 h-11 flex items-center justify-center rounded-xl shrink-0 transition-colors border ${
            isRead
              ? 'bg-blue-600/20 border-blue-500/30'
              : 'bg-zinc-900 group-hover:bg-blue-600/20 border-white/5'
          }`}
        >
          <span
            className={`text-[11px] font-black transition-colors ${
              isRead
                ? 'text-blue-400'
                : 'text-zinc-400 group-hover:text-blue-400'
            }`}
          >
            {ch.number}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold text-white/80 group-hover:text-white truncate transition-colors">
            {ch.title || `ตอนที่ ${ch.number}`}
          </span>
          {ch.createdAt && (
            <span className="flex items-center gap-1 text-[9px] text-zinc-600 group-hover:text-blue-300/60 mt-0.5 transition-colors">
              <Clock size={8} />
              {formatDate(ch.createdAt)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        size={14}
        className="text-zinc-700 group-hover:text-blue-400 shrink-0 transition-all group-hover:translate-x-0.5"
      />
    </Link>
  );
});

// ─── Virtual list ─────────────────────────────────────────────────────────────
function VirtualChapterList({
  chapters,
  mangaId,
  readSet,
}: {
  chapters: Chapter[];
  mangaId: string;
  readSet: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(MAX_HEIGHT);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setContainerHeight(el.clientHeight);

    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });

    // ResizeObserver แม่นกว่า window resize
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const { startIdx, endIdx, totalHeight } = useMemo(() => {
    const total = chapters.length * ITEM_HEIGHT;
    const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
    const end = Math.min(
      chapters.length - 1,
      Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER
    );
    return { startIdx: start, endIdx: end, totalHeight: total };
  }, [chapters.length, scrollTop, containerHeight]);

  const visibleChapters = chapters.slice(startIdx, endIdx + 1);

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700 rounded-2xl border border-white/5"
      style={{ maxHeight: MAX_HEIGHT }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startIdx * ITEM_HEIGHT,
            left: 0,
            right: 0,
          }}
        >
          {visibleChapters.map((ch) => (
            <ChapterRow
              key={ch.id}
              ch={ch}
              mangaId={mangaId}
              isRead={readSet.has(ch.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Grid card (≤30 chapters) ─────────────────────────────────────────────────
const GridCard = memo(function GridCard({
  ch,
  mangaId,
  isRead,
}: {
  ch: Chapter;
  mangaId: string;
  isRead: boolean;
}) {
  return (
    <Link
      href={`/manga/${mangaId}/read/${ch.id}`}
      prefetch={false}
      className="group flex items-center justify-between p-3.5 bg-zinc-900/40 hover:bg-blue-600/10 rounded-xl border border-white/[0.04] hover:border-blue-500/20 transition-all duration-150"
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 flex items-center justify-center rounded-xl shrink-0 transition-colors border ${
            isRead
              ? 'bg-blue-600/20 border-blue-500/30'
              : 'bg-zinc-800/60 border-white/5'
          }`}
        >
          <BookOpen
            size={13}
            className={
              isRead ? 'text-blue-400' : 'text-zinc-500 group-hover:text-white'
            }
          />
        </div>
        <div>
          <span className="block text-[11px] font-bold text-white/70 group-hover:text-white transition-colors">
            ตอนที่ {ch.number}
          </span>
          <span className="block text-[9px] text-zinc-600 group-hover:text-zinc-400 mt-0.5 transition-colors truncate max-w-[160px]">
            {ch.title}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {ch.createdAt && (
          <span className="text-[9px] text-zinc-700 hidden md:block">
            {formatDate(ch.createdAt)}
          </span>
        )}
        <ChevronRight
          size={13}
          className="text-zinc-700 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
});

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ChapterList({ chapters, mangaId }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  // โหลด synchronous ครั้งเดียว — ไม่ต้องใช้ useEffect/setState (ไม่ flicker)
  const [readSet] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(`read_${mangaId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleSort = useCallback(() => setSortAsc((v) => !v), []);

  const filtered = useMemo(() => {
    let list = chapters;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (ch) =>
          ch.number.toString().includes(q) ||
          ch.title.toLowerCase().includes(q)
      );
    }
    // spread เฉพาะตอน sort (ป้องกัน mutate original)
    return [...list].sort((a, b) =>
      sortAsc ? a.number - b.number : b.number - a.number
    );
  }, [chapters, searchTerm, sortAsc]);

  const readCount = useMemo(
    () => chapters.filter((ch) => readSet.has(ch.id)).length,
    [chapters, readSet]
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h2 className="text-base font-black uppercase tracking-tight text-white">
            {chapters.length} ตอน
          </h2>
          {readCount > 0 && (
            <p className="text-[10px] text-zinc-500 mt-0.5">
              อ่านแล้ว {readCount}/{chapters.length} ตอน
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSort}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/5 rounded-xl text-[11px] font-bold text-zinc-400 hover:text-white transition-all"
            title={sortAsc ? 'ตอนเก่าก่อน' : 'ตอนใหม่ก่อน'}
          >
            {sortAsc ? <SortAsc size={13} /> : <SortDesc size={13} />}
            {sortAsc ? 'เก่า→ใหม่' : 'ใหม่→เก่า'}
          </button>

          <div className="relative w-36 md:w-52">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
              size={13}
            />
            <input
              type="search"
              placeholder="ค้นหาตอน..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-white/5 rounded-xl py-2 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600 focus:border-blue-600/60 outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {readCount > 0 && (
        <div className="mb-4 h-1 bg-zinc-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${(readCount / chapters.length) * 100}%` }}
          />
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-center text-zinc-600 mt-10 text-sm">
          ไม่พบตอนที่ค้นหา
        </p>
      ) : filtered.length > 30 ? (
        <VirtualChapterList
          chapters={filtered}
          mangaId={mangaId}
          readSet={readSet}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filtered.map((ch) => (
            <GridCard
              key={ch.id}
              ch={ch}
              mangaId={mangaId}
              isRead={readSet.has(ch.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
