"use client";

import React, { useState, useEffect, use } from 'react';
import { Loader2, ArrowLeft, Play, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

// กำหนด URL ของ Railway API
const API_BASE = "https://manga-production-6994.up.railway.app";

export default function MangaDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  const [manga, setManga] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        // ดึงทั้งข้อมูลมังงะ และ รายชื่อตอนจาก Railway พร้อมกัน
        const [mangaRes, chaptersRes] = await Promise.all([
          axios.get(`${API_BASE}/api/manga/${id}`),
          axios.get(`${API_BASE}/api/manga/${id}/chapters`)
        ]);
        
        setManga(mangaRes.data);
        setChapters(chaptersRes.data);
      } catch (err) {
        console.error("Error fetching from Railway:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-blue-500/30">
      {/* ส่วนหัว (Hero Section) */}
      <div className="relative h-[45vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent z-10" />
        <img 
          src={manga?.cover_url} 
          className="w-full h-full object-cover opacity-40 blur-sm scale-110"
          alt="background"
        />
        <button 
          onClick={() => router.back()}
          className="absolute top-8 left-8 z-20 p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full transition-all"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* เนื้อหาหลัก */}
      <div className="max-w-5xl mx-auto px-6 -mt-32 relative z-20 pb-20">
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">
          <img 
            src={manga?.cover_url}
            className="w-56 aspect-[3/4] object-cover rounded-[2rem] shadow-2xl border border-white/10"
            alt={manga?.title}
          />
          <div className="flex-1 text-center md:text-left">
            <span className="px-3 py-1 bg-blue-600 text-[10px] font-black uppercase rounded-full tracking-widest mb-4 inline-block">
              {manga?.status || "Ongoing"}
            </span>
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2 leading-none">
              {manga?.title}
            </h1>
            <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest">
              {manga?.country} • {manga?.source_site}
            </p>
          </div>
        </div>

        {/* เรื่องย่อ */}
        <div className="mt-12 bg-zinc-900/30 p-8 rounded-[2.5rem] border border-white/5 backdrop-blur-sm">
          <h2 className="text-xs font-black uppercase mb-4 text-blue-500 tracking-[0.2em]">Description</h2>
          <p className="text-zinc-400 leading-relaxed font-medium">
            {manga?.description || "ไม่มีข้อมูลเรื่องย่อ"}
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            {manga?.genres?.map((g: string) => (
              <span key={g} className="px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700 text-[10px] font-bold rounded-full transition-colors cursor-default">
                {g}
              </span>
            ))}
          </div>
        </div>

        {/* รายชื่อตอน (Chapter List) */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-8 px-4">
            <h2 className="text-sm font-black uppercase text-zinc-500 tracking-[0.3em]">Chapter List</h2>
            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
              {chapters.length} Chapters Total
            </span>
          </div>
          
          <div className="grid gap-3">
            {chapters.length > 0 ? (
              chapters.map((ch: any) => (
                <Link 
                  href={`/read/${id}/${ch.id}`} // ลิงก์ไปยังหน้า Reader ที่เราสร้างไว้
                  key={ch.id}
                  className="group flex items-center justify-between p-5 bg-zinc-900/50 hover:bg-blue-600 rounded-[1.5rem] border border-white/5 hover:border-blue-400/50 transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 flex items-center justify-center bg-zinc-800 group-hover:bg-white/20 rounded-xl transition-colors">
                      <BookOpen size={16} className="text-zinc-500 group-hover:text-white" />
                    </div>
                    <div>
                      <span className="font-black text-sm uppercase group-hover:text-white transition-colors">
                        Chapter {ch.number}
                      </span>
                      {ch.title && (
                        <p className="text-[10px] font-bold text-zinc-500 group-hover:text-white/70 truncate max-w-[200px] md:max-w-md">
                          {ch.title}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="hidden md:block text-[10px] font-black text-zinc-600 group-hover:text-white/50 uppercase">
                      {ch.published_at ? new Date(ch.published_at).toLocaleDateString() : 'RECENT'}
                    </span>
                    <Play size={14} className="text-blue-500 group-hover:text-white fill-current" />
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-20 bg-zinc-900/20 rounded-[2.5rem] border border-dashed border-white/5">
                <p className="text-zinc-600 font-black text-xs uppercase tracking-widest">กำลังรอการอัปเดตตอนใหม่...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}