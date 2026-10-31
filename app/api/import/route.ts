/**
 * POST /api/import — AI Ark only (kept for direct use). The dashboard uses the
 * unified POST /api/leads/find, which runs every connected source.
 */

import { getCredentials } from '@/lib/connectors';
import { importAiArkLeads } from '@/lib/lead-sources';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export async function POST() {
  const creds = await getCredentials('ai_ark');
  if (!creds?.apiKey) {
    return err('Kein AI-Ark-Schlüssel gefunden. Bitte auf der Integrations-Seite einfügen.');
  }

  try {
    const { imported } = await importAiArkLeads(creds.apiKey);
    if (imported === 0) {
      return Response.json({ imported: 0, message: 'Keine Leads gefunden. Suchfilter prüfen.' });
    }
    return Response.json({ imported });
  } catch (e) {
    console.error('[import POST]', e);
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('(401)')) {
      return err('AI-Ark-Schlüssel ungültig. Bitte auf der Integrations-Seite prüfen.', 401);
    }
    return err('Lead-Import fehlgeschlagen. Bitte AI-Ark-Schlüssel prüfen und erneut versuchen.', 500);
  }
}
