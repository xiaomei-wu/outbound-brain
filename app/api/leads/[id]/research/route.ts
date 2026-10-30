// POST /api/leads/[id]/research (v2)
// Reads lead + chat context from DB, reads active campaign + trigger catalog.
// Calls researchTriggers() with chat context. Inserts findings into lead_trigger
// with v2 columns (evidenceKind, isActive). Then refreshes priority.

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { researchTriggers } from '@/lib/claude/research';
import { refreshLeadPriority } from '@/lib/priority';
import {
  toCampaign,
  toTriggerCatalogEntry,
  toLeadContext,
  toLeadTrigger,
} from '@/lib/mappers';
import type {
  CampaignRow,
  TriggerCatalogRow,
  LeadContextRow,
  LeadTriggerRow,
} from '@/lib/mappers';


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
            'Keine aktive Kampagne gefunden. Bitte zuerst eine Kampagne auf der Setup-Seite anlegen.',
        },
        { status: 400 },
      );
    }

    const campaign = toCampaign(campaignRow as CampaignRow);

    // Read approved trigger catalog
    const { data: catalogRows } = await db
      .from('trigger_catalog')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('approved', true);

    const catalog = (catalogRows ?? []).map((r) =>
      toTriggerCatalogEntry(r as TriggerCatalogRow),
    );

    // Read lead_context (v2: chats for research)
    const { data: contextRows } = await db
      .from('lead_context')
      .select('*')
      .eq('lead_id', id)
      .order('occurred_at', { ascending: true });

    const chatContext = (contextRows ?? []).map((r) =>
      toLeadContext(r as LeadContextRow),
    );

    // Research triggers via Claude (v2: includes chat context)
    const result = await researchTriggers(
      {
        name: leadRow.name,
        role: leadRow.role,
        company: leadRow.company,
        companyDomain: leadRow.company_domain,
      },
      catalog,
      campaign,
      chatContext,
    );

    // Insert lead_trigger rows with v2 columns
    const insertedTriggers = [];

    for (const f of result.findings) {
      const { error: insertErr, data: inserted } = await db
        .from('lead_trigger')
        .insert({
          lead_id: id,
          trigger_type_id: f.triggerTypeId,
          type: f.summary.slice(0, 50),
          content: f.summary,
          source_url:
            f.evidenceKind === 'public' ? f.sourceUrl : '',
          found_at: f.eventDate,
          is_assumption: false,
          verdict: f.verdict,
          offer_relevance: f.offerRelevance,
          person_relevance: f.personRelevance,
          evidence_kind: f.evidenceKind,
          is_active: f.isActive,
        })
        .select()
        .single();

      if (!insertErr && inserted) {
        insertedTriggers.push(
          toLeadTrigger(inserted as LeadTriggerRow),
        );
      }
    }

    // Update lead status
    await db
      .from('lead')
      .update({ status: 'researched' })
      .eq('id', id);

    // Refresh priority (v2)
    const priority = await refreshLeadPriority(id);

    return NextResponse.json({
      triggers: insertedTriggers,
      priority,
      tokenUsage: result.tokenUsage,
    });
  } catch (err) {
    console.error('Research route error:', err);
    return NextResponse.json(
      {
        error:
          'Die Recherche ist fehlgeschlagen. Bitte erneut versuchen.',
      },
      { status: 500 },
    );
  }
}
