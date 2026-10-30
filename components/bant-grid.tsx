import { cn } from 'cn';
import type { BantDimension, ClaimStatus } from '@/lib/types';

const DIMENSION_LABELS: Record<BantDimension, string> = {
  budget: 'Budget',
  authority: 'Autorität',
  need: 'Bedarf',
  timeline: 'Zeitplan',
};

interface StatusConfig {
  label: string;
  dot: string;
  chip: string;
}

const STATUS_CONFIG: Record<ClaimStatus, StatusConfig> = {
  confirmed: {
    label: 'Bestätigt',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
  },
  assumed: {
    label: 'Angenommen',
    dot: 'bg-amber-400',
    chip: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  },
  open: {
    label: 'Offen',
    dot: 'bg-zinc-300',
    chip: 'bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200',
  },
};

/** Shared shape accepted by both CallBriefing.bant and BantUpdate[] from evaluation. */
export interface BantItem {
  dimension: BantDimension;
  status: ClaimStatus;
  value: string | null;
  evidence: string | null;
}

interface BantGridProps {
  items: BantItem[];
}

const DIMENSIONS: BantDimension[] = ['budget', 'authority', 'need', 'timeline'];

export function BantGrid({ items }: BantGridProps) {
  const map = new Map(items.map((i) => [i.dimension, i]));
  const rows: BantItem[] = DIMENSIONS.map(
    (d) => map.get(d) ?? { dimension: d, status: 'open', value: null, evidence: null }
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map((item) => (
        <BantCell key={item.dimension} item={item} />
      ))}
    </div>
  );
}

function BantCell({ item }: { item: BantItem }) {
  const { label, dot, chip } = STATUS_CONFIG[item.status];

  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-foreground">
          {DIMENSION_LABELS[item.dimension]}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
            chip
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} />
          {label}
        </span>
      </div>

      {item.value ? (
        <p className="text-xs text-foreground leading-snug">{item.value}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">Noch nicht bekannt</p>
      )}

      {item.evidence && (
        <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-1 leading-snug italic">
          {item.evidence}
        </p>
      )}
    </div>
  );
}
