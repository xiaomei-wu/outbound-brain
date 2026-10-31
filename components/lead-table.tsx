'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from 'cn';
import { toast } from 'sonner';
import {
  Loader2Icon,
  UsersIcon,
  SearchIcon,
  PhoneIcon,
  MessageCircleIcon,
  SendIcon,
  FileTextIcon,
  RotateCcwIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { SimulateEvent } from '@/components/simulate-event';
import { PriorityBadge } from '@/components/priority-badge';
import { OriginBadge } from '@/components/origin-badge';
import { PhoneBadge } from '@/components/phone-badge';
import { ReplyBadge } from '@/components/reply-badge';
import { EngagementBadge } from '@/components/engagement-badge';
import { compareLeads, countBySource, filterBySource, hasTouchpoint, SOURCE_ORDER, sortLeadsBy, type SortMode, type SourceFilter } from '@/lib/lead-ranking';
import { originLabel } from '@/lib/origin';
import { IcpStatusChip } from '@/components/icp-status-chip';
import { LeadSources } from '@/components/lead-sources';
import type { FindResult } from '@/lib/lead-find';
import type {
  FitStatus,
  Lead,
  LeadTrigger,
  NeedStatus,
  WillingnessStatus,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Outer tab: view selector
// ---------------------------------------------------------------------------

type OuterTab = 'real' | 'sortout' | 'demo';

// ---------------------------------------------------------------------------
// Inner tab: priority/status filter within real leads
// ---------------------------------------------------------------------------

type InnerTab = 'heute' | 'in_kontakt' | 'antworten' | 'mit_nummer' | 'pruefen' | 'spaeter' | 'gestoppt';

const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: 'heute', label: 'Heute' },
  { id: 'in_kontakt', label: 'In Kontakt' },
  { id: 'antworten', label: 'Antworten' },
  { id: 'mit_nummer', label: 'Mit Nummer' },
  { id: 'pruefen', label: 'Prüfen' },
  { id: 'spaeter', label: 'Später' },
  { id: 'gestoppt', label: 'Gestoppt' },
];

const ACTIVE_STATUSES: Lead['status'][] = ['new', 'researched', 'briefed', 'calling'];

/** Background work starts after the response; one later refresh shows its progress. */
const BACKGROUND_REFRESH_MS = 2500;

// ---------------------------------------------------------------------------
// Priority sort helpers
// ---------------------------------------------------------------------------

/** Touchpoints first (lib/lead-ranking.ts), then ICP priority, callable, call requests, fit. */
function sortLeads(leads: Lead[]): Lead[] {
  return [...leads].sort(compareLeads);
}

function filterInner(leads: Lead[], tab: InnerTab): Lead[] {
  switch (tab) {
    case 'heute':
      return leads.filter(
        (l) => ACTIVE_STATUSES.includes(l.status) && l.priority !== 'review'
      );
    case 'in_kontakt':
      return leads.filter((l) => l.engagementStage !== null);
    case 'antworten':
      return leads.filter((l) => l.replySignal && l.replySignal !== 'neutral');
    case 'mit_nummer':
      return leads.filter((l) => l.phone && !l.phoneDnc && ACTIVE_STATUSES.includes(l.status));
    case 'pruefen':
      return leads.filter((l) => l.priority === 'review' && l.status !== 'stopped');
    case 'spaeter':
      return leads.filter(
        (l) => (l.status === 'called' || l.status === 'paused') && l.priority !== 'review'
      );
    case 'gestoppt':
      return leads.filter((l) => l.status === 'stopped');
  }
}

// ---------------------------------------------------------------------------
// Dimension chip helpers
// ---------------------------------------------------------------------------

const FIT_CONFIG: Record<FitStatus, { label: string; chip: string }> = {
  fits:    { label: 'Passt',      chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  partial: { label: 'Teilweise',  chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  outside: { label: 'Außerhalb',  chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  unknown: { label: 'Fit?',       chip: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200' },
};

const NEED_WILLINGNESS_CHIP = (
  need: NeedStatus,
  willingness: WillingnessStatus
): { label: string; chip: string } => {
  if (willingness === 'requested')
    return { label: 'Gespräch vereinbart', chip: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' };
  if (need === 'expressed')
    return { label: 'Bedarf geäußert', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
  if (need === 'hypothesis')
    return { label: 'Bedarf Hypothese', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
  if (willingness === 'declined')
    return { label: 'Abgelehnt', chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' };
  return { label: 'Bedarf?', chip: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200' };
};

function triggerChip(trigger: LeadTrigger | null): { label: string; chip: string } {
  if (!trigger || trigger.isActive === false)
    return { label: 'Kein Trigger', chip: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200' };
  if (trigger.verdict === 'strong')
    return { label: 'Starker Trigger', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
  if (trigger.verdict === 'usable')
    return { label: 'Trigger vorhanden', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
  return { label: 'Trigger schwach', chip: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200' };
}

function deriveOpenAction(lead: Lead): string {
  if (lead.status === 'stopped') return 'Gestoppt';
  if (lead.willingness === 'requested') return 'Gespräch vereinbart · Termin bestätigen';
  if (lead.willingness === 'declined') return 'Abgelehnt · Opt-out respektieren';
  switch (lead.priority) {
    case 'high':   return lead.role ? 'Anruf vorbereiten' : 'Rolle klären · Anruf vorbereiten';
    case 'medium': return 'Bedarf erkunden · Kanal prüfen';
    case 'low':    return 'Kontext ergänzen';
    case 'review': return 'Ausnahme-Queue · Nicht priorisieren';
  }
}

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat', call: 'Gespräch', public: 'Öffentlich', seller: 'Notiz',
};

const SORTOUT_LABEL: Record<string, string> = {
  not_a_fit:     'Kein Zielkunde',
  wrong_contact: 'Falscher Ansprechpartner',
  not_now:       'Nicht jetzt',
  opt_out:       'Opt-out',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LeadTableProps {
  leads: Lead[];
  triggersMap: Record<string, LeadTrigger | null>;
  /** lead id → ICP score, for sorting by ICP */
  icpScores: Record<string, string>;
  /** The Needle campaign sends messages: enrolling means outreach (confirm first). */
  needleSends: boolean;
  hasNeedle: boolean;
  hasBlitz: boolean;
  hasAiArk: boolean;
}

export function LeadTable({ leads, triggersMap, icpScores, needleSends, hasNeedle, hasBlitz, hasAiArk }: LeadTableProps) {
  const router = useRouter();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [outerTab, setOuterTab] = useState<OuterTab>('real');
  const [innerTab, setInnerTab] = useState<InnerTab>('heute');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showFindDialog, setShowFindDialog] = useState(false);
  const [findResults, setFindResults] = useState<FindResult[] | null>(null);

  const [isFindingLeads, startFindLeads] = useTransition();
  const [isResearchingAll, startResearchAll] = useTransition();
  const [isGeneratingBriefs, startGenerateBriefs] = useTransition();
  const [isResetting, startReset] = useTransition();
  const [isFindingPhones, startFindPhones] = useTransition();
  const [isSyncingReplies, startSyncReplies] = useTransition();
  const [isSendingToNeedle, startSendToNeedle] = useTransition();

  // Partition leads into three views
  const realLeads   = leads.filter((l) => !l.isTest && l.sortoutStatus === null);
  const sortedOut   = leads.filter((l) => l.sortoutStatus !== null);
  const demoLeads   = leads.filter((l) => l.isTest);

  const sourceCounts = countBySource(realLeads);
  const sorted = sortLeadsBy(filterBySource(realLeads, sourceFilter), sortMode, new Map(Object.entries(icpScores)));
  const filteredInner = outerTab === 'real' ? filterInner(sorted, innerTab) : [];

  const topLead = outerTab === 'real' && innerTab === 'heute' ? filteredInner[0] ?? null : null;

  // ---- Actions ----

  function handleFindLeads() {
    setShowFindDialog(true);
    setFindResults(null);
    startFindLeads(async () => {
      try {
        const res = await fetch('/api/leads/find', { method: 'POST' });
        const data: { results?: FindResult[]; error?: string } = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? 'Lead-Import fehlgeschlagen.');
          setShowFindDialog(false);
          return;
        }
        setFindResults(data.results ?? null);
        router.refresh();
        // ICP checks start right after the response; refresh again to show their progress
        setTimeout(() => router.refresh(), BACKGROUND_REFRESH_MS);
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
        setShowFindDialog(false);
      }
    });
  }

  /**
   * Needle searches LinkedIn for new people; after their ICP check the A/B ones enter the
   * campaign. The click is the approval; a sending campaign asks for confirmation first.
   */
  function handleSendToNeedle() {
    if (
      needleSends &&
      !window.confirm(
        'Die Needle-Kampagne versendet Nachrichten. Neue A/B-Leads aus der Suche werden nach dem ICP-Check aufgenommen und kontaktiert. Fortfahren?',
      )
    ) {
      return;
    }
    startSendToNeedle(async () => {
      try {
        const res = await fetch('/api/needle/search-leads', { method: 'POST' });
        const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? 'Aufnahme in die Needle-Kampagne fehlgeschlagen.');
          return;
        }
        toast.info(data.message ?? 'Erledigt.');
        router.refresh();
        setTimeout(() => router.refresh(), BACKGROUND_REFRESH_MS);
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
      }
    });
  }

  /** Pulls LinkedIn replies from Needle (fallback for the webhook) and re-ranks those leads. */
  function handleSyncReplies() {
    startSyncReplies(async () => {
      try {
        const res = await fetch('/api/leads/sync-replies', { method: 'POST' });
        const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? 'Antworten konnten nicht abgerufen werden.');
          return;
        }
        toast.info(data.message ?? 'Antworten abgerufen.');
        router.refresh();
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
      }
    });
  }

  /** Searches numbers for all A/B leads via AI Ark / BlitzAPI; Lusha stays a per-lead last resort. */
  function handleFindPhones() {
    startFindPhones(async () => {
      try {
        const res = await fetch('/api/leads/phone-lookup-all', { method: 'POST' });
        const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? 'Nummernsuche fehlgeschlagen.');
          return;
        }
        toast.info(data.message ?? 'Nummernsuche abgeschlossen.');
        router.refresh();
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
      }
    });
  }

  /** Starts ICP checks for up to 10 unchecked companies; results arrive in the background. */
  function handleIcpChecks() {
    startResearchAll(async () => {
      try {
        const res = await fetch('/api/leads/icp-check-open', { method: 'POST' });
        const data: { scheduled?: number; error?: string } = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? 'ICP-Checks konnten nicht gestartet werden.');
          return;
        }
        toast.info(
          data.scheduled
            ? `${data.scheduled} Firmen werden geprüft — Ergebnisse erscheinen in einigen Minuten.`
            : 'Alle Firmen sind bereits geprüft.',
        );
        setTimeout(() => router.refresh(), BACKGROUND_REFRESH_MS);
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
      }
    });
  }

  function handleGenerateBriefs() {
    const toGenerate = leads.filter((l) => l.status === 'researched' && !l.cachedBrief);
    if (toGenerate.length === 0) {
      toast.info('Für alle recherchierten Leads existieren bereits Briefings.');
      return;
    }
    startGenerateBriefs(async () => {
      let done = 0;
      for (const lead of toGenerate) {
        try {
          const res = await fetch(`/api/leads/${lead.id}/brief`, { method: 'POST' });
          if (res.ok) done++;
        } catch { /* continue */ }
      }
      toast.success(`Briefings erstellt: ${done} von ${toGenerate.length} Leads.`);
      router.refresh();
    });
  }

  function handleReset() {
    startReset(async () => {
      try {
        const res = await fetch('/api/seed', { method: 'POST' });
        if (!res.ok) { toast.error('Demo-Reset fehlgeschlagen.'); return; }
        setShowResetDialog(false);
        router.refresh();
        toast.success('Demo-Daten wurden zurückgesetzt.');
      } catch {
        toast.error('Verbindungsfehler.');
      }
    });
  }

  const anyBusy = isFindingLeads || isResearchingAll || isGeneratingBriefs || isResetting || isFindingPhones || isSyncingReplies || isSendingToNeedle;

  return (
    <div className="flex flex-col h-full">
      {/* ---- Action bar ---- */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 border-b border-border/40 bg-muted/10 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleFindLeads}
          disabled={anyBusy}
          className="text-xs"
        >
          {isFindingLeads ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <UsersIcon className="h-3 w-3" />}
          Leads finden
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleIcpChecks}
          disabled={anyBusy}
          className="text-xs"
        >
          {isResearchingAll ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <SearchIcon className="h-3 w-3" />}
          Offene ICP-Checks starten
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleFindPhones}
          disabled={anyBusy}
          className="text-xs"
          title="AI Ark / BlitzAPI für alle A/B-Leads ohne Nummer; Lusha nur einzeln im Lead"
        >
          {isFindingPhones ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <PhoneIcon className="h-3 w-3" />}
          Nummern suchen
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncReplies}
          disabled={anyBusy}
          className="text-xs"
          title="LinkedIn-Antworten aus Needle holen (kommen sonst automatisch per Webhook)"
        >
          {isSyncingReplies ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <MessageCircleIcon className="h-3 w-3" />}
          Antworten abrufen
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSendToNeedle}
          disabled={anyBusy || !hasNeedle}
          className="text-xs"
          title="Needle sucht auf LinkedIn neue Projektentwickler (Deutschland). Nach dem ICP-Check kommen die A/B-Leads in die Needle-Kampagne."
        >
          {isSendingToNeedle ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <SendIcon className="h-3 w-3" />}
          Neue Leads über Needle
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateBriefs}
          disabled={anyBusy}
          className="text-xs"
        >
          {isGeneratingBriefs ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <FileTextIcon className="h-3 w-3" />}
          Briefings erstellen
        </Button>

        {demoLeads.length > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SimulateEvent
            leads={leads.map((l) => ({ id: l.id, name: l.name, company: l.company }))}
            onEventFired={() => router.refresh()}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            disabled={anyBusy}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            {isResetting ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <RotateCcwIcon className="h-3 w-3" />}
            Demo zurücksetzen
          </Button>
        </div>
        )}
      </div>

      {/* ---- Outer tabs ---- */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-border/30">
        <OuterTabBtn id="real"    label="Echte Leads"   count={realLeads.length}  active={outerTab} onSelect={setOuterTab} />
        <OuterTabBtn id="sortout" label="Aussortiert"   count={sortedOut.length}  active={outerTab} onSelect={setOuterTab} />
        {demoLeads.length > 0 && (
          <OuterTabBtn id="demo"    label="Demo (TEST)"   count={demoLeads.length}  active={outerTab} onSelect={setOuterTab} />
        )}
      </div>

      {/* ---- Inner tabs (Echte Leads only) ---- */}
      {outerTab === 'real' && realLeads.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-4 sm:px-6 pt-3 pb-0">
          {INNER_TABS.map((tab) => {
            const count = filterInner(sorted, tab.id).length;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInnerTab(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm transition-colors',
                  innerTab === tab.id
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {tab.label}
                <span className={cn('ml-1.5 text-[11px] tabular-nums', innerTab === tab.id ? 'text-background/70' : 'text-muted-foreground')}>
                  {count}
                </span>
              </button>
            );
          })}

          {/* Source filter and sort */}
          <div className="ml-auto flex flex-wrap items-center gap-2 py-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Quelle
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="all">Alle ({realLeads.length})</option>
                {SOURCE_ORDER.filter((origin) => sourceCounts[origin]).map((origin) => (
                  <option key={origin} value={origin}>
                    {originLabel(origin, null)} ({sourceCounts[origin]})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Sortierung
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="recommended">Empfohlen</option>
                <option value="source">Nach Quelle</option>
                <option value="icp">Nach ICP-Score</option>
                <option value="newest">Neueste zuerst</option>
                <option value="company">Firma A–Z</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {/* ---- Top-lead priority reason (Heute + real) ---- */}
      {topLead?.priorityReason && (
        <p className="px-6 pt-3 text-sm text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">{topLead.name}</span>{' '}
          &mdash; {topLead.priorityReason}
        </p>
      )}

      {/* ---- Content ---- */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {outerTab === 'real' && (
          realLeads.length === 0
            ? <RealEmptyState hasNeedle={hasNeedle} hasBlitz={hasBlitz} hasAiArk={hasAiArk} onDemoClick={demoLeads.length > 0 ? () => setOuterTab('demo') : undefined} />
            : filteredInner.length === 0
              ? <p className="py-8 text-center text-sm text-muted-foreground">Keine Leads in dieser Ansicht.</p>
              : (
                <div className="flex flex-col gap-1">
                  {filteredInner.map((lead, idx) => {
                    const bestTrigger = triggersMap[lead.id] ?? null;
                    const whyNow = bestTrigger?.content ?? lead.cachedBrief?.whyNow ?? null;
                    const sourceKind = bestTrigger?.evidenceKind ? (SOURCE_LABELS[bestTrigger.evidenceKind] ?? null) : null;
                    return (
                      <LeadRow
                        key={lead.id}
                        lead={lead}
                        trigger={bestTrigger}
                        whyNow={whyNow}
                        sourceKind={sourceKind}
                        isTop={idx === 0}
                      />
                    );
                  })}
                </div>
              )
        )}

        {outerTab === 'sortout' && (
          sortedOut.length === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">Keine aussortierten Leads.</p>
            : (
              <div className="flex flex-col gap-1">
                {sortLeads(sortedOut).map((lead) => (
                  <SortedOutRow key={lead.id} lead={lead} />
                ))}
              </div>
            )
        )}

        {outerTab === 'demo' && (
          demoLeads.length === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">Keine Demo-Daten vorhanden.</p>
            : (
              <div className="flex flex-col gap-1">
                {sortLeads(demoLeads).map((lead) => {
                  const bestTrigger = triggersMap[lead.id] ?? null;
                  const whyNow = bestTrigger?.content ?? lead.cachedBrief?.whyNow ?? null;
                  const sourceKind = bestTrigger?.evidenceKind ? (SOURCE_LABELS[bestTrigger.evidenceKind] ?? null) : null;
                  return (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      trigger={bestTrigger}
                      whyNow={whyNow}
                      sourceKind={sourceKind}
                      isTop={false}
                    />
                  );
                })}
              </div>
            )
        )}
      </div>

      {/* ---- Reset dialog ---- */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Demo zurücksetzen?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Alle Daten werden gelöscht und durch die Demo-Daten ersetzt. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)} disabled={isResetting}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => void handleReset()} disabled={isResetting}>
              {isResetting && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Zurücksetzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Find dialog ---- */}
      <Dialog open={showFindDialog} onOpenChange={setShowFindDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Leads finden</DialogTitle></DialogHeader>
          {isFindingLeads ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Lead-Quellen werden abgefragt…</span>
            </div>
          ) : findResults !== null ? (
            <div className="flex flex-col gap-2 py-2">
              {findResults.map((r) => (
                <div key={r.source} className="flex items-center gap-2 text-sm">
                  <span className={r.ok ? 'text-emerald-600' : 'text-muted-foreground'}>
                    {r.ok ? '✓' : '–'}
                  </span>
                  <span>{r.message}</span>
                </div>
              ))}
            </div>
          ) : null}
          {!isFindingLeads && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFindDialog(false)}>Schließen</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outer tab button
// ---------------------------------------------------------------------------

function OuterTabBtn({
  id, label, count, active, onSelect,
}: {
  id: OuterTab;
  label: string;
  count: number;
  active: OuterTab;
  onSelect: (t: OuterTab) => void;
}) {
  const isActive = active === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        'px-3 py-1.5 rounded-t-md text-sm transition-colors border-b-2',
        isActive
          ? 'border-foreground text-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {label}
      <span className={cn('ml-1.5 text-[11px] tabular-nums', isActive ? 'text-foreground/70' : 'text-muted-foreground')}>
        {count}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Lead row (real + demo tabs)
// ---------------------------------------------------------------------------

interface LeadRowProps {
  lead: Lead;
  trigger: LeadTrigger | null;
  whyNow: string | null;
  sourceKind: string | null;
  isTop: boolean;
}

function LeadRow({ lead, trigger, whyNow, sourceKind, isTop }: LeadRowProps) {
  const fitCfg  = FIT_CONFIG[lead.fitStatus ?? 'unknown'];
  const trigCfg = triggerChip(trigger);
  const needCfg = NEED_WILLINGNESS_CHIP(lead.needStatus ?? 'unknown', lead.willingness ?? 'unknown');
  const openAction = deriveOpenAction(lead);

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={cn(
        'group flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50',
        isTop ? 'border-foreground/20 bg-card shadow-sm' : 'border-border/50 bg-background',
        // Real touchpoint with the person: marked with a coloured edge
        hasTouchpoint(lead) && 'border-l-4 border-l-sky-500'
      )}
    >
      <div className="shrink-0 pt-0.5">
        <PriorityBadge priority={lead.priority} />
      </div>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{lead.name}</span>
          {lead.role && <span className="text-xs text-muted-foreground">{lead.role}</span>}
          {lead.company && <span className="text-xs text-muted-foreground">· {lead.company}</span>}
        </div>

        {/* Origin + phone badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <OriginBadge origin={lead.origin} detail={lead.originDetail} />
          <PhoneBadge phone={lead.phone} source={lead.phoneSource} dnc={lead.phoneDnc} />
          <ReplyBadge signal={lead.replySignal} />
          <EngagementBadge stage={lead.engagementStage} hasReplySignal={Boolean(lead.replySignal && lead.replySignal !== 'neutral')} />
          <IcpStatusChip lead={lead} />
        </div>

        {/* Why-now / trigger */}
        {whyNow && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1">
            {whyNow}
            {sourceKind && (
              <span className="ml-1.5 text-[10px] font-medium text-muted-foreground/70">
                ({sourceKind})
              </span>
            )}
          </p>
        )}


        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <DimChip label={fitCfg.label} className={fitCfg.chip} />
          <DimChip label={trigCfg.label} className={trigCfg.chip} />
          <DimChip label={needCfg.label} className={needCfg.chip} />
        </div>
      </div>

      <div className="shrink-0 max-w-[180px] hidden sm:flex flex-col items-end">
        <p className="text-xs text-muted-foreground text-right leading-snug">{openAction}</p>
      </div>

      <ChevronRightIcon className="h-4 w-4 shrink-0 mt-1 text-muted-foreground group-hover:text-foreground transition-colors" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Sorted-out row
// ---------------------------------------------------------------------------

function SortedOutRow({ lead }: { lead: Lead }) {
  const statusLabel = lead.sortoutStatus ? (SORTOUT_LABEL[lead.sortoutStatus] ?? lead.sortoutStatus) : '';
  const until = lead.sortoutUntil
    ? new Date(lead.sortoutUntil).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <Link
      href={`/leads/${lead.id}`}
      className="group flex items-start gap-3 rounded-lg border border-border/50 bg-background px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{lead.name}</span>
          {lead.company && <span className="text-xs text-muted-foreground">· {lead.company}</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <OriginBadge origin={lead.origin} detail={lead.originDetail} />
          <PhoneBadge phone={lead.phone} source={lead.phoneSource} dnc={lead.phoneDnc} />
          <ReplyBadge signal={lead.replySignal} />
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {statusLabel}
          </span>
          {until && (
            <span className="text-[10px] text-muted-foreground/70">bis {until}</span>
          )}
          {!lead.sortoutSyncedNeedle && (
            <span className="text-[10px] text-muted-foreground/50 italic">nur lokal</span>
          )}
        </div>
      </div>
      <ChevronRightIcon className="h-4 w-4 shrink-0 mt-1 text-muted-foreground group-hover:text-foreground transition-colors" />
    </Link>
  );
}

function DimChip({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
        className
      )}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty state for real leads
// ---------------------------------------------------------------------------

function RealEmptyState({
  hasNeedle, hasBlitz, hasAiArk, onDemoClick,
}: {
  hasNeedle: boolean;
  hasBlitz: boolean;
  hasAiArk: boolean;
  onDemoClick?: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 py-10 max-w-md mx-auto">
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium text-foreground">Noch keine echten Leads.</p>
        <p className="text-sm text-muted-foreground">
          Verbinde eine Lead-Quelle und klicke auf &bdquo;Leads finden&ldquo;, um zu starten.
        </p>
      </div>

      <LeadSources hasNeedle={hasNeedle} hasBlitz={hasBlitz} hasAiArk={hasAiArk} compact />

{onDemoClick && (
      <button
        type="button"
        onClick={onDemoClick}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors self-start"
      >
        <ExternalLinkIcon className="h-3.5 w-3.5" />
        Demo (TEST) ansehen
      </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

export function LeadTableSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-6 py-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-border/50 px-4 py-3">
          <Skeleton className="h-5 w-10 rounded shrink-0" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
            <div className="flex gap-1.5">
              <Skeleton className="h-4 w-14 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-18 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
