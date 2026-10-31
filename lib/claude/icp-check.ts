/**
 * ICP check — per-company qualification following Noel's
 * "ICP-Check Immobilienwirtschaft" PDF (segments 1–7, scoring, evidence rules).
 * Cached in company_check; the check runs once per company_key.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '@/lib/env';
import { getDb } from '@/lib/db';
import { toCompanyCheck } from '@/lib/mappers';
import type { CompanyCheckRow } from '@/lib/mappers';
import type { Campaign, CompanyCheck, Lead } from '@/lib/types';
import { companyKey } from '@/lib/origin';
import { normalizeIcpResult } from '@/lib/icp/routing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';

// ---------------------------------------------------------------------------
// Zod schema for structured output
// ---------------------------------------------------------------------------

const IcpSignalSchema = z.object({
  text: z.string(),
  url: z.string(),
});

const CompanyCheckOutputSchema = z.object({
  companyName: z.string(),
  domain: z.nullable(z.string()),
  segments: z.array(z.string()),
  score: z.enum(['A', 'B', 'C', 'D', 'nicht_bewertbar']),
  whatTheyDo: z.string(),
  fitSignals: z.array(IcpSignalSchema),
  against: z.array(z.string()),
  decision: z.string(),
  decisionReason: z.string(),
  painHypothesis: z.string(),
  entryPoint: z.string(),
  openQuestion: z.string(),
});

// ---------------------------------------------------------------------------
// System prompt — encodes the PDF faithfully
// ---------------------------------------------------------------------------

function buildIcpSystemPrompt(campaign: Campaign): string {
  const offerBlock = campaign.offer.trim()
    ? `\n\nAngebot des Auftraggebers (nur verwenden, wenn es die Pain-Hypothese stuetzt — keinen Produktbezug erfinden):\n${campaign.offer.trim()}\n${campaign.offerKnowledge.trim() ? `Fakten zum Angebot:\n${campaign.offerKnowledge.trim()}` : ''}`
    : '\n\nKein Angebot beschrieben. Bewerte ausschliesslich Zielgruppenpassung und erkennbare Geschaeftstaetigkeit. Keinen Produktbezug erfinden.';

  return `Du recherchierst und qualifizierst Unternehmen fuer die B2B-Leadgenerierung in der Immobilienwirtschaft. Zielgruppen sind insbesondere Asset Manager, Bestandshalter, Projektentwickler und Bautraeger sowie die nachfolgend definierten angrenzenden Segmente.

Der Check ist unabhaengig von einem bestimmten Anbieter, Produkt oder einer Technologie. Pruefe, ob ein Unternehmen zur Zielgruppe gehoert, relevante Aktivitaeten zeigt und fuer die Vertriebsbearbeitung priorisiert werden sollte.

Der Nutzer braucht eine klare Entscheidung. Ein belegtes Nein ist wertvoller als ein unbegruendetes Ja. Branchenzugehoerigkeit allein belegt keinen Bedarf, kein Budget und keine Kaufbereitschaft.

## Rechercheablauf

1. Website und relevante Unterseiten lesen: Ueber uns, Leistungen, Projekte/Referenzen, Portfolio, Ankauf/Ankaufsprofil, Karriere, News und gegebenenfalls Investor Relations.
2. Segment einordnen. Mehrfachzuordnung ist moeglich; dominantes Segment zuerst nennen. Tatsaechliche Taetigkeit statt blosser Selbstbezeichnung bewerten.
3. Fit-Kriterien pruefen. Jedes positive Signal mit konkretem Beleg und direkter Quellen-URL versehen.
4. Disqualifikatoren pruefen. Fehlende Informationen sind kein Ausschlussbeleg.
5. Score und Bearbeitungsentscheidung vergeben.
6. Pain-Hypothese aus belegten Informationen ableiten. Bei bekanntem Angebot nur relevante Zusammenhaenge herstellen; sonst eine plausible Prozessfrage aus dem Taetigkeitsfeld ableiten.
7. Konkreten Einstiegspunkt fuer die Ansprache vorschlagen. Kein Produktpitch.

Bei mehreren Firmen dieselbe Struktur je Firma verwenden. Keine Vorrede und keine Gesamtzusammenfassung.

## Zielsegmente und Fit-Kriterien

### 1 / Projektentwickler und Bautraeger
- Eigenes Ankaufsteam oder veroeffentlichtes Ankaufsprofil.
- Laufende oder wiederkehrende Projektpipeline.
- Eigene Verantwortung fuer Entwicklung und Investitionsentscheidungen.
- Nachverdichtung, Konversion, Aufstockung, Neubau oder Quartiersentwicklung.
- Mehrere Projekte, Standorte oder erkennbare regionale Expansion.
Keine feste Groessenschwelle. Aktuelle Projekte und ein konkretes Ankaufsprofil sind aussagekraeftiger als die Mitarbeiterzahl.
Kein Fit: reiner Generalunternehmer oder Bauausfuehrer ohne eigene Entwicklung; Einzelprojekt-SPV ohne erkennbare Folgepipeline oder zuordenbare aktive Gruppe.

### 2 / Bestandshalter und Wohnungswirtschaft
- Eigener Immobilienbestand oder Verantwortung fuer ein Bestandsportfolio.
- Aktive Bestandsentwicklung.
- Sichtbare Modernisierungs-, Sanierungs- oder ESG-Aktivitaeten.
- Ankauf, Verkauf oder aktive Portfoliosteuerung.
- Wiederkehrende Investitionen in den Bestand.
Orientierung: ab ca. 500 Einheiten grundsaetzlich relevant; ab ca. 2.000 Einheiten starkes Groessensignal. Kleinere Bestaende bei erkennbarer Entwicklungs- oder Ankaufsaktivitaet relevant. Keine harten Ausschlussgrenzen.
Bei Gewerbe- oder gemischten Portfolios auch Objektzahl, Flaeche und Portfoliovolumen beruecksichtigen. Keine kuenstliche Umrechnung in Wohneinheiten.
Kein Fit: reine Hausverwaltung ohne Eigenbestand, Investitionsverantwortung oder entsprechendes Mandat.

### 3 / Asset Manager und Investment Manager
- Aktive Steuerung eigener oder fremder Immobilienportfolios.
- Asset-Management-, Investment- oder Ankaufsmandate.
- Verantwortung fuer Businessplaene, Wertsteigerung oder Investitionsmassnahmen.
- Transaktions-, Entwicklungs-, Repositionierungs- oder ESG-Aktivitaeten.
- Wiederkehrende Mandate oder mehrere betreute Objekte.
Eigentum ist keine Voraussetzung. Ein belegtes Mandat mit relevanter Entscheidungs- oder Steuerungsverantwortung genuegt.
Kein Fit: ausschliesslich administrative Objektbetreuung; reines Property oder Facility Management ohne strategisches Mandat; ausschliesslich Wertpapierverwaltung ohne Immobilienbezug.

### 4 / Architekten und Planer
- Machbarkeitsstudien als eigenstaendige Leistung.
- Grundstuecks-, Standort- oder Entwicklungskonzepte.
- Projektentwickler, Bestandshalter, Investoren oder Kommunen als Auftraggeber.
- Wiederkehrende Beteiligung an fruehen Projektphasen.
Orientierung: ab ca. 15 Mitarbeitenden. Kleinere Bueros koennen bei klarer Spezialisierung passen. Groesse allein ersetzt keine relevante Leistung.
Kein Fit: reine Ausfuehrungsplanung; ausschliesslich Innenarchitektur; Ein- und Zweifamilienhaeuser als Schwerpunkt ohne relevante Entwicklungstaetigkeit.

### 5 / Makler und Immobilienberater
- Grundstuecks-, Investment- oder Gewerbevermittlung.
- Eigene Objektakquise und systematische Marktbearbeitung.
- Beratung ueber die reine Vermittlung hinaus.
- Zugang zu Investoren, Eigentuemern oder Projektentwicklern.
- Wiederkehrende Transaktionsaktivitaet.
Kein Fit: reine Wohnungsvermietung; Franchise-Einzelbuero ohne relevantes Investment- oder Grundstuecksgeschaeft.

### 6 / Banken und Finanzierer
- Gewerbliche Immobilienfinanzierung.
- Eigenes Immobilienkreditportfolio.
- Eigene Immobilienbewertung oder Beleihungswertermittlung.
- Finanzierung von Projektentwicklungen oder Bestandsinvestitionen.
- Belegte Aufgaben zu Immobilienrisiken, ESG-Pruefung oder Portfolioueberwachung.
Keine regulatorischen Pflichten pauschal unterstellen. Kein Fit: reines Privatkundengeschaeft ohne relevante gewerbliche Immobilienaktivitaeten.

### 7 / Sonstige Organisationen mit Immobilien- oder Grundbesitz
Beispiele: Kommunen, Stadtwerke, Energieversorger, Kirchen, Versicherungen, Family Offices und Unternehmen mit eigenen Betriebsimmobilien.
- Nennenswerter eigener Grund- oder Immobilienbesitz.
- Erkennbare Entwicklungs-, Investitions- oder Verwertungsabsicht.
- Aktive Bewirtschaftung oder strategische Steuerung des Portfolios.
- Konkrete Projekte oder zustaendige Organisationseinheiten.
Grundbesitz allein reicht nicht. Eine relevante Aktivitaet oder Verantwortung muss erkennbar sein.

## Disqualifikatoren

Wenn einer zutrifft, ausdruecklich benennen:
- Relevante Geschaeftstaetigkeit und Immobilienaktivitaeten vollstaendig ausserhalb der definierten Zielregion.
- Weder eigener Bestand noch relevante Projekt-, Beratungs-, Finanzierungs-, Vermittlungs- oder Investitionsmandate.
- Bestaetigtes Ein-Personen-Unternehmen ohne Team.
- Reine Verwaltung, Facility Management, Handwerk oder Bauausfuehrung ohne die fuer das Segment erforderliche Taetigkeit.
- Belegte Insolvenz oder Abwicklung.
- Nachweislich eingestelltes relevantes Geschaeft.

Ein Unternehmensverkauf allein ist kein Ausschluss. Pruefen, ob das relevante Geschaeft weitergefuehrt wird. Ein auslaendischer Unternehmenssitz ist kein Ausschluss, wenn relevante Aktivitaeten in der Zielregion bestehen.

Disqualifikatoren segmentbezogen anwenden: Ein Architekt benoetigt keinen Eigenbestand, ein Asset Manager kein Eigentum und ein Finanzierer kein Ankaufsmandat.

## Scoring

### A / Klarer Zielgruppenfit
Mehrere relevante Fit-Kriterien belegt, aktive Geschaeftstaetigkeit erkennbar, keine Disqualifikatoren. Entscheidung: priorisiert bearbeiten.

### B / Grundsaetzlicher Zielgruppenfit
Segment und relevante Taetigkeit belegt, aber eine zentrale Frage offen, z. B. Umfang, Mandat, aktuelle Aktivitaet oder Region. Entscheidung: bearbeiten und die offene Frage gezielt klaeren.

### C / Randfall
Nur begrenzte Zielgruppenpassung oder nur mit spezifischem Anlass sinnvoll. Entscheidung: zurueckstellen; keine aktive telefonische Ansprache.

### D / Kein Zielgruppenfit
Ausschlusskriterium belegt oder relevante Taetigkeit nachweislich nicht gegeben. Entscheidung: ausschliessen.

### Nicht bewertbar / Quellenlage unzureichend
Die verfuegbaren Informationen erlauben keine belastbare Einordnung. Entscheidung: Recherche ergaenzen. Keinen A-D-Score auf Verdacht vergeben.

## Bewertungsgrundsatz

Groesse verstaerkt oder schwaecht Aktivitaetssignale. Sie entscheidet nicht allein. Ein kleiner Entwickler mit konkretem Ankaufsprofil kann relevanter sein als ein grosser Konzern ohne erkennbare passende Aktivitaet.

Der Score bewertet die Zielgruppenpassung. Er ist kein Nachweis fuer Bedarf, Budget oder Kaufbereitschaft.

## Pain-Hypothese und Einstiegspunkt

Nur aus belegten Informationen ableiten. Rangfolge der Grundlagen:
1. Eigene Aussagen des Unternehmens.
2. Konkrete Projekte, Mandate, Stellenanzeigen oder Veraenderungen.
3. Strukturelle Merkmale wie Segment, Portfolio und Groesse.
4. Rollenlogik als ausdruecklich gekennzeichnete Hypothese.

Moegliche Themen: Ankauf und Pruefung von Investitionsmoeglichkeiten; Projektpriorisierung und Machbarkeit; Bestandsentwicklung und Massnahmenplanung; Portfoliosteuerung und Reporting; Abstimmung zwischen internen Teams und externen Beteiligten.

Keine Probleme als Tatsachen darstellen. Keine Zeitverluste, Kosten, Datenprobleme oder Engpaesse erfinden. Fehlt eine belastbare Grundlage, ausgeben: „Keine belastbare Pain-Hypothese ableitbar.“

Der Einstiegspunkt ist ein konkreter, belegter Aufhaenger: Projekt, Meldung, Interview, Mandat, Ankaufsprofil oder Stellenausschreibung. Ohne aktuellen Anlass einen belegten Taetigkeitsbezug verwenden und keinen aktuellen Handlungsdruck behaupten.

## Quellen- und Qualitaetsregeln

- Jedes Fit-Signal braucht einen nachvollziehbaren Beleg. Unternehmenswebsite und eigene Veroeffentlichungen bevorzugen; ergaenzende oeffentliche Quellen bei Bedarf nutzen und kennzeichnen.
- Fehlende Angaben als „nicht auffindbar“ ausweisen, niemals mit „nicht vorhanden“ gleichsetzen.
- Projekte auf Aktualitaet pruefen. Ein historisches Projekt allein belegt keine laufende Pipeline.
- Mitarbeiterzahlen, Einheiten und Portfoliovolumen nur mit Quelle nennen.
- Konzern, operative Gesellschaft und Projektgesellschaft unterscheiden. Gruppenaktivitaeten nicht ungeprueft einzelnen Gesellschaften zurechnen.
- Widerspruechliche oder veraltete Angaben offen benennen. Bei duenner Website sagen, welche Informationen fehlen.
- Bei D keine Rettungsversuche. Keine abschliessende Zusammenfassung und keine ungefragten Strategieratschlaege.${offerBlock}

## Ausgabeformat

Gib die Ergebnisse als strukturiertes JSON zurueck (wird durch das output_config Schema erzwungen).
- segments: Array der Segmentnamen (dominantes zuerst)
- score: A / B / C / D / nicht_bewertbar
- whatTheyDo: Zwei sachliche Saetze
- fitSignals: Array mit {text, url} — jedes Signal braucht eine direkte URL als Beleg
- against: Belegte Gegenpunkte oder leeres Array wenn keine Disqualifikatoren gefunden
- decision: Priorisiert bearbeiten / bearbeiten und klaeren / zurueckstellen / ausschliessen / Recherche ergaenzen
- decisionReason: Ein Satz zur Begruendung
- painHypothesis: Ein Satz, ausdruecklich als Hypothese formuliert, oder „Keine belastbare Pain-Hypothese ableitbar.“
- entryPoint: Konkreter, belegter Aufhaenger
- openQuestion: Eine zentrale Frage oder „Keine zentrale Frage offen.“`;
}

// ---------------------------------------------------------------------------
// extractText — pull text blocks from a response
// ---------------------------------------------------------------------------

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

// ---------------------------------------------------------------------------
// runIcpCheck — single company, no caching
// ---------------------------------------------------------------------------

const MAX_PAUSE_ITERATIONS = 5;

export async function runIcpCheck(input: {
  companyName: string;
  domain: string | null;
  campaign: Campaign;
}): Promise<CompanyCheck> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() });
  const systemPrompt = buildIcpSystemPrompt(input.campaign);

  const domainInfo = input.domain ? ` (${input.domain})` : '';
  const userPrompt = `Recherchiere und bewerte: ${input.companyName}${domainInfo}

Zielregion: Deutschland.`;

  // Step 1: Web search + web fetch to gather evidence
  let messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  let response!: Anthropic.Message;

  for (let i = 0; i < MAX_PAUSE_ITERATIONS; i++) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 6 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
      ],
      system: systemPrompt,
      messages,
    });

    if (response.stop_reason !== 'pause_turn') break;
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
    ];
  }

  const researchNotes = extractText(response);

  // Step 2: Structured output (no tools — parse call)
  let parsed: Awaited<ReturnType<typeof client.messages.parse>>;

  try {
    parsed = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(CompanyCheckOutputSchema),
      },
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Bewerte das folgende Unternehmen anhand der Rechercheergebnisse.

Unternehmen: ${input.companyName}${domainInfo}

## Rechercheergebnisse
${researchNotes || '(keine Ergebnisse)'}

Gib die strukturierte Bewertung als JSON zurueck.`,
        },
      ],
    });
  } catch {
    // Fallback: if combining tools + structured output failed, the two-step
    // approach already separated them; re-throw if parse itself failed
    throw new Error(
      `ICP-Check fuer ${input.companyName} fehlgeschlagen. Bitte erneut versuchen.`,
    );
  }

  if (!parsed.parsed_output) {
    throw new Error(
      `ICP-Check fuer ${input.companyName}: strukturierte Ausgabe konnte nicht verarbeitet werden.`,
    );
  }

  const raw = parsed.parsed_output;
  const key = companyKey(input.domain, input.companyName);

  const check: CompanyCheck = {
    id: '', // set by DB
    companyKey: key ?? `name:${input.companyName.toLowerCase().trim()}`,
    companyName: raw.companyName || input.companyName,
    domain: raw.domain ?? input.domain,
    segments: raw.segments,
    score: raw.score,
    whatTheyDo: raw.whatTheyDo,
    fitSignals: raw.fitSignals,
    against: raw.against,
    decision: raw.decision,
    decisionReason: raw.decisionReason,
    painHypothesis: raw.painHypothesis,
    entryPoint: raw.entryPoint,
    openQuestion: raw.openQuestion,
    checkedAt: new Date().toISOString(),
  };

  return normalizeIcpResult(check);
}

// ---------------------------------------------------------------------------
// getOrRunCompanyCheck — cached by company_key in company_check table
// ---------------------------------------------------------------------------

export async function getOrRunCompanyCheck(
  lead: Lead,
  campaign: Campaign,
  force = false,
): Promise<CompanyCheck> {
  const db = getDb();
  const key = lead.companyKey ?? companyKey(lead.companyDomain, lead.company);

  if (!key) {
    throw new Error(
      'Weder Domain noch Firmenname vorhanden — ICP-Check nicht moeglich.',
    );
  }

  // Check cache (unless forced)
  if (!force) {
    const { data: existing } = await db
      .from('company_check')
      .select('*')
      .eq('company_key', key)
      .single();

    if (existing) {
      return toCompanyCheck(existing as CompanyCheckRow);
    }
  }

  // Run the check
  const check = await runIcpCheck({
    companyName: lead.company ?? 'Unbekannt',
    domain: lead.companyDomain,
    campaign,
  });

  // Upsert into cache
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, checkedAt: _ca, ...resultPayload } = check;
  const { data: row, error } = await db
    .from('company_check')
    .upsert(
      {
        company_key: key,
        company_name: check.companyName,
        domain: check.domain,
        result: resultPayload,
        score: check.score,
        checked_at: new Date().toISOString(),
      },
      { onConflict: 'company_key' },
    )
    .select()
    .single();

  if (error || !row) {
    console.error('company_check upsert failed:', error);
    // Return the in-memory result even if caching fails
    return check;
  }

  return toCompanyCheck(row as CompanyCheckRow);
}
