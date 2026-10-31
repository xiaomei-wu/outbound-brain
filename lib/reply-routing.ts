/**
 * Pure helpers for Needle chats and replies: match events to leads, turn them into
 * lead_context rows, and decide what a reply signal does to ranking and sort-out.
 */

import type { EngagementStage, Priority, ReplySignal, SortoutStatus, WillingnessStatus } from '@/lib/types';

/** Public LinkedIn identifier from a profile URL ("…/in/erika-muster-123/" → "erika-muster-123"). */
export function normalizeLinkedinUrl(url: string | null | undefined): string | null {
  const match = url?.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}

interface EventLike {
  id?: string;
  type?: string;
  occurredAt?: string;
  leadId?: string | null;
  data?: Record<string, unknown>;
}

interface LeadRef {
  id: string;
  needleLeadId: string | null;
  profileUrl: string | null;
}

/** Campaign events carry the Needle lead id; inbox events only the sender's LinkedIn profile. */
export function matchEventToLead(event: EventLike, leads: LeadRef[]): string | null {
  if (event.leadId) {
    const byNeedle = leads.find((l) => l.needleLeadId === event.leadId);
    if (byNeedle) return byNeedle.id;
  }
  const profile = (event.data?.profile ?? {}) as { url?: string; identity?: string };
  const identity = normalizeLinkedinUrl(profile.url) ?? profile.identity?.toLowerCase() ?? null;
  if (!identity) return null;
  return leads.find((l) => normalizeLinkedinUrl(l.profileUrl) === identity)?.id ?? null;
}

export interface ContextInsert {
  lead_id: string;
  kind: 'linkedin';
  author: 'contact' | 'seller';
  content: string;
  occurred_at: string;
  source_url: null;
  external_id: string;
}

/** A LinkedIn message event as a chat row; null for events without text (invites, visits). */
export function eventToContextRow(event: EventLike, leadId: string): ContextInsert | null {
  const text = typeof event.data?.text === 'string' ? event.data.text.trim() : '';
  if (!text || !event.id) return null;
  if (event.type !== 'linkedin_message_received' && event.type !== 'linkedin_message_sent') return null;
  return {
    lead_id: leadId,
    kind: 'linkedin',
    author: event.type === 'linkedin_message_received' ? 'contact' : 'seller',
    content: text,
    occurred_at: event.occurredAt ?? new Date().toISOString(),
    source_url: null,
    external_id: `needle:${event.id}`,
  };
}

/**
 * What a reply does. A call request moves the lead to the top; negative replies move it to
 * the bottom right away. Removing a lead (sort-out) is always a suggestion applied on click.
 */
export function replyEffect(signal: ReplySignal): {
  priority: Priority | null;
  willingness: WillingnessStatus | null;
  suggested: SortoutStatus | null;
} {
  switch (signal) {
    case 'call_request':
      return { priority: 'high', willingness: 'requested', suggested: null };
    case 'interested':
      return { priority: 'high', willingness: 'open', suggested: null };
    case 'later':
    case 'not_interested':
      return { priority: 'low', willingness: null, suggested: 'not_now' };
    case 'opt_out':
      return { priority: 'low', willingness: 'declined', suggested: 'opt_out' };
    case 'wrong_contact':
      return { priority: null, willingness: null, suggested: 'wrong_contact' };
    case 'disqualifier':
      return { priority: 'low', willingness: null, suggested: 'not_a_fit' };
    default:
      return { priority: null, willingness: null, suggested: null };
  }
}

const STAGE_BY_EVENT: Record<string, EngagementStage> = {
  linkedin_invite_sent: 'invited',
  linkedin_invite_accepted: 'connected',
  linkedin_message_sent: 'messaged',
  linkedin_message_received: 'replied',
};

const STAGE_ORDER: EngagementStage[] = ['invited', 'connected', 'messaged', 'replied'];

/** Campaign stage a Needle event shows; null for events that say nothing about engagement. */
export function engagementFromEvent(type: string | undefined): EngagementStage | null {
  return (type && STAGE_BY_EVENT[type]) || null;
}

/** 0 = no campaign contact yet; higher = warmer. LinkedIn exposes no read receipts. */
export function engagementRank(stage: EngagementStage | null): number {
  return stage ? STAGE_ORDER.indexOf(stage) + 1 : 0;
}

/** Stages only move forward (a later "invite sent" never undoes "replied"). */
export function laterStage(current: EngagementStage | null, next: EngagementStage): EngagementStage {
  return engagementRank(next) > engagementRank(current) ? next : (current ?? next);
}
