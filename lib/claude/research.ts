// ============================================================
// Research (v2): web search + chat context -> trigger evaluation.
// Step 1: web_search_20260209 to find public evidence.
// Step 2: structured output to score findings AND chat evidence.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '@/lib/env';
import type {
  Campaign,
  EvidenceSource,
  Lead,
  LeadContext,
  TriggerCatalogEntry,
  TriggerVerdict,
} from '@/lib/types';
import {
  buildResearchSystemPrompt,
  buildResearchEvaluationPrompt,
} from './prompts';

// ---------------------------------------------------------------------------
// Research finding (v2)
// ---------------------------------------------------------------------------

export interface ResearchFinding {
  triggerTypeId: string | null;
  summary: string;
  sourceUrl: string;
  evidenceExcerpt: string;
  evidenceTimestamp: string;
  eventDate: string;
  offerRelevance: 0 | 1 | 2 | 3;
  personRelevance: 0 | 1 | 2 | 3;
  relevanceReason: string;
  evidenceKind: EvidenceSource;
  isActive: boolean;
  inactiveReason: string;
  verdict: TriggerVerdict;
  matchedEntryId: string | null;
}

// ---------------------------------------------------------------------------
// Zod schema for structured output (step 2)
// ---------------------------------------------------------------------------

const FindingSchema = z.object({
  triggerTypeId: z.nullable(z.string()),
  summary: z.string(),
  sourceUrl: z.string(),
  evidenceExcerpt: z.string(),
  evidenceTimestamp: z.string(),
  eventDate: z.string(),
  offerRelevance: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  personRelevance: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  relevanceReason: z.string(),
  evidenceKind: z.enum(['public', 'chat', 'call']),
  isActive: z.boolean(),
  inactiveReason: z.string(),
});

const FindingsArraySchema = z.object({
  findings: z.array(FindingSchema),
});

// ---------------------------------------------------------------------------
// Trigger verdict (v2): candidates kept, stale -> isActive=false
// ---------------------------------------------------------------------------

export function evaluateTriggerVerdict(
  finding: z.infer<typeof FindingSchema>,
  catalogEntries: TriggerCatalogEntry[],
  now: Date,
): {
  verdict: TriggerVerdict;
  matchedEntryId: string | null;
  isActive: boolean;
  inactiveReason: string;
} {
  const matched = finding.triggerTypeId
    ? catalogEntries.find(
        (c) => c.id === finding.triggerTypeId && c.approved,
      )
    : null;

  // Evidence gate
  const hasEvidence =
    finding.evidenceKind === 'public'
      ? finding.sourceUrl.trim() !== ''
      : finding.evidenceExcerpt.trim() !== '';

  if (!hasEvidence) {
    return {
      verdict: 'reject',
      matchedEntryId: matched?.id ?? null,
      isActive: false,
      inactiveReason: 'Keine nachpruefbare Evidenz',
    };
  }

  // Recency gate (only for catalog matches)
  let isActive = finding.isActive;
  let inactiveReason = finding.inactiveReason;

  if (matched && isActive) {
    const eventDate = new Date(finding.eventDate);
    const windowMs = matched.windowDays * 24 * 60 * 60 * 1000;
    if (now.getTime() - eventDate.getTime() > windowMs) {
      isActive = false;
      inactiveReason = `Ereignis ausserhalb des ${matched.windowDays}-Tage-Fensters`;
    }
  }

  // Relevance -> verdict
  const sum = finding.offerRelevance + finding.personRelevance;
  let verdict: TriggerVerdict;
  if (sum >= 5) verdict = 'strong';
  else if (sum >= 3) verdict = 'usable';
  else verdict = 'reject';

  // Rejected findings are inactive (never a call reason)
  if (verdict === 'reject' && isActive) {
    isActive = false;
    inactiveReason = inactiveReason || 'Relevanz zu gering';
  }

  return {
    verdict,
    matchedEntryId: matched?.id ?? null,
    isActive,
    inactiveReason,
  };
}

// ---------------------------------------------------------------------------
// Extract helpers
// ---------------------------------------------------------------------------

function collectSearchUrls(response: Anthropic.Message): Set<string> {
  const urls = new Set<string>();
  for (const block of response.content) {
    if (
      block.type === 'web_search_tool_result' &&
      Array.isArray(block.content)
    ) {
      for (const result of block.content) {
        if (result.type === 'web_search_result' && result.url) {
          urls.add(result.url);
        }
      }
    }
  }
  return urls;
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Main: researchTriggers (v2)
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const MAX_PAUSE_ITERATIONS = 5;

export interface ResearchResult {
  findings: ResearchFinding[];
  tokenUsage: {
    searchInputTokens: number;
    searchOutputTokens: number;
    evalInputTokens: number;
    evalOutputTokens: number;
  };
}

export async function researchTriggers(
  lead: Pick<Lead, 'name' | 'role' | 'company' | 'companyDomain'>,
  catalog: TriggerCatalogEntry[],
  campaign: Campaign,
  chatContext: LeadContext[],
): Promise<ResearchResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() });

  // Build chat context string for the search step
  const chatLines = chatContext
    .map(
      (c) =>
        `[${c.occurredAt}] ${c.author === 'contact' ? c.kind.toUpperCase() : 'SELLER'}: ${c.content}`,
    )
    .join('\n');

  // ---- Step 1: Web search ----
  const searchPrompt = `Research the following person and their company for recent trigger events.

Person: ${lead.name}
Role: ${lead.role ?? 'unknown'}
Company: ${lead.company ?? 'unknown'}
Domain: ${lead.companyDomain ?? 'unknown'}

${chatLines ? `## Existing chat context (use to guide your search)\n${chatLines}` : ''}

Search for: recent leadership changes, funding rounds, hiring in sales/SDR roles, LinkedIn posts about problems, market expansion, tool switches, mergers. Focus on events from the last 90 days.`;

  const systemPrompt = buildResearchSystemPrompt(campaign, catalog);

  let messages: Anthropic.MessageParam[] = [
    { role: 'user', content: searchPrompt },
  ];

  let response!: Anthropic.Message;
  const allUrls = new Set<string>();

  for (let i = 0; i < MAX_PAUSE_ITERATIONS; i++) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
      ],
      system: systemPrompt,
      messages,
    });

    for (const url of collectSearchUrls(response)) {
      allUrls.add(url);
    }

    if (response.stop_reason !== 'pause_turn') break;
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
    ];
  }

  if (response.stop_reason === 'refusal') {
    throw new Error(
      'Claude hat die Recherche abgelehnt. Bitte versuchen Sie es erneut.',
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      'Die Recherche war zu umfangreich. Bitte versuchen Sie es erneut.',
    );
  }

  const searchNotes = extractText(response);
  const searchUsage = response.usage;

  // If no web results AND no chat context, return empty
  if (allUrls.size === 0 && chatContext.length === 0) {
    return {
      findings: [],
      tokenUsage: {
        searchInputTokens: searchUsage.input_tokens,
        searchOutputTokens: searchUsage.output_tokens,
        evalInputTokens: 0,
        evalOutputTokens: 0,
      },
    };
  }

  // ---- Step 2: Structured evaluation (web + chat) ----
  const evalSystemPrompt = buildResearchEvaluationPrompt(campaign, catalog);

  const chatContextForEval = chatLines
    ? `\n\n## Chat context with this lead (evaluate relevant statements as triggers with evidenceKind "chat")\n${chatLines}`
    : '';

  const evalUserPrompt = `Evaluate all evidence about ${lead.name} at ${lead.company ?? 'their company'}.

## Web research notes
${searchNotes || '(no web findings)'}

## Valid source URLs from web search (only use these for public evidence)
${allUrls.size > 0 ? [...allUrls].join('\n') : '(none)'}
${chatContextForEval}

Return a JSON object with a "findings" array. Include findings for BOTH web evidence (evidenceKind "public") and chat evidence (evidenceKind "chat"). A chat statement about a problem or a request to talk can be a trigger.`;

  const parsed = await client.messages.parse({
    model: MODEL,
    max_tokens: 8192,
    output_config: {
      effort: 'medium',
      format: zodOutputFormat(FindingsArraySchema),
    },
    system: evalSystemPrompt,
    messages: [{ role: 'user', content: evalUserPrompt }],
  });

  if (!parsed.parsed_output) {
    throw new Error(
      'Die Trigger-Bewertung konnte nicht verarbeitet werden. Bitte erneut versuchen.',
    );
  }

  const evalUsage = parsed.usage;
  const rawFindings = parsed.parsed_output.findings;

  // Guard: public findings must have a URL from the valid set; chat/call need an excerpt
  const validFindings = rawFindings.filter((f) => {
    if (f.evidenceKind === 'public') {
      return f.sourceUrl.trim() !== '' && allUrls.has(f.sourceUrl);
    }
    return f.evidenceExcerpt.trim() !== '';
  });

  // Run verdict logic
  const now = new Date();
  const findings: ResearchFinding[] = validFindings.map((f) => {
    const { verdict, matchedEntryId, isActive, inactiveReason } =
      evaluateTriggerVerdict(f, catalog, now);
    return {
      ...f,
      evidenceKind: f.evidenceKind as EvidenceSource,
      verdict,
      matchedEntryId,
      isActive,
      inactiveReason,
    };
  });

  return {
    findings,
    tokenUsage: {
      searchInputTokens: searchUsage.input_tokens,
      searchOutputTokens: searchUsage.output_tokens,
      evalInputTokens: evalUsage.input_tokens,
      evalOutputTokens: evalUsage.output_tokens,
    },
  };
}
