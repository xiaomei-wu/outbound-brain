import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon,
  PhoneCallIcon,
  BuildingIcon,
  UserIcon,
  TriangleAlertIcon,
  BanIcon,
} from 'lucide-react';
import type {
  BantClaim,
  BantDimension,
  CallLog,
  ClaimStatus,
  CompanyCheck,
  Decision,
  EvidenceSource,
  Lead,
  LeadContext,
  LeadEvent,
  LeadTrigger,
} from '@/lib/types';
import { getDb } from '@/lib/db';
import {
  toCallLog,
  toDecision,
  toLead,
  toLeadEvent,
  toLeadTrigger,
  type CallLogRow,
  type DecisionRow,
  type LeadEventRow,
  type LeadRow,
  type LeadTriggerRow,
} from '@/lib/mappers';
import { getCredentials } from '@/lib/connectors';
import { getCompanyCheck } from '@/lib/company-checks';
import { routeForScore } from '@/lib/icp/routing';
import { DbError } from '@/components/db-error';
import { AnalysisPanel } from '@/components/analysis-panel';
import { RetryAnalysisButton } from '@/components/retry-analysis-button';
import { BriefingPanel } from '@/components/briefing-panel';
import { OutcomeButtons } from '@/components/outcome-buttons';
import { PhoneInput } from '@/components/phone-input';
import { PhoneLookup } from '@/components/phone-lookup';
import { PasteChat } from '@/components/paste-chat';
import { EventTimeline } from '@/components/event-timeline';
import { SlackFallbackCard } from '@/components/slack-fallback-card';
import { PriorityBadge } from '@/components/priority-badge';
import { OriginBadge } from '@/components/origin-badge';
import { PhoneBadge } from '@/components/phone-badge';
import { ReplyBadge } from '@/components/reply-badge';
import { EngagementBadge } from '@/components/engagement-badge';
import { IcpStatusChip } from '@/components/icp-status-chip';
import { ReplyPanel } from '@/components/reply-panel';
import { IcpPanel, IcpCheckButton } from '@/components/icp-panel';
import { SyncIndicator } from '@/components/sync-indicator';
import { isIcpActive } from '@/lib/icp/status';
import { CallCard } from '@/components/call-card';

// ---------------------------------------------------------------------------
// Local row types
// ---------------------------------------------------------------------------

interface LeadContextRow {
  id: string;
  lead_id: string;
  kind: string;
  author: string;
  content: string;
  occurred_at: string;
  source_url: string | null;
}

interface BantClaimRow {
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

function toLeadContextLocal(row: LeadContextRow): LeadContext {
  return {
    id: row.id,
    leadId: row.lead_id,
    kind: row.kind as LeadContext['kind'],
    author: row.author as LeadContext['author'],
    content: row.content,
    occurredAt: row.occurred_at,
    sourceUrl: row.source_url,
  };
}

function toBantClaimLocal(row: BantClaimRow): BantClaim {
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

// ---------------------------------------------------------------------------
// Props & data fetching
// ---------------------------------------------------------------------------

interface LeadPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = 'force-dynamic';

interface LeadPageData {
  lead: Lead;
  triggers: LeadTrigger[];
  contexts: LeadContext[];
  bantClaims: BantClaim[];
  events: LeadEvent[];
  callLogs: CallLog[];
  decisions: Decision[];
  companyCheck: CompanyCheck | null;
  hasLusha: boolean;
  hasBlitz: boolean;
  hasAiArk: boolean;
}

async function fetchLeadData(id: string): Promise<LeadPageData | null | 'error'> {
  try {
    const db = getDb();
    const [leadRes, trigRes, ctxRes, bantRes, eventRes, callRes, decRes] =
      await Promise.all([
        db.from('lead').select('*').eq('id', id).single(),
        db.from('lead_trigger').select('*').eq('lead_id', id).order('offer_relevance', { ascending: false }),
        db.from('lead_context').select('*').eq('lead_id', id).order('occurred_at', { ascending: false }),
        db.from('bant_claim').select('*').eq('lead_id', id),
        db.from('lead_event').select('*').eq('lead_id', id).order('occurred_at', { ascending: false }),
        db.from('call_log').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
        db.from('decision').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
      ]);

    if (leadRes.error && leadRes.error.code !== 'PGRST116') return 'error';
    if (!leadRes.data) return null;

    const lead = toLead(leadRes.data as LeadRow);

    const [companyCheck, lushaCreds, blitzCreds, aiArkCreds] = await Promise.all([
      getCompanyCheck(lead.companyKey),
      getCredentials('lusha'),
      getCredentials('blitz'),
      getCredentials('ai_ark'),
    ]);

    return {
      lead,
      triggers: ((trigRes.data ?? []) as LeadTriggerRow[]).map(toLeadTrigger),
      contexts: ((ctxRes.data ?? []) as LeadContextRow[]).map(toLeadContextLocal),
      bantClaims: ((bantRes.data ?? []) as BantClaimRow[]).map(toBantClaimLocal),
      events: ((eventRes.data ?? []) as LeadEventRow[]).map(toLeadEvent),
      callLogs: ((callRes.data ?? []) as CallLogRow[]).map(toCallLog),
      decisions: ((decRes.data ?? []) as DecisionRow[]).map(toDecision),
      companyCheck,
      hasLusha: lushaCreds != null,
      hasBlitz: blitzCreds != null,
      hasAiArk: aiArkCreds != null,
    };
  } catch {
    return 'error';
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function LeadPage({ params, searchParams }: LeadPageProps) {
  const { id } = await params;
  const sp = await searchParams;

  const data = await fetchLeadData(id);
  if (data === 'error') return <DbError />;
  if (!data) notFound();

  const { lead, triggers, contexts, events, callLogs, decisions, companyCheck, hasLusha, hasBlitz, hasAiArk } = data;

  const hasTestEvents = events.some((e) => e.isTest);
  const slackFailed = sp.slack_failed === '1';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  // ICP routing info
  const routeInfo = companyCheck ? routeForScore(companyCheck.score) : null;

  // Role-match: if company is A/B and role clearly doesn't match → add wrong_contact suggestion.
  // icpRoles not loaded server-side here; roleMatches(role, []) always returns true (empty list = no mismatch).
  // The IcpPanel receives routeInfo.suggested which already contains role-based hints from scheduleIcpChecks.

  // Show phone lookup when: no phone, score A or B, has a phone tool
  const showPhoneLookup =
    !lead.phone &&
    companyCheck != null &&
    (companyCheck.score === 'A' || companyCheck.score === 'B');

  // Sort triggers: active first, then by verdict
  const sortedTriggers = [...triggers].sort((a, b) => {
    const activeA = a.isActive !== false ? 0 : 1;
    const activeB = b.isActive !== false ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    const order = { strong: 0, usable: 1, reject: 2 } as const;
    return order[a.verdict] - order[b.verdict];
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* TEST banner */}
      {hasTestEvents && (
        <div className="flex items-center gap-2 px-6 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
          <TriangleAlertIcon className="h-4 w-4 text-amber-700 shrink-0" />
          <span className="text-sm font-medium text-amber-800">
            TEST-Modus aktiv – mindestens ein Ereignis auf diesem Lead wurde manuell simuliert.
          </span>
        </div>
      )}

      {/* DNC warning banner */}
      {lead.phoneDnc && (
        <div className="flex items-center gap-2 px-6 py-2 bg-destructive/10 border-b border-destructive/30 shrink-0">
          <BanIcon className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-sm font-medium text-destructive">
            Nicht anrufen (DNC-Kennzeichen) — diese Nummer ist als Do Not Call markiert.
          </span>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ================================================================
            LEFT COLUMN — Vor dem Gespräch
            ================================================================ */}
        <div
          className="flex flex-col border-r border-border overflow-hidden"
          style={{ width: '58%' }}
        >
          {/* Lead header */}
          <div className="px-6 py-4 border-b border-border/60 shrink-0 bg-card">
            <div className="flex items-start gap-3">
              <Link
                href="/"
                className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Zurück zur Liste"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                Heute
              </Link>

              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <PriorityBadge priority={lead.priority} />

                  <h1 className="text-base font-semibold text-foreground">{lead.name}</h1>

                  {/* Origin badge in header */}
                  <OriginBadge origin={lead.origin} detail={lead.originDetail} />
                  <PhoneBadge phone={lead.phone} source={lead.phoneSource} dnc={lead.phoneDnc} />
                  <ReplyBadge signal={lead.replySignal} />
                  <IcpStatusChip lead={lead} />
                  <EngagementBadge stage={lead.engagementStage} hasReplySignal={Boolean(lead.replySignal && lead.replySignal !== 'neutral')} />
                  {lead.needleSyncedAt && (
                    <span className="text-[10px] text-muted-foreground" title="ICP-Ergebnis als Lead-Eigenschaften in Needle hinterlegt (test_company_qualified / test_person_qualified)">
                      ICP an Needle übertragen
                    </span>
                  )}

                  {lead.role && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <UserIcon className="h-3 w-3" />
                      {lead.role}
                    </span>
                  )}
                  {lead.company && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BuildingIcon className="h-3 w-3" />
                      {lead.company}
                      {lead.companySize ? ` · ${lead.companySize} MA` : ''}
                    </span>
                  )}
                  {lead.region && (
                    <span className="text-xs text-muted-foreground">{lead.region}</span>
                  )}
                </div>

                {lead.priorityReason && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lead.priorityReason}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Left column section label */}
          <div className="px-6 pt-3 pb-1 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Vor dem Gespräch
            </p>
          </div>

          {/* Scrollable: ICP panel + brief + triggers */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* The contact's own written reply (Needle LinkedIn or pasted chat) */}
            {lead.replySignal && lead.replySignal !== 'neutral' && (
              <div className="mb-5">
                <ReplyPanel
                  leadId={lead.id}
                  signal={lead.replySignal}
                  quote={lead.replyQuote}
                  reason={lead.replyReason}
                  at={lead.replyAt}
                  sortoutStatus={lead.sortoutStatus}
                />
              </div>
            )}

            {/* ICP panel (above the existing brief) */}
            {companyCheck && routeInfo ? (
              <div className="mb-5">
                <IcpPanel
                  check={companyCheck}
                  routeInfo={routeInfo}
                  leadId={lead.id}
                  sortoutStatus={lead.sortoutStatus}
                  sortoutSyncedNeedle={lead.sortoutSyncedNeedle}
                />
              </div>
            ) : (
              <div className="mb-5">
                {isIcpActive(lead, new Date()) ? (
                  <SyncIndicator active={1} failed={0} />
                ) : (
                  <IcpCheckButton leadId={lead.id} />
                )}
              </div>
            )}

            {/* Call card (A/B only) — rendered from lead.callCard if present */}
            {lead.callCard && companyCheck && (companyCheck.score === 'A' || companyCheck.score === 'B') && (
              <div className="mb-5">
                <CallCard card={lead.callCard} />
              </div>
            )}

            <BriefingPanel
              leadId={lead.id}
              brief={lead.cachedBrief}
              triggers={sortedTriggers}
              contexts={contexts}
            />

            <section className="mt-6 flex flex-col gap-2 border-t border-border/40 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kontext ergänzen
              </h2>
              <PasteChat leadId={lead.id} leadName={lead.name} />
            </section>

            {(events.length > 0 || decisions.length > 0) && (
              <section className="mt-6 flex flex-col gap-2 border-t border-border/40 pt-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Signale &amp; Entscheidungen
                </h2>
                <EventTimeline events={events} decisions={decisions} />
              </section>
            )}
          </div>
        </div>

        {/* ================================================================
            RIGHT COLUMN — Gespräch
            ================================================================ */}
        <div
          className="flex flex-col overflow-y-auto px-6 py-5 gap-5"
          style={{ width: '42%' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground -mb-2">
            Gespräch
          </p>

          {/* === Phone / Call Now === */}
          <section className="flex flex-col gap-2">
            {lead.phone ? (
              <>
                {/* DNC blocks the call button */}
                {lead.phoneDnc ? (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <BanIcon className="h-4 w-4 shrink-0" />
                    Nicht anrufen (DNC-Kennzeichen)
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <a
                      href={`tel:${lead.phone}`}
                      className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-85 transition-opacity"
                    >
                      <PhoneCallIcon className="h-4 w-4" />
                      Jetzt anrufen
                    </a>
                    <span className="text-sm font-mono text-muted-foreground">{lead.phone}</span>
                    {lead.phoneSource && (
                      <span className="text-xs text-muted-foreground">via {lead.phoneSource}</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <PhoneInput leadId={lead.id} />
                <PhoneLookup
                  leadId={lead.id}
                  hasLusha={hasLusha}
                  hasBlitz={hasBlitz}
                  hasAiArk={hasAiArk}
                  chainTried={lead.phoneLookupAt !== null}
                  visible={showPhoneLookup}
                />
              </>
            )}
          </section>

          {/* === Consent line === */}
          {lead.cachedBrief?.consentLine && (
            <section className="flex flex-col gap-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Einwilligungstext (§ 201 StGB)
              </h2>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900 leading-relaxed">{lead.cachedBrief.consentLine}</p>
              </div>
            </section>
          )}

          {/* === Meeting slots === */}
          {lead.cachedBrief?.meetingSlots && lead.cachedBrief.meetingSlots.length > 0 && (
            <section className="flex flex-col gap-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Terminvorschläge
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">Vorschlag – Verfügbarkeit bestätigen</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {lead.cachedBrief.meetingSlots.map((slot) => (
                  <span
                    key={slot}
                    className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground cursor-default select-none hover:bg-muted transition-colors"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </section>
          )}

          <div className="border-t border-border/60" />

          {/* === Outcome === */}
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gesprächsergebnis
            </h2>
            <OutcomeButtons leadId={lead.id} triggers={sortedTriggers} />
          </section>

          {/* === Previous call logs === */}
          {callLogs.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Frühere Gespräche
              </h2>
              <div className="flex flex-col gap-2">
                {callLogs.map((log, index) => (
                  <PreviousCallLog
                    key={log.id}
                    log={log}
                    leadId={lead.id}
                    triggers={sortedTriggers}
                    defaultOpen={index === 0}
                  />
                ))}
              </div>
            </section>
          )}

          {/* === Slack fallback === */}
          {slackFailed && lead.cachedBrief && (
            <section className="flex flex-col gap-2">
              <SlackFallbackCard brief={lead.cachedBrief} lead={lead} appUrl={appUrl} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PreviousCallLogProps {
  log: CallLog;
  leadId: string;
  triggers: LeadTrigger[];
  defaultOpen: boolean;
}

function PreviousCallLog({ log, leadId, triggers, defaultOpen }: PreviousCallLogProps) {
  const outcomeLabels: Record<CallLog['outcome'], string> = {
    booked: 'Gebucht',
    not_booked: 'Nicht gebucht',
    not_now: 'Nicht jetzt',
    opt_out: 'Opt-out',
  };
  const outcomeColors: Record<CallLog['outcome'], string> = {
    booked: 'text-emerald-700',
    not_booked: 'text-zinc-600',
    not_now: 'text-amber-700',
    opt_out: 'text-destructive',
  };

  return (
    <details
      open={defaultOpen}
      className="group rounded-md border border-border bg-card px-3 py-2 flex flex-col gap-1"
    >
      <summary className="flex items-center gap-2 flex-wrap cursor-pointer list-none">
        <span className={`text-xs font-semibold ${outcomeColors[log.outcome]}`}>
          {outcomeLabels[log.outcome]}
        </span>
        {log.demoReady && (
          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 rounded px-1.5 py-0.5">
            Demo-ready
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date(log.createdAt).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short' })}
        </span>
        <span className="text-[11px] text-muted-foreground group-open:hidden">
          {log.analysis ? 'Auswertung anzeigen' : 'Auswertung fehlt'}
        </span>
      </summary>
      {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
      {log.sellerAction && (
        <p className="text-[11px] text-muted-foreground italic">
          Seller: {log.sellerReason ?? log.sellerAction}
        </p>
      )}
      {log.analysis ? (
        <div className="pt-3">
          <AnalysisPanel evaluation={log.analysis} callLog={log} leadId={leadId} triggers={triggers} />
        </div>
      ) : (
        <div className="pt-2">
          <RetryAnalysisButton leadId={leadId} callLogId={log.id} />
        </div>
      )}
    </details>
  );
}
