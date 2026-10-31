'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2Icon,
  UsersIcon,
  ZapIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { FindResult } from '@/lib/lead-find';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeadSourcesProps {
  hasNeedle: boolean;
  hasBlitz: boolean;
  hasAiArk: boolean;
  /** Compact layout for dashboard empty state */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// LeadSources component
// ---------------------------------------------------------------------------

export function LeadSources({ hasNeedle, hasBlitz, hasAiArk, compact = false }: LeadSourcesProps) {
  const router = useRouter();
  const [isFinding, startFinding] = useTransition();
  const [isCheckingIcp, startIcpCheck] = useTransition();
  const [findResults, setFindResults] = useState<FindResult[] | null>(null);

  const anyConnected = hasNeedle || hasBlitz || hasAiArk;

  async function handleFind() {
    setFindResults(null);
    startFinding(async () => {
      try {
        const res = await fetch('/api/leads/find', { method: 'POST' });
        const data: { results?: FindResult[]; error?: string } = await res.json().catch(() => ({}));

        if (!res.ok) {
          toast.error(data.error ?? 'Leads konnten nicht importiert werden.');
          return;
        }

        setFindResults(data.results ?? null);
        router.refresh();
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
      }
    });
  }

  async function handleIcpCheck() {
    startIcpCheck(async () => {
      try {
        const res = await fetch('/api/leads/icp-check-open', { method: 'POST' });
        if (!res.ok) {
          toast.error('ICP-Checks konnten nicht gestartet werden. Bitte erneut versuchen.');
          return;
        }
        const data: { scheduled?: number } = await res.json().catch(() => ({}));
        router.refresh();
        if ((data.scheduled ?? 0) === 0) {
          toast.info('Alle Leads wurden bereits geprüft oder haben keinen Unternehmensnamen.');
        }
        // No success toast — the result is visible in the lead list
      } catch {
        toast.error('Verbindungsfehler. Bitte erneut versuchen.');
      }
    });
  }

  if (!anyConnected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Keine Lead-Quelle verbunden — bitte{' '}
          <a href="/integrations" className="underline underline-offset-4 hover:text-foreground">
            Needle (empfohlen) oder BlitzAPI auf der Integrations-Seite verbinden
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Primary unified button */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={() => void handleFind()}
          disabled={isFinding || isCheckingIcp}
          size={compact ? 'sm' : 'default'}
        >
          {isFinding ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <UsersIcon className="h-4 w-4" />
          )}
          {isFinding ? 'Wird gesucht…' : 'Leads finden'}
        </Button>

        <Button
          variant="outline"
          onClick={() => void handleIcpCheck()}
          disabled={isFinding || isCheckingIcp}
          size={compact ? 'sm' : 'default'}
        >
          {isCheckingIcp ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <ZapIcon className="h-4 w-4" />
          )}
          Offene ICP-Checks starten (max. 10)
        </Button>
      </div>

      {/* Per-source result lines (shown after a find run) */}
      {findResults && (
        <div className="flex flex-col gap-1">
          {findResults.map((r) => (
            <div key={r.source} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {r.ok ? (
                <CheckCircle2Icon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              ) : (
                <XCircleIcon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              )}
              <span>{r.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
