import { cn } from 'cn';
import type { EvidenceSource, LeadTrigger, TriggerVerdict } from '@/lib/types';
import { ExternalLinkIcon, AlertCircleIcon, EyeOffIcon } from 'lucide-react';

interface VerdictConfig {
  label: string;
  className: string;
  dotClass: string;
}

const VERDICT_CONFIG: Record<TriggerVerdict, VerdictConfig> = {
  strong: {
    label: 'STARK',
    className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  usable: {
    label: 'BRAUCHBAR',
    className: 'bg-amber-100 text-amber-800 ring-amber-200',
    dotClass: 'bg-amber-500',
  },
  reject: {
    label: 'ABGELEHNT',
    className: 'bg-zinc-100 text-zinc-500 ring-zinc-200',
    dotClass: 'bg-zinc-400',
  },
};

const EVIDENCE_LABELS: Record<EvidenceSource, string> = {
  chat: 'Chat',
  call: 'Gespräch',
  public: 'Öffentlich',
  seller: 'Notiz',
};

interface TriggerCardProps {
  trigger: LeadTrigger;
  /** De-emphasised style for secondary triggers stacked below the primary. */
  compact?: boolean;
}

export function TriggerCard({ trigger, compact = false }: TriggerCardProps) {
  const cfg = VERDICT_CONFIG[trigger.verdict];
  const isInactive = trigger.isActive === false; // explicit false; undefined = active (pre-v2 seed)

  return (
    <div
      className={cn(
        'rounded-lg border p-3 flex flex-col gap-2',
        isInactive
          ? 'border-border/40 bg-muted/20 opacity-60'
          : compact
          ? 'border-border/50 bg-muted/30 opacity-80'
          : 'border-border bg-card',
        trigger.verdict === 'reject' && !isInactive && 'opacity-60'
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Verdict badge */}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider ring-1',
            cfg.className
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotClass)} />
          {cfg.label}
        </span>

        {/* Inactive label */}
        {isInactive && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500 bg-zinc-100 ring-1 ring-zinc-200 rounded px-1.5 py-0.5">
            <EyeOffIcon className="h-3 w-3" />
            Inaktiv
          </span>
        )}

        {/* Trigger type name */}
        <span
          className={cn(
            'text-sm font-medium',
            compact || isInactive ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {trigger.type}
        </span>

        {/* Evidence source chip */}
        {trigger.evidenceKind && (
          <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5 whitespace-nowrap">
            {EVIDENCE_LABELS[trigger.evidenceKind]}
          </span>
        )}

        {/* Assumption badge */}
        {trigger.isAssumption && (
          <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded px-1.5 py-0.5">
            <AlertCircleIcon className="h-3 w-3" />
            Annahme
          </span>
        )}
      </div>

      {/* Relevance scores — both shown with values */}
      {!compact && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Angebot{' '}
            <RelevanceScore value={trigger.offerRelevance} />
          </span>
          <span>·</span>
          <span>
            Person{' '}
            <RelevanceScore value={trigger.personRelevance} />
          </span>
        </div>
      )}

      {/* Content */}
      <p
        className={cn(
          'text-sm leading-relaxed',
          compact || isInactive ? 'text-muted-foreground text-xs' : 'text-foreground'
        )}
      >
        {trigger.content}
      </p>

      {/* Post-call feedback */}
      {trigger.feedback && (
        <FeedbackPill result={trigger.feedback} evidence={trigger.feedbackEvidence} />
      )}

      {/* Source link */}
      {trigger.sourceUrl && (
        <a
          href={trigger.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline w-fit"
        >
          <ExternalLinkIcon className="h-3 w-3" />
          Quelle ansehen
          {trigger.foundAt && (
            <span className="ml-1 not-italic">· {formatDate(trigger.foundAt)}</span>
          )}
        </a>
      )}
    </div>
  );
}

function RelevanceScore({ value }: { value: number }) {
  return (
    <span
      className={cn(
        'font-semibold',
        value >= 3
          ? 'text-emerald-700'
          : value >= 2
          ? 'text-amber-600'
          : 'text-foreground'
      )}
    >
      {value}/3
    </span>
  );
}

function FeedbackPill({
  result,
  evidence,
}: {
  result: NonNullable<LeadTrigger['feedback']>;
  evidence: string | null;
}) {
  const config = {
    confirmed: { label: 'Bestätigt', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' },
    contradicted: { label: 'Widerlegt', className: 'bg-red-50 text-red-800 ring-1 ring-red-200' },
    not_tested: { label: 'Nicht getestet', className: 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200' },
  } as const;

  const cfg = config[result];

  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider w-fit',
          cfg.className
        )}
      >
        {cfg.label}
      </span>
      {evidence && (
        <p className="text-[11px] text-muted-foreground italic">{evidence}</p>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}
