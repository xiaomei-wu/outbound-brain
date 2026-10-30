/**
 * POST /api/leads/csv
 * Import leads from CSV.
 * Body: text/csv  OR  application/json { csv: string }
 * Columns: name, role, company, domain, size, region, phone, email, linkedin
 * Response: { created: number; skipped: number; errors: string[] }
 */

import { NextResponse } from 'next/server';
import { importFromCsv } from '@/lib/manual-leads';

export async function POST(request: Request) {
  let csvText: string;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('text/csv')) {
    csvText = await request.text();
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Ungültiges Format. Bitte CSV-Datei oder JSON mit { csv: "..." } senden.' },
        { status: 400 },
      );
    }
    const typed = body as Record<string, unknown>;
    if (typeof typed['csv'] !== 'string' || !typed['csv'].trim()) {
      return NextResponse.json(
        { error: 'Feld "csv" fehlt oder ist leer.' },
        { status: 400 },
      );
    }
    csvText = typed['csv'];
  }

  if (!csvText.trim()) {
    return NextResponse.json(
      { error: 'CSV ist leer. Bitte Datei prüfen.' },
      { status: 400 },
    );
  }

  try {
    const result = await importFromCsv(csvText);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('POST /api/leads/csv error:', err);
    return NextResponse.json(
      { error: 'Import fehlgeschlagen. Bitte erneut versuchen.' },
      { status: 500 },
    );
  }
}
