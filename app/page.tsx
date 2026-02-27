// app/manga/[id]/page.tsx — Server Component + SEO + fix cover + view + rating
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, Info } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ChapterList from './_components/ChapterList';
import RatingWidget from './_components/RatingWidget';
import ViewCounter from './_components/ViewCounter';

export const revalidate = 300;

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

function proxyImage(url: string) {
  if (!url) return '';
  return url.startsWith('http') && !url.includes('placehold.co')
    ? `/api/proxy-image?url=${encodeURIComponent(url)}`
    : url;
}

// ─── Dynamic SEO per manga ───────────────────────────────────────────────────
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
      `${title}`, `อ่าน${title}`, `${title}แปลไทย`,
      `${title} manga`, 'อ่านมังงะ', 'มังงะแปลไทย', 'manga thai',
      ...(Array.isArray(data?.genres) ? data.genres : []),
    ],
    openGraph: {
      title: `อ่าน ${title} | มังงะแปลไทย`,
      description,
      type: 'book',
      locale: 'th_TH',
      images: coverUrl ? [{ url: coverUrl, width: 400, height: 600, alt: title }] : [],
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

export default async function MangaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  // ✅ Parallel fetch
  const [{ data: chaptersData, error }, { data: mangaMeta }] = await Promise.all([
    supabase
      .from('chapters')
      .select('id, chapter_title, cover_url, created_at')
      .eq('manga_title', decodedId),
    supabase
      .from('mangas')
      .select('title, cover_url, genres, country, view_count, rating_avg, rating_count')
      .eq('title', decodedId)
      .single(),
  ]);

  if (error || !chaptersData || chaptersData.length === 0) notFound();

  // ✅ Sort chapters numeric
  const chapters = [...chaptersData]
    .sort((a, b) => extractChapterNum(b.chapter_title) - extractChapterNum(a.chapter_title))
    .map((ch) => ({
      id:        ch.id as string,
      number:    extractChapterNum(ch.chapter_title),
      title:     ch.chapter_title as string,
      createdAt: (ch.created_at as string) || null,
    }));

  const rawCover = mangaMeta?.cover_url?.trim()
    || chaptersData[0]?.cover_url?.trim()
    || '';

  const coverUrl = rawCover
    ? rawCover
    : `https://placehold.co/400x600/1f2937/3b82f6?text=${encodeURIComponent(decodedId.slice(0, 15))}`;

  const proxiedCover = proxyImage(coverUrl);

  const genres: string[] = Array.isArray(mangaMeta?.genres) ? mangaMeta.genres : [];

  // ─── JSON-LD Structured Data (Google Book/Series) ───────────────────────
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
    aggregateRating: (mangaMeta?.rating_avg ?? 0) > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: (mangaMeta!.rating_avg as number).toFixed(1),
      ratingCount: mangaMeta!.rating_count,
      bestRating: 5,
      worstRating: 1,
    } : undefined,
  };

  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-600/30">

        {/* ─── HERO BLUR BANNER ─── */}
        <div className="relative h-[56vh] w-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/75 to-[#050505]/20 z-10" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxiedCover}
            className="w-full h-full object-cover opacity-30 blur-3xl scale-110"
            alt=""
            aria-hidden="true"
          />
          <Link
            href="/"
            className="absolute top-8 left-6 z-20 p-3 bg-white/5 hover:bg-white/15 backdrop-blur-xl rounded-full border border-white/10 transition-all"
            aria-label="กลับหน้าหลัก"
          >
            <ArrowLeft size={20} />
          </Link>
        </div>

        {/* ─── MAIN CONTENT ─── */}
        <div className="max-w-5xl mx-auto px-5 md:px-8 -mt-48 relative z-20 pb-40">

          {/* ─── HEADER BLOCK ─── */}
          <div className="flex flex-col md:flex-row gap-8 items-center md:items-end">

            {/* ✅ Cover — แก้รูปถูกหั่น:
                - กำหนด aspect-ratio ตายตัว 3/4
                - object-cover + object-top เพื่อให้ใบหน้า/ส่วนบนไม่หาย
                - ไม่ใช้ overflow hidden บน parent ที่บีบสัดส่วน */}
            <div className="shrink-0 mx-auto md:mx-0 mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxiedCover}
                alt={`ปกมังงะ ${decodedId}`}
                width={256}
                height={341}
                className="
                  w-44 md:w-64
                  rounded-[1.8rem]
                  shadow-[0_24px_64px_rgba(0,0,0,0.65)]
                  border border-white/10
                  object-cover object-top
                  aspect-[3/4]
                "
                style={{ display: 'block' }}
              />
            </div>

            {/* Meta */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-tight mb-3">
                {decodedId}
              </h1>

              {/* Genres badges */}
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

              {/* Stats */}
              <div className="flex items-center justify-center md:justify-start gap-5 text-zinc-500 flex-wrap mb-4">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase">
                  <Info size={13} className="text-blue-500" />
                  {chapters.length} ตอน
                </span>
                {/* ✅ ViewCounter — นับ view ฝั่ง client ครั้งแรกที่เปิดหน้า */}
                <ViewCounter
                  mangaTitle={decodedId}
                  initialCount={(mangaMeta?.view_count as number) ?? 0}
                />
              </div>

              {/* ✅ Rating Stars */}
              <RatingWidget
                mangaTitle={decodedId}
                initialAvg={(mangaMeta?.rating_avg as number) ?? 0}
                initialCount={(mangaMeta?.rating_count as number) ?? 0}
              />
            </div>
          </div>

          {/* ─── CHAPTER LIST ─── */}
          <div className="mt-14">
            <ChapterList chapters={chapters} mangaId={id} />
          </div>
        </div>

        {/* ─── FLOATING BOTTOM NAV ─── */}
        {chapters.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md">
            <div className="bg-black/60 backdrop-blur-2xl border border-white/15 p-2 rounded-full flex gap-2 shadow-2xl">
              <Link
                href={`/manga/${id}/read/${chapters[chapters.length - 1].id}`}
                className="flex-1 py-3.5 bg-white text-black rounded-full font-black text-xs hover:bg-blue-600 hover:text-white transition-all text-center"
              >
                ▶ ตอนแรก
              </Link>
              <Link
                href={`/manga/${id}/read/${chapters[0].id}`}
                className="flex-1 py-3.5 bg-blue-600 text-white rounded-full font-black text-xs hover:bg-blue-500 transition-all text-center"
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
