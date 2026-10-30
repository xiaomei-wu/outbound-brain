/**
 * POST /api/events  — ingest a signal event for a lead.
 *
 * Validates the webhook secret for non-test events.
 * Deduplicates on leadId:type:YYYY-MM-DD.
 * Calls runSignalPipeline() after insert.
 */

import { after } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';
import { toLeadEvent, type LeadEventRow } from '@/lib/mappers';
import type { EventType } from '@/lib/types';
import { env } from '@/lib/env';
import { runSignalPipeline } from '@/lib/agents/pipeline';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

const VALID_EVENT_TYPES: EventType[] = [
  'meeting_request',
  'positive_reply',
  'not_now',
  'opt_out',
  'new_trigger',
  'open',
  'click',
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      leadId?: string;
      type?: string;
      evidence?: string;
      isTest?: boolean;
    };

    const { leadId, type, evidence, isTest = false } = body;

    if (!leadId) return err('leadId fehlt. Bitte Lead auswählen und erneut versuchen.');
    if (!type || !VALID_EVENT_TYPES.includes(type as EventType)) {
      return err(`Unbekannter Event-Typ: ${type ?? '(leer)'}. Gültige Typen: ${VALID_EVENT_TYPES.join(', ')}.`);
    }

    // If x-webhook-secret header is present it must match — timing-safe comparison.
    // Requests without the header are already gated by the proxy (cookie auth).
    // isTest is stored as a data flag only; it no longer bypasses auth.
    const headerSecret = request.headers.get('x-webhook-secret');
    if (headerSecret !== null) {
      const expected = env.EVENTS_WEBHOOK_SECRET();
      const headerBuf = Buffer.from(headerSecret, 'utf8');
      const expectedBuf = Buffer.from(expected, 'utf8');
      let valid = false;
      if (headerBuf.length === expectedBuf.length) {
        try {
          valid = timingSafeEqual(headerBuf, expectedBuf);
        } catch {
          valid = false;
        }
      }
      if (!valid) {
        return err('Ungültiger Webhook-Schlüssel. Bitte x-webhook-secret Header prüfen.', 401);
      }
    }

    const db = getDb();

    // Verify lead exists
    const { data: leadExists } = await db
      .from('lead')
      .select('id')
      .eq('id', leadId)
      .single();
    if (!leadExists) {
      return err('Lead nicht gefunden. Bitte ID prüfen.', 404);
    }

    // Deduplication key: leadId:type:YYYY-MM-DD
    const today = new Date().toISOString().slice(0, 10);
    const dedupeKey = `${leadId}:${type}:${today}`;

    // Check for duplicate
    const { data: existing } = await db
      .from('lead_event')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .single();

    if (existing) {
      const { data: existingEvent } = await db
        .from('lead_event')
        .select('*')
        .eq('dedupe_key', dedupeKey)
        .single();
      return Response.json({
        event: toLeadEvent(existingEvent as LeadEventRow),
        isNew: false,
      });
    }

    // Insert new event
    const { data: eventData, error: eventErr } = await db
      .from('lead_event')
      .insert({
        lead_id: leadId,
        type,
        occurred_at: new Date().toISOString(),
        evidence: evidence ?? null,
        is_test: isTest,
        dedupe_key: dedupeKey,
      })
      .select('*')
      .single();

    if (eventErr || !eventData) {
      console.error('[events POST]', eventErr);
      return err('Ereignis konnte nicht gespeichert werden. Bitte erneut versuchen.', 500);
    }

    const event = toLeadEvent(eventData as LeadEventRow);

    // Fire signal pipeline asynchronously (don't await — respond fast)
    after(() => runSignalPipeline(event.id).catch((e: unknown) => {
      console.error('[events] pipeline error:', e);
    }));

    return Response.json({ event, isNew: true });
  } catch (e) {
    console.error('[events POST]', e);
    return err('Ereignis konnte nicht verarbeitet werden. Bitte erneut versuchen.', 500);
  }
}
