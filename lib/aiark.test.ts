import { describe, expect, it } from 'vitest';
import { pickAiArkPhone } from './aiark';

describe('pickAiArkPhone', () => {
  it('prefers a German number', () => {
    expect(pickAiArkPhone([['+13152468945'], ['+491701234567']])).toBe('+491701234567');
  });

  it('falls back to the first number', () => {
    expect(pickAiArkPhone([['+13152468945', '+447700900123']])).toBe('+13152468945');
  });

  it('returns null for empty or malformed data', () => {
    expect(pickAiArkPhone([])).toBeNull();
    expect(pickAiArkPhone([[''], []])).toBeNull();
    expect(pickAiArkPhone(undefined)).toBeNull();
  });
});
