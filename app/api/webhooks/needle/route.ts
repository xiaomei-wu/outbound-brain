/**
 * POST /api/webhooks/needle  — Needle webhook intake.
 *
 * Verifies the Needle HMAC-SHA256 signature.
 * Maps Needle events to our EventType and calls the events logic internally.
 */

import { after } from 'next/server';
import { runSignalPipeline } from '@/lib/agents/pipeline';
import { createHmac, timingSafeEqual } from 'crypto';
import { getDb } from '@/lib/db';
import { toLeadEvent, type LeadEventRow } from '@/lib/mappers';
import type { EventType } from '@/lib/types';
import { env } from '@/lib/env';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

// Map Needle event types to our internal EventType
function mapNeedleEvent(needleEvent: string): EventType | null {
  const map: Record<string, EventType> = {
    message_reply: 'positive_reply',
    message_opened: 'open',
    link_clicked: 'click',
    meeting_booked: 'meeting_request',
    unsubscribed: 'opt_out',
    opted_out: 'opt_out',
    not_now: 'not_now',
    lead_signal: 'new_trigger',
  };
  return map[needleEvent] ?? null;
}

/** Verify Needle HMAC-SHA256 signature. */
function verifyNeedleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  // Needle sends: "sha256=<hex_digest>"
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;
  const receivedHex = signatureHeader.slice(prefix.length);
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(receivedHex, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Fail closed: if no secret is configured, refuse all requests rather than
  // processing unsigned payloads. Configure NEEDLE_WEBHOOK_SECRET to enable.
  const secret = env.NEEDLE_WEBHOOK_SECRET();
  if (!secret) {
    console.error('[needle webhook] NEEDLE_WEBHOOK_SECRET is not set — refusing request');
    return Response.json({ ok: false }, { status: 503 });
  }

  // Verify HMAC signature
  const sig = request.headers.get('x-needle-signature');
  if (!verifyNeedleSignature(rawBody, sig, secret)) {
    return err('Ungültige Needle-Signatur. Webhook-Secret prüfen.', 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return err('Ungültiges JSON im Webhook-Body.', 400);
  }

  const needleEvent = payload['event'] as string | undefined;
  const needleLeadId = payload['lead_id'] as string | undefined;
  const evidence = payload['evidence'] as string | undefined;

  if (!needleEvent) return Response.json({ ok: true, skipped: 'no event field' });

  const eventType = mapNeedleEvent(needleEvent);
  if (!eventType) {
    // Unknown event type — acknowledge and skip
    return Response.json({ ok: true, skipped: `unknown event type: ${needleEvent}` });
  }

  if (!needleLeadId) {
    return Response.json({ ok: true, skipped: 'no lead_id in payload' });
  }

  // Find our lead by needle_lead_id
  const db = getDb();
  const { data: leadData } = await db
    .from('lead')
    .select('id')
    .eq('needle_lead_id', needleLeadId)
    .single();

  if (!leadData) {
    // Lead not tracked — acknowledge and skip (don't error; Needle expects 200)
    console.warn(`[needle webhook] lead not found for needle_lead_id=${needleLeadId}`);
    return Response.json({ ok: true, skipped: 'lead not found' });
  }

  const leadId = (leadData as { id: string }).id;
  const today = new Date().toISOString().slice(0, 10);
  const dedupeKey = `${leadId}:${eventType}:${today}`;

  // Deduplicate
  const { data: existingEvent } = await db
    .from('lead_event')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .single();

  if (existingEvent) {
    return Response.json({ ok: true, isNew: false });
  }

  // Insert event
  const { data: eventData, error: eventErr } = await db
    .from('lead_event')
    .insert({
      lead_id: leadId,
      type: eventType,
      occurred_at: new Date().toISOString(),
      evidence: evidence ?? null,
      is_test: false,
      dedupe_key: dedupeKey,
    })
    .select('*')
    .single();

  if (eventErr || !eventData) {
    console.error('[needle webhook] insert failed:', eventErr);
    // Still return 200 to prevent Needle from retrying indefinitely
    return Response.json({ ok: false, error: 'insert failed' });
  }

  const event = toLeadEvent(eventData as LeadEventRow);

  // Fire signal pipeline asynchronously
  after(() => runSignalPipeline(event.id).catch((e: unknown) => {
    console.error('[needle webhook] pipeline error:', e);
  }));

  return Response.json({ ok: true, isNew: true, eventId: event.id });
}
