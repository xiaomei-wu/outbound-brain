import { createHmac, timingSafeEqual } from 'node:crypto';

/** Needle signs webhooks per Standard Webhooks (needle.app/docs/webhooks, verified 2026-10-31). */
const TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Verifies `webhook-signature` ("v1,<base64 HMAC-SHA256 of id.timestamp.body>", possibly several
 * space-separated) with a `whsec_<base64>` secret, rejecting timestamps outside ±5 minutes.
 */
export function verifyStandardWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();

  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const received = Buffer.from(value, 'base64');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
