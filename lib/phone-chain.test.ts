import { describe, expect, it } from 'vitest';
import { isUsRegion, phoneSourceOrder, selectLeadsForPhoneSearch } from './phone-chain';

describe('phoneSourceOrder', () => {
  it('tries AI Ark first; Lusha is never part of the automatic chain', () => {
    expect(phoneSourceOrder({ hasAiArk: true, hasBlitz: true, isUs: false })).toEqual(['ai_ark']);
  });

  it('adds BlitzAPI only for US contacts', () => {
    expect(phoneSourceOrder({ hasAiArk: true, hasBlitz: true, isUs: true })).toEqual(['ai_ark', 'blitz']);
    expect(phoneSourceOrder({ hasAiArk: false, hasBlitz: true, isUs: false })).toEqual([]);
  });

  it('is empty when no cheaper source is connected', () => {
    expect(phoneSourceOrder({ hasAiArk: false, hasBlitz: false, isUs: true })).toEqual([]);
  });
});

describe('isUsRegion', () => {
  it('recognizes US regions without matching German words', () => {
    expect(isUsRegion('United States')).toBe(true);
    expect(isUsRegion('New York, US')).toBe(true);
    expect(isUsRegion('Berlin')).toBe(false);
    expect(isUsRegion('Augsburg')).toBe(false);
    expect(isUsRegion(null)).toBe(false);
  });
});

describe('selectLeadsForPhoneSearch', () => {
  const base = { isTest: false, phone: null, sortoutStatus: null, phoneLookupAt: null };
  const scores = new Map([['a.de', 'A'], ['b.de', 'B'], ['c.de', 'C'], ['d.de', 'D']]);

  it('takes only A/B leads without a number that were not searched yet', () => {
    const leads = [
      { ...base, id: '1', companyKey: 'a.de' },
      { ...base, id: '2', companyKey: 'b.de' },
      { ...base, id: '3', companyKey: 'c.de' },
      { ...base, id: '4', companyKey: 'd.de' },
      { ...base, id: '5', companyKey: 'x.de' },
      { ...base, id: '6', companyKey: null },
      { ...base, id: '7', companyKey: 'a.de', phone: '+4930' },
      { ...base, id: '8', companyKey: 'a.de', sortoutStatus: 'not_now' },
      { ...base, id: '9', companyKey: 'a.de', phoneLookupAt: '2026-10-31T15:00:00Z' },
      { ...base, id: '10', companyKey: 'a.de', isTest: true },
    ];
    expect(selectLeadsForPhoneSearch(leads, scores)).toEqual(['1', '2']);
  });
});
