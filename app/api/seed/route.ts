/**
 * POST /api/seed  — resets demo TEST data to canonical state.
 *
 * Only touches rows with is_test = true (leads, their child rows, company_check).
 * Prepared companies (origin='prepared', is_test=false) and real leads are never deleted.
 *
 * Uses seedDemo() from lib/seed-data.ts — single source of truth shared with pnpm seed.
 */

import { getDb } from '@/lib/db';
import { seedDemo } from '@/lib/seed-data';

function err(msg: string, status = 500) {
  return Response.json({ error: msg }, { status });
}

export async function POST() {
  try {
    const result = await seedDemo(getDb());
    return Response.json({ seeded: true, eventId: result.eventId });
  } catch (e) {
    console.error('[seed POST]', e);
    return err(
      'Demo-Daten konnten nicht zurückgesetzt werden. Bitte Xiaomei auf Slack kontaktieren.'
    );
  }
}
