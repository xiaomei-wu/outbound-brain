'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon, UserPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { RefillState } from '@/lib/refill-run';

/** Low call queue: refill the Needle campaign — automatically while it sends nothing, else on click. */
export function RefillBanner({ state }: { state: RefillState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const started = useRef(false);
  const auto = state.mode === 'auto';

  // Automatic mode: run once per page load while the queue is low
  useEffect(() => {
    if (!state.needed || !auto || !state.campaignId || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/refill/run', { method: 'POST' });
        const data: { message?: string; enrolled?: number; newLeads?: number } = await res.json().catch(() => ({}));
        setAutoMessage(data.message ?? null);
        if (data.enrolled || data.newLeads) setTimeout(() => router.refresh(), 2500);
      } catch {
        setAutoMessage('Nachschub gerade nicht möglich.');
      }
    })();
  }, [state.needed, auto, state.campaignId, router]);

  if (!state.needed || !state.campaignId) return null;

  async function approve() {
    setBusy(true);
    try {
      const res = await fetch('/api/refill/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: state.candidates.map((c) => c.id) }),
      });
      const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Aufnahme fehlgeschlagen.');
        return;
      }
      toast.info(data.message ?? 'Aufgenommen.');
      router.refresh();
    } catch {
      toast.error('Keine Verbindung zum Server. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/40 bg-violet-50 px-4 py-2 text-xs text-violet-900 sm:px-6 dark:bg-violet-950/40 dark:text-violet-100">
      <span className="flex items-center gap-1.5">
        <UserPlusIcon className="h-3.5 w-3.5" />
        Nur noch {state.open} offene A/B-Leads in Needle (Ziel: mindestens {state.threshold}).
      </span>
      {auto ? (
        <span className="flex items-center gap-1.5">
          {!autoMessage && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
          {autoMessage ?? `Nachschub läuft automatisch — „${state.campaignName ?? 'Needle-Kampagne'}“ versendet nichts.`}
        </span>
      ) : state.candidates.length > 0 ? (
        <>
          <span>
            {state.candidates.length} geprüfte Kandidaten bereit (
            {state.candidates.slice(0, 3).map((c) => c.company ?? c.name).join(', ')}
            {state.candidates.length > 3 ? ' …' : ''}). Die Kampagne versendet Nachrichten — Aufnahme bedeutet Kontaktaufnahme.
          </span>
          <Button size="sm" className="h-7 text-xs" onClick={() => void approve()} disabled={busy}>
            {busy && <Loader2Icon className="h-3 w-3 animate-spin" />}
            {state.candidates.length} in Kampagne aufnehmen
          </Button>
        </>
      ) : (
        <span>Keine geprüften Kandidaten — „Leads finden“ holt Nachschub.</span>
      )}
    </div>
  );
}
