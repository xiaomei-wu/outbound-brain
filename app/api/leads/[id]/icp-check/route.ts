/**
 * POST /api/leads/[id]/icp-check
 * Sync ICP check for a single lead's company. Returns check + callCard.
 * ?force=1 bypasses the company_check cache.
 */

import { replyEffect } from '@/lib/reply-routing';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toLead, toCampaign, toTriggerCatalogEntry } from '@/lib/mappers';
import type { CampaignRow, LeadRow, TriggerCatalogRow } from '@/lib/mappers';
import { getOrRunCompanyCheck } from '@/lib/claude/icp-check';
import { generateCallCard } from '@/lib/claude/call-card';
import { routeForScore, roleMatches } from '@/lib/icp/routing';
import { icpNeedleProperties, pushToNeedle } from '@/lib/needle-writeback';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const db = getDb();

  // Load lead
  const { data: leadRow, error: leadErr } = await db
    .from('lead')
    .select('*')
    .eq('id', id)
    .single();

  if (leadErr || !leadRow) {
    return NextResponse.json(
      { error: 'Lead nicht gefunden.' },
      { status: 404 },
    );
  }

  const lead = toLead(leadRow as LeadRow);

  // Load active campaign
  const { data: campaignRow } = await db
    .from('campaign')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!campaignRow) {
    return NextResponse.json(
      { error: 'Keine aktive Kampagne gefunden.' },
      { status: 400 },
    );
  }

  const campaign = toCampaign(campaignRow as CampaignRow);

  const setStatus = (status: 'running' | 'failed' | null) =>
    db.from('lead').update({ icp_status: status, icp_status_at: new Date().toISOString() }).eq('id', id);
  await setStatus('running');

  try {
    // Run or retrieve the company check
    const check = await getOrRunCompanyCheck(lead, campaign, force);
    const route = routeForScore(check.score);

    // Generate call card for A/B
    let callCard = null;
    if (check.score === 'A' || check.score === 'B') {
      callCard = await generateCallCard(lead, check, campaign);
    }

    // Update lead with results
    await db
      .from('lead')
      .update({
        company_key: check.companyKey,
        // A written reply outranks the ICP score (see lib/needle-replies.ts)
        ...(lead.replySignal && replyEffect(lead.replySignal).priority
          ? {}
          : { priority: route.priority, priority_reason: check.decisionReason }),
        fit_status: route.fitStatus,
        call_card: callCard,
      })
      .eq('id', id);

    // Loop back to Needle: the campaign branches on these properties
    if (lead.needleLeadId) {
      await pushToNeedle(id, lead.needleLeadId, icpNeedleProperties(check, roleMatches(lead.role, campaign.icpRoles), new Date()));
    }

    // Write lead_trigger rows for fit signals
    const { data: catalogRows } = await db
      .from('trigger_catalog')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('approved', true);
    const catalog = (catalogRows ?? []).map((r) =>
      toTriggerCatalogEntry(r as TriggerCatalogRow),
    );

    // Delete existing ICP-derived triggers for this lead before inserting new ones
    await db
      .from('lead_trigger')
      .delete()
      .eq('lead_id', id)
      .eq('evidence_kind', 'public')
      .eq('verdict', 'usable')
      .eq('offer_relevance', 0)
      .eq('person_relevance', 0)
      .is('feedback', null);

    for (const signal of check.fitSignals) {
      // Match against trigger catalog by keyword
      let triggerTypeId: string | null = null;
      const lower = signal.text.toLowerCase();
      for (const entry of catalog) {
        const keywords = `${entry.name} ${entry.buyingReason}`
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 4);
        const matchCount = keywords.filter((kw) => lower.includes(kw)).length;
        if (matchCount >= 2 || (keywords.length === 1 && matchCount === 1)) {
          triggerTypeId = entry.id;
          break;
        }
      }

      await db.from('lead_trigger').insert({
        lead_id: id,
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
    }

    // Check role match for suggested actions
    const suggested = [...route.suggested];
    if (
      (check.score === 'A' || check.score === 'B') &&
      !roleMatches(lead.role, campaign.icpRoles)
    ) {
      if (!suggested.includes('wrong_contact')) {
        suggested.push('wrong_contact');
      }
    }

    await setStatus(null);
    return NextResponse.json({
      check,
      callCard,
      route: { ...route, suggested },
    });
  } catch (err) {
    console.error('POST /api/leads/[id]/icp-check error:', err);
    await setStatus('failed');
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'ICP-Check fehlgeschlagen. Bitte erneut versuchen.',
      },
      { status: 500 },
    );
  }
}
