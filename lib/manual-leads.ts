/**
 * Manual lead creation, context pasting, and CSV import.
 * Shared between API routes so the same logic can be smoke-tested directly.
 * No Next.js dependencies.
 */

import { z } from 'zod';
import { getDb } from '@/lib/db';
import { toLead } from '@/lib/mappers';
import type { LeadRow } from '@/lib/mappers';
import type { Lead, ContextKind, PriorityResult } from '@/lib/types';
import { refreshLeadPriority } from '@/lib/priority';

// ---------------------------------------------------------------------------
// Zod schema for lead creation
// ---------------------------------------------------------------------------

export const CreateLeadSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  company: z.string().optional(),
  companyDomain: z.string().optional(),
  companySize: z.number().int().positive().optional(),
  region: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  profileUrl: z.string().url().optional(),
  note: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

// ---------------------------------------------------------------------------
// createLead
// ---------------------------------------------------------------------------

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const db = getDb();
  const now = new Date().toISOString();

  const { data: leadRow, error } = await db
    .from('lead')
    .insert({
      name: input.name,
      role: input.role ?? null,
      company: input.company ?? null,
      company_domain: input.companyDomain ?? null,
      company_size: input.companySize ?? null,
      region: input.region ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      profile_url: input.profileUrl ?? null,
      source: 'manual',
      ai_ark_id: null,
      needle_lead_id: null,
      cached_brief: null,
      fit_score: 50,
      interest_score: 0,
      priority: 'low',
      priority_reason: 'Neu angelegt – noch keine Analyse.',
      fit_status: 'unknown',
      need_status: 'unknown',
      willingness: 'open',
      status: 'new',
      owner: null,
      last_alert_at: null,
    })
    .select()
    .single();

  if (error || !leadRow) {
    throw new Error(error?.message ?? 'Lead konnte nicht gespeichert werden.');
  }

  const lead = toLead(leadRow as LeadRow);

  // Optional note → lead_context (kind 'note', author 'seller')
  if (input.note?.trim()) {
    await db.from('lead_context').insert({
      lead_id: lead.id,
      kind: 'note',
      author: 'seller',
      content: input.note.trim(),
      occurred_at: now,
      source_url: null,
    });
  }

  // Refresh priority after insert
  await refreshLeadPriority(lead.id);

  return lead;
}

// ---------------------------------------------------------------------------
// Transcript parser
// ---------------------------------------------------------------------------

// German date+time prefix: "29.10.2026 14:03 "
const DATE_TIME_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{2}):(\d{2})\s+/;
// Bracket time prefix: "[14:03] "
const BRACKET_TIME_RE = /^\[(\d{2}):(\d{2})\]\s+/;

interface ParsedMessage {
  speaker: string;
  text: string;
  timestamp: Date | null;
}

function parseTranscriptLine(raw: string): ParsedMessage | null {
  let rest = raw.trim();
  let timestamp: Date | null = null;

  // Try German date+time prefix
  const dateMatch = DATE_TIME_RE.exec(rest);
  if (dateMatch) {
    const [full, day, month, year, hour, minute] = dateMatch;
    timestamp = new Date(
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour}:${minute}:00`,
    );
    rest = rest.slice(full.length);
  } else {
    // Try bracket time prefix
    const bracketMatch = BRACKET_TIME_RE.exec(rest);
    if (bracketMatch) {
      const [full, hour, minute] = bracketMatch;
      const today = new Date();
      timestamp = new Date(
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T${hour}:${minute}:00`,
      );
      rest = rest.slice(full.length);
    }
  }

  // Must be "Speaker Name: message text"
  const colonIdx = rest.indexOf(':');
  if (colonIdx < 2) return null;

  const speaker = rest.slice(0, colonIdx).trim();
  const text = rest.slice(colonIdx + 1).trim();
  if (!speaker || !text) return null;

  return { speaker, text, timestamp };
}

interface ChatRow {
  author: 'contact' | 'seller';
  content: string;
  occurredAt: string;
}

/**
 * Parse pasted text into individual chat rows, or return one block if it is
 * not structured enough to be a transcript.
 */
export function parseChat(
  text: string,
  leadName: string,
  fallbackOccurredAt: string,
): ChatRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed: ParsedMessage[] = [];

  for (const line of lines) {
    const msg = parseTranscriptLine(line);
    if (msg) parsed.push(msg);
  }

  // It's a transcript when at least 2 lines parsed and they cover ≥50 % of non-empty lines
  const isTranscript = parsed.length >= 2 && parsed.length >= lines.length * 0.5;

  if (!isTranscript) {
    return [{ author: 'seller', content: text.trim(), occurredAt: fallbackOccurredAt }];
  }

  const leadFirstName = leadName.toLowerCase().split(/\s+/)[0] ?? '';
  const leadFull = leadName.toLowerCase();

  return parsed.map((msg, i): ChatRow => {
    const speakerLower = msg.speaker.toLowerCase();
    const isContact =
      speakerLower === leadFull ||
      leadFull.includes(speakerLower) ||
      speakerLower.includes(leadFull) ||
      (leadFirstName.length > 2 &&
        speakerLower.split(/\s+/)[0] === leadFirstName);

    let occurredAt: string;
    if (msg.timestamp) {
      occurredAt = msg.timestamp.toISOString();
    } else {
      // Space messages one minute apart to preserve ordering
      const base = new Date(fallbackOccurredAt);
      base.setMinutes(base.getMinutes() + i);
      occurredAt = base.toISOString();
    }

    return {
      author: isContact ? 'contact' : 'seller',
      content: msg.text,
      occurredAt,
    };
  });
}

// ---------------------------------------------------------------------------
// addContext
// ---------------------------------------------------------------------------

export interface AddContextInput {
  kind: ContextKind;
  text: string;
  occurredAt?: string;
}

export interface AddContextResult {
  added: number;
  priority: PriorityResult;
}

export async function addContext(
  leadId: string,
  leadName: string,
  input: AddContextInput,
): Promise<AddContextResult> {
  const db = getDb();
  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt).toISOString()
    : new Date().toISOString();

  // Verify lead exists
  const { error: leadErr } = await db
    .from('lead')
    .select('id')
    .eq('id', leadId)
    .single();

  if (leadErr) {
    throw new Error(`Lead ${leadId} nicht gefunden.`);
  }

  // Parse or wrap content
  let rows: ChatRow[];
  if (input.kind === 'note') {
    rows = [{ author: 'seller', content: input.text.trim(), occurredAt }];
  } else {
    rows = parseChat(input.text, leadName, occurredAt);
  }

  for (const row of rows) {
    await db.from('lead_context').insert({
      lead_id: leadId,
      kind: input.kind,
      author: row.author,
      content: row.content,
      occurred_at: row.occurredAt,
      source_url: null,
    });
  }

  // Clear cached_brief so the next brief re-uses new context
  await db.from('lead').update({ cached_brief: null }).eq('id', leadId);

  const priority = await refreshLeadPriority(leadId);

  return { added: rows.length, priority };
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export interface CsvImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export async function importFromCsv(csvText: string): Promise<CsvImportResult> {
  // Dynamic import keeps papaparse out of the server startup bundle unless needed
  const Papa = (await import('papaparse')).default;

  const result = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, row] of result.data.entries()) {
    const rowLabel = `Zeile ${i + 2}`;
    const name = (row['name'] ?? '').trim();

    if (!name) {
      skipped++;
      errors.push(`${rowLabel}: Name fehlt – Zeile übersprungen.`);
      continue;
    }

    const sizeRaw = (row['size'] ?? '').trim();
    const companySizeParsed = sizeRaw ? Number(sizeRaw) : undefined;

    const input: CreateLeadInput = {
      name,
      role: row['role']?.trim() || undefined,
      company: row['company']?.trim() || undefined,
      companyDomain: row['domain']?.trim() || undefined,
      companySize:
        companySizeParsed !== undefined && !Number.isNaN(companySizeParsed)
          ? companySizeParsed
          : undefined,
      region: row['region']?.trim() || undefined,
      phone: row['phone']?.trim() || undefined,
      email: row['email']?.trim() || undefined,
      profileUrl: row['linkedin']?.trim() || undefined,
    };

    const parsed = CreateLeadSchema.safeParse(input);
    if (!parsed.success) {
      skipped++;
      const msg = parsed.error.issues[0]?.message ?? 'Ungültige Daten.';
      errors.push(`${rowLabel} (${name}): ${msg}`);
      continue;
    }

    try {
      await createLead(parsed.data);
      created++;
    } catch (err) {
      skipped++;
      errors.push(
        `${rowLabel} (${name}): ${err instanceof Error ? err.message : 'Unbekannter Fehler.'}`,
      );
    }
  }

  return { created, skipped, errors };
}
