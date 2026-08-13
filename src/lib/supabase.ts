import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Missing required environment variables (VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY).');
} else {
  console.log('Supabase environment configured.');
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);
