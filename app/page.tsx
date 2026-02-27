// ✅ Server Component — ดึง Supabase ฝั่ง server
// HTML + data พร้อมทันทีที่ browser รับ ไม่ต้องรอ JS fetch อีกรอบ
import { createClient } from '@supabase/supabase-js';
import MangaClient from './_components/MangaClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ Cache หน้านี้ 5 นาที — Vercel serve จาก CDN ทันที
export const revalidate = 300;

export default async function HomePage() {
  const { data, error } = await supabase
    .from('mangas')
    .select('title, cover_url, genres, country')
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
    id:      row.title as string,
    title:   row.title as string,
    cover:   (row.cover_url && row.cover_url.trim() !== '')
      ? row.cover_url as string
      : `https://placehold.co/400x600/1f2937/3b82f6?text=${encodeURIComponent((row.title as string).slice(0, 15))}`,
    genres:  Array.isArray(row.genres) ? [...new Set(row.genres as string[])] : [],
    country: (row.country as string) || 'japan',
  }));

  // ✅ ส่ง data ที่ดึงมาแล้วลงไปให้ Client Component เลย
  return <MangaClient mangas={mangas} />;
}