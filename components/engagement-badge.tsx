import { cn } from '@/lib/utils';
import type { EngagementStage } from '@/lib/types';

const LABEL: Record<EngagementStage, string> = {
  invited: 'Einladung offen',
  connected: 'Vernetzt',
  messaged: 'Angeschrieben',
  replied: 'Geantwortet',
};

const STYLE: Record<EngagementStage, string> = {
  invited: 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200',
  connected: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  messaged: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  replied: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

/** Where the lead is in the Needle campaign; hidden for "replied" when a reply badge says more. */
export function EngagementBadge({ stage, hasReplySignal, className }: { stage: EngagementStage | null; hasReplySignal: boolean; className?: string }) {
  if (!stage || (stage === 'replied' && hasReplySignal)) return null;
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold', STYLE[stage], className)}>
      LinkedIn: {LABEL[stage]}
    </span>
  );
}
