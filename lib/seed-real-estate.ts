/**
 * Outbound Brain — Real-estate ICP flow seed helpers.
 *
 * Exports:
 *  - REAL_ESTATE_TRIGGER_CATALOG  (6 trigger entries, no campaign_id — added at insert time)
 *  - RE_TRIGGER_UUIDS             (slug → stable UUID map)
 *  - keywords                     (slug → keyword strings for scheduleIcpChecks matching)
 *  - PREPARED_COMPANIES           (10 verified German Projektentwickler/Bauträger)
 *  - seedPreparedCompanies()      (idempotent upsert by stable id)
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { companyKey } from './origin';

// ---------------------------------------------------------------------------
// Stable UUID helper (sha1-based, same format as app/api/proposals/route.ts)
// ---------------------------------------------------------------------------

function stableId(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Slug → stable UUID map (exported so seed-data.ts can reference them)
// ---------------------------------------------------------------------------

export const RE_TRIGGER_UUIDS: Record<string, string> = {
  're-ankaufsprofil':      stableId('trigger:re-ankaufsprofil'),
  're-neues-projekt':      stableId('trigger:re-neues-projekt'),
  're-stellen-ankauf':     stableId('trigger:re-stellen-ankauf'),
  're-konversion':         stableId('trigger:re-konversion'),
  're-expansion':          stableId('trigger:re-expansion'),
  're-esg-modernisierung': stableId('trigger:re-esg-modernisierung'),
};

// ---------------------------------------------------------------------------
// Keywords for trigger matching in scheduleIcpChecks (Task 4)
// ---------------------------------------------------------------------------

export const keywords: Record<string, string[]> = {
  're-ankaufsprofil':      ['ankaufsprofil', 'ankaufsmandat', 'ankaufskriterien', 'suchprofil', 'ankaufsstrategie', 'ankaufsparameter'],
  're-neues-projekt':      ['neues projekt', 'baustart', 'spatenstich', 'baugenehmigung', 'neubauprojekt', 'projektstart', 'grundsteinlegung'],
  're-stellen-ankauf':     ['ankauf', 'ankaufsmanager', 'acquisitions', 'projektentwickler', 'leiter ankauf', 'head of acquisitions', 'transaction manager'],
  're-konversion':         ['konversion', 'nachverdichtung', 'nutzungsänderung', 'umwidmung', 'bestandsaufwertung', 'refurbishment', 'revitalisierung'],
  're-expansion':          ['expansion', 'neuer markt', 'neuer standort', 'neue region', 'wachstumsstrategie', 'erschließung', 'markteintritt'],
  're-esg-modernisierung': ['esg', 'energetische sanierung', 'modernisierung', 'co2', 'nachhaltig', 'klimaneutral', 'dekarbonisierung', 'green building'],
};

// ---------------------------------------------------------------------------
// Trigger catalog entries (campaign_id injected at seed time)
// ---------------------------------------------------------------------------

export interface ReTriggerEntry {
  slug: string;
  id: string;
  name: string;
  buying_reason: string;
  tier: 1 | 2;
  window_days: number;
  required_evidence: string;
  approved: boolean;
}

export const REAL_ESTATE_TRIGGER_CATALOG: ReTriggerEntry[] = [
  {
    slug: 're-ankaufsprofil',
    id: RE_TRIGGER_UUIDS['re-ankaufsprofil'],
    name: 'Ankaufsprofil veröffentlicht',
    buying_reason:
      'Unternehmen sucht aktiv nach Objekten – höchster Timing-Score, wenn Suchprofil öffentlich zugänglich ist.',
    tier: 1,
    window_days: 90,
    required_evidence: 'URL des öffentlichen Ankaufsprofils oder Suchprofils mit Datum der Veröffentlichung',
    approved: true,
  },
  {
    slug: 're-neues-projekt',
    id: RE_TRIGGER_UUIDS['re-neues-projekt'],
    name: 'Neues Projekt / Baustart',
    buying_reason:
      'Neues Vorhaben signalisiert aktive Entwicklungstätigkeit und Koordinationsbedarf – typisches Fenster für Prozessoptimierung.',
    tier: 1,
    window_days: 90,
    required_evidence: 'Pressemitteilung, Baugenehmigungsbekanntmachung oder Projektnews mit Datum',
    approved: true,
  },
  {
    slug: 're-stellen-ankauf',
    id: RE_TRIGGER_UUIDS['re-stellen-ankauf'],
    name: 'Stellenanzeige Ankauf/Projektentwicklung',
    buying_reason:
      'Personalwachstum im Ankauf deutet auf steigende Transaktionslast hin – Hypothese: Bedarf an Prozessunterstützung (nicht verifiziert).',
    tier: 2,
    window_days: 90,
    required_evidence: 'Aktive Stellenanzeige mit Datum (Karriereseite, LinkedIn Jobs, Stepstone)',
    approved: true,
  },
  {
    slug: 're-konversion',
    id: RE_TRIGGER_UUIDS['re-konversion'],
    name: 'Konversion / Nachverdichtung',
    buying_reason:
      'Umnutzungs- oder Verdichtungsvorhaben erfordern intensive Ankaufsprüfung und Projektsteuerung – erhöhter Koordinationsaufwand.',
    tier: 2,
    window_days: 90,
    required_evidence: 'Projektankündigung, B-Plan-Änderung oder Pressebericht mit Datum',
    approved: true,
  },
  {
    slug: 're-expansion',
    id: RE_TRIGGER_UUIDS['re-expansion'],
    name: 'Regionale Expansion',
    buying_reason:
      'Eintritt in neue Märkte erzeugt Ankaufsdruck in unbekanntem Terrain – erhöhter Bedarf an strukturierter Objektbewertung.',
    tier: 2,
    window_days: 90,
    required_evidence: 'Ankündigung neuer Marktregion oder Standorteröffnung mit Datum',
    approved: true,
  },
  {
    slug: 're-esg-modernisierung',
    id: RE_TRIGGER_UUIDS['re-esg-modernisierung'],
    name: 'ESG-/Modernisierungsprogramm',
    buying_reason:
      'ESG-Investitionsprogramme erzeugen Ankauf- und Umbaubedarf – typisches Fenster für Prozess- und Prioritätsfragen.',
    tier: 2,
    window_days: 90,
    required_evidence: 'Pressemitteilung, Nachhaltigkeitsbericht oder Unternehmensnews mit Datum',
    approved: true,
  },
];

// ---------------------------------------------------------------------------
// Prepared real companies — 10 verified German Projektentwickler / Bauträger
// HTTP 200 verified on 2026-10-31 via curl -sIL
// ---------------------------------------------------------------------------

export interface PreparedCompany {
  name: string;
  domain: string;
  city: string;
  sourceUrl: string;
}

export const PREPARED_COMPANIES: PreparedCompany[] = [
  {
    name: 'Instone Real Estate Group SE',
    domain: 'instonegroup.de',
    city: 'Essen',
    sourceUrl: 'https://www.instonegroup.de',
  },
  {
    name: 'STRABAG Real Estate GmbH',
    domain: 'strabag-real-estate.com',
    city: 'Köln',
    sourceUrl: 'https://www.strabag-real-estate.com',
  },
  {
    name: 'Aurelis Real Estate GmbH & Co. KG',
    domain: 'aurelis-real-estate.de',
    city: 'Eschborn',
    sourceUrl: 'https://www.aurelis-real-estate.de',
  },
  {
    name: 'Bayerische Hausbau GmbH & Co. KG',
    domain: 'bayerische-hausbau.de',
    city: 'München',
    sourceUrl: 'https://www.bayerische-hausbau.de',
  },
  {
    name: 'BUWOG Group GmbH',
    domain: 'buwog.de',
    city: 'Berlin',
    sourceUrl: 'https://www.buwog.de',
  },
  {
    name: 'PROJECT Immobilien Wohnen AG',
    domain: 'project-immobilien.de',
    city: 'Nürnberg',
    sourceUrl: 'https://www.project-immobilien.de',
  },
  {
    name: 'Bonava Deutschland GmbH',
    domain: 'bonava.de',
    city: 'Hamburg',
    sourceUrl: 'https://www.bonava.de',
  },
  {
    name: 'Bauwert AG',
    domain: 'bauwert.de',
    city: 'Berlin',
    sourceUrl: 'https://www.bauwert.de',
  },
  {
    name: 'DIBAG Industriebau AG',
    domain: 'dibag.de',
    city: 'München',
    sourceUrl: 'https://www.dibag.de',
  },
  {
    name: 'PRIMUS Immobilien AG',
    domain: 'primus-immobilien.de',
    city: 'Frankfurt',
    sourceUrl: 'https://www.primus-immobilien.de',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsert(
  db: SupabaseClient,
  table: string,
  data: Record<string, unknown> | Record<string, unknown>[],
): Promise<void> {
  const { error } = await db.from(table).upsert(data as never, { onConflict: 'id' });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// seedPreparedCompanies — idempotent upsert by stable id derived from domain
// ---------------------------------------------------------------------------

/**
 * Seeds the 10 prepared real companies as leads with origin='prepared', is_test=false.
 * Idempotent: each company gets a stable UUID from sha1('prepared:<domain>').
 * Prepared leads are NEVER deleted by clearDemoActivity.
 */
export async function seedPreparedCompanies(db: SupabaseClient): Promise<number> {
  const rows = PREPARED_COMPANIES.map(c => ({
    id: stableId(`prepared:${c.domain}`),
    name: `Ansprechpartner offen (${c.name})`,
    role: null,
    company: c.name,
    company_domain: c.domain,
    company_size: null,
    region: c.city,
    email: null,
    phone: null,
    cached_brief: null,
    profile_url: c.sourceUrl,
    source: 'prepared',
    fit_score: 0,
    interest_score: 0,
    priority: 'review' as const,
    priority_reason: 'ICP-Check steht noch aus.',
    fit_status: 'unknown' as const,
    need_status: 'unknown' as const,
    willingness: 'unknown' as const,
    status: 'new' as const,
    owner: null,
    last_alert_at: null,
    origin: 'prepared' as const,
    origin_detail: null,
    is_test: false,
    company_key: companyKey(c.domain, c.name),
    sortout_status: null,
    sortout_synced_needle: false,
    sortout_until: null,
    phone_source: null,
    phone_dnc: false,
    call_card: null,
  }));

  await upsert(db, 'lead', rows);
  return rows.length;
}
