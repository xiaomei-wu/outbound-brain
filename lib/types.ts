// ============================================================
// Outbound Brain — shared contracts
// Written by the lead. No workstream edits this file.
// ============================================================

// --- Enums ---

export type LeadStatus =
  | 'new' | 'researched' | 'briefed' | 'calling'
  | 'called' | 'paused' | 'stopped';

export type EventType =
  | 'meeting_request' | 'positive_reply' | 'not_now'
  | 'opt_out' | 'new_trigger' | 'open' | 'click';

export type NextAction =
  | 'call_now' | 'reply' | 'research' | 'follow_up' | 'wait' | 'stop'
  | 'demo_handoff' | 'identify_contact';

export type CallOutcome = 'booked' | 'not_booked' | 'not_now' | 'opt_out';

export type TriggerTier = 1 | 2 | 3;
export type TriggerVerdict = 'strong' | 'usable' | 'reject';

export type ConnectorId = 'needle' | 'ai_ark' | 'zapmail' | 'blitz' | 'lusha';

// --- Real-estate ICP flow (2026-10-31) ---

export type LeadOrigin =
  | 'needle_campaign' | 'needle_search' | 'blitz' | 'ai_ark'
  | 'csv' | 'manual' | 'prepared' | 'test';
export type IcpScore = 'A' | 'B' | 'C' | 'D' | 'nicht_bewertbar';
export type SortoutStatus = 'not_a_fit' | 'wrong_contact' | 'not_now' | 'opt_out';
/** What a lead's own written reply (LinkedIn via Needle, or a pasted chat) says. */
/** How far a lead got in the Needle campaign (LinkedIn has no read receipts). */
export type EngagementStage = 'invited' | 'connected' | 'messaged' | 'replied';
export type ReplySignal =
  | 'call_request' | 'interested' | 'later' | 'not_interested'
  | 'opt_out' | 'wrong_contact' | 'disqualifier' | 'neutral';

export interface IcpSignal {
  text: string;
  url: string;                   // direct source URL (PDF: every fit signal needs one)
}

/** Result of Noel's ICP check (ICP-Check Immobilienwirtschaft), cached per company. */
export interface CompanyCheck {
  id: string;
  companyKey: string;
  companyName: string;
  domain: string | null;
  segments: string[];            // dominant segment first
  score: IcpScore;
  whatTheyDo: string;            // two factual sentences
  fitSignals: IcpSignal[];
  against: string[];             // evidenced counterpoints; empty = no disqualifiers found
  decision: string;              // Priorisiert bearbeiten / bearbeiten und klären / zurückstellen / ausschließen / Recherche ergänzen
  decisionReason: string;
  painHypothesis: string;        // explicitly a hypothesis, or „Keine belastbare Pain-Hypothese ableitbar."
  entryPoint: string;
  openQuestion: string;
  checkedAt: string;
}

/** Per-lead call card in the PDF output format (A/B only). */
export interface CallCard {
  anlass: string;
  anlassUrl: string | null;
  opener: string;                // verbatim, max 30-40 s spoken
  followUps: string[];           // exactly 2
  objection: { expected: string; response: string };
  openQuestion: string;
}

export type CriterionId =
  | 'reason' | 'triggerLanded' | 'discovery' | 'listening'
  | 'pain' | 'objection' | 'qualification' | 'nextStep';

// --- Revised plan (v2): priority, evidence, BANT, feedback ---

export type Priority = 'high' | 'medium' | 'low' | 'review';
export type FitStatus = 'fits' | 'partial' | 'outside' | 'unknown';
export type NeedStatus = 'expressed' | 'hypothesis' | 'none' | 'unknown';
export type WillingnessStatus = 'requested' | 'open' | 'declined' | 'unknown';
export type BantDimension = 'budget' | 'authority' | 'need' | 'timeline';
export type ClaimStatus = 'confirmed' | 'assumed' | 'open';
export type EvidenceSource = 'chat' | 'call' | 'public' | 'seller';
export type TriggerFeedbackResult = 'confirmed' | 'contradicted' | 'not_tested';
export type ObjectiveStatus = 'agreed' | 'proposed' | 'none';
export type ProposalStatus = 'proposed' | 'approved' | 'rejected';
export type ContextKind = 'chat' | 'email' | 'linkedin' | 'note';

// --- Campaign & admin (DB-backed, editable via /setup) ---

export interface Campaign {
  id: string;
  offer: string;
  icpRoles: string[];
  icpCompanySizeMin: number | null;
  icpCompanySizeMax: number | null;
  icpRegions: string[];
  exclusions: string[];
  language: string;              // 'de' | 'en'
  tone: string;                  // 'professional' | 'casual'
  offerKnowledge: string;        // approved facts about the offer; objection answers may only use these
  minSampleSize: number;         // comparable cases needed before a campaign proposal
  needleCampaignId: string | null;
  needleCampaignName: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface TriggerCatalogEntry {
  id: string;
  campaignId: string;
  name: string;
  buyingReason: string;
  tier: TriggerTier;
  windowDays: number;
  requiredEvidence: string;
  approved: boolean;
  createdAt: string;
}

export interface Integration {
  id: string;
  connectorId: ConnectorId;
  status: 'untested' | 'ok' | 'failed';
  errorMessage: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  // encrypted_config never exposed to the browser
}

// --- Trigger evaluation (Claude structured output) ---

export interface TriggerType {
  id: string;
  name: string;
  buyingReason: string;
  tier: TriggerTier;
  windowDays: number;
  requiredEvidence: string;
  approvedBy: string | null;
}

export interface TriggerEvaluation {
  triggerTypeId: string | null;
  summary: string;
  sourceUrl: string;
  eventDate: string;
  offerRelevance: 0 | 1 | 2 | 3;
  personRelevance: 0 | 1 | 2 | 3;
  reason: string;
}

// --- Call briefing (Claude structured output) ---

export interface Objection {
  objection: string;
  answer: string;
}

export interface BriefBantItem {
  dimension: BantDimension;
  status: ClaimStatus;           // unknown is 'open', never 'no'
  value: string | null;
  evidence: string | null;
}

export interface CallBriefing {
  headline: string;
  context: string;               // company + person, 1-2 sentences
  whyNow: string;                // evidenced reason to call
  evidenceUrl: string | null;    // public source; null when the evidence is a chat or call
  evidenceNote: string;          // e.g. 'Chat vom 28.10.: "..."'
  hook: string;                  // opener; never presents a hypothesis as a customer statement
  facts: string[];
  hypotheses: string[];
  openQuestions: string[];       // at most 3, prioritized
  bant: BriefBantItem[];         // one per dimension
  talkingPoints: string[];       // up to 3, optional
  objections: Objection[];       // up to 2; answers only from campaign.offerKnowledge, else "Offene Frage: ..."
  phone: string | null;
  consentLine: string;
  meetingSlots: string[];        // suggestions requiring confirmation, not verified availability
  contact: string;
  goal: string;
  assumptions: string[];
}

// --- Call evaluation (Claude structured output) ---

export interface CriterionScore {
  id: CriterionId;
  points: 0 | 1 | 2 | null;   // null = not observed
  quote: string | null;         // required when points > 0
}

export interface TriggerFeedback {
  leadTriggerId: string;
  result: TriggerFeedbackResult;
  evidence: string | null;       // required for confirmed / contradicted
}

export interface BantUpdate {
  dimension: BantDimension;
  status: ClaimStatus;
  value: string;
  evidence: string;              // quote from transcript or notes
}

export interface LeadCorrection {
  field: 'role' | 'need' | 'timing' | 'contact_route' | 'fit' | 'other';
  value: string;
  evidence: string;
}

export interface DemoHandoff {
  companyIcp: string;
  participants: string[];        // known only; unknowns go to openQuestions
  useCase: string | null;
  useCaseEvidence: string | null;
  bant: BriefBantItem[];
  demoObjective: string | null;
  objectiveStatus: ObjectiveStatus;   // 'agreed' only with evidence of agreement
  demoSuggestion: string | null;      // system suggestion, not a customer commitment
  nextAction: string;
  openQuestions: string[];
}

export interface CallEvaluation {
  scores: CriterionScore[];      // null points = not observed; display "x/(2*assessed) · assessed of 8"
  consentAsked: boolean;
  optOutRespected: boolean;
  needConfirmed: boolean;
  demoReady: boolean;            // code enforces: needConfirmed && handoff.objectiveStatus === 'agreed'
  keep: string;
  tryNext: string;
  betterLine: string;
  bantUpdates: BantUpdate[];
  triggerFeedback: TriggerFeedback[];
  leadCorrections: LeadCorrection[];
  recommendedAction: NextAction;
  recommendationReason: string;
  handoff: DemoHandoff | null;
}

// --- Database row types ---

export interface Lead {
  id: string;
  aiArkId: string | null;
  needleLeadId: string | null;
  name: string;
  role: string | null;
  company: string | null;
  companyDomain: string | null;
  companySize: number | null;
  region: string | null;
  email: string | null;
  phone: string | null;
  cachedBrief: CallBriefing | null;   // pre-computed brief; read before calling Claude
  profileUrl: string | null;
  source: string;
  fitScore: number;              // internal only; the UI shows priority + reason
  interestScore: number;         // internal only
  priority: Priority;
  priorityReason: string;
  fitStatus: FitStatus;
  needStatus: NeedStatus;
  willingness: WillingnessStatus;
  status: LeadStatus;
  owner: string | null;
  lastAlertAt: string | null;
  origin: LeadOrigin;
  originDetail: string | null;   // e.g. Needle campaign name
  isTest: boolean;               // simulated demo data; never in the real funnel
  companyKey: string | null;     // cache key for company_check
  sortoutStatus: SortoutStatus | null;
  sortoutSyncedNeedle: boolean;
  sortoutUntil: string | null;
  phoneSource: string | null;    // 'lusha' | 'ai_ark' | 'blitz' | 'manuell' | …
  phoneDnc: boolean;
  phoneLookupAt: string | null;  // cheaper phone chain tried without a hit → offer Lusha
  replySignal: ReplySignal | null;
  replyQuote: string | null;     // the person's own words the signal is based on
  replyReason: string | null;
  replyAt: string | null;
  needleSyncedAt: string | null; // ICP result written to the Needle lead's properties
  engagementStage: EngagementStage | null;
  engagementAt: string | null;
  callCard: CallCard | null;
  createdAt: string;
}

export interface LeadTrigger {
  id: string;
  leadId: string;
  triggerTypeId: string | null;
  type: string;
  content: string;
  sourceUrl: string;
  foundAt: string | null;
  isAssumption: boolean;
  verdict: TriggerVerdict;
  offerRelevance: number;
  personRelevance: number;
  evidenceKind: EvidenceSource;
  isActive: boolean;             // false = stale, unsupported or contradicted; never a call reason
  feedback: TriggerFeedbackResult | null;
  feedbackEvidence: string | null;
}

export interface LeadContext {
  id: string;
  leadId: string;
  kind: ContextKind;
  author: 'contact' | 'seller';
  content: string;
  occurredAt: string;
  sourceUrl: string | null;
}

export interface BantClaim {
  id: string;
  leadId: string;
  dimension: BantDimension;
  status: ClaimStatus;
  value: string | null;
  evidence: string | null;
  source: EvidenceSource | null;
  callLogId: string | null;
  createdAt: string;
}

export interface CampaignProposal {
  id: string;
  campaignId: string;
  triggerTypeId: string | null;
  title: string;
  rationale: string;
  oldRule: string;
  newRule: string;
  assessedCount: number;         // cases with confirmed/contradicted feedback
  denominator: number;           // all comparable cases
  evidence: string[];
  uncertainty: string;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
}

export interface LeadEvent {
  id: string;
  leadId: string;
  type: EventType;
  occurredAt: string;
  evidence: string | null;
  isTest: boolean;
  dedupeKey: string | null;
}

export interface CallLog {
  id: string;
  leadId: string;
  outcome: CallOutcome;
  notes: string | null;
  transcript: string | null;
  analysis: CallEvaluation | null;
  demoReady: boolean;
  recommendedAction: NextAction | null;
  sellerAction: NextAction | null;   // seller override; never changes qualification status
  sellerReason: string | null;
  createdAt: string;
}

export interface Decision {
  id: string;
  leadId: string;
  action: NextAction;
  reason: string;
  fitScore: number;
  interestScore: number;
  decidedBy: string;
  createdAt: string;
}

export interface CadenceStep {
  id: string;
  leadId: string;
  stepNo: number;
  channel: 'email' | 'linkedin';
  subject: string | null;
  body: string;
  status: 'draft' | 'approved' | 'sent' | 'cancelled';
}

export interface AgentStep {
  id: string;
  runId: string;
  agent: 'prospecting' | 'signal';
  leadId: string | null;
  stepNo: number;
  tool: string;
  input: unknown;
  outputSummary: string | null;
  createdAt: string;
}

// --- Scoring ---

export interface PriorityResult {
  priority: Priority;
  reason: string;                // one plain German sentence, shown under the list
  fitStatus: FitStatus;
  needStatus: NeedStatus;
  willingness: WillingnessStatus;
}

export interface ScoreResult {
  interestScore: number;
  action: NextAction;
  reason: string;
  sendAlert: boolean;
}
