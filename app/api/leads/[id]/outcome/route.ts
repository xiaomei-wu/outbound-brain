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
import { applySortout } from '@/lib/sortout';
import { getDb } from '@/lib/db';
import { analyzeCall } from '@/lib/call-analysis';
import { refreshLeadPriority } from '@/lib/priority';
import { postSlackBriefing } from '@/lib/slack';
import { toCampaign } from '@/lib/mappers';
import type { CampaignRow } from '@/lib/mappers';
import type {
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

    // 2.–6. Claude evaluation (BANT, trigger feedback, corrections); failure is reported, not fatal
    const { evaluation, demoReady, recommendedAction, error: analysisError } = await analyzeCall({
      leadId: id,
      callLogId: callLogRow.id as string,
      outcome: body.outcome,
      notes: body.notes ?? null,
      transcript: body.transcript ?? null,
      leadRow: leadRow as Record<string, unknown>,
      campaign,
    });

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
      // The person asked not to be contacted: permanent opt-out, mirrored to Needle
      try {
        await applySortout(id, 'opt_out', 'Opt-out im Gespräch');
      } catch (err) {
        console.error('[outcome] opt-out sortout failed', err);
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
      analysisError,
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
