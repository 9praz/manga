"use client";

import React, { useState, useEffect, use } from 'react';
import { Loader2, ArrowLeft, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

export default function MangaDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await axios.get(`https://www.nekopost.net/api/project/detail/${id}`);
        setData(res.data);
      } catch (err) {
        console.error(err);
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
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="relative h-[40vh] w-full">
        <img 
          src={`/api/proxy-image?url=${encodeURIComponent(`https://www.osemocphoto.com/collectManga/${id}/${id}_cover.jpg`)}`}
          className="w-full h-full object-cover opacity-30 blur-sm"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
        <button onClick={() => router.back()} className="absolute top-6 left-6 p-3 bg-black/50 rounded-full backdrop-blur-md">
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-32 relative z-10 pb-20">
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">
          <img 
            src={`/api/proxy-image?url=${encodeURIComponent(`https://www.osemocphoto.com/collectManga/${id}/${id}_cover.jpg`)}`}
            className="w-56 aspect-[3/4] object-cover rounded-[2rem] shadow-2xl border border-white/10"
          />
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">{data?.projectInfo?.projectName}</h1>
            <p className="text-zinc-500 text-sm font-bold uppercase">{data?.projectInfo?.authorName}</p>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-sm font-black uppercase mb-6 text-zinc-500 tracking-widest">Chapter List</h2>
          <div className="grid gap-3">
            {data?.listChapter?.map((ch: any) => (
              <Link 
                href={`/manga/${id}/read/${ch.chapterId}`} 
                key={ch.chapterId}
                className="group flex items-center justify-between p-5 bg-zinc-900/50 hover:bg-blue-600 rounded-[1.5rem] border border-white/5 transition-all"
              >
                <span className="font-bold uppercase text-xs group-hover:text-white">Chapter {ch.chapterNo}</span>
                <Play size={16} className="text-blue-500 group-hover:text-white" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}