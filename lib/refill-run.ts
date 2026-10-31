/**
 * Refill side effects (rules in lib/refill.ts). Writes to Needle: creating leads with the ICP
 * routing properties and enrolling them in the chosen campaign. Never sends messages itself;
 * whether the campaign then contacts people is the campaign's job, which is why enrolling into
 * a sending campaign needs a click (see refillState().mode).
 */

import { getCredentials } from '@/lib/connectors';
import { getDb } from '@/lib/db';
import { roleMatches } from '@/lib/icp/routing';
import { importAiArkLeads, findBlitzLeads } from '@/lib/lead-sources';
import { toCampaign, toLead, type CampaignRow, type LeadRow } from '@/lib/mappers';
import { createNeedleLeads, enrollInCampaign, getCampaignGraph, type NeedleNewLead } from '@/lib/needle';
import { icpNeedleProperties } from '@/lib/needle-writeback';
import { campaignSends, openQueueCount, REFILL_BATCH, REFILL_THRESHOLD, selectRefillCandidates, splitName } from '@/lib/refill';
import type { CompanyCheck, IcpScore, Lead } from '@/lib/types';

/** Fetching more leads costs credits; at most once per hour automatically. */
const FIND_COOLDOWN_MS = 60 * 60_000;

export interface RefillState {
  campaignId: string | null;
  campaignName: string | null;
  mode: 'auto' | 'approval';
  open: number;
  threshold: number;
  needed: boolean;
  candidates: { id: string; name: string; company: string | null; score: string }[];
}

async function loadLeadsAndScores() {
  const db = getDb();
  const [{ data: leadRows }, { data: checkRows }] = await Promise.all([
    db.from('lead').select('*').eq('is_test', false),
    db.from('company_check').select('company_key, score, result'),
  ]);
  const leads = ((leadRows ?? []) as LeadRow[]).map(toLead);
  const checks = (checkRows ?? []) as { company_key: string; score: IcpScore; result: Omit<CompanyCheck, 'id' | 'companyKey' | 'checkedAt'> }[];
  const scores = new Map(checks.map((c) => [c.company_key, c.score]));
  const checkByKey = new Map(checks.map((c) => [c.company_key, c]));
  return { leads, scores, checkByKey };
}

/** Current refill situation; refreshes whether the campaign sends (stored for the dashboard). */
export async function refillState(refreshMode = true): Promise<RefillState> {
  const db = getDb();
  const { data: c } = await db.from('campaign').select('*').eq('is_active', true).limit(1).single();
  const campaignRow = c as (CampaignRow & { needle_sends: boolean | null }) | null;
  const campaignId = campaignRow?.needle_campaign_id ?? null;

  // Unknown mode counts as sending. Automatic enrolment always calls this with refreshMode=true,
  // so a campaign that started sending in Needle is never filled without a click.
  let sends = campaignRow?.needle_sends ?? true;
  if (campaignId && (refreshMode || campaignRow?.needle_sends == null)) {
    try {
      sends = campaignSends(await getCampaignGraph(campaignId));
      await db.from('campaign').update({ needle_sends: sends }).eq('id', campaignRow!.id);
    } catch (err) {
      console.error('[refill] campaign graph unavailable — assuming it sends', err instanceof Error ? err.message : err);
      sends = true;
    }
  }

  const { leads, scores } = await loadLeadsAndScores();
  const open = openQueueCount(leads, scores);
  const ids = selectRefillCandidates(leads, scores, REFILL_BATCH);
  const byId = new Map(leads.map((l) => [l.id, l]));
  return {
    campaignId,
    campaignName: campaignRow?.needle_campaign_name ?? null,
    mode: sends ? 'approval' : 'auto',
    open,
    threshold: REFILL_THRESHOLD,
    needed: open < REFILL_THRESHOLD,
    candidates: ids.map((id) => {
      const l = byId.get(id)!;
      return { id, name: l.name, company: l.company, score: scores.get(l.companyKey ?? '') ?? '' };
    }),
  };
}

/** Creates the leads in Needle (ICP properties set) and enrolls them in the campaign. */
export async function enrollLeads(leadIds: string[]): Promise<{ enrolled: number; skipped: number; message: string }> {
  const db = getDb();
  const { data: c } = await db.from('campaign').select('*').eq('is_active', true).limit(1).single();
  if (!c) return { enrolled: 0, skipped: leadIds.length, message: 'Keine aktive Kampagne.' };
  const campaign = toCampaign(c as CampaignRow);
  if (!campaign.needleCampaignId) return { enrolled: 0, skipped: leadIds.length, message: 'Keine Needle-Kampagne gewählt.' };

  const { leads, checkByKey } = await loadLeadsAndScores();
  const chosen = leads.filter(
    (l) =>
      leadIds.includes(l.id) &&
      !l.needleEnrolledAt &&
      (l.needleLeadId || l.profileUrl) &&
      l.companyKey &&
      checkByKey.has(l.companyKey),
  );
  if (chosen.length === 0) return { enrolled: 0, skipped: leadIds.length, message: 'Keine passenden Kandidaten.' };

  const now = new Date();
  const toNeedle = (l: Lead): NeedleNewLead => {
    const check = checkByKey.get(l.companyKey!)!;
    const { firstName, lastName } = splitName(l.name);
    return {
      firstName,
      lastName,
      ...(l.company ? { companyName: l.company } : {}),
      ...(l.companyDomain ? { companyDomain: l.companyDomain } : {}),
      ...(l.role ? { jobTitle: l.role } : {}),
      identities: { linkedin: l.profileUrl! },
      properties: icpNeedleProperties(
        { score: check.score, segments: check.result.segments ?? [], decision: check.result.decision ?? '', decisionReason: check.result.decisionReason ?? '' },
        roleMatches(l.role, campaign.icpRoles),
        now,
      ),
      timezone: 'Europe/Berlin',
    };
  };

  // Leads found by the Needle search already exist there (ICP properties set by the write-back)
  const pairs: { lead: Lead; needleId: string }[] = chosen
    .filter((l) => l.needleLeadId)
    .map((l) => ({ lead: l, needleId: l.needleLeadId! }));

  const toCreate = chosen.filter((l) => !l.needleLeadId && l.profileUrl);
  if (toCreate.length > 0) {
    const created = await createNeedleLeads(toCreate.map(toNeedle));
    const createdPairs: { lead: Lead; needleId: string }[] = [];
    created.forEach((r, i) => {
      if (r.id && toCreate[i]) createdPairs.push({ lead: toCreate[i], needleId: r.id });
    });
    // A Needle lead that is already linked to another row here is not enrolled twice
    const { data: taken } = await db.from('lead').select('needle_lead_id').in('needle_lead_id', createdPairs.map((p) => p.needleId));
    const takenIds = new Set(((taken ?? []) as { needle_lead_id: string }[]).map((t) => t.needle_lead_id));
    pairs.push(...createdPairs.filter((p) => !takenIds.has(p.needleId)));
  }
  if (pairs.length === 0) return { enrolled: 0, skipped: chosen.length, message: 'Alle Kandidaten sind schon in Needle.' };

  const { accepted, skipped } = await enrollInCampaign(campaign.needleCampaignId, pairs.map((p) => p.needleId));
  for (const { lead, needleId } of pairs) {
    await db
      .from('lead')
      .update({
        needle_lead_id: needleId,
        needle_synced_at: now.toISOString(),
        needle_enrolled_at: now.toISOString(),
        needle_enroll_pending: false,
        origin_detail: lead.originDetail ?? 'in Needle-Kampagne aufgenommen',
      })
      .eq('id', lead.id);
  }
  return {
    enrolled: accepted,
    skipped: skipped + (chosen.length - pairs.length),
    message: `${accepted} Lead${accepted === 1 ? '' : 's'} in „${campaign.needleCampaignName ?? 'Needle-Kampagne'}“ aufgenommen` + (skipped ? `, ${skipped} von Needle übersprungen (z. B. Sperrliste).` : '.'),
  };
}

/**
 * Leads found by "Neue Leads über Needle" wait for their ICP check; afterwards the A/B ones are
 * enrolled (the click was the approval) and the rest stop waiting.
 */
export async function enrollPendingChecked(): Promise<number> {
  const db = getDb();
  const { leads, scores } = await loadLeadsAndScores();
  const pending = leads.filter((l) => l.needleEnrollPending && l.companyKey && scores.has(l.companyKey));
  if (pending.length === 0) return 0;
  const ab = pending.filter((l) => ['A', 'B'].includes(scores.get(l.companyKey!) ?? '') && !l.sortoutStatus);
  const rest = pending.filter((l) => !ab.includes(l));
  if (rest.length > 0) await db.from('lead').update({ needle_enroll_pending: false }).in('id', rest.map((l) => l.id));
  if (ab.length === 0) return 0;
  const { enrolled } = await enrollLeads(ab.map((l) => l.id));
  return enrolled;
}

/**
 * Automatic refill, only while the campaign sends nothing. Enrolls checked candidates; when
 * none are left, pulls the next page from AI Ark / BlitzAPI (at most hourly). Returns new lead
 * ids that still need an ICP check.
 */
export async function autoRefill(opts: { allowFind: boolean }): Promise<{ enrolled: number; newLeadIds: string[] }> {
  const state = await refillState(true);
  if (!state.campaignId || state.mode !== 'auto' || !state.needed) return { enrolled: 0, newLeadIds: [] };

  if (state.candidates.length > 0) {
    const { enrolled } = await enrollLeads(state.candidates.map((c) => c.id));
    return { enrolled, newLeadIds: [] };
  }
  if (!opts.allowFind) return { enrolled: 0, newLeadIds: [] };

  const db = getDb();
  const { data: c } = await db.from('campaign').select('id, aiark_page, blitz_cursor, refill_find_at').eq('is_active', true).limit(1).single();
  const row = c as { id: string; aiark_page: number; blitz_cursor: string | null; refill_find_at: string | null } | null;
  if (!row || (row.refill_find_at && Date.now() - new Date(row.refill_find_at).getTime() < FIND_COOLDOWN_MS)) {
    return { enrolled: 0, newLeadIds: [] };
  }

  const newLeadIds: string[] = [];
  const update: Record<string, unknown> = { refill_find_at: new Date().toISOString() };
  const [aiArk, blitz] = await Promise.all([getCredentials('ai_ark'), getCredentials('blitz')]);
  if (aiArk?.apiKey) {
    try {
      const r = await importAiArkLeads(aiArk.apiKey, row.aiark_page);
      newLeadIds.push(...r.newLeadIds);
      update.aiark_page = row.aiark_page + 1;
    } catch (err) {
      console.error('[refill] AI Ark failed', err instanceof Error ? err.message : err);
    }
  }
  if (blitz?.apiKey) {
    try {
      const r = await findBlitzLeads(blitz.apiKey, undefined, row.blitz_cursor);
      newLeadIds.push(...r.newLeadIds);
      update.blitz_cursor = r.nextCursor;
    } catch (err) {
      console.error('[refill] BlitzAPI failed', err instanceof Error ? err.message : err);
    }
  }
  await db.from('campaign').update(update).eq('id', row.id);
  return { enrolled: 0, newLeadIds };
}
