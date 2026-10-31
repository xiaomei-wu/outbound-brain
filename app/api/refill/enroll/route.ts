/**
 * POST /api/refill/enroll — the SDR approves enrolling candidates in the Needle campaign
 * (required once the campaign sends messages, because enrolling then means outreach).
 * Body: { leadIds: string[] }  →  { enrolled; skipped; message }
 */

import { z } from 'zod';
import { enrollLeads } from '@/lib/refill-run';

const Body = z.object({ leadIds: z.array(z.string().uuid()).min(1).max(50) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Ungültige Auswahl.' }, { status: 400 });
  try {
    return Response.json(await enrollLeads(parsed.data.leadIds));
  } catch (err) {
    console.error('[refill enroll]', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Aufnahme in die Needle-Kampagne fehlgeschlagen.' }, { status: 502 });
  }
}
