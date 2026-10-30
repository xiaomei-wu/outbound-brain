import { cn } from 'cn';
import type { Priority } from '@/lib/types';

interface PriorityConfig {
  label: string;
  className: string;
}

const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  high: {
    label: 'Hoch',
    className: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  },
  medium: {
    label: 'Mittel',
    className: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  },
  low: {
    label: 'Niedrig',
    className: 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200',
  },
  review: {
    label: 'Prüfen',
    className: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200',
  },
};

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const { label, className: badgeClass } = PRIORITY_CONFIG[priority];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
        badgeClass,
        className
      )}
    >
      {label}
    </span>
  );
}
