import { z } from 'zod';
import { getDb } from '@/lib/db';
import { applySortout } from '@/lib/sortout';

const SortoutBody = z.object({
  status: z.union([z.enum(['not_a_fit', 'wrong_contact', 'not_now', 'opt_out']), z.null()]),
  note: z.string().max(500).optional(),
});

/** POST /api/leads/[id]/sortout — sets a sort-out status from an explicit SDR click. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = SortoutBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Ungültiger Status.' }, { status: 400 });
  }
  if (parsed.data.status === 'opt_out') {
    // Opt-out only when the person said so: in the call (outcome route) or in writing
    const { data: lead } = await getDb().from('lead').select('reply_signal').eq('id', id).single();
    if ((lead as { reply_signal: string | null } | null)?.reply_signal !== 'opt_out') {
      return Response.json({ error: 'Opt-out nur, wenn die Person es selbst sagt (Gespräch oder Nachricht).' }, { status: 400 });
    }
  }

  try {
    const result = await applySortout(id, parsed.data.status, parsed.data.note ?? 'Aussortiert in Outbound Brain');
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Status konnte nicht gespeichert werden.';
    const status = msg === 'Lead nicht gefunden.' ? 404 : msg.startsWith('Opt-out') ? 400 : 500;
    return Response.json({ error: msg }, { status });
  }
}
