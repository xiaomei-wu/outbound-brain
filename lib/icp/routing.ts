/**
 * ICP routing — pure helpers for score-based routing, role matching,
 * sort-out expiry, and Needle suppression payloads.
 * No I/O, no side effects. Unit-tested in routing.test.ts.
 */

import type { NeedleSuppressionEntry } from '@/lib/needle';
import type {
  CompanyCheck,
  FitStatus,
  IcpScore,
  Priority,
  SortoutStatus,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Route mapping
// ---------------------------------------------------------------------------

export type IcpRoute = 'call' | 'park' | 'exclude' | 'research';

export interface RouteInfo {
  route: IcpRoute;
  priority: Priority;
  fitStatus: FitStatus;
  suggested: SortoutStatus[];
}

const ROUTE_MAP: Record<IcpScore, RouteInfo> = {
  A: { route: 'call', priority: 'high', fitStatus: 'fits', suggested: [] },
  B: { route: 'call', priority: 'medium', fitStatus: 'partial', suggested: [] },
  C: { route: 'park', priority: 'low', fitStatus: 'partial', suggested: ['not_now'] },
  D: { route: 'exclude', priority: 'low', fitStatus: 'outside', suggested: ['not_a_fit'] },
  nicht_bewertbar: { route: 'research', priority: 'review', fitStatus: 'unknown', suggested: [] },
};

export function routeForScore(score: IcpScore): RouteInfo {
  return { ...ROUTE_MAP[score], suggested: [...ROUTE_MAP[score].suggested] };
}

// ---------------------------------------------------------------------------
// normalizeIcpResult — downgrade A/B without evidenced fit signals
// ---------------------------------------------------------------------------

export function normalizeIcpResult(r: CompanyCheck): CompanyCheck {
  if (r.score !== 'A' && r.score !== 'B') return r;

  const hasEvidencedSignal = r.fitSignals.some((s) =>
    /^https?:\/\//.test(s.url),
  );

  if (hasEvidencedSignal) return r;

  return {
    ...r,
    score: 'nicht_bewertbar',
    decision: 'Recherche ergaenzen',
  };
}

// ---------------------------------------------------------------------------
// roleMatches — stem matching (first 8 chars per word, case-insensitive)
// ---------------------------------------------------------------------------

function stems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s/&@,()+.-]+/)
    .filter((w) => w.length > 2)
    .map((w) => w.slice(0, 8));
}

/** Roles that clearly cannot decide (PDF: a proven No beats an unfounded Yes, so only clear cases). */
const JUNIOR_ROLE = /(werkstudent|praktikant|trainee|auszubild|azubi|\bintern\b|student|assisten|sachbearbeit)/i;

/** Decision-maker or real-estate acquisition/development terms (German and English). */
const RELEVANT_ROLE =
  /(geschäftsf|geschaeftsf|vorstand|inhaber|gründer|founder|ceo|coo|cfo|managing|director|direktor|head|leiter|leitung|prokur|partner|ankauf|akquis|acquisition|grundstück|grundstueck|projektentw|development|investment|asset|portfolio|transaktion|transaction)/i;

/**
 * Person fit for the campaign's "AP passend?" step. Unknown or empty roles fit (missing
 * information is no exclusion). A role fails only when it is clearly junior, or shares no
 * word with the ICP roles and contains no decision-maker or real-estate term.
 */
export function roleMatches(role: string | null, icpRoles: string[]): boolean {
  if (role === null || role.trim() === '') return true;
  if (JUNIOR_ROLE.test(role)) return false;
  if (RELEVANT_ROLE.test(role)) return true;

  const roleStems = stems(role);
  return icpRoles.some((icpRole) =>
    stems(icpRole).some((s) => roleStems.some((r) => r === s || r.startsWith(s) || s.startsWith(r))),
  );
}

// ---------------------------------------------------------------------------
// selectCompaniesToCheck — unique keys not yet checked, capped
// ---------------------------------------------------------------------------

export function selectCompaniesToCheck(
  leads: { id: string; companyKey: string | null }[],
  alreadyChecked: Set<string>,
  cap: number,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const lead of leads) {
    if (!lead.companyKey) continue;
    if (seen.has(lead.companyKey)) continue;
    if (alreadyChecked.has(lead.companyKey)) continue;
    seen.add(lead.companyKey);
    result.push(lead.companyKey);
    if (result.length >= cap) break;
  }

  return result;
}

// ---------------------------------------------------------------------------
// sortoutExpiry
// ---------------------------------------------------------------------------

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function sortoutExpiry(status: SortoutStatus, now: Date): Date | null {
  switch (status) {
    case 'not_a_fit':
      return new Date(now.getTime() + TWELVE_MONTHS_MS);
    case 'not_now':
      return new Date(now.getTime() + NINETY_DAYS_MS);
    case 'wrong_contact':
    case 'opt_out':
      return null;
  }
}

// ---------------------------------------------------------------------------
// buildSuppression — Needle suppression payload (or null if not possible)
// ---------------------------------------------------------------------------

export type { NeedleSuppressionEntry };

export function buildSuppression(
  status: SortoutStatus,
  lead: { needleLeadId: string | null; companyDomain: string | null },
  note: string,
  now: Date,
): NeedleSuppressionEntry | null {
  const expiry = sortoutExpiry(status, now);
  const expiresAt = expiry ? expiry.toISOString() : null;

  if (status === 'not_a_fit') {
    if (!lead.companyDomain) return null;
    return {
      scope: 'company',
      companyDomain: lead.companyDomain,
      reason: 'manual',
      note,
      expiresAt,
    };
  }

  // All other statuses: lead-level suppression
  if (!lead.needleLeadId) return null;
  return {
    scope: 'lead',
    leadId: lead.needleLeadId,
    reason: status === 'opt_out' ? 'not_interested' : 'manual',
    note,
    expiresAt,
  };
}
