import { describe, expect, it } from 'vitest';
import { eventToContextRow, matchEventToLead, normalizeLinkedinUrl, replyEffect } from './reply-routing';

describe('normalizeLinkedinUrl', () => {
  it('reduces profile URLs to the public identifier', () => {
    expect(normalizeLinkedinUrl('https://www.linkedin.com/in/Erika-Muster-123/')).toBe('erika-muster-123');
    expect(normalizeLinkedinUrl('http://de.linkedin.com/in/erika-muster-123?trk=x')).toBe('erika-muster-123');
    expect(normalizeLinkedinUrl('https://example.com/erika')).toBeNull();
    expect(normalizeLinkedinUrl(null)).toBeNull();
  });
});

describe('matchEventToLead', () => {
  const leads = [
    { id: 'L1', needleLeadId: 'n-1', profileUrl: null },
    { id: 'L2', needleLeadId: null, profileUrl: 'https://www.linkedin.com/in/erika-muster-123' },
  ];

  it('matches campaign events by Needle lead id', () => {
    expect(matchEventToLead({ leadId: 'n-1', data: {} }, leads)).toBe('L1');
  });

  it('matches inbox events by LinkedIn profile URL or identity', () => {
    expect(matchEventToLead({ leadId: null, data: { profile: { url: 'https://linkedin.com/in/Erika-Muster-123/' } } }, leads)).toBe('L2');
    expect(matchEventToLead({ leadId: null, data: { profile: { identity: 'erika-muster-123' } } }, leads)).toBe('L2');
  });

  it('returns null for unknown people', () => {
    expect(matchEventToLead({ leadId: 'n-9', data: { profile: { url: 'https://linkedin.com/in/someone' } } }, leads)).toBeNull();
  });
});

describe('eventToContextRow', () => {
  it('maps received and sent messages; ignores events without text', () => {
    expect(eventToContextRow({ id: 'e1', type: 'linkedin_message_received', occurredAt: '2026-10-31T10:00:00Z', data: { text: ' Gern, rufen Sie an ' } }, 'L1'))
      .toEqual({ lead_id: 'L1', kind: 'linkedin', author: 'contact', content: 'Gern, rufen Sie an', occurred_at: '2026-10-31T10:00:00Z', source_url: null, external_id: 'needle:e1' });
    expect(eventToContextRow({ id: 'e2', type: 'linkedin_message_sent', occurredAt: '2026-10-31T09:00:00Z', data: { text: 'Hallo' } }, 'L1')?.author).toBe('seller');
    expect(eventToContextRow({ id: 'e3', type: 'linkedin_invite_accepted', data: {} }, 'L1')).toBeNull();
  });
});

describe('replyEffect', () => {
  it('ranks a call request at the top', () => {
    expect(replyEffect('call_request')).toEqual({ priority: 'high', willingness: 'requested', suggested: null });
  });

  it('moves negative replies down and suggests a sort-out, applied only on click', () => {
    expect(replyEffect('disqualifier')).toEqual({ priority: 'low', willingness: null, suggested: 'not_a_fit' });
    expect(replyEffect('later')).toEqual({ priority: 'low', willingness: null, suggested: 'not_now' });
    expect(replyEffect('not_interested').suggested).toBe('not_now');
    expect(replyEffect('opt_out')).toEqual({ priority: 'low', willingness: 'declined', suggested: 'opt_out' });
  });

  it('keeps the ranking for a wrong contact (the company may still fit)', () => {
    expect(replyEffect('wrong_contact')).toEqual({ priority: null, willingness: null, suggested: 'wrong_contact' });
  });

  it('leaves ranking unchanged for neutral replies', () => {
    expect(replyEffect('neutral')).toEqual({ priority: null, willingness: null, suggested: null });
    expect(replyEffect('interested')).toEqual({ priority: null, willingness: 'open', suggested: null });
  });
});
