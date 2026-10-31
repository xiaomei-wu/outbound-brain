import type { Lead } from '@/lib/types';

/** A background check that has not reported back for this long is treated as stuck, not active. */
const STALE_MS = 15 * 60_000;

export function isIcpActive(lead: Pick<Lead, 'icpStatus' | 'icpStatusAt'>, now: Date): boolean {
  if (lead.icpStatus !== 'queued' && lead.icpStatus !== 'running') return false;
  return lead.icpStatusAt !== null && now.getTime() - new Date(lead.icpStatusAt).getTime() < STALE_MS;
}

export function icpActivity(
  leads: (Pick<Lead, 'icpStatus' | 'icpStatusAt'> & Partial<Pick<Lead, 'icpError'>>)[],
  now: Date,
): { active: number; failed: number; creditExhausted: boolean } {
  const failed = leads.filter((l) => l.icpStatus === 'failed');
  return {
    active: leads.filter((l) => isIcpActive(l, now)).length,
    failed: failed.length,
    // Anthropic: "Your credit balance is too low to access the Anthropic API"
    creditExhausted: failed.some((l) => /credit balance is too low/i.test(l.icpError ?? '')),
  };
}
