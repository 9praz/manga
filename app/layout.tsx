// app/layout.tsx
// ✅ Base SEO + Thai/English font setup
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://yourdomain.com'), // ← เปลี่ยน domain
  title: {
    default: 'อ่านมังงะออนไลน์ฟรี | มังงะแปลไทย',
    template: '%s | มังงะแปลไทย',
  },
  description: 'อ่านมังงะออนไลน์ฟรี มังงะแปลไทย อัปเดตใหม่ทุกวัน',
  verification: {
    // ใส่ Google Search Console verification code ตรงนี้
    // google: 'xxxxxxxxxxxxxxxxxxxx',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        {/* Preconnect สำหรับ performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased bg-[#050505]">
        {children}
      </body>
    </html>
  );
}
