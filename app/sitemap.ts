// app/sitemap.ts
// ✅ Auto-generate sitemap ทุก manga + chapter page
// Google จะ crawl ได้ครบทุกหน้า → SEO ดีขึ้นมาก
import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BASE_URL = 'https://yourdomain.com'; // ← เปลี่ยนเป็น domain จริง

export const revalidate = 3600; // regenerate ทุก 1 ชม.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ data: mangas }, { data: chapters }] = await Promise.all([
    supabase.from('mangas').select('title, updated_at'),
    supabase.from('chapters').select('id, manga_title, created_at'),
  ]);

  const homePage: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  const mangaPages: MetadataRoute.Sitemap = (mangas ?? []).map((m) => ({
    url: `${BASE_URL}/manga/${encodeURIComponent(m.title)}`,
    lastModified: m.updated_at ? new Date(m.updated_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const chapterPages: MetadataRoute.Sitemap = (chapters ?? []).map((ch) => ({
    url: `${BASE_URL}/manga/${encodeURIComponent(ch.manga_title)}/read/${ch.id}`,
    lastModified: ch.created_at ? new Date(ch.created_at) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...homePage, ...mangaPages, ...chapterPages];
}
