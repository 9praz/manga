"use client";
import React, { useState, useEffect, use, useMemo } from 'react';
import { Loader2, ArrowLeft, Play, BookOpen, AlertCircle, Search, ChevronRight, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ztvchypgeoeiijjhclnh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0dmNoeXBnZW9laWlqamhjbG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NDc1NzUsImV4cCI6MjA4NzMyMzU3NX0.ifHhClrpORNR0_JR_Q04q8b_yHbrEgSuIrPf5aaFX-Y";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const p = (url: string) =>
  url && url.startsWith('http') && !url.includes('placehold.co')
    ? `/api/proxy-image?url=${encodeURIComponent(url)}`
    : url;

// ── ดึงเลขจาก chapter_title เช่น "ตอนที่ 12" → 12, "EP.5" → 5 ──
function extractChapterNum(title: string): number {
  if (!title) return 0;
  // รูปแบบ: ep0068, ep68, EP.68
  const ep = title.match(/ep\.?\s*0*(\d+)/i);
  if (ep) return parseInt(ep[1]);
  // รูปแบบ: ตอนที่ 12, ตอน 12, chapter 12, ch.12
  const th = title.match(/(?:ตอน(?:ที่)?|chapter|ch\.?)\s*\.?\s*0*(\d+)/i);
  if (th) return parseInt(th[1]);
  // เลขล้วน หรือเลขท้ายสุด
  const nums = title.match(/\d+/g);
  if (nums) return parseInt(nums[nums.length - 1]);
  return 0;
}

export default function MangaDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [manga, setManga] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchDetails = async () => {
    if (!id || id === "undefined") return;
    try {
      setLoading(true); setError(null);
      const decodedId = decodeURIComponent(id);

      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('manga_title', decodedId);

      if (error) throw error;
      if (!data || data.length === 0) throw new Error("ไม่พบข้อมูลมังงะเรื่องนี้");

      setManga({
        title: decodedId,
        cover_url: (data[0].cover_url && data[0].cover_url.trim() !== "")
          ? data[0].cover_url
          : `https://placehold.co/400x600/1f2937/3b82f6?text=${encodeURIComponent(decodedId.slice(0, 15))}`,
        description: "มังงะอัปเดตใหม่ล่าสุด ติดตามตอนต่อไปได้เร็วๆ นี้",
        source_site: "Supabase DB",
      });

      // ── เรียง numeric จากเลขใน chapter_title ──
      const sorted = [...data].sort((a, b) => {
        const na = extractChapterNum(a.chapter_title);
        const nb = extractChapterNum(b.chapter_title);
        return nb - na; // มากสุด (ล่าสุด) ขึ้นก่อน
      });

      setChapters(sorted.map((ch) => ({
        id: ch.id,
        number: extractChapterNum(ch.chapter_title),
        title: ch.chapter_title,
        raw_title: ch.chapter_title,
      })));

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDetails(); }, [id]);

  const filteredChapters = useMemo(() => {
    if (!searchTerm) return chapters;
    return chapters.filter(ch =>
      ch.number.toString().includes(searchTerm) ||
      (ch.title && ch.title.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [chapters, searchTerm]);

  if (loading && !manga) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
      <div className="relative">
        <div className="w-20 h-20 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
        <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-blue-600 animate-pulse" />
      </div>
      <p className="mt-6 text-zinc-500 font-black uppercase tracking-[0.3em] text-[10px]">Loading Database...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <h2 className="text-white text-2xl font-black mb-2 uppercase">Connection Failed</h2>
      <button onClick={() => fetchDetails()} className="px-8 py-4 mt-4 bg-white text-black rounded-full font-black uppercase text-xs hover:bg-blue-600 hover:text-white transition-all">
        Try Reconnect
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-600/30">
      <div className="relative h-[50vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent z-10" />
        <img src={p(manga?.cover_url ?? '')} className="w-full h-full object-cover opacity-20 blur-2xl scale-125" alt="" />
        <button onClick={() => router.push('/')} className="absolute top-8 left-6 z-20 p-3 bg-white/5 hover:bg-white/20 backdrop-blur-2xl rounded-full border border-white/10 transition-all">
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 -mt-40 relative z-20 pb-32">
        <div className="flex flex-col md:flex-row gap-10 items-center md:items-end">
          <div className="relative group shrink-0">
            <img src={p(manga?.cover_url ?? '')} className="relative w-52 md:w-64 aspect-[3/4] object-cover rounded-[2.2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10" alt={manga?.title} />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4 leading-[0.9] drop-shadow-xl">{manga?.title}</h1>
            <div className="flex items-center justify-center md:justify-start gap-4 text-zinc-500">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase">
                <Info size={14} className="text-blue-500" /> {chapters.length} ตอน
              </span>
            </div>
          </div>
        </div>

        <div className="mt-16">
          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-sm">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
              <input
                type="text"
                placeholder="ค้นหาตอน..."
                className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:border-blue-600 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Chapter list — เรียง numeric */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredChapters.map((ch: any) => (
              <Link
                href={`/manga/${id}/read/${ch.id}`}
                key={ch.id}
                className="group relative flex items-center justify-between p-5 bg-zinc-900/20 hover:bg-blue-600 rounded-[1.5rem] border border-white/5 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 flex items-center justify-center bg-zinc-800/50 rounded-xl shrink-0">
                    <BookOpen size={16} className="text-zinc-500 group-hover:text-white" />
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold text-zinc-500 group-hover:text-white/60 mb-0.5">
                      {ch.raw_title}
                    </span>
                    <span className="text-sm font-black uppercase group-hover:text-white">
                      ตอนที่ {ch.number}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-blue-600 group-hover:text-white shrink-0" />
              </Link>
            ))}
          </div>

          {filteredChapters.length === 0 && (
            <p className="text-center text-zinc-600 mt-10">ไม่พบตอนที่ค้นหา</p>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 p-2 rounded-full flex gap-2">
          <button
            onClick={() => {
              const first = chapters[chapters.length - 1];
              if (first) router.push(`/manga/${id}/read/${first.id}`);
            }}
            className="flex-1 py-4 bg-white text-black rounded-full font-black text-xs hover:bg-blue-600 hover:text-white transition-all"
          >
            <Play size={14} className="inline mr-2" /> ตอนแรก
          </button>
          <button
            onClick={() => {
              const last = chapters[0];
              if (last) router.push(`/manga/${id}/read/${last.id}`);
            }}
            className="flex-1 py-4 bg-blue-600 text-white rounded-full font-black text-xs hover:bg-blue-500 transition-all"
          >
            <BookOpen size={14} className="inline mr-2" /> ล่าสุด
          </button>
        </div>
      </div>
    </div>
  );
}