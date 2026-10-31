/**
 * Call card — per-lead, generated from the cached CompanyCheck.
 * Only for A/B scores. Encodes the PDF's "Regeln fuer den Anruf-Einstieg",
 * "Formulierung", "Vertiefungsfragen und Einwand" rules.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '@/lib/env';
import type { CallCard, Campaign, CompanyCheck, Lead } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const CallCardSchema = z.object({
  anlass: z.string(),
  anlassUrl: z.nullable(z.string()),
  opener: z.string(),
  followUps: z.array(z.string()),
  objection: z.object({
    expected: z.string(),
    response: z.string(),
  }),
  openQuestion: z.string(),
});

// ---------------------------------------------------------------------------
// System prompt — PDF call rules
// ---------------------------------------------------------------------------

function buildCallCardSystemPrompt(campaign: Campaign): string {
  const offerBlock = campaign.offer.trim()
    ? `\nAngebot (nur als Kontext, NICHT im Opener erwaehnen): ${campaign.offer.trim()}`
    : '';

  return `Du erstellst eine Anrufkarte fuer einen SDR, der Entscheider in der Immobilienwirtschaft anruft.

## Regeln fuer den Anruf-Einstieg

Ziel ist, dass die angesprochene Person ihren aktuellen Prozess beschreibt.

1. Anlass: ein konkreter, belegter Satz. Warum dieses Unternehmen? "Warum jetzt?" nur beantworten, wenn ein aktueller Beleg vorliegt.
2. Hypothese als offene Prozessfrage: z. B. "Wie priorisieren Sie solche Massnahmen aktuell ueber die einzelnen Objekte hinweg?" Keine behauptete Problemdiagnose.
3. Ausstieg anbieten: ein kurzer Halbsatz, der ein Nein ohne Druck ermoeglicht.
4. Termin erst bei erkennbarem Interesse oder benanntem Problem vorschlagen.

## Formulierung

- Maximal 30 bis 40 Sekunden gesprochen, lieber kuerzer.
- Eigene Vorstellung hoechstens ein Halbsatz. Keine erfundene Identitaet oder Leistungsbeschreibung.
- Kein Produktname, keine Funktionsliste, kein Leistungsversprechen.
- Keine Floskeln wie "Wie geht es Ihnen heute?", "Stoere ich gerade?" oder "Ich haette da mal eine kurze Frage".
- Direkt, auf Augenhoehe und natuerlich gesprochen.

## Vertiefungsfragen und Einwand

Zwei Fragen: eine zum heutigen Ablauf und den beteiligten Personen; eine zu Konsequenzen, Prioritaeten oder moeglichen Engpaessen. Keine suggestive Bedarfsfrage wie "Brauchen Sie dafuer eine Loesung?"

Einwand als erwartbar kennzeichnen, nicht als bekannte Aussage. Segment und Anlass beruecksichtigen; ernst nehmen und in einem Satz aufgreifen. Beispiele: "Machen wir intern", "Haben wir einen Dienstleister", "Schicken Sie Unterlagen", "Aktuell keine Ankaeufe".

## Ausgabe

Strukturiertes JSON:
- anlass: Konkreter, belegter Aufhaenger (ein Satz)
- anlassUrl: URL des Belegs oder null
- opener: Woertlich formulierter Einstieg, maximal 30 bis 40 Sekunden gesprochen
- followUps: Genau 2 Vertiefungsfragen
- objection.expected: Wahrscheinlichster Einwand (ein Satz)
- objection.response: Umgang damit (ein Satz)
- openQuestion: Offene Frage vor dem Kontakt oder "Keine zentrale Frage offen."${offerBlock}`;
}

// ---------------------------------------------------------------------------
// generateCallCard
// ---------------------------------------------------------------------------

export async function generateCallCard(
  lead: Lead,
  check: CompanyCheck,
  campaign: Campaign,
): Promise<CallCard | null> {
  // Only generate for A/B
  if (check.score !== 'A' && check.score !== 'B') return null;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() });

  const signalList = check.fitSignals
    .map((s) => `- ${s.text} (${s.url})`)
    .join('\n');

  const userPrompt = `Erstelle eine Anrufkarte fuer diesen Kontakt.

## Person
Name: ${lead.name}
Rolle: ${lead.role ?? 'unbekannt'}
Unternehmen: ${check.companyName}

## ICP-Ergebnis
Segment: ${check.segments.join(', ')}
Score: ${check.score}
Was sie tun: ${check.whatTheyDo}

Fit-Signale:
${signalList || '(keine)'}

Pain-Hypothese: ${check.painHypothesis}
Einstiegspunkt: ${check.entryPoint}
Offene Frage: ${check.openQuestion}`;

  const parsed = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: {
      effort: 'low',
      format: zodOutputFormat(CallCardSchema),
    },
    system: buildCallCardSystemPrompt(campaign),
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (!parsed.parsed_output) return null;

  const raw = parsed.parsed_output;

  return {
    anlass: raw.anlass,
    anlassUrl: raw.anlassUrl,
    opener: raw.opener,
    followUps: raw.followUps.slice(0, 2),
    objection: raw.objection,
    openQuestion: raw.openQuestion,
  };
}
