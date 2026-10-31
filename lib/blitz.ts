/**
 * BlitzAPI REST client and pure mappers.
 * Base URL: https://api.blitz-api.ai — header: x-api-key
 *
 * API reference (verified against vendor docs 2026-10-31):
 *   GET  /v2/account/key-info       — account status + records remaining
 *   POST /v2/search/companies       — find companies by industry/keyword/HQ
 *   POST /v2/search/employee-finder — find decision-makers at a company
 *   POST /v2/enrichment/phone       — phone lookup (US people only)
 *
 * Role: lead SOURCE (finding companies + decision-makers). Phone endpoint is
 * US-only and is therefore exposed only when the lead region is US.
 */

import { companyKey } from '@/lib/origin';
import type { LeadRow } from '@/lib/mappers';

// ---------------------------------------------------------------------------
// Public type aliases
// ---------------------------------------------------------------------------

/** A row ready to INSERT into the `lead` table (no id, no created_at). */
export type NewLeadRow = Omit<LeadRow, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// BlitzAPI response shape types
// ---------------------------------------------------------------------------

export interface BlitzCompany {
  name: string;
  domain: string | null;
  linkedin_url: string | null;
  hq: { city: string | null; country_code: string | null } | null;
  employees_on_linkedin: number | null;
  /** Optional fields returned by the API but not required by our mappers */
  about?: string | null;
  website?: string | null;
}

export interface BlitzPersonExperience {
  job_title: string;
  job_is_current: boolean;
  company_domain: string | null;
}

export interface BlitzPerson {
  full_name: string;
  linkedin_url: string | null;
  location: { city: string | null; country_code: string | null } | null;
  experiences: BlitzPersonExperience[];
}

interface BlitzKeyInfoResponse {
  valid?: boolean;
  records_remaining?: number;
  allowed_apis?: string[];
}

interface BlitzSearchCompaniesResponse {
  results?: BlitzCompany[];
  cursor?: string | null;
}

interface BlitzSearchEmployeesResponse {
  results?: BlitzPerson[];
}

interface BlitzPhoneResponse {
  found?: boolean;
  phone?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.blitz-api.ai';
const TIMEOUT_MS = 30_000;

// Real-estate lead-source search parameters. Probed 2026-10-31: German-only keywords
// combined with the 4-industry list returned 0 companies; English + German keywords
// on the two real-estate industries return ~1,400 German companies incl. developers.
export const BLITZ_RE_COMPANY_SEARCH = {
  company: {
    industry: { include: ['Real Estate', 'Commercial Real Estate'] },
    keywords: { include: ['real estate development', 'Projektentwicklung', 'Bauträger'] },
    hq: { country_code: ['DE'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function blitzHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

/**
 * Returns a human-readable German error message for a BlitzAPI HTTP status code.
 * Pure — no side effects.
 */
export function blitzErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return 'BlitzAPI-Schlüssel ungültig — bitte auf der Integrations-Seite prüfen.';
    case 402:
      return 'BlitzAPI-Kontingent für diesen Monat aufgebraucht.';
    case 422:
      return 'BlitzAPI: ungültige Anfrage — Suchparameter prüfen.';
    case 429:
      return 'BlitzAPI: zu viele Anfragen — bitte kurz warten.';
    default:
      return `BlitzAPI-Fehler (HTTP ${status}) — bitte später erneut versuchen.`;
  }
}

/** Throw a descriptive error for any non-2xx BlitzAPI response. */
async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[blitz]', res.status, body.slice(0, 200));
    throw new Error(blitzErrorMessage(res.status));
  }
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Check API key validity and remaining record quota.
 * GET /v2/account/key-info
 */
export async function blitzKeyInfo(
  apiKey: string
): Promise<{ valid: boolean; recordsRemaining: number }> {
  const res = await fetch(`${BASE_URL}/v2/account/key-info`, {
    headers: blitzHeaders(apiKey),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await assertOk(res);
  const data = (await res.json()) as BlitzKeyInfoResponse;
  return {
    valid: data.valid ?? true,
    recordsRemaining: data.records_remaining ?? 0,
  };
}

/**
 * Search for German real-estate companies.
 * POST /v2/search/companies
 */
export async function blitzSearchCompanies(
  apiKey: string,
  opts: { maxResults: number; cursor?: string | null }
): Promise<{ companies: BlitzCompany[]; cursor: string | null }> {
  const body = {
    ...BLITZ_RE_COMPANY_SEARCH,
    max_results: opts.maxResults,
    ...(opts.cursor ? { cursor: opts.cursor } : {}),
  };

  const res = await fetch(`${BASE_URL}/v2/search/companies`, {
    method: 'POST',
    headers: blitzHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await assertOk(res);
  const data = (await res.json()) as BlitzSearchCompaniesResponse;
  return {
    companies: data.results ?? [],
    cursor: data.cursor ?? null,
  };
}

/**
 * Find decision-makers at a company via LinkedIn URL.
 * POST /v2/search/employee-finder
 * Filters: country DE, job levels C-Team / Director / VP.
 */
export async function blitzFindEmployees(
  apiKey: string,
  companyLinkedinUrl: string,
  maxResults: number
): Promise<BlitzPerson[]> {
  const res = await fetch(`${BASE_URL}/v2/search/employee-finder`, {
    method: 'POST',
    headers: blitzHeaders(apiKey),
    body: JSON.stringify({
      company_linkedin_url: companyLinkedinUrl,
      country_code: ['DE'],
      job_level: ['C-Team', 'Director', 'VP'],
      max_results: maxResults,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await assertOk(res);
  const data = (await res.json()) as BlitzSearchEmployeesResponse;
  return data.results ?? [];
}

/**
 * Look up a phone number for a person by LinkedIn URL.
 * POST /v2/enrichment/phone  — NOTE: US contacts only.
 * Returns null when the person has no phone on record.
 */
export async function blitzPhone(
  apiKey: string,
  personLinkedinUrl: string
): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/v2/enrichment/phone`, {
    method: 'POST',
    headers: blitzHeaders(apiKey),
    body: JSON.stringify({ person_linkedin_url: personLinkedinUrl }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await assertOk(res);
  const data = (await res.json()) as BlitzPhoneResponse;
  return data.found && data.phone ? data.phone : null;
}

// ---------------------------------------------------------------------------
// Pure mapper
// ---------------------------------------------------------------------------

/**
 * Map a BlitzAPI person + company pair to a new lead row ready for insertion.
 * Pure — no I/O.
 *
 * `role` is taken from the first experience where `job_is_current === true`;
 * falls back to null when no current experience or job_title is empty.
 */
export function mapBlitzPerson(p: BlitzPerson, c: BlitzCompany): NewLeadRow {
  const currentExp = p.experiences.find((e) => e.job_is_current) ?? null;
  const role = currentExp?.job_title?.trim() || null;

  return {
    ai_ark_id: null,
    needle_lead_id: null,
    name: p.full_name,
    role,
    company: c.name,
    company_domain: c.domain ?? null,
    company_size: c.employees_on_linkedin ?? null,
    region: p.location?.city ?? c.hq?.city ?? null,
    email: null,
    phone: null,
    cached_brief: null,
    profile_url: p.linkedin_url ?? null,
    source: 'blitz',
    fit_score: 0,
    interest_score: 0,
    priority: 'low',
    priority_reason: '',
    fit_status: 'unknown',
    need_status: 'unknown',
    willingness: 'unknown',
    status: 'new',
    owner: null,
    last_alert_at: null,
    origin: 'blitz',
    origin_detail: null,
    is_test: false,
    company_key: companyKey(c.domain, c.name),
    sortout_status: null,
    sortout_synced_needle: false,
    sortout_until: null,
    phone_source: null,
    phone_dnc: false,
    call_card: null,
    phone_lookup_at: null,
    reply_signal: null,
    reply_quote: null,
    reply_reason: null,
    reply_at: null,
    needle_synced_at: null,
    engagement_stage: null,
    engagement_at: null,
    icp_status: null,
    icp_status_at: null,
    needle_enrolled_at: null,
    needle_enroll_pending: false,
  };
}
