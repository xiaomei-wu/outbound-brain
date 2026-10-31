/**
 * POST /api/leads/phone-lookup-all
 * Bulk phone search (button "Nummern suchen"): runs the cheaper chain for every A/B lead
 * without a number that was not searched yet. Lusha is never part of this; leads without
 * a hit get the Lusha option on their lead page.
 *
 * Response: { searched: number; found: number; message: string }
 */

import { getDb } from '@/lib/db';
import { toLead, type LeadRow } from '@/lib/mappers';
import { selectLeadsForPhoneSearch } from '@/lib/phone-chain';
import { loadChainKeys, runPhoneChain } from '@/lib/phone-chain-run';

// AI Ark's phone finder rate-limits parallel requests (429 seen with 3 in parallel),
// so leads are searched one at a time with a short pause
const PAUSE_MS = 400;

export async function POST() {
  const keys = await loadChainKeys();
  if (!keys.aiArk && !keys.blitz) {
    return Response.json(
      { error: 'Keine Telefon-Quelle verbunden — bitte AI Ark auf der Integrations-Seite verbinden.' },
      { status: 400 },
    );
  }

  const db = getDb();
  const [{ data: leadRows }, { data: checkRows }] = await Promise.all([
    db.from('lead').select('*').eq('is_test', false).is('phone', null),
    db.from('company_check').select('company_key, score'),
  ]);
  const scores = new Map(
    ((checkRows ?? []) as { company_key: string; score: string }[]).map((c) => [c.company_key, c.score]),
  );
  const ids = selectLeadsForPhoneSearch(((leadRows ?? []) as LeadRow[]).map(toLead), scores);

  let found = 0;
  let failed = 0;
  for (const id of ids) {
    const outcome = await runPhoneChain(id, keys);
    if (outcome.found) found++;
    if (outcome.failed) failed++;
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  const message =
    ids.length === 0
      ? 'Keine A/B-Leads ohne Nummer offen.'
      : `${found} von ${ids.length} Nummern gefunden.` +
        (failed ? ` ${failed} nicht durchsucht (Anbieter-Limit) — bitte erneut klicken.` : '') +
        ' Für Leads ohne Treffer kannst du im Lead Lusha versuchen.';
  return Response.json({ searched: ids.length, found, failed, message });
}
