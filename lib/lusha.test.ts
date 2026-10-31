import { describe, expect, it } from 'vitest';
import { lushaContactInput, phoneRevealCost, pickPhone, lushaErrorMessage } from './lusha';

describe('pickPhone', () => {
  it('prefers direct over mobile', () => {
    expect(
      pickPhone([
        { number: '+4930111', type: 'mobile', doNotCall: false },
        { number: '+4930222', type: 'direct', doNotCall: false },
      ]),
    ).toEqual({ number: '+4930222', type: 'direct' });
  });

  it('skips DNC and picks next preferred', () => {
    expect(
      pickPhone([
        { number: '+4930222', type: 'direct', doNotCall: true },
        { number: '+4930111', type: 'mobile', doNotCall: false },
      ]),
    ).toEqual({ number: '+4930111', type: 'mobile' });
  });

  it('returns allDnc when every number is DNC', () => {
    expect(
      pickPhone([{ number: '+4930222', type: 'direct', doNotCall: true }]),
    ).toEqual({ allDnc: true });
  });

  it('returns null for empty list', () => {
    expect(pickPhone([])).toBeNull();
  });

  it('prefers mobile over work', () => {
    expect(
      pickPhone([
        { number: '+4930333', type: 'work', doNotCall: false },
        { number: '+4930111', type: 'mobile', doNotCall: false },
      ]),
    ).toEqual({ number: '+4930111', type: 'mobile' });
  });

  it('falls back to any type when no preferred type available', () => {
    const result = pickPhone([
      { number: '+4930444', type: 'other', doNotCall: false },
    ]);
    expect(result).toEqual({ number: '+4930444', type: 'other' });
  });
});

describe('lushaErrorMessage', () => {
  it('maps 402 to no credits message', () => {
    expect(lushaErrorMessage(402)).toBe('Lusha: keine Credits mehr.');
  });

  it('maps 403 to V3 access not unlocked', () => {
    expect(lushaErrorMessage(403)).toBe(
      'Lusha: API-Zugang (V3) nicht freigeschaltet.',
    );
  });

  it('maps 429 to rate limit message', () => {
    expect(lushaErrorMessage(429)).toBe(
      'Lusha: zu viele Anfragen — bitte kurz warten.',
    );
  });

  it('returns generic message for unknown status', () => {
    const msg = lushaErrorMessage(500);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe('lushaContactInput', () => {
  const base = { profileUrl: null, companyDomain: 'beispiel-bau.de', company: 'Beispiel Bau GmbH' };

  it('prefers the LinkedIn URL', () => {
    expect(lushaContactInput({ ...base, name: 'Erika Muster', profileUrl: 'https://www.linkedin.com/in/erika' }))
      .toEqual({ linkedinUrl: 'https://www.linkedin.com/in/erika' });
  });

  it('splits the name, drops titles and adds the company domain', () => {
    expect(lushaContactInput({ ...base, name: 'Dr. Andreas von Wieland' }))
      .toEqual({ firstName: 'Andreas', lastName: 'von Wieland', companyDomain: 'beispiel-bau.de' });
  });

  it('falls back to the company name without a domain', () => {
    expect(lushaContactInput({ ...base, companyDomain: null, name: 'Erika Muster' }))
      .toEqual({ firstName: 'Erika', lastName: 'Muster', companyName: 'Beispiel Bau GmbH' });
  });

  it('returns null without a usable person', () => {
    expect(lushaContactInput({ ...base, name: 'Ansprechpartner offen (Beispiel Bau GmbH)' })).toBeNull();
    expect(lushaContactInput({ ...base, name: 'Erika' })).toBeNull();
    expect(lushaContactInput({ name: 'Erika Muster', profileUrl: null, companyDomain: null, company: null })).toBeNull();
  });
});

describe('phoneRevealCost', () => {
  it('returns the phone credits when phones are available (real response shape)', () => {
    expect(phoneRevealCost([
      { field: 'emails', credits: 1, availability: 'available' },
      { field: 'phones', credits: 5, availability: 'available' },
    ])).toBe(5);
  });

  it('returns null when Lusha only knows emails', () => {
    expect(phoneRevealCost([{ field: 'emails', credits: 1, availability: 'available' }])).toBeNull();
  });

  it('returns null when phones are listed as unavailable or nothing is revealable', () => {
    expect(phoneRevealCost([{ field: 'phones', credits: 5, availability: 'unavailable' }])).toBeNull();
    expect(phoneRevealCost(undefined)).toBeNull();
    expect(phoneRevealCost([])).toBeNull();
  });
});
