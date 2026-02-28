// app/page.tsx — Server Component + SSR filtering + Full SEO
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
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PER_PAGE = 24;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; genre?: string; country?: string }>;
}) {
  const sp = await searchParams;
  const page        = Math.max(1, parseInt(sp.page   || '1', 10));
  const q           = (sp.q       || '').trim();
  const genre       = (sp.genre   || 'all').trim();
  const country     = (sp.country || 'all').trim();

  // ── 1. ดึง genres ทั้งหมดสำหรับ filter bar (แยก query, cache ได้ดี) ──────────
  const { data: allMeta } = await supabase
    .from('mangas')
    .select('genres, country');

  const genreSet = new Set<string>();
  const countrySet = new Set<string>();
  for (const row of allMeta ?? []) {
    if (Array.isArray(row.genres)) row.genres.forEach((g: string) => genreSet.add(g));
    if (row.country) countrySet.add(row.country as string);
  }
  const availableGenres = Array.from(genreSet).sort();

  // ── 2. ดึง banner (5 เรื่องแรก fixed) ────────────────────────────────────────
  const { data: bannerData } = await supabase
    .from('mangas')
    .select('title, cover_url, description, genres, country, view_count, rating_avg, rating_count')
    .order('view_count', { ascending: false })
    .limit(5);

  const banner = (bannerData ?? []).map(toManga);

  // ── 3. ดึง mangas หน้าปัจจุบัน (server-side filter + pagination) ───────────
  let query = supabase
    .from('mangas')
    .select('title, cover_url, genres, country, view_count, rating_avg, rating_count', { count: 'exact' });

  if (q)                   query = query.ilike('title', `%${q}%`);
  if (country !== 'all')   query = query.eq('country', country);
  if (genre !== 'all')     query = query.contains('genres', [genre]);

  const from = (page - 1) * PER_PAGE;
  const { data: mangaData, count } = await query
    .order('title', { ascending: true })
    .range(from, from + PER_PAGE - 1);

  const mangas     = (mangaData ?? []).map(toManga);
  const total      = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  if (mangaData === null) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] gap-5 px-8 text-center">
        <p className="text-lg font-black text-zinc-300">ไม่สามารถเชื่อมต่อ Database ได้</p>
        <a href="/" className="px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-black hover:bg-blue-500 transition-colors">
          ลองใหม่
        </a>
      </div>
    );
  }

  return (
    <MangaClient
      mangas={mangas}
      banner={banner}
      availableGenres={availableGenres}
      total={total}
      totalPages={totalPages}
      currentPage={page}
      currentQ={q}
      currentGenre={genre}
      currentCountry={country}
    />
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function toManga(row: Record<string, unknown>) {
  return {
    id:           row.title as string,
    title:        row.title as string,
    cover: (row.cover_url as string)?.trim()
      ? (row.cover_url as string)
      : `https://placehold.co/400x600/1f2937/3b82f6?text=${encodeURIComponent(
          ((row.title as string) || '').slice(0, 15)
        )}`,
    genres:       Array.isArray(row.genres) ? [...new Set(row.genres as string[])] : [],
    country:      (row.country as string) || 'japan',
    desc:         (row.description as string) || '',
    view_count:   (row.view_count  as number) ?? 0,
    rating_avg:   (row.rating_avg  as number) ?? 0,
    rating_count: (row.rating_count as number) ?? 0,
  };
}