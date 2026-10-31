/**
 * Runs the cheaper phone chain (AI Ark, then BlitzAPI for US contacts) for one lead and
 * stores the result. A miss is recorded in phone_lookup_at so the UI offers Lusha directly.
 */

import { findMobilePhone, type MobilePhoneInput } from '@/lib/aiark';
import { blitzPhone } from '@/lib/blitz';
import { getCredentials } from '@/lib/connectors';
import { getDb } from '@/lib/db';
import { isUsRegion, phoneSourceOrder, type ChainSource } from '@/lib/phone-chain';

export interface ChainOutcome {
  found: boolean;
  /** A source errored (e.g. rate limit); the lead is not marked as searched. */
  failed?: boolean;
  source?: ChainSource;
  tried: ChainSource[];
  message: string;
}

const SOURCE_LABEL: Record<ChainSource, string> = { ai_ark: 'AI Ark', blitz: 'BlitzAPI' };

export interface ChainKeys {
  aiArk: string | null;
  blitz: string | null;
}

/** Loads the keys once, so a bulk run does not decrypt them per lead. */
export async function loadChainKeys(): Promise<ChainKeys> {
  const [aiArk, blitz] = await Promise.all([getCredentials('ai_ark'), getCredentials('blitz')]);
  return { aiArk: aiArk?.apiKey ?? null, blitz: blitz?.apiKey ?? null };
}

export async function runPhoneChain(leadId: string, keys: ChainKeys): Promise<ChainOutcome> {
  const db = getDb();
  const { data: row } = await db
    .from('lead')
    .select('name, profile_url, company_domain, region')
    .eq('id', leadId)
    .single();
  if (!row) return { found: false, tried: [], message: 'Lead nicht gefunden.' };
  const lead = row as { name: string; profile_url: string | null; company_domain: string | null; region: string | null };

  const order = phoneSourceOrder({ hasAiArk: Boolean(keys.aiArk), hasBlitz: Boolean(keys.blitz), isUs: isUsRegion(lead.region) });
  const hasLinkedin = Boolean(lead.profile_url?.includes('linkedin.com/'));
  const tried: ChainSource[] = [];
  let failed = false;

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
        phone = await findMobilePhone(input, keys.aiArk!);
      } else {
        if (!hasLinkedin) continue;
        tried.push(source);
        phone = await blitzPhone(keys.blitz!, lead.profile_url!);
      }

      if (phone) {
        const { error } = await db
          .from('lead')
          .update({ phone, phone_source: source, phone_dnc: false, phone_lookup_at: new Date().toISOString() })
          .eq('id', leadId);
        if (error) throw new Error('Nummer konnte nicht gespeichert werden.');
        return { found: true, source, tried, message: `Nummer über ${SOURCE_LABEL[source]} gefunden.` };
      }
    } catch (err) {
      // A failing source must not stop the chain; the next one (or Lusha) still gets a chance
      failed = true;
      console.error(`[phone-chain] ${source} failed`, err instanceof Error ? err.message : err);
    }
  }

  // Only a clean "no number" counts as searched; errors (rate limit, timeout) leave the lead open
  if (tried.length > 0 && !failed) {
    await db.from('lead').update({ phone_lookup_at: new Date().toISOString() }).eq('id', leadId);
  }
  if (failed) {
    return { found: false, failed: true, tried, message: 'Telefonsuche gerade nicht möglich (Anbieter-Limit). Bitte gleich erneut versuchen.' };
  }
  const triedLabel = tried.length ? tried.map((s) => SOURCE_LABEL[s]).join(', ') : 'keine günstigere Quelle';
  return { found: false, tried, message: `Keine Nummer gefunden (${triedLabel}).` };
}
