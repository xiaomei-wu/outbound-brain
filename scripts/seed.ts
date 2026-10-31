#!/usr/bin/env node
/**
 * Outbound Brain — Seed Script
 *
 * Seeds in order:
 *   1. TEST demo data (real-estate ICP, idempotent — clears is_test=true rows first)
 *   2. Prepared companies (10 real German Projektentwickler, idempotent upsert by stable id)
 *
 * Run:  pnpm seed
 * Loads .env.local automatically — no dotenv package needed.
 * ONLY runs against local Supabase (SUPABASE_URL must be 127.0.0.1); never prod.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { seedDemo } from '../lib/seed-data';
import { seedPreparedCompanies, PREPARED_COMPANIES } from '../lib/seed-real-estate';

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
      val = val.replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local absent — assume env vars already in environment
  }
}

loadEnvFile();

// ---------------------------------------------------------------------------
// 2. Supabase client — local only guard
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!SUPABASE_URL.includes('127.0.0.1') && !SUPABASE_URL.includes('localhost')) {
  console.error(
    `SUPABASE_URL does not point to local Supabase: ${SUPABASE_URL}\n` +
      'Seed only runs against local DB. For prod use the Supabase dashboard.',
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// 3. Run
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('Outbound Brain — Seed');
  console.log('Supabase:', SUPABASE_URL);
  console.log('');

  // Step 1: TEST demo data (clears is_test=true rows, then inserts fresh)
  console.log('Seeding TEST demo data…');
  const result = await seedDemo(db);

  console.log('TEST seed complete. Total row counts:');
  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`  ${table.padEnd(20)} ${count}`);
  }
  console.log('');

  // Step 2: Prepared companies (10 real German Projektentwickler)
  console.log(`Seeding ${PREPARED_COMPANIES.length} prepared companies…`);
  const preparedCount = await seedPreparedCompanies(db);
  console.log(`  Upserted ${preparedCount} prepared leads`);
  console.log('');

  console.log(`Event id: ${result.eventId ?? 'null'}`);
  console.log('Done.');
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
