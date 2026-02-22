"use client";

import React, { useState, useEffect, use, useMemo } from 'react';
import { 
  Loader2, ArrowLeft, Play, BookOpen, AlertCircle, 
  RefreshCcw, Search, Calendar, ChevronRight, Info 
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// จัดการ URL ของ API ให้สะอาดที่สุด
const getApiBase = () => {
  const url = process.env.NEXT_PUBLIC_API_URL || "https://manga-production-6994.up.railway.app";
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

export default function MangaDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const API_BASE = getApiBase();
  
  // States
  const [manga, setManga] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(""); // สำหรับ Filter รายชื่อตอน

  // ฟังก์ชัน Fetch ข้อมูลแบบสมบูรณ์
  const fetchDetails = async (isRetry = false) => {
    if (!id || id === "undefined") return;

    // ใช้ AbortController เพื่อป้องกันการ Fetch ค้างเมื่อเปลี่ยนหน้า (Memory Leak Prevention)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // Timeout 15 วินาที

    try {
      setLoading(true);
      if (isRetry) setError(null);

      // 1. ดึงข้อมูลมังงะ
      const mRes = await fetch(`${API_BASE}/api/manga/${id}`, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      if (!mRes.ok) throw new Error(`ไม่สามารถโหลดข้อมูลมังงะได้ (Code: ${mRes.status})`);
      const mData = await mRes.json();
      setManga(mData);

      // 2. ดึงรายชื่อตอน
      const cRes = await fetch(`${API_BASE}/api/manga/${id}/chapters`, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      if (!cRes.ok) throw new Error(`ไม่สามารถโหลดรายชื่อตอนได้ (Code: ${cRes.status})`);
      const cData = await cRes.json();
      setChapters(cData);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError("การเชื่อมต่อใช้เวลานานเกินไป โปรดลองใหม่อีกครั้ง");
      } else {
        setError(err.message === "Failed to fetch" 
          ? "Network Error: เซิร์ฟเวอร์ไม่ตอบสนอง หรือติดปัญหา CORS" 
          : err.message
        );
      }
      console.error("Fetch Error:", err);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  // ระบบ Filter รายชื่อตอน (ช่วยให้หาตอนง่ายขึ้นในมือถือ)
  const filteredChapters = useMemo(() => {
    return chapters.filter(ch => 
      ch.number.toString().includes(searchTerm) || 
      (ch.title && ch.title.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [chapters, searchTerm]);

  const getProxyUrl = (url: string) => {
    if (!url) return "";
    return `${API_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`;
  };

  // --- UI: Loading State (Skeleton Screen) ---
  if (loading && !manga) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
      <div className="relative">
        <div className="w-20 h-20 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
        <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-blue-600 animate-pulse" />
      </div>
      <p className="mt-6 text-zinc-500 font-black uppercase tracking-[0.3em] text-[10px]">Loading Database...</p>
    </div>
  );

  // --- UI: Error State ---
  if (error) return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <h2 className="text-white text-2xl font-black mb-2 tracking-tighter uppercase">Connection Failed</h2>
      <p className="text-zinc-500 mb-8 max-w-sm text-sm font-medium">{error}</p>
      <button 
        onClick={() => fetchDetails(true)} 
        className="group flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-black uppercase text-xs tracking-widest hover:bg-blue-600 hover:text-white transition-all active:scale-95"
      >
        <RefreshCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
        Try Reconnect
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-600/30">
      
      {/* 1. Backdrop Hero - ปรับให้ Blur และมืดลงเพื่อความสบายตาบนมือถือ */}
      <div className="relative h-[50vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent z-10" />
        <img 
          src={getProxyUrl(manga?.cover_url)} 
          className="w-full h-full object-cover opacity-20 blur-2xl scale-125 transition-opacity duration-1000"
          alt=""
        />
        <button 
          onClick={() => router.back()}
          className="absolute top-8 left-6 z-20 p-3 bg-white/5 hover:bg-white/20 backdrop-blur-2xl rounded-full border border-white/10 transition-all active:scale-90"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* 2. Main Content Container */}
      <div className="max-w-5xl mx-auto px-6 -mt-40 relative z-20 pb-32">
        
        {/* Manga Header Card */}
        <div className="flex flex-col md:flex-row gap-10 items-center md:items-end">
          <div className="relative group shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <img 
              src={getProxyUrl(manga?.cover_url)}
              className="relative w-52 md:w-64 aspect-[3/4] object-cover rounded-[2.2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10"
              alt={manga?.title}
            />
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-6">
              <span className="px-4 py-1.5 bg-blue-600 text-[10px] font-black uppercase rounded-lg tracking-widest shadow-lg shadow-blue-600/20">
                {manga?.status || "Updated"}
              </span>
              <span className="px-4 py-1.5 bg-zinc-900 text-[10px] font-black uppercase rounded-lg tracking-widest text-zinc-400 border border-white/5">
                {manga?.country || "JP"}
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4 leading-[0.9] drop-shadow-xl">
              {manga?.title}
            </h1>
            <div className="flex items-center justify-center md:justify-start gap-4 text-zinc-500">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
                <Info size={14} className="text-blue-500" /> {manga?.source_site}
              </span>
              <span className="w-1 h-1 bg-zinc-800 rounded-full"></span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
                <Calendar size={14} /> 2026 Edition
              </span>
            </div>
          </div>
        </div>

        {/* Info Tabs / Description */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-12">
          
          {/* Left Column: Description & Genres */}
          <div className="lg:col-span-2 space-y-10">
            <section>
              <h3 className="text-xs font-black uppercase text-blue-500 tracking-[0.3em] mb-6 flex items-center gap-3">
                Synopsis <div className="h-px flex-1 bg-blue-500/20"></div>
              </h3>
              <p className="text-zinc-400 leading-relaxed font-medium text-lg italic">
                "{manga?.description || "เตรียมตัวพบกับการเดินทางครั้งใหม่ที่กำลังจะเริ่มต้นขึ้น..."}"
              </p>
              <div className="flex flex-wrap gap-2 mt-8">
                {manga?.genres?.map((g: string) => (
                  <button key={g} className="px-5 py-2.5 bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 text-[11px] font-bold rounded-2xl transition-all">
                    {g}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Quick Stats & Search */}
          <div className="space-y-8">
             <div className="bg-zinc-900/30 border border-white/5 rounded-[2rem] p-8 backdrop-blur-md">
                <h3 className="text-xs font-black uppercase text-zinc-500 tracking-[0.2em] mb-6">Chapter Navigation</h3>
                
                {/* Search Box - เพิ่มประสิทธิภาพการหาตอนบนมือถือ */}
                <div className="relative mb-6">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                  <input 
                    type="text" 
                    placeholder="Search Chapter..."
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:border-blue-600 outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-zinc-500">
                    <span>Total Chapters</span>
                    <span className="text-white">{chapters.length}</span>
                  </div>
                  <div className="h-px bg-white/5"></div>
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-zinc-500">
                    <span>Last Update</span>
                    <span className="text-blue-500">Active Now</span>
                  </div>
                </div>
             </div>
          </div>
        </div>

        {/* 3. Chapter List - ออกแบบมาให้คลิกง่ายด้วยนิ้วโป้ง (Mobile Optimized) */}
        <div className="mt-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredChapters.length > 0 ? (
              filteredChapters.map((ch: any) => (
                <Link 
                  href={`/manga/${id}/read/${ch.id}`} 
                  key={ch.id}
                  className="group relative flex items-center justify-between p-6 bg-zinc-900/20 hover:bg-blue-600 rounded-[1.8rem] border border-white/5 hover:border-blue-400 transition-all duration-300 active:scale-[0.97]"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 flex items-center justify-center bg-zinc-800/50 group-hover:bg-white/20 rounded-2xl transition-colors">
                      <BookOpen size={18} className="text-zinc-500 group-hover:text-white" />
                    </div>
                    <div>
                      <span className="block text-xs font-black text-zinc-500 group-hover:text-white/60 uppercase tracking-widest mb-1">
                        Entry #{ch.number}
                      </span>
                      <span className="text-base font-black uppercase tracking-tight group-hover:text-white transition-colors">
                        Chapter {ch.number}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600/10 group-hover:bg-white/20 transition-all">
                      <ChevronRight size={18} className="text-blue-600 group-hover:text-white" />
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-full text-center py-24 bg-zinc-900/10 rounded-[3rem] border border-dashed border-white/10">
                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search size={24} className="text-zinc-700" />
                </div>
                <p className="text-zinc-600 font-black text-xs uppercase tracking-[0.4em]">No Chapters Found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Bottom Action Bar (Fixed on Mobile) - เพิ่มความสะดวกในการอ่าน */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 p-2 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex gap-2">
          <button 
            onClick={() => {
               const firstCh = chapters[chapters.length - 1];
               if(firstCh) router.push(`/manga/${id}/read/${firstCh.id}`);
            }}
            className="flex-1 flex items-center justify-center gap-3 py-4 bg-white text-black rounded-full font-black uppercase text-xs tracking-widest hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-xl"
          >
            <Play size={16} fill="currentColor" /> Start Reading
          </button>
        </div>
      </div>
    </div>
  );
}