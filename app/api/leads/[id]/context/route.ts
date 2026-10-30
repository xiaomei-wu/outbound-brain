/**
 * POST /api/leads/[id]/context
 * Paste a chat, email, LinkedIn message, or note for a lead.
 * Body: { kind: 'chat'|'email'|'linkedin'|'note', text: string, occurredAt?: string }
 * Response: { added: number; priority: PriorityResult }
 *
 * Next.js 16: params is a Promise.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { addContext } from '@/lib/manual-leads';
import type { LeadRow } from '@/lib/mappers';

const ContextBodySchema = z.object({
  kind: z.enum(['chat', 'email', 'linkedin', 'note']),
  text: z.string().min(1),
  occurredAt: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Ungültiges JSON. Bitte Eingabe prüfen.' },
      { status: 400 },
    );
  }

  const parsed = ContextBodySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Ungültige Daten.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Fetch lead name for transcript author detection
  const db = getDb();
  const { data: leadRow, error: leadErr } = await db
    .from('lead')
    .select('id, name')
    .eq('id', id)
    .single();

  if (leadErr || !leadRow) {
    return NextResponse.json(
      { error: 'Lead nicht gefunden. Prüfen Sie die ID.' },
      { status: 404 },
    );
  }

  const leadName = (leadRow as Pick<LeadRow, 'name'>).name;

  try {
    const result = await addContext(id, leadName, parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error(`POST /api/leads/${id}/context error:`, err);
    return NextResponse.json(
      { error: 'Kontext konnte nicht gespeichert werden. Bitte erneut versuchen.' },
      { status: 500 },
    );
  }
}
