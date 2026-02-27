// app/page.tsx — Server Component + Full SEO
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import MangaClient from './_components/MangaClient';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'อ่านมังงะออนไลน์ฟรี | มังงะแปลไทย อัปเดตใหม่ทุกวัน',
  description:
    'อ่านมังงะออนไลน์ฟรี มังงะแปลไทย อัปเดตใหม่ทุกวัน ครบทุกแนว แอคชั่น โรแมนซ์ แฟนตาซี ไม่ต้องสมัครสมาชิก อ่านได้เลย',
  keywords: [
    'อ่านมังงะ', 'มังงะ', 'manga', 'มังงะแปลไทย', 'อ่านการ์ตูน',
    'มังงะออนไลน์', 'manga online', 'read manga', 'manga thai',
    'อ่านมังงะฟรี', 'การ์ตูนญี่ปุ่น', 'มังงะใหม่', 'มังงะอัปเดต',
    'manhwa', 'manhua', 'มังฮวา', 'มังฮัว',
  ],
  openGraph: {
    title: 'อ่านมังงะออนไลน์ฟรี | มังงะแปลไทย',
    description: 'อ่านมังงะออนไลน์ฟรี มังงะแปลไทย อัปเดตใหม่ทุกวัน ครบทุกแนว',
    type: 'website',
    locale: 'th_TH',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'อ่านมังงะออนไลน์ฟรี | มังงะแปลไทย',
    description: 'อ่านมังงะออนไลน์ฟรี มังงะแปลไทย อัปเดตใหม่ทุกวัน',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function HomePage() {
  const { data, error } = await supabase
    .from('mangas')
    .select('title, cover_url, genres, country, view_count, rating_avg, rating_count')
    .order('title', { ascending: true });

  if (error || !data) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] gap-5 px-8 text-center">
        <p className="text-lg font-black text-zinc-300">ไม่สามารถเชื่อมต่อ Database ได้</p>
        <a href="/" className="px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-black hover:bg-blue-500">
          ลองใหม่
        </a>
      </div>
    );
  }

  const mangas = data.map((row) => ({
    id:           row.title as string,
    title:        row.title as string,
    cover:        row.cover_url?.trim()
      ? row.cover_url as string
      : `https://placehold.co/400x600/1f2937/3b82f6?text=${encodeURIComponent((row.title as string).slice(0, 15))}`,
    genres:       Array.isArray(row.genres) ? [...new Set(row.genres as string[])] : [],
    country:      (row.country as string) || 'japan',
    view_count:   (row.view_count as number) ?? 0,
    rating_avg:   (row.rating_avg as number) ?? 0,
    rating_count: (row.rating_count as number) ?? 0,
  }));

  return <MangaClient mangas={mangas} />;
}
