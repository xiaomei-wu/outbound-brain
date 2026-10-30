/**
 * POST /api/import  — search AI Ark with campaign filters, upsert leads.
 *
 * v2: sets initial priority via refreshLeadPriority after insert.
 *
 * Filter mapping: campaign ICP fields → AI Ark account/contact filter structure
 * (corrected 2026-10-30: was sending flat { roles, company_size_min, … };
 *  now sends { account: { employeeSize, geoLocation }, contact: { seniority } }).
 */

import { getDb } from '@/lib/db';
import { getCredentials } from '@/lib/connectors';
import { search, type AiArkFilters, type RawAiArkLead } from '@/lib/aiark';
import { toInsertLead, type CampaignRow } from '@/lib/mappers';
import { refreshLeadPriority } from '@/lib/priority';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

/** Build AI Ark filter body from campaign ICP fields. */
function buildCampaignFilters(campaign: CampaignRow): AiArkFilters {
  const account: Record<string, unknown> = {};
  const contact: Record<string, unknown> = {};

  // Company size → account.employeeSize (array of range objects)
  if (campaign.icp_company_size_min != null || campaign.icp_company_size_max != null) {
    account['employeeSize'] = [{
      min: campaign.icp_company_size_min ?? 1,
      max: campaign.icp_company_size_max ?? 1_000_000,
    }];
  }

  // Regions → account.geoLocation
  if (campaign.icp_regions?.length) {
    account['geoLocation'] = { include: campaign.icp_regions };
  }

  // Roles → contact.seniority (closest available filter for role/title matching)
  if (campaign.icp_roles?.length) {
    contact['seniority'] = { include: campaign.icp_roles };
  }

  return {
    ...(Object.keys(account).length ? { account } : {}),
    ...(Object.keys(contact).length ? { contact } : {}),
  };
}

/** Compute an initial fit score based on ICP match (internal numeric, not priority). */
function computeInitialFitScore(raw: RawAiArkLead, campaignRow: CampaignRow): number {
  let score = 40; // base

  // Role match — use profile.title (nested)
  const role = (raw.profile?.title ?? '').toLowerCase();
  const icpRoles = (campaignRow.icp_roles ?? []).map((r: string) => r.toLowerCase());
  const firstWord = role.split(' ')[0] ?? '';
  if (icpRoles.some((r) => role.includes(r) || (firstWord && r.includes(firstWord)))) {
    score += 20;
  }

  // Company size match — use company.summary.staff (nested)
  const size = raw.company?.summary?.staff;
  if (
    size !== undefined &&
    size !== null &&
    (campaignRow.icp_company_size_min == null || size >= campaignRow.icp_company_size_min) &&
    (campaignRow.icp_company_size_max == null || size <= campaignRow.icp_company_size_max)
  ) {
    score += 15;
  }

  // Region match — use location.country or location.default (nested)
  const region = (raw.location?.country ?? raw.location?.default ?? '').toLowerCase();
  const icpRegions = (campaignRow.icp_regions ?? []).map((r: string) => r.toLowerCase());
  if (icpRegions.length === 0 || icpRegions.some((r) => region.includes(r) || r.includes(region))) {
    score += 10;
  }

  // has_mobile flag (search/preview does not return actual phone number)
  if (raw.has_mobile) score += 5;

  return Math.min(100, score);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { filters?: AiArkFilters };

    // Get AI Ark credentials
    const creds = await getCredentials('ai_ark');
    if (!creds) {
      return err('Kein AI-Ark-Schlüssel gefunden. Bitte auf der Integrations-Seite einfügen.');
    }

    const db = getDb();

    // Load active campaign for ICP filters
    const { data: campaignData } = await db
      .from('campaign')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    const campaign = campaignData as CampaignRow | null;

    // Build search filters from campaign ICP or provided body filters
    const searchFilters: AiArkFilters = body.filters ?? (campaign
      ? buildCampaignFilters(campaign)
      : {});

    // Search AI Ark
    const rawLeads = await search(searchFilters, 20, creds.apiKey);

    if (rawLeads.length === 0) {
      return Response.json({ imported: 0, message: 'Keine Leads gefunden. Suchfilter prüfen.' });
    }

    let imported = 0;
    const importedIds: string[] = [];

    for (const raw of rawLeads) {
      if (!raw.id) continue;

      // Compute display name from nested profile fields
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
        // companyDomain not returned by search/preview — would need a separate lookup
        companyDomain: null,
        companySize: raw.company?.summary?.staff ?? null,
        region: raw.location?.country ?? raw.location?.default ?? null,
        // email/phone not returned by search/preview (only by export)
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
      });

      // Upsert on ai_ark_id to deduplicate
      const { data: existing } = await db
        .from('lead')
        .select('id')
        .eq('ai_ark_id', raw.id)
        .single();

      if (existing) {
        // Already exists — skip (don't overwrite manual edits)
        continue;
      }

      const { data: inserted, error } = await db
        .from('lead')
        .insert(insertRow)
        .select('id')
        .single();

      if (!error && inserted) {
        imported++;
        importedIds.push(inserted.id as string);
      }
    }

    // Set initial priority for newly imported leads (fire-and-forget per lead)
    for (const id of importedIds) {
      refreshLeadPriority(id).catch((e: unknown) => {
        console.error('[import] refreshLeadPriority failed for', id, e);
      });
    }

    return Response.json({ imported });
  } catch (e) {
    console.error('[import POST]', e);
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('401') || msg.includes('403') || msg.includes('X-TOKEN')) {
      return err('AI-Ark-Schlüssel ungültig. Bitte auf der Integrations-Seite prüfen.', 401);
    }
    return err('Lead-Import fehlgeschlagen. Bitte AI-Ark-Schlüssel prüfen und erneut versuchen.', 500);
  }
}
