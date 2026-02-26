import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ztvchypgeoeiijjhclnh.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0dmNoeXBnZW9laWlqamhjbG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NDc1NzUsImV4cCI6MjA4NzMyMzU3NX0.ifHhClrpORNR0_JR_Q04q8b_yHbrEgSuIrPf5aaFX-Y";
const supabase = createClient(supabaseUrl, supabaseKey);

// 🎯 แก้ไข Type ของ params เป็น Promise ตามกฎของ Next.js 15
export default async function ReaderPage({ params }: { params: Promise<{ id: string, chapterId: string }> }) {
  
  // 🎯 ต้อง await params ก่อนดึงค่าออกมาใช้
  const resolvedParams = await params;
  const { id, chapterId } = resolvedParams;
  const decodedMangaTitle = decodeURIComponent(id);

  const { data: currentChapter } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .single();

  if (!currentChapter) {
    return <div className="min-h-screen flex items-center justify-center text-white bg-[#0a0a0a]">ไม่พบข้อมูลตอนนี้ หรือข้อมูลถูกลบไปแล้ว</div>;
  }

  let images: string[] = [];
  try {
    if (typeof currentChapter.image_urls === 'string') {
      images = JSON.parse(currentChapter.image_urls);
    } else if (Array.isArray(currentChapter.image_urls)) {
      images = currentChapter.image_urls;
    }
  } catch (e) {
    console.error("Error parsing images:", e);
  }

  const { data: allChapters } = await supabase
    .from('chapters')
    .select('id, chapter_title')
    .eq('manga_title', decodedMangaTitle)
    .order('chapter_title', { ascending: false });

  const currentIndex = allChapters?.findIndex(c => c.id === chapterId) ?? -1;
  const nextChapter = currentIndex > 0 ? allChapters![currentIndex - 1] : null; 
  const prevChapter = currentIndex !== -1 && currentIndex < (allChapters!.length - 1) ? allChapters![currentIndex + 1] : null; 

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <div className="sticky top-0 z-50 bg-[#141414]/90 backdrop-blur-md border-b border-gray-800 p-4 flex justify-between items-center shadow-lg">
        <Link href={`/`} className="text-blue-500 hover:text-blue-400 font-bold transition-colors">
          ← กลับหน้าหลัก
        </Link>
        <div className="text-center flex-1">
          <h1 className="text-lg font-bold text-gray-100">{decodedMangaTitle}</h1>
          <p className="text-sm text-gray-400">{currentChapter.chapter_title}</p>
        </div>
        <div className="w-24"></div> 
      </div>

      <div className="max-w-3xl mx-auto flex flex-col items-center pt-6 pb-10 bg-black">
        {images.length > 0 ? (
          images.map((url: string, index: number) => {
            // ✅ ส่งรูปทุกใบผ่าน proxy — แก้ hotlink protection, ไม่โหลดลงเครื่อง
            const src = url.startsWith('http')
              ? `/api/proxy-image?url=${encodeURIComponent(url)}`
              : url;
            return (
              <img
                key={index}
                src={src}
                alt={`Page ${index + 1}`}
                className="w-full h-auto block m-0 p-0"
                loading="lazy"
                decoding="async"
              />
            );
          })
        ) : (
          <div className="text-center mt-20">
            <p className="text-gray-500 mb-4">ไม่พบรูปภาพในตอนนี้</p>
            <p className="text-sm text-gray-600">💡 ตรวจสอบว่า scraper.py ดึง image_urls มาเก็บใน Supabase แล้วหรือยัง</p>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto p-4 flex justify-between items-center border-t border-gray-800 mb-10">
        {prevChapter ? (
          <Link href={`/manga/${encodeURIComponent(decodedMangaTitle)}/read/${prevChapter.id}`} className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition-colors">
            « ตอนก่อนหน้า
          </Link>
        ) : <div className="w-24"></div>}
        <span className="text-gray-500 text-sm">จบตอน</span>
        {nextChapter ? (
          <Link href={`/manga/${encodeURIComponent(decodedMangaTitle)}/read/${nextChapter.id}`} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm transition-colors">
            ตอนถัดไป »
          </Link>
        ) : <div className="w-24"></div>}
      </div>
    </div>
  );
}