// ============================================================
// Brief (v2): generate a CallBriefing from triggers, chat context and BANT.
// Uses structured output (zodOutputFormat) with effort low for speed.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '@/lib/env';
import type {
  BantClaim,
  CallBriefing,
  Campaign,
  Lead,
  LeadContext,
  LeadTrigger,
} from '@/lib/types';
import { buildBriefSystemPrompt } from './prompts';

// ---------------------------------------------------------------------------
// Zod schema matching v2 CallBriefing
// ---------------------------------------------------------------------------

const BriefBantItemSchema = z.object({
  dimension: z.enum(['budget', 'authority', 'need', 'timeline']),
  status: z.enum(['confirmed', 'assumed', 'open']),
  value: z.nullable(z.string()),
  evidence: z.nullable(z.string()),
});

const ObjectionSchema = z.object({
  objection: z.string(),
  answer: z.string(),
});

const CallBriefingSchema = z.object({
  headline: z.string(),
  context: z.string(),
  whyNow: z.string(),
  evidenceUrl: z.nullable(z.string()),
  evidenceNote: z.string(),
  hook: z.string(),
  facts: z.array(z.string()),
  hypotheses: z.array(z.string()),
  openQuestions: z.array(z.string()).max(3),
  bant: z.array(BriefBantItemSchema).max(4),
  talkingPoints: z.array(z.string()).max(3),
  objections: z.array(ObjectionSchema).max(2),
  phone: z.nullable(z.string()),
  consentLine: z.string(),
  meetingSlots: z.array(z.string()),
  contact: z.string(),
  goal: z.string(),
  assumptions: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const MAX_OPEN_QUESTIONS = 3;
const MAX_TALKING_POINTS = 3;
const MAX_OBJECTIONS = 2;

// ---------------------------------------------------------------------------
// Main: generateBrief (v2)
// ---------------------------------------------------------------------------

export interface BriefResult {
  briefing: CallBriefing;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function generateBrief(
  lead: Pick<
    Lead,
    'name' | 'role' | 'company' | 'phone' | 'email' | 'profileUrl'
  >,
  factTriggers: LeadTrigger[],
  campaign: Campaign,
  chatContext: LeadContext[],
  bantClaims: BantClaim[],
  meetingSlots: string[],
): Promise<BriefResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() });

  // Build trigger descriptions
  const triggerDescriptions = factTriggers
    .map(
      (t, i) =>
        `${i + 1}. [${t.verdict.toUpperCase()}] ${t.type}: ${t.content}` +
        (t.evidenceKind === 'public'
          ? `\n   Source: ${t.sourceUrl}`
          : `\n   Evidence: ${t.evidenceKind}`) +
        `\n   Offer relevance: ${t.offerRelevance}/3, Person relevance: ${t.personRelevance}/3`,
    )
    .join('\n');

  // Build chat context
  const chatLines = chatContext
    .map((c) => `[${c.occurredAt}] ${c.author}: ${c.content}`)
    .join('\n');

  // Build BANT status from existing claims
  const bantLines = bantClaims
    .map(
      (b) =>
        `${b.dimension}: ${b.status}${b.value ? ` — ${b.value}` : ''}${b.evidence ? ` (${b.evidence})` : ''}`,
    )
    .join('\n');

  // Valid source URLs (only from public triggers)
  const validSourceUrls = factTriggers
    .filter((t) => t.evidenceKind === 'public' && t.sourceUrl)
    .map((t) => t.sourceUrl);

  const userPrompt = `Generate a call briefing for this lead.

## Lead
Name: ${lead.name}
Role: ${lead.role ?? 'unknown'}
Company: ${lead.company ?? 'unknown'}
Phone: ${lead.phone ?? 'not available'}
Email: ${lead.email ?? 'not available'}
Profile: ${lead.profileUrl ?? 'not available'}

## Triggers (strongest first)
${triggerDescriptions || 'No triggers found. Mark all claims as assumptions.'}

${chatLines ? `## Chat history\n${chatLines}` : ''}

${bantLines ? `## Known BANT status\n${bantLines}` : ''}

## Meeting slots
${meetingSlots.map((s, i) => `Slot ${i + 1}: ${s}`).join('\n')}

## Rules
- evidenceUrl must be one of: ${validSourceUrls.join(', ') || '(none available — set to null)'}
- If no public triggers, set evidenceUrl to null and describe the chat evidence in evidenceNote
- meetingSlots must each include "Vorschlag - Verfuegbarkeit bestaetigen"
- Objection answers ONLY from approved offer knowledge. If missing: "Offene Frage: ..."`;

  const systemPrompt = buildBriefSystemPrompt(campaign);

  const parsed = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    output_config: {
      effort: 'low',
      format: zodOutputFormat(CallBriefingSchema),
    },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (!parsed.parsed_output) {
    throw new Error(
      'Das Call-Briefing konnte nicht erstellt werden. Bitte erneut versuchen.',
    );
  }

  const raw = parsed.parsed_output;

  // --- Code-side guards ---

  // 1. Cap list lengths
  const openQuestions = raw.openQuestions.slice(0, MAX_OPEN_QUESTIONS);
  const talkingPoints = raw.talkingPoints.slice(0, MAX_TALKING_POINTS);
  let objections = raw.objections.slice(0, MAX_OBJECTIONS);

  // 2. Objection answer guard: must come from offerKnowledge
  const offerKnowledge = campaign.offerKnowledge.trim();
  if (!offerKnowledge) {
    // No offer knowledge: every answer must be an open question
    objections = objections.map((o) => ({
      objection: o.objection,
      answer: o.answer.startsWith('Offene Frage:')
        ? o.answer
        : `Offene Frage: ${o.objection}`,
    }));
  }

  // 3. evidenceUrl guard: must be in valid URLs or null
  let evidenceUrl = raw.evidenceUrl;
  if (validSourceUrls.length === 0) {
    evidenceUrl = null;
  } else if (
    evidenceUrl !== null &&
    !validSourceUrls.includes(evidenceUrl)
  ) {
    evidenceUrl = validSourceUrls[0] ?? null;
  }

  const briefing: CallBriefing = {
    headline: raw.headline,
    context: raw.context,
    whyNow: raw.whyNow,
    evidenceUrl,
    evidenceNote: raw.evidenceNote,
    hook: raw.hook,
    facts: raw.facts,
    hypotheses: raw.hypotheses,
    openQuestions,
    bant: raw.bant,
    talkingPoints,
    objections,
    phone: raw.phone,
    consentLine: raw.consentLine,
    meetingSlots: raw.meetingSlots,
    contact: raw.contact,
    goal: raw.goal,
    assumptions: raw.assumptions,
  };

  return {
    briefing,
    tokenUsage: {
      inputTokens: parsed.usage.input_tokens,
      outputTokens: parsed.usage.output_tokens,
    },
  };
}
