// app/api/proxy-image/route.ts
// ⚡ OPTIMIZED:
//   - Edge Runtime: ทำงานที่ CDN edge ใกล้ user ที่สุด ลด latency มาก
//   - Response streaming: ไม่ buffer ทั้งรูปใน memory ก่อน serve
//   - Stale-While-Revalidate 7 วัน: browser/edge cache serve ทันที
//   - Timeout 8s: ป้องกัน hanging request บน slow upstream
import { NextRequest } from 'next/server';

// ✅ Edge runtime = deploy ที่ CDN node ใกล้ user — เร็วกว่า serverless function มาก
export const runtime = 'edge';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Dest': 'image',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'same-site',
};

const BLOCKED_DOMAINS = new Set(['webtoon168.com', 'imgez.org']);

// ✅ Cache headers — 7 วัน browser + edge cache
// immutable = browser ไม่ต้อง revalidate เลย (รูปมังงะไม่เปลี่ยน)
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400, immutable',
  'CDN-Cache-Control': 'public, max-age=604800',
  'Vercel-CDN-Cache-Control': 'public, max-age=604800',
  'Access-Control-Allow-Origin': '*',
  'X-Proxy-By': 'manga-proxy',
} as const;

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
  <rect width="800" height="1200" fill="#111"/>
  <text x="400" y="590" text-anchor="middle" fill="#333" font-size="20" font-family="sans-serif">ไม่สามารถโหลดรูปได้</text>
  <text x="400" y="620" text-anchor="middle" fill="#333" font-size="14" font-family="sans-serif">Image unavailable</text>
</svg>`;

function placeholderResponse() {
  return new Response(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      // placeholder cache สั้นกว่า — ถ้า upstream กลับมา serve ได้ให้ลอง revalidate เร็ว
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');
  if (!imageUrl) {
    return new Response('Missing URL', { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  // Block ทันที — ไม่ต้อง fetch
  if (BLOCKED_DOMAINS.has(parsedUrl.hostname)) {
    return placeholderResponse();
  }

  // ✅ อนุญาตเฉพาะ http/https (ป้องกัน SSRF)
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return new Response('Invalid protocol', { status: 400 });
  }

  const referer = `${parsedUrl.protocol}//${parsedUrl.hostname}/`;

  try {
    // ✅ AbortController timeout 8 วินาที — ไม่ให้ slow upstream hang
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(imageUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Referer: referer,
        Origin: referer.slice(0, -1),
        Host: parsedUrl.hostname,
      },
      cache: 'force-cache',
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.status === 403 || res.status === 401) {
      return placeholderResponse();
    }

    if (!res.ok) {
      // Cache error response สั้นๆ เพื่อกัน thundering herd
      return new Response(`Upstream error: ${res.status}`, {
        status: res.status,
        headers: { 'Cache-Control': 'public, max-age=30' },
      });
    }

    const contentType = res.headers.get('Content-Type') || 'image/jpeg';

    // ถ้า upstream ส่ง HTML/JSON กลับมา (error page) → placeholder
    if (
      contentType.includes('text/html') ||
      contentType.includes('application/json') ||
      contentType.includes('text/plain')
    ) {
      return placeholderResponse();
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      ...CACHE_HEADERS,
    };

    // Forward Content-Length ถ้ามี — ช่วย browser จัดสรร buffer ล่วงหน้า
    const contentLength = res.headers.get('Content-Length');
    if (contentLength) headers['Content-Length'] = contentLength;

    // ✅ Stream body ตรงๆ — ไม่ buffer ใน memory ทั้งรูป
    // สำคัญมากสำหรับรูปขนาดใหญ่ (ลด memory ใน edge function)
    return new Response(res.body, { status: 200, headers });
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.includes('abort'));

    if (isAbort) {
      // Timeout — ส่ง placeholder แต่ cache สั้น (upstream อาจแค่ช้า)
      return new Response(PLACEHOLDER_SVG, {
        status: 504,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=10',
        },
      });
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('redirect') || msg.includes('fetch failed')) {
      return placeholderResponse();
    }

    console.error('[proxy-image] error:', imageUrl, err);
    return new Response('Proxy error', { status: 502 });
  }
}
