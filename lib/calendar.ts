import { env } from '@/lib/env';

/**
 * Returns two meeting slot labels.
 * Reads FIXED_MEETING_SLOTS (comma-separated, e.g. "Thu 14:00,Fri 10:00").
 * Falls back to the next two working days at 14:00 in German format.
 */
export function getMeetingSlots(): [string, string] {
  const raw = env.FIXED_MEETING_SLOTS();
  const slots = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (slots.length >= 2) {
    return [slots[0], slots[1]];
  }

  // Fallback: next two working weekdays at 14:00
  const workingDays: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (workingDays.length < 2) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      workingDays.push(
        d.toLocaleDateString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
        }) + ' 14:00'
      );
    }
    d.setDate(d.getDate() + 1);
  }
  return [workingDays[0], workingDays[1]];
}
