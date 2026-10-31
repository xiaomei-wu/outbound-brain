import { MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReplySignal } from '@/lib/types';

export const REPLY_LABEL: Record<ReplySignal, string> = {
  call_request: 'Gesprächswunsch',
  interested: 'Interesse',
  later: 'Später melden',
  not_interested: 'Kein Interesse',
  opt_out: 'Nicht mehr kontaktieren',
  wrong_contact: 'Nicht zuständig',
  disqualifier: 'Ausschlussgrund',
  neutral: 'Antwort',
};

const REPLY_STYLE: Record<ReplySignal, string> = {
  call_request: 'bg-emerald-600 text-white ring-1 ring-emerald-700',
  interested: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  later: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  not_interested: 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200',
  opt_out: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  wrong_contact: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  disqualifier: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  neutral: 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200',
};

/** Marks leads whose own written reply says something; nothing for leads without a reply. */
export function ReplyBadge({ signal, className }: { signal: ReplySignal | null; className?: string }) {
  if (!signal || signal === 'neutral') return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold', REPLY_STYLE[signal], className)}>
      <MessageCircleIcon className="h-3 w-3" />
      {REPLY_LABEL[signal]}
    </span>
  );
}
