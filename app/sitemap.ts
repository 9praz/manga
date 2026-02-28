// app/sitemap.ts
// ⚡ OPTIMIZED:
//   - select เฉพาะ columns ที่จำเป็น (title, updated_at, id, created_at)
//   - Parallel fetch พร้อมกัน (เหมือนเดิม ดีอยู่แล้ว)
//   - ถ้า sitemap ใหญ่เกิน 50,000 URLs → ควรแตกเป็น sitemap index
//     แต่ตอนนี้ยังไม่ถึง ไว้ scale ทีหลัง
import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BASE_URL = 'https://yourdomain.com'; // ← เปลี่ยน domain

// Sitemap regenerate ทุก 1 ชั่วโมง
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // ✅ Parallel fetch — ทั้งคู่พร้อมกัน
  const [{ data: mangas }, { data: chapters }] = await Promise.all([
    supabase
      .from('mangas')
      .select('title, updated_at') // ✅ เฉพาะที่จำเป็น
      .order('updated_at', { ascending: false }),
    supabase
      .from('chapters')
      .select('id, manga_title, created_at') // ✅ เฉพาะที่จำเป็น
      .order('created_at', { ascending: false }),
  ]);

  const now = new Date();

  const homePage: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  const mangaPages: MetadataRoute.Sitemap = (mangas ?? []).map((m) => ({
    url: `${BASE_URL}/manga/${encodeURIComponent(m.title)}`,
    lastModified: m.updated_at ? new Date(m.updated_at) : now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const chapterPages: MetadataRoute.Sitemap = (chapters ?? []).map((ch) => ({
    url: `${BASE_URL}/manga/${encodeURIComponent(ch.manga_title)}/read/${ch.id}`,
    lastModified: ch.created_at ? new Date(ch.created_at) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...homePage, ...mangaPages, ...chapterPages];
}
