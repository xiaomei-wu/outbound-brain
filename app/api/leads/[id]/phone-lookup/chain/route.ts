/**
 * POST /api/leads/[id]/phone-lookup/chain
 * On-click phone search through the cheaper sources (AI Ark, then BlitzAPI for US contacts).
 * Lusha is the last resort and is offered separately by the UI when this finds nothing.
 *
 * Response: ChainOutcome { found; source?; tried; message }
 */

import { loadChainKeys, runPhoneChain } from '@/lib/phone-chain-run';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outcome = await runPhoneChain(id, await loadChainKeys());
  return Response.json(outcome, { status: outcome.message === 'Lead nicht gefunden.' ? 404 : 200 });
}
