'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { CallEvaluation, CallLog, CallOutcome, PriorityResult } from '@/lib/types';

// v2 API: POST /api/leads/[id]/outcome
// body: { outcome, notes?, transcript? }
// response: { callLog, evaluation, priority }

export interface LogOutcomeResult {
  callLog: CallLog;
  evaluation: CallEvaluation | null;
  priority: PriorityResult;
}

interface UseLogOutcomeReturn {
  logOutcome: (outcome: CallOutcome, notes: string, transcript: string) => Promise<void>;
  isLoading: boolean;
  result: LogOutcomeResult | null;
}

export function useLogOutcome(leadId: string): UseLogOutcomeReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<LogOutcomeResult | null>(null);

  async function logOutcome(
    outcome: CallOutcome,
    notes: string,
    transcript: string
  ): Promise<void> {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          notes: notes || undefined,
          transcript: transcript || undefined,
        }),
      });
      if (!res.ok) {
        toast.error(
          'Ergebnis konnte nicht gespeichert werden. Bitte erneut versuchen.'
        );
        return;
      }
      const data = (await res.json()) as LogOutcomeResult;
      setResult(data);
    } catch {
      toast.error('Verbindungsfehler. Bitte Internetverbindung prüfen.');
    } finally {
      setIsLoading(false);
    }
  }

  return { logOutcome, isLoading, result };
}
