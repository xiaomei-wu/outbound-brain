/**
 * Extracted per-source lead import logic for the unified POST /api/leads/find endpoint.
 * Each function returns the new lead IDs so the caller can schedule ICP checks via after().
 * No after() calls here — that's the route's responsibility.
 */

import { getDb } from '@/lib/db';
import { blitzSearchCompanies, blitzFindEmployees, mapBlitzPerson } from '@/lib/blitz';
import { search, staffCount, type AiArkFilters, type RawAiArkLead } from '@/lib/aiark';
import { companyKey } from '@/lib/origin';
import { toInsertLead, type CampaignRow } from '@/lib/mappers';
import { refreshLeadPriority } from '@/lib/priority';

// ---------------------------------------------------------------------------
// BlitzAPI: find real-estate companies + decision-makers
// ---------------------------------------------------------------------------

const DEFAULT_COMPANIES = 5;
const PEOPLE_PER_COMPANY = 2;

export interface BlitzFindResult {
  created: number;
  skipped: number;
  newLeadIds: string[];
}

/**
 * Searches BlitzAPI for German real-estate companies and their decision-makers,
 * deduplicates by profile_url, inserts new rows.
 */
export async function findBlitzLeads(
  apiKey: string,
  companyLimit = DEFAULT_COMPANIES
): Promise<BlitzFindResult> {
  const db = getDb();
  let created = 0;
  let skipped = 0;
  const newLeadIds: string[] = [];

  const { companies } = await blitzSearchCompanies(apiKey, { maxResults: companyLimit });

  for (const company of companies) {
    if (!company.linkedin_url) { skipped++; continue; }

    let people;
    try {
      people = await blitzFindEmployees(apiKey, company.linkedin_url, PEOPLE_PER_COMPANY);
    } catch (e) {
      console.error('[lead-sources] BlitzAPI employee finder failed', e instanceof Error ? e.message : e);
      skipped++;
      continue;
    }

    for (const person of people) {
      if (!person.linkedin_url) { skipped++; continue; }

      const { data: existing } = await db
        .from('lead')
        .select('id')
        .eq('profile_url', person.linkedin_url)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const row = mapBlitzPerson(person, company);
      const { data: inserted, error } = await db
        .from('lead')
        .insert(row)
        .select('id')
        .single();

      if (!error && inserted) {
        created++;
        newLeadIds.push((inserted as { id: string }).id);
      } else {
        console.error('[lead-sources] BlitzAPI insert failed', error?.message);
        skipped++;
      }
    }
  }

  return { created, skipped, newLeadIds };
}

// ---------------------------------------------------------------------------
// AI Ark: search + upsert leads
// ---------------------------------------------------------------------------

export interface AiArkImportResult {
  imported: number;
  newLeadIds: string[];
}

/** AI Ark seniority values for the decision-makers this campaign calls. */
const AI_ARK_SENIORITY = ['founder', 'owner', 'partner', 'c_suite', 'vp', 'director', 'head'];

/**
 * AI Ark people-search filters for the real-estate campaign (schema per docs.ai-ark.com,
 * verified 2026-10-31): developers/Bauträger in Germany, decision-maker seniority.
 * Free-text ICP roles are matched as current job titles, not as seniority enum values.
 */
export function buildCampaignFilters(campaign: Pick<CampaignRow, 'icp_roles' | 'icp_company_size_min' | 'icp_company_size_max'>): AiArkFilters {
  const account: Record<string, unknown> = {
    industries: { any: { include: { mode: 'WORD', content: ['real estate', 'construction'] } } },
    keyword: {
      any: {
        include: {
          sources: [
            { mode: 'SMART', source: 'KEYWORD' },
            { mode: 'SMART', source: 'DESCRIPTION' },
          ],
          content: ['Projektentwicklung', 'Projektentwickler', 'Bauträger', 'real estate development'],
        },
      },
    },
    location: { any: { include: ['Germany'] } },
  };
  if (campaign.icp_company_size_min != null || campaign.icp_company_size_max != null) {
    account['employeeSize'] = {
      type: 'RANGE',
      range: [{ start: campaign.icp_company_size_min ?? 1, end: campaign.icp_company_size_max ?? 1_000_000 }],
    };
  }

  const contact: Record<string, unknown> = { seniority: { any: { include: AI_ARK_SENIORITY } } };
  if (campaign.icp_roles?.length) {
    contact['experience'] = {
      current: { title: { any: { include: { mode: 'SMART', content: campaign.icp_roles } } } },
    };
  }

  return { account, contact };
}

function computeInitialFitScore(raw: RawAiArkLead, campaign: CampaignRow): number {
  let score = 40;
  const role = (raw.profile?.title ?? '').toLowerCase();
  const icpRoles = (campaign.icp_roles ?? []).map((r: string) => r.toLowerCase());
  const firstWord = role.split(' ')[0] ?? '';
  if (icpRoles.some((r) => role.includes(r) || (firstWord && r.includes(firstWord)))) score += 20;

  const size = staffCount(raw);
  if (
    size != null &&
    (campaign.icp_company_size_min == null || size >= campaign.icp_company_size_min) &&
    (campaign.icp_company_size_max == null || size <= campaign.icp_company_size_max)
  ) score += 15;

  const region = (raw.location?.country ?? raw.location?.default ?? '').toLowerCase();
  const icpRegions = (campaign.icp_regions ?? []).map((r: string) => r.toLowerCase());
  if (!icpRegions.length || icpRegions.some((r) => region.includes(r) || r.includes(region))) score += 10;
  if (raw.has_mobile) score += 5;

  return Math.min(100, score);
}

/**
 * Searches AI Ark using active campaign filters, deduplicates by ai_ark_id, inserts new rows.
 * Returns the count of imported leads and their IDs.
 */
export async function importAiArkLeads(apiKey: string): Promise<AiArkImportResult> {
  const db = getDb();

  const { data: campaignData } = await db
    .from('campaign')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  const campaign = campaignData as CampaignRow | null;
  const searchFilters: AiArkFilters = campaign ? buildCampaignFilters(campaign) : {};
  const rawLeads = await search(searchFilters, 20, apiKey);

  if (rawLeads.length === 0) return { imported: 0, newLeadIds: [] };

  let imported = 0;
  const newLeadIds: string[] = [];

  for (const raw of rawLeads) {
    if (!raw.id) continue;

    const name =
      raw.profile?.full_name ??
      ([raw.profile?.first_name, raw.profile?.last_name].filter(Boolean).join(' ') || 'Unbekannt');

    const fitScore = computeInitialFitScore(raw, campaign ?? ({} as CampaignRow));

    const insertRow = toInsertLead({
      aiArkId: raw.id,
      needleLeadId: null,
      name,
      role: raw.profile?.title ?? null,
      company: raw.company?.summary?.name ?? null,
      companyDomain: null,
      companySize: staffCount(raw),
      region: raw.location?.country ?? raw.location?.default ?? null,
      email: null,
      phone: null,
      cachedBrief: null,
      profileUrl: raw.link?.linkedin ?? null,
      source: 'ai_ark',
      fitScore,
      interestScore: 0,
      priority: 'low',
      priorityReason: '',
      fitStatus: 'unknown',
      needStatus: 'unknown',
      willingness: 'unknown',
      status: 'new',
      owner: null,
      lastAlertAt: null,
      origin: 'ai_ark',
      originDetail: null,
      isTest: false,
      companyKey: companyKey(null, raw.company?.summary?.name ?? null),
      sortoutStatus: null,
      sortoutSyncedNeedle: false,
      sortoutUntil: null,
      phoneSource: null,
      phoneDnc: false,
      callCard: null,
      phoneLookupAt: null,
      replySignal: null,
      replyQuote: null,
      replyReason: null,
      replyAt: null,
      needleSyncedAt: null,
      engagementStage: null,
      engagementAt: null,
      icpStatus: null,
      icpStatusAt: null,
    });

    const { data: existing } = await db
      .from('lead')
      .select('id')
      .eq('ai_ark_id', raw.id)
      .maybeSingle();

    if (existing) continue;

    const { data: inserted, error } = await db
      .from('lead')
      .insert(insertRow)
      .select('id')
      .single();

    if (error || !inserted) {
      console.error('[lead-sources] AI Ark insert failed', error?.message);
      continue;
    }
    imported++;
    newLeadIds.push((inserted as { id: string }).id);
  }

  // Refresh priority in background (fire-and-forget)
  for (const id of newLeadIds) {
    refreshLeadPriority(id).catch((e: unknown) => {
      console.error('[lead-sources] refreshLeadPriority failed for', id, e);
    });
  }

  return { imported, newLeadIds };
}
