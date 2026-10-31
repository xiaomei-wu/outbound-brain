/**
 * "Neue Leads über Needle": Needle searches LinkedIn (team account), the new people are created
 * as Needle leads and imported here, and wait for their ICP check (needle_enroll_pending).
 * After the check, enrollPendingChecked() enrolls the A/B ones in the campaign, so the campaign
 * routes them with the ICP properties already set.
 */

import { getDb } from '@/lib/db';
import { createNeedleLeads, getLinkedinProfile, resolveConnectedAccountId, searchLinkedinPeople } from '@/lib/needle';
import { currentJob, GERMANY_LOCATION_ID, nextSearchState, parseHeadline, SEARCH_KEYWORDS, type SearchState } from '@/lib/needle-search';
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

export async function runNeedleSearch(): Promise<NeedleSearchResult> {
  const db = getDb();
  const { data: c } = await db.from('campaign').select('id, needle_campaign_id, needle_search_state').eq('is_active', true).limit(1).single();
  const campaign = c as { id: string; needle_campaign_id: string | null; needle_search_state: SearchState | null } | null;
  if (!campaign?.needle_campaign_id) throw new Error('Bitte zuerst auf der Setup-Seite eine Needle-Kampagne wählen.');
  const account = await resolveConnectedAccountId();
  if (!account) throw new Error('Kein LinkedIn-Konto in Needle gefunden.');

  const state = campaign.needle_search_state ?? { keywordIndex: 0, cursor: null };
  const keyword = SEARCH_KEYWORDS[state.keywordIndex % SEARCH_KEYWORDS.length];
  const { hits, cursor, remainingToday } = await searchLinkedinPeople(account, {
    keywords: keyword,
    locations: [GERMANY_LOCATION_ID],
    cursor: state.cursor,
    limit: PAGE_SIZE,
  });
  await db.from('campaign').update({ needle_search_state: nextSearchState(state, cursor) }).eq('id', campaign.id);

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
        origin_detail: `Needle-Suche „${keyword}“`,
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
  };
}
