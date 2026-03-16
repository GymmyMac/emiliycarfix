import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://flpzjbasdsfwoeruyxgp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_s701-seEtrM9TFIUaq9G9g_14GiigAU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
