/**
 * POST /api/webhooks/needle — Needle webhook intake (LinkedIn invites, messages and replies).
 *
 * Verifies the Standard Webhooks signature (webhook-id / webhook-timestamp / webhook-signature,
 * secret NEEDLE_WEBHOOK_SECRET = the whsec_ value Needle returned at registration), answers
 * 204 right away (Needle needs a 2xx within 10 s) and processes the message afterwards.
 * Deliveries are at least once; lead_context.external_id makes repeats a no-op.
 */

import { after } from 'next/server';
import { env } from '@/lib/env';
import type { NeedleEvent } from '@/lib/needle';
import { analyzeLeadReplies, CAMPAIGN_EVENT_TYPES, ingestMessageEvents } from '@/lib/needle-replies';
import { verifyStandardWebhook } from '@/lib/standard-webhooks';

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Fail closed: without a secret, unsigned payloads are never processed
  const secret = env.NEEDLE_WEBHOOK_SECRET();
  if (!secret) {
    console.error('[needle webhook] NEEDLE_WEBHOOK_SECRET is not set — refusing request');
    return Response.json({ ok: false }, { status: 503 });
  }

  const valid = verifyStandardWebhook(rawBody, {
    id: request.headers.get('webhook-id'),
    timestamp: request.headers.get('webhook-timestamp'),
    signature: request.headers.get('webhook-signature'),
  }, secret);
  if (!valid) return Response.json({ error: 'Ungültige Needle-Signatur.' }, { status: 400 });

  let payload: { type?: string; data?: NeedleEvent };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return Response.json({ error: 'Ungültiges JSON im Webhook-Body.' }, { status: 400 });
  }

  const event = payload.data;
  if (!event || !payload.type || !CAMPAIGN_EVENT_TYPES.includes(payload.type)) {
    return new Response(null, { status: 204 });
  }

  after(async () => {
    try {
      const leadIds = await ingestMessageEvents([{ ...event, type: event.type ?? payload.type! }]);
      for (const id of leadIds) await analyzeLeadReplies(id);
    } catch (err) {
      console.error('[needle webhook] processing failed', err instanceof Error ? err.message : err);
    }
  });
  return new Response(null, { status: 204 });
}
