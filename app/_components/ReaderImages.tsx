// app/manga/[id]/read/[chapterId]/_components/ReaderImages.tsx
// ✅ skeleton placeholder ทุกรูป → ไม่กระโดด layout
// ✅ progressive reveal: รูปโหลดเสร็จ fade in ทีละรูป
// ✅ reading progress bar ด้านบน
// ✅ mark as read อัตโนมัติเมื่อ scroll ถึง 80%
"use client";
import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  images: string[];
  chapterTitle: string;
  mangaId?: string;
  chapterId?: string;
}

function ReaderImage({ src, alt, index, priority }: { src: string; alt: string; index: number; priority: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Check ถ้ารูปอยู่ใน browser cache แล้ว (complete ก่อน onLoad event)
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  return (
    <div className="relative w-full" style={{ minHeight: loaded ? undefined : '60vh' }}>
      {/* Skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-zinc-900 animate-pulse flex items-center justify-center" style={{ minHeight: '60vh' }}>
          <div className="flex flex-col items-center gap-3 opacity-30">
            <div className="w-10 h-10 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
            <span className="text-xs text-zinc-500">กำลังโหลด...</span>
          </div>
        </div>
      )}

      {error ? (
        <div className="w-full flex items-center justify-center py-20 bg-zinc-950 text-zinc-600 text-sm">
          ⚠️ โหลดรูปไม่ได้ — หน้า {index + 1}
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`w-full h-auto block transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : index < 3 ? 'auto' : 'low'}
          decoding={priority ? 'sync' : 'async'}
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(true); }}
          // Reserve space ล่วงหน้า ลด CLS — ใช้ aspect-ratio แทน minHeight
          style={!loaded ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } : undefined}
        />
      )}
    </div>
  );
}

export default function ReaderImages({ images, chapterTitle, mangaId, chapterId }: Props) {
  const [progress, setProgress] = useState(0);
  const [marked, setMarked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reading progress tracker
  const updateProgress = useCallback(() => {
    const el = document.documentElement;
    const scrolled = el.scrollTop || document.body.scrollTop;
    const total = el.scrollHeight - el.clientHeight;
    if (total <= 0) return;
    const pct = Math.min(100, Math.round((scrolled / total) * 100));
    setProgress(pct);

    // Mark as read เมื่ออ่านถึง 80%
    if (pct >= 80 && !marked && mangaId && chapterId) {
      setMarked(true);
      try {
        const key = `read_${mangaId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        if (!existing.includes(chapterId)) {
          localStorage.setItem(key, JSON.stringify([...existing, chapterId]));
        }
      } catch {}
    }
  }, [marked, mangaId, chapterId]);

  useEffect(() => {
    window.addEventListener('scroll', updateProgress, { passive: true });
    return () => window.removeEventListener('scroll', updateProgress);
  }, [updateProgress]);

  if (images.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-24">
        <p className="text-zinc-500 text-sm">ไม่พบรูปภาพในตอนนี้</p>
        <p className="text-zinc-700 text-xs mt-2">อาจยังไม่ได้ scrape หรือรูปยังโหลดไม่เสร็จ</p>
      </div>
    );
  }

  return (
    <>
      {/* Reading Progress Bar — fixed ด้านบน */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-black/20">
        <div
          className="h-full bg-blue-500 transition-all duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main
        ref={containerRef}
        className="max-w-3xl mx-auto flex flex-col items-center bg-black"
        aria-label={`อ่าน ${chapterTitle}`}
      >
        {images.map((src, index) => (
          <ReaderImage
            key={`${src}-${index}`}
            src={src}
            alt={`${chapterTitle} หน้า ${index + 1}`}
            index={index}
            priority={index < 3}
          />
        ))}

        {/* End of chapter indicator */}
        <div className="w-full py-10 flex flex-col items-center gap-2 border-t border-zinc-900">
          <div className="text-zinc-600 text-xs">— จบตอนนี้ —</div>
          <div className="text-zinc-800 text-[10px]">{chapterTitle}</div>
        </div>
      </main>
    </>
  );
}