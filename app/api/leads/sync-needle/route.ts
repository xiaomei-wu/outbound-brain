/**
 * POST /api/leads/sync-needle
 *
 * Fetches leads from the active campaign's linked Needle campaign and upserts new ones.
 * Calls scheduleIcpChecks for newly created leads (Task 4).
 *
 * Response: { fetched: number; created: number; checksStarted: number }
 * Errors: plain German sentence, status 400/500.
 */

import { syncNeedleCampaign } from '@/lib/needle-sync';

import { after } from 'next/server';
import { scheduleIcpChecks } from '@/lib/icp/schedule';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export async function POST() {
  try {
    const { fetched, created, newLeadIds } = await syncNeedleCampaign();

    // Checks run after the response; at most 10 companies per fetch (upper bound: counts leads)
    if (newLeadIds.length > 0) after(() => scheduleIcpChecks(newLeadIds));
    const checksStarted = Math.min(newLeadIds.length, 10);

    return Response.json({ fetched, created, checksStarted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    if (msg === 'NO_CAMPAIGN_CHOSEN') {
      return err(
        'Bitte zuerst auf der Setup-Seite eine Needle-Kampagne wählen.'
      );
    }

    if (msg === 'NEEDLE_KEY_MISSING') {
      return err('Needle ist nicht verbunden.');
    }

    console.error('[sync-needle POST]', msg);
    return err('Needle-Leads konnten nicht synchronisiert werden. Bitte erneut versuchen.', 500);
  }
}
