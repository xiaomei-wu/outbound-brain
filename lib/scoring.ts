/**
 * Pure scoring logic — no I/O.
 * Computes the next interest score and action after an event.
 *
 * v2 changes:
 * - Opt-out still stops immediately and cannot be overridden by high scores.
 * - Alert thresholds are kept but fitScore is now secondary to priority.
 * - No automatic upgrade for two triggers (that logic lives in computePriority).
 * - Unknown dimensions never lower scores (unknown is not No).
 */

import type { Lead, LeadEvent, ScoreResult, EventType, NextAction } from '@/lib/types';

// Interest score delta per event type
const INTEREST_DELTA: Record<EventType, number> = {
  meeting_request: 40,
  positive_reply:  30,
  not_now:        -15,
  opt_out:        -50,
  new_trigger:     15,
  open:             3,
  click:            5,
};

export const WEAK_SIGNAL_CAP = 10;       // max total contribution from open+click
export const ALERT_FIT_MIN = 60;         // minimum fitScore to trigger an alert
export const ALERT_INTEREST_MIN = 50;    // minimum interestScore to trigger an alert
export const ALERT_COOLDOWN_HOURS = 24;  // hours between alerts for the same lead

/**
 * Applies an event to a lead and returns the updated score + next action.
 *
 * @param lead            Lead's current fit/interest scores and last alert timestamp
 * @param event           The event that occurred
 * @param weakSignalTotal Accumulated interest from open+click events so far (for cap)
 * @param now             Current timestamp (injectable for testability)
 */
export function applyEvent(
  lead: Pick<Lead, 'fitScore' | 'interestScore' | 'lastAlertAt'>,
  event: Pick<LeadEvent, 'type'>,
  weakSignalTotal: number,
  now: Date
): ScoreResult {
  const type = event.type;

  // --- Opt-out: stop immediately, no alert — high scores cannot override ---
  if (type === 'opt_out') {
    return {
      interestScore: lead.interestScore,
      action: 'stop',
      reason: 'Der Lead hat sich abgemeldet und darf nicht mehr kontaktiert werden.',
      sendAlert: false,
    };
  }

  // --- Determine action + reason ---
  let action: NextAction;
  let reason: string;

  switch (type) {
    case 'not_now':
      action = 'follow_up';
      reason = 'Der Lead möchte zu einem späteren Zeitpunkt kontaktiert werden.';
      break;
    case 'meeting_request':
      action = 'call_now';
      reason = 'Der Lead hat aktiv einen Termin angefragt — jetzt anrufen.';
      break;
    case 'positive_reply':
      action = 'call_now';
      reason = 'Der Lead hat positiv reagiert — Momentum nutzen und anrufen.';
      break;
    case 'new_trigger':
      action = 'research';
      reason = 'Ein neues Kaufsignal wurde erkannt — Briefing aktualisieren.';
      break;
    case 'open':
      action = 'wait';
      reason = 'Der Lead hat eine E-Mail geöffnet — schwaches Signal, beobachten.';
      break;
    case 'click':
      action = 'wait';
      reason = 'Der Lead hat auf einen Link geklickt — leichtes Interesse erkennbar.';
      break;
    default:
      action = 'wait';
      reason = 'Ereignis protokolliert.';
  }

  // --- Compute effective interest delta ---
  let effectiveDelta = INTEREST_DELTA[type];

  // Weak signals (open/click) are capped at WEAK_SIGNAL_CAP total
  if (type === 'open' || type === 'click') {
    const remaining = Math.max(0, WEAK_SIGNAL_CAP - weakSignalTotal);
    effectiveDelta = Math.min(effectiveDelta, remaining);
  }

  const newInterestScore = Math.max(0, Math.min(100, lead.interestScore + effectiveDelta));

  // --- Alert logic ---
  const inCooldown =
    lead.lastAlertAt !== null &&
    now.getTime() - new Date(lead.lastAlertAt).getTime() < ALERT_COOLDOWN_HOURS * 3_600_000;

  let sendAlert = false;
  if (!inCooldown) {
    if (type === 'meeting_request' || type === 'positive_reply') {
      // Always alert on strong engagement signals
      sendAlert = true;
    } else if (lead.fitScore >= ALERT_FIT_MIN && newInterestScore >= ALERT_INTEREST_MIN) {
      // Alert if both scores cross the threshold
      sendAlert = true;
    }
  }

  return {
    interestScore: newInterestScore,
    action,
    reason,
    sendAlert,
  };
}
