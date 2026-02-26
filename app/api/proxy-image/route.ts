import { NextRequest } from 'next/server';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'image',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'same-site',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

// โดเมนที่โหลดไม่ได้ (Cloudflare strict / redirect loop)
const BLOCKED_DOMAINS = ['webtoon168.com', 'imgez.org'];

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
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('url');
  if (!imageUrl) return new Response('Missing URL', { status: 400 });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  // Blocked domains → placeholder ทันที
  if (BLOCKED_DOMAINS.some(d => parsedUrl.hostname.includes(d))) {
    return placeholderResponse();
  }

  const referer = `${parsedUrl.protocol}//${parsedUrl.hostname}/`;

  try {
    const res = await fetch(imageUrl, {
      headers: {
        ...BROWSER_HEADERS,
        'Referer': referer,
        'Origin':  referer.slice(0, -1),
        'Host':    parsedUrl.hostname,
      },
      cache: 'no-store',
      redirect: 'follow',
    });

    // 403/401 → placeholder
    if (res.status === 403 || res.status === 401) {
      return placeholderResponse();
    }

    if (!res.ok) {
      return new Response(`Upstream error: ${res.status} ${res.statusText}`, { status: res.status });
    }

    const contentType = res.headers.get('Content-Type') || 'image/jpeg';

    // ได้ HTML กลับมา (error page) → placeholder
    if (
      contentType.includes('text/html') ||
      contentType.includes('application/json') ||
      contentType.includes('text/plain')
    ) {
      return placeholderResponse();
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
      'X-Proxy-By': 'manga-proxy',
    };

    const contentLength = res.headers.get('Content-Length');
    if (contentLength) headers['Content-Length'] = contentLength;

    return new Response(res.body, { status: 200, headers });

  } catch (err: unknown) {
    // redirect loop หรือ network error → placeholder แทน 502
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('redirect') || msg.includes('fetch failed')) {
      return placeholderResponse();
    }
    console.error('[proxy-image] fetch error:', imageUrl, err);
    return new Response('Proxy error', { status: 502 });
  }
}