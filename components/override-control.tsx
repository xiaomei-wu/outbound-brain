'use client';

import { useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useOverride } from '@/lib/hooks/use-override';
import type { NextAction } from '@/lib/types';

const ACTION_OPTIONS: { value: NextAction; label: string }[] = [
  { value: 'demo_handoff', label: 'Demo-Übergabe' },
  { value: 'follow_up', label: 'Nachfassen' },
  { value: 'identify_contact', label: 'Kontakt identifizieren' },
  { value: 'research', label: 'Recherchieren' },
  { value: 'call_now', label: 'Jetzt anrufen' },
  { value: 'reply', label: 'Antworten' },
  { value: 'wait', label: 'Abwarten' },
  { value: 'stop', label: 'Stoppen' },
];

interface OverrideControlProps {
  leadId: string;
  callLogId: string;
  recommendedAction: NextAction | null;
}

export function OverrideControl({
  leadId,
  callLogId,
  recommendedAction,
}: OverrideControlProps) {
  const defaultAction: NextAction = recommendedAction ?? 'follow_up';
  const [selectedAction, setSelectedAction] = useState<NextAction>(defaultAction);
  const [reason, setReason] = useState('');
  const { submitOverride, isLoading, overriddenLog } = useOverride(leadId);

  // Show confirmation once the override was saved
  if (overriddenLog) {
    const activeAction = overriddenLog.sellerAction ?? selectedAction;
    const actionLabel =
      ACTION_OPTIONS.find((o) => o.value === activeAction)?.label ?? activeAction;
    return (
      <div className="rounded-md bg-muted/40 border border-border px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">Nächster Schritt geändert: </span>
        <span className="font-medium text-foreground">{actionLabel}</span>
      </div>
    );
  }

  const unchanged = selectedAction === defaultAction;

  const selectCls =
    'h-9 w-full rounded-md border border-input bg-background px-3 text-sm ' +
    'text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none transition-colors';

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-medium text-muted-foreground">
        Systemempfehlung ändern (optional — Qualifikationsstatus bleibt unverändert):
      </p>

      <select
        value={selectedAction}
        onChange={(e) => setSelectedAction(e.target.value as NextAction)}
        className={selectCls}
        aria-label="Nächsten Schritt auswählen"
        disabled={isLoading}
      >
        {ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Begründung (optional)…"
        className="min-h-[56px] text-sm resize-none"
        disabled={isLoading}
      />

      <Button
        size="sm"
        variant="outline"
        onClick={() => void submitOverride(callLogId, selectedAction, reason || undefined)}
        disabled={isLoading || unchanged}
        className="w-fit"
      >
        {isLoading && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
        Schritt ändern
      </Button>
    </div>
  );
}
