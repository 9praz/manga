// app/manga/[id]/_components/ViewCounter.tsx
"use client";
import { useEffect, useState } from 'react';
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

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function ViewCounter({ mangaTitle, initialCount }: Props) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    // ✅ Increment view เพียงครั้งเดียวต่อ session
    const key = `viewed_${mangaTitle}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    (async () => {
      // เรียก RPC ที่ increment แบบ atomic (ไม่ race condition)
      const { data } = await supabase.rpc('increment_view_count', {
        manga_title_input: mangaTitle,
      });
      if (data?.view_count) setCount(data.view_count);
    })();
  }, [mangaTitle]);

  return (
    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase">
      <Eye size={13} className="text-zinc-500" />
      {formatCount(count)} ครั้ง
    </span>
  );
}
