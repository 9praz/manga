"use client";

import React, { useState, useEffect, use } from 'react';
import axios from 'axios';
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight, Menu, ExternalLink, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ReaderPage({ params }: { params: Promise<{ id: string, chapterId: string }> }) {
  const { id, chapterId } = use(params);
  const router = useRouter();

  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUI, setShowUI] = useState(true);
  
  const [mangaTitle, setMangaTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  
  const [nextChapter, setNextChapter] = useState<string | null>(null);
  const [prevChapter, setPrevChapter] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchReaderData = async () => {
      try {
        setIsLoading(true);
        setErrorMsg(null);
        setImages([]);

        const detailRes = await axios.get(`https://www.nekopost.net/api/project/detail/${id}`);
        if (detailRes.data.projectInfo) {
          setMangaTitle(detailRes.data.projectInfo.projectName);
        }

        const chaps = detailRes.data.listChapter || [];
        chaps.sort((a: any, b: any) => parseFloat(b.chapterNo) - parseFloat(a.chapterNo));

        const currentIndex = chaps.findIndex((ch: any) => ch.chapterId === chapterId);
        if (currentIndex !== -1) {
          const curr = chaps[currentIndex];
          const chNum = curr.chapterNo ? `ตอนที่ ${curr.chapterNo}` : "ตอนพิเศษ";
          const chName = curr.chapterName ? ` - ${curr.chapterName}` : "";
          setChapterTitle(`${chNum}${chName}`);

          if (currentIndex < chaps.length - 1) setPrevChapter(chaps[currentIndex + 1].chapterId);
          if (currentIndex > 0) setNextChapter(chaps[currentIndex - 1].chapterId);
        }

        const jsonUrl = `https://www.osemocphoto.com/collectManga/${id}/${chapterId}/${id}_${chapterId}.json`;
        const res = await axios.get(jsonUrl);
        
        if (res.data && res.data.pageItem) {
          const urls = res.data.pageItem.map((p: any) => {
            const raw = `https://www.osemocphoto.com/collectManga/${id}/${chapterId}/${p.pageName || p.fileName}`;
            return `/api/proxy-image?url=${encodeURIComponent(raw)}`;
          });
          setImages(urls);
        } else {
          setErrorMsg("ไม่พบรูปภาพในตอนนี้");
        }

      } catch (error) {
        setErrorMsg("เซิร์ฟเวอร์รูปภาพขัดข้องหรือไม่สามารถโหลดได้ (อาจถูกลบไปแล้ว)");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReaderData();
  }, [id, chapterId]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      if (window.scrollY > lastScrollY + 50) {
        setShowUI(false);
      } else if (window.scrollY < lastScrollY - 20) {
        setShowUI(true);
      }
      lastScrollY = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-sm font-bold text-zinc-500 animate-pulse">กำลังเตรียมหน้ากระดาษ...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative selection:bg-blue-600/30 flex flex-col">
      
      <div className={`fixed top-0 left-0 w-full z-50 transition-transform duration-300 ease-in-out transform-gpu ${showUI ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/60 to-transparent backdrop-blur-sm h-24 pointer-events-none"></div>
        <div className="relative px-4 py-4 flex items-center justify-between z-10">
          <button onClick={() => router.push('/')} className="p-2.5 bg-black/50 hover:bg-black/80 rounded-full border border-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 px-4 text-center">
            <h1 className="text-sm font-black truncate drop-shadow-md">{mangaTitle}</h1>
            <p className="text-[10px] font-bold text-zinc-400 truncate">{chapterTitle}</p>
          </div>
          <div className="w-10"></div> 
        </div>
      </div>

      <div className="flex-1 w-full max-w-3xl mx-auto flex flex-col cursor-pointer pb-32" onClick={() => setShowUI(!showUI)}>
        
        {errorMsg && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 pt-40 text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
              <X size={24} className="text-red-500" />
            </div>
            <h2 className="text-lg font-black mb-2 text-zinc-200">ไม่สามารถแสดงผลได้</h2>
            <p className="text-sm text-zinc-500">{errorMsg}</p>
          </div>
        )}

        {!errorMsg && images.map((src, index) => (
          <img key={index} src={src} alt={`Page ${index + 1}`} className="w-full h-auto block m-0 p-0" loading={index < 3 ? "eager" : "lazy"} />
        ))}

      </div>

      <div className={`fixed bottom-6 left-0 w-full z-50 px-4 transition-transform duration-300 ease-in-out transform-gpu flex justify-center ${showUI ? 'translate-y-0' : 'translate-y-[150%]'}`}>
        <div className="w-full max-w-sm bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-full p-2 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
          <button onClick={(e) => { e.stopPropagation(); if (prevChapter) router.push(`/manga/${id}/read/${prevChapter}`); }} disabled={!prevChapter} className={`flex items-center gap-1 px-4 py-2.5 rounded-full text-xs font-black transition-colors ${prevChapter ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'text-zinc-600 cursor-not-allowed'}`}>
            <ChevronLeft size={16} /> ก่อนหน้า
          </button>
          <button onClick={(e) => { e.stopPropagation(); router.push('/'); }} className="p-2.5 text-zinc-400 hover:text-white transition-colors">
            <Menu size={20} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); if (nextChapter) router.push(`/manga/${id}/read/${nextChapter}`); }} disabled={!nextChapter} className={`flex items-center gap-1 px-4 py-2.5 rounded-full text-xs font-black transition-colors ${nextChapter ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20' : 'text-zinc-600 cursor-not-allowed'}`}>
            ถัดไป <ChevronRight size={16} />
          </button>
        </div>
      </div>

    </div>
  );
}