import { expect, test } from 'vitest';
import { funnelCounts } from '@/components/funnel-line';
import type { Lead } from '@/lib/types';

type MinLead = Pick<Lead, 'isTest' | 'priority' | 'fitStatus' | 'phone' | 'status'>;

function lead(overrides: Partial<MinLead>): MinLead {
  return {
    isTest: false,
    priority: 'low',
    fitStatus: 'unknown',
    phone: null,
    status: 'new',
    ...overrides,
  };
}

test('funnelCounts: 1 test + 3 real (A phone called, B no phone, D) → found:3 ab:2 withPhone:1 called:1', () => {
  const leads: MinLead[] = [
    // Test lead — must be excluded from all counts
    lead({ isTest: true, priority: 'high', fitStatus: 'fits', phone: '+4930000', status: 'called' }),
    // Real A: high/fits, has phone, called
    lead({ isTest: false, priority: 'high', fitStatus: 'fits', phone: '+4930111', status: 'called' }),
    // Real B: medium/partial, no phone
    lead({ isTest: false, priority: 'medium', fitStatus: 'partial', phone: null, status: 'new' }),
    // Real D: low/outside, no phone
    lead({ isTest: false, priority: 'low', fitStatus: 'outside', phone: null, status: 'new' }),
  ];

  expect(funnelCounts(leads)).toEqual({ found: 3, ab: 2, withPhone: 1, called: 1 });
});
