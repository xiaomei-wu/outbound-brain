// ============================================================
// Evaluation (v2): score a completed call, produce BANT updates,
// trigger feedback, lead corrections, handoff and coaching.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '@/lib/env';
import type {
  BantClaim,
  CallBriefing,
  CallEvaluation,
  CallOutcome,
  Campaign,
  CriterionId,
  CriterionScore,
  LeadTrigger,
} from '@/lib/types';
import { buildEvaluationSystemPrompt } from './prompts';

// ---------------------------------------------------------------------------
// Zod schemas (v2)
// ---------------------------------------------------------------------------

const CriterionScoreSchema = z.object({
  id: z.enum([
    'reason',
    'triggerLanded',
    'discovery',
    'listening',
    'pain',
    'objection',
    'qualification',
    'nextStep',
  ]),
  points: z.nullable(
    z.union([z.literal(0), z.literal(1), z.literal(2)]),
  ),
  quote: z.nullable(z.string()),
});

const BantUpdateSchema = z.object({
  dimension: z.enum(['budget', 'authority', 'need', 'timeline']),
  status: z.enum(['confirmed', 'assumed', 'open']),
  value: z.string(),
  evidence: z.string(),
});

const TriggerFeedbackSchema = z.object({
  leadTriggerId: z.string(),
  result: z.enum(['confirmed', 'contradicted', 'not_tested']),
  evidence: z.nullable(z.string()),
});

const LeadCorrectionSchema = z.object({
  field: z.enum([
    'role',
    'need',
    'timing',
    'contact_route',
    'fit',
    'other',
  ]),
  value: z.string(),
  evidence: z.string(),
});

const BriefBantItemSchema = z.object({
  dimension: z.enum(['budget', 'authority', 'need', 'timeline']),
  status: z.enum(['confirmed', 'assumed', 'open']),
  value: z.nullable(z.string()),
  evidence: z.nullable(z.string()),
});

const DemoHandoffSchema = z.object({
  companyIcp: z.string(),
  participants: z.array(z.string()),
  useCase: z.nullable(z.string()),
  useCaseEvidence: z.nullable(z.string()),
  bant: z.array(BriefBantItemSchema),
  demoObjective: z.nullable(z.string()),
  objectiveStatus: z.enum(['agreed', 'proposed', 'none']),
  objectiveEvidence: z.nullable(z.string()),
  demoSuggestion: z.nullable(z.string()),
  nextAction: z.string(),
  openQuestions: z.array(z.string()),
});

const CallEvaluationSchema = z.object({
  scores: z.array(CriterionScoreSchema),
  consentAsked: z.boolean(),
  optOutRespected: z.boolean(),
  needConfirmed: z.boolean(),
  keep: z.string(),
  tryNext: z.string(),
  betterLine: z.string(),
  bantUpdates: z.array(BantUpdateSchema),
  triggerFeedback: z.array(TriggerFeedbackSchema),
  leadCorrections: z.array(LeadCorrectionSchema),
  recommendedAction: z.enum([
    'demo_handoff',
    'follow_up',
    'identify_contact',
    'stop',
    'research',
    'call_now',
    'reply',
    'wait',
  ]),
  recommendationReason: z.string(),
  handoff: z.nullable(DemoHandoffSchema),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';

const ALL_CRITERIA: CriterionId[] = [
  'reason',
  'triggerLanded',
  'discovery',
  'listening',
  'pain',
  'objection',
  'qualification',
  'nextStep',
];

// ---------------------------------------------------------------------------
// Main: evaluateCall (v2)
// ---------------------------------------------------------------------------

export interface EvaluationResult {
  evaluation: CallEvaluation;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function evaluateCall(
  brief: CallBriefing,
  outcome: CallOutcome,
  notes: string | null,
  transcript: string | null,
  activeTriggers: LeadTrigger[],
  existingBant: BantClaim[],
  campaign: Campaign,
): Promise<EvaluationResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() });

  // Active trigger info for feedback
  const triggerInfo = activeTriggers
    .map((t) => `- id="${t.id}" type="${t.type}": ${t.content}`)
    .join('\n');

  // Existing BANT
  const bantInfo = existingBant
    .map(
      (b) =>
        `- ${b.dimension}: ${b.status}${b.value ? ` — ${b.value}` : ''}`,
    )
    .join('\n');

  const userPrompt = `Evaluate this completed sales call.

## Call briefing (preparation)
Context: ${brief.context}
Why now: ${brief.whyNow}
Hook: ${brief.hook}
Open questions: ${brief.openQuestions.join('; ')}
Goal: ${brief.goal}

## Call outcome
Result: ${outcome}

## Seller's notes
${notes ?? '(no notes provided)'}

## Transcript
${transcript ?? '(no transcript available — score "listening" as null)'}

## Active triggers (provide feedback for each)
${triggerInfo || '(no active triggers)'}

## Existing BANT status
${bantInfo || '(no prior BANT data)'}

## Instructions
1. Score all 8 criteria. Set points to null if no evidence (never guess).
2. Provide BANT updates for any dimension where the call revealed new information.
3. For each active trigger, indicate confirmed/contradicted/not_tested.
4. Note any lead corrections (wrong role, wrong contact info, etc.) with evidence.
5. Recommend a next action with a reason.
6. If recommending demo_handoff, fill in the handoff section with evidence.
7. For handoff.objectiveStatus: "agreed" requires a verbatim quote showing agreement. Merely mentioning a demo = "proposed".`;

  const systemPrompt = buildEvaluationSystemPrompt(campaign);

  const parsed = await client.messages.parse({
    model: MODEL,
    max_tokens: 8192,
    output_config: {
      effort: 'medium',
      format: zodOutputFormat(CallEvaluationSchema),
    },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (!parsed.parsed_output) {
    throw new Error(
      'Die Gespraechsanalyse konnte nicht erstellt werden. Bitte erneut versuchen.',
    );
  }

  const raw = parsed.parsed_output;

  // --- Code-side guards ---

  // 1. Ensure all 8 criteria present; points > 0 requires a quote
  const scores: CriterionScore[] = ALL_CRITERIA.map((criterionId) => {
    const found = raw.scores.find((s) => s.id === criterionId);
    if (!found) {
      return { id: criterionId, points: null, quote: null };
    }
    if (found.points !== null && found.points > 0 && !found.quote) {
      return { id: criterionId, points: null, quote: null };
    }
    return found as CriterionScore;
  });

  // 2. Drop bantUpdates without evidence
  const bantUpdates = raw.bantUpdates.filter(
    (u) => u.evidence.trim() !== '',
  );

  // 3. Drop triggerFeedback confirmed/contradicted without evidence
  const triggerFeedback = raw.triggerFeedback
    .filter((f) => {
      if (f.result === 'not_tested') return true;
      return f.evidence != null && f.evidence.trim() !== '';
    })
    .map((f) => ({
      leadTriggerId: f.leadTriggerId,
      result: f.result as 'confirmed' | 'contradicted' | 'not_tested',
      evidence: f.evidence ?? null,
    }));

  // 4. Drop leadCorrections without evidence
  const leadCorrections = raw.leadCorrections.filter(
    (c) => c.evidence.trim() !== '',
  );

  // 5. Process handoff — enforce objectiveStatus
  let handoff = raw.handoff;
  if (handoff) {
    // objectiveStatus 'agreed' requires an evidence quote
    if (handoff.objectiveStatus === 'agreed') {
      if (
        !handoff.objectiveEvidence ||
        handoff.objectiveEvidence.trim() === ''
      ) {
        // Downgrade to 'proposed'
        handoff = { ...handoff, objectiveStatus: 'proposed' as const };
      }
    }
  }

  // 6. Enforce demoReady = needConfirmed && handoff?.objectiveStatus === 'agreed'
  const needConfirmed = raw.needConfirmed;
  const demoReady =
    needConfirmed === true &&
    handoff?.objectiveStatus === 'agreed';

  // Map handoff to DemoHandoff type (strip objectiveEvidence)
  const mappedHandoff = handoff
    ? {
        companyIcp: handoff.companyIcp,
        participants: handoff.participants,
        useCase: handoff.useCase,
        useCaseEvidence: handoff.useCaseEvidence,
        bant: handoff.bant,
        demoObjective: handoff.demoObjective,
        objectiveStatus: handoff.objectiveStatus as
          | 'agreed'
          | 'proposed'
          | 'none',
        demoSuggestion: handoff.demoSuggestion,
        nextAction: handoff.nextAction,
        openQuestions: handoff.openQuestions,
      }
    : null;

  const evaluation: CallEvaluation = {
    scores,
    consentAsked: raw.consentAsked,
    optOutRespected: raw.optOutRespected,
    needConfirmed,
    demoReady,
    keep: raw.keep,
    tryNext: raw.tryNext,
    betterLine: raw.betterLine,
    bantUpdates,
    triggerFeedback,
    leadCorrections,
    recommendedAction:
      raw.recommendedAction as CallEvaluation['recommendedAction'],
    recommendationReason: raw.recommendationReason,
    handoff: mappedHandoff,
  };

  return {
    evaluation,
    tokenUsage: {
      inputTokens: parsed.usage.input_tokens,
      outputTokens: parsed.usage.output_tokens,
    },
  };
}
