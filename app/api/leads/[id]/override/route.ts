/**
 * POST /api/leads/[id]/override
 *
 * Seller override of the system-recommended action.
 * Body: { callLogId: string; action: NextAction; reason?: string }
 * Returns: { callLog: CallLog }
 *
 * Rules (REVISION_V2.md §7):
 * - Stores seller_action / seller_reason on the call_log row.
 * - Never changes demo_ready or BANT status — qualification is separate.
 * - No "system wrong" training label.
 *
 * Next.js 16: params is a Promise.
 */

import { getDb } from '@/lib/db';
import { toCallLog, type CallLogRow } from '@/lib/mappers';
import type { NextAction } from '@/lib/types';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

const VALID_ACTIONS: NextAction[] = [
  'call_now', 'reply', 'research', 'follow_up', 'wait', 'stop',
  'demo_handoff', 'identify_contact',
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;

    const body = (await request.json()) as {
      callLogId?: string;
      action?: string;
      reason?: string;
    };

    const { callLogId, action, reason } = body;

    if (!callLogId) {
      return err('callLogId fehlt. Bitte Gesprächsprotokoll angeben.');
    }
    if (!action || !VALID_ACTIONS.includes(action as NextAction)) {
      return err(`Ungültige Aktion: ${action ?? '(leer)'}. Gültig: ${VALID_ACTIONS.join(', ')}.`);
    }

    const db = getDb();

    // Verify the call_log belongs to this lead
    const { data: existing, error: fetchErr } = await db
      .from('call_log')
      .select('*')
      .eq('id', callLogId)
      .eq('lead_id', leadId)
      .single();

    if (fetchErr || !existing) {
      return err('Gesprächsprotokoll nicht gefunden. Bitte ID prüfen.', 404);
    }

    // Write seller override — qualification fields (demo_ready, analysis) untouched
    const { data: updated, error: updateErr } = await db
      .from('call_log')
      .update({
        seller_action: action,
        seller_reason: reason ?? null,
      })
      .eq('id', callLogId)
      .select('*')
      .single();

    if (updateErr || !updated) {
      console.error('[override POST]', updateErr);
      return err('Überschreibung konnte nicht gespeichert werden. Bitte erneut versuchen.', 500);
    }

    return Response.json({ callLog: toCallLog(updated as CallLogRow) });
  } catch (e) {
    console.error('[override POST]', e);
    return err('Überschreibung konnte nicht verarbeitet werden. Bitte erneut versuchen.', 500);
  }
}
