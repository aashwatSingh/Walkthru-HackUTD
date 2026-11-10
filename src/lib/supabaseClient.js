import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// No keys → null → the whole app runs on the seeded mock database (src/lib/mockDb.js).
export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
export const isMock = !supabase;

// A production build with no (or only half of) the Supabase settings must not quietly become the sample-data
// demo: students would do real inspections that are saved nowhere. Demo deployments say so with VITE_DEMO_MODE=true.
// `npm run dev` is unaffected.
export const misconfigured = import.meta.env.PROD && isMock && import.meta.env.VITE_DEMO_MODE !== 'true';
