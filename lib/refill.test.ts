import { describe, expect, it } from 'vitest';
import { campaignSends, openQueueCount, REFILL_THRESHOLD, selectRefillCandidates, splitName } from './refill';
import type { Lead } from './types';

const lead = (id: string, over: Partial<Lead> = {}): Lead =>
  ({
    id, isTest: false, sortoutStatus: null, status: 'new', priority: 'high', needleLeadId: null,
    profileUrl: `https://www.linkedin.com/in/${id}`, companyKey: `${id}.de`, engagementStage: null,
    phone: null, phoneDnc: false, willingness: 'open', fitScore: 50, ...over,
  }) as Lead;

describe('campaignSends', () => {
  it('is false for the current qualification-only campaign (conditions and ends)', () => {
    expect(campaignSends({ nodes: [{ kind: 'start' }, { kind: 'condition' }, { kind: 'end' }] })).toBe(false);
  });
  it('is true as soon as any step acts (invite, message, …) or the graph is unknown', () => {
    expect(campaignSends({ nodes: [{ kind: 'start' }, { kind: 'action' }, { kind: 'end' }] })).toBe(true);
    expect(campaignSends({ nodes: [{ kind: 'wait' }, { kind: 'message' }] })).toBe(true);
    expect(campaignSends(null)).toBe(true);
  });
});

describe('queue and candidates', () => {
  const scores = new Map([['a.de', 'A'], ['b.de', 'B'], ['c.de', 'C'], ['n.de', 'A'], ['x.de', 'A'], ['s.de', 'A'], ['l.de', 'A']]);

  it('counts only open A/B leads that are in Needle', () => {
    const inNeedle = { needleLeadId: 'n' } as Partial<Lead>;
    const leads = [
      lead('a', inNeedle), lead('b', inNeedle), lead('c', inNeedle),
      lead('n'), // A/B but from another source (not in Needle) → supply, not queue
      lead('x', { ...inNeedle, status: 'called' }),
      lead('s', { ...inNeedle, sortoutStatus: 'not_now' }),
      lead('l', { ...inNeedle, priority: 'low' }),
    ];
    expect(openQueueCount(leads, scores)).toBe(2);
  });

  it('picks A/B leads with a LinkedIn profile that are not in Needle yet', () => {
    const leads = [
      lead('a'), lead('b', { priority: 'medium' }), lead('c'),
      lead('n', { needleLeadId: 'already' }),
      lead('x', { profileUrl: null }),
    ];
    expect(selectRefillCandidates(leads, scores, 10)).toEqual(['a', 'b']);
    expect(selectRefillCandidates(leads, scores, 1)).toEqual(['a']);
  });

  it('uses a threshold of 5', () => {
    expect(REFILL_THRESHOLD).toBe(5);
  });
});

describe('splitName', () => {
  it('drops titles and splits first and last name', () => {
    expect(splitName('Dr. Andreas von Wieland')).toEqual({ firstName: 'Andreas', lastName: 'von Wieland' });
    expect(splitName('Erika')).toEqual({ firstName: 'Erika', lastName: '' });
  });
});
