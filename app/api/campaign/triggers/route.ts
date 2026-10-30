/**
 * POST /api/campaign/triggers  — bulk upsert trigger catalog entries
 * GET  /api/campaign/triggers  — read all trigger catalog entries for the active campaign
 */

import { getDb } from '@/lib/db';
import {
  toTriggerCatalogEntry,
  toInsertTriggerCatalogEntry,
  type TriggerCatalogRow,
  type CampaignRow,
} from '@/lib/mappers';
import type { TriggerCatalogEntry } from '@/lib/types';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export async function GET() {
  try {
    const db = getDb();

    // Get active campaign
    const { data: campaignData } = await db
      .from('campaign')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!campaignData) {
      return Response.json({ entries: [] });
    }

    const campaignId = (campaignData as CampaignRow).id;

    const { data, error } = await db
      .from('trigger_catalog')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('tier', { ascending: true });

    if (error) {
      return err('Trigger-Katalog konnte nicht geladen werden. Bitte Seite neu laden.');
    }

    return Response.json({
      entries: (data as TriggerCatalogRow[]).map(toTriggerCatalogEntry),
    });
  } catch (e) {
    console.error('[triggers GET]', e);
    return err('Trigger-Katalog konnte nicht geladen werden.', 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { entries: TriggerCatalogEntry[] };

    if (!Array.isArray(body.entries)) {
      return err('Ungültige Eingabe. Bitte Seite neu laden und erneut versuchen.');
    }

    const db = getDb();

    // Upsert each entry — insert if new (no id), update if id present
    const saved: TriggerCatalogEntry[] = [];

    for (const entry of body.entries) {
      const row = toInsertTriggerCatalogEntry({
        campaignId: entry.campaignId,
        name: entry.name,
        buyingReason: entry.buyingReason,
        tier: entry.tier,
        windowDays: entry.windowDays,
        requiredEvidence: entry.requiredEvidence,
        approved: entry.approved,
      });

      if (entry.id) {
        // Update existing
        const { data, error } = await db
          .from('trigger_catalog')
          .update(row)
          .eq('id', entry.id)
          .select('*')
          .single();
        if (!error && data) {
          saved.push(toTriggerCatalogEntry(data as TriggerCatalogRow));
        }
      } else {
        // Insert new
        const { data, error } = await db
          .from('trigger_catalog')
          .insert(row)
          .select('*')
          .single();
        if (!error && data) {
          saved.push(toTriggerCatalogEntry(data as TriggerCatalogRow));
        }
      }
    }

    return Response.json({ entries: saved });
  } catch (e) {
    console.error('[triggers POST]', e);
    return err('Trigger-Katalog konnte nicht gespeichert werden. Bitte erneut versuchen.', 500);
  }
}
