/**
 * Needle campaign lead sync: map + upsert campaign leads into the DB.
 *
 * Pure helper: mapCampaignLead (testable without DB).
 * Stateful helper: syncNeedleCampaign (reads active campaign, pages Needle, inserts new leads).
 */

import { getDb } from '@/lib/db';
import { companyKey } from '@/lib/origin';
import { listCampaignLeads, type NeedleCampaignLead } from '@/lib/needle';
import type { LeadRow, CampaignRow } from '@/lib/mappers';

type NewLeadRow = Omit<LeadRow, 'id' | 'created_at'>;

/**
 * Maps a Needle campaign lead to a DB insert row.
 * Pure — no side effects.
 */
export function mapCampaignLead(l: NeedleCampaignLead, campaignName: string): NewLeadRow {
  const firstName = l.firstName?.trim() ?? null;
  const lastName = l.lastName?.trim() ?? null;
  const name =
    firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(' ')
      : `Unbekannt (${l.companyName ?? 'Unbekannt'})`;

  return {
    name,
    role: l.jobTitle ?? null,
    company: l.companyName ?? null,
    company_domain: l.companyDomain ?? null,
    company_key: companyKey(l.companyDomain ?? null, l.companyName ?? null),
    needle_lead_id: l.leadId,
    ai_ark_id: null,
    email: l.email ?? null,
    phone: null,
    cached_brief: null,
    profile_url: null,
    source: 'needle',
    fit_score: 0,
    interest_score: 0,
    priority: 'low',
    priority_reason: 'Neu aus Needle-Kampagne – Priorität wird berechnet.',
    fit_status: 'unknown',
    need_status: 'unknown',
    willingness: 'open',
    status: 'new',
    company_size: null,
    region: null,
    owner: null,
    last_alert_at: null,
    origin: 'needle_campaign',
    origin_detail: campaignName,
    is_test: false,
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
  };
}

/**
 * Fetches all leads from the active campaign's Needle campaign, upserts new ones.
 * Pages until there are no more leads or 500 have been fetched.
 *
 * Throws 'NO_CAMPAIGN_CHOSEN' when the active campaign has no needle_campaign_id set.
 */
export async function syncNeedleCampaign(): Promise<{
  fetched: number;
  created: number;
  newLeadIds: string[];
}> {
  const db = getDb();

  // Load active campaign's needle campaign binding
  const { data: campaignData } = await db
    .from('campaign')
    .select('needle_campaign_id, needle_campaign_name')
    .eq('is_active', true)
    .limit(1)
    .single();

  const campaign = campaignData as Pick<
    CampaignRow,
    'needle_campaign_id' | 'needle_campaign_name'
  > | null;

  if (!campaign?.needle_campaign_id) {
    throw new Error('NO_CAMPAIGN_CHOSEN');
  }

  const campaignId = campaign.needle_campaign_id;
  const campaignName = campaign.needle_campaign_name ?? campaignId;

  // Collect non-exited leads from Needle (max 500 total)
  const MAX_LEADS = 500;
  const candidateRows: NewLeadRow[] = [];
  let totalFetched = 0;
  let cursor: string | undefined;

  while (totalFetched < MAX_LEADS) {
    const { leads, nextCursor } = await listCampaignLeads(campaignId, cursor);

    totalFetched += leads.length;

    for (const lead of leads) {
      if (lead.status === 'exited') continue;
      candidateRows.push(mapCampaignLead(lead, campaignName));
    }

    if (!nextCursor || totalFetched >= MAX_LEADS) break;
    cursor = nextCursor;
  }

  if (candidateRows.length === 0) {
    return { fetched: totalFetched, created: 0, newLeadIds: [] };
  }

  // Find which needle_lead_ids already exist to avoid duplicates
  const needleIds = candidateRows
    .map((r) => r.needle_lead_id)
    .filter((id): id is string => id !== null);

  const { data: existingRows } = await db
    .from('lead')
    .select('needle_lead_id')
    .in('needle_lead_id', needleIds);

  const existingIds = new Set(
    (existingRows ?? []).map((r: { needle_lead_id: string | null }) => r.needle_lead_id)
  );

  // Insert only new leads
  const newRows = candidateRows.filter(
    (r) => r.needle_lead_id !== null && !existingIds.has(r.needle_lead_id)
  );

  if (newRows.length === 0) {
    return { fetched: totalFetched, created: 0, newLeadIds: [] };
  }

  const { data: inserted, error } = await db.from('lead').insert(newRows).select('id');

  if (error) {
    console.error('[sync-needle] batch insert error:', error);
    throw new Error(`Lead-Import fehlgeschlagen: ${error.message}`);
  }

  const newLeadIds = (inserted ?? []).map((r: { id: string }) => r.id);

  return { fetched: totalFetched, created: newLeadIds.length, newLeadIds };
}
