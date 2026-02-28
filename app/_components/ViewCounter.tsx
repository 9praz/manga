// app/manga/[id]/_components/ViewCounter.tsx
// ⚡ OPTIMIZED:
//   - fire-and-forget ไม่ block render
//   - ถ้า RPC fail → ไม่ error ไม่ crash
//   - ใช้ useRef แทน useState เพื่อตรวจ session (ไม่ trigger rerender)
"use client";
import { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  mangaTitle: string;
  initialCount: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function ViewCounter({ mangaTitle, initialCount }: Props) {
  const [count, setCount] = useState(initialCount);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const key = `viewed_${mangaTitle}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    // fire-and-forget — ไม่ await ใน useEffect body
    supabase
      .rpc('increment_view_count', { manga_title_input: mangaTitle })
      .then(({ data }) => {
        if (data?.view_count) setCount(data.view_count);
      })
      .catch(() => {/* silent fail */});
  }, [mangaTitle]);

  return (
    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tabular-nums">
      <Eye size={13} className="text-zinc-500" />
      {formatCount(count)} ครั้ง
    </span>
  );
}
