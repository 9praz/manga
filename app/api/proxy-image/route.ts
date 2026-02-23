import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');
  if (!imageUrl) return new Response('Missing URL', { status: 400 });

  // ตั้ง Referer ตาม domain ของรูปนั้นๆ (แก้ hotlink protection)
  let referer = 'https://www.nekopost.net/';
  try {
    const u = new URL(imageUrl);
    referer = `${u.protocol}//${u.hostname}/`;
  } catch { /* ใช้ default */ }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      return new Response(`Image fetch failed: ${res.status}`, { status: res.status });
    }

    const blob = await res.blob();
    return new Response(blob, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    return new Response('Proxy error', { status: 502 });
  }
}
