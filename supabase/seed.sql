-- Outbound Brain — Demo Seed (SQL fallback)
--
-- SOURCE OF TRUTH: lib/seed-data.ts (run via `pnpm seed` or POST /api/seed).
-- This file must stay byte-for-byte consistent with DEMO_IDS and data in lib/seed-data.ts.
-- If they diverge, lib/seed-data.ts wins — update this file to match it.
--
-- Run directly in the Supabase SQL Editor only when pnpm seed is unavailable.
-- All companies / emails / URLs use .example.com — clearly fictitious sample data.
--
-- IDEMPOTENT: deletes all rows in cascade order, then inserts demo data.
-- Safe to run multiple times.

-- ── 0. Delete all rows (reverse dependency order) ──────────────────────────
delete from agent_step;
delete from decision;
delete from call_log;
delete from lead_event;
delete from cadence_step;
delete from lead_trigger;
delete from lead;
delete from trigger_catalog;
delete from integration;
delete from campaign;

-- ── 1. Campaign ─────────────────────────────────────────────────────────────
insert into campaign (
  id, offer, icp_roles, icp_company_size_min, icp_company_size_max,
  icp_regions, exclusions, language, tone, is_active
) values (
  '10000001-0000-0000-0000-000000000001',
  'KI-gestützte Outbound-Plattform für B2B-Sales-Teams: mehr qualifizierte Erstgespräche mit weniger Recherche [DEMO]',
  array['VP Sales','Head of Sales','CRO','Sales Director'],
  50, 500,
  array['DACH','Deutschland','Österreich','Schweiz'],
  array['Bestandskunden','offene Deals','Opt-outs'],
  'de', 'professional', true
);

-- ── 2. Trigger catalog (7 approved + 2 unapproved) ──────────────────────────
insert into trigger_catalog (
  id, campaign_id, name, buying_reason, tier, window_days, required_evidence, approved
) values
(
  '20000001-0000-0000-0000-000000000001',
  '10000001-0000-0000-0000-000000000001',
  'Neue Vertriebsführungskraft',
  'Neue Führungskräfte überprüfen in den ersten 90 Tagen Prozesse und Tools – optimales Fenster für Vendor-Gespräche.',
  1, 90,
  'LinkedIn-Profil oder Post (Needle), Pressemitteilung',
  true
),
(
  '20000001-0000-0000-0000-000000000002',
  '10000001-0000-0000-0000-000000000001',
  'Finanzierungsrunde',
  'Neues Kapital fließt in Skalierung und Tooling – erste 48 Stunden nach der Meldung sind entscheidend.',
  1, 180,
  'Pressemitteilung, Handelsregister oder Investoren-Post',
  true
),
(
  '20000001-0000-0000-0000-000000000003',
  '10000001-0000-0000-0000-000000000001',
  'Einstellungswelle im Vertrieb',
  'Budget fließt aktiv in Outbound – gleichzeitig Bedarf an Onboarding-Tools für neue SDRs.',
  2, 30,
  'Aktive Stellenausschreibungen (Needle Company Jobs, Karriereseite)',
  true
),
(
  '20000001-0000-0000-0000-000000000004',
  '10000001-0000-0000-0000-000000000001',
  'Kontakt postet über das Problem',
  'Der Pain wird in eigenen Worten formuliert – das Gespräch beginnt mit einer Bestätigung.',
  2, 14,
  'Der Post selbst (Needle LinkedIn Posts)',
  true
),
(
  '20000001-0000-0000-0000-000000000005',
  '10000001-0000-0000-0000-000000000001',
  'Expansion: neuer Markt, Standort oder Produkt',
  'Neue Zielmärkte brauchen neue Pipeline – ohne lokales Netzwerk ist Outbound-Tooling besonders wertvoll.',
  2, 60,
  'Unternehmensnews, Pressemitteilung',
  true
),
(
  '20000001-0000-0000-0000-000000000006',
  '10000001-0000-0000-0000-000000000001',
  'CRM- oder Sales-Tool-Wechsel',
  'Benachbarte Tools werden im gleichen Fenster überprüft – Einstieg in laufende Entscheidungsprozesse.',
  2, 90,
  'Stellenausschreibung nennt das Tool, Post des Kontakts, Vendor-Fallstudie',
  true
),
(
  '20000001-0000-0000-0000-000000000007',
  '10000001-0000-0000-0000-000000000001',
  'Fusion oder Übernahme',
  'Teams und Vendor-Stacks werden konsolidiert – nur in Kombination mit Tier-1- oder Tier-2-Trigger nutzen.',
  3, 90,
  'Pressemitteilung',
  true
),
-- Unapproved candidates — awaiting expert sign-off
(
  '20000001-0000-0000-0000-000000000008',
  '10000001-0000-0000-0000-000000000001',
  'Ehemaliger Nutzer wechselt Unternehmen',
  'Kennt den Wert bereits und will einen frühen Gewinn in der neuen Rolle erzielen.',
  2, 60,
  'LinkedIn-Profil (Needle)',
  false
),
(
  '20000001-0000-0000-0000-000000000009',
  '10000001-0000-0000-0000-000000000001',
  'Schlüsselkraft verlässt das Unternehmen',
  'Übergangsphase: Die Nachfolge hinterfragt das bestehende Setup.',
  2, 60,
  'LinkedIn, Presse',
  false
);

-- ── 3. Leads with pre-computed cached_brief ─────────────────────────────────
insert into lead (
  id, name, role, company, company_domain, company_size, region,
  email, phone, profile_url, source, fit_score, interest_score, status, cached_brief
) values

-- Lead 1: Jonas Keller — top lead, STRONG new-sales-leader trigger
(
  '30000001-0000-0000-0000-000000000001',
  'Jonas Keller', 'VP Sales', 'Nordlicht GmbH', 'nordlicht.example.com',
  120, 'Deutschland',
  'j.keller@nordlicht.example.com', '+49 40 123 456 78',
  'https://www.linkedin.example.com/in/jonas-keller-nordlicht',
  'seed', 85, 50, 'briefed',
  $json${
    "headline": "Jonas Keller – neue VP-Sales-Rolle bei Nordlicht GmbH [DEMO]",
    "whyNow": "Jonas Keller hat vor 6 Wochen die Position als VP Sales bei Nordlicht GmbH übernommen. Neue Vertriebsleiter überprüfen in den ersten 90 Tagen systematisch Tools und Prozesse.",
    "evidenceUrl": "https://www.linkedin.example.com/in/jonas-keller-nordlicht",
    "hook": "Herzlichen Glückwunsch zur neuen Rolle – neue Vertriebsleiter stehen häufig vor der Frage, welche Tools ihr Team wirklich schneller machen.",
    "talkingPoints": [
      "Outbound Brain zeigt Ihrem Team täglich, wen es anrufen soll und warum – mit verifizierten Quellen für jeden Trigger.",
      "Junior-SDRs führen innerhalb einer Minute nach dem Öffnen des Briefings ein hochwertiges Erstgespräch.",
      "Nach jedem Anruf analysiert Claude das Gespräch und passt die Prioritätsliste automatisch an."
    ],
    "objections": [
      {
        "objection": "Wir haben schon genug Tools.",
        "answer": "Das höre ich oft. Die meisten Tools zeigen Leads – Outbound Brain zeigt, welchen Lead Sie heute anrufen und was Sie sagen sollen. Es macht bestehende Tools rentabler, ersetzt sie nicht."
      },
      {
        "objection": "Unser Team ist erfahren – die brauchen keine Vorbereitung.",
        "answer": "Gerade erfahrene Verkäufer profitieren: Ein minutenschnelles Briefing mit drei Gesprächspunkten und zwei Einwandantworten spart 30 Minuten Recherche pro Anruf."
      }
    ],
    "phone": "+49 40 123 456 78",
    "consentLine": "Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Natürlich nur mit Ihrer ausdrücklichen Zustimmung.",
    "meetingSlots": ["Do 14:00 Uhr", "Fr 10:00 Uhr"],
    "contact": "Jonas Keller, VP Sales – Nordlicht GmbH, Hamburg",
    "goal": "Demo-Termin buchen und Pain rund um Recherche-Aufwand pro Anruf bestätigen",
    "assumptions": ["Nordlicht GmbH nutzt aktuell kein dediziertes Sales-Intelligence-Tool (Annahme – nicht verifiziert)"]
  }$json$::jsonb
),

-- Lead 2: Sarah Müller — Series B funding trigger
(
  '30000001-0000-0000-0000-000000000002',
  'Sarah Müller', 'Head of Sales', 'Meridian Software AG', 'meridian-software.example.com',
  85, 'Deutschland',
  'sarah.mueller@meridian-software.example.com', null,
  'https://www.linkedin.example.com/in/sarah-mueller-meridian',
  'seed', 70, 20, 'researched',
  $json${
    "headline": "Sarah Müller – Head of Sales nach Series B bei Meridian Software AG [DEMO]",
    "whyNow": "Meridian Software AG hat vor 3 Monaten eine Series B über 12 Mio. EUR abgeschlossen. Frisches Kapital fließt typischerweise in Skalierung des Vertriebs und neue Tools.",
    "evidenceUrl": "https://www.meridian-software.example.com/presse/series-b-abschluss",
    "hook": "Herzlichen Glückwunsch zur Series B – jetzt ist der Moment, den Outbound-Motor zu skalieren, bevor der Wettbewerb aufholt.",
    "talkingPoints": [
      "Mit neuem Budget wächst das Sales-Team – Outbound Brain sorgt dafür, dass auch neue SDRs sofort hochwertige Anrufe führen.",
      "Jeder Anruf wird mit Claude analysiert: Was hat funktioniert, welcher Einwand kam, was ist der nächste Schritt.",
      "Die Prioritätsliste lernt aus jedem gebuchten Termin – keine manuelle CRM-Pflege nötig."
    ],
    "objections": [
      {
        "objection": "Wir stellen gerade erst ein Team auf.",
        "answer": "Genau der richtige Zeitpunkt: Outbound Brain bringt neue Mitarbeiter in Stunden auf Anruf-Niveau – nicht in Wochen."
      },
      {
        "objection": "Das Budget ist schon verplant.",
        "answer": "Verständlich. Darf ich fragen, was ein SDR bei Ihnen monatlich kostet? Outbound Brain amortisiert sich typisch mit einem zusätzlichen gebuchten Meeting pro Woche."
      }
    ],
    "phone": null,
    "consentLine": "Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Natürlich nur mit Ihrer ausdrücklichen Zustimmung.",
    "meetingSlots": ["Do 14:00 Uhr", "Fr 10:00 Uhr"],
    "contact": "Sarah Müller, Head of Sales – Meridian Software AG, München",
    "goal": "Pain um Skalierung nach Funding validieren und Demo-Termin buchen",
    "assumptions": ["Meridian Software AG nutzt aktuell Apollo oder ein ähnliches Prospecting-Tool (Annahme – nicht verifiziert)"]
  }$json$::jsonb
),

-- Lead 3: Thomas Berger — expansion trigger + contact posts
(
  '30000001-0000-0000-0000-000000000003',
  'Thomas Berger', 'CRO', 'Zentra GmbH', 'zentra.example.com',
  200, 'Deutschland',
  'thomas.berger@zentra.example.com', null,
  'https://www.linkedin.example.com/in/thomas-berger-zentra',
  'seed', 65, 15, 'researched',
  $json${
    "headline": "Thomas Berger – CRO bei Zentra GmbH, Expansion nach Österreich [DEMO]",
    "whyNow": "Zentra GmbH hat vor 7 Wochen einen neuen Standort in Wien eröffnet. Expansion bedeutet neuen Pipeline-Bedarf in einem unbekannten Markt ohne lokales Netzwerk.",
    "evidenceUrl": "https://www.zentra.example.com/news/expansion-wien-2026",
    "hook": "Zum neuen Wien-Standort – in einem neuen Markt zählt jeder qualifizierte Anruf doppelt, weil das lokale Netzwerk noch fehlt.",
    "talkingPoints": [
      "Outbound Brain recherchiert Trigger-Events auch im österreichischen Markt automatisch – mit lokalen Quellen.",
      "Ihr Wiener Team bekommt täglich briefingfähige Leads, ohne auf lokales Netzwerkwissen angewiesen zu sein.",
      "Jeder gebuchte Termin verbessert die Prioritätsliste für die nächste Woche."
    ],
    "objections": [
      {
        "objection": "Wir kennen den österreichischen Markt noch nicht gut genug.",
        "answer": "Genau dafür ist Outbound Brain gebaut: Claude recherchiert öffentliche Trigger-Events pro Unternehmen – unabhängig vom lokalen Netzwerk."
      },
      {
        "objection": "Wir haben bei der Expansion gerade zu viel auf dem Teller.",
        "answer": "Das verstehe ich. Darf ich einen 20-Minuten-Termin vorschlagen, damit Sie sehen, wie schnell das Setup läuft?"
      }
    ],
    "phone": null,
    "consentLine": "Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Natürlich nur mit Ihrer ausdrücklichen Zustimmung.",
    "meetingSlots": ["Do 14:00 Uhr", "Fr 10:00 Uhr"],
    "contact": "Thomas Berger, CRO – Zentra GmbH, Berlin / Wien",
    "goal": "Expansion-Pain validieren und Demo für das Wien-Team buchen",
    "assumptions": ["Zentra GmbH hat noch kein dediziertes Outbound-Tool für den österreichischen Markt (Annahme)"]
  }$json$::jsonb
),

-- Lead 4: Lena Schreiber — hiring surge
(
  '30000001-0000-0000-0000-000000000004',
  'Lena Schreiber', 'Sales Director', 'Alphawerk GmbH', 'alphawerk.example.com',
  75, 'Deutschland',
  'l.schreiber@alphawerk.example.com', null,
  'https://www.linkedin.example.com/in/lena-schreiber-alphawerk',
  'seed', 60, 10, 'new',
  $json${
    "headline": "Lena Schreiber – Sales Director, Alphawerk GmbH baut SDR-Team auf [DEMO]",
    "whyNow": "Alphawerk GmbH hat in den letzten 4 Wochen drei SDR-Stellen ausgeschrieben. Aktive Einstellungen bedeuten Budget für Outbound – und Bedarf an Onboarding-Tools.",
    "evidenceUrl": "https://www.alphawerk.example.com/karriere/sdr-vertriebsinnendienst",
    "hook": "Sie bauen gerade ein SDR-Team auf – Outbound Brain sorgt dafür, dass neue Mitarbeiter innerhalb einer Woche qualifizierte Anrufe führen.",
    "talkingPoints": [
      "Neue SDRs sind typisch 4–6 Wochen ohne produktive Anrufe – Outbound Brain halbiert diese Anlaufzeit.",
      "Das tägliche Briefing gibt jedem Teammitglied die Top-5-Leads mit Grund und Gesprächsleitfaden.",
      "Kein Erfahrungswissen geht verloren: Trigger-Katalog und Scoring lernen aus jedem gebuchten Termin."
    ],
    "objections": [
      {
        "objection": "Wir schulen neue Mitarbeiter intern.",
        "answer": "Outbound Brain ergänzt Ihr internes Training: Das Tool gibt jedem SDR sofort die Vorbereitung, die sonst ein Senior-Verkäufer liefert."
      },
      {
        "objection": "Zu früh – wir haben noch nicht alle Stellen besetzt.",
        "answer": "Genau der richtige Zeitpunkt für ein kurzes Gespräch: Setup dauert 30 Minuten, und die ersten Leads können noch diese Woche angerufen werden."
      }
    ],
    "phone": null,
    "consentLine": "Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Natürlich nur mit Ihrer ausdrücklichen Zustimmung.",
    "meetingSlots": ["Do 14:00 Uhr", "Fr 10:00 Uhr"],
    "contact": "Lena Schreiber, Sales Director – Alphawerk GmbH, Frankfurt",
    "goal": "SDR-Onboarding-Pain validieren und Demo buchen, bevor erste SDRs starten",
    "assumptions": ["Alphawerk GmbH nutzt kein spezialisiertes Sales-Intelligence-Tool (Annahme – nicht verifiziert)"]
  }$json$::jsonb
),

-- Lead 5: Michael Wagner — CRM switch
(
  '30000001-0000-0000-0000-000000000005',
  'Michael Wagner', 'VP Sales', 'Hanse Ventures GmbH', 'hanse-ventures.example.com',
  180, 'Deutschland',
  'm.wagner@hanse-ventures.example.com', null,
  'https://www.linkedin.example.com/in/michael-wagner-hanse',
  'seed', 55, 10, 'new',
  $json${
    "headline": "Michael Wagner – VP Sales, Hanse Ventures GmbH wechselt CRM [DEMO]",
    "whyNow": "Hanse Ventures GmbH hat gleichzeitig eine CRM-Administrator- und eine HubSpot-Spezialisten-Stelle ausgeschrieben – klassisches Zeichen eines laufenden Tool-Wechsels.",
    "evidenceUrl": "https://www.hanse-ventures.example.com/jobs/crm-administrator-hubspot",
    "hook": "Ein CRM-Wechsel ist der Moment, auch den Outbound-Stack neu zu denken – bevor die Migration abgeschlossen ist.",
    "talkingPoints": [
      "Outbound Brain integriert sich in jedes CRM – die Verbindung dauert beim Setup unter 10 Minuten.",
      "Während der CRM-Migration verliert kein Lead seinen Prioritätsstatus – Outbound Brain pflegt die Rangliste unabhängig.",
      "Nach dem Wechsel wird jeder Anruf automatisch ins neue CRM geloggt."
    ],
    "objections": [
      {
        "objection": "Wir sind mitten im CRM-Wechsel, jetzt kommt nichts Neues dazu.",
        "answer": "Verständlich. Outbound Brain braucht kein bestehendes CRM – es funktioniert als eigenständige Lösung und lässt sich später verbinden."
      },
      {
        "objection": "Das entscheidet unser IT-Team.",
        "answer": "Kein Problem. Hätten Sie Interesse, IT-seitig einen technischen Brief zu bekommen? Outbound Brain hat keine On-Premise-Komponenten."
      }
    ],
    "phone": null,
    "consentLine": "Darf ich das Gespräch für interne Qualitätszwecke aufnehmen? Natürlich nur mit Ihrer ausdrücklichen Zustimmung.",
    "meetingSlots": ["Do 14:00 Uhr", "Fr 10:00 Uhr"],
    "contact": "Michael Wagner, VP Sales – Hanse Ventures GmbH, Hamburg",
    "goal": "CRM-Wechsel als Timing-Fenster nutzen und Demo-Termin buchen",
    "assumptions": ["Hanse Ventures wechselt von einem Legacy-CRM zu HubSpot (Annahme basierend auf Stellenausschreibungen)"]
  }$json$::jsonb
);

-- ── 4. Lead triggers ─────────────────────────────────────────────────────────
insert into lead_trigger (
  id, lead_id, trigger_type_id, type, content,
  source_url, found_at, is_assumption, verdict, offer_relevance, person_relevance
) values

-- Jonas: STRONG new_sales_leader
(
  '40000001-0000-0000-0000-000000000001',
  '30000001-0000-0000-0000-000000000001',
  '20000001-0000-0000-0000-000000000001',
  'Neue Vertriebsführungskraft',
  'Jonas Keller hat vor 6 Wochen die Position als VP Sales bei Nordlicht GmbH angetreten.',
  'https://www.linkedin.example.com/in/jonas-keller-nordlicht',
  '2026-10-24', false, 'strong', 3, 3
),
-- Jonas: USABLE hiring_surge
(
  '40000001-0000-0000-0000-000000000002',
  '30000001-0000-0000-0000-000000000001',
  '20000001-0000-0000-0000-000000000003',
  'Einstellungswelle im Vertrieb',
  'Nordlicht GmbH hat in den letzten 3 Wochen zwei SDR- und eine AE-Stelle ausgeschrieben.',
  'https://www.nordlicht.example.com/karriere/sales-development-representative',
  '2026-10-20', false, 'usable', 2, 2
),
-- Jonas: REJECT expansion rumor (no verified source — shows catalog filtering at work)
(
  '40000001-0000-0000-0000-000000000003',
  '30000001-0000-0000-0000-000000000001',
  '20000001-0000-0000-0000-000000000005',
  'Expansion: neuer Markt oder Standort',
  'Gerücht über Expansion nach Österreich – keine öffentliche Quelle verifiziert.',
  'https://www.nordlicht.example.com',
  null, true, 'reject', 1, 1
),
-- Sarah: STRONG funding
(
  '40000001-0000-0000-0000-000000000004',
  '30000001-0000-0000-0000-000000000002',
  '20000001-0000-0000-0000-000000000002',
  'Finanzierungsrunde',
  'Meridian Software AG hat eine Series B über 12 Mio. EUR abgeschlossen (Earlybird Venture Capital).',
  'https://www.meridian-software.example.com/presse/series-b-abschluss',
  '2026-07-15', false, 'strong', 3, 3
),
-- Sarah: USABLE crm_switch
(
  '40000001-0000-0000-0000-000000000005',
  '30000001-0000-0000-0000-000000000002',
  '20000001-0000-0000-0000-000000000006',
  'CRM- oder Sales-Tool-Wechsel',
  'Meridian Software AG sucht einen Salesforce-Administrator – Hinweis auf laufenden CRM-Wechsel.',
  'https://www.meridian-software.example.com/karriere/salesforce-administrator',
  '2026-10-01', false, 'usable', 2, 2
),
-- Thomas: USABLE expansion
(
  '40000001-0000-0000-0000-000000000006',
  '30000001-0000-0000-0000-000000000003',
  '20000001-0000-0000-0000-000000000005',
  'Expansion: neuer Markt oder Standort',
  'Zentra GmbH hat vor 7 Wochen einen neuen Standort in Wien eröffnet und sucht österreichische Kunden.',
  'https://www.zentra.example.com/news/expansion-wien-2026',
  '2026-09-10', false, 'usable', 2, 2
),
-- Thomas: USABLE contact_posts
(
  '40000001-0000-0000-0000-000000000007',
  '30000001-0000-0000-0000-000000000003',
  '20000001-0000-0000-0000-000000000004',
  'Kontakt postet über das Problem',
  E'Thomas Berger auf LinkedIn: „Unsere SDRs verbringen 40 % ihrer Zeit mit Recherche statt mit Anrufen – das muss sich ändern.“',
  'https://www.linkedin.example.com/posts/thomas-berger-zentra-sdr-recherche',
  '2026-10-18', false, 'usable', 3, 2
),
-- Lena: USABLE hiring_surge
(
  '40000001-0000-0000-0000-000000000008',
  '30000001-0000-0000-0000-000000000004',
  '20000001-0000-0000-0000-000000000003',
  'Einstellungswelle im Vertrieb',
  'Alphawerk GmbH hat in den letzten 4 Wochen 3 SDR-Stellen ausgeschrieben.',
  'https://www.alphawerk.example.com/karriere/sdr-vertriebsinnendienst',
  '2026-10-05', false, 'usable', 2, 2
),
-- Michael: USABLE crm_switch
(
  '40000001-0000-0000-0000-000000000009',
  '30000001-0000-0000-0000-000000000005',
  '20000001-0000-0000-0000-000000000006',
  'CRM- oder Sales-Tool-Wechsel',
  'Hanse Ventures GmbH sucht gleichzeitig einen CRM-Administrator und einen HubSpot-Spezialisten.',
  'https://www.hanse-ventures.example.com/jobs/crm-administrator-hubspot',
  '2026-10-12', false, 'usable', 2, 1
);

-- ── 5. Test event on Jonas ───────────────────────────────────────────────────
insert into lead_event (
  id, lead_id, type, occurred_at, evidence, is_test, dedupe_key
) values (
  '50000001-0000-0000-0000-000000000001',
  '30000001-0000-0000-0000-000000000001',
  'meeting_request',
  now(),
  '[DEMO] Simulated meeting request – Jonas Keller hat über LinkedIn geantwortet.',
  true,
  'demo:30000001-0000-0000-0000-000000000001:meeting_request'
);

-- ── 6. Decision for Jonas ────────────────────────────────────────────────────
insert into decision (
  id, lead_id, action, reason, fit_score, interest_score, decided_by
) values (
  '60000001-0000-0000-0000-000000000001',
  '30000001-0000-0000-0000-000000000001',
  'call_now',
  'Meeting-Anfrage eingegangen (Test-Event). Fit ≥ 60 und Interest ≥ 50 – sofort anrufen.',
  85, 50, 'rules'
);

-- ── 7. Summary ───────────────────────────────────────────────────────────────
select 'campaign'       as "table", count(*) as rows from campaign
union all
select 'trigger_catalog',            count(*) from trigger_catalog
union all
select 'lead',                        count(*) from lead
union all
select 'lead_trigger',                count(*) from lead_trigger
union all
select 'lead_event',                  count(*) from lead_event
union all
select 'decision',                    count(*) from decision
order by "table";
