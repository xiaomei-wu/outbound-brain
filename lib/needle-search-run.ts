/**
 * "Neue Leads über Needle": Needle searches LinkedIn (team account), the new people are created
 * as Needle leads and imported here, and wait for their ICP check (needle_enroll_pending).
 * After the check, enrollPendingChecked() enrolls the A/B ones in the campaign, so the campaign
 * routes them with the ICP properties already set.
 */

import { getDb } from '@/lib/db';
import { createNeedleLeads, getLinkedinProfile, resolveConnectedAccountId, searchLinkedinPeople } from '@/lib/needle';
import { campaignKeywords, currentJob, GERMANY_LOCATION_ID, nextSearchState, parseHeadline, SEARCH_KEYWORDS, type SearchState } from '@/lib/needle-search';
import { companyKey } from '@/lib/origin';
import { splitName } from '@/lib/refill';
import { normalizeLinkedinUrl } from '@/lib/reply-routing';

const PAGE_SIZE = 10; // LinkedIn Classic caps a page at 10

export interface NeedleSearchResult {
  found: number;
  created: number;
  skipped: number;
  newLeadIds: string[];
  remainingToday: number | null;
  keyword: string;
}

/**
 * mode "keywords": the app's real-estate search terms in turn.
 * mode "campaign": search terms from the roles of the people already in the connected campaign.
 */
export async function runNeedleSearch(mode: 'keywords' | 'campaign' = 'keywords'): Promise<NeedleSearchResult & { campaignName: string | null }> {
  const db = getDb();
  const { data: c } = await db
    .from('campaign')
    .select('id, needle_campaign_id, needle_campaign_name, needle_search_state')
    .eq('is_active', true)
    .limit(1)
    .single();
  const campaign = c as {
    id: string;
    needle_campaign_id: string | null;
    needle_campaign_name: string | null;
    needle_search_state: (SearchState & { campaign?: { keyword: string; cursor: string | null } }) | null;
  } | null;
  if (!campaign?.needle_campaign_id) throw new Error('Bitte zuerst auf der Setup-Seite eine Needle-Kampagne wählen.');
  const account = await resolveConnectedAccountId();
  if (!account) throw new Error('Kein LinkedIn-Konto in Needle gefunden.');

  const stored = campaign.needle_search_state ?? { keywordIndex: 0, cursor: null };
  let keyword: string;
  let startCursor: string | null;
  if (mode === 'campaign') {
    const { data: roleRows } = await db
      .from('lead')
      .select('role')
      .not('needle_enrolled_at', 'is', null)
      .not('role', 'is', null);
    keyword = campaignKeywords(((roleRows ?? []) as { role: string }[]).map((r) => r.role));
    // Continue the campaign search while its search words stay the same
    startCursor = stored.campaign?.keyword === keyword ? stored.campaign.cursor : null;
  } else {
    keyword = SEARCH_KEYWORDS[stored.keywordIndex % SEARCH_KEYWORDS.length];
    startCursor = stored.cursor;
  }
  const { hits, cursor, remainingToday } = await searchLinkedinPeople(account, {
    keywords: keyword,
    locations: [GERMANY_LOCATION_ID],
    cursor: startCursor,
    limit: PAGE_SIZE,
  });
  const nextState =
    mode === 'campaign'
      ? { ...stored, campaign: { keyword, cursor } }
      : { ...nextSearchState(stored, cursor), ...(stored.campaign ? { campaign: stored.campaign } : {}) };
  await db.from('campaign').update({ needle_search_state: nextState }).eq('id', campaign.id);

  // Skip people we already have (by LinkedIn identity)
  const { data: existing } = await db.from('lead').select('profile_url').not('profile_url', 'is', null);
  const known = new Set(((existing ?? []) as { profile_url: string }[]).map((r) => normalizeLinkedinUrl(r.profile_url)));
  const fresh = hits.filter((h) => h.profileUrl && !known.has(normalizeLinkedinUrl(h.profileUrl)));

  // Role and company from the current job; the headline is the fallback
  const people: { hit: (typeof fresh)[number]; role: string | null; company: string | null }[] = [];
  for (const hit of fresh) {
    let job = { role: null as string | null, company: null as string | null };
    try {
      const profile = await getLinkedinProfile(account, hit.publicIdentifier ?? hit.profileUrl!);
      job = currentJob(profile.workExperience);
    } catch (err) {
      console.error('[needle-search] profile failed', err instanceof Error ? err.message : err);
    }
    const fromHeadline = parseHeadline(hit.headline);
    const company = job.company ?? hit.companyName ?? fromHeadline.company;
    // Without a company there is nothing to check (PDF: no score on suspicion)
    if (company) people.push({ hit, role: job.role ?? hit.jobTitle ?? fromHeadline.role, company });
  }

  const created = people.length
    ? await createNeedleLeads(
        people.map(({ hit, role, company }) => {
          const { firstName, lastName } = splitName(hit.fullName ?? '');
          return {
            firstName,
            lastName,
            companyName: company!,
            ...(role ? { jobTitle: role } : {}),
            identities: { linkedin: hit.profileUrl! },
            properties: { ob_source: 'Needle-Suche (Outbound Brain)', ob_search_keyword: keyword },
            timezone: 'Europe/Berlin',
          };
        }),
      )
    : [];

  const newLeadIds: string[] = [];
  for (const [i, { hit, role, company }] of people.entries()) {
    const needleId = created[i]?.id;
    if (!needleId) continue;
    const { data, error } = await db
      .from('lead')
      .insert({
        name: hit.fullName ?? 'Unbekannt',
        role,
        company,
        company_key: companyKey(null, company),
        region: hit.location ?? null,
        profile_url: hit.profileUrl,
        needle_lead_id: needleId,
        source: 'needle',
        origin: 'needle_search',
        origin_detail: mode === 'campaign' ? `Needle-Kampagne · Suche „${keyword}“` : `Needle-Suche „${keyword}“`,
        is_test: false,
        needle_enroll_pending: true,
        needle_synced_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    // Needle matched someone we already track under this Needle id: keep the existing row
    if (!error && data) newLeadIds.push((data as { id: string }).id);
  }

  return {
    found: hits.length,
    created: newLeadIds.length,
    skipped: hits.length - newLeadIds.length,
    newLeadIds,
    remainingToday,
    keyword,
    campaignName: campaign.needle_campaign_name,
  };
}
