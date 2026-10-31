/**
 * POST /api/leads/find
 *
 * Unified "Leads finden" endpoint: runs every connected lead source in order
 *   1. Needle campaign  (syncNeedleCampaign; LinkedIn replies via syncNeedleReplies after the response)
 *   2. BlitzAPI         (findBlitzLeads)
 *   3. AI Ark           (importAiArkLeads)
 *
 * Each source is wrapped in try/catch — a missing or failing source never
 * fails the whole call. HTTP 200 if at least one source succeeded;
 * HTTP 400 only when none is connected.
 *
 * Response: { results: FindResult[]; totalCreated: number; message: string }
 * Error:    { error: string; results: FindResult[] }  (status 400)
 *
 * Vercel maxDuration: 300 s (see vercel.json).
 */

import { after } from 'next/server';
import { getCredentials } from '@/lib/connectors';
import { syncNeedleCampaign } from '@/lib/needle-sync';
import { syncNeedleReplies } from '@/lib/needle-replies';
import { findBlitzLeads, importAiArkLeads } from '@/lib/lead-sources';
import { scheduleIcpChecks } from '@/lib/icp/schedule';
import { summarizeFind, type FindResult } from '@/lib/lead-find';

export async function POST() {
  const results: FindResult[] = [];
  const allNewLeadIds: string[] = [];

  // ------------------------------------------------------------------
  // 1. Needle campaign
  // ------------------------------------------------------------------
  const needleCreds = await getCredentials('needle');
  if (!needleCreds?.apiKey) {
    results.push({
      source: 'needle_campaign',
      ok: false,
      created: 0,
      message: 'Needle: nicht verbunden',
    });
  } else {
    try {
      const { created, newLeadIds } = await syncNeedleCampaign();
      allNewLeadIds.push(...newLeadIds);
      results.push({
        source: 'needle_campaign',
        ok: true,
        created,
        message: `Needle: ${created} neu`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const human =
        msg === 'NO_CAMPAIGN_CHOSEN'
          ? 'keine Kampagne gewählt'
          : 'Fehler';
      results.push({
        source: 'needle_campaign',
        ok: false,
        created: 0,
        message: `Needle: ${human}`,
      });
    }
    // New LinkedIn replies are evaluated in the background (Claude per conversation)
    after(() =>
      syncNeedleReplies().catch((e: unknown) =>
        console.error('[find] reply sync failed', e instanceof Error ? e.message : e),
      ),
    );
  }

  // ------------------------------------------------------------------
  // 2. BlitzAPI
  // ------------------------------------------------------------------
  const blitzCreds = await getCredentials('blitz');
  if (!blitzCreds?.apiKey) {
    results.push({
      source: 'blitz',
      ok: false,
      created: 0,
      message: 'BlitzAPI: nicht verbunden',
    });
  } else {
    try {
      const { created, newLeadIds } = await findBlitzLeads(blitzCreds.apiKey);
      allNewLeadIds.push(...newLeadIds);
      results.push({
        source: 'blitz',
        ok: true,
        created,
        message: `BlitzAPI: ${created} neu`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fehler';
      results.push({
        source: 'blitz',
        ok: false,
        created: 0,
        message: `BlitzAPI: ${msg.slice(0, 80)}`,
      });
    }
  }

  // ------------------------------------------------------------------
  // 3. AI Ark
  // ------------------------------------------------------------------
  const aiArkCreds = await getCredentials('ai_ark');
  if (!aiArkCreds?.apiKey) {
    results.push({
      source: 'ai_ark',
      ok: false,
      created: 0,
      message: 'AI Ark: nicht verbunden',
    });
  } else {
    try {
      const { imported, newLeadIds } = await importAiArkLeads(aiArkCreds.apiKey);
      allNewLeadIds.push(...newLeadIds);
      results.push({
        source: 'ai_ark',
        ok: true,
        created: imported,
        message: `AI Ark: ${imported} neu`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fehler';
      results.push({
        source: 'ai_ark',
        ok: false,
        created: 0,
        message: `AI Ark: ${msg.slice(0, 80)}`,
      });
    }
  }

  // ------------------------------------------------------------------
  // Schedule ICP checks for all new leads (after response is sent)
  // ------------------------------------------------------------------
  if (allNewLeadIds.length > 0) {
    after(() => scheduleIcpChecks(allNewLeadIds));
  }

  const { ok, message } = summarizeFind(results);
  const totalCreated = results.reduce((acc, r) => acc + r.created, 0);

  if (!ok) {
    return Response.json(
      {
        error:
          'Keine Lead-Quelle verbunden — bitte Needle (empfohlen) oder BlitzAPI auf der Integrations-Seite verbinden.',
        results,
      },
      { status: 400 }
    );
  }

  return Response.json({ results, totalCreated, message });
}
