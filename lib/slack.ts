/**
 * Pure Block Kit builder — no I/O except postSlackBriefing().
 * Verified working payload shape: header, context, sections with mrkdwn,
 * fields, actions with url buttons, context with TEST marker when isTest.
 */

import type { CallBriefing, Lead } from '@/lib/types';
import { env } from '@/lib/env';

export interface SlackPayload {
  blocks: object[];
  text: string;
}

/**
 * Builds a Slack Block Kit payload for a call briefing.
 * @param brief   The generated CallBriefing
 * @param lead    Lead identity fields
 * @param appUrl  Base URL for deep links (NEXT_PUBLIC_APP_URL)
 * @param isTest  If true, prepends a visible TEST marker block
 */
export function buildSlackBlocks(
  brief: CallBriefing,
  lead: Pick<Lead, 'id' | 'name' | 'company'>,
  appUrl: string,
  isTest = false
): SlackPayload {
  const blocks: object[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `Briefing: ${lead.name}${lead.company ? ` · ${lead.company}` : ''}`,
      emoji: true,
    },
  });

  // TEST marker — always visible so teammates never confuse live vs. simulated
  if (isTest) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: ':test_tube: *TEST* — dieses Briefing wurde simuliert. Kein echter Lead.',
        },
      ],
    });
  }

  // Why now + evidence
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Warum jetzt?*\n${brief.whyNow}`,
    },
    ...(brief.evidenceUrl
      ? {
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'Quelle öffnen', emoji: true },
            url: brief.evidenceUrl,
          },
        }
      : {}),
  });

  // Hook
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Einstieg:*\n${brief.hook}`,
    },
  });

  // Talking points (three fields in one section)
  blocks.push({
    type: 'section',
    fields: brief.talkingPoints.map((pt, i) => ({
      type: 'mrkdwn',
      text: `*${i + 1}.* ${pt}`,
    })),
  });

  // Consent line — highlighted
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `:scales: *Einwilligungszeile:*\n_${brief.consentLine}_`,
    },
  });

  // Meeting slots + phone
  const slotFields: object[] = brief.meetingSlots.map((slot) => ({
    type: 'mrkdwn',
    text: `:calendar: ${slot}`,
  }));
  if (brief.phone) {
    slotFields.push({ type: 'mrkdwn', text: `:phone: ${brief.phone}` });
  }
  blocks.push({ type: 'section', fields: slotFields });

  // Divider
  blocks.push({ type: 'divider' });

  // Action buttons
  const actionElements: object[] = [
    {
      type: 'button',
      text: { type: 'plain_text', text: 'Briefing öffnen', emoji: true },
      url: `${appUrl}/leads/${lead.id}`,
      style: 'primary',
    },
  ];
  if (brief.phone) {
    actionElements.push({
      type: 'button',
      text: { type: 'plain_text', text: `Anrufen ${brief.phone}`, emoji: true },
      url: `tel:${brief.phone.replace(/\s/g, '')}`,
    });
  }
  blocks.push({ type: 'actions', elements: actionElements });

  // Footer context
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Outbound Brain · ${brief.contact}${isTest ? ' · *TEST*' : ''}`,
      },
    ],
  });

  const fallbackText = `Briefing für ${lead.name}${lead.company ? ` (${lead.company})` : ''}: ${brief.whyNow}`;

  return { blocks, text: fallbackText };
}

/**
 * POSTs a Slack Block Kit payload to the configured webhook.
 * Returns { ok: true } on 200, { ok: false } on any failure.
 */
export async function postSlackBriefing(payload: SlackPayload): Promise<{ ok: boolean }> {
  try {
    const webhookUrl = env.SLACK_WEBHOOK_URL();
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[slack] webhook returned', res.status, await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('[slack] postSlackBriefing failed:', err);
    return { ok: false };
  }
}
