import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

// ✅ Cache หน้าอ่านมังงะ 1 ชั่วโมง — Vercel serve จาก CDN ทันที
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

export default async function ReaderPage({ params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const { id, chapterId } = await params;
  const decodedMangaTitle = decodeURIComponent(id);

  // ✅ Parallel fetch — ดึงทั้ง chapter data และ chapter list พร้อมกัน
  const [{ data: currentChapter }, { data: allChapters }] = await Promise.all([
    supabase.from('chapters').select('*').eq('id', chapterId).single(),
    supabase
      .from('chapters')
      .select('id, chapter_title')
      .eq('manga_title', decodedMangaTitle)
      .order('chapter_title', { ascending: false }),
  ]);

  if (!currentChapter) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-[#0a0a0a]">
        ไม่พบข้อมูลตอนนี้
      </div>
    );
  }

  let images: string[] = [];
  try {
    images = typeof currentChapter.image_urls === 'string'
      ? JSON.parse(currentChapter.image_urls)
      : Array.isArray(currentChapter.image_urls)
        ? currentChapter.image_urls
        : [];
  } catch { images = []; }

  // ✅ เรียง chapters ด้วย extractChapterNum เพื่อให้ถูกต้อง
  const sortedChapters = [...(allChapters || [])].sort((a, b) =>
    extractChapterNum(b.chapter_title) - extractChapterNum(a.chapter_title)
  );

  const currentIndex = sortedChapters.findIndex(c => c.id === chapterId);
  const nextChapter  = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const prevChapter  = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">

      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-50 bg-[#141414]/90 backdrop-blur-md border-b border-gray-800 p-4 flex justify-between items-center shadow-lg">
        <Link href="/" className="text-blue-500 hover:text-blue-400 font-bold transition-colors text-sm">
          ← หน้าหลัก
        </Link>
        <div className="text-center flex-1 px-4">
          <h1 className="text-base font-bold text-gray-100 line-clamp-1">{decodedMangaTitle}</h1>
          <p className="text-xs text-gray-400">{currentChapter.chapter_title}</p>
        </div>
        <Link href={`/manga/${id}`} className="text-zinc-400 hover:text-white font-bold transition-colors text-sm">
          ตอนทั้งหมด
        </Link>
      </div>

      {/* ─── NAV TOP ─── */}
      <div className="max-w-3xl mx-auto flex justify-between items-center px-4 py-3 border-b border-zinc-800">
        {prevChapter ? (
          <Link href={`/manga/${id}/read/${prevChapter.id}`}
            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm transition-colors">
            « ตอนก่อนหน้า
          </Link>
        ) : <div />}
        {nextChapter ? (
          <Link href={`/manga/${id}/read/${nextChapter.id}`}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm transition-colors">
            ตอนถัดไป »
          </Link>
        ) : <div />}
      </div>

      {/* ─── IMAGES ─── */}
      <div className="max-w-3xl mx-auto flex flex-col items-center bg-black">
        {images.length > 0 ? (
          images.map((url: string, index: number) => {
            const src = url.startsWith('http')
              ? `/api/proxy-image?url=${encodeURIComponent(url)}`
              : url;
            return (
              <img
                key={index}
                src={src}
                alt={`Page ${index + 1}`}
                className="w-full h-auto block"
                // ✅ โหลด 3 รูปแรกทันที ที่เหลือ lazy
                loading={index < 3 ? 'eager' : 'lazy'}
                decoding="async"
              />
            );
          })
        ) : (
          <div className="text-center mt-20 pb-20">
            <p className="text-gray-500">ไม่พบรูปภาพในตอนนี้</p>
          </div>
        )}
      </div>

      {/* ─── NAV BOTTOM ─── */}
      <div className="max-w-3xl mx-auto p-4 flex justify-between items-center border-t border-gray-800 mb-10">
        {prevChapter ? (
          <Link href={`/manga/${id}/read/${prevChapter.id}`}
            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm transition-colors">
            « ตอนก่อนหน้า
          </Link>
        ) : <div />}
        <span className="text-gray-500 text-sm">จบตอน</span>
        {nextChapter ? (
          <Link href={`/manga/${id}/read/${nextChapter.id}`}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm transition-colors">
            ตอนถัดไป »
          </Link>
        ) : <div />}
      </div>
    </div>
  );
}
