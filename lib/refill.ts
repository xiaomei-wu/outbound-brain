/**
 * Refill: when the call queue runs low, A/B leads that are not in the Needle campaign yet
 * are created in Needle (with the ICP routing properties) and enrolled. While the campaign
 * sends nothing this runs automatically; once it sends, enrolling means outreach, so it
 * needs one click. Pure rules here; side effects in lib/refill-run.ts.
 */

import { compareLeads } from '@/lib/lead-ranking';
import type { Lead } from '@/lib/types';

export const REFILL_THRESHOLD = 5;
export const REFILL_BATCH = 10;

/** Step kinds that never contact anyone. Anything else (or an unknown graph) counts as sending. */
const SILENT_KINDS = new Set(['start', 'end', 'condition', 'wait']);

export function campaignSends(graph: { nodes?: { kind?: string }[] } | null | undefined): boolean {
  const nodes = graph?.nodes;
  if (!nodes || nodes.length === 0) return true;
  return nodes.some((n) => !SILENT_KINDS.has(n.kind ?? ''));
}

const OPEN_STATUSES: Lead['status'][] = ['new', 'researched', 'briefed', 'calling'];

type QueueLead = Pick<Lead, 'id' | 'isTest' | 'sortoutStatus' | 'status' | 'priority' | 'companyKey'>;

function isOpenAB(l: QueueLead, scores: Map<string, string>): boolean {
  const score = l.companyKey ? scores.get(l.companyKey) : undefined;
  return (
    !l.isTest &&
    !l.sortoutStatus &&
    OPEN_STATUSES.includes(l.status) &&
    l.priority !== 'low' &&
    (score === 'A' || score === 'B')
  );
}

/** A/B leads that can still be called (not called, not sorted out, not answered negatively). */
export function openQueueCount(leads: QueueLead[], scores: Map<string, string>): number {
  return leads.filter((l) => isOpenAB(l, scores)).length;
}

/** Open A/B leads with a LinkedIn profile that are not in Needle yet, best first. */
export function selectRefillCandidates(leads: Lead[], scores: Map<string, string>, limit: number): string[] {
  return leads
    .filter((l) => isOpenAB(l, scores) && !l.needleLeadId && Boolean(l.profileUrl?.includes('linkedin.com/')))
    .sort(compareLeads)
    .slice(0, limit)
    .map((l) => l.id);
}

const TITLES = /^(dr|prof|dipl|ing|mag)\.?$/i;

export function splitName(name: string): { firstName: string; lastName: string } {
  const words = name.split(/\s+/).filter((w) => w && !TITLES.test(w));
  return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
}
