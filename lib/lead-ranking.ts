/**
 * Order of the call list. Real touchpoints with the person (LinkedIn invite, connection,
 * message, reply, pasted chat) come first, warmest first; leads that answered negatively
 * (priority low) are not lifted. Then ICP priority, callable numbers, call requests, fit.
 */

import { engagementRank } from '@/lib/reply-routing';
import type { Lead, LeadOrigin, Priority } from '@/lib/types';

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

export type SourceFilter = LeadOrigin | 'all';
export type SortMode = 'recommended' | 'source' | 'newest' | 'company' | 'icp';

/** Display order of sources when sorting by source: the main source first. */
export const SOURCE_ORDER: LeadOrigin[] = ['needle_campaign', 'needle_search', 'ai_ark', 'blitz', 'csv', 'manual', 'prepared', 'test'];
const ICP_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, nicht_bewertbar: 4 };

export function filterBySource<T extends Pick<Lead, 'origin'>>(leads: T[], source: SourceFilter): T[] {
  return source === 'all' ? leads : leads.filter((l) => l.origin === source);
}

export function countBySource(leads: Pick<Lead, 'origin'>[]): Partial<Record<LeadOrigin, number>> {
  const counts: Partial<Record<LeadOrigin, number>> = {};
  for (const l of leads) counts[l.origin] = (counts[l.origin] ?? 0) + 1;
  return counts;
}

/** Sorts a copy; ties fall back to the recommended ranking. scoreById: lead id → ICP score. */
export function sortLeadsBy<T extends Rankable & Pick<Lead, 'id' | 'origin' | 'company' | 'createdAt'>>(
  leads: T[],
  mode: SortMode,
  scoreById: Map<string, string>,
): T[] {
  const primary = (a: T, b: T): number => {
    switch (mode) {
      case 'source':
        return SOURCE_ORDER.indexOf(a.origin) - SOURCE_ORDER.indexOf(b.origin);
      case 'newest':
        return b.createdAt.localeCompare(a.createdAt);
      case 'company':
        // Leads without a company name go last
        if (!a.company || !b.company) return (a.company ? 0 : 1) - (b.company ? 0 : 1);
        return a.company.localeCompare(b.company, 'de');
      case 'icp':
        return (ICP_ORDER[scoreById.get(a.id) ?? ''] ?? 9) - (ICP_ORDER[scoreById.get(b.id) ?? ''] ?? 9);
      default:
        return 0;
    }
  };
  return [...leads].sort((a, b) => primary(a, b) || compareLeads(a, b));
}
