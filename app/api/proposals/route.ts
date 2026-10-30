/**
 * GET  /api/proposals  — list all campaign proposals
 * POST /api/proposals  — compute proposals from trigger feedback, upsert, return all
 *
 * Proposal logic (REVISION_V2.md §8):
 * - Groups lead_trigger rows by trigger_type_id where feedback is confirmed/contradicted.
 * - Only generates a proposal when assessedCount >= campaign.minSampleSize.
 * - Shows assessed count / denominator, evidence snippets, uncertainty, old and new rule.
 * - Approved proposals must be applied by the /proposals/[id] route.
 * - Individual cases (not_tested) are excluded from the count.
 * - Returns a German message when there are too few comparable cases.
 */

import { createHash } from 'crypto';
import { getDb } from '@/lib/db';
import { toCampaignProposal, type CampaignProposalRow, type CampaignRow } from '@/lib/mappers';
import type { CampaignProposal, TriggerTier } from '@/lib/types';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

// Stable deterministic UUID from two input strings (no crypto dependency)
/** Stable UUID per (campaign, trigger type), so recomputing never duplicates a proposal. */
function deterministicId(a: string, b: string): string {
  const h = createHash('sha1').update(`${a}:${b}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// GET — list proposals
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('campaign_proposal')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[proposals GET]', error);
      return err('Vorschläge konnten nicht geladen werden. Bitte Seite neu laden.');
    }

    const proposals = (data ?? []).map((r) => toCampaignProposal(r as CampaignProposalRow));
    return Response.json({ proposals });
  } catch (e) {
    console.error('[proposals GET]', e);
    return err('Vorschläge konnten nicht geladen werden. Bitte Seite neu laden.', 500);
  }
}

// ---------------------------------------------------------------------------
// POST — compute proposals from current trigger feedback
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const db = getDb();

    // Load active campaign
    const { data: campaignRow } = await db
      .from('campaign')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!campaignRow) {
      return Response.json({
        proposals: [],
        message: 'Keine aktive Kampagne gefunden. Bitte zuerst eine Kampagne anlegen.',
      });
    }

    const campaign = campaignRow as CampaignRow;
    const minSampleSize: number = campaign.min_sample_size ?? 3;

    // Load approved trigger catalog entries for this campaign
    const { data: catalogRows } = await db
      .from('trigger_catalog')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('approved', true);

    if (!catalogRows || catalogRows.length === 0) {
      return Response.json({
        proposals: [],
        message: 'Keine genehmigten Trigger-Typen gefunden.',
      });
    }

    const catalogIds = catalogRows.map((r) => r.id as string);

    // Load all lead_trigger rows for these catalog entries that have any feedback
    const { data: allFeedbackRows } = await db
      .from('lead_trigger')
      .select('*')
      .in('trigger_type_id', catalogIds)
      .not('feedback', 'is', null);

    if (!allFeedbackRows || allFeedbackRows.length === 0) {
      return Response.json({
        proposals: [],
        message: 'Noch keine Gesprächs-Feedback-Daten vorhanden.',
      });
    }

    // Group by trigger_type_id
    type FeedbackRow = {
      id: string;
      trigger_type_id: string;
      type: string;
      feedback: string;
      feedback_evidence: string | null;
      lead_id: string;
    };

    const grouped = new Map<string, FeedbackRow[]>();
    for (const row of allFeedbackRows as FeedbackRow[]) {
      const typeId = row.trigger_type_id;
      if (!grouped.has(typeId)) grouped.set(typeId, []);
      grouped.get(typeId)!.push(row);
    }

    const newProposals: CampaignProposal[] = [];
    let tooFewMessage = '';

    for (const [typeId, rows] of grouped.entries()) {
      const catalogEntry = catalogRows.find((e) => e.id === typeId);
      if (!catalogEntry) continue;

      // Only confirmed/contradicted count as comparable cases
      const assessed = rows.filter(
        (r) => r.feedback === 'confirmed' || r.feedback === 'contradicted'
      );
      const denominator = rows.length; // all with any feedback (incl. not_tested)
      const assessedCount = assessed.length;

      if (assessedCount < minSampleSize) {
        tooFewMessage = `Noch zu wenige vergleichbare Fälle (${assessedCount} von ${minSampleSize}).`;
        continue;
      }

      const contradicted = assessed.filter((r) => r.feedback === 'contradicted').length;
      const confirmed = assessed.filter((r) => r.feedback === 'confirmed').length;

      // Only propose if contradicted rate warrants a change
      if (contradicted <= confirmed) continue;

      const contradictedRate = Math.round((contradicted / assessedCount) * 100);

      // Evidence snippets from contradicted cases
      const evidence = assessed
        .filter((r) => r.feedback === 'contradicted' && r.feedback_evidence)
        .slice(0, 3)
        .map((r) => r.feedback_evidence as string);

      const currentTier = catalogEntry.tier as number;
      const newTier = Math.min(3, currentTier + 1) as TriggerTier;

      const oldRule = `Tier ${currentTier}, ${catalogEntry.window_days} Tage Fenster`;
      const newRule = `Tier ${newTier}, ${catalogEntry.window_days} Tage Fenster – Bedarf als Hypothese kennzeichnen`;

      const uncertainty =
        assessedCount < 6
          ? `Kleine Stichprobe (${assessedCount} Fälle) – weitere Beobachtungen empfohlen.`
          : `Basierend auf ${assessedCount} vergleichbaren Fällen.`;

      const proposalId = deterministicId(campaign.id, typeId);

      // Check if a proposal for this type already exists (any status)
      const { data: existing } = await db
        .from('campaign_proposal')
        .select('id, status')
        .eq('id', proposalId)
        .single();

      // Don't overwrite approved/rejected proposals
      if (existing && (existing.status === 'approved' || existing.status === 'rejected')) {
        // Still include in the response
        const { data: existingFull } = await db
          .from('campaign_proposal')
          .select('*')
          .eq('id', proposalId)
          .single();
        if (existingFull) {
          newProposals.push(toCampaignProposal(existingFull as CampaignProposalRow));
        }
        continue;
      }

      const proposalRow = {
        id: proposalId,
        campaign_id: campaign.id,
        trigger_type_id: typeId,
        title: `Trigger „${catalogEntry.name as string}" überarbeiten`,
        rationale: `${contradicted} von ${assessedCount} vergleichbaren Fällen widersprochen (${contradictedRate} %) – Kaufhypothese weniger zuverlässig als angenommen.`,
        old_rule: oldRule,
        new_rule: newRule,
        assessed_count: assessedCount,
        denominator,
        evidence,
        uncertainty,
        status: 'proposed',
        created_at: new Date().toISOString(),
        decided_at: null,
      };

      const { error: upsertErr } = await db
        .from('campaign_proposal')
        .upsert(proposalRow, { onConflict: 'id' });

      if (upsertErr) {
        console.error('[proposals POST] upsert error', upsertErr);
        continue;
      }

      newProposals.push(toCampaignProposal(proposalRow as CampaignProposalRow));
    }

    // Also load any previously existing proposals for this campaign
    const { data: allProposalRows } = await db
      .from('campaign_proposal')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false });

    const allProposals = (allProposalRows ?? []).map((r) =>
      toCampaignProposal(r as CampaignProposalRow)
    );

    const message =
      newProposals.length > 0
        ? `${newProposals.length} neuer Vorschlag berechnet.`
        : tooFewMessage || 'Keine neuen Vorschläge – Daten noch nicht ausreichend.';

    return Response.json({ proposals: allProposals, message });
  } catch (e) {
    console.error('[proposals POST]', e);
    return err('Vorschläge konnten nicht berechnet werden. Bitte erneut versuchen.', 500);
  }
}
