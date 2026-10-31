'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLinkIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { SortoutActions } from '@/components/sortout-actions';
import type { CompanyCheck, IcpScore, SortoutStatus } from '@/lib/types';
import type { RouteInfo } from '@/lib/icp/routing';

// ---------------------------------------------------------------------------
// Score badge
// ---------------------------------------------------------------------------

const SCORE_STYLE: Record<IcpScore, string> = {
  A: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  B: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
  C: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  D: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  nicht_bewertbar: 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200',
};

const SCORE_LABEL: Record<IcpScore, string> = {
  A: 'Score A',
  B: 'Score B',
  C: 'Score C',
  D: 'Score D',
  nicht_bewertbar: 'Nicht bewertbar',
};

// ---------------------------------------------------------------------------
// IcpPanel — shows company check + sort-out actions
// ---------------------------------------------------------------------------

interface IcpPanelProps {
  check: CompanyCheck;
  routeInfo: RouteInfo;
  leadId: string;
  sortoutStatus: SortoutStatus | null;
  sortoutSyncedNeedle: boolean;
}

export function IcpPanel({
  check,
  routeInfo,
  leadId,
  sortoutStatus,
  sortoutSyncedNeedle,
}: IcpPanelProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-4">
      {/* Header: company name + score badge */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            ICP-Check
          </p>
          <h3 className="text-sm font-semibold text-foreground">{check.companyName}</h3>
          {check.segments.length > 0 && (
            <p className="text-xs text-muted-foreground">{check.segments.join(', ')}</p>
          )}
        </div>
        <span
          className={cn(
            'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap',
            SCORE_STYLE[check.score]
          )}
        >
          {SCORE_LABEL[check.score]}
        </span>
      </div>

      {/* Was sie tun */}
      {check.whatTheyDo && (
        <Section label="Was sie tun">
          <p className="text-sm text-foreground leading-relaxed">{check.whatTheyDo}</p>
        </Section>
      )}

      {/* Fit-Signale */}
      {check.fitSignals.length > 0 && (
        <Section label="Fit-Signale">
          <ul className="flex flex-col gap-1.5">
            {check.fitSignals.map((signal, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="text-foreground">{signal.text}</span>
                {signal.url && /^https?:\/\//.test(signal.url) && (
                  <a
                    href={signal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    title={signal.url}
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Dagegen spricht */}
      {check.against.length > 0 && (
        <Section label="Dagegen spricht">
          <ul className="flex flex-col gap-1.5">
            {check.against.map((point, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">{point}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Entscheidung + Begründung */}
      <Section label="Entscheidung">
        <p className="text-sm font-medium text-foreground">{check.decision}</p>
        {check.decisionReason && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{check.decisionReason}</p>
        )}
      </Section>

      {/* Pain-Hypothese */}
      {check.painHypothesis && (
        <Section label="Pain-Hypothese">
          <p className="text-sm text-muted-foreground italic leading-relaxed">
            {check.painHypothesis}
          </p>
        </Section>
      )}

      {/* Sort-out actions (SDR triggers these; nothing written to Needle until clicked) */}
      <Section label="Aussortieren">
        <SortoutActions
          leadId={leadId}
          suggested={routeInfo.suggested}
          current={sortoutStatus}
          syncedToNeedle={sortoutSyncedNeedle}
        />
      </Section>

      {/* Checked-at timestamp */}
      <p className="text-[10px] text-muted-foreground/60">
        Geprüft {new Date(check.checkedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IcpCheckButton — shown when no check exists yet
// ---------------------------------------------------------------------------

interface IcpCheckButtonProps {
  leadId: string;
}

export function IcpCheckButton({ leadId }: IcpCheckButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleCheck() {
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}/icp-check`, { method: 'POST' });
        if (!res.ok) {
          const data: { error?: string } = await res.json().catch(() => ({}));
          toast.error(data.error ?? 'ICP-Check fehlgeschlagen. Bitte erneut versuchen.');
          setErrorMsg(data.error ?? null);
          return;
        }
        router.refresh();
      } catch {
        toast.error('Keine Verbindung zum Server. Bitte erneut versuchen.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        ICP-Check
      </p>
      <p className="text-sm text-muted-foreground">
        Noch kein ICP-Check für dieses Unternehmen vorhanden.
      </p>
      {errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}
      <Button
        size="sm"
        className="w-fit"
        onClick={() => void handleCheck()}
        disabled={isPending}
      >
        {isPending && <Loader2Icon className="h-4 w-4 animate-spin" />}
        ICP-Check starten
      </Button>
    </div>
  );
}
