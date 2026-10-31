/**
 * Sort-out statuses (Kein Zielkunde / Falscher Ansprechpartner / Nicht jetzt / Opt-out).
 *
 * Stores the status locally and mirrors it to Needle as a suppression when the lead
 * (or, for "Kein Zielkunde", the company) is known to Needle. Called only from an
 * explicit user action: the sort-out buttons or an "Opt-out" call outcome.
 */

import { getDb } from '@/lib/db';
import { buildSuppression, sortoutExpiry } from '@/lib/icp/routing';
import { toLead, type LeadRow } from '@/lib/mappers';
import { createSuppression } from '@/lib/needle';
import type { SortoutStatus } from '@/lib/types';

export interface SortoutResult {
  status: SortoutStatus | null;
  until: string | null;
  syncedToNeedle: boolean;
  message: string;
}

const STATUS_LABEL: Record<SortoutStatus, string> = {
  not_a_fit: 'Kein Zielkunde',
  wrong_contact: 'Falscher Ansprechpartner',
  not_now: 'Nicht jetzt',
  opt_out: 'Opt-out',
};

/** Lead pipeline status that matches a sort-out status (null = back to "new"). */
function leadStatusFor(status: SortoutStatus | null): 'stopped' | 'paused' | 'new' {
  if (status === 'not_now') return 'paused';
  return status ? 'stopped' : 'new';
}

/**
 * Applies (or, with status null, undoes locally) a sort-out status.
 * "Kein Zielkunde" applies to every lead of the same company.
 * Throws only when the lead does not exist.
 */
export async function applySortout(
  leadId: string,
  status: SortoutStatus | null,
  note: string,
): Promise<SortoutResult> {
  const db = getDb();
  const { data: row } = await db.from('lead').select('*').eq('id', leadId).single();
  if (!row) throw new Error('Lead nicht gefunden.');
  const lead = toLead(row as LeadRow);
  // The person asked not to be contacted: permanent, never overwritten or undone here
  if (lead.sortoutStatus === 'opt_out') throw new Error('Opt-out kann nicht geändert werden.');

  const now = new Date();
  const until = status ? sortoutExpiry(status, now)?.toISOString() ?? null : null;

  let syncedToNeedle = false;
  let needleFailed = false;
  const suppression = status
    ? buildSuppression(status, { needleLeadId: lead.needleLeadId, companyDomain: lead.companyDomain }, note, now)
    : null;
  if (suppression) {
    try {
      await createSuppression(suppression);
      syncedToNeedle = true;
    } catch (err) {
      console.error('[sortout] Needle suppression failed', err);
      needleFailed = true;
    }
  }

  const update = {
    sortout_status: status,
    sortout_until: until,
    sortout_synced_needle: syncedToNeedle,
    status: leadStatusFor(status),
  };
  const query = db.from('lead').update(update);
  const { error } =
    status === 'not_a_fit' && lead.companyKey
      ? await query
          .eq('company_key', lead.companyKey)
          .eq('is_test', lead.isTest)
          // keep opt-outs of colleagues; plain .neq() would also skip rows without a status
          .or('sortout_status.is.null,sortout_status.neq.opt_out')
      : await query.eq('id', leadId);
  if (error) throw new Error('Status konnte nicht gespeichert werden.');

  let message: string;
  if (!status) message = 'Status zurückgesetzt (nur lokal).';
  else if (needleFailed) message = 'Lokal gespeichert — Needle nicht erreichbar.';
  else if (syncedToNeedle) message = `${STATUS_LABEL[status]} — auch in Needle hinterlegt.`;
  else message = `${STATUS_LABEL[status]} — nur lokal gespeichert.`;

  return { status, until, syncedToNeedle, message };
}
