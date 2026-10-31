'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** For a call saved without a Claude evaluation: runs it again and reloads the page. */
export function RetryAnalysisButton({ leadId, callLogId }: { leadId: string; callLogId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/calls/${callLogId}/analyze`, { method: 'POST' });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Analyse fehlgeschlagen.');
        return;
      }
      router.refresh();
    } catch {
      toast.error('Keine Verbindung zum Server. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Keine Auswertung — die Analyse ist beim Speichern fehlgeschlagen.</span>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void retry()} disabled={busy}>
        {busy ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <RefreshCwIcon className="h-3 w-3" />}
        Analyse nachholen
      </Button>
    </div>
  );
}
