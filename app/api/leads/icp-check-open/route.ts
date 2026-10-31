/**
 * POST /api/leads/icp-check-open
 * Schedules ICP checks for all unchecked, non-test leads (cap 10).
 * Uses after() to run the checks after the response is sent.
 */

import { after, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { selectCompaniesToCheck } from '@/lib/icp/routing';
import { scheduleIcpChecks } from '@/lib/icp/schedule';

export async function POST() {
  const db = getDb();

  // Load all non-test leads without an ICP check
  const { data: leadRows } = await db
    .from('lead')
    .select('id, company_key')
    .eq('is_test', false)
    .not('company_key', 'is', null);

  if (!leadRows || leadRows.length === 0) {
    return NextResponse.json({ scheduled: 0 });
  }

  // Find which companies already have a check
  const allKeys = leadRows
    .map((r: { company_key: string | null }) => r.company_key)
    .filter((k): k is string => k !== null);

  const uniqueKeys = [...new Set(allKeys)];

  const { data: existingChecks } = await db
    .from('company_check')
    .select('company_key')
    .in('company_key', uniqueKeys.length > 0 ? uniqueKeys : ['__none__']);

  const alreadyChecked = new Set(
    (existingChecks ?? []).map((r: { company_key: string }) => r.company_key),
  );

  // Select companies to check (cap 10)
  const leadsForSelection = leadRows.map(
    (r: { id: string; company_key: string | null }) => ({
      id: r.id,
      companyKey: r.company_key,
    }),
  );

  const toCheck = selectCompaniesToCheck(leadsForSelection, alreadyChecked, 10);

  if (toCheck.length === 0) {
    return NextResponse.json({ scheduled: 0 });
  }

  // Collect lead IDs for the companies to check
  const leadIdsToCheck = leadRows
    .filter((r: { company_key: string | null }) =>
      r.company_key !== null && toCheck.includes(r.company_key),
    )
    .map((r: { id: string }) => r.id);

  // Schedule checks in background via after()
  after(async () => {
    try {
      await scheduleIcpChecks(leadIdsToCheck);
    } catch (err) {
      console.error('Background ICP checks failed:', err);
    }
  });

  return NextResponse.json({ scheduled: toCheck.length });
}
