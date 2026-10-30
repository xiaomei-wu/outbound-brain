'use client';

import { useState } from 'react';
import { cn } from 'cn';
import { Loader2Icon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useLogOutcome } from '@/lib/hooks/use-log-outcome';
import { AnalysisPanel } from '@/components/analysis-panel';
import type { CallOutcome, LeadTrigger } from '@/lib/types';

interface OutcomeConfig {
  label: string;
  outcome: CallOutcome;
  className: string;
  activeClass: string;
}

const OUTCOMES: OutcomeConfig[] = [
  {
    label: 'Gebucht',
    outcome: 'booked',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    activeClass: 'ring-2 ring-emerald-400 bg-emerald-100',
  },
  {
    label: 'Nicht gebucht',
    outcome: 'not_booked',
    className: 'border-border bg-background text-foreground hover:bg-muted',
    activeClass: 'ring-2 ring-foreground bg-muted',
  },
  {
    label: 'Nicht jetzt',
    outcome: 'not_now',
    className: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    activeClass: 'ring-2 ring-amber-400 bg-amber-100',
  },
  {
    label: 'Opt-out',
    outcome: 'opt_out',
    className: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
    activeClass: 'ring-2 ring-red-400 bg-red-100',
  },
];

interface OutcomeButtonsProps {
  leadId: string;
  triggers?: LeadTrigger[];
}

export function OutcomeButtons({ leadId, triggers = [] }: OutcomeButtonsProps) {
  const [notes, setNotes] = useState('');
  const [transcript, setTranscript] = useState('');
  const [selected, setSelected] = useState<CallOutcome | null>(null);
  const { logOutcome, isLoading, result } = useLogOutcome(leadId);

  async function handleOutcome(outcome: CallOutcome) {
    setSelected(outcome);
    await logOutcome(outcome, notes, transcript);
  }

  // After logging: show "Nach dem Gespräch" section
  if (result) {
    const outcomeLabel =
      OUTCOMES.find((o) => o.outcome === result.callLog.outcome)?.label ??
      result.callLog.outcome;

    return (
      <div className="flex flex-col gap-4">
        {/* Outcome recap */}
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Ergebnis gespeichert:</span>
          <span className="font-medium">{outcomeLabel}</span>
        </div>

        {/* Analysis */}
        {result.evaluation ? (
          <AnalysisPanel
            evaluation={result.evaluation}
            callLog={result.callLog}
            leadId={leadId}
            triggers={triggers}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Analyse konnte nicht erstellt werden. Ergebnis wurde trotzdem gespeichert.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Notes textarea */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="call-notes"
          className="text-xs font-medium text-muted-foreground"
        >
          Gesprächsnotizen (optional)
        </label>
        <Textarea
          id="call-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Was wurde besprochen? Einwände, nächste Schritte…"
          className="min-h-[72px] text-sm resize-none"
          disabled={isLoading}
        />
      </div>

      {/* Transcript textarea */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="call-transcript"
          className="text-xs font-medium text-muted-foreground"
        >
          Transkript einfügen (optional — verbessert die Analyse)
        </label>
        <Textarea
          id="call-transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Gesprächstranskript hier einfügen…"
          className="min-h-[96px] text-sm resize-y font-mono text-[12px]"
          disabled={isLoading}
        />
      </div>

      {/* Outcome buttons — 2×2 grid */}
      <div className="grid grid-cols-2 gap-2">
        {OUTCOMES.map((cfg) => (
          <button
            key={cfg.outcome}
            type="button"
            disabled={isLoading}
            onClick={() => void handleOutcome(cfg.outcome)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5',
              'text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed',
              cfg.className,
              selected === cfg.outcome && cfg.activeClass
            )}
          >
            {isLoading && selected === cfg.outcome ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : null}
            {cfg.label}
          </button>
        ))}
      </div>
    </div>
  );
}
