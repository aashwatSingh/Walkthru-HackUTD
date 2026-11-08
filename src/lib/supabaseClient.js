import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// No keys → null → the whole app runs on the seeded mock database (src/lib/mockDb.js).
export const supabase = url && key ? createClient(url, key) : null;
export const isMock = !supabase;
