#!/usr/bin/env node
/**
 * Outbound Brain — Demo Seed Script
 *
 * Upserts (idempotent) the demo dataset defined in lib/seed-data.ts:
 * 1 campaign, 9 trigger catalog entries, 5 demo leads with pre-computed
 * CallBriefing JSON, lead triggers, 1 test event, 1 decision.
 *
 * All companies / emails / URLs use .example.com — clearly fictitious sample data.
 *
 * Run:  pnpm seed
 * Loads .env.local automatically — no dotenv package needed.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { seedDemo } from '../lib/seed-data';

// ---------------------------------------------------------------------------
// 1. Load .env.local without dotenv
// ---------------------------------------------------------------------------
function loadEnvFile(filename = '.env.local'): void {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1);
      // Strip surrounding quotes if present
      val = val.replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local absent — assume env vars are already in the environment
  }
}

loadEnvFile();

// ---------------------------------------------------------------------------
// 2. Supabase client (direct — lib/db.ts not required here)
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// 3. Run
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('Outbound Brain — Demo Seed');
  console.log('Supabase:', SUPABASE_URL);
  console.log('');

  const result = await seedDemo(db);

  console.log('Seed complete. Row counts:');
  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`  ${table.padEnd(20)} ${count}`);
  }
  console.log(`  eventId: ${result.eventId ?? 'null'}`);
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
