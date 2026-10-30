'use client';

import { cn } from 'cn';
import {
  CheckCircleIcon,
  XCircleIcon,
  MinusCircleIcon,
  ShieldCheckIcon,
  CalendarCheckIcon,
} from 'lucide-react';
import type {
  CallEvaluation,
  CallLog,
  CriterionId,
  CriterionScore,
  LeadCorrection,
  LeadTrigger,
  NextAction,
  TriggerFeedback,
  TriggerFeedbackResult,
} from '@/lib/types';
import { HandoffCard } from '@/components/handoff-card';
import { OverrideControl } from '@/components/override-control';
import { BantGrid, type BantItem } from '@/components/bant-grid';

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const CRITERION_LABELS: Record<CriterionId, string> = {
  reason: 'Gesprächsgrund',
  triggerLanded: 'Trigger getestet',
  discovery: 'Entdeckung',
  listening: 'Zuhören',
  pain: 'Bedarf in eigenen Worten',
  objection: 'Einwand behandelt',
  qualification: 'Qualifizierung',
  nextStep: 'Klarer nächster Schritt',
};

const NEXT_ACTION_LABELS: Record<NextAction, string> = {
  demo_handoff: 'Demo-Übergabe',
  follow_up: 'Nachfassen',
  identify_contact: 'Kontakt identifizieren',
  research: 'Recherchieren',
  call_now: 'Jetzt anrufen',
  reply: 'Antworten',
  wait: 'Abwarten',
  stop: 'Stoppen',
};

const TRIGGER_FEEDBACK_CONFIG: Record<
  TriggerFeedbackResult,
  { label: string; className: string }
> = {
  confirmed: { label: 'Bestätigt', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
  contradicted: { label: 'Widerlegt', className: 'bg-red-50 text-red-800 ring-1 ring-red-200' },
  not_tested: { label: 'Nicht getestet', className: 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200' },
};

const CORRECTION_FIELD_LABELS: Record<LeadCorrection['field'], string> = {
  role: 'Rolle',
  need: 'Bedarf',
  timing: 'Timing',
  contact_route: 'Kontaktweg',
  fit: 'Fit',
  other: 'Sonstiges',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AnalysisPanelProps {
  evaluation: CallEvaluation;
  callLog: CallLog;
  leadId: string;
  triggers?: LeadTrigger[];
}

export function AnalysisPanel({
  evaluation,
  callLog,
  leadId,
  triggers = [],
}: AnalysisPanelProps) {
  const assessed = evaluation.scores.filter((s) => s.points !== null);
  const totalPoints = assessed.reduce((sum, s) => sum + (s.points ?? 0), 0);
  const maxPoints = assessed.length * 2;

  const bantItems: BantItem[] = evaluation.bantUpdates.map((u) => ({
    dimension: u.dimension,
    status: u.status,
    value: u.value,
    evidence: u.evidence,
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* ── Score + outcome badges ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-foreground">
            {totalPoints}/{maxPoints}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              · {assessed.length} von 8 bewertbar
            </span>
          </span>

          {/* Gebucht badge — meeting was booked (outcome), separate from demo-ready */}
          {callLog.outcome === 'booked' && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-800 ring-1 ring-blue-200">
              <CalendarCheckIcon className="h-3 w-3" />
              Gebucht
            </span>
          )}

          {/* Demo-ready badge — separately enforced: needConfirmed && objectiveStatus=agreed */}
          {callLog.demoReady ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300">
              <ShieldCheckIcon className="h-3 w-3" />
              Demo-ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200">
              <MinusCircleIcon className="h-3 w-3" />
              Nicht demo-ready
            </span>
          )}
        </div>
      </div>

      {/* ── Criteria ── */}
      <SectionWrap label="Gesprächsqualität">
        <div className="flex flex-col divide-y divide-border/50">
          {evaluation.scores.map((score) => (
            <CriterionRow key={score.id} score={score} />
          ))}
        </div>
      </SectionWrap>

      {/* ── Coaching ── */}
      <SectionWrap label="Coaching">
        <div className="flex flex-col gap-3">
          <CoachBlock emoji="✓" label="Stärke" text={evaluation.keep} />
          <CoachBlock emoji="→" label="Verbessern" text={evaluation.tryNext} />
          <div className="rounded-md bg-muted/50 border border-border px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Besserer Satz
            </p>
            <p className="text-sm italic text-foreground leading-relaxed">
              &ldquo;{evaluation.betterLine}&rdquo;
            </p>
          </div>
        </div>
      </SectionWrap>

      {/* ── Handoff ── */}
      {evaluation.handoff && (
        <SectionWrap label="Demo-Übergabe">
          <HandoffCard
            handoff={evaluation.handoff}
            demoReady={callLog.demoReady}
          />
        </SectionWrap>
      )}

      {/* ── Trigger feedback ── */}
      {evaluation.triggerFeedback.length > 0 && (
        <SectionWrap label="Trigger-Feedback">
          <div className="flex flex-col gap-2">
            {evaluation.triggerFeedback.map((fb) => (
              <TriggerFeedbackRow key={fb.leadTriggerId} fb={fb} triggers={triggers} />
            ))}
          </div>
        </SectionWrap>
      )}

      {/* ── Lead aktualisiert ── */}
      {(evaluation.bantUpdates.length > 0 || evaluation.leadCorrections.length > 0) && (
        <SectionWrap label="Lead aktualisiert">
          <div className="flex flex-col gap-3">
            {evaluation.bantUpdates.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground font-medium">BANT-Updates:</p>
                <BantGrid items={bantItems} />
              </div>
            )}
            {evaluation.leadCorrections.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground font-medium">Korrekturen:</p>
                <div className="flex flex-col gap-2">
                  {evaluation.leadCorrections.map((c, i) => (
                    <CorrectionRow key={i} correction={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionWrap>
      )}

      {/* ── Recommended action + override ── */}
      <SectionWrap label="Empfohlener nächster Schritt">
        <div className="flex flex-col gap-3">
          <div className="rounded-md bg-muted/30 border border-border px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">
              {NEXT_ACTION_LABELS[evaluation.recommendedAction]}
            </p>
            {evaluation.recommendationReason && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {evaluation.recommendationReason}
              </p>
            )}
          </div>
          <OverrideControl
            leadId={leadId}
            callLogId={callLog.id}
            recommendedAction={evaluation.recommendedAction}
          />
        </div>
      </SectionWrap>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function CriterionRow({ score }: { score: CriterionScore }) {
  const label = CRITERION_LABELS[score.id] ?? score.id;
  const notObserved = score.points === null;

  return (
    <div className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <PointIcon points={score.points} />
        <span className={cn('text-sm', notObserved ? 'text-muted-foreground' : 'text-foreground font-medium')}>
          {label}
        </span>
        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {notObserved ? 'nicht beobachtet' : `${score.points}/2`}
        </span>
      </div>
      {score.quote && (
        <p className="text-xs text-muted-foreground pl-6 italic leading-snug">
          &ldquo;{score.quote}&rdquo;
        </p>
      )}
    </div>
  );
}

function PointIcon({ points }: { points: 0 | 1 | 2 | null }) {
  if (points === null) {
    return <MinusCircleIcon className="h-4 w-4 text-zinc-300 shrink-0" />;
  }
  if (points === 2) {
    return <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0" />;
  }
  if (points === 1) {
    return <CheckCircleIcon className="h-4 w-4 text-amber-400 shrink-0" />;
  }
  return <XCircleIcon className="h-4 w-4 text-zinc-300 shrink-0" />;
}

function CoachBlock({ emoji, label, text }: { emoji: string; label: string; text: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 w-5 text-center text-base leading-tight">{emoji}</span>
      <div>
        <span className="font-medium text-foreground">{label}: </span>
        <span className="text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}

function TriggerFeedbackRow({
  fb,
  triggers,
}: {
  fb: TriggerFeedback;
  triggers: LeadTrigger[];
}) {
  const trigger = triggers.find((t) => t.id === fb.leadTriggerId);
  const cfg = TRIGGER_FEEDBACK_CONFIG[fb.result];

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-foreground truncate">
          {trigger?.type ?? fb.leadTriggerId}
        </span>
        <span
          className={cn(
            'ml-auto inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap',
            cfg.className
          )}
        >
          {cfg.label}
        </span>
      </div>
      {fb.evidence && (
        <p className="text-xs text-muted-foreground italic">{fb.evidence}</p>
      )}
    </div>
  );
}

function CorrectionRow({ correction }: { correction: LeadCorrection }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {CORRECTION_FIELD_LABELS[correction.field]}
        </span>
      </div>
      <p className="text-sm text-foreground">{correction.value}</p>
      <p className="text-xs text-muted-foreground italic">{correction.evidence}</p>
    </div>
  );
}
