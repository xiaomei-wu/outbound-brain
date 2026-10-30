import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/** Server-side Supabase client using the service role key. Never expose to the browser. */
export function getDb() {
  return createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
}
