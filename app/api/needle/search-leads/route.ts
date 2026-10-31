/**
 * POST /api/needle/search-leads — button "Neue Leads über Needle": Needle searches LinkedIn,
 * new people are created in Needle and imported here; after the response their ICP check runs
 * and the A/B ones are enrolled in the campaign. The click is the approval.
 *
 * Response: { found; created; skipped; remainingToday; message }
 */

import { after } from 'next/server';
import { scheduleIcpChecks } from '@/lib/icp/schedule';
import { runNeedleSearch } from '@/lib/needle-search-run';

export async function POST() {
  try {
    const r = await runNeedleSearch();
    if (r.newLeadIds.length > 0) after(() => scheduleIcpChecks(r.newLeadIds));
    const message = r.created
      ? `Needle hat ${r.created} neue Leads gefunden („${r.keyword}“) — ICP-Check läuft, danach kommen die A/B-Leads in die Kampagne.`
      : `Keine neuen Leads in diesem Suchlauf („${r.keyword}“) — nächster Klick sucht weiter.`;
    return Response.json({ ...r, newLeadIds: undefined, message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Needle-Suche fehlgeschlagen.';
    console.error('[needle search-leads]', msg);
    return Response.json({ error: msg.startsWith('Bitte') || msg.startsWith('Kein') ? msg : 'Needle-Suche fehlgeschlagen.' }, { status: 400 });
  }
}
