// ============================================================
// Fixed signal pipeline (demo default). No agent runner — pure sequential logic.
// Called by the events route when a new event arrives.
//
// v2 changes:
// - Calls refreshLeadPriority after scoring so the priority column stays current.
// - Uses toCampaign mapper instead of manual object construction.
// - Slack remains secondary; opt-out still stops immediately.
// ============================================================

import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { applyEvent } from '@/lib/scoring';
import { refreshLeadPriority } from '@/lib/priority';
import { buildSlackBlocks, postSlackBriefing } from '@/lib/slack';
import {
  toCampaign,
  type CampaignRow,
  type LeadTriggerRow,
  type LeadContextRow,
  type BantClaimRow,
} from '@/lib/mappers';
import type { CallBriefing, EventType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Main: runSignalPipeline
// ---------------------------------------------------------------------------

export async function runSignalPipeline(eventId: string): Promise<void> {
  const db = getDb();

  // 1. Read event
  const { data: event, error: eventErr } = await db
    .from('lead_event')
    .select('*')
    .eq('id', eventId)
    .single();

  if (eventErr || !event) {
    console.error('Pipeline: could not read event', eventId, eventErr);
    return;
  }

  const leadEvent = event as {
    id: string;
    lead_id: string;
    type: string;
    occurred_at: string;
    evidence: string | null;
    is_test: boolean;
  };

  // 2. Read lead
  const { data: leadRow, error: leadErr } = await db
    .from('lead')
    .select('*')
    .eq('id', leadEvent.lead_id)
    .single();

  if (leadErr || !leadRow) {
    console.error('Pipeline: could not read lead', leadEvent.lead_id, leadErr);
    return;
  }

  // 3. Count weak signal total (for open/click cap in lib/scoring)
  const { count: weakCount } = await db
    .from('lead_event')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadEvent.lead_id)
    .in('type', ['open', 'click']);

  const weakSignalTotal = weakCount ?? 0;

  // 4. Apply scoring — delegate entirely to lib/scoring (German reasons, correct deltas)
  const now = new Date();
  const scoreResult = applyEvent(
    {
      fitScore: leadRow.fit_score as number,
      interestScore: leadRow.interest_score as number,
      lastAlertAt: leadRow.last_alert_at as string | null,
    },
    { type: leadEvent.type as EventType },
    weakSignalTotal,
    now,
  );

  // 5. Write decision row (German reason returned by lib/scoring)
  const { error: decisionErr } = await db.from('decision').insert({
    lead_id: leadEvent.lead_id,
    action: scoreResult.action,
    reason: scoreResult.reason,
    fit_score: leadRow.fit_score,
    interest_score: scoreResult.interestScore,
    decided_by: 'rules',
  });

  if (decisionErr) {
    console.error('Pipeline: could not write decision', decisionErr);
  }

  // 6. If sendAlert: get brief (cached first, generate as fallback),
  //    build Block Kit payload and post to Slack.
  //    Only set last_alert_at when Slack delivery succeeds.
  if (scoreResult.sendAlert) {
    try {
      let briefing: CallBriefing | null =
        (leadRow.cached_brief as CallBriefing | null) ?? null;

      if (!briefing) {
        // Lazy import to avoid circular deps at module load
        const { generateBrief } = await import('@/lib/claude/brief');

        const { data: campaignRow } = await db
          .from('campaign')
          .select('*')
          .eq('is_active', true)
          .limit(1)
          .single();

        if (campaignRow) {
          const { data: triggers } = await db
            .from('lead_trigger')
            .select('*')
            .eq('lead_id', leadEvent.lead_id)
            .neq('verdict', 'reject')
            .eq('is_assumption', false)
            .eq('is_active', true);

          // Remap to LeadTrigger shape via mapper for safety
          const { toLeadTrigger, toLeadContext, toBantClaim } = await import('@/lib/mappers');
          const mappedTriggers = (triggers ?? []).map((r) =>
            toLeadTrigger(r as LeadTriggerRow)
          );

          // Load chat context and BANT claims for the brief (v2)
          const { data: contextRows } = await db
            .from('lead_context')
            .select('*')
            .eq('lead_id', leadEvent.lead_id)
            .order('occurred_at', { ascending: true });

          const { data: bantRows } = await db
            .from('bant_claim')
            .select('*')
            .eq('lead_id', leadEvent.lead_id);

          const chatContext = (contextRows ?? []).map((r) =>
            toLeadContext(r as LeadContextRow)
          );
          const bantClaims = (bantRows ?? []).map((r) =>
            toBantClaim(r as BantClaimRow)
          );

          const campaign = toCampaign(campaignRow as CampaignRow);

          const slotsStr = env.FIXED_MEETING_SLOTS();
          const slots = slotsStr.split(',').map((s) => s.trim());
          const meetingSlots = [
            slots[0] ?? 'Thu 14:00',
            slots[1] ?? 'Fri 10:00',
          ];

          const { briefing: generated } = await generateBrief(
            {
              name: leadRow.name,
              role: leadRow.role,
              company: leadRow.company,
              phone: leadRow.phone,
              email: leadRow.email,
              profileUrl: leadRow.profile_url,
            },
            mappedTriggers,
            campaign,
            chatContext,
            bantClaims,
            meetingSlots,
          );

          briefing = generated;
        }
      }

      if (briefing) {
        const slackPayload = buildSlackBlocks(
          briefing,
          {
            id: leadEvent.lead_id,
            name: leadRow.name as string,
            company: leadRow.company as string | null,
          },
          env.APP_URL(),
          leadEvent.is_test,
        );

        const { ok } = await postSlackBriefing(slackPayload);

        if (ok) {
          // Record alert timestamp only on confirmed delivery
          await db
            .from('lead')
            .update({ last_alert_at: now.toISOString() })
            .eq('id', leadEvent.lead_id);
        } else {
          console.error('Pipeline: Slack post failed — last_alert_at not recorded');
        }
      }
    } catch (err) {
      console.error('Pipeline: brief generation or Slack post failed', err);
    }
  }

  // 7. If action is stop: update lead status, cancel unsent cadence steps
  if (scoreResult.action === 'stop') {
    await db
      .from('lead')
      .update({ status: 'stopped', interest_score: scoreResult.interestScore })
      .eq('id', leadEvent.lead_id);

    await db
      .from('cadence_step')
      .update({ status: 'cancelled' })
      .eq('lead_id', leadEvent.lead_id)
      .in('status', ['draft', 'approved']);
  } else {
    // 8. Update lead interest_score
    //    (last_alert_at is handled above in step 6 on successful Slack delivery)
    await db
      .from('lead')
      .update({ interest_score: scoreResult.interestScore })
      .eq('id', leadEvent.lead_id);
  }

  // 9. Refresh priority (v2: priority is separate from fit/interest scores)
  //    Fire-and-forget — don't block the pipeline response on this.
  refreshLeadPriority(leadEvent.lead_id).catch((err: unknown) => {
    console.error('Pipeline: refreshLeadPriority failed', err);
  });
}
