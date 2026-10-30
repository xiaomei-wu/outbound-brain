/**
 * POST /api/leads/import-linkedin
 * Body: { profileUrl: string }
 *
 * Fetches a LinkedIn profile + recent posts + conversation messages via Needle,
 * upserts the lead, inserts lead_context rows (deduped), refreshes priority.
 *
 * Response: { lead: Lead; imported: { messages: number; posts: number }; phoneNote: string | null }
 * Errors: plain German sentence, status 400/404/500.
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { refreshLeadPriority } from '@/lib/priority';
import { toLead, type LeadRow } from '@/lib/mappers';
import {
  resolveConnectedAccountId,
  getLinkedinProfile,
  listLinkedinPosts,
  listLinkedinConversations,
  listLinkedinConversationMessages,
  type NeedleLinkedinMessage,
  type NeedleLinkedinPost,
} from '@/lib/needle';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts the public identifier from a LinkedIn profile URL. */
function extractIdentity(profileUrl: string): string | null {
  try {
    const url = new URL(profileUrl);
    const m = url.pathname.match(/^\/in\/([^/?#]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function germanErr(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // 1. Parse body
  let profileUrl: string;
  try {
    const body = (await request.json()) as { profileUrl?: string };
    if (!body.profileUrl?.trim()) {
      return germanErr('Bitte eine LinkedIn-Profil-URL eingeben.');
    }
    profileUrl = body.profileUrl.trim();
  } catch {
    return germanErr('Ungültige Anfrage – bitte Seite neu laden und erneut versuchen.');
  }

  const identity = extractIdentity(profileUrl);
  if (!identity) {
    return germanErr(
      'Die URL sieht nicht wie ein LinkedIn-Profil aus (erwartet: linkedin.com/in/…).'
    );
  }

  // 2. Resolve connected LinkedIn account ID (DB config → env → API lookup)
  let connectedAccountId: string;
  try {
    const resolved = await resolveConnectedAccountId();
    if (!resolved) {
      return germanErr(
        'Kein verbundenes LinkedIn-Konto gefunden – bitte in Needle verbinden oder die Konto-ID auf der Integrations-Seite eintragen.',
        400
      );
    }
    connectedAccountId = resolved;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NEEDLE_KEY_MISSING') {
      return germanErr(
        'Needle-API-Schlüssel fehlt – bitte unter Einstellungen → Integrationen eintragen.',
        400
      );
    }
    console.error('[import-linkedin] resolveConnectedAccountId failed:', msg);
    return germanErr(
      'Verbindung zu Needle fehlgeschlagen – bitte in Einstellungen prüfen.',
      500
    );
  }

  // 3. Fetch LinkedIn profile
  let profile: Awaited<ReturnType<typeof getLinkedinProfile>>;
  try {
    profile = await getLinkedinProfile(connectedAccountId, identity);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
      return germanErr('LinkedIn-Profil nicht gefunden – bitte URL prüfen.', 404);
    }
    console.error('[import-linkedin] getLinkedinProfile failed:', msg);
    return germanErr(
      'LinkedIn-Profil konnte nicht abgerufen werden – bitte erneut versuchen.',
      500
    );
  }

  // Resolve full name (profile has no phone field)
  const name =
    profile.fullName?.trim() ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    identity;

  // Resolve identity to use for posts (userId/memberId if available, else public identifier)
  const postIdentity =
    profile.userId ?? profile.memberId ?? profile.publicIdentifier ?? identity;

  // 4. Fetch recent posts (last ~90 days), non-fatal
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let allPosts: NeedleLinkedinPost[] = [];
  try {
    const posts = await listLinkedinPosts(connectedAccountId, postIdentity, 50);
    allPosts = posts.filter((p) => {
      const ts = p.postedAt ? new Date(p.postedAt).getTime() : 0;
      return ts > ninetyDaysAgo;
    });
  } catch (e) {
    console.warn('[import-linkedin] listLinkedinPosts failed:', e);
  }

  // 5. Find conversation with this contact + fetch messages, non-fatal
  let allMessages: NeedleLinkedinMessage[] = [];
  try {
    const conversations = await listLinkedinConversations(connectedAccountId);
    const conv = conversations.find((c) =>
      (c.participants ?? []).some(
        (p) => (p.publicIdentifier ?? p.identity ?? '') === identity
      )
    );
    if (conv) {
      allMessages = await listLinkedinConversationMessages(
        connectedAccountId,
        conv.conversationId
      );
    }
  } catch (e) {
    console.warn('[import-linkedin] conversation fetch failed:', e);
  }

  // 6. Upsert lead in DB
  const db = getDb();

  const { data: existingRows } = await db
    .from('lead')
    .select('*')
    .or(`profile_url.eq.${profileUrl},needle_lead_id.eq.${identity}`)
    .limit(1);

  let leadId: string;
  const existingRow = existingRows?.[0] as LeadRow | undefined;

  if (existingRow) {
    leadId = existingRow.id;
    await db
      .from('lead')
      .update({
        name,
        role: profile.jobTitle ?? existingRow.role,
        company: profile.companyName ?? existingRow.company,
        company_domain: profile.companyDomain ?? existingRow.company_domain,
        region: profile.location ?? existingRow.region,
        // No phone field in Needle LinkedIn profile — leave existing value
        profile_url: profileUrl,
        needle_lead_id: identity,
        source: 'needle',
      })
      .eq('id', leadId);
  } else {
    const { data: inserted, error: insertErr } = await db
      .from('lead')
      .insert({
        name,
        role: profile.jobTitle ?? null,
        company: profile.companyName ?? null,
        company_domain: profile.companyDomain ?? null,
        region: profile.location ?? null,
        phone: null,   // Needle LinkedIn profile provides no phone field
        profile_url: profileUrl,
        needle_lead_id: identity,
        source: 'needle',
        fit_score: 0,
        interest_score: 0,
        priority: 'low',
        priority_reason: 'Neu importiert – Priorität wird berechnet.',
        fit_status: 'unknown',
        need_status: 'unknown',
        willingness: 'open',
        status: 'new',
        ai_ark_id: null,
        company_size: null,
        email: null,
        cached_brief: null,
        owner: null,
        last_alert_at: null,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      console.error('[import-linkedin] insert lead failed:', insertErr);
      return germanErr(
        'Lead konnte nicht gespeichert werden – bitte Seite neu laden und erneut versuchen.',
        500
      );
    }
    leadId = (inserted as { id: string }).id;
  }

  // 7. Load existing lead_context source_urls for dedup
  const { data: existingCtx } = await db
    .from('lead_context')
    .select('source_url')
    .eq('lead_id', leadId)
    .eq('kind', 'linkedin');

  const existingSourceUrls = new Set(
    (existingCtx ?? [])
      .map((r: { source_url: string | null }) => r.source_url)
      .filter(Boolean)
  );

  // 8. Insert message context rows (deduped)
  let importedMessages = 0;
  const messageRows: Array<{
    lead_id: string;
    kind: string;
    author: string;
    content: string;
    occurred_at: string;
    source_url: string;
  }> = [];

  for (const msg of allMessages) {
    const body = msg.body ?? msg.text ?? '';
    if (!body.trim()) continue;

    const senderIdentity = msg.sender?.publicIdentifier ?? msg.sender?.identity ?? '';
    const author: 'contact' | 'seller' = senderIdentity === identity ? 'contact' : 'seller';

    const sourceKey = msg.messageId
      ? `linkedin-msg:${msg.messageId}`
      : `linkedin-msg:${msg.sentAt ?? ''}:${senderIdentity}`;

    if (existingSourceUrls.has(sourceKey)) continue;

    messageRows.push({
      lead_id: leadId,
      kind: 'linkedin',
      author,
      content: body,
      occurred_at: msg.sentAt ? new Date(msg.sentAt).toISOString() : new Date().toISOString(),
      source_url: sourceKey,
    });
  }

  if (messageRows.length > 0) {
    const { error: msgErr } = await db.from('lead_context').insert(messageRows);
    if (msgErr) {
      console.error('[import-linkedin] insert messages failed:', msgErr);
    } else {
      importedMessages = messageRows.length;
    }
  }

  // 9. Insert post context rows (deduped)
  let importedPosts = 0;
  const postRows: Array<{
    lead_id: string;
    kind: string;
    author: string;
    content: string;
    occurred_at: string;
    source_url: string;
  }> = [];

  for (const post of allPosts) {
    const text = post.text ?? post.body ?? '';
    if (!text.trim()) continue;

    const sourceKey = post.postId
      ? `linkedin-post:${post.postId}`
      : post.url
        ? `linkedin-post:${post.url}`
        : `linkedin-post:${post.postedAt ?? ''}:${text.slice(0, 40)}`;

    if (existingSourceUrls.has(sourceKey)) continue;

    postRows.push({
      lead_id: leadId,
      kind: 'linkedin',
      author: 'contact',
      content: text,
      occurred_at: post.postedAt
        ? new Date(post.postedAt).toISOString()
        : new Date().toISOString(),
      source_url: post.url ?? sourceKey,
    });
  }

  if (postRows.length > 0) {
    const { error: postErr } = await db.from('lead_context').insert(postRows);
    if (postErr) {
      console.error('[import-linkedin] insert posts failed:', postErr);
    } else {
      importedPosts = postRows.length;
    }
  }

  // 10. Refresh priority (non-fatal)
  try {
    await refreshLeadPriority(leadId);
  } catch (e) {
    console.warn('[import-linkedin] refreshLeadPriority failed:', e);
  }

  // 11. Return updated lead
  const { data: updatedRow } = await db
    .from('lead')
    .select('*')
    .eq('id', leadId)
    .single();

  const lead = updatedRow ? toLead(updatedRow as LeadRow) : null;

  return NextResponse.json({
    lead,
    imported: { messages: importedMessages, posts: importedPosts },
    // Phone is not available from the Needle LinkedIn profile
    phoneNote: 'Telefonnummer fehlt – manuell ergänzen.',
  });
}
