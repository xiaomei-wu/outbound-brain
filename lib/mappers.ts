/**
 * Mappers between snake_case Supabase DB rows and camelCase TypeScript types.
 * D (data & logic) owns this file. No other workstream edits it.
 */

import type {
  IcpStatus,
  EngagementStage,
  ReplySignal,
  CallCard,
  CompanyCheck,
  IcpScore,
  LeadOrigin,
  SortoutStatus,
  Campaign,
  TriggerCatalogEntry,
  Integration,
  Lead,
  LeadTrigger,
  LeadContext,
  BantClaim,
  CampaignProposal,
  LeadEvent,
  CallLog,
  Decision,
  CadenceStep,
  AgentStep,
  CallEvaluation,
  CallBriefing,
  ConnectorId,
  TriggerVerdict,
  TriggerTier,
  Priority,
  FitStatus,
  NeedStatus,
  WillingnessStatus,
  BantDimension,
  ClaimStatus,
  EvidenceSource,
  TriggerFeedbackResult,
  ProposalStatus,
  ContextKind,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Internal DB row shapes (snake_case). Not exported — use the mapper output.
// ---------------------------------------------------------------------------

export interface CampaignRow {
  id: string;
  offer: string;
  icp_roles: string[];
  icp_company_size_min: number | null;
  icp_company_size_max: number | null;
  icp_regions: string[];
  exclusions: string[];
  language: string;
  tone: string;
  offer_knowledge: string;
  min_sample_size: number;
  needle_campaign_id: string | null;
  needle_campaign_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TriggerCatalogRow {
  id: string;
  campaign_id: string;
  name: string;
  buying_reason: string;
  tier: number;
  window_days: number;
  required_evidence: string;
  approved: boolean;
  created_at: string;
}

export interface IntegrationRow {
  id: string;
  connector_id: string;
  encrypted_config: string;
  iv: string;
  status: string;
  error_message: string | null;
  last_tested_at: string | null;
  created_at: string;
}

export interface LeadRow {
  id: string;
  ai_ark_id: string | null;
  needle_lead_id: string | null;
  name: string;
  role: string | null;
  company: string | null;
  company_domain: string | null;
  company_size: number | null;
  region: string | null;
  email: string | null;
  phone: string | null;
  cached_brief: unknown | null;
  profile_url: string | null;
  source: string;
  fit_score: number;
  interest_score: number;
  priority: string;
  priority_reason: string;
  fit_status: string;
  need_status: string;
  willingness: string;
  status: string;
  owner: string | null;
  last_alert_at: string | null;
  origin: string;
  origin_detail: string | null;
  is_test: boolean;
  company_key: string | null;
  sortout_status: string | null;
  sortout_synced_needle: boolean;
  sortout_until: string | null;
  phone_source: string | null;
  phone_dnc: boolean;
  phone_lookup_at: string | null;
  reply_signal: string | null;
  reply_quote: string | null;
  reply_reason: string | null;
  reply_at: string | null;
  needle_synced_at: string | null;
  engagement_stage: string | null;
  engagement_at: string | null;
  icp_status: string | null;
  icp_status_at: string | null;
  needle_enrolled_at: string | null;
  needle_enroll_pending: boolean;
  call_card: unknown | null;
  created_at: string;
}

export interface CompanyCheckRow {
  id: string;
  company_key: string;
  company_name: string;
  domain: string | null;
  result: unknown;
  score: string;
  checked_at: string;
}

export interface LeadTriggerRow {
  id: string;
  lead_id: string;
  trigger_type_id: string | null;
  type: string;
  content: string;
  source_url: string;
  found_at: string | null;
  is_assumption: boolean;
  verdict: string;
  offer_relevance: number;
  person_relevance: number;
  evidence_kind: string;
  is_active: boolean;
  feedback: string | null;
  feedback_evidence: string | null;
}

export interface LeadContextRow {
  id: string;
  lead_id: string;
  kind: string;
  author: string;
  content: string;
  occurred_at: string;
  source_url: string | null;
}

export interface BantClaimRow {
  id: string;
  lead_id: string;
  dimension: string;
  status: string;
  value: string | null;
  evidence: string | null;
  source: string | null;
  call_log_id: string | null;
  created_at: string;
}

export interface CampaignProposalRow {
  id: string;
  campaign_id: string;
  trigger_type_id: string | null;
  title: string;
  rationale: string;
  old_rule: string;
  new_rule: string;
  assessed_count: number;
  denominator: number;
  evidence: unknown; // jsonb array of strings
  uncertainty: string;
  status: string;
  created_at: string;
  decided_at: string | null;
}

export interface LeadEventRow {
  id: string;
  lead_id: string;
  type: string;
  occurred_at: string;
  evidence: string | null;
  is_test: boolean;
  dedupe_key: string | null;
}

export interface CallLogRow {
  id: string;
  lead_id: string;
  outcome: string;
  notes: string | null;
  transcript: string | null;
  analysis: unknown | null;
  demo_ready: boolean;
  recommended_action: string | null;
  seller_action: string | null;
  seller_reason: string | null;
  created_at: string;
}

export interface DecisionRow {
  id: string;
  lead_id: string;
  action: string;
  reason: string;
  fit_score: number;
  interest_score: number;
  decided_by: string;
  created_at: string;
}

export interface CadenceStepRow {
  id: string;
  lead_id: string;
  step_no: number;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
}

export interface AgentStepRow {
  id: string;
  run_id: string;
  agent: string;
  lead_id: string | null;
  step_no: number;
  tool: string;
  input: unknown;
  output_summary: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// DB → TypeScript mappers
// ---------------------------------------------------------------------------

export function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    offer: row.offer,
    icpRoles: row.icp_roles,
    icpCompanySizeMin: row.icp_company_size_min,
    icpCompanySizeMax: row.icp_company_size_max,
    icpRegions: row.icp_regions,
    exclusions: row.exclusions,
    language: row.language,
    tone: row.tone,
    offerKnowledge: row.offer_knowledge,
    minSampleSize: row.min_sample_size,
    needleCampaignId: row.needle_campaign_id ?? null,
    needleCampaignName: row.needle_campaign_name ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export function toTriggerCatalogEntry(row: TriggerCatalogRow): TriggerCatalogEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    buyingReason: row.buying_reason,
    tier: row.tier as TriggerTier,
    windowDays: row.window_days,
    requiredEvidence: row.required_evidence,
    approved: row.approved,
    createdAt: row.created_at,
  };
}

export function toIntegration(row: IntegrationRow): Integration {
  return {
    id: row.id,
    connectorId: row.connector_id as ConnectorId,
    status: row.status as Integration['status'],
    errorMessage: row.error_message,
    lastTestedAt: row.last_tested_at,
    createdAt: row.created_at,
    // encrypted_config and iv are never mapped to the public type
  };
}

export function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    aiArkId: row.ai_ark_id,
    needleLeadId: row.needle_lead_id,
    name: row.name,
    role: row.role,
    company: row.company,
    companyDomain: row.company_domain,
    companySize: row.company_size,
    region: row.region,
    email: row.email,
    phone: row.phone,
    cachedBrief: row.cached_brief as CallBriefing | null,
    profileUrl: row.profile_url,
    source: row.source,
    fitScore: row.fit_score,
    interestScore: row.interest_score,
    priority: row.priority as Priority,
    priorityReason: row.priority_reason,
    fitStatus: row.fit_status as FitStatus,
    needStatus: row.need_status as NeedStatus,
    willingness: row.willingness as WillingnessStatus,
    status: row.status as Lead['status'],
    owner: row.owner,
    lastAlertAt: row.last_alert_at,
    origin: (row.origin ?? 'manual') as LeadOrigin,
    originDetail: row.origin_detail ?? null,
    isTest: row.is_test ?? false,
    companyKey: row.company_key ?? null,
    sortoutStatus: (row.sortout_status ?? null) as SortoutStatus | null,
    sortoutSyncedNeedle: row.sortout_synced_needle ?? false,
    sortoutUntil: row.sortout_until ?? null,
    phoneSource: row.phone_source ?? null,
    phoneDnc: row.phone_dnc ?? false,
    phoneLookupAt: row.phone_lookup_at ?? null,
    replySignal: (row.reply_signal ?? null) as ReplySignal | null,
    replyQuote: row.reply_quote ?? null,
    replyReason: row.reply_reason ?? null,
    replyAt: row.reply_at ?? null,
    needleSyncedAt: row.needle_synced_at ?? null,
    engagementStage: (row.engagement_stage ?? null) as EngagementStage | null,
    engagementAt: row.engagement_at ?? null,
    icpStatus: (row.icp_status ?? null) as IcpStatus | null,
    icpStatusAt: row.icp_status_at ?? null,
    needleEnrolledAt: row.needle_enrolled_at ?? null,
    needleEnrollPending: row.needle_enroll_pending ?? false,
    callCard: (row.call_card ?? null) as CallCard | null,
    createdAt: row.created_at,
  };
}

export function toCompanyCheck(row: CompanyCheckRow): CompanyCheck {
  const result = row.result as Omit<CompanyCheck, 'id' | 'companyKey' | 'checkedAt'>;
  return {
    ...result,
    id: row.id,
    companyKey: row.company_key,
    companyName: row.company_name,
    domain: row.domain,
    score: row.score as IcpScore,
    checkedAt: row.checked_at,
  };
}

export function toLeadTrigger(row: LeadTriggerRow): LeadTrigger {
  return {
    id: row.id,
    leadId: row.lead_id,
    triggerTypeId: row.trigger_type_id,
    type: row.type,
    content: row.content,
    sourceUrl: row.source_url,
    foundAt: row.found_at,
    isAssumption: row.is_assumption,
    verdict: row.verdict as TriggerVerdict,
    offerRelevance: row.offer_relevance,
    personRelevance: row.person_relevance,
    evidenceKind: row.evidence_kind as EvidenceSource,
    isActive: row.is_active,
    feedback: row.feedback as TriggerFeedbackResult | null,
    feedbackEvidence: row.feedback_evidence,
  };
}

export function toLeadContext(row: LeadContextRow): LeadContext {
  return {
    id: row.id,
    leadId: row.lead_id,
    kind: row.kind as ContextKind,
    author: row.author as LeadContext['author'],
    content: row.content,
    occurredAt: row.occurred_at,
    sourceUrl: row.source_url,
  };
}

export function toBantClaim(row: BantClaimRow): BantClaim {
  return {
    id: row.id,
    leadId: row.lead_id,
    dimension: row.dimension as BantDimension,
    status: row.status as ClaimStatus,
    value: row.value,
    evidence: row.evidence,
    source: row.source as EvidenceSource | null,
    callLogId: row.call_log_id,
    createdAt: row.created_at,
  };
}

export function toCampaignProposal(row: CampaignProposalRow): CampaignProposal {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    triggerTypeId: row.trigger_type_id,
    title: row.title,
    rationale: row.rationale,
    oldRule: row.old_rule,
    newRule: row.new_rule,
    assessedCount: row.assessed_count,
    denominator: row.denominator,
    evidence: toStringArray(row.evidence),
    uncertainty: row.uncertainty,
    status: row.status as ProposalStatus,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export function toLeadEvent(row: LeadEventRow): LeadEvent {
  return {
    id: row.id,
    leadId: row.lead_id,
    type: row.type as LeadEvent['type'],
    occurredAt: row.occurred_at,
    evidence: row.evidence,
    isTest: row.is_test,
    dedupeKey: row.dedupe_key,
  };
}

export function toCallLog(row: CallLogRow): CallLog {
  return {
    id: row.id,
    leadId: row.lead_id,
    outcome: row.outcome as CallLog['outcome'],
    notes: row.notes,
    transcript: row.transcript,
    analysis: row.analysis as CallEvaluation | null,
    demoReady: row.demo_ready,
    recommendedAction: row.recommended_action as CallLog['recommendedAction'],
    sellerAction: row.seller_action as CallLog['sellerAction'],
    sellerReason: row.seller_reason,
    createdAt: row.created_at,
  };
}

export function toDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    leadId: row.lead_id,
    action: row.action as Decision['action'],
    reason: row.reason,
    fitScore: row.fit_score,
    interestScore: row.interest_score,
    decidedBy: row.decided_by,
    createdAt: row.created_at,
  };
}

export function toCadenceStep(row: CadenceStepRow): CadenceStep {
  return {
    id: row.id,
    leadId: row.lead_id,
    stepNo: row.step_no,
    channel: row.channel as CadenceStep['channel'],
    subject: row.subject,
    body: row.body,
    status: row.status as CadenceStep['status'],
  };
}

export function toAgentStep(row: AgentStepRow): AgentStep {
  return {
    id: row.id,
    runId: row.run_id,
    agent: row.agent as AgentStep['agent'],
    leadId: row.lead_id,
    stepNo: row.step_no,
    tool: row.tool,
    input: row.input,
    outputSummary: row.output_summary,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// TypeScript → DB insert helpers (omit id and generated fields)
// ---------------------------------------------------------------------------

export function toInsertCampaign(
  c: Omit<Campaign, 'id' | 'createdAt'>
): Omit<CampaignRow, 'id' | 'created_at'> {
  return {
    offer: c.offer,
    icp_roles: c.icpRoles,
    icp_company_size_min: c.icpCompanySizeMin,
    icp_company_size_max: c.icpCompanySizeMax,
    icp_regions: c.icpRegions,
    exclusions: c.exclusions,
    language: c.language,
    tone: c.tone,
    offer_knowledge: c.offerKnowledge,
    min_sample_size: c.minSampleSize,
    needle_campaign_id: c.needleCampaignId,
    needle_campaign_name: c.needleCampaignName,
    is_active: c.isActive,
  };
}

export function toInsertTriggerCatalogEntry(
  e: Omit<TriggerCatalogEntry, 'id' | 'createdAt'>
): Omit<TriggerCatalogRow, 'id' | 'created_at'> {
  return {
    campaign_id: e.campaignId,
    name: e.name,
    buying_reason: e.buyingReason,
    tier: e.tier,
    window_days: e.windowDays,
    required_evidence: e.requiredEvidence,
    approved: e.approved,
  };
}

export function toInsertLead(
  l: Omit<Lead, 'id' | 'createdAt'>
): Omit<LeadRow, 'id' | 'created_at'> {
  return {
    ai_ark_id: l.aiArkId,
    needle_lead_id: l.needleLeadId,
    name: l.name,
    role: l.role,
    company: l.company,
    company_domain: l.companyDomain,
    company_size: l.companySize,
    region: l.region,
    email: l.email,
    phone: l.phone,
    cached_brief: l.cachedBrief,
    profile_url: l.profileUrl,
    source: l.source,
    fit_score: l.fitScore,
    interest_score: l.interestScore,
    priority: l.priority,
    priority_reason: l.priorityReason,
    fit_status: l.fitStatus,
    need_status: l.needStatus,
    willingness: l.willingness,
    status: l.status,
    owner: l.owner,
    last_alert_at: l.lastAlertAt,
    origin: l.origin,
    origin_detail: l.originDetail,
    is_test: l.isTest,
    company_key: l.companyKey,
    sortout_status: l.sortoutStatus,
    sortout_synced_needle: l.sortoutSyncedNeedle,
    sortout_until: l.sortoutUntil,
    phone_source: l.phoneSource,
    phone_dnc: l.phoneDnc,
    phone_lookup_at: l.phoneLookupAt,
    reply_signal: l.replySignal,
    reply_quote: l.replyQuote,
    reply_reason: l.replyReason,
    reply_at: l.replyAt,
    needle_synced_at: l.needleSyncedAt,
    engagement_stage: l.engagementStage,
    engagement_at: l.engagementAt,
    icp_status: l.icpStatus,
    icp_status_at: l.icpStatusAt,
    needle_enrolled_at: l.needleEnrolledAt,
    needle_enroll_pending: l.needleEnrollPending,
    call_card: l.callCard,
  };
}

export function toInsertLeadTrigger(
  t: Omit<LeadTrigger, 'id'>
): Omit<LeadTriggerRow, 'id'> {
  return {
    lead_id: t.leadId,
    trigger_type_id: t.triggerTypeId,
    type: t.type,
    content: t.content,
    source_url: t.sourceUrl,
    found_at: t.foundAt,
    is_assumption: t.isAssumption,
    verdict: t.verdict,
    offer_relevance: t.offerRelevance,
    person_relevance: t.personRelevance,
    evidence_kind: t.evidenceKind,
    is_active: t.isActive,
    feedback: t.feedback ?? null,
    feedback_evidence: t.feedbackEvidence ?? null,
  };
}

export function toInsertLeadContext(
  c: Omit<LeadContext, 'id'>
): Omit<LeadContextRow, 'id'> {
  return {
    lead_id: c.leadId,
    kind: c.kind,
    author: c.author,
    content: c.content,
    occurred_at: c.occurredAt,
    source_url: c.sourceUrl,
  };
}

export function toInsertBantClaim(
  b: Omit<BantClaim, 'id' | 'createdAt'>
): Omit<BantClaimRow, 'id' | 'created_at'> {
  return {
    lead_id: b.leadId,
    dimension: b.dimension,
    status: b.status,
    value: b.value,
    evidence: b.evidence,
    source: b.source ?? null,
    call_log_id: b.callLogId ?? null,
  };
}

export function toInsertLeadEvent(
  e: Omit<LeadEvent, 'id'>
): Omit<LeadEventRow, 'id'> {
  return {
    lead_id: e.leadId,
    type: e.type,
    occurred_at: e.occurredAt,
    evidence: e.evidence,
    is_test: e.isTest,
    dedupe_key: e.dedupeKey,
  };
}

export function toInsertDecision(
  d: Omit<Decision, 'id' | 'createdAt'>
): Omit<DecisionRow, 'id' | 'created_at'> {
  return {
    lead_id: d.leadId,
    action: d.action,
    reason: d.reason,
    fit_score: d.fitScore,
    interest_score: d.interestScore,
    decided_by: d.decidedBy,
  };
}

export function toInsertCampaignProposal(
  p: Omit<CampaignProposal, 'id' | 'createdAt'>
): Omit<CampaignProposalRow, 'id' | 'created_at'> {
  return {
    campaign_id: p.campaignId,
    trigger_type_id: p.triggerTypeId,
    title: p.title,
    rationale: p.rationale,
    old_rule: p.oldRule,
    new_rule: p.newRule,
    assessed_count: p.assessedCount,
    denominator: p.denominator,
    evidence: p.evidence,
    uncertainty: p.uncertainty,
    status: p.status,
    decided_at: p.decidedAt,
  };
}

/** jsonb text arrays may arrive as an array or as a JSON-encoded string (older rows). */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}
