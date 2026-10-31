/**
 * Reads a lead's written conversation (LinkedIn via Needle or a pasted chat) and returns
 * one signal with the person's own words as evidence. Only what the person wrote counts;
 * the seller's messages are context, never evidence.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '@/lib/env';
import type { ReplySignal } from '@/lib/types';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';

const ReplySignalSchema = z.object({
  signal: z.enum([
    'call_request',
    'interested',
    'later',
    'not_interested',
    'opt_out',
    'wrong_contact',
    'disqualifier',
    'neutral',
  ]),
  quote: z.string(),
  reason: z.string(),
});

const SYSTEM_PROMPT = `Du wertest die schriftliche Unterhaltung zwischen einem Vertriebsmitarbeiter (SDR) und einem Kontakt aus. Gib genau ein Signal zurück, das auf der NEUESTEN relevanten Aussage des Kontakts beruht.

Signale:
- call_request: Der Kontakt bittet ausdrücklich um ein Gespräch/einen Anruf oder nennt einen Termin („Rufen Sie mich Donnerstag an“, „Gern, lassen Sie uns telefonieren“).
- interested: Interesse oder Fragen, aber kein Gesprächswunsch.
- later: Grundsätzlich offen, aber jetzt nicht („Melden Sie sich im Frühjahr“).
- not_interested: Kein Interesse, ohne die Bitte, nicht mehr kontaktiert zu werden.
- opt_out: Ausdrückliche Bitte, nicht mehr kontaktiert zu werden.
- wrong_contact: Nicht zuständig / verweist auf eine andere Person.
- disqualifier: Belegter Ausschlussgrund für das Unternehmen, z. B. Insolvenz, Abwicklung, eingestelltes Geschäft, kein Projektgeschäft mehr.
- neutral: Nichts davon (Smalltalk, Danke für die Vernetzung, nur Nachrichten des SDR).

Regeln:
- Nur Aussagen des Kontakts zählen, nie die des SDR.
- quote: wörtliches Zitat des Kontakts (max. 200 Zeichen), auf dem das Signal beruht; bei neutral leer.
- reason: ein Satz auf Deutsch, warum dieses Signal. Nichts erfinden, nichts unterstellen.
- Im Zweifel zwischen zwei Signalen das vorsichtigere wählen (z. B. interested statt call_request).`;

export interface ConversationMessage {
  author: 'contact' | 'seller';
  content: string;
  occurredAt: string;
}

export interface ReplySignalResult {
  signal: ReplySignal;
  quote: string;
  reason: string;
}

export async function classifyConversation(
  leadName: string,
  messages: ConversationMessage[],
): Promise<ReplySignalResult> {
  if (!messages.some((m) => m.author === 'contact')) {
    return { signal: 'neutral', quote: '', reason: 'Noch keine Antwort des Kontakts.' };
  }

  const transcript = [...messages]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .slice(-30)
    .map((m) => `[${m.occurredAt.slice(0, 16).replace('T', ' ')}] ${m.author === 'contact' ? leadName : 'SDR'}: ${m.content}`)
    .join('\n');

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() });
  const parsed = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low', format: zodOutputFormat(ReplySignalSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Unterhaltung mit ${leadName}:\n\n${transcript}` }],
  });

  const out = parsed.parsed_output;
  if (!out) return { signal: 'neutral', quote: '', reason: 'Antwort nicht auswertbar.' };
  return { signal: out.signal, quote: out.quote.slice(0, 200), reason: out.reason };
}
