import type { LeadOrigin } from './types';

const ORIGIN_LABELS: Record<LeadOrigin, string> = {
  needle_campaign: 'Needle · Kampagne',
  needle_search: 'Needle · LinkedIn-Suche',
  blitz: 'BlitzAPI',
  ai_ark: 'AI Ark',
  csv: 'CSV',
  manual: 'Manuell',
  prepared: 'Vorbereitet',
  test: 'Demo (TEST)',
};

/** Human-readable origin shown on every lead (list + call view). */
export function originLabel(origin: LeadOrigin, detail: string | null): string {
  if (origin === 'needle_campaign' && detail) return `${ORIGIN_LABELS.needle_campaign} „${detail}"`;
  return ORIGIN_LABELS[origin];
}

const LEGAL_SUFFIX = /\b(gmbh\s*&\s*co\.?\s*kg|gmbh|ag|se|kg|mbh|ug)\b\.?/g;

/**
 * Cache key for the per-company ICP check: bare domain when known,
 * otherwise "name:" + company name without legal suffixes. Null when neither is usable.
 */
export function companyKey(domain: string | null, name: string | null): string | null {
  const host = domain
    ?.trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
  if (host) return host;

  const normalized = name
    ?.toLowerCase()
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/[^\p{L}\p{N}&\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? `name:${normalized}` : null;
}
