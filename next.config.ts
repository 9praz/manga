import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ✅ Next.js Image Optimization — resize + compress อัตโนมัติ
  images: {
    // รับทุก domain (cover มาจากหลายแหล่ง)
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    // ขนาดที่ใช้จริงในหน้า grid การ์ด
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [96, 128, 256],
    // เปิด AVIF + WebP — ขนาดเล็กกว่า JPEG 50-70%
    formats: ['image/avif', 'image/webp'],
    // Cache รูปที่ optimize แล้ว 7 วัน
    minimumCacheTTL: 604800,
  },

  // ✅ HTTP Cache Headers — Vercel CDN cache ทุก static asset
  async headers() {
    return [
      {
        source: '/api/proxy-image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400, immutable' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;