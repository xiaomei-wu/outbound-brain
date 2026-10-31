/**
 * Pure helpers for "Neue Leads über Needle": Needle searches LinkedIn people (team account),
 * the app derives role and company, and continues the search on the next click.
 */

/** LinkedIn location id for Germany (needleListLinkedinSearchParameters, verified 2026-10-31). */
export const GERMANY_LOCATION_ID = '101282230';

/** Searched in turn; each click continues the current one until it runs out. */
export const SEARCH_KEYWORDS = [
  'Projektentwicklung Grundstücksankauf',
  'Bauträger Projektentwicklung',
  'Grundstücksakquise Immobilien',
  'Head of Acquisition Real Estate Development',
];

export interface SearchState {
  keywordIndex: number;
  cursor: string | null;
}

export function nextSearchState(state: SearchState, cursorFromResponse: string | null): SearchState {
  if (cursorFromResponse) return { keywordIndex: state.keywordIndex, cursor: cursorFromResponse };
  return { keywordIndex: (state.keywordIndex + 1) % SEARCH_KEYWORDS.length, cursor: null };
}

const COMPANY_SEPARATOR = /\s+(?:bei|at|@)\s+/i;

/** "Leiter Projektentwicklung bei X GmbH | …" → role + company (null when none is named). */
export function parseHeadline(headline: string | null | undefined): { role: string | null; company: string | null } {
  if (!headline?.trim()) return { role: null, company: null };
  const parts = headline.split(COMPANY_SEPARATOR);
  if (parts.length < 2) return { role: headline.trim(), company: null };
  const company = parts[1].split(/\s*[|·•,]\s*/)[0].trim();
  return { role: parts[0].trim() || null, company: company || null };
}

/** Current position from a LinkedIn work history (the entry without an end date). */
export function currentJob(
  experience: { title?: string; companyName?: string; endDate?: string | null }[] | undefined,
): { role: string | null; company: string | null } {
  const job = experience?.find((e) => !e.endDate) ?? null;
  return { role: job?.title ?? null, company: job?.companyName ?? null };
}
