"use client";

import React, { useState, useEffect, use } from 'react';
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight, Settings, Maximize2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const getApiBase = () => {
  const url = process.env.NEXT_PUBLIC_API_URL || "https://manga-production-6994.up.railway.app";
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

export default function ReaderPage({ params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const { id, chapterId } = use(params);
  const router = useRouter();
  const API_BASE = getApiBase();

  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPages = async () => {
      if (!chapterId) return;
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/chapters/${chapterId}/pages`);
        if (!res.ok) throw new Error("Failed to load pages");
        const data = await res.json();
        setPages(data.pages || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPages();
    window.scrollTo(0, 0);
  }, [chapterId]);

  const getProxyUrl = (url: string) => {
    return `${API_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
    </div>
  );

  if (error || pages.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6">
      <p className="text-zinc-500 mb-6">{error || "ไม่พบรูปภาพในตอนนี้"}</p>
      <button onClick={() => router.back()} className="px-6 py-2 bg-blue-600 rounded-full font-bold">กลับ</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="fixed top-0 inset-x-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/5 px-4 h-14 flex items-center justify-between">
        <button onClick={() => router.push(`/manga/${id}`)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
          Reading Mode
        </div>
        <div className="w-10"></div>
      </header>

      <main className="pt-14 pb-20 max-w-[800px] mx-auto">
        <div className="flex flex-col">
          {pages.map((page, index) => (
            <img
              key={index}
              src={getProxyUrl(page)}
              alt={`Page ${index + 1}`}
              className="w-full h-auto block"
              loading={index < 3 ? "eager" : "lazy"}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/fallback-image.png"; 
              }}
            />
          ))}
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 z-50 bg-black/90 backdrop-blur-xl border-t border-white/5 p-4">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <button onClick={() => router.back()} className="flex-1 py-3 bg-zinc-900 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest active:scale-95 transition-all">
            <ChevronLeft size={16} /> Previous
          </button>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="p-4 bg-blue-600 rounded-2xl active:scale-95 transition-all">
             <Maximize2 size={16} />
          </button>
          <button className="flex-1 py-3 bg-zinc-900 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest active:scale-95 transition-all">
            Next <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </div>
  );
}