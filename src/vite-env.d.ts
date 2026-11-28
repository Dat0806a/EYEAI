/// <reference types="vite/client" />
/// <reference types="google.maps" />

/**
 * Khai bao kieu TypeScript cho bien moi truong cong khai (`VITE_*`) phia giao dien Vite.
 * Cac khoa bi mat cua may chu (`GEMINI_API_KEY`, `PATIENT_AGENT_GEMINI_API_KEY`, `YOUTUBE_API_KEY`)
 * KHONG bao gio duoc khai bao voi tien to `VITE_` hoac truy cap trong `src/`.
 */
interface ImportMetaEnv {
  /** Khoa API Google Maps JS cong khai (khoa theo HTTP Referrer trong LocationPage.tsx -> mapLoader.ts) */
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  /** Duong dan du an Supabase */
  readonly VITE_SUPABASE_URL: string;
  /** Khoa cong khai Anon cua Supabase */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Tuy chon bat tinh nang Patient Autonomous Agent */
  readonly VITE_ENABLE_PATIENT_AGENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  gm_authFailure?: () => void;
}

