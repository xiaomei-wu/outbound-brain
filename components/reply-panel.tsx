'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { REPLY_LABEL, ReplyBadge } from '@/components/reply-badge';
import { replyEffect } from '@/lib/reply-routing';
import type { ReplySignal, SortoutStatus } from '@/lib/types';

interface ReplyPanelProps {
  leadId: string;
  signal: ReplySignal;
  quote: string | null;
  reason: string | null;
  at: string | null;
  sortoutStatus: SortoutStatus | null;
}

const SUGGESTION_LABEL: Record<SortoutStatus, string> = {
  not_a_fit: 'Kein Zielkunde (ganze Firma, 12 Monate)',
  wrong_contact: 'Falscher Ansprechpartner',
  not_now: 'Nicht jetzt (90 Tage)',
  opt_out: 'Opt-out (auf Wunsch der Person, dauerhaft)',
};

/** The lead's own written reply, the evidence quote, and a one-click suggestion. */
export function ReplyPanel({ leadId, signal, quote, reason, at, sortoutStatus }: ReplyPanelProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const suggested = replyEffect(signal).suggested;

  async function applySuggestion(status: SortoutStatus) {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/sortout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: `Antwort: ${quote ?? REPLY_LABEL[signal]}`.slice(0, 500) }),
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
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Antwort des Kontakts</span>
        <ReplyBadge signal={signal} />
        {at && (
          <span className="text-[10px] text-muted-foreground">
            ausgewertet {new Date(at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {quote && <blockquote className="border-l-2 border-border pl-3 text-sm italic text-foreground">„{quote}“</blockquote>}
      {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
      {suggested && !sortoutStatus && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => void applySuggestion(suggested)} disabled={isSaving}>
          {isSaving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
          Vorschlag übernehmen: {SUGGESTION_LABEL[suggested]}
        </Button>
      )}
    </div>
  );
}
