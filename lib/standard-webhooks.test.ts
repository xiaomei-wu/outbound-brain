import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyStandardWebhook } from './standard-webhooks';

const secretBytes = Buffer.from('test-secret-bytes-0123456789');
const secret = `whsec_${secretBytes.toString('base64')}`;
const body = '{"type":"linkedin_message_received","data":{}}';
const id = 'evt_1';
const now = 1_793_460_000;

function sign(ts: number, payload = body) {
  return 'v1,' + createHmac('sha256', secretBytes).update(`${id}.${ts}.${payload}`).digest('base64');
}

describe('verifyStandardWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyStandardWebhook(body, { id, timestamp: String(now), signature: sign(now) }, secret, now)).toBe(true);
  });

  it('accepts when one of several space-separated signatures matches (key rotation)', () => {
    const header = `v1,AAAA ${sign(now)}`;
    expect(verifyStandardWebhook(body, { id, timestamp: String(now), signature: header }, secret, now)).toBe(true);
  });

  it('rejects a tampered body, a wrong secret and missing headers', () => {
    expect(verifyStandardWebhook(body + ' ', { id, timestamp: String(now), signature: sign(now) }, secret, now)).toBe(false);
    expect(verifyStandardWebhook(body, { id, timestamp: String(now), signature: sign(now) }, 'whsec_d3Jvbmc=', now)).toBe(false);
    expect(verifyStandardWebhook(body, { id: null, timestamp: String(now), signature: sign(now) }, secret, now)).toBe(false);
  });

  it('rejects timestamps more than 5 minutes away', () => {
    expect(verifyStandardWebhook(body, { id, timestamp: String(now - 301), signature: sign(now - 301) }, secret, now)).toBe(false);
  });
});
