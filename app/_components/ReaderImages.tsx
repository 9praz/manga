// app/manga/[id]/read/[chapterId]/_components/ReaderImages.tsx
// ✅ Client Component: progressive loading ทำให้หน้าเร็วขึ้น
// - รูป 1-3 โหลดทันที (eager + high priority)
// - รูปที่เหลือ lazy load เมื่อ scroll ใกล้ถึง
"use client";

interface Props {
  images: string[];
  chapterTitle: string;
}

export default function ReaderImages({ images, chapterTitle }: Props) {
  if (images.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-24">
        <p className="text-zinc-500">ไม่พบรูปภาพในตอนนี้</p>
      </div>
    );
  }

  return (
    <main
      className="max-w-3xl mx-auto flex flex-col items-center bg-black"
      aria-label={`อ่าน ${chapterTitle}`}
    >
      {images.map((src, index) => (
        <img
          key={index}
          src={src}
          alt={`${chapterTitle} หน้า ${index + 1}`}
          className="w-full h-auto block"
          // ✅ 3 รูปแรก eager + fetchPriority high = โหลดก่อนใคว
          // รูปที่เหลือ lazy = โหลดเมื่อ scroll ไปถึง ไม่บล็อก render
          loading={index < 3 ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : index < 3 ? 'auto' : 'low'}
          decoding={index < 3 ? 'sync' : 'async'}
          // ✅ Reserve space ล่วงหน้า ลด layout shift (CLS)
          style={{ minHeight: index < 3 ? undefined : '200px' }}
        />
      ))}
    </main>
  );
}
