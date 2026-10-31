import { describe, expect, it } from 'vitest';
import { companyKey, originLabel } from './origin';

describe('originLabel', () => {
  it('labels every origin in German', () => {
    expect(originLabel('needle_campaign', 'Projektentwickler Berlin')).toBe(
      'Needle · Kampagne „Projektentwickler Berlin"',
    );
    expect(originLabel('needle_search', null)).toBe('Needle · LinkedIn-Suche');
    expect(originLabel('blitz', null)).toBe('BlitzAPI');
    expect(originLabel('ai_ark', null)).toBe('AI Ark');
    expect(originLabel('csv', null)).toBe('CSV');
    expect(originLabel('manual', null)).toBe('Manuell');
    expect(originLabel('prepared', null)).toBe('Vorbereitet');
    expect(originLabel('test', null)).toBe('Demo (TEST)');
  });

  it('falls back to a plain campaign label without a name', () => {
    expect(originLabel('needle_campaign', null)).toBe('Needle · Kampagne');
  });
});

describe('companyKey', () => {
  it('normalizes domains and URLs', () => {
    expect(companyKey('https://www.Instone.de/kontakt', 'x')).toBe('instone.de');
    expect(companyKey('instone.de', null)).toBe('instone.de');
  });

  it('falls back to a normalized company name', () => {
    expect(companyKey(null, 'Instone Real Estate Group SE')).toBe('name:instone real estate group');
    expect(companyKey(null, 'Beispiel Bau GmbH & Co. KG')).toBe('name:beispiel bau');
  });

  it('returns null without usable input', () => {
    expect(companyKey(null, '  ')).toBeNull();
    expect(companyKey('', null)).toBeNull();
  });
});
