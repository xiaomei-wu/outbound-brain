/**
 * POST /api/leads/[id]/phone-lookup/chain
 * On-click phone search through the cheaper sources (AI Ark, then BlitzAPI for US contacts).
 * Lusha is the last resort and is offered separately by the UI when this finds nothing.
 *
 * Response: { found: boolean; phone?: string; source?: ChainSource; tried: ChainSource[]; message: string }
 */

import { findMobilePhone, type MobilePhoneInput } from '@/lib/aiark';
import { blitzPhone } from '@/lib/blitz';
import { getCredentials } from '@/lib/connectors';
import { getDb } from '@/lib/db';
import { isUsRegion, phoneSourceOrder, type ChainSource } from '@/lib/phone-chain';

const SOURCE_LABEL: Record<ChainSource, string> = { ai_ark: 'AI Ark', blitz: 'BlitzAPI' };

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const { data: row } = await db
    .from('lead')
    .select('name, profile_url, company_domain, region')
    .eq('id', id)
    .single();
  if (!row) return Response.json({ found: false, tried: [], message: 'Lead nicht gefunden.' }, { status: 404 });
  const lead = row as { name: string; profile_url: string | null; company_domain: string | null; region: string | null };

  const [aiArk, blitz] = await Promise.all([getCredentials('ai_ark'), getCredentials('blitz')]);
  const order = phoneSourceOrder({
    hasAiArk: Boolean(aiArk?.apiKey),
    hasBlitz: Boolean(blitz?.apiKey),
    isUs: isUsRegion(lead.region),
  });

  const hasLinkedin = Boolean(lead.profile_url?.includes('linkedin.com/'));
  const tried: ChainSource[] = [];
  for (const source of order) {
    try {
      let phone: string | null = null;
      if (source === 'ai_ark') {
        let input: MobilePhoneInput | null = null;
        if (hasLinkedin) input = { linkedin: lead.profile_url! };
        else if (lead.company_domain && !lead.name.startsWith('Ansprechpartner offen')) {
          input = { domain: lead.company_domain, name: lead.name };
        }
        if (!input) continue;
        tried.push(source);
        phone = await findMobilePhone(input, aiArk!.apiKey);
      } else {
        if (!hasLinkedin) continue;
        tried.push(source);
        phone = await blitzPhone(blitz!.apiKey, lead.profile_url!);
      }

      if (phone) {
        const { error } = await db
          .from('lead')
          .update({ phone, phone_source: source, phone_dnc: false })
          .eq('id', id);
        if (error) throw new Error('Nummer konnte nicht gespeichert werden.');
        return Response.json({ found: true, phone, source, tried, message: `Nummer über ${SOURCE_LABEL[source]} gefunden.` });
      }
    } catch (err) {
      // A failing source must not stop the chain; the next one (or Lusha) still gets a chance
      console.error(`[phone-chain] ${source} failed`, err instanceof Error ? err.message : err);
    }
  }

  const triedLabel = tried.length ? tried.map((s) => SOURCE_LABEL[s]).join(', ') : 'keine günstigere Quelle';
  return Response.json({ found: false, tried, message: `Keine Nummer gefunden (${triedLabel}).` });
}
