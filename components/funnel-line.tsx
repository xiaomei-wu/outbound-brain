'use client';

import type { FitStatus, Lead, Priority } from '@/lib/types';

// ---------------------------------------------------------------------------
// Pure helper — exported for unit tests
// ---------------------------------------------------------------------------

const AB_PRIORITY: Set<Priority> = new Set(['high', 'medium']);
const AB_FIT: Set<FitStatus> = new Set(['fits', 'partial']);

/**
 * Aggregates the funnel counts for all non-test leads.
 * - found      all real leads (!isTest)
 * - ab         real leads with priority high|medium AND fitStatus fits|partial
 * - withPhone  real leads that have a phone number
 * - called     real leads with status 'called'
 */
export function funnelCounts(leads: Pick<Lead, 'isTest' | 'priority' | 'fitStatus' | 'phone' | 'status'>[]): {
  found: number;
  ab: number;
  withPhone: number;
  called: number;
} {
  const real = leads.filter((l) => !l.isTest);
  return {
    found: real.length,
    ab: real.filter((l) => AB_PRIORITY.has(l.priority) && AB_FIT.has(l.fitStatus)).length,
    withPhone: real.filter((l) => l.phone != null && l.phone !== '').length,
    called: real.filter((l) => l.status === 'called').length,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FunnelLineProps {
  leads: Pick<Lead, 'isTest' | 'priority' | 'fitStatus' | 'phone' | 'status'>[];
}

export function FunnelLine({ leads }: FunnelLineProps) {
  const { found, ab, withPhone, called } = funnelCounts(leads);

  const steps = [
    { label: 'gefunden', count: found },
    { label: 'ICP A/B', count: ab },
    { label: 'mit Nummer', count: withPhone },
    { label: 'angerufen', count: called },
  ];

  return (
    <div className="flex items-center gap-1 flex-wrap text-sm text-muted-foreground">
      {steps.map((step, i) => (
        <span key={step.label} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/40">→</span>}
          <span className="font-semibold tabular-nums text-foreground">{step.count}</span>
          <span>{step.label}</span>
        </span>
      ))}
    </div>
  );
}
