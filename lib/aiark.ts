/**
 * AI Ark REST client.
 * Base URL: https://api.ai-ark.com/api/developer-portal
 * Auth header: X-TOKEN
 *
 * API reference (verified against live docs 2026-10-30):
 *   https://docs.ai-ark.com/docs/ai-agents.md
 *   https://docs.ai-ark.com/reference/people-preview.md
 *   https://docs.ai-ark.com/reference/people-search-1.md
 *   https://docs.ai-ark.com/reference/people-export-single.md
 *   https://docs.ai-ark.com/reference/fetch-credit.md
 *
 * Key corrections vs. original code:
 *   - preview/search body uses { page, size, account?, contact?, lists? } not { filters }
 *   - search response uses content[] not leads[]/results[]
 *   - preview response uses totalElements not count/total
 *   - exportEmail response uses email.output[0].address not email (string)
 *   - getCredits response field is "total" not "credits"/"balance"
 */

const BASE_URL = 'https://api.ai-ark.com/api/developer-portal';

// ---------------------------------------------------------------------------
// Filter types (documented account/contact/lists structure)
// ---------------------------------------------------------------------------

export interface AiArkFilters {
  /** Company-level filters. Keys: employeeSize, geoLocation, name, industries, … */
  account?: Record<string, unknown>;
  /** Person-level filters. Keys: seniority, departmentAndFunction, fullName, … */
  contact?: Record<string, unknown>;
  /** Exclusion lists, e.g. { people_id: { exclude: ['<id>'] } } */
  lists?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Response shape for content[] items (search / preview)
// ---------------------------------------------------------------------------

/** A raw lead shape as returned by AI Ark search/preview content[] items.
 *  Fields are nested objects — NOT the old flat names (first_name, company_name, etc.).
 *  Emails and phone numbers are NOT returned by search/preview — only by export.
 */
export interface RawAiArkLead {
  id: string;
  identifier?: string;
  last_updated?: string;
  profile?: {
    first_name?: string;
    last_name?: string;
    /** Present in export response; masked or absent in search/preview. */
    full_name?: string;
    title?: string;
    headline?: string;
  };
  company?: {
    summary?: {
      name?: string;
      description?: string;
      /** Employee count. */
      staff?: number;
    };
    link?: {
      linkedin?: string;
    };
    location?: {
      headquarter?: {
        country?: string;
        city?: string;
      };
    };
  };
  location?: {
    country?: string;
    city?: string;
    default?: string;
    short?: string;
  };
  link?: {
    linkedin?: string;
  };
  /** Availability flag — actual phone not returned by search/preview. */
  has_mobile?: boolean;
}

function headers(apiKey: string): Record<string, string> {
  return {
    'X-TOKEN': apiKey,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// preview — POST /v1/people/preview
// ---------------------------------------------------------------------------

/**
 * Preview: returns the estimated total count of leads matching the filters.
 * Cost: 1 credit per page (flat). Uses page=0, size=1 to keep cost minimal.
 * Count comes from response.totalElements.
 */
export async function preview(
  filters: AiArkFilters,
  apiKey: string
): Promise<{ count: number }> {
  const res = await fetch(`${BASE_URL}/v1/people/preview`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ page: 0, size: 1, ...filters }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI Ark preview failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { totalElements?: number; content?: unknown[] };
  return { count: data.totalElements ?? data.content?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// search — POST /v1/people
// ---------------------------------------------------------------------------

/**
 * Search: returns up to `size` leads matching the filters.
 * Cost: 0.5 credits per result returned.
 * Response items are in content[]; emails and phones are NOT included.
 */
export async function search(
  filters: AiArkFilters,
  size: number,
  apiKey: string
): Promise<RawAiArkLead[]> {
  const res = await fetch(`${BASE_URL}/v1/people`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ page: 0, size, ...filters }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI Ark search failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { content?: RawAiArkLead[] };
  return data.content ?? [];
}

// ---------------------------------------------------------------------------
// exportEmail — POST /v1/people/export/single
// ---------------------------------------------------------------------------

/**
 * Export email: returns the email address for an AI Ark lead ID.
 * Cost: 0.5 credits per person (charged even if no email found) +
 *       0.5 credits per verified email returned.
 * Response: { email: { state, output: [{ address, status, … }] } }
 */
export async function exportEmail(
  aiArkId: string,
  apiKey: string
): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/v1/people/export/single`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ id: aiArkId }),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`[aiark] exportEmail failed (${res.status}) for ${aiArkId}`);
    return null;
  }
  const data = (await res.json()) as {
    email?: { state?: string; output?: Array<{ address?: string }> };
  };
  // Verified email is in email.output[0].address
  return data.email?.output?.[0]?.address ?? null;
}

// ---------------------------------------------------------------------------
// getCredits — GET /v1/payments/credits
// ---------------------------------------------------------------------------

/**
 * Credits: returns the remaining credit balance. Free to call.
 * Response field is "total" (not "credits" or "balance").
 */
export async function getCredits(apiKey: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/v1/payments/credits`, {
    headers: headers(apiKey),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI Ark credits check failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { total?: number };
  return data.total ?? 0;
}
