/**
 * Outbound Brain — v2 Demo seed data (TEST/Beispiel dataset).
 *
 * Fictional offer: SDR-Onboarding-Software.
 * All names / companies / emails / URLs marked [TEST/Beispiel] — never real contacts.
 *
 * Examples A–E per REVISION_V2.md §"Demo data":
 *   A (Klaus Bauer)   — HIGH   : company fits, chat expresses onboarding problem + requests talk
 *   E (Max Müller)    — HIGH   : company fits, specific need in chat, role unknown → "Rolle klären"
 *   B (Laura Meier)   — MEDIUM : company fits, 5 SDR roles open, need = hypothesis
 *   C (Stefan Richter)— LOW    : company fits (partial role), accepted connection only
 *   D (Petra Vogel)   — REVIEW : company outside ICP (too small), specific interest
 *
 * Historic leads H1–H4: "Einstellungswelle im Vertrieb" contradicted 3 of 4 times
 *   → "Vorschläge berechnen" produces one visible proposal for the demo.
 *
 * seedDemo() is idempotent (upsert on id). Touches only rows with DEMO_IDS.
 * Called by scripts/seed.ts and app/api/seed/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CallBriefing } from './types';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface SeedResult {
  counts: Record<string, number>;
  eventId: string | null;
}

// ---------------------------------------------------------------------------
// Fixed UUIDs — identical across re-runs (idempotent upsert)
// ---------------------------------------------------------------------------

export const DEMO_IDS = {
  campaign: '10000001-0000-0000-0000-000000000001',

  triggers: {
    expressedNeed:       '20000001-0000-0000-0000-000000000001',
    conversationRequest: '20000001-0000-0000-0000-000000000002',
    hiringSurge:         '20000001-0000-0000-0000-000000000003',
    newSalesLeader:      '20000001-0000-0000-0000-000000000004',
    linkedinConnection:  '20000001-0000-0000-0000-000000000005',
    funding:             '20000001-0000-0000-0000-000000000006',
    expansion:           '20000001-0000-0000-0000-000000000007',
    crmSwitch:           '20000001-0000-0000-0000-000000000008',
  },

  leads: {
    exampleA:   '30000001-0000-0000-0000-000000000001',
    exampleB:   '30000001-0000-0000-0000-000000000002',
    exampleC:   '30000001-0000-0000-0000-000000000003',
    exampleD:   '30000001-0000-0000-0000-000000000004',
    exampleE:   '30000001-0000-0000-0000-000000000005',
    historicH1: '30000001-0000-0000-0000-000000000011',
    historicH2: '30000001-0000-0000-0000-000000000012',
    historicH3: '30000001-0000-0000-0000-000000000013',
    historicH4: '30000001-0000-0000-0000-000000000014',
  },

  leadTriggers: {
    exampleA1:   '40000001-0000-0000-0000-000000000001',
    exampleA2:   '40000001-0000-0000-0000-000000000002',
    exampleB1:   '40000001-0000-0000-0000-000000000003',
    exampleC1:   '40000001-0000-0000-0000-000000000004',
    exampleD1:   '40000001-0000-0000-0000-000000000005',
    exampleE1:   '40000001-0000-0000-0000-000000000006',
    historicH1t: '40000001-0000-0000-0000-000000000011',
    historicH2t: '40000001-0000-0000-0000-000000000012',
    historicH3t: '40000001-0000-0000-0000-000000000013',
    historicH4t: '40000001-0000-0000-0000-000000000014',
  },

  context: {
    exampleA1: '70000001-0000-0000-0000-000000000001',
    exampleA2: '70000001-0000-0000-0000-000000000002',
    exampleE1: '70000001-0000-0000-0000-000000000003',
  },

  bantClaims: {
    exampleA_need:      '80000001-0000-0000-0000-000000000001',
    exampleA_authority: '80000001-0000-0000-0000-000000000002',
  },

  callLogs: {
    historicH1: '90000001-0000-0000-0000-000000000001',
    historicH2: '90000001-0000-0000-0000-000000000002',
    historicH3: '90000001-0000-0000-0000-000000000003',
    historicH4: '90000001-0000-0000-0000-000000000004',
  },

  events: {
    exampleAMeeting: '50000001-0000-0000-0000-000000000001',
  },
} as const;

// ---------------------------------------------------------------------------
// Pre-computed CallBriefing objects — v2 shape (German, TEST/Beispiel)
// ---------------------------------------------------------------------------

const exampleABrief: CallBriefing = {
  headline: 'Klaus Bauer – VP Sales, FitTech GmbH: SDR-Onboarding-Problem bestätigt [TEST/Beispiel]',
  context:
    'FitTech GmbH, ca. 100 Mitarbeiter, München. Klaus Bauer verantwortet als VP Sales den gesamten Vertriebsaufbau. Unternehmen wächst und baut aktiv das SDR-Team aus.',
  whyNow:
    'Klaus Bauer hat im Chat konkreten Bedarf an schnellerem SDR-Onboarding geäußert und aktiv ein Gespräch angefragt.',
  evidenceUrl: null,
  evidenceNote: 'Chat vom 29.10.2026: „Das Onboarding neuer SDRs dauert bei uns viel zu lang – wir verlieren 6 Wochen, bis die Kollegen selbstständig Gespräche führen."',
  hook:
    'Sie haben das SDR-Onboarding im Chat konkret als Problem angesprochen – ich würde gerne verstehen, wo heute der größte Aufwand steckt.',
  facts: [
    'Klaus Bauer ist VP Sales bei FitTech GmbH (ca. 100 MA, München)',
    'Kontakt hat das Onboarding-Problem konkret im Chat beschrieben und ein Gespräch angefragt',
    'Unternehmen liegt im ICP-Bereich (Rolle, Größe, Region)',
  ],
  hypotheses: [
    'FitTech nutzt kein spezialisiertes SDR-Onboarding-Tool (nicht verifiziert)',
    'Budget-Entscheidung liegt ggf. bei Klaus Bauer oder einem Komitee (unklar)',
  ],
  openQuestions: [
    'Wo steckt heute der größte Aufwand beim SDR-Onboarding?',
    'Wer sollte bei der Lösungsbewertung noch dabei sein?',
    'Was soll die Demo konkret zeigen?',
  ],
  bant: [
    { dimension: 'budget', status: 'open', value: null, evidence: null },
    { dimension: 'authority', status: 'assumed', value: 'VP Sales – Entscheidungsrahmen noch unklar', evidence: 'Kontakt spricht von „wir" im Chat' },
    { dimension: 'need', status: 'confirmed', value: 'SDR-Onboarding dauert 6 Wochen', evidence: 'Chat vom 29.10.2026' },
    { dimension: 'timeline', status: 'open', value: null, evidence: null },
  ],
  talkingPoints: [
    'Neue SDRs sind typisch 4–6 Wochen ohne produktive Anrufe – unsere Kunden halbieren diese Zeit.',
    'Das tägliche Briefing gibt jedem SDR die Top-Leads mit Grund und Gesprächsleitfaden.',
    'Setup dauert unter 30 Minuten bis zum ersten Briefing – keine On-Premise-Komponenten.',
  ],
  objections: [
    {
      objection: 'Wir schulen unsere SDRs intern.',
      answer:
        'Das ergänzt sich gut: Das Tool gibt jedem SDR sofort die Vorbereitung, die sonst ein Senior-Verkäufer liefert – ohne Ihre internen Prozesse zu ersetzen.',
    },
    {
      objection: 'Wir haben schon genug Tools.',
      answer:
        'Offene Frage: Welche Tools nutzt Ihr Team heute für die Gesprächsvorbereitung? (Antwort hängt von der konkreten Toollandschaft ab.)',
    },
  ],
  phone: '+49 89 123 456 78',
  consentLine:
    'Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Nur mit Ihrer ausdrücklichen Zustimmung.',
  meetingSlots: [
    'Do 14:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
    'Fr 10:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
  ],
  contact: 'Klaus Bauer, VP Sales – FitTech GmbH, München [TEST/Beispiel]',
  goal: 'Bedarf konkretisieren, Demo-Ziel gemeinsam festlegen und nächsten Schritt vereinbaren',
  assumptions: [
    'FitTech nutzt kein spezialisiertes SDR-Onboarding-Tool (nicht verifiziert)',
    'Klaus Bauer ist Hauptansprechpartner für die Entscheidung (angenommen, nicht bestätigt)',
  ],
};

const exampleBBrief: CallBriefing = {
  headline: 'Laura Meier – Sales Manager, Nexcom AG: 5 SDR-Stellen offen [TEST/Beispiel]',
  context:
    'Nexcom AG, ca. 85 Mitarbeiter, Hamburg. Laura Meier ist Sales Manager und koordiniert das SDR-Team. Unternehmen schreibt aktiv SDR-Stellen aus.',
  whyNow:
    'Nexcom AG hat in den letzten 30 Tagen 5 SDR-Stellen ausgeschrieben – Hypothese: steigender Bedarf an Onboarding-Effizienz.',
  evidenceUrl: 'https://www.nexcom.example.com/karriere/sdr-stellen',
  evidenceNote: 'Stellenausschreibungen gefunden am 20.10.2026 (Needle Company Jobs).',
  hook:
    'Sie bauen gerade ein größeres SDR-Team auf – welche Erfahrungen machen Sie beim Onboarding neuer Mitarbeiter?',
  facts: [
    'Nexcom AG hat in den letzten 30 Tagen 5 SDR-Stellen ausgeschrieben',
    'Laura Meier ist Sales Manager und koordiniert das SDR-Team',
    'Unternehmen liegt im ICP-Bereich (Rolle, Größe, Region)',
  ],
  hypotheses: [
    'Einstellungswelle deutet auf Bedarf an Onboarding-Effizienz hin (nicht bestätigt)',
    'Budget könnte für neue Tools vorhanden sein – muss im Gespräch geprüft werden',
  ],
  openQuestions: [
    'Wie läuft das Onboarding neuer SDRs heute ab?',
    'Was ist der größte Engpass beim Hochlaufen neuer Mitarbeiter?',
    'Wer ist in die Tool-Entscheidung eingebunden?',
  ],
  bant: [
    { dimension: 'budget', status: 'open', value: null, evidence: null },
    { dimension: 'authority', status: 'open', value: null, evidence: null },
    { dimension: 'need', status: 'assumed', value: 'Onboarding-Bedarf bei SDR-Einstellungswelle (Hypothese)', evidence: 'Stellenausschreibungen' },
    { dimension: 'timeline', status: 'open', value: null, evidence: null },
  ],
  talkingPoints: [
    'Neue SDRs sind typisch 4–6 Wochen ohne produktive Anrufe.',
    'Das Tool gibt jedem SDR am ersten Tag eine briefingfähige Tagesagenda.',
    'HubSpot-Integration nativ verfügbar.',
  ],
  objections: [
    {
      objection: 'Wir stellen gerade erst ein – zu früh für Tools.',
      answer:
        'Genau der richtige Zeitpunkt: Das Tool bringt neue Mitarbeiter schneller auf Produktivitätsniveau – je früher der Start, desto mehr Gespräche.',
    },
    {
      objection: 'Unser HR-Prozess läuft noch.',
      answer:
        'Offene Frage: Wann starten die ersten neuen SDRs voraussichtlich? (Antwort bestimmt den sinnvollen Einführungszeitpunkt.)',
    },
  ],
  phone: null,
  consentLine:
    'Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Nur mit Ihrer ausdrücklichen Zustimmung.',
  meetingSlots: [
    'Do 14:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
    'Fr 10:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
  ],
  contact: 'Laura Meier, Sales Manager – Nexcom AG, Hamburg [TEST/Beispiel]',
  goal: 'Onboarding-Situation explorieren und Bedarf als Hypothese prüfen',
  assumptions: [
    'Einstellungswelle impliziert Onboarding-Bedarf – nicht verifiziert',
    'Budget und Entscheidungsweg unbekannt',
  ],
};

const exampleCBrief: CallBriefing = {
  headline: 'Stefan Richter – Account Executive, InnoVent GmbH: Vernetzung angenommen [TEST/Beispiel]',
  context:
    'InnoVent GmbH, ca. 75 Mitarbeiter, Frankfurt. Stefan Richter ist Account Executive. Kontakt hat eine Vernetzungsanfrage angenommen – kein weiteres Signal vorhanden.',
  whyNow:
    'Schwaches Kontaktsignal: Vernetzungsanfrage angenommen, kein geäußerter Bedarf oder Gesprächswunsch.',
  evidenceUrl: 'https://www.linkedin.example.com/in/stefan-richter-innovent',
  evidenceNote: 'Vernetzungsanfrage angenommen am 15.10.2026.',
  hook:
    'Stefan, wir haben uns kürzlich auf LinkedIn vernetzt – ich schaue kurz, ob das Thema SDR-Effizienz für Sie relevant sein könnte.',
  facts: [
    'Stefan Richter ist Account Executive bei InnoVent GmbH (ca. 75 MA, Frankfurt)',
    'Vernetzungsanfrage wurde am 15.10.2026 angenommen',
  ],
  hypotheses: [
    'Kontakt könnte Interesse am Thema Outbound haben (spekulativ – kein Beleg)',
    'Rolle Account Executive: Entscheidungsrahmen unklar, ggf. kein Budget-Owner',
  ],
  openQuestions: [
    'Welche Herausforderungen hat das Vertriebsteam derzeit?',
    'Gibt es eine Person bei InnoVent, die für Outbound-Tooling verantwortlich ist?',
    'Was hat dazu geführt, die Vernetzungsanfrage anzunehmen?',
  ],
  bant: [
    { dimension: 'budget', status: 'open', value: null, evidence: null },
    { dimension: 'authority', status: 'open', value: null, evidence: null },
    { dimension: 'need', status: 'open', value: null, evidence: null },
    { dimension: 'timeline', status: 'open', value: null, evidence: null },
  ],
  talkingPoints: [],
  objections: [],
  phone: null,
  consentLine:
    'Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Nur mit Ihrer ausdrücklichen Zustimmung.',
  meetingSlots: [
    'Do 14:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
    'Fr 10:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
  ],
  contact: 'Stefan Richter, Account Executive – InnoVent GmbH, Frankfurt [TEST/Beispiel]',
  goal: 'Kontext erkunden und prüfen, ob ein relevanter Gesprächspartner vorhanden ist',
  assumptions: [
    'Unbekannt, ob InnoVent ein relevantes Anwendungsfeld für SDR-Onboarding-Software hat',
    'Rolle Account Executive nicht im ICP-Kern (kein Budget-Owner)',
  ],
};

const exampleDBrief: CallBriefing = {
  headline: 'Petra Vogel – Marketing Director, StartupXYZ: Außerhalb ICP [TEST/Beispiel]',
  context:
    'StartupXYZ, ca. 15 Mitarbeiter, Berlin. Petra Vogel ist Marketing Director. Unternehmen ist zu klein für den ICP (min. 50 MA) und Rolle ist nicht im ICP.',
  whyNow:
    'Kontakt hat Interesse an SDR-Effizienz im Chat geäußert, aber Unternehmen liegt außerhalb des ICP.',
  evidenceUrl: null,
  evidenceNote: 'Chat vom 27.10.2026: Spezifisches Interesse geäußert, Unternehmen aber zu klein.',
  hook:
    'Petra, Sie haben das Thema SDR-Effizienz angesprochen – ich möchte kurz prüfen, ob unser Ansatz für Ihre Situation passt.',
  facts: [
    'StartupXYZ hat ca. 15 Mitarbeiter (unterhalb ICP-Minimum von 50)',
    'Rolle Marketing Director liegt außerhalb des Sales-ICP',
    'Kontakt hat Interesse an SDR-Effizienz geäußert',
  ],
  hypotheses: [
    'Eventuell relevanter Kontakt für eine spätere Ansprache, wenn das Unternehmen wächst',
    'Mögliche Referenz zu einem passenden Kontakt im Netzwerk',
  ],
  openQuestions: [
    'Gibt es einen Sales-Verantwortlichen im Unternehmen, der für Outbound zuständig ist?',
    'Plant StartupXYZ Wachstum im Vertrieb in den nächsten 6–12 Monaten?',
  ],
  bant: [
    { dimension: 'budget', status: 'open', value: null, evidence: null },
    { dimension: 'authority', status: 'open', value: null, evidence: null },
    { dimension: 'need', status: 'assumed', value: 'Interesse an SDR-Effizienz', evidence: 'Chat vom 27.10.2026' },
    { dimension: 'timeline', status: 'open', value: null, evidence: null },
  ],
  talkingPoints: [],
  objections: [],
  phone: null,
  consentLine:
    'Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Nur mit Ihrer ausdrücklichen Zustimmung.',
  meetingSlots: [
    'Do 14:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
    'Fr 10:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
  ],
  contact: 'Petra Vogel, Marketing Director – StartupXYZ, Berlin [TEST/Beispiel]',
  goal: 'Prüfen, ob Weiterverweis zu einem relevanten Kontakt möglich ist',
  assumptions: [
    'Unternehmen zu klein für direkte Ansprache (ICP: min. 50 MA)',
    'Rolle Marketing Director kein Budget-Owner für Sales-Tools',
  ],
};

const exampleEBrief: CallBriefing = {
  headline: 'Max Müller – Rolle unbekannt, TurboSales GmbH: Onboarding-Problem geäußert [TEST/Beispiel]',
  context:
    'TurboSales GmbH, ca. 120 Mitarbeiter, Köln. Kontakt hat konkreten Bedarf geäußert – Rolle noch unbekannt, muss im Gespräch geklärt werden.',
  whyNow:
    'Kontakt hat im Chat ein spezifisches Onboarding-Problem geäußert. Rolle und Entscheidungsweg sind noch ungeklärt.',
  evidenceUrl: null,
  evidenceNote: 'Chat vom 27.10.2026: „Das Onboarding-Problem im Vertrieb ist wirklich real – neue Mitarbeiter brauchen viel zu lange, bis sie produktiv werden."',
  hook:
    'Sie haben das Onboarding-Thema im Chat angesprochen – ich würde gerne verstehen, was das konkret für Ihr Team bedeutet und wer bei Ihnen am besten als Gesprächspartner passt.',
  facts: [
    'TurboSales GmbH, ca. 120 Mitarbeiter, Köln – liegt im ICP-Bereich (Größe, Region)',
    'Kontakt hat Onboarding-Problem konkret im Chat beschrieben',
    'Rolle und Position im Unternehmen noch unklar',
  ],
  hypotheses: [
    'Kontakt könnte ein Entscheidungsträger oder Champion sein (nicht verifiziert)',
    'Bedarf an SDR-Onboarding-Tool bei Unternehmen dieser Größe wahrscheinlich',
  ],
  openQuestions: [
    'Was ist Ihre konkrete Rolle bei TurboSales – wer ist bei Ihnen für Vertriebstools zuständig?',
    'Wie sieht das SDR-Onboarding heute aus und wo liegt der größte Aufwand?',
    'Wer sollte bei einer Lösungsbewertung dabei sein?',
  ],
  bant: [
    { dimension: 'budget', status: 'open', value: null, evidence: null },
    { dimension: 'authority', status: 'open', value: null, evidence: null },
    { dimension: 'need', status: 'confirmed', value: 'SDR-Onboarding dauert zu lang', evidence: 'Chat vom 27.10.2026' },
    { dimension: 'timeline', status: 'open', value: null, evidence: null },
  ],
  talkingPoints: [
    'Neue SDRs sind typisch 4–6 Wochen ohne produktive Anrufe – wir halbieren diese Zeit.',
    'Das Tool passt sich an jede Teamgröße an – ab 2 SDRs bis enterprise.',
  ],
  objections: [
    {
      objection: 'Ich bin vielleicht nicht der richtige Ansprechpartner.',
      answer:
        'Kein Problem – könnten Sie mir sagen, wer bei Ihnen für Vertriebstools verantwortlich ist? Ich kann direkt mit dem richtigen Ansprechpartner sprechen.',
    },
  ],
  phone: null,
  consentLine:
    'Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Nur mit Ihrer ausdrücklichen Zustimmung.',
  meetingSlots: [
    'Do 14:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
    'Fr 10:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
  ],
  contact: 'Max Müller (Rolle unbekannt) – TurboSales GmbH, Köln [TEST/Beispiel]',
  goal: 'Rolle klären, Bedarf konkretisieren und richtigen Gesprächspartner identifizieren',
  assumptions: [
    'Kontakt hat möglicherweise Entscheidungs- oder Empfehlungsrolle (nicht verifiziert)',
    'TurboSales GmbH hat Bedarf an SDR-Onboarding-Tool (basierend auf Chat-Aussage)',
  ],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function upsert(
  db: SupabaseClient,
  table: string,
  data: Record<string, unknown> | Record<string, unknown>[],
): Promise<void> {
  const { error } = await db.from(table).upsert(data as never, { onConflict: 'id' });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

async function rowCount(db: SupabaseClient, table: string): Promise<number> {
  const { count } = await db.from(table).select('*', { count: 'exact', head: true });
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// seedDemo — idempotent, only touches rows with DEMO_IDS
// ---------------------------------------------------------------------------

/** Demo leads use fixed ids 30000001-0000-0000-0000-xxxxxxxxxxxx; real leads never fall in this range. */
const DEMO_LEAD_ID_MIN = '30000001-0000-0000-0000-000000000000';
const DEMO_LEAD_ID_MAX = '30000001-0000-0000-0000-ffffffffffff';
const DEMO_LEAD_CHILD_TABLES = [
  'call_log', 'bant_claim', 'lead_trigger', 'lead_context', 'lead_event', 'decision', 'cadence_step', 'agent_step',
] as const;

/** Removes everything a rehearsal added to demo leads and the demo campaign, so a reset is a true reset. */
async function clearDemoActivity(db: SupabaseClient): Promise<void> {
  for (const table of DEMO_LEAD_CHILD_TABLES) {
    const { error } = await db
      .from(table)
      .delete()
      .gte('lead_id', DEMO_LEAD_ID_MIN)
      .lte('lead_id', DEMO_LEAD_ID_MAX);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }
  const { error } = await db.from('campaign_proposal').delete().eq('campaign_id', DEMO_IDS.campaign);
  if (error) throw new Error(`clear campaign_proposal: ${error.message}`);
}

export async function seedDemo(db: SupabaseClient): Promise<SeedResult> {
  await clearDemoActivity(db);

  // ---- Campaign ----
  await upsert(db, 'campaign', {
    id: DEMO_IDS.campaign,
    offer:
      'SDR-Onboarding-Software für B2B-Sales-Teams: schnelleres Onboarding, mehr qualifizierte Erstgespräche [TEST/Beispiel]',
    icp_roles: ['VP Sales', 'Head of Sales', 'Sales Director', 'Sales Manager'],
    icp_company_size_min: 50,
    icp_company_size_max: 500,
    icp_regions: ['DACH', 'Deutschland', 'Österreich', 'Schweiz'],
    exclusions: ['Bestandskunden', 'offene Deals', 'Opt-outs'],
    language: 'de',
    tone: 'professional',
    offer_knowledge:
      'Genehmigtes Produktwissen [TEST/Beispiel – keine echten Versprechen]:\n' +
      '1. Die Software verkürzt die Ramp-up-Zeit neuer SDRs von typisch 4–6 Wochen auf 1–2 Wochen durch geführten Briefing-Prozess und Trigger-basierte Tagesagenda.\n' +
      '2. Preismodell: pro Nutzer/Monat, Mindestlaufzeit 6 Monate, Mengenrabatt ab 5 Nutzern.\n' +
      '3. Integrationen: HubSpot nativ, Salesforce in Beta, andere CRMs per Zapier.\n' +
      '4. Keine On-Premise-Komponenten – vollständig cloudbasiert, DSGVO-konform (EU-Server Frankfurt).\n' +
      '5. Einrichtungszeit: unter 30 Minuten bis zum ersten Briefing.',
    min_sample_size: 3,
    is_active: true,
  });

  // ---- Trigger catalog ----
  await upsert(db, 'trigger_catalog', [
    {
      id: DEMO_IDS.triggers.expressedNeed,
      campaign_id: DEMO_IDS.campaign,
      name: 'Geäußerter Bedarf',
      buying_reason:
        'Kontakt beschreibt ein spezifisches Problem direkt im Gespräch oder Chat – höchste Priorität, wenn Unternehmen passt.',
      tier: 1,
      window_days: 365,
      required_evidence: 'Chat- oder Gesprächsauszug mit Datum und Kontext',
      approved: true,
    },
    {
      id: DEMO_IDS.triggers.conversationRequest,
      campaign_id: DEMO_IDS.campaign,
      name: 'Ausdrücklicher Gesprächswunsch',
      buying_reason:
        'Kontakt bittet aktiv um ein Gespräch oder benennt einen konkreten nächsten Schritt.',
      tier: 1,
      window_days: 90,
      required_evidence: 'Chat- oder E-Mail-Auszug mit Datum',
      approved: true,
    },
    {
      id: DEMO_IDS.triggers.hiringSurge,
      campaign_id: DEMO_IDS.campaign,
      name: 'Einstellungswelle im Vertrieb',
      buying_reason:
        'Budget fließt aktiv in Outbound – gleichzeitig Bedarf an Onboarding-Tools für neue SDRs (Hypothese, nicht bestätigt).',
      tier: 2,
      window_days: 30,
      required_evidence: 'Aktive Stellenausschreibungen mit Datum (Needle Company Jobs, Karriereseite)',
      approved: true,
    },
    {
      id: DEMO_IDS.triggers.newSalesLeader,
      campaign_id: DEMO_IDS.campaign,
      name: 'Neue Vertriebsführungskraft',
      buying_reason:
        'Neue Führungskräfte überprüfen in den ersten 90 Tagen Prozesse und Tools – optimales Fenster.',
      tier: 1,
      window_days: 90,
      required_evidence: 'LinkedIn-Profil oder Post (Needle), Pressemitteilung mit Datum',
      approved: true,
    },
    {
      id: DEMO_IDS.triggers.linkedinConnection,
      campaign_id: DEMO_IDS.campaign,
      name: 'Vernetzungsanfrage angenommen',
      buying_reason:
        'Schwaches Kontaktsignal – kein Bedarf oder Kaufabsicht, aber Gesprächsanlass für kurzen Check.',
      tier: 3,
      window_days: 14,
      required_evidence: 'LinkedIn-Vernetzungsbestätigung mit Datum',
      approved: true,
    },
    {
      id: DEMO_IDS.triggers.funding,
      campaign_id: DEMO_IDS.campaign,
      name: 'Finanzierungsrunde',
      buying_reason:
        'Neues Kapital fließt in Skalierung und Tooling – erste 48 Stunden nach der Meldung entscheidend.',
      tier: 1,
      window_days: 180,
      required_evidence: 'Pressemitteilung, Investoren-Post oder Handelsregister mit Datum',
      approved: true,
    },
    {
      id: DEMO_IDS.triggers.expansion,
      campaign_id: DEMO_IDS.campaign,
      name: 'Expansion: neuer Markt oder Standort',
      buying_reason:
        'Neue Zielmärkte brauchen neue Pipeline – ohne lokales Netzwerk ist Outbound-Tooling besonders wertvoll.',
      tier: 2,
      window_days: 60,
      required_evidence: 'Unternehmensnews oder Pressemitteilung mit Datum',
      approved: true,
    },
    {
      id: DEMO_IDS.triggers.crmSwitch,
      campaign_id: DEMO_IDS.campaign,
      name: 'CRM- oder Sales-Tool-Wechsel',
      buying_reason:
        'Benachbarte Tools werden im gleichen Fenster überprüft – Einstieg in laufende Entscheidungsprozesse.',
      tier: 2,
      window_days: 90,
      required_evidence: 'Stellenausschreibung nennt das Tool, Post des Kontakts oder Vendor-Fallstudie',
      approved: true,
    },
  ]);

  // ---- Main leads A–E ----
  await upsert(db, 'lead', [
    {
      id: DEMO_IDS.leads.exampleA,
      name: 'Klaus Bauer',
      role: 'VP Sales',
      company: 'FitTech GmbH',
      company_domain: 'fittech.example.com',
      company_size: 100,
      region: 'Deutschland',
      email: 'k.bauer@fittech.example.com',
      phone: '+49 89 123 456 78',
      profile_url: 'https://www.linkedin.example.com/in/klaus-bauer-fittech',
      source: 'seed',
      fit_score: 85,
      interest_score: 60,
      priority: 'medium',        // overwritten by refreshLeadPriority
      priority_reason: '',
      fit_status: 'unknown',
      need_status: 'unknown',
      willingness: 'unknown',
      status: 'briefed',
      cached_brief: exampleABrief,
    },
    {
      id: DEMO_IDS.leads.exampleB,
      name: 'Laura Meier',
      role: 'Sales Manager',
      company: 'Nexcom AG',
      company_domain: 'nexcom.example.com',
      company_size: 85,
      region: 'Deutschland',
      email: 'l.meier@nexcom.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/laura-meier-nexcom',
      source: 'seed',
      fit_score: 70,
      interest_score: 15,
      priority: 'medium',
      priority_reason: '',
      fit_status: 'unknown',
      need_status: 'unknown',
      willingness: 'unknown',
      status: 'researched',
      cached_brief: exampleBBrief,
    },
    {
      id: DEMO_IDS.leads.exampleC,
      name: 'Stefan Richter',
      role: 'Account Executive',
      company: 'InnoVent GmbH',
      company_domain: 'innovent.example.com',
      company_size: 75,
      region: 'Deutschland',
      email: 's.richter@innovent.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/stefan-richter-innovent',
      source: 'seed',
      fit_score: 45,
      interest_score: 5,
      priority: 'medium',
      priority_reason: '',
      fit_status: 'unknown',
      need_status: 'unknown',
      willingness: 'unknown',
      status: 'new',
      cached_brief: exampleCBrief,
    },
    {
      // D: company_size=15 → BELOW icpCompanySizeMin(50) → fitStatus='outside' → REVIEW
      id: DEMO_IDS.leads.exampleD,
      name: 'Petra Vogel',
      role: 'Marketing Director',
      company: 'StartupXYZ',
      company_domain: 'startupxyz.example.com',
      company_size: 15,
      region: 'Deutschland',
      email: 'p.vogel@startupxyz.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/petra-vogel-startupxyz',
      source: 'seed',
      fit_score: 20,
      interest_score: 30,
      priority: 'medium',
      priority_reason: '',
      fit_status: 'unknown',
      need_status: 'unknown',
      willingness: 'unknown',
      status: 'new',
      cached_brief: exampleDBrief,
    },
    {
      // E: role=null → fitStatus='fits' (unknown role, not 'outside'), needStatus='expressed' → HIGH + "Rolle klären"
      id: DEMO_IDS.leads.exampleE,
      name: 'Max Müller',
      role: null,
      company: 'TurboSales GmbH',
      company_domain: 'turbosales.example.com',
      company_size: 120,
      region: 'Deutschland',
      email: 'm.mueller@turbosales.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/max-mueller-turbosales',
      source: 'seed',
      fit_score: 60,
      interest_score: 40,
      priority: 'medium',
      priority_reason: '',
      fit_status: 'unknown',
      need_status: 'unknown',
      willingness: 'unknown',
      status: 'researched',
      cached_brief: exampleEBrief,
    },
  ]);

  // ---- Historic leads H1–H4 (for proposal demo) ----
  await upsert(db, 'lead', [
    {
      id: DEMO_IDS.leads.historicH1,
      name: 'Thomas Schmidt',
      role: 'Sales Director',
      company: 'Praxis Vertriebs GmbH',
      company_domain: 'praxis-vertrieb.example.com',
      company_size: 100,
      region: 'Deutschland',
      email: null,
      phone: null,
      profile_url: null,
      source: 'seed',
      fit_score: 65,
      interest_score: 0,
      priority: 'low',
      priority_reason: 'Historischer Lead – bereits angerufen.',
      fit_status: 'fits',
      need_status: 'none',
      willingness: 'open',
      status: 'called',
      cached_brief: null,
    },
    {
      id: DEMO_IDS.leads.historicH2,
      name: 'Julia Wagner',
      role: 'VP Sales',
      company: 'InnoTech AG',
      company_domain: 'innotech-ag.example.com',
      company_size: 150,
      region: 'Deutschland',
      email: null,
      phone: null,
      profile_url: null,
      source: 'seed',
      fit_score: 70,
      interest_score: 0,
      priority: 'low',
      priority_reason: 'Historischer Lead – bereits angerufen.',
      fit_status: 'fits',
      need_status: 'none',
      willingness: 'open',
      status: 'called',
      cached_brief: null,
    },
    {
      id: DEMO_IDS.leads.historicH3,
      name: 'Peter Hoffmann',
      role: 'Head of Sales',
      company: 'Delta Systems GmbH',
      company_domain: 'delta-systems.example.com',
      company_size: 80,
      region: 'Deutschland',
      email: null,
      phone: null,
      profile_url: null,
      source: 'seed',
      fit_score: 65,
      interest_score: 0,
      priority: 'low',
      priority_reason: 'Historischer Lead – bereits angerufen.',
      fit_status: 'fits',
      need_status: 'none',
      willingness: 'open',
      status: 'called',
      cached_brief: null,
    },
    {
      id: DEMO_IDS.leads.historicH4,
      name: 'Anna Koch',
      role: 'Sales Director',
      company: 'Metro Vertrieb GmbH',
      company_domain: 'metro-vertrieb.example.com',
      company_size: 200,
      region: 'Deutschland',
      email: null,
      phone: null,
      profile_url: null,
      source: 'seed',
      fit_score: 75,
      interest_score: 20,
      priority: 'low',
      priority_reason: 'Historischer Lead – Trigger bestätigt, Follow-up geplant.',
      fit_status: 'fits',
      need_status: 'hypothesis',
      willingness: 'open',
      status: 'called',
      cached_brief: null,
    },
  ]);

  // ---- Lead triggers ----
  await upsert(db, 'lead_trigger', [
    // A: expressed need (chat) + conversation request (chat)
    {
      id: DEMO_IDS.leadTriggers.exampleA1,
      lead_id: DEMO_IDS.leads.exampleA,
      trigger_type_id: DEMO_IDS.triggers.expressedNeed,
      type: 'Geäußerter Bedarf',
      content:
        'Klaus Bauer hat im Chat konkreten Bedarf an schnellerem SDR-Onboarding geäußert: ' +
        '„Das Onboarding neuer SDRs dauert bei uns viel zu lang – wir verlieren 6 Wochen." [TEST/Beispiel]',
      source_url: '',  // chat evidence — no public URL
      found_at: '2026-10-29',
      is_assumption: false,
      verdict: 'strong',
      offer_relevance: 3,
      person_relevance: 3,
      evidence_kind: 'chat',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    {
      id: DEMO_IDS.leadTriggers.exampleA2,
      lead_id: DEMO_IDS.leads.exampleA,
      trigger_type_id: DEMO_IDS.triggers.conversationRequest,
      type: 'Ausdrücklicher Gesprächswunsch',
      content:
        'Klaus Bauer hat im Chat aktiv ein Gespräch angefragt: ' +
        '„Ich wäre interessiert, mehr zu erfahren. Wann hätten Sie Zeit für einen kurzen Anruf?" [TEST/Beispiel]',
      source_url: '',  // chat evidence
      found_at: '2026-10-29',
      is_assumption: false,
      verdict: 'strong',
      offer_relevance: 3,
      person_relevance: 3,
      evidence_kind: 'chat',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    // B: hiring surge (public)
    {
      id: DEMO_IDS.leadTriggers.exampleB1,
      lead_id: DEMO_IDS.leads.exampleB,
      trigger_type_id: DEMO_IDS.triggers.hiringSurge,
      type: 'Einstellungswelle im Vertrieb',
      content:
        'Nexcom AG hat in den letzten 30 Tagen 5 SDR-Stellen ausgeschrieben. ' +
        'Hypothese: steigender Bedarf an Onboarding-Effizienz. [TEST/Beispiel]',
      source_url: 'https://www.nexcom.example.com/karriere/sdr-stellen',
      found_at: '2026-10-20',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 2,
      evidence_kind: 'public',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    // C: accepted connection — weak signal, verdict='reject' (offer+person relevance too low)
    {
      id: DEMO_IDS.leadTriggers.exampleC1,
      lead_id: DEMO_IDS.leads.exampleC,
      trigger_type_id: DEMO_IDS.triggers.linkedinConnection,
      type: 'Vernetzungsanfrage angenommen',
      content:
        'Stefan Richter hat eine LinkedIn-Vernetzungsanfrage angenommen. ' +
        'Kein geäußerter Bedarf oder Gesprächswunsch. [TEST/Beispiel]',
      source_url: 'https://www.linkedin.example.com/in/stefan-richter-innovent',
      found_at: '2026-10-15',
      is_assumption: false,
      verdict: 'reject',  // too weak (offer_relevance=1, person_relevance=1, total=2 < 3)
      offer_relevance: 1,
      person_relevance: 1,
      evidence_kind: 'public',
      is_active: true,    // stored but rejected — not a call reason
      feedback: null,
      feedback_evidence: null,
    },
    // D: expressed need (chat) but company is outside ICP → REVIEW
    {
      id: DEMO_IDS.leadTriggers.exampleD1,
      lead_id: DEMO_IDS.leads.exampleD,
      trigger_type_id: DEMO_IDS.triggers.expressedNeed,
      type: 'Geäußerter Bedarf',
      content:
        'Petra Vogel hat im Chat Interesse an SDR-Effizienz geäußert. ' +
        'Unternehmen StartupXYZ ist jedoch außerhalb des ICP (zu klein). [TEST/Beispiel]',
      source_url: '',  // chat evidence
      found_at: '2026-10-27',
      is_assumption: false,
      verdict: 'strong',
      offer_relevance: 3,
      person_relevance: 2,
      evidence_kind: 'chat',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    // E: expressed need (chat) — role unknown → HIGH with "Rolle klären"
    {
      id: DEMO_IDS.leadTriggers.exampleE1,
      lead_id: DEMO_IDS.leads.exampleE,
      trigger_type_id: DEMO_IDS.triggers.expressedNeed,
      type: 'Geäußerter Bedarf',
      content:
        'Kontakt hat im Chat ein konkretes Onboarding-Problem geäußert: ' +
        '„Das Onboarding-Problem im Vertrieb ist wirklich real – neue Mitarbeiter brauchen zu lange." ' +
        'Rolle ist noch unbekannt. [TEST/Beispiel]',
      source_url: '',  // chat evidence
      found_at: '2026-10-27',
      is_assumption: false,
      verdict: 'strong',
      offer_relevance: 3,
      person_relevance: 2,  // 2 because role is unknown
      evidence_kind: 'chat',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    // Historic H1–H4: hiringSurge with feedback (3 contradicted, 1 confirmed)
    {
      id: DEMO_IDS.leadTriggers.historicH1t,
      lead_id: DEMO_IDS.leads.historicH1,
      trigger_type_id: DEMO_IDS.triggers.hiringSurge,
      type: 'Einstellungswelle im Vertrieb',
      content: 'Praxis Vertriebs GmbH hatte 3 SDR-Stellen ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.praxis-vertrieb.example.com/karriere',
      found_at: '2026-09-15',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 2,
      evidence_kind: 'public',
      is_active: false,   // contradicted → inactive
      feedback: 'contradicted',
      feedback_evidence: 'Im Gespräch: Onboarding läuft intern gut, kein Handlungsdruck. SDR-Stellen für operatives Wachstum, nicht für Tooling.',
    },
    {
      id: DEMO_IDS.leadTriggers.historicH2t,
      lead_id: DEMO_IDS.leads.historicH2,
      trigger_type_id: DEMO_IDS.triggers.hiringSurge,
      type: 'Einstellungswelle im Vertrieb',
      content: 'InnoTech AG hatte 4 SDR-Stellen ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.innotech-ag.example.com/jobs/sdr',
      found_at: '2026-09-20',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 2,
      evidence_kind: 'public',
      is_active: false,   // contradicted → inactive
      feedback: 'contradicted',
      feedback_evidence: 'Im Gespräch: Unternehmen hat externes Onboarding über Recruitingagentur – kein eigenes Tool benötigt.',
    },
    {
      id: DEMO_IDS.leadTriggers.historicH3t,
      lead_id: DEMO_IDS.leads.historicH3,
      trigger_type_id: DEMO_IDS.triggers.hiringSurge,
      type: 'Einstellungswelle im Vertrieb',
      content: 'Delta Systems GmbH hatte 2 SDR-Stellen ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.delta-systems.example.com/stellen',
      found_at: '2026-10-01',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 2,
      evidence_kind: 'public',
      is_active: false,   // contradicted → inactive
      feedback: 'contradicted',
      feedback_evidence: 'Im Gespräch: Fokus liegt auf Retention bestehender SDRs, nicht auf Neueinstellungen. Onboarding kein Thema.',
    },
    {
      id: DEMO_IDS.leadTriggers.historicH4t,
      lead_id: DEMO_IDS.leads.historicH4,
      trigger_type_id: DEMO_IDS.triggers.hiringSurge,
      type: 'Einstellungswelle im Vertrieb',
      content: 'Metro Vertrieb GmbH hatte 6 SDR-Stellen ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.metro-vertrieb.example.com/jobs',
      found_at: '2026-10-10',
      is_assumption: false,
      verdict: 'strong',
      offer_relevance: 3,
      person_relevance: 3,
      evidence_kind: 'public',
      is_active: true,
      feedback: 'confirmed',
      feedback_evidence: 'Im Gespräch bestätigt: Onboarding neuer SDRs dauert 6–8 Wochen, Bedarf an Effizienzlösung vorhanden.',
    },
  ]);

  // ---- Lead context (chat messages) ----
  await upsert(db, 'lead_context', [
    {
      id: DEMO_IDS.context.exampleA1,
      lead_id: DEMO_IDS.leads.exampleA,
      kind: 'chat',
      author: 'contact',
      content:
        'Ehrlich gesagt dauert das Onboarding neuer SDRs bei uns viel zu lang. ' +
        'Wir verlieren 6 Wochen, bis die Kollegen eigenständig Gespräche führen. ' +
        'Das kostet uns jedes Mal eine Menge Pipeline. [TEST/Beispiel]',
      occurred_at: '2026-10-28T14:32:00Z',
      source_url: null,
    },
    {
      id: DEMO_IDS.context.exampleA2,
      lead_id: DEMO_IDS.leads.exampleA,
      kind: 'chat',
      author: 'contact',
      content:
        'Ich wäre tatsächlich interessiert, mehr zu erfahren. ' +
        'Wann hätten Sie Zeit für einen kurzen Anruf diese Woche? ' +
        'Am Donnerstag zwischen 14 und 16 Uhr würde passen. [TEST/Beispiel]',
      occurred_at: '2026-10-29T09:15:00Z',
      source_url: null,
    },
    {
      id: DEMO_IDS.context.exampleE1,
      lead_id: DEMO_IDS.leads.exampleE,
      kind: 'chat',
      author: 'contact',
      content:
        'Das Onboarding-Problem im Vertrieb ist wirklich real – neue Mitarbeiter brauchen viel zu lange, ' +
        'bis sie produktiv werden. Haben Sie dafür schon Lösungen gesehen? [TEST/Beispiel]',
      occurred_at: '2026-10-27T11:20:00Z',
      source_url: null,
    },
  ]);

  // ---- BANT claims (for A) ----
  await upsert(db, 'bant_claim', [
    {
      id: DEMO_IDS.bantClaims.exampleA_need,
      lead_id: DEMO_IDS.leads.exampleA,
      dimension: 'need',
      status: 'confirmed',
      value: 'SDR-Onboarding dauert 6 Wochen – Pipeline-Verlust',
      evidence: 'Chat vom 28.10.2026: „Wir verlieren 6 Wochen, bis die Kollegen eigenständig Gespräche führen."',
      source: 'chat',
      call_log_id: null,
      created_at: '2026-10-29T09:00:00Z',
    },
    {
      id: DEMO_IDS.bantClaims.exampleA_authority,
      lead_id: DEMO_IDS.leads.exampleA,
      dimension: 'authority',
      status: 'assumed',
      value: 'VP Sales – Entscheidungsrahmen noch unklar',
      evidence: 'Kontakt spricht von „wir" im Chat – Scope der Entscheidung unbekannt.',
      source: 'chat',
      call_log_id: null,
      created_at: '2026-10-29T09:00:00Z',
    },
  ]);

  // ---- Historic call logs (minimal — for proposal evidence) ----
  await upsert(db, 'call_log', [
    {
      id: DEMO_IDS.callLogs.historicH1,
      lead_id: DEMO_IDS.leads.historicH1,
      outcome: 'not_booked',
      notes:
        'Trigger widersprochen: Onboarding läuft intern gut, kein Handlungsdruck. ' +
        'SDR-Stellen sind für Wachstum, nicht für Tooling. [TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: false,
      recommended_action: 'follow_up',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-10-05T15:00:00Z',
    },
    {
      id: DEMO_IDS.callLogs.historicH2,
      lead_id: DEMO_IDS.leads.historicH2,
      outcome: 'not_booked',
      notes:
        'Trigger widersprochen: Externes Onboarding über Recruitingagentur – kein eigenes Tool benötigt. ' +
        '[TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: false,
      recommended_action: 'stop',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-10-10T11:30:00Z',
    },
    {
      id: DEMO_IDS.callLogs.historicH3,
      lead_id: DEMO_IDS.leads.historicH3,
      outcome: 'not_booked',
      notes:
        'Trigger widersprochen: Fokus auf Retention, Neueinstellungen kein Treiber für Tooling. ' +
        '[TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: false,
      recommended_action: 'stop',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-10-15T14:00:00Z',
    },
    {
      id: DEMO_IDS.callLogs.historicH4,
      lead_id: DEMO_IDS.leads.historicH4,
      outcome: 'not_booked',
      notes:
        'Trigger bestätigt: Onboarding dauert 6–8 Wochen, Bedarf vorhanden. ' +
        'Kein Demo-Termin wegen fehlender Budget-Freigabe. Follow-up in Q1. [TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: false,
      recommended_action: 'follow_up',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-10-20T16:00:00Z',
    },
  ]);

  // ---- Test event on Example A (is_test: true) ----
  await upsert(db, 'lead_event', {
    id: DEMO_IDS.events.exampleAMeeting,
    lead_id: DEMO_IDS.leads.exampleA,
    type: 'meeting_request',
    occurred_at: new Date().toISOString(),
    evidence: '[TEST/Beispiel] Klaus Bauer hat über LinkedIn-Chat einen Anruf angefragt.',
    is_test: true,
    dedupe_key: `demo:${DEMO_IDS.leads.exampleA}:meeting_request`,
  });

  // ---- Refresh priority for main leads A–E ----
  // Import here to keep seed-data.ts usable without Next.js context
  const { refreshLeadPriority } = await import('./priority');
  for (const leadId of [
    DEMO_IDS.leads.exampleA,
    DEMO_IDS.leads.exampleB,
    DEMO_IDS.leads.exampleC,
    DEMO_IDS.leads.exampleD,
    DEMO_IDS.leads.exampleE,
  ]) {
    try {
      await refreshLeadPriority(leadId);
    } catch (e) {
      console.error(`seedDemo: refreshLeadPriority failed for ${leadId}:`, e);
    }
  }

  // ---- Collect row counts ----
  const tables = [
    'campaign', 'trigger_catalog', 'lead', 'lead_trigger',
    'lead_context', 'bant_claim', 'call_log', 'lead_event',
  ];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    counts[t] = await rowCount(db, t);
  }

  return { counts, eventId: DEMO_IDS.events.exampleAMeeting };
}
