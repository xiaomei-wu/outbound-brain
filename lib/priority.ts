/**
 * Priority computation — pure logic + DB refresh helper.
 * D (data & logic) owns this file.
 *
 * Rules (REVISION_V2.md):
 *  High   = fitting company + current specific expressed need OR agreed request to talk.
 *           Unknown role stays High with clarification task "Rolle klären".
 *  Medium = fitting company + evidenced relevant reason but need not confirmed.
 *  Low    = only weak contact signals or insufficient context.
 *  Review = interest from outside the ICP or a significant unresolved contradiction.
 *  Stopped / opt-out → never prioritized.
 *  Unknown is NOT No: missing budget/role/timing never lowers fit or priority.
 */

import type {
  Lead,
  LeadTrigger,
  LeadContext,
  BantClaim,
  Campaign,
  PriorityResult,
  FitStatus,
  NeedStatus,
  WillingnessStatus,
} from '@/lib/types';

// Trigger type names that signal expressed need vs explicit conversation request.
// Must match the catalog names used in seed and trigger evaluation.
const EXPRESSED_NEED_TYPES = ['Geäußerter Bedarf'];
const CONVERSATION_REQUEST_TYPES = ['Ausdrücklicher Gesprächswunsch'];

// ---------------------------------------------------------------------------
// computeFitStatus
// ---------------------------------------------------------------------------

function computeFitStatus(lead: Lead, campaign: Campaign | null): FitStatus {
  if (!campaign) return 'unknown';

  // Company size outside range → outside ICP
  const size = lead.companySize;
  if (size !== null) {
    if (campaign.icpCompanySizeMin !== null && size < campaign.icpCompanySizeMin) return 'outside';
    if (campaign.icpCompanySizeMax !== null && size > campaign.icpCompanySizeMax) return 'outside';
  }

  // Region mismatch (if region known and ICP regions non-empty)
  const region = (lead.region ?? '').toLowerCase().trim();
  const icpRegions = campaign.icpRegions.map((r) => r.toLowerCase().trim());
  if (region && icpRegions.length > 0) {
    const regionMatches = icpRegions.some(
      (r) => region === r || region.startsWith(r) || r.startsWith(region)
    );
    if (!regionMatches) return 'outside';
  }

  // Role check
  const role = (lead.role ?? '').toLowerCase().trim();
  const icpRoles = campaign.icpRoles.map((r) => r.toLowerCase().trim());

  if (!role) {
    // Unknown role: not 'outside'; company-level fit applies
    return 'fits';
  }

  if (icpRoles.length === 0) return 'fits';

  // Exact or near-exact match (role equals an ICP role, or ICP role equals role)
  const roleMatches = icpRoles.some((icpRole) => {
    if (role === icpRole) return true;
    // Role contains the exact ICP role phrase
    if (role.includes(icpRole)) return true;
    // ICP role contains the role phrase (e.g. "vp" is contained in "vp sales")
    if (icpRole.includes(role) && role.length >= 5) return true;
    return false;
  });

  if (roleMatches) return 'fits';

  // Company fits but role doesn't clearly match → partial (not 'outside',
  // since company relevance may still exist for referral purposes)
  return 'partial';
}

// ---------------------------------------------------------------------------
// computeNeedStatus
// ---------------------------------------------------------------------------

function computeNeedStatus(
  activeTriggers: LeadTrigger[],
  bant: BantClaim[],
  previousStatus: NeedStatus
): NeedStatus {
  // Expressed need trigger → 'expressed'
  if (activeTriggers.some((t) => EXPRESSED_NEED_TYPES.includes(t.type))) return 'expressed';

  // Confirmed BANT need claim → 'expressed'
  if (bant.some((b) => b.dimension === 'need' && b.status === 'confirmed')) return 'expressed';

  // Assumed BANT need → 'hypothesis'
  if (bant.some((b) => b.dimension === 'need' && b.status === 'assumed')) return 'hypothesis';

  // Other active non-assumption triggers → 'hypothesis'
  if (activeTriggers.some((t) => !t.isAssumption)) return 'hypothesis';

  // Preserve an explicit 'none' (e.g. set after a call where need was contradicted)
  if (previousStatus === 'none') return 'none';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// computeWillingness
// ---------------------------------------------------------------------------

function computeWillingness(
  activeTriggers: LeadTrigger[],
  context: LeadContext[],
  previousStatus: WillingnessStatus
): WillingnessStatus {
  // Declined is sticky — only a seller correction clears it
  if (previousStatus === 'declined') return 'declined';

  // Explicit conversation request trigger → 'requested'
  if (activeTriggers.some((t) => CONVERSATION_REQUEST_TYPES.includes(t.type))) return 'requested';

  // Detect conversation request in contact-authored context messages
  const requestKeywords = ['gespräch', 'termin', 'anruf', 'gerne', 'können wir', 'würde mich freuen'];
  const hasContextRequest = context.some(
    (c) =>
      c.author === 'contact' &&
      requestKeywords.some((kw) => c.content.toLowerCase().includes(kw))
  );
  if (hasContextRequest) return 'requested';

  return 'open';
}

// ---------------------------------------------------------------------------
// buildPriorityReason — German, one plain sentence
// ---------------------------------------------------------------------------

function buildHighReason(
  lead: Lead,
  needStatus: NeedStatus,
  willingness: WillingnessStatus,
  activeTriggers: LeadTrigger[]
): string {
  const roleUnknown = !lead.role;
  const parts: string[] = [];

  if (needStatus === 'expressed' && willingness === 'requested') {
    parts.push('Kontakt hat konkreten Bedarf geäußert und ein Gespräch vereinbart.');
  } else if (needStatus === 'expressed') {
    parts.push('Kontakt hat konkreten Bedarf geäußert.');
  } else if (willingness === 'requested') {
    parts.push('Kontakt hat ein Gespräch vereinbart oder aktiv angefragt.');
  }

  const firstTrigger = activeTriggers.find(
    (t) => !EXPRESSED_NEED_TYPES.includes(t.type) && !CONVERSATION_REQUEST_TYPES.includes(t.type)
  );
  if (firstTrigger) {
    parts.push(`Weiteres Signal: ${firstTrigger.type}.`);
  }

  if (roleUnknown) {
    parts.push('Rolle noch unbekannt – im Gespräch klären.');
  }

  return parts.join(' ').trim() || 'Unternehmen passt; konkreter Bedarf oder Gesprächswunsch vorhanden.';
}

function buildMediumReason(activeTriggers: LeadTrigger[]): string {
  const names = activeTriggers.slice(0, 2).map((t) => t.type);
  if (names.length > 0) {
    return `Unternehmen passt; aktive Signale (${names.join(', ')}). Bedarf noch nicht bestätigt.`;
  }
  return 'Unternehmen passt; Bedarf ist Hypothese – noch nicht bestätigt.';
}

// ---------------------------------------------------------------------------
// computePriority — pure, no I/O
// ---------------------------------------------------------------------------

export interface ComputePriorityInput {
  lead: Lead;
  triggers: LeadTrigger[];
  context: LeadContext[];
  bant: BantClaim[];
  campaign: Campaign | null;
}

export function computePriority(input: ComputePriorityInput): PriorityResult {
  const { lead, triggers, context, bant, campaign } = input;

  // Opt-out / stopped → never prioritized
  if (lead.status === 'stopped') {
    return {
      priority: 'low',
      reason: 'Abgemeldet – kein weiterer Kontakt.',
      fitStatus: lead.fitStatus,
      needStatus: 'none',
      willingness: 'declined',
    };
  }

  // 1. Compute fit
  const fitStatus = computeFitStatus(lead, campaign);

  // Outside ICP → Review queue (never mixed into the regular list)
  if (fitStatus === 'outside') {
    return {
      priority: 'review',
      reason: 'Unternehmen oder Profil liegt außerhalb des ICP – separat prüfen.',
      fitStatus,
      needStatus: lead.needStatus,
      willingness: lead.willingness,
    };
  }

  // 2. Only active, non-rejected triggers count as call reasons
  const activeTriggers = triggers.filter((t) => t.isActive && t.verdict !== 'reject');

  // 3. Derive need and willingness
  const needStatus = computeNeedStatus(activeTriggers, bant, lead.needStatus);
  const willingness = computeWillingness(activeTriggers, context, lead.willingness);

  const fits = fitStatus === 'fits' || fitStatus === 'partial';

  // HIGH: fitting company + expressed need OR agreed/explicit request to talk
  if (fits && (needStatus === 'expressed' || willingness === 'requested')) {
    const reason = buildHighReason(lead, needStatus, willingness, activeTriggers);
    return { priority: 'high', reason, fitStatus, needStatus, willingness };
  }

  // MEDIUM: fitting company + evidenced relevant reason but need not confirmed
  if (fits && (needStatus === 'hypothesis' || activeTriggers.length > 0)) {
    const reason = buildMediumReason(activeTriggers);
    return { priority: 'medium', reason, fitStatus, needStatus, willingness };
  }

  // LOW: only weak signals or unknown context
  if (fits) {
    return {
      priority: 'low',
      reason: 'Nur schwache Kontaktsignale – kein bestätigter Bedarf oder Gesprächswunsch.',
      fitStatus,
      needStatus,
      willingness,
    };
  }

  // Fallback (unknown fitStatus)
  return {
    priority: 'low',
    reason: 'Unzureichende Informationen – Passgenauigkeit und Bedarf unklar.',
    fitStatus,
    needStatus,
    willingness,
  };
}

// ---------------------------------------------------------------------------
// refreshLeadPriority — loads from DB, computes, writes back
// ---------------------------------------------------------------------------

export async function refreshLeadPriority(leadId: string): Promise<PriorityResult> {
  // Lazy import to avoid circular deps and allow pure unit use of computePriority
  const { getDb } = await import('@/lib/db');
  const {
    toLead,
    toLeadTrigger,
    toLeadContext,
    toBantClaim,
    toCampaign,
  } = await import('@/lib/mappers');
  type LeadRow2 = import('@/lib/mappers').LeadRow;
  type LeadTriggerRow2 = import('@/lib/mappers').LeadTriggerRow;
  type LeadContextRow2 = import('@/lib/mappers').LeadContextRow;
  type BantClaimRow2 = import('@/lib/mappers').BantClaimRow;
  type CampaignRow2 = import('@/lib/mappers').CampaignRow;

  const db = getDb();

  // Load lead
  const { data: leadRow, error: leadErr } = await db
    .from('lead')
    .select('*')
    .eq('id', leadId)
    .single();
  if (leadErr || !leadRow) {
    throw new Error(`refreshLeadPriority: lead ${leadId} not found`);
  }
  const lead = toLead(leadRow as LeadRow2);

  // Load triggers
  const { data: triggerRows } = await db
    .from('lead_trigger')
    .select('*')
    .eq('lead_id', leadId);
  const triggers = (triggerRows ?? []).map((r) => toLeadTrigger(r as LeadTriggerRow2));

  // Load context
  const { data: contextRows } = await db
    .from('lead_context')
    .select('*')
    .eq('lead_id', leadId)
    .order('occurred_at', { ascending: true });
  const context = (contextRows ?? []).map((r) => toLeadContext(r as LeadContextRow2));

  // Load BANT claims
  const { data: bantRows } = await db
    .from('bant_claim')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });
  const bant = (bantRows ?? []).map((r) => toBantClaim(r as BantClaimRow2));

  // Load active campaign
  const { data: campaignRow } = await db
    .from('campaign')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  const campaign = campaignRow ? toCampaign(campaignRow as CampaignRow2) : null;

  // Compute
  const result = computePriority({ lead, triggers, context, bant, campaign });

  // Write back
  const { error: updateErr } = await db
    .from('lead')
    .update({
      priority: result.priority,
      priority_reason: result.reason,
      fit_status: result.fitStatus,
      need_status: result.needStatus,
      willingness: result.willingness,
    })
    .eq('id', leadId);

  if (updateErr) {
    console.error('refreshLeadPriority: write failed', updateErr);
  }

  return result;
}
