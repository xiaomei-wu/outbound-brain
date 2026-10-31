import { expect, test } from 'vitest';
import { summarizeFind, type FindResult } from '@/lib/lead-find';

test('(a) Needle ok + AI Ark not connected → ok, message contains "Needle: 12 neu"', () => {
  const results: FindResult[] = [
    { source: 'needle_campaign', ok: true, created: 12, message: 'Needle: 12 neu' },
    { source: 'blitz', ok: false, created: 0, message: 'BlitzAPI: nicht verbunden' },
  ];
  const { ok, message } = summarizeFind(results);
  expect(ok).toBe(true);
  expect(message).toContain('Needle: 12 neu');
});

test('(b) all not connected → not ok', () => {
  const results: FindResult[] = [
    { source: 'needle_campaign', ok: false, created: 0, message: 'Needle: nicht verbunden' },
    { source: 'ai_ark', ok: false, created: 0, message: 'AI Ark: nicht verbunden' },
    { source: 'ai_ark', ok: false, created: 0, message: 'AI Ark: nicht verbunden' },
  ];
  const { ok } = summarizeFind(results);
  expect(ok).toBe(false);
});

test('(c) Needle throws, BlitzAPI ok → ok, message contains "Needle: Fehler"', () => {
  const results: FindResult[] = [
    { source: 'needle_campaign', ok: false, created: 0, message: 'Needle: Fehler' },
    { source: 'blitz', ok: true, created: 3, message: 'BlitzAPI: 3 neu' },
  ];
  const { ok, message } = summarizeFind(results);
  expect(ok).toBe(true);
  expect(message).toContain('Needle: Fehler');
});
