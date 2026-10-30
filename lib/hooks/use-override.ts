'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { CallLog, NextAction } from '@/lib/types';

// v2 API: POST /api/leads/[id]/override
// body: { callLogId, action, reason? }
// response: { callLog }

interface UseOverrideReturn {
  submitOverride: (callLogId: string, action: NextAction, reason?: string) => Promise<void>;
  isLoading: boolean;
  overriddenLog: CallLog | null;
}

export function useOverride(leadId: string): UseOverrideReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [overriddenLog, setOverriddenLog] = useState<CallLog | null>(null);

  async function submitOverride(
    callLogId: string,
    action: NextAction,
    reason?: string
  ): Promise<void> {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callLogId, action, reason }),
      });
      if (!res.ok) {
        toast.error(
          'Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.'
        );
        return;
      }
      const data = (await res.json()) as { callLog: CallLog };
      setOverriddenLog(data.callLog);
    } catch {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.');
    } finally {
      setIsLoading(false);
    }
  }

  return { submitOverride, isLoading, overriddenLog };
}
