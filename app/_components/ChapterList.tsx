// app/manga/[id]/_components/ChapterList.tsx
"use client";
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight, Search } from 'lucide-react';

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

function formatDate(dateStr: string | null) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: '2-digit',
    });
  } catch { return ''; }
}

export default function ChapterList({ chapters, mangaId }: Props) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return chapters;
    const q = searchTerm.toLowerCase();
    return chapters.filter(
      (ch) =>
        ch.number.toString().includes(q) ||
        ch.title.toLowerCase().includes(q)
    );
  }, [chapters, searchTerm]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-black uppercase tracking-tight text-white">
          ทั้งหมด {chapters.length} ตอน
        </h2>
        {/* Search */}
        <div className="relative w-44 md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
          <input
            type="text"
            placeholder="ค้นหาตอน..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900/60 border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-blue-600 outline-none transition-colors"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((ch) => (
          <Link
            href={`/manga/${mangaId}/read/${ch.id}`}
            key={ch.id}
            prefetch={false}
            className="group flex items-center justify-between p-4 bg-zinc-900/30 hover:bg-blue-600 rounded-2xl border border-white/5 hover:border-blue-500 transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center bg-zinc-800/60 group-hover:bg-blue-500/30 rounded-xl shrink-0 transition-colors">
                <BookOpen size={15} className="text-zinc-500 group-hover:text-white" />
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-500 group-hover:text-blue-200 mb-0.5 transition-colors">
                  {ch.title}
                </span>
                <span className="text-sm font-black group-hover:text-white transition-colors">
                  ตอนที่ {ch.number}
                </span>
                {ch.createdAt && (
                  <span className="block text-[10px] text-zinc-600 group-hover:text-blue-200/60 mt-0.5">
                    {formatDate(ch.createdAt)}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={15} className="text-zinc-600 group-hover:text-white shrink-0 transition-colors" />
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-zinc-600 mt-10 text-sm">ไม่พบตอนที่ค้นหา</p>
      )}
    </div>
  );
}
