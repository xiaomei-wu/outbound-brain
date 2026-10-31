/**
 * Connector interface, registry, and credential resolution.
 * Credential priority: integration table (encrypted) → env var fallback.
 */

import type { ConnectorId } from '@/lib/types';
import { env } from '@/lib/env';
import { getDb } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { getCredits } from '@/lib/aiark';
import { blitzKeyInfo } from '@/lib/blitz';
import { lushaUsage } from '@/lib/lusha';
import { lookup } from 'node:dns/promises';
import nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ConnectorField {
  name: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

export interface Connector {
  id: ConnectorId;
  label: string;
  description: string;
  fields: ConnectorField[];
  /** Runs a live connectivity check with the provided config. */
  test(config: Record<string, string>): Promise<{ ok: boolean; message: string }>;
}

// ---------------------------------------------------------------------------
// Needle connector
// ---------------------------------------------------------------------------

async function testNeedle(config: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const apiKey = config['apiKey'];
  if (!apiKey) return { ok: false, message: 'Kein API-Schlüssel angegeben.' };

  try {
    const res = await fetch('https://needle.app/mcp/v1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 1 }),
      // 10-second timeout
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { ok: false, message: `Verbindung fehlgeschlagen — HTTP ${res.status}. API-Schlüssel prüfen.` };
    }

    const text = await res.text();
    // Parse SSE: lines beginning with "data: "
    const dataLines = text
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => l.slice(6).trim());

    let toolCount = 0;
    for (const line of dataLines) {
      if (!line || line === '[DONE]') continue;
      try {
        const parsed = JSON.parse(line) as {
          result?: { tools?: unknown[] };
          error?: { message?: string };
        };
        if (parsed.error) {
          return { ok: false, message: `Needle-Fehler: ${parsed.error.message ?? 'Unbekannter Fehler'}. Schlüssel prüfen.` };
        }
        if (Array.isArray(parsed.result?.tools)) {
          toolCount = parsed.result.tools.length;
          break;
        }
      } catch {
        // skip malformed SSE lines
      }
    }

    return {
      ok: true,
      message: `Verbunden — ${toolCount} Tools verfügbar.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Needle nicht erreichbar: ${msg.slice(0, 120)}` };
  }
}

// ---------------------------------------------------------------------------
// AI Ark connector
// ---------------------------------------------------------------------------

async function testAiArk(config: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const apiKey = config['apiKey'];
  if (!apiKey) return { ok: false, message: 'Kein API-Schlüssel angegeben.' };

  try {
    const credits = await getCredits(apiKey);
    return { ok: true, message: `Verbunden — ${credits} Credits verfügbar.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized')) {
      return { ok: false, message: 'Ungültiger API-Schlüssel — bitte prüfen und erneut einfügen.' };
    }
    return { ok: false, message: `AI Ark nicht erreichbar: ${msg.slice(0, 120)}` };
  }
}

// ---------------------------------------------------------------------------
// SSRF protection helpers
// ---------------------------------------------------------------------------

/**
 * Returns true for IP addresses that must never be dialled by a connector:
 * loopback, RFC-1918 private, link-local, CGNAT (100.64/10), and IPv6 ULA/LL.
 */
function isPrivateIp(address: string): boolean {
  // IPv4
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 127) return true;                        // loopback    127.0.0.0/8
    if (a === 10) return true;                         // private     10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // private     172.16.0.0/12
    if (a === 192 && b === 168) return true;           // private     192.168.0.0/16
    if (a === 169 && b === 254) return true;           // link-local  169.254.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT       100.64.0.0/10
    return false;
  }
  // IPv6 — normalise and check well-known blocked prefixes
  const lower = address.toLowerCase().split('%')[0] ?? '';
  if (lower === '::1') return true;                    // loopback    ::1
  if (/^fe[89ab]/i.test(lower)) return true;           // link-local  fe80::/10
  if (/^f[cd]/i.test(lower)) return true;              // ULA         fc00::/7
  return false;
}

const ALLOWED_SCHEMES = new Set(['smtp:', 'smtps:', 'imap:', 'imaps:']);

/**
 * Validates that rawUrl uses an allowed scheme (smtp/smtps/imap/imaps) and
 * that all DNS-resolved addresses for its hostname are non-private.
 * Returns a German error string, or null if the URL is safe to connect to.
 */
async function validateConnectorUrl(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Ungültige URL — bitte Format prüfen (z. B. smtps://user:pass@host:465).';
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    const scheme = parsed.protocol.replace(':', '');
    return `Schema „${scheme}" ist nicht erlaubt. Nur smtp, smtps, imap und imaps sind gültig.`;
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return 'Kein Hostname in der URL gefunden.';
  }

  let addresses: string[];
  try {
    const results = await lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    return `Hostname „${hostname}" konnte nicht aufgelöst werden. Bitte prüfen.`;
  }

  if (addresses.length === 0) {
    return `Hostname „${hostname}" hat keine gültigen Adressen.`;
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      return 'Verbindung zu internen oder privaten Adressen ist nicht erlaubt.';
    }
  }

  return null; // safe
}

// ---------------------------------------------------------------------------
// Zapmail connector
// ---------------------------------------------------------------------------

async function testZapmail(config: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const smtpUrl = config['smtpUrl'];
  if (!smtpUrl) return { ok: false, message: 'Keine SMTP-URL angegeben.' };

  // SSRF protection: validate scheme and resolved IP before connecting
  const smtpError = await validateConnectorUrl(smtpUrl);
  if (smtpError) return { ok: false, message: smtpError };

  const imapUrl = config['imapUrl'];
  if (imapUrl) {
    const imapError = await validateConnectorUrl(imapUrl);
    if (imapError) return { ok: false, message: imapError };
  }

  try {
    const transporter = nodemailer.createTransport(smtpUrl);
    await transporter.verify();
    transporter.close();
    return { ok: true, message: 'Verbunden — Postfach bereit.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Mailserver nicht erreichbar: ${msg.slice(0, 120)}` };
  }
}

// ---------------------------------------------------------------------------
// BlitzAPI connector
// ---------------------------------------------------------------------------

async function testBlitz(config: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const apiKey = config['apiKey'];
  if (!apiKey) return { ok: false, message: 'Kein API-Schlüssel angegeben.' };

  try {
    const { recordsRemaining } = await blitzKeyInfo(apiKey);
    return { ok: true, message: `Verbunden — ${recordsRemaining} Datensätze übrig.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `BlitzAPI nicht erreichbar: ${msg.slice(0, 120)}` };
  }
}

// ---------------------------------------------------------------------------
// Lusha connector
// ---------------------------------------------------------------------------

async function testLusha(config: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const apiKey = config['apiKey'];
  if (!apiKey) return { ok: false, message: 'Kein API-Schlüssel angegeben.' };

  try {
    const { remaining } = await lushaUsage(apiKey);
    return { ok: true, message: `Verbunden — ${remaining} Credits übrig.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Lusha nicht erreichbar: ${msg.slice(0, 120)}` };
  }
}

// ---------------------------------------------------------------------------
// Connector registry
// ---------------------------------------------------------------------------

export const connectors: Record<ConnectorId, Connector> = {
  needle: {
    id: 'needle',
    label: 'Needle',
    description: 'LinkedIn-Suche und Lead-Recherche via MCP',
    fields: [
      {
        name: 'apiKey',
        label: 'API-Schlüssel',
        placeholder: 'ndk_...',
        secret: true,
      },
      {
        name: 'connectedAccountId',
        label: 'Konto-ID (optional)',
        placeholder: '00000000-…',
        secret: false,
      },
    ],
    test: testNeedle,
  },
  ai_ark: {
    id: 'ai_ark',
    label: 'AI Ark',
    description: 'Lead-Suche und Anreicherung',
    fields: [
      {
        name: 'apiKey',
        label: 'API-Schlüssel',
        placeholder: 'ark_...',
        secret: true,
      },
    ],
    test: testAiArk,
  },
  zapmail: {
    id: 'zapmail',
    label: 'Zapmail',
    description: 'E-Mail-Postfach für Outreach',
    fields: [
      {
        name: 'smtpUrl',
        label: 'SMTP-URL',
        placeholder: 'smtps://user:pass@mail.example.com',
        secret: true,
      },
      {
        name: 'imapUrl',
        label: 'IMAP-URL',
        placeholder: 'imaps://user:pass@mail.example.com',
        secret: true,
      },
    ],
    test: testZapmail,
  },
  blitz: {
    id: 'blitz',
    label: 'BlitzAPI',
    description: 'Firmen- und Entscheider-Suche (Telefon nur US)',
    fields: [{ name: 'apiKey', label: 'API-Schlüssel', placeholder: 'blitz_…', secret: true }],
    test: testBlitz,
  },
  lusha: {
    id: 'lusha',
    label: 'Lusha',
    description: 'Telefonnummern (auf Klick, kostet Credits)',
    fields: [{ name: 'apiKey', label: 'API-Schlüssel', placeholder: 'lusha_…', secret: true }],
    test: testLusha,
  },
};

// ---------------------------------------------------------------------------
// Credential resolution: DB (decrypted) → env var fallback
// ---------------------------------------------------------------------------

/**
 * Returns the decrypted config for a connector, or null if not configured.
 * Checks the integration table first; falls back to env vars.
 * Never throws — returns null on any error.
 */
export async function getCredentials(
  connectorId: ConnectorId
): Promise<Record<string, string> | null> {
  try {
    const db = getDb();
    const { data } = await db
      .from('integration')
      .select('encrypted_config, iv')
      .eq('connector_id', connectorId)
      .single();

    if (data) {
      const key = env.ENCRYPTION_KEY();
      const raw = decrypt(
        (data as { encrypted_config: string }).encrypted_config,
        (data as { iv: string }).iv,
        key
      );
      return JSON.parse(raw) as Record<string, string>;
    }
  } catch {
    // No row or decryption failed — fall through to env fallback
  }

  // Env var fallbacks
  switch (connectorId) {
    case 'needle': {
      const apiKey = env.NEEDLE_API_KEY();
      return apiKey ? { apiKey } : null;
    }
    case 'ai_ark': {
      const apiKey = env.AI_ARK_API_KEY();
      return apiKey ? { apiKey } : null;
    }
    case 'zapmail': {
      const smtpUrl = env.ZAPMAIL_SMTP_URL() ?? '';
      const imapUrl = env.ZAPMAIL_IMAP_URL() ?? '';
      return smtpUrl ? { smtpUrl, imapUrl } : null;
    }
    case 'blitz': {
      const apiKey = env.BLITZ_API_KEY();
      return apiKey ? { apiKey } : null;
    }
    case 'lusha': {
      const apiKey = env.LUSHA_API_KEY();
      return apiKey ? { apiKey } : null;
    }
  }
}

/**
 * Returns the last 4 characters of the primary key field, masked as "****xxxx".
 * Used in the GET /api/integrations/[connectorId] response.
 */
export function maskedKey(config: Record<string, string>, connector: Connector): string {
  const primaryField = connector.fields[0]?.name;
  if (!primaryField) return '****';
  const value = config[primaryField] ?? '';
  const tail = value.slice(-4).padStart(4, '*');
  return `****${tail}`;
}
