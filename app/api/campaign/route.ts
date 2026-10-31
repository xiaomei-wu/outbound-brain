/**
 * POST  /api/campaign        — upsert the active campaign
 * GET   /api/campaign        — read the active campaign
 * PATCH /api/campaign        — set needleCampaignId + needleCampaignName on the active campaign
 *
 * v2: carries offerKnowledge and minSampleSize fields.
 */

import { getDb } from '@/lib/db';
import { toCampaign, toInsertCampaign, type CampaignRow } from '@/lib/mappers';
import type { Campaign } from '@/lib/types';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export async function GET() {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('campaign')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return Response.json({ campaign: null });
    }

    return Response.json({ campaign: toCampaign(data as CampaignRow) });
  } catch (e) {
    console.error('[campaign GET]', e);
    return err('Kampagne konnte nicht geladen werden. Bitte Seite neu laden.');
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Campaign>;

    if (!body.offer?.trim()) {
      return err('Das Angebot darf nicht leer sein. Bitte ausfüllen und erneut speichern.');
    }

    const db = getDb();

    // Deactivate all existing campaigns first (one active campaign at a time)
    await db.from('campaign').update({ is_active: false }).eq('is_active', true);

    const insert = toInsertCampaign({
      offer: body.offer.trim(),
      icpRoles: body.icpRoles ?? [],
      icpCompanySizeMin: body.icpCompanySizeMin ?? null,
      icpCompanySizeMax: body.icpCompanySizeMax ?? null,
      icpRegions: body.icpRegions ?? [],
      exclusions: body.exclusions ?? [],
      language: body.language ?? 'de',
      tone: body.tone ?? 'professional',
      offerKnowledge: body.offerKnowledge ?? '',
      minSampleSize: body.minSampleSize ?? 3,
      needleCampaignId: body.needleCampaignId ?? null,
      needleCampaignName: body.needleCampaignName ?? null,
      isActive: true,
    });

    const { data, error } = await db
      .from('campaign')
      .insert(insert)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[campaign POST]', error);
      return err('Kampagne konnte nicht gespeichert werden. Bitte erneut versuchen.');
    }

    return Response.json({ campaign: toCampaign(data as CampaignRow) });
  } catch (e) {
    console.error('[campaign POST]', e);
    return err('Kampagne konnte nicht gespeichert werden. Bitte erneut versuchen.', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      needleCampaignId?: string | null;
      needleCampaignName?: string | null;
    };

    const db = getDb();

    const { data, error } = await db
      .from('campaign')
      .update({
        needle_campaign_id: body.needleCampaignId ?? null,
        needle_campaign_name: body.needleCampaignName ?? null,
      })
      .eq('is_active', true)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[campaign PATCH]', error);
      return err('Kampagne konnte nicht aktualisiert werden. Bitte erneut versuchen.');
    }

    return Response.json({ campaign: toCampaign(data as CampaignRow) });
  } catch (e) {
    console.error('[campaign PATCH]', e);
    return err('Kampagne konnte nicht aktualisiert werden. Bitte erneut versuchen.', 500);
  }
}
