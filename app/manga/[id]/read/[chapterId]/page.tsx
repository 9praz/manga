"use client";

import React, { useState, useEffect, use } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Menu, X, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://manga-production-6994.up.railway.app";

export default function ReaderPage({ params }: { params: Promise<{ mangaId: string, chapterId: string }> }) {
  const { mangaId, chapterId } = use(params);
  const router = useRouter();

  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUI, setShowUI] = useState(true);
  
  const [mangaTitle, setMangaTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  
  const [nextChapter, setNextChapter] = useState<string | null>(null);
  const [prevChapter, setPrevChapter] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchReaderData = async () => {
      try {
        setIsLoading(true);
        setErrorMsg(null);
        setImages([]);

        // ดึงข้อมูลมังงะ รายชื่อตอน และรูปภาพจาก API ของเรา
        const [mangaRes, chaptersRes, pagesRes] = await Promise.all([
          fetch(`${API_BASE}/api/manga/${mangaId}`).then(r => r.json()),
          fetch(`${API_BASE}/api/manga/${mangaId}/chapters`).then(r => r.json()),
          fetch(`${API_BASE}/api/chapters/${chapterId}/pages`).then(r => r.json())
        ]);

        if (mangaRes.title) setMangaTitle(mangaRes.title);

        // หาว่าตอนนี้อยู่ตอนที่เท่าไหร่ เพื่อทำปุ่ม Next / Prev
        if (Array.isArray(chaptersRes)) {
          const chIndex = chaptersRes.findIndex((ch: any) => ch.id === chapterId);
          if (chIndex !== -1) {
            setChapterTitle(chaptersRes[chIndex].title || `ตอนที่ ${chaptersRes[chIndex].number}`);
            setSourceUrl(chaptersRes[chIndex].source_url);
            
            // ตอนที่ใหม่กว่า (Next) คือ index ที่น้อยกว่า (เพราะเรียงจากใหม่ไปเก่า)
            setNextChapter(chIndex > 0 ? chaptersRes[chIndex - 1].id : null);
            // ตอนที่เก่ากว่า (Prev) คือ index ที่มากกว่า
            setPrevChapter(chIndex < chaptersRes.length - 1 ? chaptersRes[chIndex + 1].id : null);
          }
        }

        // ตรวจสอบรูปภาพ
        if (!pagesRes.pages || pagesRes.pages.length === 0) {
          setErrorMsg("ระบบกำลังพัฒนาระบบดึงรูปภาพของตอนนี้ครับ");
        } else {
          setImages(pagesRes.pages);
        }

      } catch (err) {
        console.error(err);
        setErrorMsg("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReaderData();
  }, [mangaId, chapterId]);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-blue-500/30 font-sans" onClick={() => setShowUI(!showUI)}>
      
      {/* 🟢 Top Navbar */}
      <div className={`fixed top-0 left-0 w-full z-50 transition-transform duration-300 ease-in-out transform-gpu ${showUI ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/60 to-transparent pointer-events-none" />
        <div className="relative flex items-center justify-between px-4 py-4 md:px-6">
          <button onClick={(e) => { e.stopPropagation(); router.push('/'); }} 
            className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors">
            <X size={20} />
          </button>
          <div className="text-center px-4 max-w-[60vw]">
            <h1 className="text-sm md:text-base font-black truncate">{mangaTitle || 'กำลังโหลด...'}</h1>
            <p className="text-[10px] md:text-xs text-zinc-400 font-bold mt-0.5 truncate">{chapterTitle || 'กำลังโหลดตอน...'}</p>
          </div>
          <div className="w-10" />
        </div>
      </div>

      {/* 🟢 Content Area */}
      <div className="w-full max-w-3xl mx-auto min-h-screen flex flex-col justify-center bg-black">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-4 h-screen">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-xs font-bold text-zinc-500 tracking-widest uppercase animate-pulse">กำลังโหลดรูปภาพ...</p>
          </div>
        ) : errorMsg ? (
          <div className="flex flex-col items-center justify-center h-screen px-6 text-center gap-4">
            <Info size={40} className="text-zinc-700" />
            <p className="text-sm font-bold text-zinc-400">{errorMsg}</p>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="mt-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-full transition-colors">
                อ่านที่เว็บต้นฉบับ
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col w-full pb-32">
            {images.map((src, i) => (
              <img key={i} src={src} alt={`Page ${i + 1}`} loading="lazy" referrerPolicy="no-referrer"
                className="w-full h-auto object-contain bg-zinc-900/50 min-h-[300px]" />
            ))}
          </div>
        )}
      </div>

      {/* 🟢 Bottom Navbar */}
      <div className={`fixed bottom-6 left-0 w-full z-50 px-4 transition-transform duration-300 ease-in-out transform-gpu flex justify-center ${showUI ? 'translate-y-0' : 'translate-y-[150%]'}`}>
        <div className="w-full max-w-sm bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-full p-2 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
          <button onClick={(e) => { e.stopPropagation(); if (prevChapter) router.push(`/read/${mangaId}/${prevChapter}`); }} 
            disabled={!prevChapter || isLoading} 
            className={`flex items-center gap-1 px-4 py-2.5 rounded-full text-xs font-black transition-colors ${prevChapter && !isLoading ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'text-zinc-600 cursor-not-allowed'}`}>
            <ChevronLeft size={16} /> ก่อนหน้า
          </button>
          
          <button onClick={(e) => { e.stopPropagation(); router.push('/'); }} 
            className="p-2.5 text-zinc-400 hover:text-white transition-colors">
            <Menu size={20} />
          </button>
          
          <button onClick={(e) => { e.stopPropagation(); if (nextChapter) router.push(`/read/${mangaId}/${nextChapter}`); }} 
            disabled={!nextChapter || isLoading} 
            className={`flex items-center gap-1 px-4 py-2.5 rounded-full text-xs font-black transition-colors ${nextChapter && !isLoading ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'text-zinc-600 cursor-not-allowed'}`}>
            ถัดไป <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}