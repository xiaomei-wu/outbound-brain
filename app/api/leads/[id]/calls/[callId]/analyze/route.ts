/**
 * POST /api/leads/[id]/calls/[callId]/analyze — catches up on a call whose Claude evaluation
 * failed (e.g. while the credit was used up). Same evaluation as right after the call.
 *
 * Response: { evaluation; demoReady; error }
 */

import { analyzeCall } from '@/lib/call-analysis';
import { getDb } from '@/lib/db';
import { toCampaign, type CampaignRow } from '@/lib/mappers';
import type { CallOutcome } from '@/lib/types';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; callId: string }> }) {
  const { id, callId } = await params;
  const db = getDb();
  const [{ data: leadRow }, { data: log }, { data: campaignRow }] = await Promise.all([
    db.from('lead').select('*').eq('id', id).single(),
    db.from('call_log').select('id, outcome, notes, transcript, lead_id').eq('id', callId).single(),
    db.from('campaign').select('*').eq('is_active', true).limit(1).single(),
  ]);
  const call = log as { id: string; outcome: CallOutcome; notes: string | null; transcript: string | null; lead_id: string } | null;
  if (!leadRow || !call || call.lead_id !== id) {
    return Response.json({ error: 'Gespräch nicht gefunden.' }, { status: 404 });
  }

  const result = await analyzeCall({
    leadId: id,
    callLogId: call.id,
    outcome: call.outcome,
    notes: call.notes,
    transcript: call.transcript,
    leadRow: leadRow as Record<string, unknown>,
    campaign: campaignRow ? toCampaign(campaignRow as CampaignRow) : null,
  });
  if (!result.evaluation) {
    return Response.json({ error: 'Analyse fehlgeschlagen — bitte später erneut versuchen.', detail: result.error }, { status: 502 });
  }
  return Response.json({ evaluation: result.evaluation, demoReady: result.demoReady, error: null });
}
