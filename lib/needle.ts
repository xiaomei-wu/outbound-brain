/**
 * Needle MCP client — read-only LinkedIn tools.
 *
 * Key resolution: DB integration row (encrypted) → env NEEDLE_API_KEY fallback.
 * Account ID resolution (3-step):
 *   1. DB integration config field `connectedAccountId`
 *   2. Env NEEDLE_CONNECTED_ACCOUNT_ID
 *   3. needleListConnectedAccounts / needleSearchConnectedAccounts first active LinkedIn result
 *
 * Protocol: JSON-RPC 2.0 over HTTPS POST, response is SSE (text/event-stream) or plain JSON.
 * A hard allowlist enforces read-only access — any non-listed tool name throws immediately.
 *
 * Live profile fields (verified): publicIdentifier, firstName, lastName, fullName,
 * headline, summary, location, companyName, jobTitle, workExperience, education,
 * skills, isConnected, degree. NO phone field.
 */

import { getCredentials } from '@/lib/connectors';

const NEEDLE_URL = 'https://needle.app/mcp/v1';

/** Only these tool names may be called. Every other name throws immediately. */
const READ_TOOLS = new Set([
  'needleGetMe',
  'needleListConnectedAccounts',
  'needleSearchConnectedAccounts',
  'needleGetLinkedinProfile',
  'needleListLinkedinPosts',
  'needleListLinkedinConversations',
  'needleListLinkedinConversationMessages',
]);

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface NeedleUser {
  id: string;
  name: string;
  email: string;
  organization: { id: string; name: string; domain: string | null };
}

export interface NeedleConnectedAccount {
  id: string;
  /** 'linkedin' or 'instagram' */
  platform: string;
  status: string;
  displayName?: string;
}

/** Live-verified fields from needleGetLinkedinProfile. No phone field exists. */
export interface NeedleLinkedinProfile {
  publicIdentifier?: string;
  /** Numeric/opaque LinkedIn member id (ACoAAA…) */
  userId?: string;
  memberId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  headline?: string;
  summary?: string;
  location?: string;
  companyName?: string;
  companyDomain?: string;
  jobTitle?: string;
  isConnected?: boolean;
  degree?: number | null;
  workExperience?: Array<{
    title?: string;
    companyName?: string;
    startDate?: string;
    endDate?: string | null;
  }>;
  education?: Array<{
    schoolName?: string;
    degree?: string;
    fieldOfStudy?: string;
  }>;
  skills?: string[];
}

export interface NeedleLinkedinPost {
  postId?: string;
  text?: string;
  body?: string;
  postedAt?: string;
  url?: string;
}

export interface NeedleLinkedinConversation {
  conversationId: string;
  lastMessageAt?: string;
  participants?: Array<{
    publicIdentifier?: string;
    identity?: string;
    name?: string;
  }>;
}

export interface NeedleLinkedinMessage {
  messageId?: string;
  sentAt?: string;
  body?: string;
  text?: string;
  sender?: {
    publicIdentifier?: string;
    identity?: string;
    name?: string;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveKey(): Promise<string> {
  const creds = await getCredentials('needle');
  if (!creds?.apiKey) throw new Error('NEEDLE_KEY_MISSING');
  return creds.apiKey;
}

/**
 * Extracts the data payload from a Needle tools/call result.
 * Result shape: { structuredContent?: T, content?: [{type, text: "<JSON>"}] }
 */
function extractData<T>(raw: unknown): T {
  const r = raw as {
    structuredContent?: T;
    content?: Array<{ type?: string; text?: string }>;
  };
  if (r.structuredContent != null) return r.structuredContent;
  const text = r.content?.[0]?.text;
  if (text) {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Needle: could not parse content text: ${text.slice(0, 200)}`);
    }
  }
  return raw as T;
}

/**
 * Low-level JSON-RPC call to Needle MCP.
 * Handles both SSE (data: lines) and plain JSON responses.
 * Throws for any tool name not in READ_TOOLS.
 */
async function mcpCall(
  apiKey: string,
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<unknown> {
  if (!READ_TOOLS.has(toolName)) {
    throw new Error(
      `Needle tool "${toolName}" is not in the read-only allowlist. Refusing to call.`
    );
  }

  const res = await fetch(NEEDLE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
      id: 1,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Needle HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const rawText = await res.text();

  // Try SSE format: "data: <json>" lines
  const sseLines = rawText
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => l.slice(6).trim());

  for (const line of sseLines) {
    if (!line || line === '[DONE]') continue;
    try {
      const parsed = JSON.parse(line) as {
        result?: unknown;
        error?: { message?: string; code?: number };
      };
      if (parsed.error) {
        throw new Error(
          `Needle error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`
        );
      }
      if (parsed.result !== undefined) return parsed.result;
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }

  // Plain JSON fallback
  try {
    const parsed = JSON.parse(rawText) as {
      result?: unknown;
      error?: { message?: string };
    };
    if (parsed.error) {
      throw new Error(
        `Needle error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`
      );
    }
    if (parsed.result !== undefined) return parsed.result;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
  }

  throw new Error(`Needle: no result in response. Raw: ${rawText.slice(0, 300)}`);
}

// ---------------------------------------------------------------------------
// Connected account ID resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the Needle connectedAccountId for the LinkedIn integration.
 *
 * Resolution order:
 *   1. DB integration config field `connectedAccountId` (saved via Integrations page)
 *   2. Env var NEEDLE_CONNECTED_ACCOUNT_ID
 *   3. needleListConnectedAccounts → first active LinkedIn result
 *   4. needleSearchConnectedAccounts({query:'linkedin'}) → first active result
 *
 * Returns null when no account is found.
 */
export async function resolveConnectedAccountId(): Promise<string | null> {
  // 1. DB integration config
  try {
    const creds = await getCredentials('needle');
    const saved = creds?.connectedAccountId;
    if (saved?.trim()) return saved.trim();
  } catch {
    // fall through
  }

  // 2. Env var (no lib/env.ts to avoid frozen file; read directly)
  const envId = process.env['NEEDLE_CONNECTED_ACCOUNT_ID'];
  if (envId?.trim()) return envId.trim();

  // 3 & 4. Dynamic lookup (known to be unreliable, try anyway)
  try {
    const key = await resolveKey();

    const listRaw = await mcpCall(key, 'needleListConnectedAccounts', {});
    const listData = extractData<{ connectedAccounts?: NeedleConnectedAccount[] }>(listRaw);
    const listMatch = (listData.connectedAccounts ?? []).find(
      (a) => a.platform?.toLowerCase() === 'linkedin' && a.status?.toLowerCase() === 'active'
    );
    if (listMatch) return listMatch.id;

    const searchRaw = await mcpCall(key, 'needleSearchConnectedAccounts', { query: 'linkedin' });
    const searchData = extractData<{ connectedAccounts?: NeedleConnectedAccount[] }>(searchRaw);
    const searchMatch = (searchData.connectedAccounts ?? []).find(
      (a) => a.platform?.toLowerCase() === 'linkedin'
    );
    if (searchMatch) return searchMatch.id;
  } catch {
    // fall through — return null below
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public typed wrappers (read-only)
// ---------------------------------------------------------------------------

/** Returns the authenticated Needle user and workspace. */
export async function getMe(): Promise<NeedleUser> {
  const key = await resolveKey();
  const raw = await mcpCall(key, 'needleGetMe', {});
  const data = extractData<{ user: NeedleUser }>(raw);
  return data.user;
}

/** Lists all connected LinkedIn and Instagram accounts (may return 0 due to API quirk). */
export async function listConnectedAccounts(): Promise<NeedleConnectedAccount[]> {
  const key = await resolveKey();
  const raw = await mcpCall(key, 'needleListConnectedAccounts', {});
  const data = extractData<{ connectedAccounts?: NeedleConnectedAccount[] }>(raw);
  return data.connectedAccounts ?? [];
}

/** Fetches a LinkedIn profile by public identifier (e.g. "jane-doe-example"). */
export async function getLinkedinProfile(
  connectedAccountId: string,
  identity: string
): Promise<NeedleLinkedinProfile> {
  const key = await resolveKey();
  const raw = await mcpCall(key, 'needleGetLinkedinProfile', {
    connectedAccountId,
    identity,
  });
  // structuredContent shape: { requestId, profile: {...}, remainingUsage }
  const envelope = extractData<{ profile?: NeedleLinkedinProfile }>(raw);
  return envelope.profile ?? (envelope as unknown as NeedleLinkedinProfile);
}

/** Lists posts by a LinkedIn member (public identifier or userId). */
export async function listLinkedinPosts(
  connectedAccountId: string,
  identity: string,
  limit = 50
): Promise<NeedleLinkedinPost[]> {
  const key = await resolveKey();
  const raw = await mcpCall(key, 'needleListLinkedinPosts', {
    connectedAccountId,
    identity,
    limit,
  });
  const data = extractData<{ posts?: NeedleLinkedinPost[] }>(raw);
  return data.posts ?? [];
}

/** Lists LinkedIn conversations for a connected account (up to 100). */
export async function listLinkedinConversations(
  connectedAccountId: string
): Promise<NeedleLinkedinConversation[]> {
  const key = await resolveKey();
  const raw = await mcpCall(key, 'needleListLinkedinConversations', {
    connectedAccountId,
    limit: 100,
  });
  const data = extractData<{ conversations?: NeedleLinkedinConversation[] }>(raw);
  return data.conversations ?? [];
}

/** Lists messages in a LinkedIn conversation (up to 100). */
export async function listLinkedinConversationMessages(
  connectedAccountId: string,
  conversationId: string
): Promise<NeedleLinkedinMessage[]> {
  const key = await resolveKey();
  const raw = await mcpCall(key, 'needleListLinkedinConversationMessages', {
    connectedAccountId,
    conversationId,
    limit: 100,
  });
  const data = extractData<{ messages?: NeedleLinkedinMessage[] }>(raw);
  return data.messages ?? [];
}
