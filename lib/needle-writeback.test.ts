import { describe, expect, it } from 'vitest';
import { mergeProperties } from './needle';
import { icpNeedleProperties } from './needle-writeback';

const check = { score: 'A' as const, segments: ['Projektentwickler und Bauträger'], decision: 'Priorisiert bearbeiten', decisionReason: 'Ankaufsprofil belegt.' };
const now = new Date('2026-10-31T15:00:00Z');

describe('icpNeedleProperties', () => {
  it('routes A/B with a fitting contact into the call path', () => {
    expect(icpNeedleProperties(check, true, now)).toEqual({
      test_company_qualified: 'true',
      test_person_qualified: 'true',
      ob_icp_score: 'A',
      ob_icp_segment: 'Projektentwickler und Bauträger',
      ob_icp_decision: 'Priorisiert bearbeiten: Ankaufsprofil belegt.',
      ob_icp_checked_at: '2026-10-31',
      ob_icp_source: 'Outbound Brain',
    });
  });

  it('sends the wrong contact at a fitting company to review', () => {
    expect(icpNeedleProperties(check, false, now).test_person_qualified).toBe('false');
  });

  it('marks C, D and not assessable as not qualified', () => {
    for (const score of ['C', 'D', 'nicht_bewertbar'] as const) {
      const p = icpNeedleProperties({ ...check, score }, true, now);
      expect(p.test_company_qualified).toBe('false');
      expect(p.test_person_qualified).toBe('false');
    }
  });
});

describe('mergeProperties', () => {
  it('keeps the team’s existing properties and only overrides patched keys', () => {
    expect(mergeProperties({ test_call_opener: 'Herr X…', test_company_qualified: 'true' }, { test_company_qualified: 'false', ob_icp_score: 'D' }))
      .toEqual({ test_call_opener: 'Herr X…', test_company_qualified: 'false', ob_icp_score: 'D' });
  });
});
