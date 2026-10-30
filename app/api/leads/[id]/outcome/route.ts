// POST /api/leads/[id]/outcome (v2)
// Body: { outcome: CallOutcome; notes?: string; transcript?: string }
// 1. Insert call_log (outcome, demo_ready, recommended_action, analysis)
// 2. Evaluate call via Claude
// 3. Insert bant_claim rows (source 'call', call_log_id)
// 4. Update lead_trigger feedback/feedback_evidence (never degrade on not_tested)
// 5. Apply evidenced lead corrections
// 6. Opt-out -> stop + exclusion
// 7. Decision row with recommendedAction, NO fit penalty
// 8. refreshLeadPriority
// 9. Slack notice (secondary, non-fatal)
// Response: { callLog, evaluation, priority }

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { evaluateCall } from '@/lib/claude/evaluation';
import { refreshLeadPriority } from '@/lib/priority';
import { postSlackBriefing } from '@/lib/slack';
import {
  toCampaign,
  toLeadTrigger,
  toBantClaim,
} from '@/lib/mappers';
import type {
  CampaignRow,
  LeadTriggerRow,
  BantClaimRow,
} from '@/lib/mappers';
import type {
  CallBriefing,
  CallEvaluation,
  CallLog,
  CallOutcome,
  NextAction,
  PriorityResult,
} from '@/lib/types';


interface OutcomeBody {
  outcome: CallOutcome;
  notes?: string;
  transcript?: string;
}

const VALID_OUTCOMES = new Set<string>([
  'booked',
  'not_booked',
  'not_now',
  'opt_out',
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  try {
    const body = (await request.json()) as OutcomeBody;

    if (!body.outcome || !VALID_OUTCOMES.has(body.outcome)) {
      return NextResponse.json(
        {
          error:
            'Ungueltiges Ergebnis. Bitte waehlen Sie: gebucht, nicht gebucht, nicht jetzt oder Opt-out.',
        },
        { status: 400 },
      );
    }

    // Read lead
    const { data: leadRow, error: leadErr } = await db
      .from('lead')
      .select('*')
      .eq('id', id)
      .single();

    if (leadErr || !leadRow) {
      return NextResponse.json(
        { error: 'Lead nicht gefunden. Pruefen Sie die ID.' },
        { status: 404 },
      );
    }

    // Read active campaign
    const { data: campaignRow } = await db
      .from('campaign')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    const campaign = campaignRow
      ? toCampaign(campaignRow as CampaignRow)
      : null;

    // 1. Insert call_log (without analysis first)
    const { data: callLogRow, error: logErr } = await db
      .from('call_log')
      .insert({
        lead_id: id,
        outcome: body.outcome,
        notes: body.notes ?? null,
        transcript: body.transcript ?? null,
        analysis: null,
        demo_ready: false,
        recommended_action: null,
      })
      .select()
      .single();

    if (logErr || !callLogRow) {
      return NextResponse.json(
        {
          error:
            'Das Gespraechsergebnis konnte nicht gespeichert werden. Bitte erneut versuchen.',
        },
        { status: 500 },
      );
    }

    // Read active triggers for feedback
    const { data: triggerRows } = await db
      .from('lead_trigger')
      .select('*')
      .eq('lead_id', id)
      .eq('is_active', true);

    const activeTriggers = (triggerRows ?? []).map((r) =>
      toLeadTrigger(r as LeadTriggerRow),
    );

    // Read existing BANT claims
    const { data: bantRows } = await db
      .from('bant_claim')
      .select('*')
      .eq('lead_id', id);

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
          body.outcome,
          body.notes ?? null,
          body.transcript ?? null,
          activeTriggers,
          existingBant,
          campaign,
        );
        evaluation = evalResult.evaluation;
      } catch (evalErr) {
        console.error('Evaluation failed:', evalErr);
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
      .eq('id', callLogRow.id);

    // 4. Insert bant_claim rows from evaluation
    if (evaluation?.bantUpdates) {
      for (const update of evaluation.bantUpdates) {
        await db.from('bant_claim').insert({
          lead_id: id,
          dimension: update.dimension,
          status: update.status,
          value: update.value,
          evidence: update.evidence,
          source: 'call',
          call_log_id: callLogRow.id,
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
        await db.from('lead').update(leadUpdates).eq('id', id);
      }
    }

    // 7. Handle opt-out and status
    let newStatus: string;
    if (body.outcome === 'opt_out') {
      newStatus = 'stopped';
      // Add to campaign exclusions
      if (campaign && leadRow.email) {
        const newExclusions = [
          ...(campaign.exclusions || []),
          leadRow.email as string,
        ];
        await db
          .from('campaign')
          .update({ exclusions: newExclusions })
          .eq('id', campaign.id);
      }
      // Cancel unsent cadence steps
      await db
        .from('cadence_step')
        .update({ status: 'cancelled' })
        .eq('lead_id', id)
        .in('status', ['draft', 'approved']);
    } else if (body.outcome === 'not_now') {
      newStatus = 'paused';
      await db
        .from('cadence_step')
        .update({ status: 'cancelled' })
        .eq('lead_id', id)
        .in('status', ['draft', 'approved']);
    } else {
      newStatus = 'called';
    }

    await db.from('lead').update({ status: newStatus }).eq('id', id);

    // 8. Write decision (NO fit penalty)
    const action: NextAction =
      recommendedAction ??
      (body.outcome === 'opt_out' ? 'stop' : 'follow_up');
    const reason =
      evaluation?.recommendationReason ??
      `Ergebnis: ${body.outcome}`;

    await db.from('decision').insert({
      lead_id: id,
      action,
      reason,
      fit_score: leadRow.fit_score as number,
      interest_score: leadRow.interest_score as number,
      decided_by: 'call_outcome',
    });

    // 9. Refresh priority
    let priority: PriorityResult | null = null;
    try {
      priority = await refreshLeadPriority(id);
    } catch (prioErr) {
      console.error('Priority refresh failed:', prioErr);
    }

    // 10. Slack notice (non-fatal)
    try {
      if (body.outcome === 'booked') {
        const emoji = demoReady ? '✅' : '📞';
        const statusText = demoReady
          ? 'Demo-ready'
          : 'Gebucht (nicht demo-ready)';
        const text = `${emoji} ${leadRow.name as string} (${(leadRow.company as string) ?? 'unbekannt'}): ${statusText}`;
        await postSlackBriefing({
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text } },
          ],
          text,
        });
      }
    } catch {
      // Slack is secondary; failure is non-fatal
    }

    // 11. Build response
    const callLog: CallLog = {
      id: callLogRow.id as string,
      leadId: callLogRow.lead_id as string,
      outcome: body.outcome,
      notes: body.notes ?? null,
      transcript: body.transcript ?? null,
      analysis: evaluation,
      demoReady,
      recommendedAction: recommendedAction as NextAction | null,
      sellerAction: null,
      sellerReason: null,
      createdAt: callLogRow.created_at as string,
    };

    return NextResponse.json({
      callLog,
      evaluation,
      priority,
    });
  } catch (err) {
    console.error('Outcome route error:', err);
    return NextResponse.json(
      {
        error:
          'Das Ergebnis konnte nicht gespeichert werden. Bitte erneut versuchen.',
      },
      { status: 500 },
    );
  }
}
