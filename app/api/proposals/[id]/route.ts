/**
 * POST /api/proposals/[id]
 * Body: { decision: 'approved' | 'rejected' }
 * Returns: { proposal: CampaignProposal }
 *
 * Approved → applies the change to trigger_catalog (tier update from newRule).
 * Rejected → marks as rejected, no catalog change.
 *
 * Next.js 16: params is a Promise.
 */

import { getDb } from '@/lib/db';
import { toCampaignProposal, type CampaignProposalRow } from '@/lib/mappers';
import type { ProposalStatus, TriggerTier } from '@/lib/types';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

/** Parse the new tier from a newRule string like "Tier 3, 30 Tage Fenster …" */
function parseTierFromRule(newRule: string): TriggerTier | null {
  const match = newRule.match(/Tier\s+([123])/i);
  if (!match) return null;
  return parseInt(match[1], 10) as TriggerTier;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: proposalId } = await params;

    const body = (await request.json()) as { decision?: string };
    const { decision } = body;

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return err('decision muss "approved" oder "rejected" sein.');
    }

    const db = getDb();

    // Load proposal
    const { data: proposalRow, error: fetchErr } = await db
      .from('campaign_proposal')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchErr || !proposalRow) {
      return err('Vorschlag nicht gefunden. Bitte ID prüfen.', 404);
    }

    const proposal = toCampaignProposal(proposalRow as CampaignProposalRow);

    if (proposal.status !== 'proposed') {
      return err(
        `Vorschlag wurde bereits ${proposal.status === 'approved' ? 'genehmigt' : 'abgelehnt'} und kann nicht erneut bearbeitet werden.`,
        409
      );
    }

    const decidedAt = new Date().toISOString();

    // Apply change to trigger_catalog when approved
    if (decision === 'approved' && proposal.triggerTypeId) {
      const newTier = parseTierFromRule(proposal.newRule);

      if (newTier !== null) {
        const { error: catalogErr } = await db
          .from('trigger_catalog')
          .update({ tier: newTier })
          .eq('id', proposal.triggerTypeId);

        if (catalogErr) {
          console.error('[proposals/[id] POST] catalog update failed', catalogErr);
          return err(
            'Trigger-Katalog konnte nicht aktualisiert werden. Bitte erneut versuchen.',
            500
          );
        }
      }
    }

    // Update proposal status
    const { data: updated, error: updateErr } = await db
      .from('campaign_proposal')
      .update({
        status: decision as ProposalStatus,
        decided_at: decidedAt,
      })
      .eq('id', proposalId)
      .select('*')
      .single();

    if (updateErr || !updated) {
      console.error('[proposals/[id] POST] status update failed', updateErr);
      return err('Status konnte nicht gespeichert werden. Bitte erneut versuchen.', 500);
    }

    return Response.json({ proposal: toCampaignProposal(updated as CampaignProposalRow) });
  } catch (e) {
    console.error('[proposals/[id] POST]', e);
    return err('Vorschlag konnte nicht verarbeitet werden. Bitte erneut versuchen.', 500);
  }
}
