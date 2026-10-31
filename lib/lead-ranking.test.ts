import { describe, expect, it } from 'vitest';
import { compareLeads, countBySource, filterBySource, hasTouchpoint, sortLeadsBy } from './lead-ranking';
import type { Lead } from './types';

const lead = (id: string, over: Partial<Lead> = {}): Lead =>
  ({ id, priority: 'medium', engagementStage: null, phone: null, phoneDnc: false, willingness: 'open', fitScore: 50, ...over }) as Lead;

const order = (leads: Lead[]) => [...leads].sort(compareLeads).map((l) => l.id);

describe('lead ranking', () => {
  it('puts every real touchpoint above untouched leads, even above higher ICP priority', () => {
    expect(order([
      lead('high-untouched', { priority: 'high' }),
      lead('medium-invited', { priority: 'medium', engagementStage: 'invited' }),
    ])).toEqual(['medium-invited', 'high-untouched']);
  });

  it('orders touched leads by warmth first, then priority', () => {
    expect(order([
      lead('invited-high', { priority: 'high', engagementStage: 'invited' }),
      lead('replied-medium', { priority: 'medium', engagementStage: 'replied' }),
      lead('connected-high', { priority: 'high', engagementStage: 'connected' }),
    ])).toEqual(['replied-medium', 'connected-high', 'invited-high']);
  });

  it('does not lift negative replies (priority low) to the top', () => {
    expect(hasTouchpoint(lead('x', { priority: 'low', engagementStage: 'replied' }))).toBe(false);
    expect(order([
      lead('insolvent', { priority: 'low', engagementStage: 'replied' }),
      lead('high-untouched', { priority: 'high' }),
    ])).toEqual(['high-untouched', 'insolvent']);
  });

  it('keeps the previous order for untouched leads: priority, then callable first', () => {
    expect(order([
      lead('medium', { priority: 'medium' }),
      lead('high-no-phone', { priority: 'high' }),
      lead('high-phone', { priority: 'high', phone: '+4930' }),
    ])).toEqual(['high-phone', 'high-no-phone', 'medium']);
  });
});

describe('source filter and sort modes', () => {
  const a = lead('a', { origin: 'ai_ark', company: 'Zeta GmbH', createdAt: '2026-10-31T10:00:00Z' } as Partial<Lead>);
  const n = lead('n', { origin: 'needle_campaign', company: 'Alpha AG', createdAt: '2026-10-31T12:00:00Z', priority: 'high' } as Partial<Lead>);
  const p = lead('p', { origin: 'prepared', company: 'Mitte GmbH', createdAt: '2026-10-31T11:00:00Z' } as Partial<Lead>);
  const scores = new Map([['a', 'B'], ['n', 'A'], ['p', 'D']]);

  it('filters by source; "all" keeps everything', () => {
    expect(filterBySource([a, n, p], 'needle_campaign').map((l) => l.id)).toEqual(['n']);
    expect(filterBySource([a, n, p], 'all').map((l) => l.id)).toEqual(['a', 'n', 'p']);
  });

  it('counts leads per source', () => {
    expect(countBySource([a, n, p, a])).toEqual({ ai_ark: 2, needle_campaign: 1, prepared: 1 });
  });

  it('sorts by the chosen mode', () => {
    expect(sortLeadsBy([a, n, p], 'company', scores).map((l) => l.id)).toEqual(['n', 'p', 'a']);
    const none = lead('x', { origin: 'needle_campaign', company: null, createdAt: '2026-10-31T09:00:00Z' } as Partial<Lead>);
    expect(sortLeadsBy([none, a, n], 'company', scores).map((l) => l.id)).toEqual(['n', 'a', 'x']);
    expect(sortLeadsBy([a, n, p], 'newest', scores).map((l) => l.id)).toEqual(['n', 'p', 'a']);
    expect(sortLeadsBy([a, n, p], 'source', scores).map((l) => l.id)).toEqual(['n', 'a', 'p']);
    expect(sortLeadsBy([a, n, p], 'icp', scores).map((l) => l.id)).toEqual(['n', 'a', 'p']);
    expect(sortLeadsBy([a, n, p], 'recommended', scores)[0].id).toBe('n');
  });
});
