import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://flpzjbasdsfwoeruyxgp.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.warn('VITE_SUPABASE_ANON_KEY is not set. Supabase calls will fail.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
