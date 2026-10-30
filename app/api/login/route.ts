/**
 * POST /api/login — validate demo passcode and set access cookie.
 *
 * Body: { passcode: string }
 * Success (200): sets httpOnly ob_access cookie (7 days), returns { ok: true }
 * Failure (401): returns { error: string } in German
 *
 * Cookie value: HMAC-SHA256(key=DEMO_PASSCODE, data="ob_access_v1") as hex.
 * Changing DEMO_PASSCODE automatically invalidates all existing cookies.
 *
 * Timing-safe compare uses Node.js crypto (route runs in Node.js runtime).
 * HMAC cookie value uses Web Crypto (globalThis.crypto.subtle — available in Node ≥ 18).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'ob_access';
const COOKIE_PAYLOAD = 'ob_access_v1';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Compute HMAC-SHA256(key, data) as a lowercase hex string. */
async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Timing-safe passcode comparison.
 * Hashes both values with a random key first so timingSafeEqual always
 * receives equal-length buffers (SHA-256 = 32 bytes) regardless of input length.
 */
function timingSafePasscodeEqual(expected: string, submitted: string): boolean {
  const key = randomBytes(32);
  const expectedDigest = createHmac('sha256', key).update(expected, 'utf8').digest();
  const submittedDigest = createHmac('sha256', key).update(submitted, 'utf8').digest();
  return timingSafeEqual(expectedDigest, submittedDigest);
}

export async function POST(request: Request) {
  const passcode = process.env.DEMO_PASSCODE;

  // Gate is disabled — no login needed
  if (!passcode) {
    return NextResponse.json({ ok: true });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const submitted =
    body !== null &&
    typeof body === 'object' &&
    'passcode' in body &&
    typeof (body as Record<string, unknown>).passcode === 'string'
      ? ((body as Record<string, string>).passcode)
      : '';

  if (!timingSafePasscodeEqual(passcode, submitted)) {
    return NextResponse.json(
      { error: 'Falsches Passwort. Bitte bei Xiaomei nachfragen.' },
      { status: 401 },
    );
  }

  // Generate the signed cookie value
  const cookieValue = await hmacHex(passcode, COOKIE_PAYLOAD);
  const isProduction = process.env.NODE_ENV === 'production';

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });

  return response;
}
