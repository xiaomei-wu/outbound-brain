/**
 * Needle chats and replies → lead_context → reply signal → ranking.
 *
 * Sources: the Needle webhook (real time) and syncNeedleReplies() (on "Leads finden" or the
 * "Antworten abrufen" button). Both read only; nothing is written to Needle here.
 */

import { classifyConversation } from '@/lib/claude/reply-signal';
import { getDb } from '@/lib/db';
import { routeForScore } from '@/lib/icp/routing';
import { searchCampaignEvents, type NeedleEvent } from '@/lib/needle';
import { engagementFromEvent, eventToContextRow, laterStage, matchEventToLead, replyEffect } from '@/lib/reply-routing';
import type { EngagementStage, IcpScore, ReplySignal } from '@/lib/types';

export const MESSAGE_EVENT_TYPES = ['linkedin_message_received', 'linkedin_message_sent'];
/** Everything the campaign does with a lead that says how warm it is (no read receipts exist). */
export const CAMPAIGN_EVENT_TYPES = [...MESSAGE_EVENT_TYPES, 'linkedin_invite_sent', 'linkedin_invite_accepted'];

const SIGNAL_LABEL: Record<ReplySignal, string> = {
  call_request: 'Gesprächswunsch',
  interested: 'Interesse',
  later: 'Später',
  not_interested: 'Kein Interesse',
  opt_out: 'Bitte nicht mehr kontaktieren',
  wrong_contact: 'Falscher Ansprechpartner',
  disqualifier: 'Ausschlussgrund',
  neutral: 'Neutral',
};

/**
 * Stores message events as chat rows on the matching leads (each event once).
 * Returns the ids of leads that received new messages from the contact.
 */
export async function ingestMessageEvents(events: NeedleEvent[]): Promise<string[]> {
  if (events.length === 0) return [];
  const db = getDb();
  const { data } = await db
    .from('lead')
    .select('id, needle_lead_id, profile_url, engagement_stage')
    .eq('is_test', false);
  const rowsById = new Map(
    ((data ?? []) as { id: string; needle_lead_id: string | null; profile_url: string | null; engagement_stage: EngagementStage | null }[]).map((l) => [l.id, l]),
  );
  const leads = [...rowsById.values()].map((l) => ({ id: l.id, needleLeadId: l.needle_lead_id, profileUrl: l.profile_url }));

  // Campaign engagement: the furthest stage per lead, only ever moving forward
  const stages = new Map<string, { stage: EngagementStage; at: string }>();
  for (const e of events) {
    const stage = engagementFromEvent(e.type);
    const leadId = stage ? matchEventToLead(e, leads) : null;
    if (!stage || !leadId) continue;
    const current = stages.get(leadId)?.stage ?? rowsById.get(leadId)?.engagement_stage ?? null;
    const next = laterStage(current, stage);
    if (next !== current) stages.set(leadId, { stage: next, at: e.occurredAt ?? new Date().toISOString() });
  }
  for (const [leadId, { stage, at }] of stages) {
    await db.from('lead').update({ engagement_stage: stage, engagement_at: at }).eq('id', leadId);
  }

  const rows = events
    .map((e) => {
      const leadId = matchEventToLead(e, leads);
      return leadId ? eventToContextRow(e, leadId) : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return [];

  const { data: inserted, error } = await db
    .from('lead_context')
    .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: true })
    .select('lead_id, author');
  if (error) throw new Error(`Nachrichten konnten nicht gespeichert werden: ${error.message}`);

  const fromContact = ((inserted ?? []) as { lead_id: string; author: string }[])
    .filter((r) => r.author === 'contact')
    .map((r) => r.lead_id);
  return [...new Set(fromContact)];
}

/** Classifies the lead's conversation and applies the ranking effect (never a sort-out). */
export async function analyzeLeadReplies(leadId: string): Promise<ReplySignal | null> {
  const db = getDb();
  const [{ data: lead }, { data: ctx }] = await Promise.all([
    db.from('lead').select('name, company_key, reply_signal').eq('id', leadId).single(),
    db.from('lead_context').select('author, content, occurred_at').eq('lead_id', leadId).in('kind', ['chat', 'linkedin', 'email']),
  ]);
  if (!lead) return null;
  const l = lead as { name: string; company_key: string | null; reply_signal: ReplySignal | null };
  const messages = ((ctx ?? []) as { author: 'contact' | 'seller'; content: string; occurred_at: string }[]).map((m) => ({
    author: m.author,
    content: m.content,
    occurredAt: m.occurred_at,
  }));

  const result = await classifyConversation(l.name, messages);
  const effect = replyEffect(result.signal);

  const update: Record<string, unknown> = {
    reply_signal: result.signal,
    reply_quote: result.quote || null,
    reply_reason: result.reason,
    reply_at: new Date().toISOString(),
  };
  if (effect.willingness) update.willingness = effect.willingness;
  if (effect.priority) {
    update.priority = effect.priority;
    update.priority_reason = `${SIGNAL_LABEL[result.signal]} auf LinkedIn: „${result.quote}“`;
  } else if (l.reply_signal && replyEffect(l.reply_signal).priority && l.company_key) {
    // The earlier reply no longer applies: fall back to the ICP ranking
    const { data: check } = await db.from('company_check').select('score, result').eq('company_key', l.company_key).single();
    if (check) {
      const c = check as { score: IcpScore; result: { decisionReason?: string } };
      update.priority = routeForScore(c.score).priority;
      update.priority_reason = c.result.decisionReason ?? '';
    }
  }

  await db.from('lead').update(update).eq('id', leadId);
  return result.signal;
}

/** Pulls recent LinkedIn messages from Needle, stores new ones and re-evaluates those leads. */
export async function syncNeedleReplies(): Promise<{ events: number; leadsUpdated: number }> {
  const events = await searchCampaignEvents(null, CAMPAIGN_EVENT_TYPES, 500);
  const leadIds = await ingestMessageEvents(events);
  for (const id of leadIds) {
    try {
      await analyzeLeadReplies(id);
    } catch (err) {
      console.error('[needle-replies] analyze failed', id, err instanceof Error ? err.message : err);
    }
  }
  return { events: events.length, leadsUpdated: leadIds.length };
}
