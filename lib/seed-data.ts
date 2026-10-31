/**
 * Outbound Brain — Real-estate ICP demo seed (TEST/Beispiel dataset).
 *
 * Fictional offer: Software für Ankaufsprüfung und Projektpriorisierung.
 * All names / companies / emails / URLs are [TEST/Beispiel] — never real contacts.
 *
 * Coverage per spec (Task 7):
 *   A (Thomas Keller)   — HIGH   : ICP A, GF, Ankaufsprofil-Trigger, call log + BANT (demo-ready)
 *   B (Sandra Weber)    — MEDIUM : ICP B, Leitung Projektentwicklung, Stellenanzeige-Trigger
 *   C (Michael Braun)   — LOW    : ICP C, Asset Management, Expansions-Trigger
 *   D (Julia Roth)      — REVIEW : ICP D, Vertriebsleitung, ESG-Trigger → kein Zielkunde
 *   NB (Erik Sommer)    — REVIEW : nicht_bewertbar, GF, Neues-Projekt-Trigger ohne belegbare URL
 *
 * Historic leads H1–H4: "Stellenanzeige Ankauf" contradicted 3 of 4 times
 *   → "Vorschläge berechnen" produces one visible proposal for the demo.
 *
 * Pre-computed company_check + call_card for A and B — demo needs no API calls.
 *
 * seedDemo() is idempotent (upsert on id). clearDemoActivity() deletes only is_test=true rows.
 * Called by scripts/seed.ts and app/api/seed/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CallBriefing, CallCard } from './types';
import { RE_TRIGGER_UUIDS, REAL_ESTATE_TRIGGER_CATALOG } from './seed-real-estate';

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
    ankaufsprofil:    RE_TRIGGER_UUIDS['re-ankaufsprofil'],
    neuesProjekt:     RE_TRIGGER_UUIDS['re-neues-projekt'],
    stellenAnkauf:    RE_TRIGGER_UUIDS['re-stellen-ankauf'],
    konversion:       RE_TRIGGER_UUIDS['re-konversion'],
    expansion:        RE_TRIGGER_UUIDS['re-expansion'],
    esgModernisierung: RE_TRIGGER_UUIDS['re-esg-modernisierung'],
  },

  leads: {
    exampleA:   '30000002-0000-0000-0000-000000000001',
    exampleB:   '30000002-0000-0000-0000-000000000002',
    exampleC:   '30000002-0000-0000-0000-000000000003',
    exampleD:   '30000002-0000-0000-0000-000000000004',
    exampleNB:  '30000002-0000-0000-0000-000000000005',
    historicH1: '30000002-0000-0000-0000-000000000011',
    historicH2: '30000002-0000-0000-0000-000000000012',
    historicH3: '30000002-0000-0000-0000-000000000013',
    historicH4: '30000002-0000-0000-0000-000000000014',
  },

  leadTriggers: {
    exampleA1:   '40000002-0000-0000-0000-000000000001',
    exampleA2:   '40000002-0000-0000-0000-000000000002',
    exampleB1:   '40000002-0000-0000-0000-000000000003',
    exampleC1:   '40000002-0000-0000-0000-000000000004',
    exampleD1:   '40000002-0000-0000-0000-000000000005',
    exampleNB1:  '40000002-0000-0000-0000-000000000006',
    historicH1t: '40000002-0000-0000-0000-000000000011',
    historicH2t: '40000002-0000-0000-0000-000000000012',
    historicH3t: '40000002-0000-0000-0000-000000000013',
    historicH4t: '40000002-0000-0000-0000-000000000014',
  },

  context: {
    exampleA1: '70000002-0000-0000-0000-000000000001',
  },

  bantClaims: {
    exampleA_need:      '80000002-0000-0000-0000-000000000001',
    exampleA_authority: '80000002-0000-0000-0000-000000000002',
    exampleA_timeline:  '80000002-0000-0000-0000-000000000003',
  },

  callLogs: {
    exampleA:   '90000002-0000-0000-0000-000000000000',
    historicH1: '90000002-0000-0000-0000-000000000001',
    historicH2: '90000002-0000-0000-0000-000000000002',
    historicH3: '90000002-0000-0000-0000-000000000003',
    historicH4: '90000002-0000-0000-0000-000000000004',
  },

  companyChecks: {
    exampleA: '60000002-0000-0000-0000-000000000001',
    exampleB: '60000002-0000-0000-0000-000000000002',
  },

  events: {
    exampleAMeeting: '50000002-0000-0000-0000-000000000001',
  },
} as const;

// ---------------------------------------------------------------------------
// Pre-computed company_check result JSON (Omit<CompanyCheck, 'id'|'companyKey'|'checkedAt'>)
// ---------------------------------------------------------------------------

const companyCheckResultA = {
  companyName: 'Alpha Wohnbau GmbH [TEST/Beispiel]',
  domain: 'alpha-wohnbau.example.com',
  segments: ['Wohnungsbau', 'Projektentwicklung'],
  score: 'A',
  whatTheyDo:
    'Alpha Wohnbau GmbH entwickelt Mehrfamilienhäuser und Wohnquartiere in Norddeutschland mit Fokus auf Neubauprojekte im B- und C-Lage-Segment. Das Unternehmen hat kürzlich ein Ankaufsprofil veröffentlicht und baut das Ankaufsteam aktiv aus.',
  fitSignals: [
    {
      text: 'Öffentliches Ankaufsprofil für Wohnquartiere in Norddeutschland veröffentlicht',
      url: 'https://www.alpha-wohnbau.example.com/ankauf',
    },
    {
      text: 'Aktive Stellenanzeige: Ankaufsmanager (m/w/d) – Personalaufbau im Ankauf',
      url: 'https://www.alpha-wohnbau.example.com/karriere/ankaufsmanager',
    },
  ],
  against: [],
  decision: 'Priorisiert bearbeiten',
  decisionReason:
    'Aktives Ankaufsprofil und Personalwachstum im Ankauf sind starke Timing-Signale – höchster Prioritätsscore.',
  painHypothesis:
    'Hypothese: Mit steigendem Transaktionsvolumen wächst der Koordinationsaufwand bei der Erstbewertung eingehender Exposés. Belastbarer Beleg fehlt noch – muss im Gespräch geklärt werden.',
  entryPoint: 'Ankaufsprofil als konkreter Gesprächsanlass; offene Stelle signalisiert aktiven Personalaufbau.',
  openQuestion:
    'Wie viele Exposés prüfen Sie monatlich, und wo entsteht dabei heute der größte interne Aufwand?',
};

const companyCheckResultB = {
  companyName: 'Beta Immobilien AG [TEST/Beispiel]',
  domain: 'beta-immobilien.example.com',
  segments: ['Wohnungsbau', 'Büroimmobilien'],
  score: 'B',
  whatTheyDo:
    'Beta Immobilien AG entwickelt Wohn- und Büroprojekte in Hamburg und Umgebung mit Schwerpunkt auf innerstädtischen Lagen. Das Portfolio umfasst sowohl Neubauten als auch Bestandsaufwertungen.',
  fitSignals: [
    {
      text: 'Aktive Stellenanzeige: Projektentwickler/in Wohnen (m/w/d)',
      url: 'https://www.beta-immobilien.example.com/karriere/projektentwickler',
    },
  ],
  against: [
    'Büroimmobilien-Anteil im Portfolio (ca. 40 %) deutet auf gemischten Fokus hin – Passung eingeschränkt.',
  ],
  decision: 'Bearbeiten und klären',
  decisionReason:
    'Wachstumssignal durch Stellenausschreibung bestätigt; gemischtes Portfolio schränkt Passung gegenüber ICP A ein.',
  painHypothesis:
    'Hypothese: Parallele Entwicklung von Wohn- und Büroprojekten erhöht den internen Koordinationsaufwand. Nicht belegt.',
  entryPoint: 'Offene Stelle in Projektentwicklung Wohnen als konkreter Anlass.',
  openQuestion:
    'Wie koordinieren Sie intern Wohn- und Büroprojekte – gibt es getrennte Teams oder einen gemeinsamen Prozess?',
};

// ---------------------------------------------------------------------------
// Pre-computed CallCard (PDF format, Noel rules: ≤ 40 s, no product name,
// no "Störe ich gerade?", self-intro ≤ half sentence, open process question, exit offer)
// ---------------------------------------------------------------------------

const callCardA: CallCard = {
  anlass:
    'Alpha Wohnbau GmbH hat ein Ankaufsprofil für Wohnquartiere in Norddeutschland veröffentlicht und besetzt gleichzeitig eine Stelle im Ankauf.',
  anlassUrl: 'https://www.alpha-wohnbau.example.com/ankauf',
  opener:
    'Guten Tag, hier ist [Vorname] von [Agentur]. ' +
    'Ich habe Ihr aktuelles Ankaufsprofil gesehen. ' +
    'Kurze Frage: Wie organisieren Sie bei Alpha Wohnbau die Erstbewertung eingehender Exposés – ' +
    'und wäre ein kurzes Gespräch dazu gerade sinnvoll?',
  followUps: [
    'Wie viele Exposés prüfen Sie im Monat, und wie lange dauert die interne Bewertung bis zur Ankaufsentscheidung?',
    'Nach welchen Kriterien entscheiden Sie, welche Objekte in die vertiefte Prüfung gehen?',
  ],
  objection: {
    expected: 'Wir haben das intern im Griff.',
    response:
      'Gut zu hören – kurze Nachfrage: Wie lange dauert die Erstbewertung vom Exposé-Eingang bis zur internen Go/No-Go-Entscheidung?',
  },
  openQuestion:
    'Was ist aktuell der größte Engpass in Ihrem Ankaufsprozess – von der Objektprüfung bis zur Entscheidung?',
};

const callCardB: CallCard = {
  anlass:
    'Beta Immobilien AG sucht eine/n Projektentwickler/in Wohnen – Hinweis auf Wachstum im Projektportfolio.',
  anlassUrl: 'https://www.beta-immobilien.example.com/karriere/projektentwickler',
  opener:
    'Guten Tag, hier ist [Vorname] von [Agentur]. ' +
    'Sie suchen gerade jemanden für die Projektentwicklung Wohnen – kurze Frage: ' +
    'Wie stellen Sie sicher, dass Ankauf und Projektentwicklung bei neuen Vorhaben reibungslos ineinandergreifen? ' +
    'Oder ist der Moment gerade ungünstig?',
  followUps: [
    'Wo entsteht bei Ihnen der meiste Abstimmungsaufwand zwischen Ankauf und Projektsteuerung?',
    'Welche Phase von der Ankaufsentscheidung bis zum Baustart kostet Ihr Team heute am meisten Zeit?',
  ],
  objection: {
    expected: 'Wir suchen Mitarbeiter, keine Tools.',
    response:
      'Völlig verständlich – kurze Frage: Was ist heute der größte Engpass, wenn neue Projekte anlaufen?',
  },
  openQuestion:
    'Wenn neue Projektentwickler einsteigen: Wie lange dauert es, bis sie ein Projekt eigenständig von Ankauf bis Baustart begleiten können?',
};

// ---------------------------------------------------------------------------
// Pre-computed cached_brief for A (backward compat with existing brief UI)
// ---------------------------------------------------------------------------

const exampleABrief: CallBriefing = {
  headline:
    'Thomas Keller – GF, Alpha Wohnbau GmbH: Aktives Ankaufsprofil + Ankaufsstelle offen [TEST/Beispiel]',
  context:
    'Alpha Wohnbau GmbH, ca. 40 Mitarbeiter, München. Thomas Keller ist Geschäftsführer. Unternehmen hat ein Ankaufsprofil für Wohnquartiere in Norddeutschland veröffentlicht und sucht einen Ankaufsmanager.',
  whyNow:
    'Öffentliches Ankaufsprofil + offene Ankaufsstelle = starke Timing-Signale für aktiven Transaktionsdruck.',
  evidenceUrl: 'https://www.alpha-wohnbau.example.com/ankauf',
  evidenceNote:
    'Ankaufsprofil gefunden am 31.10.2026; Stellenanzeige Ankaufsmanager aktiv (Karriereseite).',
  hook: 'Sie haben ein aktuelles Ankaufsprofil veröffentlicht – mich würde interessieren, wie Sie die Erstbewertung eingehender Exposés heute organisieren.',
  facts: [
    'Alpha Wohnbau GmbH hat ein Ankaufsprofil für Wohnquartiere in Norddeutschland veröffentlicht',
    'Offene Stelle: Ankaufsmanager (m/w/d) – aktiver Personalaufbau im Ankauf',
    'Thomas Keller ist Geschäftsführer – direkte Entscheidungsebene',
    'Gespräch vom 30.10.2026: 40–50 Exposés/Monat, interne Bewertung dauert 3–4 Tage',
  ],
  hypotheses: [
    'Steigende Transaktionslast → Koordinationsaufwand bei Exposé-Bewertung (durch Gespräch bestätigt)',
    'GF als direkter Entscheidungsträger für Prozessoptimierung wahrscheinlich',
  ],
  openQuestions: [
    'Wer ist neben dem GF in die Ankaufsentscheidung eingebunden?',
    'Was soll eine Lösung konkret zeigen – welches Problem im Ankaufsprozess lösen?',
    'Wann sollte ein Demo-Termin stattfinden?',
  ],
  bant: [
    {
      dimension: 'budget',
      status: 'open',
      value: null,
      evidence: null,
    },
    {
      dimension: 'authority',
      status: 'confirmed',
      value: 'Geschäftsführer – Entscheidung direkt beim GF',
      evidence: 'Gespräch 30.10.2026: Keller bestätigt, er entscheidet über Prozesstools',
    },
    {
      dimension: 'need',
      status: 'confirmed',
      value: 'Ankaufsprozess unter Zeitdruck: 40–50 Exposés/Monat, Bewertung dauert 3–4 Tage',
      evidence: 'Gespräch 30.10.2026: direkt bestätigt',
    },
    {
      dimension: 'timeline',
      status: 'assumed',
      value: 'Demo-Termin nächste Woche vereinbart',
      evidence: 'Gespräch 30.10.2026',
    },
  ],
  talkingPoints: [
    'Projektentwickler mit aktivem Ankauf prüfen typisch 30–50 Exposés/Monat – ohne Strukturhilfe 2–3 Arbeitstage Aufwand pro Person.',
    'Unser Ansatz unterstützt Erstbewertung und Priorisierung ohne den bestehenden Prozess zu ersetzen.',
    'Setup unter 30 Minuten bis zum ersten strukturierten Ankauf-Briefing – kein IT-Projekt.',
  ],
  objections: [
    {
      objection: 'Wir haben das intern im Griff.',
      answer:
        'Offene Frage: Wie lange dauert bei Ihnen die Erstbewertung vom Exposé-Eingang bis zur Go/No-Go-Entscheidung? (Antwort bestimmt Relevanz.)',
    },
    {
      objection: 'Wir stellen gerade einen Ankaufsmanager ein.',
      answer:
        'Genau der richtige Zeitpunkt – der neue Kollege braucht von Tag 1 einen strukturierten Prozess. Wann startet er voraussichtlich?',
    },
  ],
  phone: null,
  consentLine:
    'Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Nur mit Ihrer ausdrücklichen Zustimmung.',
  meetingSlots: [
    'Do 14:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
    'Fr 10:00 Uhr (Vorschlag – Verfügbarkeit bestätigen)',
  ],
  contact: 'Thomas Keller, Geschäftsführer – Alpha Wohnbau GmbH, München [TEST/Beispiel]',
  goal: 'Demo-Termin bestätigen, Teilnehmer klären und Lösungsfokus abstimmen',
  assumptions: [
    'Ankaufsprozess ist der Hauptschmerzpunkt (durch Gespräch bestätigt)',
    'Budget-Freigabe beim GF wahrscheinlich – nicht explizit bestätigt',
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
// clearDemoActivity — deletes only is_test=true rows and their children
// Prepared leads (origin='prepared', is_test=false) are never touched.
// ---------------------------------------------------------------------------

const DEMO_LEAD_CHILD_TABLES = [
  'call_log', 'bant_claim', 'lead_trigger', 'lead_context',
  'lead_event', 'decision', 'cadence_step', 'agent_step',
] as const;

async function clearDemoActivity(db: SupabaseClient): Promise<void> {
  // 1. Find all is_test lead IDs and their company_keys
  const { data: testLeads, error: fetchErr } = await db
    .from('lead')
    .select('id, company_key')
    .eq('is_test', true);
  if (fetchErr) throw new Error(`clearDemoActivity fetch: ${fetchErr.message}`);

  const testLeadIds = (testLeads ?? []).map((r: { id: string }) => r.id);
  const testCompanyKeys = [
    ...new Set(
      (testLeads ?? [])
        .map((r: { company_key: string | null }) => r.company_key)
        .filter((k): k is string => !!k),
    ),
  ];

  // 2. Delete child rows for all is_test leads
  if (testLeadIds.length > 0) {
    for (const table of DEMO_LEAD_CHILD_TABLES) {
      const { error } = await db.from(table).delete().in('lead_id', testLeadIds);
      if (error) throw new Error(`clear ${table}: ${error.message}`);
    }
  }

  // 3. Delete company_check rows for test company keys (fictional *.example.com domains)
  if (testCompanyKeys.length > 0) {
    const { error } = await db.from('company_check').delete().in('company_key', testCompanyKeys);
    if (error) throw new Error(`clear company_check: ${error.message}`);
  }

  // 4. Delete test leads
  const { error: leadErr } = await db.from('lead').delete().eq('is_test', true);
  if (leadErr) throw new Error(`clear lead (is_test): ${leadErr.message}`);

  // 5. Delete trigger catalog entries for the demo campaign (replaced by RE catalog)
  const { error: trigErr } = await db
    .from('trigger_catalog')
    .delete()
    .eq('campaign_id', DEMO_IDS.campaign);
  if (trigErr) throw new Error(`clear trigger_catalog: ${trigErr.message}`);

  // 6. Delete campaign proposals for the demo campaign
  const { error: propErr } = await db
    .from('campaign_proposal')
    .delete()
    .eq('campaign_id', DEMO_IDS.campaign);
  if (propErr) throw new Error(`clear campaign_proposal: ${propErr.message}`);
}

// ---------------------------------------------------------------------------
// seedDemo — idempotent, only touches demo rows
// ---------------------------------------------------------------------------

export async function seedDemo(db: SupabaseClient): Promise<SeedResult> {
  await clearDemoActivity(db);

  // ---- Campaign ----
  await upsert(db, 'campaign', {
    id: DEMO_IDS.campaign,
    offer: '[TEST] Software für Ankaufsprüfung und Projektpriorisierung bei Projektentwicklern',
    icp_roles: ['Geschäftsführung', 'Leitung Ankauf', 'Leitung Projektentwicklung', 'Asset Management'],
    icp_company_size_min: 5,
    icp_company_size_max: null,
    icp_regions: ['DE'],
    exclusions: ['Bestandskunden', 'offene Deals', 'Opt-outs'],
    language: 'de',
    tone: 'professional',
    offer_knowledge:
      'Genehmigtes Produktwissen [TEST/Beispiel – keine echten Versprechen]:\n' +
      '1. Die Software unterstützt Projektentwickler bei der strukturierten Erstbewertung eingehender Exposés und der Priorisierung des Ankaufportfolios.\n' +
      '2. Dashboards zeigen aktuelle Projekte nach Priorität, Ankaufsphase und Verantwortlichkeit in Echtzeit.\n' +
      '3. Integration in bestehende Workflows: kompatibel mit gängigen CRMs und Dokumentenablagesystemen.',
    min_sample_size: 3,
    is_active: true,
    needle_campaign_id: null,
    needle_campaign_name: null,
  });

  // ---- Trigger catalog (RE-specific, 6 entries) ----
  await upsert(
    db,
    'trigger_catalog',
    REAL_ESTATE_TRIGGER_CATALOG.map(e => ({
      id: e.id,
      campaign_id: DEMO_IDS.campaign,
      name: e.name,
      buying_reason: e.buying_reason,
      tier: e.tier,
      window_days: e.window_days,
      required_evidence: e.required_evidence,
      approved: e.approved,
    })),
  );

  // ---- Company checks for A and B (pre-computed, no API call needed for demo) ----
  await upsert(db, 'company_check', [
    {
      id: DEMO_IDS.companyChecks.exampleA,
      company_key: 'alpha-wohnbau.example.com',
      company_name: 'Alpha Wohnbau GmbH [TEST/Beispiel]',
      domain: 'alpha-wohnbau.example.com',
      result: companyCheckResultA,
      score: 'A',
      checked_at: '2026-10-31T09:00:00Z',
    },
    {
      id: DEMO_IDS.companyChecks.exampleB,
      company_key: 'beta-immobilien.example.com',
      company_name: 'Beta Immobilien AG [TEST/Beispiel]',
      domain: 'beta-immobilien.example.com',
      result: companyCheckResultB,
      score: 'B',
      checked_at: '2026-10-31T09:05:00Z',
    },
  ]);

  // ---- Main leads A, B, C, D, NB ----
  await upsert(db, 'lead', [
    {
      // A: ICP A, demo-ready with call log + BANT
      id: DEMO_IDS.leads.exampleA,
      name: 'Thomas Keller [TEST/Beispiel]',
      role: 'Geschäftsführer',
      company: 'Alpha Wohnbau GmbH [TEST/Beispiel]',
      company_domain: 'alpha-wohnbau.example.com',
      company_size: 40,
      region: 'München',
      email: 't.keller@alpha-wohnbau.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/thomas-keller-alphawohnbau',
      source: 'seed',
      fit_score: 90,
      interest_score: 70,
      priority: 'high',
      priority_reason: 'Aktives Ankaufsprofil + Personalwachstum im Ankauf – starkes Timing-Signal.',
      fit_status: 'fits',
      need_status: 'expressed',
      willingness: 'requested',
      status: 'called',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'alpha-wohnbau.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: callCardA,
      cached_brief: exampleABrief,
    },
    {
      // B: ICP B, researched
      id: DEMO_IDS.leads.exampleB,
      name: 'Sandra Weber [TEST/Beispiel]',
      role: 'Leitung Projektentwicklung',
      company: 'Beta Immobilien AG [TEST/Beispiel]',
      company_domain: 'beta-immobilien.example.com',
      company_size: 60,
      region: 'Hamburg',
      email: 's.weber@beta-immobilien.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/sandra-weber-betaimmobilien',
      source: 'seed',
      fit_score: 70,
      interest_score: 20,
      priority: 'medium',
      priority_reason: 'Stellenausschreibung als Wachstumssignal; gemischtes Portfolio schränkt Passung ein.',
      fit_status: 'partial',
      need_status: 'hypothesis',
      willingness: 'unknown',
      status: 'researched',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'beta-immobilien.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: callCardB,
      cached_brief: null,
    },
    {
      // C: ICP C, new — partial fit (office-heavy portfolio)
      id: DEMO_IDS.leads.exampleC,
      name: 'Michael Braun [TEST/Beispiel]',
      role: 'Asset Management',
      company: 'Gamma Real Estate GmbH [TEST/Beispiel]',
      company_domain: 'gamma-re.example.com',
      company_size: 80,
      region: 'Frankfurt',
      email: 'm.braun@gamma-re.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/michael-braun-gammarealestate',
      source: 'seed',
      fit_score: 45,
      interest_score: 10,
      priority: 'low',
      priority_reason: 'Expansionssignal vorhanden; Schwerpunkt auf Büroimmobilien schränkt Passung ein.',
      fit_status: 'partial',
      need_status: 'unknown',
      willingness: 'unknown',
      status: 'new',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'gamma-re.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: null,
      cached_brief: null,
    },
    {
      // D: ICP D, kein Zielkunde (retail/logistics, no residential development)
      id: DEMO_IDS.leads.exampleD,
      name: 'Julia Roth [TEST/Beispiel]',
      role: 'Vertriebsleitung',
      company: 'Delta Bau GmbH [TEST/Beispiel]',
      company_domain: 'delta-bau.example.com',
      company_size: 120,
      region: 'Berlin',
      email: 'j.roth@delta-bau.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/julia-roth-deltabau',
      source: 'seed',
      fit_score: 20,
      interest_score: 10,
      priority: 'review',
      priority_reason: 'Kein Zielkunde: Unternehmen ist hauptsächlich im Schlüsselfertigbau für Gewerbe tätig, keine eigene Projektentwicklung.',
      fit_status: 'outside',
      need_status: 'unknown',
      willingness: 'unknown',
      status: 'new',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'delta-bau.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: null,
      cached_brief: null,
    },
    {
      // NB: nicht_bewertbar — holding company, no verifiable development activity
      id: DEMO_IDS.leads.exampleNB,
      name: 'Erik Sommer [TEST/Beispiel]',
      role: 'Geschäftsführer',
      company: 'Epsilon Holding GmbH [TEST/Beispiel]',
      company_domain: 'epsilon-holding.example.com',
      company_size: null,
      region: 'Düsseldorf',
      email: 'e.sommer@epsilon-holding.example.com',
      phone: null,
      profile_url: 'https://www.linkedin.example.com/in/erik-sommer-epsilonholding',
      source: 'seed',
      fit_score: 0,
      interest_score: 0,
      priority: 'review',
      priority_reason: 'Recherche ergänzen: Keine belastbaren öffentlichen Quellen zur Projektentwicklungstätigkeit gefunden.',
      fit_status: 'unknown',
      need_status: 'unknown',
      willingness: 'unknown',
      status: 'new',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'epsilon-holding.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: null,
      cached_brief: null,
    },
  ]);

  // ---- Historic leads H1–H4 (for proposal demo: 3 of 4 stellenAnkauf contradicted) ----
  await upsert(db, 'lead', [
    {
      id: DEMO_IDS.leads.historicH1,
      name: 'Rolf Fischer [TEST/Beispiel]',
      role: 'Leiter Ankauf',
      company: 'Theta Bau GmbH [TEST/Beispiel]',
      company_domain: 'theta-bau.example.com',
      company_size: 55,
      region: 'Leipzig',
      email: null,
      phone: null,
      profile_url: null,
      source: 'seed',
      fit_score: 55,
      interest_score: 0,
      priority: 'low',
      priority_reason: 'Historischer Lead – bereits angerufen, Trigger widersprochen.',
      fit_status: 'partial',
      need_status: 'none',
      willingness: 'open',
      status: 'called',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'theta-bau.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: null,
      cached_brief: null,
    },
    {
      id: DEMO_IDS.leads.historicH2,
      name: 'Christine Müller [TEST/Beispiel]',
      role: 'Head of Acquisitions',
      company: 'Iota Wohnbau AG [TEST/Beispiel]',
      company_domain: 'iota-wohnbau.example.com',
      company_size: 70,
      region: 'Stuttgart',
      email: null,
      phone: null,
      profile_url: null,
      source: 'seed',
      fit_score: 60,
      interest_score: 0,
      priority: 'low',
      priority_reason: 'Historischer Lead – bereits angerufen, Trigger widersprochen.',
      fit_status: 'fits',
      need_status: 'none',
      willingness: 'open',
      status: 'called',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'iota-wohnbau.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: null,
      cached_brief: null,
    },
    {
      id: DEMO_IDS.leads.historicH3,
      name: 'Werner Koch [TEST/Beispiel]',
      role: 'Geschäftsführer',
      company: 'Kappa Projekt GmbH [TEST/Beispiel]',
      company_domain: 'kappa-projekt.example.com',
      company_size: 30,
      region: 'Hannover',
      email: null,
      phone: null,
      profile_url: null,
      source: 'seed',
      fit_score: 60,
      interest_score: 0,
      priority: 'low',
      priority_reason: 'Historischer Lead – bereits angerufen, Trigger widersprochen.',
      fit_status: 'fits',
      need_status: 'none',
      willingness: 'open',
      status: 'called',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'kappa-projekt.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: null,
      cached_brief: null,
    },
    {
      id: DEMO_IDS.leads.historicH4,
      name: 'Sabine Lehmann [TEST/Beispiel]',
      role: 'Leitung Ankauf',
      company: 'Lambda Immobilien GmbH [TEST/Beispiel]',
      company_domain: 'lambda-immobilien.example.com',
      company_size: 90,
      region: 'Köln',
      email: null,
      phone: null,
      profile_url: null,
      source: 'seed',
      fit_score: 80,
      interest_score: 25,
      priority: 'low',
      priority_reason: 'Historischer Lead – Trigger bestätigt, Follow-up geplant.',
      fit_status: 'fits',
      need_status: 'hypothesis',
      willingness: 'open',
      status: 'called',
      owner: null,
      last_alert_at: null,
      origin: 'test',
      origin_detail: null,
      is_test: true,
      company_key: 'lambda-immobilien.example.com',
      sortout_status: null,
      sortout_synced_needle: false,
      sortout_until: null,
      phone_source: null,
      phone_dnc: false,
      call_card: null,
      cached_brief: null,
    },
  ]);

  // ---- Lead triggers ----
  await upsert(db, 'lead_trigger', [
    // A: ankaufsprofil (strong, public URL) + neuesProjekt (usable, secondary)
    {
      id: DEMO_IDS.leadTriggers.exampleA1,
      lead_id: DEMO_IDS.leads.exampleA,
      trigger_type_id: DEMO_IDS.triggers.ankaufsprofil,
      type: 'Ankaufsprofil veröffentlicht',
      content:
        'Alpha Wohnbau GmbH hat ein Ankaufsprofil für Wohnquartiere in Norddeutschland veröffentlicht. ' +
        'Gleichzeitig ist eine Stelle für einen Ankaufsmanager ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.alpha-wohnbau.example.com/ankauf',
      found_at: '2026-10-31',
      is_assumption: false,
      verdict: 'strong',
      offer_relevance: 3,
      person_relevance: 3,
      evidence_kind: 'public',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    {
      id: DEMO_IDS.leadTriggers.exampleA2,
      lead_id: DEMO_IDS.leads.exampleA,
      trigger_type_id: DEMO_IDS.triggers.neuesProjekt,
      type: 'Neues Projekt / Baustart',
      content:
        'Alpha Wohnbau GmbH hat ein neues Wohnquartier-Projekt in der Planungsphase angekündigt (3 Gebäude, ca. 60 Einheiten). [TEST/Beispiel]',
      source_url: 'https://www.alpha-wohnbau.example.com/projekte/nordhavn-quartier',
      found_at: '2026-10-20',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 3,
      evidence_kind: 'public',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    // B: stellenAnkauf (usable)
    {
      id: DEMO_IDS.leadTriggers.exampleB1,
      lead_id: DEMO_IDS.leads.exampleB,
      trigger_type_id: DEMO_IDS.triggers.stellenAnkauf,
      type: 'Stellenanzeige Ankauf/Projektentwicklung',
      content:
        'Beta Immobilien AG sucht eine/n Projektentwickler/in Wohnen (m/w/d). ' +
        'Hypothese: Personalwachstum deutet auf steigendes Projektvolumen hin. [TEST/Beispiel]',
      source_url: 'https://www.beta-immobilien.example.com/karriere/projektentwickler',
      found_at: '2026-10-25',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 2,
      evidence_kind: 'public',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    // C: expansion (usable, partial fit)
    {
      id: DEMO_IDS.leadTriggers.exampleC1,
      lead_id: DEMO_IDS.leads.exampleC,
      trigger_type_id: DEMO_IDS.triggers.expansion,
      type: 'Regionale Expansion',
      content:
        'Gamma Real Estate GmbH hat die Ausweitung ihres Portfolios in Frankfurt Nordwest angekündigt – ' +
        'Fokus auf Büroimmobilien, Wohnanteil unklar. [TEST/Beispiel]',
      source_url: 'https://www.gamma-re.example.com/news/expansion-frankfurt',
      found_at: '2026-10-15',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 1,
      evidence_kind: 'public',
      is_active: true,
      feedback: null,
      feedback_evidence: null,
    },
    // D: esgModernisierung (reject — company is outside ICP)
    {
      id: DEMO_IDS.leadTriggers.exampleD1,
      lead_id: DEMO_IDS.leads.exampleD,
      trigger_type_id: DEMO_IDS.triggers.esgModernisierung,
      type: 'ESG-/Modernisierungsprogramm',
      content:
        'Delta Bau GmbH hat ein Energieeffizienz-Programm für Gewerbebauten angekündigt. ' +
        'Unternehmen ist jedoch kein Projektentwickler (Schlüsselfertigbau für Dritte). [TEST/Beispiel]',
      source_url: 'https://www.delta-bau.example.com/nachhaltigkeit',
      found_at: '2026-10-10',
      is_assumption: false,
      verdict: 'reject',
      offer_relevance: 1,
      person_relevance: 1,
      evidence_kind: 'public',
      is_active: false,
      feedback: null,
      feedback_evidence: null,
    },
    // NB: neuesProjekt — mention found but no verifiable source URL
    {
      id: DEMO_IDS.leadTriggers.exampleNB1,
      lead_id: DEMO_IDS.leads.exampleNB,
      trigger_type_id: DEMO_IDS.triggers.neuesProjekt,
      type: 'Neues Projekt / Baustart',
      content:
        'Epsilon Holding GmbH: Hinweis auf ein Bauprojekt gefunden, aber Quellennachweis fehlt. ' +
        'Holding-Struktur unklar – ob eigene Projektentwicklung stattfindet, konnte nicht verifiziert werden. [TEST/Beispiel]',
      source_url: '',
      found_at: '2026-10-31',
      is_assumption: true,
      verdict: 'reject',
      offer_relevance: 1,
      person_relevance: 1,
      evidence_kind: 'public',
      is_active: false,
      feedback: null,
      feedback_evidence: null,
    },
    // Historic H1–H3: stellenAnkauf, contradicted
    {
      id: DEMO_IDS.leadTriggers.historicH1t,
      lead_id: DEMO_IDS.leads.historicH1,
      trigger_type_id: DEMO_IDS.triggers.stellenAnkauf,
      type: 'Stellenanzeige Ankauf/Projektentwicklung',
      content: 'Theta Bau GmbH hatte eine Ankaufsstelle ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.theta-bau.example.com/karriere',
      found_at: '2026-09-10',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 2,
      evidence_kind: 'public',
      is_active: false,
      feedback: 'contradicted',
      feedback_evidence:
        'Im Gespräch: Ankauf läuft intern gut, Stelle war Ersatzbesetzung – kein Bedarf an Prozessunterstützung.',
    },
    {
      id: DEMO_IDS.leadTriggers.historicH2t,
      lead_id: DEMO_IDS.leads.historicH2,
      trigger_type_id: DEMO_IDS.triggers.stellenAnkauf,
      type: 'Stellenanzeige Ankauf/Projektentwicklung',
      content: 'Iota Wohnbau AG hatte eine Head-of-Acquisitions-Stelle ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.iota-wohnbau.example.com/jobs/acquisitions',
      found_at: '2026-09-20',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 2,
      evidence_kind: 'public',
      is_active: false,
      feedback: 'contradicted',
      feedback_evidence:
        'Im Gespräch: Stelle bereits besetzt durch interne Beförderung – kein Tool-Bedarf geäußert.',
    },
    {
      id: DEMO_IDS.leadTriggers.historicH3t,
      lead_id: DEMO_IDS.leads.historicH3,
      trigger_type_id: DEMO_IDS.triggers.stellenAnkauf,
      type: 'Stellenanzeige Ankauf/Projektentwicklung',
      content: 'Kappa Projekt GmbH hatte eine Stelle für Projektentwicklung ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.kappa-projekt.example.com/stellen',
      found_at: '2026-10-01',
      is_assumption: false,
      verdict: 'usable',
      offer_relevance: 2,
      person_relevance: 2,
      evidence_kind: 'public',
      is_active: false,
      feedback: 'contradicted',
      feedback_evidence:
        'Im Gespräch: Ankauf wird über Muttergesellschaft abgewickelt – kein eigenständiger Entscheidungsprozess.',
    },
    // Historic H4: stellenAnkauf, confirmed
    {
      id: DEMO_IDS.leadTriggers.historicH4t,
      lead_id: DEMO_IDS.leads.historicH4,
      trigger_type_id: DEMO_IDS.triggers.stellenAnkauf,
      type: 'Stellenanzeige Ankauf/Projektentwicklung',
      content: 'Lambda Immobilien GmbH hatte eine Stelle für Leitung Ankauf ausgeschrieben. [TEST/Beispiel]',
      source_url: 'https://www.lambda-immobilien.example.com/jobs/ankauf',
      found_at: '2026-10-10',
      is_assumption: false,
      verdict: 'strong',
      offer_relevance: 3,
      person_relevance: 3,
      evidence_kind: 'public',
      is_active: true,
      feedback: 'confirmed',
      feedback_evidence:
        'Im Gespräch bestätigt: Ankaufsteam wächst, Koordinationsaufwand steigt – konkretes Interesse an Prozessunterstützung.',
    },
  ]);

  // ---- Lead context for A (call note) ----
  await upsert(db, 'lead_context', [
    {
      id: DEMO_IDS.context.exampleA1,
      lead_id: DEMO_IDS.leads.exampleA,
      kind: 'note',
      author: 'seller',
      content:
        'Gespräch 30.10.2026: Thomas Keller bestätigt 40–50 Exposés/Monat. ' +
        'Interne Bewertung dauert aktuell 3–4 Tage pro Objekt – zu langsam für attraktive Lagen. ' +
        'Keller entscheidet eigenständig über Prozesstools. Demo-Termin nächste Woche vereinbart. [TEST/Beispiel]',
      occurred_at: '2026-10-30T14:30:00Z',
      source_url: null,
    },
  ]);

  // ---- BANT claims for A ----
  await upsert(db, 'bant_claim', [
    {
      id: DEMO_IDS.bantClaims.exampleA_need,
      lead_id: DEMO_IDS.leads.exampleA,
      dimension: 'need',
      status: 'confirmed',
      value: '40–50 Exposés/Monat, interne Erstbewertung dauert 3–4 Tage – zu langsam für attraktive Lagen',
      evidence: 'Gespräch 30.10.2026: direkt bestätigt',
      source: 'call',
      call_log_id: DEMO_IDS.callLogs.exampleA,
      created_at: '2026-10-30T15:00:00Z',
    },
    {
      id: DEMO_IDS.bantClaims.exampleA_authority,
      lead_id: DEMO_IDS.leads.exampleA,
      dimension: 'authority',
      status: 'confirmed',
      value: 'Geschäftsführer entscheidet eigenständig über Prozesstools',
      evidence: 'Gespräch 30.10.2026: Keller bestätigt Entscheidungsverantwortung',
      source: 'call',
      call_log_id: DEMO_IDS.callLogs.exampleA,
      created_at: '2026-10-30T15:00:00Z',
    },
    {
      id: DEMO_IDS.bantClaims.exampleA_timeline,
      lead_id: DEMO_IDS.leads.exampleA,
      dimension: 'timeline',
      status: 'assumed',
      value: 'Demo-Termin nächste Woche vereinbart',
      evidence: 'Gespräch 30.10.2026',
      source: 'call',
      call_log_id: DEMO_IDS.callLogs.exampleA,
      created_at: '2026-10-30T15:00:00Z',
    },
  ]);

  // ---- Call log for A (demo-ready) ----
  await upsert(db, 'call_log', [
    {
      id: DEMO_IDS.callLogs.exampleA,
      lead_id: DEMO_IDS.leads.exampleA,
      outcome: 'booked',
      notes:
        'Gespräch lief sehr positiv. Keller bestätigt Ankaufsprozess-Problem. ' +
        'Demo-Termin nächste Woche vereinbart. [TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: true,
      recommended_action: 'demo_handoff',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-10-30T14:30:00Z',
    },
    // Historic call logs H1–H4
    {
      id: DEMO_IDS.callLogs.historicH1,
      lead_id: DEMO_IDS.leads.historicH1,
      outcome: 'not_booked',
      notes:
        'Trigger widersprochen: Ankauf läuft intern gut, Stelle war Ersatzbesetzung. Kein Bedarf. [TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: false,
      recommended_action: 'stop',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-09-20T15:00:00Z',
    },
    {
      id: DEMO_IDS.callLogs.historicH2,
      lead_id: DEMO_IDS.leads.historicH2,
      outcome: 'not_booked',
      notes:
        'Trigger widersprochen: Stelle intern besetzt – kein Tool-Bedarf geäußert. [TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: false,
      recommended_action: 'stop',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-09-25T11:00:00Z',
    },
    {
      id: DEMO_IDS.callLogs.historicH3,
      lead_id: DEMO_IDS.leads.historicH3,
      outcome: 'not_booked',
      notes:
        'Trigger widersprochen: Ankauf über Muttergesellschaft – kein eigenständiger Prozess. [TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: false,
      recommended_action: 'stop',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-10-08T14:00:00Z',
    },
    {
      id: DEMO_IDS.callLogs.historicH4,
      lead_id: DEMO_IDS.leads.historicH4,
      outcome: 'not_booked',
      notes:
        'Trigger bestätigt: Ankaufsteam wächst, Koordinationsaufwand steigt. ' +
        'Interesse vorhanden, aber Budget-Entscheidung noch offen. Follow-up Q1. [TEST/Beispiel]',
      transcript: null,
      analysis: null,
      demo_ready: false,
      recommended_action: 'follow_up',
      seller_action: null,
      seller_reason: null,
      created_at: '2026-10-18T16:00:00Z',
    },
  ]);

  // ---- Demo event on A ----
  await upsert(db, 'lead_event', {
    id: DEMO_IDS.events.exampleAMeeting,
    lead_id: DEMO_IDS.leads.exampleA,
    type: 'meeting_request',
    occurred_at: new Date().toISOString(),
    evidence: '[TEST/Beispiel] Thomas Keller hat Demo-Termin für nächste Woche bestätigt.',
    is_test: true,
    dedupe_key: `demo:${DEMO_IDS.leads.exampleA}:meeting_request`,
  });

  // ---- Collect row counts ----
  const tables = [
    'campaign', 'trigger_catalog', 'lead', 'lead_trigger',
    'lead_context', 'bant_claim', 'call_log', 'lead_event', 'company_check',
  ];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    counts[t] = await rowCount(db, t);
  }

  return { counts, eventId: DEMO_IDS.events.exampleAMeeting };
}
