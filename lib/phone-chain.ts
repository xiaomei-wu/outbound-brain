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
