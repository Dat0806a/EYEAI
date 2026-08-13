import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log('Testing Supabase query on profiles...');
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').limit(5);
  console.log('Profiles table query result:', { profiles, error: pErr });

  const { data: fr, error: frErr } = await supabase.from('friend_requests').select('*').limit(5);
  console.log('Friend requests query result:', { fr, error: frErr });

  const { data: fs, error: fsErr } = await supabase.from('friendships').select('*').limit(5);
  console.log('Friendships query result:', { fs, error: fsErr });

  const { data: authData, error: authErr } = await supabase.auth.getSession();
  console.log('Current Session:', { session: authData.session, authErr });
}

testConnection();
