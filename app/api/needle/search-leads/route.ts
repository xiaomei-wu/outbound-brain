/**
 * POST /api/needle/search-leads[?mode=campaign] — buttons "Neue Leads über Needle" (app search terms)
 * and "Neue Leads über Needle-Kampagne" (search terms from the connected campaign's people): Needle searches LinkedIn,
 * new people are created in Needle and imported here; after the response their ICP check runs
 * and the A/B ones are enrolled in the campaign. The click is the approval.
 *
 * Response: { found; created; skipped; remainingToday; message }
 */

import { after } from 'next/server';
import { scheduleIcpChecks } from '@/lib/icp/schedule';
import { runNeedleSearch } from '@/lib/needle-search-run';

export async function POST(request: Request) {
  const mode = new URL(request.url).searchParams.get('mode') === 'campaign' ? 'campaign' : 'keywords';
  try {
    const r = await runNeedleSearch(mode);
    if (r.newLeadIds.length > 0) after(() => scheduleIcpChecks(r.newLeadIds));
    const where = `Kampagne „${r.campaignName ?? 'Needle'}“`;
    const message = r.created
      ? `${where}: ${r.created} neue Leads gefunden (Suchbegriff „${r.keyword}“) — ICP-Check läuft, danach kommen die A/B-Leads in die Kampagne.`
      : `${where}: keine neuen Leads in diesem Suchlauf (Suchbegriff „${r.keyword}“, ${r.found} Treffer schon bekannt) — der nächste Klick sucht weiter.`;
    return Response.json({ ...r, newLeadIds: undefined, message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Needle-Suche fehlgeschlagen.';
    console.error('[needle search-leads]', msg);
    return Response.json({ error: msg.startsWith('Bitte') || msg.startsWith('Kein') ? msg : 'Needle-Suche fehlgeschlagen.' }, { status: 400 });
  }
}
