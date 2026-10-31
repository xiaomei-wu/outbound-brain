/**
 * Claude evaluation of a logged call (demo-ready, BANT, trigger feedback, lead corrections).
 * Used right after the outcome is saved and to catch up on calls whose evaluation failed
 * (e.g. while Claude's credit was used up). Failure never loses the call; it is reported.
 */

import { evaluateCall } from '@/lib/claude/evaluation';
import { getDb } from '@/lib/db';
import { toBantClaim, toLeadTrigger, type BantClaimRow, type LeadTriggerRow } from '@/lib/mappers';
import type { Campaign, CallBriefing, CallEvaluation, CallOutcome, NextAction } from '@/lib/types';

export interface AnalyzeCallInput {
  leadId: string;
  callLogId: string;
  outcome: CallOutcome;
  notes: string | null;
  transcript: string | null;
  leadRow: Record<string, unknown>;
  campaign: Campaign | null;
}

export interface AnalyzeCallResult {
  evaluation: CallEvaluation | null;
  demoReady: boolean;
  recommendedAction: NextAction | null;
  /** Set when Claude could not evaluate; the call itself is saved. */
  error: string | null;
}

export async function analyzeCall(input: AnalyzeCallInput): Promise<AnalyzeCallResult> {
  const db = getDb();
  const { leadRow, campaign } = input;
  let error: string | null = campaign ? null : 'Keine aktive Kampagne.';

  // Read active triggers for feedback
  const { data: triggerRows } = await db
    .from('lead_trigger')
    .select('*')
    .eq('lead_id', input.leadId)
    .eq('is_active', true);

  const activeTriggers = (triggerRows ?? []).map((r) =>
    toLeadTrigger(r as LeadTriggerRow),
  );

  // Read existing BANT claims
  const { data: bantRows } = await db
    .from('bant_claim')
    .select('*')
    .eq('lead_id', input.leadId);

  const existingBant = (bantRows ?? []).map((r) =>
    toBantClaim(r as BantClaimRow),
  );

  // 2. Evaluate call via Claude
  let evaluation: CallEvaluation | null = null;

  const brief: CallBriefing = (leadRow.cached_brief as CallBriefing) ?? {
    headline: `Call with ${leadRow.name as string}`,
    context: '',
    whyNow: '',
    evidenceUrl: null,
    evidenceNote: '',
    hook: '',
    facts: [],
    hypotheses: [],
    openQuestions: [],
    bant: [],
    talkingPoints: [],
    objections: [],
    phone: leadRow.phone as string | null,
    consentLine: '',
    meetingSlots: [],
    contact: leadRow.name as string,
    goal: '',
    assumptions: [],
  };

  if (campaign) {
    try {
      const evalResult = await evaluateCall(
        brief,
        input.outcome,
        input.notes ?? null,
        input.transcript ?? null,
        activeTriggers,
        existingBant,
        campaign,
      );
      evaluation = evalResult.evaluation;
    } catch (evalErr) {
      console.error('Evaluation failed:', evalErr);
      error = evalErr instanceof Error ? evalErr.message : String(evalErr);
    }
  }

  // 3. Update call_log with analysis
  const demoReady = evaluation?.demoReady ?? false;
  const recommendedAction = evaluation?.recommendedAction ?? null;

  await db
    .from('call_log')
    .update({
      analysis: evaluation,
      demo_ready: demoReady,
      recommended_action: recommendedAction,
    })
    .eq('id', input.callLogId);

  // 4. Insert bant_claim rows from evaluation
  if (evaluation?.bantUpdates) {
    for (const update of evaluation.bantUpdates) {
      await db.from('bant_claim').insert({
        lead_id: input.leadId,
        dimension: update.dimension,
        status: update.status,
        value: update.value,
        evidence: update.evidence,
        source: 'call',
        call_log_id: input.callLogId,
      });
    }
  }

  // 5. Update lead_trigger feedback (never degrade on not_tested)
  if (evaluation?.triggerFeedback) {
    for (const fb of evaluation.triggerFeedback) {
      if (fb.result === 'not_tested') continue;
      await db
        .from('lead_trigger')
        .update({
          feedback: fb.result,
          feedback_evidence: fb.evidence,
        })
        .eq('id', fb.leadTriggerId);
    }
  }

  // 6. Apply evidenced lead corrections
  if (evaluation?.leadCorrections) {
    const leadUpdates: Record<string, string> = {};
    for (const correction of evaluation.leadCorrections) {
      if (correction.field === 'role') {
        leadUpdates.role = correction.value;
      }
    }
    if (Object.keys(leadUpdates).length > 0) {
      await db.from('lead').update(leadUpdates).eq('id', input.leadId);
    }
  }

  return { evaluation, demoReady, recommendedAction, error };
}
