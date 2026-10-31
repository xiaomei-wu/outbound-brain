/**
 * Phone lookup chain: cheaper sources first, Lusha only as the last resort
 * (Xiaomei, 2026-10-31). Lusha is never run automatically; the UI offers it with
 * its credit cost after this chain finds nothing.
 */

export type ChainSource = 'ai_ark' | 'blitz';

/** Order in which the automatic chain tries sources. BlitzAPI only has US numbers. */
export function phoneSourceOrder(opts: { hasAiArk: boolean; hasBlitz: boolean; isUs: boolean }): ChainSource[] {
  const order: ChainSource[] = [];
  if (opts.hasAiArk) order.push('ai_ark');
  if (opts.hasBlitz && opts.isUs) order.push('blitz');
  return order;
}

/** True for regions like "United States" or "…, US"; "Augsburg" must not match. */
export function isUsRegion(region: string | null): boolean {
  if (!region) return false;
  return /\b(united states|usa|us)\b/i.test(region);
}

/**
 * Leads the bulk phone search covers: real, not sorted out, no number yet, chain not yet
 * tried, and their company scored A or B (nobody calls C/D, so no credits are spent there).
 */
export function selectLeadsForPhoneSearch(
  leads: {
    id: string;
    isTest: boolean;
    phone: string | null;
    sortoutStatus: string | null;
    phoneLookupAt: string | null;
    companyKey: string | null;
  }[],
  scoreByCompany: Map<string, string>,
): string[] {
  return leads
    .filter(
      (l) =>
        !l.isTest &&
        !l.phone &&
        !l.sortoutStatus &&
        !l.phoneLookupAt &&
        l.companyKey !== null &&
        ['A', 'B'].includes(scoreByCompany.get(l.companyKey) ?? ''),
    )
    .map((l) => l.id);
}
