// FILE: services/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ ERROR: Supabase URL atau Anon Key belum diset di file .env');
  console.error('📝 Silakan buat file .env di root folder dengan content:');
  console.error('   VITE_SUPABASE_URL=your_supabase_url');
  console.error('   VITE_SUPABASE_ANON_KEY=your_anon_key');
  throw new Error('Supabase configuration missing. Please check .env file.');
}

export const supabase = createClient(
  supabaseUrl, 
  supabaseAnonKey
);