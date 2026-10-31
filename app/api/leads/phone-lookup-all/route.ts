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

// AI Ark allows 5 requests per second; 3 parallel lookups stay well below that
const CONCURRENCY = 3;

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
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const outcomes = await Promise.all(ids.slice(i, i + CONCURRENCY).map((id) => runPhoneChain(id, keys)));
    found += outcomes.filter((o) => o.found).length;
  }

  const message =
    ids.length === 0
      ? 'Keine A/B-Leads ohne Nummer offen.'
      : `${found} von ${ids.length} Nummern gefunden. Für die übrigen kannst du im Lead Lusha versuchen.`;
  return Response.json({ searched: ids.length, found, message });
}
