/**
 * Lead-find helpers for the unified POST /api/leads/find endpoint.
 * Pure functions only — no I/O, no side effects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FindResult {
  /** e.g. 'needle_campaign' | 'blitz' | 'ai_ark' */
  source: string;
  /** true when the source is connected AND returned at least partial success */
  ok: boolean;
  created: number;
  /** human-readable per-source line, e.g. "Needle: 12 neu" | "AI Ark: nicht verbunden" */
  message: string;
}

export interface FindSummary {
  /** true when at least one source succeeded */
  ok: boolean;
  /** all per-source messages joined with ' · ' */
  message: string;
}

// ---------------------------------------------------------------------------
// summarizeFind — compose results into a single status + message
// ---------------------------------------------------------------------------

/**
 * Summarizes a list of per-source find results.
 * ok = at least one source returned ok:true.
 * message = all per-source messages joined with ' · '.
 */
export function summarizeFind(results: FindResult[]): FindSummary {
  const ok = results.some((r) => r.ok);
  const message = results.map((r) => r.message).join(' · ');
  return { ok, message };
}
