/// <reference types="vite/client" />
/// <reference types="google.maps" />

/**
 * Khai bao kieu TypeScript cho toan bo bien moi truong (Khoa API va Duong dan) phia giao dien Vite.
 * Luu y: Cac bien co tien to `VITE_` se duoc Vite nhung vao goi ma nguon giao dien khi dong goi.
 * Cac khoa nhay cam tren may chu (`GEMINI_API_KEY`, `YOUTUBE_API_KEY`) nen cau hinh o may chu hoac Netlify.
 */
interface ImportMetaEnv {
  /** Khoa API Google Maps JS (dung trong LocationPage.tsx -> mapLoader.ts) */
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  /** Duong dan du an Supabase (dung trong src/lib/supabase.ts cho Xac thuc, Nhan tin, Ban be, Goi thoai) */
  readonly VITE_SUPABASE_URL: string;
  /** Khoa cong khai Anon cua Supabase (dung trong src/lib/supabase.ts) */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Khoa Gemini API phia giao dien (chi dung du phong trong AiPage.tsx / EyeTalkDashboard.tsx khi may chu trung chuyen khong phan hoi) */
  readonly VITE_GEMINI_API_KEY?: string;
  /** Khoa Gemini API cho moi truong may chu / Ham dam may Netlify */
  readonly GEMINI_API_KEY?: string;
  /** Khoa YouTube Data API v3 phia giao dien (du phong trong entertainmentService.ts khi may chu trung chuyen khong phan hoi) */
  readonly VITE_YOUTUBE_API_KEY?: string;
  /** Khoa YouTube Data API v3 cho may chu server/youtubeBackend.ts */
  readonly YOUTUBE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  gm_authFailure?: () => void;
}

