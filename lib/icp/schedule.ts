/**
 * ICP check scheduling — loads leads, selects unchecked companies (cap 10),
 * runs checks sequentially, writes priority/fit_status/call_card/lead_trigger.
 *
 * Does NOT call refreshLeadPriority — sets ICP-derived priority directly,
 * because refreshLeadPriority computes from trigger types that don't match
 * ICP fit signals (it looks for 'Geaeusserter Bedarf' etc.).
 */

import { replyEffect } from '@/lib/reply-routing';
import { getDb } from '@/lib/db';
import { toLead, toCampaign, toTriggerCatalogEntry } from '@/lib/mappers';
import type { CampaignRow, LeadRow, TriggerCatalogRow } from '@/lib/mappers';
import type { Campaign, CompanyCheck, Lead, TriggerCatalogEntry } from '@/lib/types';
import { getOrRunCompanyCheck } from '@/lib/claude/icp-check';
import { generateCallCard } from '@/lib/claude/call-card';
import { icpNeedleProperties, pushToNeedle } from '@/lib/needle-writeback';
import { autoRefill } from '@/lib/refill-run';
import { routeForScore, roleMatches, selectCompaniesToCheck } from './routing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Match a fit signal text against trigger catalog entries by keyword overlap. */
function matchTriggerCatalog(
  signalText: string,
  catalog: TriggerCatalogEntry[],
): string | null {
  const lower = signalText.toLowerCase();
  for (const entry of catalog) {
    // Check if any word from the catalog name or buying_reason appears in the signal
    const keywords = `${entry.name} ${entry.buyingReason}`.toLowerCase().split(/\s+/);
    const meaningfulKeywords = keywords.filter((w) => w.length >= 4);
    const matchCount = meaningfulKeywords.filter((kw) => lower.includes(kw)).length;
    if (matchCount >= 2 || (meaningfulKeywords.length === 1 && matchCount === 1)) {
      return entry.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// scheduleIcpChecks — called from route handlers via after()
// ---------------------------------------------------------------------------

const CHECK_CONCURRENCY = 3;

export async function scheduleIcpChecks(leadIds: string[]): Promise<number> {
  const db = getDb();

  // Load leads
  const { data: leadRows } = await db
    .from('lead')
    .select('*')
    .in('id', leadIds);
  if (!leadRows || leadRows.length === 0) return 0;

  const leads = leadRows.map((r) => toLead(r as LeadRow));

  // Load active campaign
  const { data: campaignRow } = await db
    .from('campaign')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!campaignRow) return 0;
  const campaign = toCampaign(campaignRow as CampaignRow);

  // Load trigger catalog for keyword matching
  const { data: catalogRows } = await db
    .from('trigger_catalog')
    .select('*')
    .eq('campaign_id', campaign.id)
    .eq('approved', true);
  const catalog = (catalogRows ?? []).map((r) =>
    toTriggerCatalogEntry(r as TriggerCatalogRow),
  );

  // Find which companies already have a check
  const companyKeys = leads
    .map((l) => l.companyKey)
    .filter((k): k is string => k !== null);

  const { data: existingChecks } = await db
    .from('company_check')
    .select('company_key')
    .in('company_key', companyKeys.length > 0 ? companyKeys : ['__none__']);

  const alreadyChecked = new Set(
    (existingChecks ?? []).map((r: { company_key: string }) => r.company_key),
  );

  // Select companies to check (max 10)
  const toCheck = selectCompaniesToCheck(leads, alreadyChecked, 10);

  // Visible progress: queued → running → cleared after the Needle write-back (or failed)
  const idsFor = (key: string) => leads.filter((l) => l.companyKey === key).map((l) => l.id);
  const setStatus = (ids: string[], status: 'queued' | 'running' | 'failed' | null) =>
    db.from('lead').update({ icp_status: status, icp_status_at: new Date().toISOString() }).in('id', ids);
  await setStatus(toCheck.flatMap(idsFor), 'queued');

  // Run checks CHECK_CONCURRENCY at a time: ~60 s each, and 10 sequential checks
  // would exceed Vercel's 300 s function limit (after() shares it)
  async function checkCompany(key: string) {
    const companyLeads = leads.filter((l) => l.companyKey === key);
    const representative = companyLeads[0];
    if (!representative) return;

    const ids = companyLeads.map((l) => l.id);
    await setStatus(ids, 'running');
    try {
      const check = await getOrRunCompanyCheck(representative, campaign);
      await applyCheckToLeads(companyLeads, check, campaign, catalog, db);
      await setStatus(ids, null);
    } catch (err) {
      console.error(`ICP check failed for ${key}:`, err);
      await setStatus(ids, 'failed');
      // Continue with next company
    }
  }

  for (let i = 0; i < toCheck.length; i += CHECK_CONCURRENCY) {
    await Promise.all(toCheck.slice(i, i + CHECK_CONCURRENCY).map(checkCompany));
  }

  // Newly checked A/B leads may refill a low call queue (automatic only while the campaign sends nothing)
  if (toCheck.length > 0) {
    try {
      await autoRefill({ allowFind: false });
    } catch (err) {
      console.error('[schedule] refill failed', err instanceof Error ? err.message : err);
    }
  }

  return toCheck.length;
}

// ---------------------------------------------------------------------------
// applyCheckToLeads — write priority, call card, and lead_trigger rows
// ---------------------------------------------------------------------------

async function applyCheckToLeads(
  leads: Lead[],
  check: CompanyCheck,
  campaign: Campaign,
  catalog: TriggerCatalogEntry[],
  db: ReturnType<typeof getDb>,
): Promise<void> {
  const route = routeForScore(check.score);

  for (const lead of leads) {
    // Determine suggested sort-out adjustments for role mismatch
    const suggested = [...route.suggested];
    if (
      (check.score === 'A' || check.score === 'B') &&
      !roleMatches(lead.role, campaign.icpRoles)
    ) {
      if (!suggested.includes('wrong_contact')) {
        suggested.push('wrong_contact');
      }
    }

    // Generate call card for A/B
    let callCard = null;
    if (check.score === 'A' || check.score === 'B') {
      try {
        callCard = await generateCallCard(lead, check, campaign);
      } catch (err) {
        console.error(`Call card failed for lead ${lead.id}:`, err);
      }
    }

    // Update lead with ICP-derived priority
    const { error: updateErr } = await db
      .from('lead')
      .update({
        // A written reply outranks the ICP score (see lib/needle-replies.ts)
        ...(lead.replySignal && replyEffect(lead.replySignal).priority
          ? {}
          : { priority: route.priority, priority_reason: check.decisionReason }),
        fit_status: route.fitStatus,
        call_card: callCard,
      })
      .eq('id', lead.id);

    if (updateErr) {
      console.error(`Lead update failed for ${lead.id}:`, updateErr);
    }

    // Loop back to Needle: the campaign branches on these properties
    if (lead.needleLeadId) {
      await pushToNeedle(
        lead.id,
        lead.needleLeadId,
        icpNeedleProperties(check, roleMatches(lead.role, campaign.icpRoles), new Date()),
      );
    }

    // Replace earlier ICP signals that have no call feedback yet (feedback feeds the learning loop)
    await db
      .from('lead_trigger')
      .delete()
      .eq('lead_id', lead.id)
      .eq('evidence_kind', 'public')
      .eq('verdict', 'usable')
      .eq('offer_relevance', 0)
      .eq('person_relevance', 0)
      .is('feedback', null);

    // Write lead_trigger rows (one per fit signal)
    for (const signal of check.fitSignals) {
      const triggerTypeId = matchTriggerCatalog(signal.text, catalog);

      const { error: triggerErr } = await db.from('lead_trigger').insert({
        lead_id: lead.id,
        trigger_type_id: triggerTypeId,
        type: signal.text,
        content: signal.text,
        source_url: signal.url,
        found_at: new Date().toISOString().slice(0, 10),
        is_assumption: false,
        verdict: 'usable',
        offer_relevance: 0,
        person_relevance: 0,
        evidence_kind: 'public',
        is_active: true,
        feedback: null,
        feedback_evidence: null,
      });

      if (triggerErr) {
        console.error(`lead_trigger insert failed for lead ${lead.id}:`, triggerErr);
      }
    }
  }
}
