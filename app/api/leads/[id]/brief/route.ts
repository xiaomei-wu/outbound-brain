// POST /api/leads/[id]/brief (v2)
// Reads lead + fact triggers (active, non-rejected) + chat context + BANT claims.
// Reads cached_brief first; if present, returns without calling Claude.
// Otherwise calls generateBrief(), writes cached_brief, sets status = 'briefed'.

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { generateBrief } from '@/lib/claude/brief';
import {
  toCampaign,
  toLeadTrigger,
  toLeadContext,
  toBantClaim,
} from '@/lib/mappers';
import type {
  CampaignRow,
  LeadTriggerRow,
  LeadContextRow,
  BantClaimRow,
} from '@/lib/mappers';
import type { CallBriefing } from '@/lib/types';


export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  try {
    // Read lead
    const { data: leadRow, error: leadErr } = await db
      .from('lead')
      .select('*')
      .eq('id', id)
      .single();

    if (leadErr || !leadRow) {
      return NextResponse.json(
        { error: 'Lead nicht gefunden. Pruefen Sie die ID.' },
        { status: 404 },
      );
    }

    // Check cached brief first
    if (leadRow.cached_brief) {
      const cachedBriefing = leadRow.cached_brief as CallBriefing;

      if (
        leadRow.status !== 'briefed' &&
        leadRow.status !== 'calling' &&
        leadRow.status !== 'called'
      ) {
        await db
          .from('lead')
          .update({ status: 'briefed' })
          .eq('id', id);
      }

      return NextResponse.json({
        briefing: cachedBriefing,
        cached: true,
      });
    }

    // Read active campaign
    const { data: campaignRow, error: campErr } = await db
      .from('campaign')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (campErr || !campaignRow) {
      return NextResponse.json(
        {
          error:
            'Keine aktive Kampagne gefunden. Bitte zuerst auf der Setup-Seite konfigurieren.',
        },
        { status: 400 },
      );
    }

    const campaign = toCampaign(campaignRow as CampaignRow);

    // Read fact triggers (v2: non-rejected AND active)
    const { data: triggerRows } = await db
      .from('lead_trigger')
      .select('*')
      .eq('lead_id', id)
      .neq('verdict', 'reject')
      .eq('is_active', true)
      .order('offer_relevance', { ascending: false });

    const factTriggers = (triggerRows ?? []).map((r) =>
      toLeadTrigger(r as LeadTriggerRow),
    );

    // Read lead_context (v2)
    const { data: contextRows } = await db
      .from('lead_context')
      .select('*')
      .eq('lead_id', id)
      .order('occurred_at', { ascending: true });

    const chatContext = (contextRows ?? []).map((r) =>
      toLeadContext(r as LeadContextRow),
    );

    // Read existing BANT claims (v2)
    const { data: bantRows } = await db
      .from('bant_claim')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false });

    const bantClaims = (bantRows ?? []).map((r) =>
      toBantClaim(r as BantClaimRow),
    );

    // Meeting slots
    const slotsStr = env.FIXED_MEETING_SLOTS();
    const slots = slotsStr.split(',').map((s) => s.trim());

    // Generate brief via Claude (v2)
    const result = await generateBrief(
      {
        name: leadRow.name,
        role: leadRow.role,
        company: leadRow.company,
        phone: leadRow.phone,
        email: leadRow.email,
        profileUrl: leadRow.profile_url,
      },
      factTriggers,
      campaign,
      chatContext,
      bantClaims,
      slots,
    );

    // Write cached_brief and update status
    await db
      .from('lead')
      .update({ cached_brief: result.briefing, status: 'briefed' })
      .eq('id', id);

    return NextResponse.json({
      briefing: result.briefing,
      cached: false,
      tokenUsage: result.tokenUsage,
    });
  } catch (err) {
    console.error('Brief route error:', err);
    return NextResponse.json(
      {
        error:
          'Das Briefing konnte nicht erstellt werden. Bitte erneut versuchen.',
      },
      { status: 500 },
    );
  }
}
