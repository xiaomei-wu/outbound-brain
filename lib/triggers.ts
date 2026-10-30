/**
 * Pure trigger evaluation logic — no I/O.
 * Validates a Claude-produced TriggerEvaluation against the approved catalog.
 *
 * v2 changes (REVISION_V2.md):
 * - Gate 2 (evidence): public URL required for public evidence; chat/call evidence
 *   is accepted when evidenceKind is 'chat' or 'call' — no URL needed, but
 *   the evaluation must carry a non-empty sourceUrl OR a chat/call evidence note.
 * - Gate 3 (recency): stale → isActive=false, not a hard reject for the row,
 *   so callers must honour the returned `isActive` flag.
 * - No automatic upgrade for two independent triggers — both must be individually
 *   defensible; combined signals are surfaced in computePriority.
 * - Unsupported / contradicted / stale → isActive=false; the row is kept.
 */

import type {
  TriggerEvaluation,
  TriggerCatalogEntry,
  TriggerVerdict,
  EvidenceSource,
} from '@/lib/types';

/** Result from evaluateTrigger, extended with isActive flag for v2. */
export interface TriggerEvaluationResult {
  verdict: TriggerVerdict;
  matchedEntryId: string | null;
  /** false when the trigger is stale, unsupported or contradicted.
   *  Callers must write this flag to lead_trigger.is_active. */
  isActive: boolean;
}

/**
 * Evaluates a single trigger finding against the approved trigger catalog.
 *
 * Gates (all must pass for a non-reject verdict):
 * 1. triggerTypeId matches an approved catalog entry.
 * 2. Evidence present: non-empty sourceUrl (public evidence) OR
 *    evidenceKind is 'chat' | 'call' with a non-empty content note.
 * 3. Recency: eventDate is within the entry's windowDays.
 *
 * Relevance scoring: offerRelevance + personRelevance >= 5 → strong,
 *                                                        >= 3 → usable,
 *                                                        else → reject.
 *
 * Returns isActive=false when:
 * - The verdict is 'reject' (any gate failed).
 * - The eventDate is within range BUT the trigger has been previously
 *   marked as contradicted (callers pass the previous feedback).
 */
export function evaluateTrigger(
  evaluation: TriggerEvaluation,
  catalogEntries: TriggerCatalogEntry[],
  now: Date,
  evidenceKind: EvidenceSource = 'public',
  previousFeedback?: 'confirmed' | 'contradicted' | 'not_tested' | null
): TriggerEvaluationResult {
  const reject: TriggerEvaluationResult = {
    verdict: 'reject',
    matchedEntryId: null,
    isActive: false,
  };

  // Gate 1: must match an approved catalog entry
  if (!evaluation.triggerTypeId) return reject;
  const entry = catalogEntries.find(
    (e) => e.id === evaluation.triggerTypeId && e.approved
  );
  if (!entry) return reject;

  // Gate 2: evidence present
  //   Public evidence → sourceUrl required.
  //   Chat/call evidence → sourceUrl may be empty if content carries the excerpt.
  const hasPublicUrl =
    evaluation.sourceUrl !== null &&
    evaluation.sourceUrl !== undefined &&
    evaluation.sourceUrl.trim() !== '';
  const isChatOrCall = evidenceKind === 'chat' || evidenceKind === 'call';

  if (!hasPublicUrl && !isChatOrCall) return reject;

  // Gate 3: eventDate within windowDays (recency)
  const eventDate = new Date(evaluation.eventDate);
  if (isNaN(eventDate.getTime())) return reject;
  const windowMs = entry.windowDays * 24 * 3_600_000;
  const isStale = now.getTime() - eventDate.getTime() > windowMs;

  // Stale → keep row but isActive=false
  if (isStale) {
    return { verdict: 'reject', matchedEntryId: entry.id, isActive: false };
  }

  // Contradicted → keep row but isActive=false
  if (previousFeedback === 'contradicted') {
    return { verdict: 'reject', matchedEntryId: entry.id, isActive: false };
  }

  // Relevance scoring
  const total = evaluation.offerRelevance + evaluation.personRelevance;
  let verdict: TriggerVerdict;
  if (total >= 5) {
    verdict = 'strong';
  } else if (total >= 3) {
    verdict = 'usable';
  } else {
    verdict = 'reject';
  }

  return {
    verdict,
    matchedEntryId: entry.id,
    isActive: verdict !== 'reject',
  };
}

/** Fit score contribution for each verdict tier. */
export const TRIGGER_FIT_DELTA: Record<TriggerVerdict, number> = {
  strong: 30,
  usable: 15,
  reject: 0,
};
