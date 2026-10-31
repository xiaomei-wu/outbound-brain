/**
 * Loop back to Needle: the ICP result becomes lead properties the campaign branches on
 * ("Unternehmensfit A/B bestätigt?" → test_company_qualified, "AP passend?" → test_person_qualified).
 * Our own details use the ob_ prefix; the team's other properties are never removed.
 * Only lead properties are written; never messages.
 */

import { getDb } from '@/lib/db';
import { mergeLeadProperties } from '@/lib/needle';
import type { CompanyCheck } from '@/lib/types';

export function icpNeedleProperties(
  check: Pick<CompanyCheck, 'score' | 'segments' | 'decision' | 'decisionReason'>,
  personFits: boolean,
  now: Date,
): Record<string, string> {
  const companyQualified = check.score === 'A' || check.score === 'B';
  return {
    test_company_qualified: String(companyQualified),
    test_person_qualified: String(companyQualified && personFits),
    ob_icp_score: check.score,
    ob_icp_segment: check.segments[0] ?? '',
    ob_icp_decision: `${check.decision}: ${check.decisionReason}`.slice(0, 500),
    ob_icp_checked_at: now.toISOString().slice(0, 10),
    ob_icp_source: 'Outbound Brain',
  };
}

/** Writes properties to the lead's Needle record and stamps needle_synced_at; never throws. */
export async function pushToNeedle(leadId: string, needleLeadId: string, properties: Record<string, string>): Promise<boolean> {
  try {
    await mergeLeadProperties(needleLeadId, properties);
    await getDb().from('lead').update({ needle_synced_at: new Date().toISOString() }).eq('id', leadId);
    return true;
  } catch (err) {
    console.error('[needle-writeback] failed', needleLeadId, err instanceof Error ? err.message : err);
    return false;
  }
}
