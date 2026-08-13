import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('--- SUPABASE SMOKE TEST ---');
console.log('VITE_SUPABASE_URL present:', !!supabaseUrl);
console.log('VITE_SUPABASE_ANON_KEY present:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: Missing Supabase environment variables!');
  process.exit(1);
}

if (supabaseUrl.includes('/rest/v1')) {
  console.error('ERROR: Supabase URL contains /rest/v1! It must be the base project URL.');
  process.exit(1);
}

try {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('Supabase JS client instantiated successfully.');
  console.log('Base URL matches expected:', supabaseUrl === 'https://bcwwzdmqnquocjzkoxwl.supabase.co');
  console.log('SMOKE TEST PASSED.');
} catch (err) {
  console.error('ERROR instantiating Supabase client:', err);
  process.exit(1);
}
