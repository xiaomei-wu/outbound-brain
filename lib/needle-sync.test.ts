import { describe, expect, it } from 'vitest';
import { mapCampaignLead } from '@/lib/needle-sync';

describe('mapCampaignLead', () => {
  const l = {
    leadId: '01a1-x',
    firstName: 'Erika',
    lastName: 'Muster',
    companyName: 'Beispiel Bau GmbH',
    companyDomain: 'beispiel-bau.de',
    jobTitle: 'Geschäftsführerin',
    email: null,
    status: 'active',
  };

  it('maps a full lead correctly', () => {
    expect(mapCampaignLead(l, 'Projektentwickler Berlin')).toMatchObject({
      name: 'Erika Muster',
      role: 'Geschäftsführerin',
      company: 'Beispiel Bau GmbH',
      company_domain: 'beispiel-bau.de',
      company_key: 'beispiel-bau.de',
      needle_lead_id: '01a1-x',
      origin: 'needle_campaign',
      origin_detail: 'Projektentwickler Berlin',
      is_test: false,
    });
  });

  it('falls back to name-based company_key when domain is null', () => {
    expect(mapCampaignLead({ ...l, companyDomain: null }, 'X').company_key).toBe('name:beispiel bau');
  });

  it('uses fallback name when firstName and lastName are null', () => {
    expect(mapCampaignLead({ ...l, firstName: null, lastName: null }, 'X').name).toBe(
      'Unbekannt (Beispiel Bau GmbH)'
    );
  });
});
