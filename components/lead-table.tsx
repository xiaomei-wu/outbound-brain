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
  FileTextIcon,
  RotateCcwIcon,
  ChevronRightIcon,
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
import type {
  FitStatus,
  Lead,
  LeadTrigger,
  NeedStatus,
  Priority,
  WillingnessStatus,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type Tab = 'heute' | 'pruefen' | 'spaeter' | 'gestoppt';

const TABS: { id: Tab; label: string }[] = [
  { id: 'heute', label: 'Heute' },
  { id: 'pruefen', label: 'Prüfen' },
  { id: 'spaeter', label: 'Später' },
  { id: 'gestoppt', label: 'Gestoppt' },
];

/** Active-call statuses (excluding stopped/paused). */
const ACTIVE_STATUSES: Lead['status'][] = ['new', 'researched', 'briefed', 'calling'];

// ---------------------------------------------------------------------------
// Priority sort helpers
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  review: 3,
};

function sortLeads(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const pA = PRIORITY_ORDER[a.priority] ?? 99;
    const pB = PRIORITY_ORDER[b.priority] ?? 99;
    if (pA !== pB) return pA - pB;
    // Agreed conversations first within same priority
    const wA = a.willingness === 'requested' ? 0 : 1;
    const wB = b.willingness === 'requested' ? 0 : 1;
    if (wA !== wB) return wA - wB;
    return b.fitScore - a.fitScore;
  });
}

function filterLeads(leads: Lead[], tab: Tab): Lead[] {
  switch (tab) {
    case 'heute':
      return leads.filter(
        (l) => ACTIVE_STATUSES.includes(l.status) && l.priority !== 'review'
      );
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

function tabCount(leads: Lead[], tab: Tab): number {
  return filterLeads(leads, tab).length;
}

// ---------------------------------------------------------------------------
// Dimension chip helpers
// ---------------------------------------------------------------------------

const FIT_CONFIG: Record<FitStatus, { label: string; chip: string }> = {
  fits: { label: 'Passt', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  partial: { label: 'Teilweise', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  outside: { label: 'Außerhalb', chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  unknown: { label: 'Fit?', chip: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200' },
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

function triggerChip(
  trigger: LeadTrigger | null
): { label: string; chip: string } {
  if (!trigger || trigger.isActive === false)
    return { label: 'Kein Trigger', chip: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200' };
  if (trigger.verdict === 'strong')
    return { label: 'Starker Trigger', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
  if (trigger.verdict === 'usable')
    return { label: 'Trigger vorhanden', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
  return { label: 'Trigger schwach', chip: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200' };
}

/** Short action hint derived from lead state for the "Offen / Aktion" column. */
function deriveOpenAction(lead: Lead): string {
  if (lead.status === 'stopped') return 'Gestoppt';
  if (lead.willingness === 'requested') return 'Gespräch vereinbart · Termin bestätigen';
  if (lead.willingness === 'declined') return 'Abgelehnt · Opt-out respektieren';
  switch (lead.priority) {
    case 'high':
      return lead.role ? 'Anruf vorbereiten' : 'Rolle klären · Anruf vorbereiten';
    case 'medium':
      return 'Bedarf erkunden · Kanal prüfen';
    case 'low':
      return 'Kontext ergänzen';
    case 'review':
      return 'Ausnahme-Queue · Nicht priorisieren';
  }
}

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat',
  call: 'Gespräch',
  public: 'Öffentlich',
  seller: 'Notiz',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LeadTableProps {
  leads: Lead[];
  triggersMap: Record<string, LeadTrigger | null>;
}

export function LeadTable({ leads, triggersMap }: LeadTableProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('heute');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importResult, setImportResult] = useState<number | null>(null);

  const [isFindingLeads, startFindLeads] = useTransition();
  const [isResearchingAll, startResearchAll] = useTransition();
  const [isGeneratingBriefs, startGenerateBriefs] = useTransition();
  const [isResetting, startReset] = useTransition();

  const sorted = sortLeads(leads);
  const filtered = filterLeads(sorted, activeTab);
  const isEmpty = filtered.length === 0;

  // Top lead for explanation line (Heute tab only)
  const topLead = activeTab === 'heute' ? filtered[0] ?? null : null;

  // ---- Actions ----

  function handleFindLeads() {
    setShowImportDialog(true);
    setImportResult(null);
    startFindLeads(async () => {
      try {
        const res = await fetch('/api/import', { method: 'POST' });
        if (!res.ok) {
          toast.error(
            'Leads konnten nicht importiert werden. AI Ark Schlüssel auf der Integrationen-Seite prüfen.'
          );
          setShowImportDialog(false);
          return;
        }
        const data = (await res.json()) as { imported: number };
        setImportResult(data.imported);
        router.refresh();
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
        setShowImportDialog(false);
      }
    });
  }

  function handleResearchAll() {
    const toResearch = leads.filter((l) => l.status === 'new');
    if (toResearch.length === 0) {
      toast.info('Alle Leads wurden bereits recherchiert.');
      return;
    }
    startResearchAll(async () => {
      let done = 0;
      for (const lead of toResearch) {
        try {
          const res = await fetch(`/api/leads/${lead.id}/research`, { method: 'POST' });
          if (res.ok) done++;
        } catch {
          // continue with others
        }
      }
      toast.success(
        `Recherche abgeschlossen: ${done} von ${toResearch.length} Leads aktualisiert.`
      );
      router.refresh();
    });
  }

  function handleGenerateBriefs() {
    const toGenerate = leads.filter(
      (l) => l.status === 'researched' && !l.cachedBrief
    );
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
        } catch {
          // continue
        }
      }
      toast.success(`Briefings erstellt: ${done} von ${toGenerate.length} Leads.`);
      router.refresh();
    });
  }

  function handleReset() {
    startReset(async () => {
      try {
        const res = await fetch('/api/seed', { method: 'POST' });
        if (!res.ok) {
          toast.error('Demo-Reset fehlgeschlagen. Bitte erneut versuchen.');
          return;
        }
        setShowResetDialog(false);
        router.refresh();
        toast.success('Demo-Daten wurden zurückgesetzt.');
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
      }
    });
  }

  const anyBusy = isFindingLeads || isResearchingAll || isGeneratingBriefs || isResetting;

  return (
    <div className="flex flex-col h-full">
      {/* ---- Action bar (visually secondary) ---- */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-border/40 bg-muted/10 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleFindLeads}
          disabled={anyBusy}
          className="text-xs"
        >
          {isFindingLeads ? (
            <Loader2Icon className="h-3 w-3 animate-spin" />
          ) : (
            <UsersIcon className="h-3 w-3" />
          )}
          Leads finden
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleResearchAll}
          disabled={anyBusy}
          className="text-xs"
        >
          {isResearchingAll ? (
            <Loader2Icon className="h-3 w-3 animate-spin" />
          ) : (
            <SearchIcon className="h-3 w-3" />
          )}
          Alle recherchieren
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateBriefs}
          disabled={anyBusy}
          className="text-xs"
        >
          {isGeneratingBriefs ? (
            <Loader2Icon className="h-3 w-3 animate-spin" />
          ) : (
            <FileTextIcon className="h-3 w-3" />
          )}
          Briefings erstellen
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {/* TEST simulate controls */}
          <SimulateEvent
            leads={leads.map((l) => ({ id: l.id, name: l.name, company: l.company }))}
            onEventFired={() => router.refresh()}
          />

          {/* Demo reset — visually ghost / secondary */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            disabled={anyBusy}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            {isResetting ? (
              <Loader2Icon className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcwIcon className="h-3 w-3" />
            )}
            Demo zurücksetzen
          </Button>
        </div>
      </div>

      {/* ---- Tabs ---- */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0">
        {TABS.map((tab) => {
          const count = tabCount(leads, tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'ml-1.5 text-[11px] tabular-nums',
                  activeTab === tab.id
                    ? 'text-background/70'
                    : 'text-muted-foreground'
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- Top-lead priority reason (Heute only) ---- */}
      {topLead?.priorityReason && (
        <p className="px-6 pt-3 text-sm text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">{topLead.name}</span>{' '}
          &mdash; {topLead.priorityReason}
        </p>
      )}

      {/* ---- Lead rows ---- */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {isEmpty ? (
          <EmptyState tab={activeTab} />
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((lead, idx) => {
              const bestTrigger = triggersMap[lead.id] ?? null;
              const whyNow =
                bestTrigger?.content ?? lead.cachedBrief?.whyNow ?? null;
              const sourceKind =
                bestTrigger?.evidenceKind
                  ? (SOURCE_LABELS[bestTrigger.evidenceKind] ?? null)
                  : null;
              const isTop = idx === 0;

              return (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  trigger={bestTrigger}
                  whyNow={whyNow}
                  sourceKind={sourceKind}
                  isTop={isTop}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Reset dialog ---- */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demo zurücksetzen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Alle Daten werden gelöscht und durch die Demo-Daten ersetzt. Diese Aktion
            kann nicht rückgängig gemacht werden.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              disabled={isResetting}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleReset()}
              disabled={isResetting}
            >
              {isResetting && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Zurücksetzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Import dialog ---- */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leads importieren</DialogTitle>
          </DialogHeader>
          {isFindingLeads ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                AI Ark wird abgefragt…
              </span>
            </div>
          ) : importResult !== null ? (
            <p className="text-sm">
              <span className="font-semibold">{importResult} Leads</span> wurden
              importiert.
            </p>
          ) : null}
          {!isFindingLeads && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowImportDialog(false)}>
                Schließen
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface LeadRowProps {
  lead: Lead;
  trigger: LeadTrigger | null;
  whyNow: string | null;
  sourceKind: string | null;
  isTop: boolean;
}

function LeadRow({ lead, trigger, whyNow, sourceKind, isTop }: LeadRowProps) {
  const fitCfg = FIT_CONFIG[lead.fitStatus ?? 'unknown'];
  const trigCfg = triggerChip(trigger);
  const needCfg = NEED_WILLINGNESS_CHIP(
    lead.needStatus ?? 'unknown',
    lead.willingness ?? 'unknown'
  );
  const openAction = deriveOpenAction(lead);

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={cn(
        'group flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50',
        isTop
          ? 'border-foreground/20 bg-card shadow-sm'
          : 'border-border/50 bg-background'
      )}
    >
      {/* Priority badge — leftmost, fixed width */}
      <div className="shrink-0 pt-0.5">
        <PriorityBadge priority={lead.priority} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        {/* Name · role · company */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{lead.name}</span>
          {lead.role && (
            <span className="text-xs text-muted-foreground">{lead.role}</span>
          )}
          {lead.company && (
            <span className="text-xs text-muted-foreground">· {lead.company}</span>
          )}
        </div>

        {/* Why-now line with source kind */}
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

        {/* Three dimension chips */}
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <DimChip label={fitCfg.label} className={fitCfg.chip} />
          <DimChip label={trigCfg.label} className={trigCfg.chip} />
          <DimChip label={needCfg.label} className={needCfg.chip} />
        </div>
      </div>

      {/* Offen / Aktion column */}
      <div className="shrink-0 max-w-[180px] hidden sm:flex flex-col items-end">
        <p className="text-xs text-muted-foreground text-right leading-snug">
          {openAction}
        </p>
      </div>

      {/* Arrow */}
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
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, string> = {
    heute: 'Noch keine aktiven Leads. Leads finden oder unter Setup eine Kampagne einrichten.',
    pruefen: 'Keine Leads in der Prüf-Queue.',
    spaeter: 'Keine Leads im Status „Später".',
    gestoppt: 'Keine gestoppten Leads.',
  };
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {messages[tab]}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

export function LeadTableSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-6 py-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-border/50 px-4 py-3"
        >
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
