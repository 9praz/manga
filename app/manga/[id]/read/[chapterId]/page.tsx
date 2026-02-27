// app/manga/[id]/read/[chapterId]/page.tsx
// ✅ Server Component + SEO + Performance
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReaderImages from '../../../../_components/ReaderImages';

// ✅ Cache reader 1 ชั่วโมง
export const revalidate = 3600;

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

// ─── Dynamic SEO per chapter ─────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}): Promise<Metadata> {
  const { id, chapterId } = await params;
  const mangaTitle = decodeURIComponent(id);

  const { data } = await supabase
    .from('chapters')
    .select('chapter_title')
    .eq('id', chapterId)
    .single();

  const chapterTitle = data?.chapter_title ?? 'ตอนใหม่';
  const num = extractChapterNum(chapterTitle);

  return {
    title: `อ่าน ${mangaTitle} ${chapterTitle} | มังงะแปลไทย`,
    description: `อ่าน ${mangaTitle} ตอนที่ ${num} แปลไทย ออนไลน์ฟรี ไม่ต้องสมัครสมาชิก`,
    keywords: [
      `${mangaTitle} ตอนที่ ${num}`, `อ่าน ${mangaTitle}`,
      `${mangaTitle} แปลไทย`, 'อ่านมังงะ', 'manga online',
    ],
    openGraph: {
      title: `อ่าน ${mangaTitle} ${chapterTitle}`,
      description: `อ่าน ${mangaTitle} ตอนที่ ${num} แปลไทย ออนไลน์ฟรี`,
      type: 'article',
      locale: 'th_TH',
    },
    robots: { index: true, follow: true },
    alternates: {
      canonical: `https://yourdomain.com/manga/${encodeURIComponent(mangaTitle)}/read/${chapterId}`,
    },
  };
}

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const { id, chapterId } = await params;
  const decodedMangaTitle = decodeURIComponent(id);

  // ✅ Parallel fetch — chapter data + all chapters พร้อมกัน
  const [{ data: currentChapter }, { data: allChapters }] = await Promise.all([
    supabase.from('chapters').select('*').eq('id', chapterId).single(),
    supabase
      .from('chapters')
      .select('id, chapter_title')
      .eq('manga_title', decodedMangaTitle),
  ]);

  if (!currentChapter) notFound();

  // ✅ Parse images
  let images: string[] = [];
  try {
    images =
      typeof currentChapter.image_urls === 'string'
        ? JSON.parse(currentChapter.image_urls)
        : Array.isArray(currentChapter.image_urls)
        ? currentChapter.image_urls
        : [];
  } catch { images = []; }

  // ✅ Filter เอาเฉพาะ url ที่ valid
  images = images.filter((u) => typeof u === 'string' && u.startsWith('http'));

  // ✅ Proxy URLs
  const proxiedImages = images.map(
    (url) => `/api/proxy-image?url=${encodeURIComponent(url)}`
  );

  // ✅ Sort chapters + หา prev/next
  const sorted = [...(allChapters || [])].sort(
    (a, b) => extractChapterNum(b.chapter_title) - extractChapterNum(a.chapter_title)
  );
  const currentIndex = sorted.findIndex((c) => c.id === chapterId);
  const nextChapter = currentIndex > 0 ? sorted[currentIndex - 1] : null;
  const prevChapter = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null;

  const chapterNum = extractChapterNum(currentChapter.chapter_title);

  // JSON-LD Article
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `อ่าน ${decodedMangaTitle} ตอนที่ ${chapterNum}`,
    inLanguage: 'th',
    isPartOf: {
      '@type': 'Book',
      name: decodedMangaTitle,
      url: `https://yourdomain.com/manga/${encodeURIComponent(decodedMangaTitle)}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-[#0a0a0a] text-white">

        {/* ─── STICKY HEADER ─── */}
        <header className="sticky top-0 z-50 bg-[#111]/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex justify-between items-center">
          <Link
            href="/"
            className="text-blue-500 hover:text-blue-400 font-bold text-sm transition-colors whitespace-nowrap"
          >
            ← หน้าหลัก
          </Link>
          <div className="text-center flex-1 px-3 min-w-0">
            <h1 className="text-sm font-bold text-zinc-100 truncate">{decodedMangaTitle}</h1>
            <p className="text-[11px] text-zinc-400">{currentChapter.chapter_title}</p>
          </div>
          <Link
            href={`/manga/${id}`}
            className="text-zinc-400 hover:text-white font-bold text-sm transition-colors whitespace-nowrap"
          >
            ทั้งหมด
          </Link>
        </header>

        {/* ─── NAV TOP ─── */}
        <ChapterNav id={id} prev={prevChapter} next={nextChapter} position="top" />

        {/* ─── IMAGES ─── */}
        {/* ✅ ReaderImages = Client Component จัดการ progressive loading */}
        <ReaderImages
          images={proxiedImages}
          chapterTitle={currentChapter.chapter_title}
        />

        {/* ─── NAV BOTTOM ─── */}
        <ChapterNav id={id} prev={prevChapter} next={nextChapter} position="bottom" />

        <div className="h-16" />
      </div>
    </>
  );
}

// ─── Chapter Nav Component ────────────────────────────────────────────────────
function ChapterNav({
  id,
  prev,
  next,
  position,
}: {
  id: string;
  prev: { id: string; chapter_title: string } | null;
  next: { id: string; chapter_title: string } | null;
  position: 'top' | 'bottom';
}) {
  const borderClass = position === 'top' ? 'border-b' : 'border-t';
  return (
    <nav
      className={`max-w-3xl mx-auto flex justify-between items-center px-4 py-3 ${borderClass} border-zinc-800`}
      aria-label={position === 'top' ? 'นำทางบน' : 'นำทางล่าง'}
    >
      {prev ? (
        <Link
          href={`/manga/${id}/read/${prev.id}`}
          prefetch={true}
          className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
        >
          « ตอนก่อนหน้า
        </Link>
      ) : <div />}

      {position === 'bottom' && (
        <span className="text-zinc-600 text-xs">จบตอน</span>
      )}

      {next ? (
        <Link
          href={`/manga/${id}/read/${next.id}`}
          prefetch={true}
          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
        >
          ตอนถัดไป »
        </Link>
      ) : <div />}
    </nav>
  );
}
