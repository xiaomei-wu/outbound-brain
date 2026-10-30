/**
 * Next.js Proxy (was: middleware) — demo passcode gate.
 *
 * Behaviour when DEMO_PASSCODE is unset: allow everything (local dev keeps working).
 * When set: gate all routes behind an HMAC-signed cookie.
 *
 * Always allowed (no cookie required):
 *   /login, /api/login, /_next/*, favicon.ico, static files
 *   /api/webhooks/needle  — has its own HMAC auth
 *   /api/events           — additionally allowed when x-webhook-secret matches (timing-safe)
 *
 * Uses Web Crypto (crypto.subtle) — Edge Runtime compatible.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const COOKIE_NAME = 'ob_access';
/** Fixed string we sign; changing this invalidates all cookies. */
const COOKIE_PAYLOAD = 'ob_access_v1';

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto / Edge-safe)
// ---------------------------------------------------------------------------

/**
 * Timing-safe cookie verification via crypto.subtle.verify.
 * The HMAC verify operation is constant-time.
 * receivedHex must be a 64-char lowercase hex string (SHA-256 = 32 bytes).
 */
async function verifyHmacHex(
  key: string,
  data: string,
  receivedHex: string,
): Promise<boolean> {
  // SHA-256 HMAC = 32 bytes = 64 hex chars
  if (receivedHex.length !== 64) return false;
  const hexPairs = receivedHex.match(/.{2}/g);
  if (!hexPairs || hexPairs.length !== 32) return false;
  // Use new Uint8Array(32) so TS infers Uint8Array<ArrayBuffer>, compatible with BufferSource
  const receivedBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const val = parseInt(hexPairs[i]!, 16);
    if (Number.isNaN(val)) return false;
    receivedBytes[i] = val;
  }
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', cryptoKey, receivedBytes, enc.encode(data));
}

/**
 * Timing-safe string equality for same-length secrets (e.g. webhook headers).
 * Uses HMAC sign+verify so the comparison is constant-time regardless of content.
 */
async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(a));
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(b));
}

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/api/login' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/api/webhooks/needle'
  );
}

// ---------------------------------------------------------------------------
// Proxy entry point
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const passcode = process.env.DEMO_PASSCODE;

  // Gate disabled — allow everything (local dev)
  if (!passcode) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Always-allowed paths
  if (isPublicPath(pathname)) return NextResponse.next();

  // /api/events: also allowed when x-webhook-secret header matches EVENTS_WEBHOOK_SECRET
  if (pathname === '/api/events') {
    const headerSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.EVENTS_WEBHOOK_SECRET ?? '';
    if (
      headerSecret !== null &&
      expectedSecret.length > 0 &&
      (await timingSafeStringEqual(headerSecret, expectedSecret))
    ) {
      return NextResponse.next();
    }
  }

  // Verify access cookie
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue) {
    const valid = await verifyHmacHex(passcode, COOKIE_PAYLOAD, cookieValue);
    if (valid) return NextResponse.next();
  }

  // Not authenticated — API routes get 401 JSON, pages get redirect
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Bitte zuerst mit dem Demo-Passwort anmelden.' },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

// Run on everything except pre-compiled static bundles and image optimizations.
// The isPublicPath() check inside proxy() handles /_next/data, favicon, etc.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};

// ---------------------------------------------------------------------------
// Shared constant consumed by app/api/login/route.ts (same HMAC contract)
// ---------------------------------------------------------------------------
export { COOKIE_PAYLOAD };
