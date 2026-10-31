/**
 * GET /api/needle/campaigns
 *
 * Lists all Needle campaigns for the connected account.
 * Response: { campaigns: { id, name, status, enrollmentCount }[] }
 * Errors: plain German sentence, status 400/500.
 */

import { listCampaigns } from '@/lib/needle';
import { getCredentials } from '@/lib/connectors';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export async function GET() {
  // Verify Needle is connected before calling the API
  const creds = await getCredentials('needle');
  if (!creds?.apiKey) {
    return err('Needle ist nicht verbunden.');
  }

  try {
    const campaigns = await listCampaigns();
    return Response.json({ campaigns });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NEEDLE_KEY_MISSING') {
      return err('Needle ist nicht verbunden.');
    }
    console.error('[needle/campaigns GET]', msg);
    return err('Needle-Kampagnen konnten nicht geladen werden. Bitte erneut versuchen.', 500);
  }
}
