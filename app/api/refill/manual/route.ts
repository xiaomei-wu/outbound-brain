/**
 * POST /api/refill/manual — toolbar button "Leads an Needle senden": enrolls the current
 * checked A/B candidates (LinkedIn profile, not in Needle yet) regardless of the queue
 * threshold. The click is the approval, also when the campaign sends messages.
 *
 * Response: { enrolled; skipped; message }
 */

import { enrollLeads, refillState } from '@/lib/refill-run';

export async function POST() {
  try {
    const state = await refillState(true);
    if (!state.campaignId) {
      return Response.json({ error: 'Bitte zuerst auf der Setup-Seite eine Needle-Kampagne wählen.' }, { status: 400 });
    }
    if (state.candidates.length === 0) {
      return Response.json({
        enrolled: 0,
        skipped: 0,
        message: 'Keine geprüften A/B-Kandidaten außerhalb von Needle — zuerst „Leads finden“ und ICP-Checks.',
      });
    }
    return Response.json(await enrollLeads(state.candidates.map((c) => c.id)));
  } catch (err) {
    console.error('[refill manual]', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Aufnahme in die Needle-Kampagne fehlgeschlagen.' }, { status: 502 });
  }
}
