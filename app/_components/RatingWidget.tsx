// app/manga/[id]/_components/RatingWidget.tsx
"use client";
import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  mangaTitle: string;
  initialAvg: number;
  initialCount: number;
}

// แสดงดาว 5 ดวง รองรับ half star
function StarDisplay({ value, size = 18 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`คะแนน ${value.toFixed(1)} จาก 5`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.min(Math.max(value - (star - 1), 0), 1); // 0, 0.5, 1
        return (
          <span key={star} className="relative inline-block" style={{ width: size, height: size }}>
            {/* background star (empty) */}
            <Star
              size={size}
              className="text-zinc-700 absolute inset-0"
              fill="currentColor"
            />
            {/* foreground star (fill %) */}
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star size={size} className="text-yellow-400" fill="currentColor" />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ดาวให้กด hover
function StarInput({
  hover,
  selected,
  onHover,
  onClick,
}: {
  hover: number;
  selected: number;
  onHover: (v: number) => void;
  onClick: (v: number) => void;
}) {
  const active = hover || selected;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => onHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onClick(star)}
          onMouseEnter={() => onHover(star)}
          className="transition-transform hover:scale-125"
          aria-label={`ให้คะแนน ${star} ดาว`}
        >
          <Star
            size={22}
            className={star <= active ? 'text-yellow-400' : 'text-zinc-700'}
            fill="currentColor"
          />
        </button>
      ))}
    </div>
  );
}

export default function RatingWidget({ mangaTitle, initialAvg, initialCount }: Props) {
  const [avg, setAvg]         = useState(initialAvg);
  const [count, setCount]     = useState(initialCount);
  const [hover, setHover]     = useState(0);
  const [selected, setSelected] = useState(0);
  const [voted, setVoted]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // โหลดว่า user เคย vote แล้วหรือยัง (localStorage)
  useEffect(() => {
    const stored = localStorage.getItem(`rating_${mangaTitle}`);
    if (stored) {
      setVoted(true);
      setSelected(Number(stored));
    }
  }, [mangaTitle]);

  async function handleVote(star: number) {
    if (voted || loading) return;
    setLoading(true);
    setSelected(star);

    try {
      // ✅ เรียก RPC ที่ recalculate avg แบบ atomic
      const { data, error } = await supabase.rpc('rate_manga', {
        manga_title_input: mangaTitle,
        new_rating: star,
      });

      if (error) throw error;

      if (data) {
        setAvg(parseFloat(data.rating_avg.toFixed(1)));
        setCount(data.rating_count);
      }

      localStorage.setItem(`rating_${mangaTitle}`, star.toString());
      setVoted(true);
      setMessage('ขอบคุณสำหรับการให้คะแนน!');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        {/* แสดงดาว avg */}
        <StarDisplay value={avg} />

        <span className="text-yellow-400 font-black text-sm">
          {avg > 0 ? avg.toFixed(1) : '—'}
        </span>
        <span className="text-zinc-600 text-[11px]">
          ({count > 0 ? `${count} คะแนน` : 'ยังไม่มีคะแนน'})
        </span>
      </div>

      {/* ให้คะแนน */}
      {!voted ? (
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 text-[11px] font-bold uppercase">ให้คะแนน:</span>
          <StarInput
            hover={hover}
            selected={selected}
            onHover={setHover}
            onClick={handleVote}
          />
          {loading && <span className="text-[11px] text-zinc-500 animate-pulse">กำลังบันทึก...</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <StarDisplay value={selected} size={16} />
          <span className="text-[11px] text-zinc-500">คะแนนของคุณ: {selected}.0</span>
        </div>
      )}

      {message && (
        <p className="text-[11px] text-green-400 font-bold">{message}</p>
      )}
    </div>
  );
}
