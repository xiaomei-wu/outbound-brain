/**
 * Lusha API v3 client — phone lookup for German contacts.
 * Base URL: https://api.lusha.com
 * Auth header: api_key
 * All paid operations (search, enrich) are gated behind explicit user clicks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LushaPhone {
  number: string;   // E.164
  type: string;     // 'direct' | 'mobile' | 'work' | …
  doNotCall: boolean;
}

interface LushaSearchContact {
  clientReferenceId: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  companyDomain?: string;
  companyName?: string;
}

// Preference order for phone type selection.
const TYPE_PREFERENCE: Record<string, number> = {
  direct: 0,
  mobile: 1,
  work: 2,
};

const LUSHA_BASE = 'https://api.lusha.com';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Pure helpers (tested in lusha.test.ts)
// ---------------------------------------------------------------------------

/**
 * Pick the best non-DNC phone from the list.
 * Preference: direct > mobile > work > any.
 * Returns `{ allDnc: true }` if every number is DNC, or null if list is empty.
 */
export function pickPhone(
  phones: LushaPhone[],
): { number: string; type: string } | { allDnc: true } | null {
  if (phones.length === 0) return null;

  const reachable = phones.filter((p) => !p.doNotCall);

  if (reachable.length === 0) return { allDnc: true };

  // Sort by preference; unknwon types sort last
  const sorted = [...reachable].sort((a, b) => {
    const pa = TYPE_PREFERENCE[a.type] ?? 99;
    const pb = TYPE_PREFERENCE[b.type] ?? 99;
    return pa - pb;
  });

  const best = sorted[0]!;
  return { number: best.number, type: best.type };
}

/**
 * Returns a German error message for known Lusha HTTP status codes.
 */
export function lushaErrorMessage(status: number): string {
  switch (status) {
    case 402:
      return 'Lusha: keine Credits mehr.';
    case 403:
      return 'Lusha: API-Zugang (V3) nicht freigeschaltet.';
    case 429:
      return 'Lusha: zu viele Anfragen — bitte kurz warten.';
    default:
      return `Lusha: Fehler ${status} — bitte später erneut versuchen.`;
  }
}

// ---------------------------------------------------------------------------
// API client helpers
// ---------------------------------------------------------------------------

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'api_key': apiKey,
    'Content-Type': 'application/json',
  };
}

function throwOnError(status: number): never {
  throw new Error(lushaErrorMessage(status));
}

// ---------------------------------------------------------------------------
// Account usage
// ---------------------------------------------------------------------------

/** Returns the remaining credit count for the Lusha account. */
export async function lushaUsage(apiKey: string): Promise<{ remaining: number }> {
  const res = await fetch(`${LUSHA_BASE}/v3/account/usage`, {
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throwOnError(res.status);

  const body = (await res.json()) as {
    credits?: { remaining?: number };
    remaining?: number;
  };

  // Support both response shapes seen in vendor docs
  const remaining =
    body.credits?.remaining ?? body.remaining ?? 0;

  return { remaining };
}

// ---------------------------------------------------------------------------
// Step 1: Search (find a Lusha contact id)
// ---------------------------------------------------------------------------

/**
 * Search for a contact by LinkedIn URL or name + company.
 * Returns `{ id, phoneCredits }` if found, or null if not found.
 * `phoneCredits` is the number of credits required to reveal the phone, or null when
 * Lusha has no phone number for the contact (then no reveal should be offered)
 * if the vendor does not report it.
 */
export async function lushaSearch(
  apiKey: string,
  c: {
    linkedinUrl?: string;
    firstName?: string;
    lastName?: string;
    companyDomain?: string;
    companyName?: string;
  },
): Promise<{ id: string; phoneCredits: number | null } | null> {
  const contact: LushaSearchContact = { clientReferenceId: '1', ...c };

  const res = await fetch(`${LUSHA_BASE}/v3/contacts/search`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ contacts: [contact] }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throwOnError(res.status);

  // Search results come back in `results` (docs.lusha.com, verified 2026-10-31)
  const body = (await res.json()) as {
    results?: Array<{
      id?: string;
      has?: Record<string, boolean>;
      canReveal?: Array<{ field: string; credits?: number; availability?: string }>;
    }>;
  };

  const first = body.results?.[0];
  if (!first?.id) return null;

  return { id: first.id, phoneCredits: phoneRevealCost(first.canReveal) };
}

/**
 * Credits to reveal phone numbers, or null when Lusha has no phone for this contact.
 * Search answers for every known contact; only `canReveal` with field "phones"
 * (and availability not "unavailable") means a number can actually be revealed.
 */
export function phoneRevealCost(
  canReveal: Array<{ field: string; credits?: number; availability?: string }> | undefined,
): number | null {
  const phones = canReveal?.find((e) => e.field === 'phones');
  if (!phones || phones.availability === 'unavailable') return null;
  return phones.credits ?? 0;
}

// ---------------------------------------------------------------------------
// Step 2: Enrich (reveal phones), with async job polling
// ---------------------------------------------------------------------------

interface EnrichResult {
  phones: LushaPhone[];
}

async function pollJob(
  apiKey: string,
  jobId: string,
  retryAfter: number,
  deadline: number,
): Promise<EnrichResult> {
  const wait = Math.max(retryAfter * 1000, POLL_INTERVAL_MS);
  await new Promise((r) => setTimeout(r, wait));

  const elapsed = Date.now();
  if (elapsed > deadline) {
    throw new Error('Lusha liefert noch — später erneut versuchen.');
  }

  const res = await fetch(`${LUSHA_BASE}/v3/contacts/jobs/${jobId}`, {
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throwOnError(res.status);

  const body = (await res.json()) as {
    status?: string;
    retryAfter?: number;
    results?: Array<{ phones?: LushaPhone[] }>;
  };

  if (body.status === 'done' || body.results) {
    return { phones: body.results?.[0]?.phones ?? [] };
  }

  if (body.status === 'pending') {
    if (Date.now() > deadline) {
      throw new Error('Lusha liefert noch — später erneut versuchen.');
    }
    return pollJob(apiKey, jobId, body.retryAfter ?? 2, deadline);
  }

  // Unexpected status — return empty
  return { phones: [] };
}

/**
 * Reveal phone numbers for a Lusha contact id.
 * Handles synchronous response and async job polling (≤ 20 s).
 * Returns the phone list, or a pending job descriptor if the job hasn't started yet.
 */
export async function lushaRevealPhones(
  apiKey: string,
  id: string,
): Promise<LushaPhone[] | { pendingJobId: string; retryAfter: number }> {
  const res = await fetch(`${LUSHA_BASE}/v3/contacts/enrich`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ ids: [id], reveal: ['phones'], waterfallEnabled: false }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throwOnError(res.status);

  const body = (await res.json()) as {
    results?: Array<{ phones?: LushaPhone[] }>;
    job?: { id?: string; retryAfter?: number };
    jobId?: string;
    retryAfter?: number;
  };

  // Synchronous result
  if (body.results) {
    return body.results[0]?.phones ?? [];
  }

  // Async job — poll until done or 20 s elapsed
  const jobId = body.job?.id ?? body.jobId;
  const retryAfter = body.job?.retryAfter ?? body.retryAfter ?? 2;
  if (jobId) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const result = await pollJob(apiKey, jobId, retryAfter, deadline);
    return result.phones;
  }

  return [];
}

const NAME_TITLES = /^(dr|prof|dipl|ing|mag|mba|msc|mrics)\.?$/i;

/**
 * Lusha search input for a lead: the LinkedIn URL when known, otherwise first + last name
 * plus company (Lusha requires both). Academic titles are dropped. Null when neither works.
 */
export function lushaContactInput(lead: {
  name: string;
  profileUrl: string | null;
  companyDomain: string | null;
  company: string | null;
}): { linkedinUrl: string } | { firstName: string; lastName: string; companyDomain?: string; companyName?: string } | null {
  if (lead.profileUrl?.includes('linkedin.com/')) return { linkedinUrl: lead.profileUrl };
  if (!lead.companyDomain && !lead.company) return null;
  if (lead.name.startsWith('Ansprechpartner offen') || lead.name.startsWith('Unbekannt')) return null;

  const words = lead.name.split(/\s+/).filter((w) => w && !NAME_TITLES.test(w.replace(/,$/, '')));
  if (words.length < 2) return null;
  return {
    firstName: words[0],
    lastName: words.slice(1).join(' '),
    ...(lead.companyDomain ? { companyDomain: lead.companyDomain } : { companyName: lead.company! }),
  };
}
