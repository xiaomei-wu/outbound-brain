import { describe, expect, it } from 'vitest';
import { currentJob, nextSearchState, parseHeadline, SEARCH_KEYWORDS } from './needle-search';

describe('parseHeadline', () => {
  it('splits role and company on common separators', () => {
    expect(parseHeadline('Leiter Projektentwicklung bei WEGENER Massivhaus GmbH')).toEqual({ role: 'Leiter Projektentwicklung', company: 'WEGENER Massivhaus GmbH' });
    expect(parseHeadline('Head of Acquisition at Instone Real Estate')).toEqual({ role: 'Head of Acquisition', company: 'Instone Real Estate' });
    expect(parseHeadline('Projektentwickler @ DEMOS Wohnbau | Ankauf')).toEqual({ role: 'Projektentwickler', company: 'DEMOS Wohnbau' });
  });

  it('keeps the whole headline as role when no company is named', () => {
    expect(parseHeadline('Projektentwicklung | Grundstücksakquise')).toEqual({ role: 'Projektentwicklung | Grundstücksakquise', company: null });
    expect(parseHeadline(null)).toEqual({ role: null, company: null });
  });
});

describe('currentJob', () => {
  it('takes the job without an end date', () => {
    expect(currentJob([
      { title: 'Projektleiter', companyName: 'Alt GmbH', endDate: '2022-01' },
      { title: 'Leitung Ankauf', companyName: 'Neu AG', endDate: null },
    ])).toEqual({ role: 'Leitung Ankauf', company: 'Neu AG' });
    expect(currentJob([])).toEqual({ role: null, company: null });
  });
});

describe('nextSearchState', () => {
  it('continues with the cursor, then moves to the next keyword, then wraps', () => {
    expect(nextSearchState({ keywordIndex: 0, cursor: null }, 'c1')).toEqual({ keywordIndex: 0, cursor: 'c1' });
    expect(nextSearchState({ keywordIndex: 0, cursor: 'c1' }, null)).toEqual({ keywordIndex: 1, cursor: null });
    expect(nextSearchState({ keywordIndex: SEARCH_KEYWORDS.length - 1, cursor: 'x' }, null)).toEqual({ keywordIndex: 0, cursor: null });
  });
});
