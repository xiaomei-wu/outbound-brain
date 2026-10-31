'use client';

import { cn } from 'cn';
import { originLabel } from '@/lib/origin';
import type { LeadOrigin } from '@/lib/types';

// ---------------------------------------------------------------------------
// Style map: each origin gets a distinct but calm color
// ---------------------------------------------------------------------------

const ORIGIN_STYLE: Record<LeadOrigin, string> = {
  needle_campaign: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  needle_search:   'bg-blue-50 text-blue-600 ring-1 ring-blue-200',
  blitz:           'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  ai_ark:          'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  csv:             'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200',
  manual:          'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200',
  prepared:        'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  test:            'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
};

interface OriginBadgeProps {
  origin: LeadOrigin;
  detail?: string | null;
  className?: string;
}

export function OriginBadge({ origin, detail, className }: OriginBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
        ORIGIN_STYLE[origin],
        className
      )}
    >
      {originLabel(origin, detail ?? null)}
    </span>
  );
}
