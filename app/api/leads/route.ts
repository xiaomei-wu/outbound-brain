/**
 * POST /api/leads
 * Create a lead manually.
 * Body: { name, role?, company?, companyDomain?, companySize?, region?, phone?, email?, profileUrl?, note? }
 * Response: { lead: Lead }
 */

import { NextResponse } from 'next/server';
import { CreateLeadSchema, createLead } from '@/lib/manual-leads';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Ungültiges JSON. Bitte Eingabe prüfen.' },
      { status: 400 },
    );
  }

  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Ungültige Daten.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const lead = await createLead(parsed.data);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    console.error('POST /api/leads error:', err);
    return NextResponse.json(
      { error: 'Lead konnte nicht gespeichert werden. Bitte erneut versuchen.' },
      { status: 500 },
    );
  }
}
