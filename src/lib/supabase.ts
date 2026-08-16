import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fallback to valid placeholder URL & key to prevent module load crash on Netlify when env vars are missing
const supabaseUrl = rawUrl && rawUrl.trim() !== '' ? rawUrl : 'https://placeholder-eyetalk.supabase.co';
const supabaseAnonKey = rawKey && rawKey.trim() !== '' ? rawKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

if (!rawUrl || !rawKey) {
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in environment variables. Using fallback client.');
} else {
  console.log('[Supabase] Environment configured successfully.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
