// app/manga/[id]/page.tsx — Server Component + SEO
// ⚡ OPTIMIZED:
//   - Parallel fetch ทั้ง chapters + mangaMeta พร้อมกัน (เหมือนเดิม ดีอยู่แล้ว)
//   - select เฉพาะ columns ที่ต้องการ (ลด payload)
//   - cover fallback chain ใช้ placehold แทน proxy เมื่อไม่มี URL จริง
//   - เพิ่ม Cache-Control hint ผ่าน revalidate
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, Info } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ChapterList from '../../_components/ChapterList';
import RatingWidget from '../../_components/RatingWidget';
import ViewCounter from '../../_components/ViewCounter';

// ISR 5 นาที — ลด cold fetch, ไม่ต้อง revalidate ทุก request
export const revalidate = 300;

// ✅ สร้าง client นอก function เพื่อ reuse connection pool
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function extractChapterNum(title: string): number {
  if (!title) return 0;
  const ep = title.match(/ep\.?\s*0*(\d+)/i);
  if (ep) return parseInt(ep[1]);
  const th = title.match(/(?:ตอน(?:ที่)?|chapter|ch\.?)\s*\.?\s*0*(\d+)/i);
  if (th) return parseInt(th[1]);
  const nums = title.match(/\d+/g);
  if (nums) return parseInt(nums[nums.length - 1]);
  return 0;
}

function proxyImage(url: string): string {
  if (!url) return '';
  return url.startsWith('http') && !url.includes('placehold.co')
    ? `/api/proxy-image?url=${encodeURIComponent(url)}`
    : url;
}

// ─── Dynamic SEO per manga ────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const title = decodeURIComponent(id);

  const { data } = await supabase
    .from('mangas')
    .select('cover_url, genres, rating_avg')
    .eq('title', title)
    .single();

  const description = `อ่านมังงะ ${title} แปลไทย ครบทุกตอน อัปเดตใหม่ล่าสุด อ่านฟรีออนไลน์ ไม่ต้องสมัครสมาชิก`;
  const coverUrl = data?.cover_url?.trim()
    ? `/api/proxy-image?url=${encodeURIComponent(data.cover_url)}`
    : undefined;

  return {
    title: `อ่าน ${title} | มังงะแปลไทย`,
    description,
    keywords: [
      title,
      `อ่าน${title}`,
      `${title}แปลไทย`,
      `${title} manga`,
      'อ่านมังงะ',
      'มังงะแปลไทย',
      'manga thai',
      ...(Array.isArray(data?.genres) ? data.genres : []),
    ],
    openGraph: {
      title: `อ่าน ${title} | มังงะแปลไทย`,
      description,
      type: 'book',
      locale: 'th_TH',
      images: coverUrl
        ? [{ url: coverUrl, width: 400, height: 600, alt: title }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: `อ่าน ${title}`,
      description,
      images: coverUrl ? [coverUrl] : [],
    },
    robots: { index: true, follow: true },
    alternates: {
      canonical: `https://yourdomain.com/manga/${encodeURIComponent(title)}`,
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function MangaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  // ✅ Parallel fetch — ทั้งคู่ยิงพร้อมกัน
  const [{ data: chaptersData, error }, { data: mangaMeta }] =
    await Promise.all([
      supabase
        .from('chapters')
        // ✅ select เฉพาะ columns ที่ใช้จริง (ลด payload จาก DB)
        .select('id, chapter_title, cover_url, created_at')
        .eq('manga_title', decodedId),
      supabase
        .from('mangas')
        .select(
          'title, cover_url, genres, country, view_count, rating_avg, rating_count'
        )
        .eq('title', decodedId)
        .single(),
    ]);

  if (error || !chaptersData || chaptersData.length === 0) notFound();

  // Sort + map
  const chapters = [...chaptersData]
    .sort(
      (a, b) =>
        extractChapterNum(b.chapter_title) - extractChapterNum(a.chapter_title)
    )
    .map((ch) => ({
      id: ch.id as string,
      number: extractChapterNum(ch.chapter_title),
      title: ch.chapter_title as string,
      createdAt: (ch.created_at as string) || null,
    }));

  const rawCover =
    mangaMeta?.cover_url?.trim() ||
    chaptersData[0]?.cover_url?.trim() ||
    '';

  const coverUrl = rawCover
    ? rawCover
    : `https://placehold.co/400x600/1f2937/3b82f6?text=${encodeURIComponent(
        decodedId.slice(0, 15)
      )}`;

  const proxiedCover = proxyImage(coverUrl);
  const genres: string[] = Array.isArray(mangaMeta?.genres)
    ? mangaMeta.genres
    : [];

  // JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: decodedId,
    inLanguage: 'th',
    genre: genres.join(', '),
    image: proxiedCover,
    description: `อ่านมังงะ ${decodedId} แปลไทย ครบทุกตอน`,
    url: `https://yourdomain.com/manga/${encodeURIComponent(decodedId)}`,
    numberOfPages: chapters.length,
    aggregateRating:
      (mangaMeta?.rating_avg ?? 0) > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: (mangaMeta!.rating_avg as number).toFixed(1),
            ratingCount: mangaMeta!.rating_count,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* หน้านี้ force dark เสมอ — manga detail เป็น dark-only design */}
      <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-600/30" style={{ colorScheme: 'dark' }}>

        {/* Hero blur banner */}
        <div className="relative h-[56vh] w-full overflow-hidden bg-[#050505]">
          {/* ✅ gradient 3 layer: ซ้อนกันเพื่อกำจัด hard edge ที่เห็นเป็นเส้นขาวบน mobile */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            {/* layer 1: bottom → up ทึบ */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent" />
            {/* layer 2: top → down ทึบ (กั้นรูปด้านบนไม่ให้โผล่) */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/60 to-transparent" />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxiedCover}
            className="w-full h-full object-cover opacity-30 blur-3xl scale-110"
            alt=""
            aria-hidden="true"
            // banner ไม่ต้อง high priority — ไม่กระทบ LCP
            loading="lazy"
          />
          <Link
            href="/"
            className="absolute top-8 left-6 z-20 p-3 bg-white/5 hover:bg-white/15 backdrop-blur-xl rounded-full border border-white/10 transition-all"
            aria-label="กลับหน้าหลัก"
          >
            <ArrowLeft size={20} />
          </Link>
        </div>

        {/* Main content */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 -mt-48 relative z-20 pb-40">

          {/* Header block */}
          <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">

            {/* Cover */}
            <div className="shrink-0 mx-auto md:mx-0 mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxiedCover}
                alt={`ปกมังงะ ${decodedId}`}
                width={256}
                height={341}
                // ✅ fetchpriority high — นี่คือ LCP element
                fetchPriority="high"
                className="w-44 md:w-64 rounded-[1.8rem] shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-white/10 object-cover object-top aspect-[3/4]"
                style={{ display: 'block' }}
              />
            </div>

            {/* Meta */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-tight mb-3">
                {decodedId}
              </h1>

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-4">
                  {genres.slice(0, 6).map((g) => (
                    <span
                      key={g}
                      className="px-3 py-1 bg-zinc-800/70 border border-white/10 rounded-full text-[10px] font-bold text-zinc-400 uppercase tracking-wider"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-center md:justify-start gap-5 text-zinc-500 flex-wrap mb-4">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase">
                  <Info size={13} className="text-blue-500" />
                  {chapters.length} ตอน
                </span>
                <ViewCounter
                  mangaTitle={decodedId}
                  initialCount={(mangaMeta?.view_count as number) ?? 0}
                />
              </div>

              <RatingWidget
                mangaTitle={decodedId}
                initialAvg={(mangaMeta?.rating_avg as number) ?? 0}
                initialCount={(mangaMeta?.rating_count as number) ?? 0}
              />
            </div>
          </div>

          {/* Chapter list */}
          <div className="mt-14">
            <ChapterList chapters={chapters} mangaId={id} />
          </div>
        </div>

        {/* Floating bottom nav */}
        {chapters.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md">
            <div className="bg-black/60 backdrop-blur-2xl border border-white/15 p-2 rounded-full flex gap-2 shadow-2xl">
              <Link
                href={`/manga/${id}/read/${chapters[chapters.length - 1].id}`}
                className="flex-1 py-3.5 bg-white text-black rounded-full font-black text-xs hover:bg-blue-600 hover:text-white transition-all text-center"
                prefetch={false}
              >
                ▶ ตอนแรก
              </Link>
              <Link
                href={`/manga/${id}/read/${chapters[0].id}`}
                className="flex-1 py-3.5 bg-blue-600 text-white rounded-full font-black text-xs hover:bg-blue-500 transition-all text-center"
                prefetch={true}
              >
                📖 ล่าสุด
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
