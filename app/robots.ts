// app/robots.ts — ไม่มีอะไรต้อง optimize เพิ่ม โครงสร้างถูกต้องแล้ว
import type { MetadataRoute } from 'next';

const BASE_URL = 'https://yourdomain.com'; // ← เปลี่ยน domain

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // ✅ Block API route ไม่ให้ crawler ไปโหลดรูปผ่าน proxy ซ้ำ
        disallow: ['/api/'],
      },
      {
        // ✅ บอก Google Image bot ให้ index รูปได้
        userAgent: 'Googlebot-Image',
        allow: '/',
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    // host: BASE_URL, // optional — ช่วย crawler รู้ canonical domain
  };
}
