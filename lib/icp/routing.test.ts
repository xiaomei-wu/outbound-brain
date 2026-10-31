import { describe, it, expect } from 'vitest';
import {
  normalizeIcpResult,
  routeForScore,
  roleMatches,
  selectCompaniesToCheck,
  sortoutExpiry,
  buildSuppression,
} from './routing';
import type { CompanyCheck } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeCheck(overrides: Partial<CompanyCheck> = {}): CompanyCheck {
  return {
    id: 'test-id',
    companyKey: 'example.de',
    companyName: 'Example GmbH',
    domain: 'example.de',
    segments: ['Projektentwickler und Bautraeger'],
    score: 'A',
    whatTheyDo: 'Develops residential projects in Berlin.',
    fitSignals: [{ text: 'Aktuelle Projekte', url: 'https://example.de/projekte' }],
    against: [],
    decision: 'Priorisiert bearbeiten',
    decisionReason: 'Mehrere belegte Fit-Kriterien.',
    painHypothesis: 'Ankaufspruefung manuell und zeitintensiv.',
    entryPoint: 'Neues Projekt in Berlin-Mitte gestartet.',
    openQuestion: 'Wie priorisieren Sie aktuell Ankaufsmoeglichkeiten?',
    checkedAt: '2026-10-31T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// routeForScore
// ---------------------------------------------------------------------------

describe('routeForScore', () => {
  it('A -> call / high / fits', () => {
    const r = routeForScore('A');
    expect(r).toEqual({
      route: 'call',
      priority: 'high',
      fitStatus: 'fits',
      suggested: [],
    });
  });

  it('B -> call / medium / partial', () => {
    const r = routeForScore('B');
    expect(r).toEqual({
      route: 'call',
      priority: 'medium',
      fitStatus: 'partial',
      suggested: [],
    });
  });

  it('C -> park / low / partial + not_now suggested', () => {
    const r = routeForScore('C');
    expect(r).toEqual({
      route: 'park',
      priority: 'low',
      fitStatus: 'partial',
      suggested: ['not_now'],
    });
  });

  it('D -> exclude / low / outside + not_a_fit suggested', () => {
    const r = routeForScore('D');
    expect(r).toEqual({
      route: 'exclude',
      priority: 'low',
      fitStatus: 'outside',
      suggested: ['not_a_fit'],
    });
  });

  it('nicht_bewertbar -> research / review / unknown', () => {
    const r = routeForScore('nicht_bewertbar');
    expect(r).toEqual({
      route: 'research',
      priority: 'review',
      fitStatus: 'unknown',
      suggested: [],
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeIcpResult
// ---------------------------------------------------------------------------

describe('normalizeIcpResult', () => {
  it('downgrades A with fitSignals that have no valid URL to nicht_bewertbar', () => {
    const check = makeCheck({
      score: 'A',
      fitSignals: [{ text: 'Signal ohne URL', url: '' }],
    });
    const result = normalizeIcpResult(check);
    expect(result.score).toBe('nicht_bewertbar');
    expect(result.decision).toBe('Recherche ergaenzen');
  });

  it('keeps A when fitSignals have an https URL', () => {
    const check = makeCheck({
      score: 'A',
      fitSignals: [{ text: 'Projekte', url: 'https://a.de/projekte' }],
    });
    const result = normalizeIcpResult(check);
    expect(result.score).toBe('A');
  });

  it('keeps B when fitSignals have an http URL', () => {
    const check = makeCheck({
      score: 'B',
      fitSignals: [{ text: 'Portfolio', url: 'http://b.de/portfolio' }],
    });
    const result = normalizeIcpResult(check);
    expect(result.score).toBe('B');
  });

  it('downgrades B with zero fitSignals to nicht_bewertbar', () => {
    const check = makeCheck({
      score: 'B',
      fitSignals: [],
    });
    const result = normalizeIcpResult(check);
    expect(result.score).toBe('nicht_bewertbar');
  });

  it('does not touch C or D scores', () => {
    const c = normalizeIcpResult(makeCheck({ score: 'C', fitSignals: [] }));
    expect(c.score).toBe('C');
    const d = normalizeIcpResult(makeCheck({ score: 'D', fitSignals: [] }));
    expect(d.score).toBe('D');
  });
});

// ---------------------------------------------------------------------------
// roleMatches (stem matching: first 8 chars per word)
// ---------------------------------------------------------------------------

describe('roleMatches', () => {
  it('Geschaeftsfuehrer matches Geschaeftsfuehrung via stem', () => {
    expect(roleMatches('Geschaeftsfuehrer', ['Geschaeftsfuehrung'])).toBe(true);
  });

  it('Werkstudent Marketing does not match Geschaeftsfuehrung or Leitung Ankauf', () => {
    expect(
      roleMatches('Werkstudent Marketing', ['Geschaeftsfuehrung', 'Leitung Ankauf']),
    ).toBe(false);
  });

  it('null role -> true (unknown is not a mismatch)', () => {
    expect(roleMatches(null, ['Geschaeftsfuehrung'])).toBe(true);
  });

  it('Leitung Ankauf matches Leitung Ankauf exactly', () => {
    expect(roleMatches('Leitung Ankauf', ['Leitung Ankauf'])).toBe(true);
  });

  it('handles unicode: Geschaeftsfuehrer matches Geschaeftsfuehrung', () => {
    // Also test with actual umlauts
    expect(roleMatches('Geschäftsführer', ['Geschäftsführung'])).toBe(true);
  });

  it('case insensitive matching', () => {
    expect(roleMatches('LEITUNG ANKAUF', ['leitung ankauf'])).toBe(true);
  });

  const ICP = ['Geschäftsführung', 'Leitung Ankauf', 'Leitung Projektentwicklung', 'Asset Management'];

  it('accepts the real contacts from the Needle campaign (regression 2026-10-31)', () => {
    expect(roleMatches('Leiter Projektentwicklung & Grundstücksakquise', ICP)).toBe(true);
    expect(roleMatches('Ansprechpartner Grundstücksankauf', ICP)).toBe(true);
    expect(roleMatches('Senior Projektleiter/ Expert Acquisition', ICP)).toBe(true);
    expect(roleMatches('Managing Director @ e+k Investment Management GmbH', ICP)).toBe(true);
    expect(roleMatches('Head of Fund and Asset Management', ICP)).toBe(true);
  });

  it('rejects clearly junior or unrelated roles', () => {
    expect(roleMatches('Werkstudent Projektentwicklung', ICP)).toBe(false);
    expect(roleMatches('Sachbearbeiterin Buchhaltung', ICP)).toBe(false);
    expect(roleMatches('Praktikant Marketing', ICP)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// selectCompaniesToCheck
// ---------------------------------------------------------------------------

describe('selectCompaniesToCheck', () => {
  it('deduplicates company keys and skips null keys', () => {
    const result = selectCompaniesToCheck(
      [
        { id: '1', companyKey: 'a.de' },
        { id: '2', companyKey: 'a.de' },
        { id: '3', companyKey: null },
        { id: '4', companyKey: 'b.de' },
      ],
      new Set(['b.de']),
      10,
    );
    expect(result).toEqual(['a.de']);
  });

  it('respects the cap', () => {
    const leads = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      companyKey: `company-${i}.de`,
    }));
    const result = selectCompaniesToCheck(leads, new Set(), 10);
    expect(result).toHaveLength(10);
  });

  it('preserves input order', () => {
    const leads = [
      { id: '1', companyKey: 'z.de' },
      { id: '2', companyKey: 'a.de' },
      { id: '3', companyKey: 'm.de' },
    ];
    const result = selectCompaniesToCheck(leads, new Set(), 10);
    expect(result).toEqual(['z.de', 'a.de', 'm.de']);
  });
});

// ---------------------------------------------------------------------------
// sortoutExpiry
// ---------------------------------------------------------------------------

describe('sortoutExpiry', () => {
  const now = new Date('2026-10-31T12:00:00Z');

  it('not_a_fit -> +12 months', () => {
    const expiry = sortoutExpiry('not_a_fit', now);
    expect(expiry?.toISOString()).toBe('2027-10-31T12:00:00.000Z');
  });

  it('not_now -> +90 days', () => {
    const expiry = sortoutExpiry('not_now', now);
    expect(expiry?.toISOString()).toBe('2027-01-29T12:00:00.000Z');
  });

  it('wrong_contact -> null (permanent)', () => {
    expect(sortoutExpiry('wrong_contact', now)).toBeNull();
  });

  it('opt_out -> null (permanent)', () => {
    expect(sortoutExpiry('opt_out', now)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSuppression
// ---------------------------------------------------------------------------

describe('buildSuppression', () => {
  const now = new Date('2026-10-31T12:00:00Z');

  it('not_a_fit with no domain -> null', () => {
    const result = buildSuppression(
      'not_a_fit',
      { needleLeadId: 'l1', companyDomain: null },
      'ICP D',
      now,
    );
    expect(result).toBeNull();
  });

  it('not_a_fit with domain -> company suppression', () => {
    const result = buildSuppression(
      'not_a_fit',
      { needleLeadId: 'l1', companyDomain: 'a.de' },
      'ICP D',
      now,
    );
    expect(result).toEqual({
      scope: 'company',
      companyDomain: 'a.de',
      reason: 'manual',
      note: 'ICP D',
      expiresAt: '2027-10-31T12:00:00.000Z',
    });
  });

  it('opt_out -> lead suppression with reason not_interested', () => {
    const result = buildSuppression(
      'opt_out',
      { needleLeadId: 'l1', companyDomain: 'a.de' },
      'Opt-out im Gespraech',
      now,
    );
    expect(result).toEqual({
      scope: 'lead',
      leadId: 'l1',
      reason: 'not_interested',
      note: 'Opt-out im Gespraech',
      expiresAt: null,
    });
  });

  it('wrong_contact without needle id -> null', () => {
    const result = buildSuppression(
      'wrong_contact',
      { needleLeadId: null, companyDomain: 'a.de' },
      'Falsche Person',
      now,
    );
    expect(result).toBeNull();
  });

  it('not_now -> lead suppression with manual reason and expiry', () => {
    const result = buildSuppression(
      'not_now',
      { needleLeadId: 'l2', companyDomain: 'b.de' },
      'Kein aktueller Bedarf',
      now,
    );
    expect(result).toEqual({
      scope: 'lead',
      leadId: 'l2',
      reason: 'manual',
      note: 'Kein aktueller Bedarf',
      expiresAt: '2027-01-29T12:00:00.000Z',
    });
  });
});
