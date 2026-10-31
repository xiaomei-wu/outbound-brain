import { describe, expect, it } from 'vitest';
import { compareLeads, hasTouchpoint } from './lead-ranking';
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
