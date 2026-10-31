/**
 * POST /api/leads/sync-replies — pulls LinkedIn messages from Needle (read-only), stores new
 * ones on the matching leads and re-evaluates their reply signal. Fallback for the webhook.
 *
 * Response: { events: number; leadsUpdated: number; message: string }
 */

import { getCredentials } from '@/lib/connectors';
import { syncNeedleReplies } from '@/lib/needle-replies';

export async function POST() {
  if (!(await getCredentials('needle'))?.apiKey) {
    return Response.json({ error: 'Needle ist nicht verbunden.' }, { status: 400 });
  }
  try {
    const { events, leadsUpdated } = await syncNeedleReplies();
    return Response.json({
      events,
      leadsUpdated,
      message: leadsUpdated
        ? `${leadsUpdated} Lead${leadsUpdated === 1 ? '' : 's'} mit neuen Antworten ausgewertet.`
        : 'Keine neuen Antworten von Leads.',
    });
  } catch (err) {
    console.error('[sync-replies]', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Antworten konnten nicht abgerufen werden.' }, { status: 502 });
  }
}
