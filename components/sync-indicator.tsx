'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';

interface SyncIndicatorProps {
  active: number;
  failed: number;
  creditExhausted?: boolean;
}

const POLL_MS = 5000;

/** Shows running background ICP checks (each ends with the Needle write-back) and polls until done. */
export function SyncIndicator({ active, failed, creditExhausted = false }: SyncIndicatorProps) {
  const router = useRouter();

  useEffect(() => {
    if (active === 0) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  if (active === 0 && failed === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/40 bg-sky-50 px-4 py-2 text-xs text-sky-800 sm:px-6 dark:bg-sky-950/40 dark:text-sky-200">
      {active > 0 && (
        <span className="flex items-center gap-1.5" role="status">
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
          {active} {active === 1 ? 'Lead wird' : 'Leads werden'} geprüft (ICP-Check) · Ergebnisse werden an Needle übertragen
        </span>
      )}
      {failed > 0 && (
        <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
          <AlertTriangleIcon className="h-3.5 w-3.5" />
          {creditExhausted
            ? `${failed} ICP-Check${failed === 1 ? '' : 's'} gestoppt: Claude-Guthaben aufgebraucht — in der Claude Console aufladen, dann „Offene ICP-Checks starten“.`
            : `${failed} ICP-Check${failed === 1 ? '' : 's'} fehlgeschlagen — „Offene ICP-Checks starten“ versucht es erneut`}
        </span>
      )}
    </div>
  );
}
