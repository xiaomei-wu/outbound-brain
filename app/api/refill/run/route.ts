/**
 * POST /api/refill/run — automatic refill (only while the Needle campaign sends nothing):
 * enrolls checked A/B candidates, or pulls the next AI Ark / BlitzAPI page (at most hourly)
 * and checks those leads after the response; the check run then enrolls the A/B ones.
 *
 * Response: { mode; enrolled; newLeads; message }
 */

import { after } from 'next/server';
import { scheduleIcpChecks } from '@/lib/icp/schedule';
import { autoRefill, refillState } from '@/lib/refill-run';

export async function POST() {
  try {
    const { enrolled, newLeadIds } = await autoRefill({ allowFind: true });
    if (newLeadIds.length > 0) after(() => scheduleIcpChecks(newLeadIds));
    const state = await refillState(false);
    const message =
      state.mode === 'approval'
        ? 'Kampagne versendet Nachrichten — Nachschub nur mit Freigabe.'
        : enrolled
          ? `${enrolled} Leads automatisch in die Needle-Kampagne aufgenommen.`
          : newLeadIds.length
            ? `${newLeadIds.length} neue Kandidaten gefunden — ICP-Check läuft, danach Aufnahme.`
            : 'Kein Nachschub nötig oder gerade keine neuen Kandidaten.';
    return Response.json({ mode: state.mode, enrolled, newLeads: newLeadIds.length, message });
  } catch (err) {
    console.error('[refill run]', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Nachschub fehlgeschlagen.' }, { status: 502 });
  }
}
