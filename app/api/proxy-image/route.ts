import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');
  if (!imageUrl) return new Response('Missing URL', { status: 400 });

  const res = await fetch(imageUrl, {
    headers: {
      'Referer': 'https://www.nekopost.net/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const blob = await res.blob();
  return new Response(blob, {
    headers: { 
      'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}