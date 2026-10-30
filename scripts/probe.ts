#!/usr/bin/env node
/**
 * Integration probe — read-only connectivity and API shape verification.
 *
 * Usage:
 *   pnpm probe <needle|aiark|zapmail|claude|all> [--person <linkedinUrl>] [--company <domain>]
 *
 * Prints a short plain summary and writes full raw responses to
 * probes/<integration>-<timestamp>.json (all secrets redacted).
 *
 * Needle notes (discovered 2026-10-30):
 *   - All LinkedIn tools require connectedAccountId param.
 *   - needleListConnectedAccounts returns 0 (broken upstream); use needleGetConnectedAccount.
 *   - Set NEEDLE_CONNECTED_ACCOUNT_ID in .env.local with the account id shown in Needle UI.
 *   - Profile response has no phone field (finding: phone not available via this API).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const targetArg = argv[0];
const VALID_TARGETS = ['needle', 'aiark', 'zapmail', 'claude', 'all'];

if (!targetArg || !VALID_TARGETS.includes(targetArg)) {
  console.error(
    'Usage: pnpm probe <needle|aiark|zapmail|claude|all> [--person <linkedinUrl>] [--company <domain>]'
  );
  process.exit(1);
}

function argAfter(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const personUrl = argAfter('--person');
const companyArg = argAfter('--company');

// ---------------------------------------------------------------------------
// Output directory
// ---------------------------------------------------------------------------
const PROBES_DIR = join(process.cwd(), 'probes');
mkdirSync(PROBES_DIR, { recursive: true });

function nowTs(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ---------------------------------------------------------------------------
// Secret redaction (applied before any JSON is written to disk)
// ---------------------------------------------------------------------------
const SECRET_FIELD_NAMES = new Set([
  'authorization', 'token', 'apikey', 'api_key', 'secret',
  'password', 'passwd', 'x-token', 'client_secret', 'private_key',
  'access_token', 'refresh_token', 'bearer',
]);

function redact(val: unknown): unknown {
  const known = [
    process.env['NEEDLE_API_KEY'],
    process.env['AI_ARK_API_KEY'],
    process.env['ANTHROPIC_API_KEY'],
    process.env['SUPABASE_SERVICE_ROLE_KEY'],
    process.env['SUPABASE_ANON_KEY'],
    process.env['ENCRYPTION_KEY'],
    process.env['EVENTS_WEBHOOK_SECRET'],
    process.env['NEEDLE_WEBHOOK_SECRET'],
  ].filter((v): v is string => typeof v === 'string' && v.length > 4);

  function walk(node: unknown): unknown {
    if (typeof node === 'string') {
      let s = node;
      for (const sv of known) {
        if (s.includes(sv)) s = s.split(sv).join('[REDACTED]');
      }
      return s;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = SECRET_FIELD_NAMES.has(k.toLowerCase()) ? '[REDACTED]' : walk(v);
      }
      return out;
    }
    return node;
  }
  return walk(val);
}

function saveProbe(name: string, data: unknown): string {
  const path = join(PROBES_DIR, `${name}-${nowTs()}.json`);
  writeFileSync(path, JSON.stringify(redact(data), null, 2), 'utf8');
  return path;
}

// ---------------------------------------------------------------------------
// Needle probe
// ---------------------------------------------------------------------------

interface McpResponse {
  result?: {
    tools?: Array<{ name: string; inputSchema?: Record<string, unknown> }>;
    content?: Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  };
  error?: { code?: number; message?: string };
}

async function needleRpc(
  method: string,
  params: Record<string, unknown>,
  apiKey: string
): Promise<McpResponse> {
  const res = await fetch('https://needle.app/mcp/v1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Needle HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const text = await res.text();
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') continue;
    try { return JSON.parse(payload) as McpResponse; } catch { /* skip */ }
  }
  throw new Error(`No parseable SSE from Needle for ${method}`);
}

async function needleTool(
  name: string,
  args: Record<string, unknown>,
  apiKey: string
): Promise<McpResponse> {
  return needleRpc('tools/call', { name, arguments: args }, apiKey);
}

/**
 * Extract the LinkedIn public identifier from a profile URL.
 * e.g. https://www.linkedin.com/in/jane-doe-example/ → jane-doe-example
 * The `identity` param on Needle LinkedIn tools accepts a public identifier OR a numeric user id.
 */
function linkedinIdentity(url: string): string {
  const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(url);
  return m ? (m[1] ?? url).replace(/\/$/, '') : url;
}

/** Extract text from MCP result content array. */
function resultText(resp: McpResponse): string {
  return (resp.result?.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text ?? '')
    .join('\n');
}

async function probeNeedle(): Promise<void> {
  const apiKey = process.env['NEEDLE_API_KEY'];
  if (!apiKey) {
    console.log('Needle: kein API-Schlüssel — Probe übersprungen.');
    return;
  }

  // connectedAccountId: required by all LinkedIn tools.
  // needleListConnectedAccounts is broken (returns 0); use needleGetConnectedAccount.
  const connectedAccountId = process.env['NEEDLE_CONNECTED_ACCOUNT_ID'];

  console.log('\n=== Needle Probe ===');
  const raw: Record<string, unknown> = {};

  // 1. tools/list
  console.log('  tools/list …');
  const toolsResp = await needleRpc('tools/list', {}, apiKey);
  raw['tools_list'] = toolsResp;
  const tools = toolsResp.result?.tools ?? [];
  console.log(`  ${tools.length} tools discovered.`);

  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

  // 2. needleGetMe
  console.log('  needleGetMe …');
  const meResp = await needleTool('needleGetMe', {}, apiKey);
  raw['needleGetMe'] = meResp;

  // 3. needleListConnectedAccounts (known to return 0; call for completeness)
  console.log('  needleListConnectedAccounts …');
  const listAccountsResp = await needleTool('needleListConnectedAccounts', {}, apiKey);
  raw['needleListConnectedAccounts'] = listAccountsResp;
  const listText = resultText(listAccountsResp);
  console.log(`  needleListConnectedAccounts response: ${listText.slice(0, 120) || '(empty)'}`);

  // 4. needleGetConnectedAccount — works when connectedAccountId is set
  if (connectedAccountId) {
    console.log('  needleGetConnectedAccount …');
    const getAccountResp = await needleTool(
      'needleGetConnectedAccount',
      { connectedAccountId },
      apiKey
    );
    raw['needleGetConnectedAccount'] = getAccountResp;
    const accountText = resultText(getAccountResp);
    const linkedinVisible = accountText.toLowerCase().includes('linkedin');
    console.log(`  Account text preview: ${accountText.slice(0, 120)}`);
    console.log(`  LinkedIn mentioned in account: ${linkedinVisible}`);
  } else {
    console.log('  NEEDLE_CONNECTED_ACCOUNT_ID not set — needleGetConnectedAccount skipped.');
  }

  // 5. LinkedIn-specific tools — all require connectedAccountId + identity/conversationId
  if (personUrl && connectedAccountId) {
    const identity = linkedinIdentity(personUrl);
    console.log(`  LinkedIn identity extracted: ${identity}`);

    // 5a. needleGetLinkedinProfile — identity = public identifier or numeric id
    const profileDef = toolMap['needleGetLinkedinProfile'];
    if (profileDef) {
      console.log('  needleGetLinkedinProfile …');
      try {
        const resp = await needleTool('needleGetLinkedinProfile', { connectedAccountId, identity }, apiKey);
        raw['needleGetLinkedinProfile'] = resp;
        if (resp.error) {
          console.log(`    error: ${resp.error.message ?? JSON.stringify(resp.error)}`);
        } else {
          const text = resultText(resp);
          try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            const fields = Object.keys(parsed);
            const hasPhone = fields.some((f) => f.toLowerCase().includes('phone'));
            console.log(`    Fields available (${fields.length}): ${fields.join(', ')}`);
            console.log(`    Phone field present: ${hasPhone}${!hasPhone ? ' ← finding: no phone data in Needle LinkedIn profile' : ''}`);
          } catch {
            console.log(`    Response length: ${text.length} chars (raw text, not JSON)`);
            console.log(`    Phone field present: false ← finding: no phone data in Needle LinkedIn profile`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`    failed: ${msg.slice(0, 200)}`);
        raw['needleGetLinkedinProfile'] = { error: msg };
      }
    }

    // 5b. needleListLinkedinPosts — identity = public identifier or numeric id
    const postsDef = toolMap['needleListLinkedinPosts'];
    if (postsDef) {
      console.log('  needleListLinkedinPosts …');
      try {
        const resp = await needleTool('needleListLinkedinPosts', { connectedAccountId, identity }, apiKey);
        raw['needleListLinkedinPosts'] = resp;
        if (resp.error) {
          console.log(`    error: ${resp.error.message ?? JSON.stringify(resp.error)}`);
        } else {
          const text = resultText(resp);
          try {
            const parsed = JSON.parse(text) as unknown;
            const obj = parsed as Record<string, unknown>;
            const posts: unknown[] = Array.isArray(parsed) ? parsed
              : Array.isArray(obj['posts']) ? obj['posts'] as unknown[]
              : Array.isArray(obj['elements']) ? obj['elements'] as unknown[]
              : [];
            console.log(`    Posts count: ${posts.length}`);
            if (posts.length > 0) {
              const first = posts[0] as Record<string, unknown>;
              console.log(`    First post fields: ${Object.keys(first).join(', ')}`);
            }
          } catch {
            console.log(`    Response length: ${text.length} chars`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`    failed: ${msg.slice(0, 200)}`);
        raw['needleListLinkedinPosts'] = { error: msg };
      }
    }

    // 5c. needleListLinkedinConversationMessages — needs conversationId, so first list conversations
    const convListDef = toolMap['needleListLinkedinConversations'];
    const msgsDef = toolMap['needleListLinkedinConversationMessages'];
    if (convListDef && msgsDef) {
      console.log('  needleListLinkedinConversations (to get conversationId) …');
      try {
        const convResp = await needleTool('needleListLinkedinConversations', { connectedAccountId, limit: 5 }, apiKey);
        raw['needleListLinkedinConversations'] = convResp;
        if (convResp.error) {
          console.log(`    error: ${convResp.error.message ?? JSON.stringify(convResp.error)}`);
        } else {
          const convText = resultText(convResp);
          try {
            const parsed = JSON.parse(convText) as unknown;
            const obj = parsed as Record<string, unknown>;
            const convs: unknown[] = Array.isArray(parsed) ? parsed
              : Array.isArray(obj['conversations']) ? obj['conversations'] as unknown[]
              : Array.isArray(obj['elements']) ? obj['elements'] as unknown[]
              : [];
            console.log(`    Conversations returned: ${convs.length} (counts only — no contents printed)`);

            // Get messages for first conversation only
            const firstConv = convs.length > 0 ? convs[0] as Record<string, unknown> : null;
            const conversationId = firstConv
              ? (firstConv['conversationId'] ?? firstConv['id']) as string | undefined
              : undefined;

            if (conversationId) {
              console.log('  needleListLinkedinConversationMessages …');
              const msgsResp = await needleTool('needleListLinkedinConversationMessages', { connectedAccountId, conversationId, limit: 5 }, apiKey);
              raw['needleListLinkedinConversationMessages'] = msgsResp;
              if (msgsResp.error) {
                console.log(`    error: ${msgsResp.error.message ?? JSON.stringify(msgsResp.error)}`);
              } else {
                const msgsText = resultText(msgsResp);
                try {
                  const msgs = JSON.parse(msgsText) as unknown;
                  const mo = msgs as Record<string, unknown>;
                  const msgList: unknown[] = Array.isArray(msgs) ? msgs
                    : Array.isArray(mo['messages']) ? mo['messages'] as unknown[]
                    : Array.isArray(mo['elements']) ? mo['elements'] as unknown[]
                    : [];
                  console.log(`    Messages returned: ${msgList.length} (contents not printed)`);
                  if (msgList.length > 0) {
                    const firstMsg = msgList[0] as Record<string, unknown>;
                    console.log(`    First message fields: ${Object.keys(firstMsg).join(', ')}`);
                  }
                } catch {
                  console.log(`    Response length: ${msgsText.length} chars`);
                }
              }
            } else {
              console.log('    No conversationId found in conversation list — messages step skipped.');
            }
          } catch {
            console.log(`    Conversations response length: ${convText.length} chars`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`    needleListLinkedinConversations failed: ${msg.slice(0, 200)}`);
        raw['needleListLinkedinConversations'] = { error: msg };
      }
    }
  } else if (personUrl && !connectedAccountId) {
    console.log(
      '  LinkedIn tools skipped: NEEDLE_CONNECTED_ACCOUNT_ID not set.\n' +
      '  Set it in .env.local to the account ID shown in the Needle dashboard.'
    );
  }

  const path = saveProbe('needle', raw);

  const readTools = tools.filter(
    (t) => !['send', 'invite', 'comment', 'react', 'draft', 'create', 'update', 'delete']
      .some((v) => t.name.toLowerCase().includes(v))
  );

  console.log('\n--- Needle Summary ---');
  console.log(`Tools total: ${tools.length}  |  Read-only (estimated): ${readTools.length}`);
  console.log(`connectedAccountId configured: ${Boolean(connectedAccountId)}`);
  console.log(`Saved: ${path}`);
}

// ---------------------------------------------------------------------------
// AI Ark probe
// ---------------------------------------------------------------------------

async function probeAiArk(): Promise<void> {
  const apiKey = process.env['AI_ARK_API_KEY'];
  if (!apiKey) {
    console.log('AI Ark: kein Schlüssel – Probe übersprungen.');
    return;
  }

  console.log('\n=== AI Ark Probe ===');
  const BASE = 'https://api.ai-ark.com/api/developer-portal';
  const hdrs = { 'X-TOKEN': apiKey, 'Content-Type': 'application/json' };
  const raw: Record<string, unknown> = {};

  // 1. Credit check (GET /v1/payments/credits — free)
  console.log('  GET /v1/payments/credits …');
  const credRes = await fetch(`${BASE}/v1/payments/credits`, {
    headers: hdrs,
    signal: AbortSignal.timeout(15_000),
  });
  if (!credRes.ok) {
    console.log(`  Credits check failed: HTTP ${credRes.status}`);
    raw['credits_error'] = credRes.status;
  } else {
    const credData = (await credRes.json()) as { total?: number };
    raw['credits'] = credData;
    console.log(`  Credits: ${credData.total ?? 'unknown'}`);
  }

  // 2. Load campaign filters from DB
  let previewFilters: Record<string, unknown> = {};
  try {
    const url = process.env['SUPABASE_URL'] ?? '';
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    if (url && key) {
      const db = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await db
        .from('campaign')
        .select('icp_roles,icp_company_size_min,icp_company_size_max,icp_regions')
        .eq('is_active', true)
        .limit(1)
        .single();
      if (data) {
        const c = data as {
          icp_roles?: string[];
          icp_company_size_min?: number | null;
          icp_company_size_max?: number | null;
          icp_regions?: string[];
        };
        const account: Record<string, unknown> = {};
        const contact: Record<string, unknown> = {};
        if (c.icp_company_size_min != null || c.icp_company_size_max != null) {
          account['employeeSize'] = [{ min: c.icp_company_size_min ?? 1, max: c.icp_company_size_max ?? 1_000_000 }];
        }
        if (c.icp_regions?.length) account['geoLocation'] = { include: c.icp_regions };
        if (c.icp_roles?.length)  contact['seniority']  = { include: c.icp_roles };
        previewFilters = {
          ...(Object.keys(account).length ? { account } : {}),
          ...(Object.keys(contact).length ? { contact } : {}),
        };
        console.log(`  Campaign roles: [${c.icp_roles?.join(', ')}]`);
        console.log(`  Campaign regions: [${c.icp_regions?.join(', ')}]`);
      } else {
        console.log('  No active campaign found in DB — using empty filters.');
      }
    } else {
      console.log('  Supabase env not set — using empty filters.');
    }
  } catch (e) {
    console.log(`  DB unavailable (${e instanceof Error ? e.message : e}) — using empty filters.`);
  }

  // 3. People preview (POST /v1/people/preview — costs 1 credit)
  console.log('  POST /v1/people/preview …');
  const previewBody = { page: 0, size: 5, ...previewFilters };
  raw['preview_request'] = previewBody;
  const prevRes = await fetch(`${BASE}/v1/people/preview`, {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify(previewBody),
    signal: AbortSignal.timeout(20_000),
  });
  if (!prevRes.ok) {
    const t = await prevRes.text();
    console.log(`  Preview failed: HTTP ${prevRes.status} — ${t.slice(0, 200)}`);
    raw['preview_error'] = { status: prevRes.status, body: t.slice(0, 500) };
  } else {
    const prevData = (await prevRes.json()) as {
      content?: unknown[];
      totalElements?: number;
      totalPages?: number;
    };
    raw['preview'] = prevData;
    console.log(`  Preview: ${prevData.content?.length ?? 0} results on page, ${prevData.totalElements ?? '?'} total matches.`);
  }

  const path = saveProbe('aiark', raw);
  const creds = raw['credits'] as { total?: number } | undefined;
  const prev  = raw['preview']  as { content?: unknown[]; totalElements?: number } | undefined;

  console.log('\n--- AI Ark Summary ---');
  console.log(`Credits remaining: ${creds?.total ?? 'unknown'}`);
  console.log(`Preview results: ${prev?.content?.length ?? 0} of ${prev?.totalElements ?? '?'} total`);
  console.log(`Saved: ${path}`);
}

// ---------------------------------------------------------------------------
// Zapmail probe
// ---------------------------------------------------------------------------

function isPrivateIp(addr: string): boolean {
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(addr);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const lo = addr.toLowerCase().split('%')[0] ?? '';
  if (lo === '::1') return true;
  if (/^fe[89ab]/i.test(lo)) return true;
  if (/^f[cd]/i.test(lo)) return true;
  return false;
}

async function ssrfCheck(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return 'Ungültige URL.'; }
  const allowed = new Set(['smtp:', 'smtps:', 'imap:', 'imaps:']);
  if (!allowed.has(parsed.protocol)) return `Schema nicht erlaubt: ${parsed.protocol}`;
  if (!parsed.hostname) return 'Kein Hostname.';
  try {
    const results = await lookup(parsed.hostname, { all: true });
    for (const r of results) {
      if (isPrivateIp(r.address)) return `Private IP-Adresse: ${r.address}`;
    }
  } catch { return `Hostname nicht auflösbar: ${parsed.hostname}`; }
  return null;
}

async function probeZapmail(): Promise<void> {
  const smtpUrl = process.env['ZAPMAIL_SMTP_URL'];
  const imapUrl = process.env['ZAPMAIL_IMAP_URL'];

  if (!smtpUrl) {
    console.log('Zapmail: kein ZAPMAIL_SMTP_URL — Probe übersprungen.');
    return;
  }

  console.log('\n=== Zapmail Probe ===');
  const raw: Record<string, unknown> = {};

  // SMTP
  const smtpErr = await ssrfCheck(smtpUrl);
  if (smtpErr) {
    console.log(`  SMTP SSRF: ${smtpErr}`);
    raw['smtp'] = { ok: false, error: smtpErr };
  } else {
    try {
      const t = nodemailer.createTransport(smtpUrl as string);
      await t.verify();
      t.close();
      console.log('  SMTP: OK');
      raw['smtp'] = { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  SMTP: FAIL — ${msg.slice(0, 120)}`);
      raw['smtp'] = { ok: false, error: msg.slice(0, 200) };
    }
  }

  // IMAP
  if (!imapUrl) {
    console.log('  IMAP: nicht konfiguriert — übersprungen.');
    raw['imap'] = { ok: null };
  } else {
    const imapErr = await ssrfCheck(imapUrl);
    if (imapErr) {
      console.log(`  IMAP SSRF: ${imapErr}`);
      raw['imap'] = { ok: false, error: imapErr };
    } else {
      let parsed: URL;
      try { parsed = new URL(imapUrl); } catch {
        raw['imap'] = { ok: false, error: 'URL parse error' };
        return;
      }
      const client = new ImapFlow({
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : (parsed.protocol === 'imaps:' ? 993 : 143),
        secure: parsed.protocol === 'imaps:',
        auth: {
          user: decodeURIComponent(parsed.username),
          pass: decodeURIComponent(parsed.password),
        },
        logger: false,
      });
      try {
        await client.connect();
        await client.logout();
        console.log('  IMAP: OK');
        raw['imap'] = { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  IMAP: FAIL — ${msg.slice(0, 120)}`);
        raw['imap'] = { ok: false, error: msg.slice(0, 200) };
      }
    }
  }

  const path = saveProbe('zapmail', raw);
  const smtp = raw['smtp'] as { ok: boolean };
  const imap = raw['imap'] as { ok: boolean | null };

  console.log('\n--- Zapmail Summary ---');
  console.log(`SMTP: ${smtp.ok ? 'OK' : 'FAIL'}`);
  console.log(`IMAP: ${imap.ok === true ? 'OK' : imap.ok === null ? 'not configured' : 'FAIL'}`);
  console.log(`Saved: ${path}`);
}

// ---------------------------------------------------------------------------
// Claude probe
// ---------------------------------------------------------------------------

async function probeClaude(): Promise<void> {
  if (!companyArg) {
    console.log('Claude: kein --company angegeben — Probe übersprungen.');
    console.log('  Tipp: pnpm probe claude --company personio.de');
    return;
  }

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    console.log('Claude: kein ANTHROPIC_API_KEY — Probe übersprungen.');
    return;
  }

  console.log(`\n=== Claude Probe (Recherche: ${companyArg}) ===`);
  const client = new Anthropic({ apiKey });
  const MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-5-5';

  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: `Research "${companyArg}" for recent B2B sales trigger events from the last 90 days: funding rounds, leadership changes, headcount growth (especially sales/SDR roles), product launches, or expansion. List each finding with its source URL and approximate date.`,
  }];

  let response!: Anthropic.Message;
  for (let i = 0; i < 3; i++) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
      messages,
    });
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }

  const urls: string[] = [];
  for (const block of response.content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === 'web_search_result' && r.url) urls.push(r.url);
      }
    }
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const raw = {
    model: MODEL,
    stop_reason: response.stop_reason,
    usage: response.usage,
    urls_found: urls,
    summary_text: text.slice(0, 3000),
  };

  const path = saveProbe('claude', raw);

  console.log('\n--- Claude Summary ---');
  console.log(`stop_reason: ${response.stop_reason}`);
  console.log(`tokens: in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);
  console.log(`URLs found (${urls.length}):`);
  for (const u of urls) console.log(`  ${u}`);
  if (text) {
    console.log('\nFindings:');
    console.log(text.slice(0, 800));
    if (text.length > 800) console.log('  … (truncated; full text in saved file)');
  }
  console.log(`\nSaved: ${path}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const targets = targetArg === 'all'
    ? (['needle', 'aiark', 'zapmail', 'claude'] as const)
    : [targetArg as 'needle' | 'aiark' | 'zapmail' | 'claude'];

  for (const t of targets) {
    switch (t) {
      case 'needle': await probeNeedle(); break;
      case 'aiark':  await probeAiArk();  break;
      case 'zapmail': await probeZapmail(); break;
      case 'claude': await probeClaude();  break;
    }
  }
}

main().catch((e: unknown) => {
  console.error('Probe failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
