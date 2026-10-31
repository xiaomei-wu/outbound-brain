import { describe, expect, it } from 'vitest';
import { isUsRegion, phoneSourceOrder } from './phone-chain';

describe('phoneSourceOrder', () => {
  it('tries AI Ark first; Lusha is never part of the automatic chain', () => {
    expect(phoneSourceOrder({ hasAiArk: true, hasBlitz: true, isUs: false })).toEqual(['ai_ark']);
  });

  it('adds BlitzAPI only for US contacts', () => {
    expect(phoneSourceOrder({ hasAiArk: true, hasBlitz: true, isUs: true })).toEqual(['ai_ark', 'blitz']);
    expect(phoneSourceOrder({ hasAiArk: false, hasBlitz: true, isUs: false })).toEqual([]);
  });

  it('is empty when no cheaper source is connected', () => {
    expect(phoneSourceOrder({ hasAiArk: false, hasBlitz: false, isUs: true })).toEqual([]);
  });
});

describe('isUsRegion', () => {
  it('recognizes US regions without matching German words', () => {
    expect(isUsRegion('United States')).toBe(true);
    expect(isUsRegion('New York, US')).toBe(true);
    expect(isUsRegion('Berlin')).toBe(false);
    expect(isUsRegion('Augsburg')).toBe(false);
    expect(isUsRegion(null)).toBe(false);
  });
});
