import type { Config } from "tailwindcss";

const config: Config = {
  // บรรทัดนี้คือหัวใจสำคัญที่ทำให้ปุ่มกดของคุณทำงานได้ครับ
  darkMode: 'class', 
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;