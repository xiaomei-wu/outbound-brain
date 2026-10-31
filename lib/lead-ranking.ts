/**
 * Order of the call list. Real touchpoints with the person (LinkedIn invite, connection,
 * message, reply, pasted chat) come first, warmest first; leads that answered negatively
 * (priority low) are not lifted. Then ICP priority, callable numbers, call requests, fit.
 */

import { engagementRank } from '@/lib/reply-routing';
import type { Lead, Priority } from '@/lib/types';

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2, review: 3 };

type Rankable = Pick<Lead, 'priority' | 'engagementStage' | 'phone' | 'phoneDnc' | 'willingness' | 'fitScore'>;

export function hasTouchpoint(lead: Pick<Lead, 'priority' | 'engagementStage'>): boolean {
  return lead.engagementStage !== null && lead.priority !== 'low';
}

export function compareLeads(a: Rankable, b: Rankable): number {
  const tA = hasTouchpoint(a) ? 0 : 1;
  const tB = hasTouchpoint(b) ? 0 : 1;
  if (tA !== tB) return tA - tB;
  if (tA === 0) {
    const eA = engagementRank(a.engagementStage);
    const eB = engagementRank(b.engagementStage);
    if (eA !== eB) return eB - eA;
  }
  const pA = PRIORITY_ORDER[a.priority] ?? 99;
  const pB = PRIORITY_ORDER[b.priority] ?? 99;
  if (pA !== pB) return pA - pB;
  const cA = a.phone && !a.phoneDnc ? 0 : 1;
  const cB = b.phone && !b.phoneDnc ? 0 : 1;
  if (cA !== cB) return cA - cB;
  const wA = a.willingness === 'requested' ? 0 : 1;
  const wB = b.willingness === 'requested' ? 0 : 1;
  if (wA !== wB) return wA - wB;
  return b.fitScore - a.fitScore;
}
