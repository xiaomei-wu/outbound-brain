/**
 * Small server helper to load a cached company check from the DB.
 * Used by the lead detail page and the unified find route.
 */

import { getDb } from '@/lib/db';
import { toCompanyCheck, type CompanyCheckRow } from '@/lib/mappers';
import type { CompanyCheck } from '@/lib/types';

/**
 * Fetches the company_check row for a given company key, or null if not yet checked.
 * Never throws — returns null on any DB error.
 */
export async function getCompanyCheck(
  companyKey: string | null
): Promise<CompanyCheck | null> {
  if (!companyKey) return null;
  try {
    const db = getDb();
    const { data } = await db
      .from('company_check')
      .select('*')
      .eq('company_key', companyKey)
      .maybeSingle();
    if (!data) return null;
    return toCompanyCheck(data as CompanyCheckRow);
  } catch {
    return null;
  }
}
