'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { SortoutStatus } from '@/lib/types';

interface SortoutActionsProps {
  leadId: string;
  suggested: SortoutStatus[];
  current: SortoutStatus | null;
  syncedToNeedle: boolean;
}

type ClickableStatus = Exclude<SortoutStatus, 'opt_out'>;

const ACTIONS: { status: ClickableStatus; label: string; hint: string }[] = [
  { status: 'not_a_fit', label: 'Kein Zielkunde', hint: 'ganze Firma, 12 Monate' },
  { status: 'wrong_contact', label: 'Falscher Ansprechpartner', hint: 'nur diese Person' },
  { status: 'not_now', label: 'Nicht jetzt', hint: '90 Tage' },
];

const CURRENT_LABEL: Record<SortoutStatus, string> = {
  not_a_fit: 'Kein Zielkunde',
  wrong_contact: 'Falscher Ansprechpartner',
  not_now: 'Nicht jetzt',
  opt_out: 'Opt-out (auf Wunsch der Person)',
};

/** Sort-out buttons; nothing is written to Needle until the SDR clicks. */
export function SortoutActions({ leadId, suggested, current, syncedToNeedle }: SortoutActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<ClickableStatus | 'undo' | null>(null);

  async function submit(status: ClickableStatus | null) {
    setPending(status ?? 'undo');
    try {
      const res = await fetch(`/api/leads/${leadId}/sortout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Status konnte nicht gespeichert werden.');
        return;
      }
      router.refresh();
    } catch {
      toast.error('Keine Verbindung zum Server. Bitte erneut versuchen.');
    } finally {
      setPending(null);
    }
  }

  if (current) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-muted px-2 py-1 font-medium">{CURRENT_LABEL[current]}</span>
        <span className="text-xs text-muted-foreground">
          {syncedToNeedle ? 'auch in Needle hinterlegt' : 'nur lokal'}
        </span>
        {current !== 'opt_out' && (
          <Button variant="ghost" size="sm" onClick={() => void submit(null)} disabled={pending !== null}>
            {pending === 'undo' && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            Zurücknehmen
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(({ status, label, hint }) => (
        <Button
          key={status}
          variant={suggested.includes(status) ? 'default' : 'outline'}
          size="sm"
          onClick={() => void submit(status)}
          disabled={pending !== null}
          title={hint}
        >
          {pending === status && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
          {label}
          <span className="text-xs opacity-70">· {hint}</span>
        </Button>
      ))}
    </div>
  );
}
