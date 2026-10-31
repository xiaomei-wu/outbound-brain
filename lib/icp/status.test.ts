import { describe, expect, it } from 'vitest';
import { icpActivity } from './status';

const now = new Date('2026-10-31T16:00:00Z');
const at = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

describe('icpActivity', () => {
  it('counts queued and running checks as active', () => {
    expect(icpActivity([
      { icpStatus: 'queued', icpStatusAt: at(1) },
      { icpStatus: 'running', icpStatusAt: at(2) },
      { icpStatus: null, icpStatusAt: null },
    ], now)).toEqual({ active: 2, failed: 0 });
  });

  it('ignores stale entries (older than 15 minutes) so no spinner runs forever', () => {
    expect(icpActivity([{ icpStatus: 'running', icpStatusAt: at(16) }], now)).toEqual({ active: 0, failed: 0 });
  });

  it('counts failures separately', () => {
    expect(icpActivity([{ icpStatus: 'failed', icpStatusAt: at(1) }], now)).toEqual({ active: 0, failed: 1 });
  });
});
