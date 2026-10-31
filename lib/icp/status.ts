import type { Lead } from '@/lib/types';

/** A background check that has not reported back for this long is treated as stuck, not active. */
const STALE_MS = 15 * 60_000;

export function isIcpActive(lead: Pick<Lead, 'icpStatus' | 'icpStatusAt'>, now: Date): boolean {
  if (lead.icpStatus !== 'queued' && lead.icpStatus !== 'running') return false;
  return lead.icpStatusAt !== null && now.getTime() - new Date(lead.icpStatusAt).getTime() < STALE_MS;
}

export function icpActivity(leads: Pick<Lead, 'icpStatus' | 'icpStatusAt'>[], now: Date): { active: number; failed: number } {
  return {
    active: leads.filter((l) => isIcpActive(l, now)).length,
    failed: leads.filter((l) => l.icpStatus === 'failed').length,
  };
}
