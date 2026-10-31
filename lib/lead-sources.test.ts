import { describe, expect, it } from 'vitest';
import { buildCampaignFilters } from './lead-sources';

describe('buildCampaignFilters (AI Ark)', () => {
  const filters = buildCampaignFilters({
    icp_roles: ['Geschäftsführung', 'Leitung Ankauf'],
    icp_company_size_min: null,
    icp_company_size_max: null,
  });

  it('targets German real-estate developers', () => {
    expect(filters.account).toMatchObject({
      location: { any: { include: ['Germany'] } },
      industries: { any: { include: { mode: 'WORD', content: ['real estate', 'construction'] } } },
    });
  });

  it('uses only valid seniority enum values and matches roles as titles', () => {
    const seniority = (filters.contact?.seniority as { any: { include: string[] } }).any.include;
    expect(seniority).not.toContain('Geschäftsführung');
    expect(seniority).toContain('c_suite');
    expect(filters.contact?.experience).toEqual({
      current: { title: { any: { include: { mode: 'SMART', content: ['Geschäftsführung', 'Leitung Ankauf'] } } } },
    });
  });

  it('sends employee size as a RANGE', () => {
    const f = buildCampaignFilters({ icp_roles: [], icp_company_size_min: 10, icp_company_size_max: null });
    expect(f.account?.employeeSize).toEqual({ type: 'RANGE', range: [{ start: 10, end: 1_000_000 }] });
    expect(f.contact?.experience).toBeUndefined();
  });
});

describe('staffCount (AI Ark)', () => {
  it('reads both number and { total, range } shapes', async () => {
    const { staffCount } = await import('./aiark');
    expect(staffCount({ company: { summary: { staff: 40 } } } as never)).toBe(40);
    expect(staffCount({ company: { summary: { staff: { total: 80, range: { start: 51, end: 200 } } } } } as never)).toBe(80);
    expect(staffCount({} as never)).toBeNull();
  });
});
