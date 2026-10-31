/**
 * Unit tests for pure BlitzAPI mappers and error messages.
 * No real API calls are made — fixtures are inline.
 */

import { describe, expect, it } from 'vitest';
import { mapBlitzPerson, blitzErrorMessage } from './blitz';
import type { BlitzCompany, BlitzPerson } from './blitz';

const company: BlitzCompany = {
  name: 'Beispiel Projekt GmbH',
  domain: 'beispiel-projekt.de',
  linkedin_url: 'https://www.linkedin.com/company/x',
  hq: { city: 'Berlin', country_code: 'DE' },
  employees_on_linkedin: 40,
};

const person: BlitzPerson = {
  full_name: 'Erika Muster',
  linkedin_url: 'https://www.linkedin.com/in/erika',
  location: { city: 'Berlin', country_code: 'DE' },
  experiences: [
    { job_title: 'Leitung Ankauf', job_is_current: true, company_domain: 'beispiel-projekt.de' },
  ],
};

describe('mapBlitzPerson', () => {
  it('maps person + company to a new lead row', () => {
    const row = mapBlitzPerson(person, company);
    expect(row).toMatchObject({
      name: 'Erika Muster',
      role: 'Leitung Ankauf',
      company: 'Beispiel Projekt GmbH',
      company_domain: 'beispiel-projekt.de',
      company_key: 'beispiel-projekt.de',
      profile_url: 'https://www.linkedin.com/in/erika',
      region: 'Berlin',
      origin: 'blitz',
      source: 'blitz',
      is_test: false,
      company_size: 40,
    });
  });

  it('uses null role when no current experience', () => {
    const p: BlitzPerson = { ...person, experiences: [] };
    const row = mapBlitzPerson(p, company);
    expect(row.role).toBeNull();
  });

  it('uses null role when current experience has no job_title', () => {
    const p: BlitzPerson = {
      ...person,
      experiences: [{ job_title: '', job_is_current: true, company_domain: 'beispiel-projekt.de' }],
    };
    const row = mapBlitzPerson(p, company);
    expect(row.role).toBeNull();
  });
});

describe('blitzErrorMessage', () => {
  it('returns German message for 402', () => {
    expect(blitzErrorMessage(402)).toBe('BlitzAPI-Kontingent für diesen Monat aufgebraucht.');
  });

  it('returns German message for 401', () => {
    expect(blitzErrorMessage(401)).toBe(
      'BlitzAPI-Schlüssel ungültig — bitte auf der Integrations-Seite prüfen.'
    );
  });

  it('returns German message for 429', () => {
    expect(blitzErrorMessage(429)).toBe('BlitzAPI: zu viele Anfragen — bitte kurz warten.');
  });

  it('returns a fallback for unknown status codes', () => {
    const msg = blitzErrorMessage(500);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});
