// app/terms/page.tsx
// ✅ Static page — export as static, no revalidation needed
// ✅ SEO metadata included
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ข้อกำหนดการใช้งาน & DMCA | MANGA.BLUE',
  description: 'ข้อกำหนดการใช้งาน นโยบายความเป็นส่วนตัว และการแจ้ง DMCA สำหรับ MANGA.BLUE',
  robots: 'index, follow',
};

// Static generation — ไม่ต้อง fetch อะไร
export const dynamic = 'force-static';

const SECTIONS = [
  {
    id: 'terms',
    emoji: '📜',
    title: 'ข้อกำหนดการใช้งาน (Terms of Service)',
    content: [
      {
        heading: '1. การยอมรับข้อกำหนด',
        text: 'การเข้าใช้งานเว็บไซต์ MANGA.BLUE ("เว็บไซต์") ถือว่าคุณยอมรับข้อกำหนดและเงื่อนไขฉบับนี้ทั้งหมด หากคุณไม่ยอมรับ กรุณางดเว้นการใช้งาน',
      },
      {
        heading: '2. ลักษณะของบริการ',
        text: 'MANGA.BLUE เป็นเว็บไซต์รวบรวมและแสดงผลเนื้อหามังงะ/การ์ตูน โดยเนื้อหาถูก index มาจากแหล่งต้นทางบนอินเทอร์เน็ต เราไม่ได้เป็นเจ้าของลิขสิทธิ์ในเนื้อหาดังกล่าว',
      },
      {
        heading: '3. ข้อห้ามการใช้งาน',
        text: 'คุณตกลงว่าจะไม่: (ก) ใช้บริการเพื่อวัตถุประสงค์ที่ผิดกฎหมาย (ข) พยายาม reverse engineer หรือ scrape ระบบของเรา (ค) แชร์บัญชีกับบุคคลอื่น (ง) ใช้ซอฟต์แวร์อัตโนมัติในการเข้าถึงเว็บไซต์',
      },
      {
        heading: '4. การจำกัดความรับผิด',
        text: 'เว็บไซต์นี้ให้บริการ "ตามที่เป็น" (as-is) เราไม่รับประกันความถูกต้องสมบูรณ์ของเนื้อหา และไม่รับผิดชอบต่อความเสียหายใดๆ ที่เกิดจากการใช้งาน',
      },
      {
        heading: '5. การเปลี่ยนแปลงข้อกำหนด',
        text: 'เราขอสงวนสิทธิ์ในการแก้ไขข้อกำหนดนี้ได้ตลอดเวลา โดยจะประกาศการเปลี่ยนแปลงบนหน้านี้ การใช้งานต่อเนื่องหลังจากนั้นถือว่ายอมรับข้อกำหนดใหม่',
      },
    ],
  },
  {
    id: 'dmca',
    emoji: '⚖️',
    title: 'นโยบาย DMCA & การแจ้งลิขสิทธิ์',
    content: [
      {
        heading: 'เจตนาของเรา',
        text: 'MANGA.BLUE เคารพในทรัพย์สินทางปัญญา เราตอบสนองต่อการแจ้งเตือนการละเมิดลิขสิทธิ์ที่ถูกต้องตาม Digital Millennium Copyright Act (DMCA) และกฎหมายลิขสิทธิ์ไทย',
      },
      {
        heading: 'วิธีแจ้ง DMCA Takedown',
        text: 'หากคุณเชื่อว่าเนื้อหาบนเว็บไซต์นี้ละเมิดลิขสิทธิ์ของคุณ กรุณาส่งการแจ้งเป็นลายลักษณ์อักษรมาที่ dmca@manga.blue โดยระบุ: (1) ลายเซ็น/ชื่อของเจ้าของลิขสิทธิ์หรือตัวแทน (2) รายละเอียดงานที่ถูกละเมิด (3) URL ของเนื้อหาที่ละเมิด (4) ข้อมูลติดต่อของคุณ (5) คำระบุว่าข้อมูลในการแจ้งเป็นความจริง',
      },
      {
        heading: 'กระบวนการหลังรับแจ้ง',
        text: 'เมื่อได้รับการแจ้งที่ครบถ้วน เราจะดำเนินการตรวจสอบและลบเนื้อหาที่ละเมิดภายใน 3-5 วันทำการ และแจ้งผู้ให้บริการต้นทางด้วย',
      },
      {
        heading: 'Counter-Notice',
        text: 'หากเนื้อหาของคุณถูกลบโดยผิดพลาด คุณสามารถส่ง Counter-Notice พร้อมเหตุผลและหลักฐานที่ชัดเจนมาที่อีเมลเดียวกัน',
      },
    ],
  },
  {
    id: 'privacy',
    emoji: '🔒',
    title: 'นโยบายความเป็นส่วนตัว (Privacy Policy)',
    content: [
      {
        heading: 'ข้อมูลที่เราเก็บ',
        text: 'เราเก็บข้อมูลการใช้งานทั่วไป เช่น IP address, ประเภท browser, หน้าที่เข้าชม และเวลาที่เข้าชม เพื่อวัตถุประสงค์ในการปรับปรุงบริการ เราไม่เก็บข้อมูลส่วนตัวที่ระบุตัวตนได้โดยไม่ได้รับความยินยอม',
      },
      {
        heading: 'Cookies',
        text: 'เว็บไซต์ใช้ cookies เพื่อบันทึกการตั้งค่าของคุณ (เช่น dark/light mode, ประวัติการอ่าน) คุณสามารถปิด cookies ได้ใน browser settings แต่อาจกระทบต่อการใช้งาน',
      },
      {
        heading: 'บุคคลที่สาม',
        text: 'เราอาจใช้บริการจากบุคคลที่สาม เช่น Supabase (database), Vercel (hosting), และ Google Analytics เพื่อวิเคราะห์การใช้งาน บุคคลที่สามเหล่านี้มีนโยบายความเป็นส่วนตัวของตนเอง',
      },
      {
        heading: 'สิทธิของคุณ',
        text: 'คุณมีสิทธิ์ขอให้ลบข้อมูลส่วนตัวของคุณออกจากระบบ โดยติดต่อมาที่ privacy@manga.blue เราจะดำเนินการภายใน 30 วัน',
      },
    ],
  },
  {
    id: 'disclaimer',
    emoji: '⚠️',
    title: 'ข้อจำกัดความรับผิดชอบ (Disclaimer)',
    content: [
      {
        heading: 'เนื้อหาจากบุคคลที่สาม',
        text: 'เนื้อหามังงะที่แสดงบนเว็บไซต์นี้เป็นทรัพย์สินของเจ้าของลิขสิทธิ์ตามลำดับ MANGA.BLUE เป็นเพียงแพลตฟอร์มรวบรวมข้อมูล (aggregator) ไม่ใช่ผู้สร้างหรือเผยแพร่เนื้อหาโดยตรง',
      },
      {
        heading: 'เนื้อหาสำหรับผู้ใหญ่',
        text: 'เว็บไซต์อาจมีเนื้อหาที่เหมาะสมสำหรับผู้ใหญ่ การเข้าใช้งานถือว่าคุณยืนยันว่ามีอายุ 18 ปีขึ้นไป หรือได้รับอนุญาตจากผู้ปกครองแล้ว',
      },
      {
        heading: 'ความถูกต้องของข้อมูล',
        text: 'ข้อมูลต่างๆ เช่น คะแนน จำนวนตอน หรือวันที่อัปเดต อาจไม่ได้รับการอัปเดตแบบ real-time เราพยายามอย่างเต็มที่แต่ไม่รับประกันความถูกต้องสมบูรณ์',
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 px-4 py-4 bg-[#080808]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/" className="text-blue-500 hover:text-blue-400 text-sm font-bold transition-colors">
            ← กลับหน้าหลัก
          </Link>
          <span className="text-zinc-700">|</span>
          <h1 className="text-sm font-black text-zinc-400 uppercase tracking-widest">Legal & Policies</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-[11px] font-bold text-blue-400 mb-4">
            ⚖️ ข้อกำหนดและนโยบาย
          </div>
          <h1 className="text-3xl font-black mb-3">Terms, Privacy & DMCA</h1>
          <p className="text-zinc-500 text-sm max-w-xl mx-auto">
            อ่านข้อกำหนดการใช้งานก่อนเข้าใช้บริการ หากมีข้อสงสัยสามารถติดต่อเราได้ที่{' '}
            <a href="mailto:contact@manga.blue" className="text-blue-400 hover:underline">contact@manga.blue</a>
          </p>
          <p className="text-zinc-700 text-xs mt-2">อัปเดตล่าสุด: มกราคม 2568</p>
        </div>

        {/* Quick nav */}
        <nav className="flex flex-wrap gap-2 mb-10 justify-center">
          {SECTIONS.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-blue-500/30 rounded-xl text-xs font-bold text-zinc-400 hover:text-white transition-all"
            >
              {s.emoji} {s.title.split('(')[0].trim()}
            </a>
          ))}
        </nav>

        {/* Sections */}
        <div className="space-y-10">
          {SECTIONS.map(section => (
            <section
              key={section.id}
              id={section.id}
              className="bg-zinc-900/30 border border-white/5 rounded-2xl overflow-hidden scroll-mt-20"
            >
              {/* Section header */}
              <div className="px-6 py-5 border-b border-white/5 bg-zinc-900/50">
                <h2 className="text-base font-black flex items-center gap-2">
                  <span>{section.emoji}</span>
                  {section.title}
                </h2>
              </div>

              {/* Section content */}
              <div className="px-6 py-5 space-y-5">
                {section.content.map((item, i) => (
                  <div key={i}>
                    <h3 className="text-sm font-bold text-blue-400 mb-1.5">{item.heading}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Contact box */}
        <div className="mt-10 p-6 bg-blue-600/5 border border-blue-500/20 rounded-2xl text-center">
          <h3 className="font-black text-base mb-2">ติดต่อเรา</h3>
          <p className="text-zinc-400 text-sm mb-4">หากมีคำถามเกี่ยวกับข้อกำหนด DMCA หรือความเป็นส่วนตัว</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center text-sm">
            <a href="mailto:dmca@manga.blue" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors">
              📧 แจ้ง DMCA
            </a>
            <a href="mailto:contact@manga.blue" className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold transition-colors">
              💬 ติดต่อทั่วไป
            </a>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-zinc-800 text-xs mt-8">
          © 2025 MANGA.BLUE — เนื้อหาทั้งหมดเป็นลิขสิทธิ์ของเจ้าของตามลำดับ
        </p>
      </div>
    </div>
  );
}
