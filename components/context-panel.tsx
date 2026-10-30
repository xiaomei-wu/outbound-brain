'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, MessageSquareIcon } from 'lucide-react';
import { cn } from 'cn';
import type { LeadContext } from '@/lib/types';

const KIND_LABELS: Record<LeadContext['kind'], string> = {
  chat: 'Chat',
  email: 'E-Mail',
  linkedin: 'LinkedIn',
  note: 'Notiz',
};

interface ContextPanelProps {
  contexts: LeadContext[];
}

export function ContextPanel({ contexts }: ContextPanelProps) {
  const [open, setOpen] = useState(false);

  if (contexts.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Keine bisherigen Kontakte gespeichert.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-fit"
        aria-expanded={open}
      >
        <MessageSquareIcon className="h-3.5 w-3.5" />
        {contexts.length}{' '}
        {contexts.length === 1 ? 'bisherigen Kontakt' : 'bisherige Kontakte'} anzeigen
        {open ? (
          <ChevronUpIcon className="h-3.5 w-3.5" />
        ) : (
          <ChevronDownIcon className="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          {contexts.map((ctx) => (
            <ContextItem key={ctx.id} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContextItem({ ctx }: { ctx: LeadContext }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 flex flex-col gap-1.5',
        ctx.author === 'contact'
          ? 'border-blue-100 bg-blue-50/40'
          : 'border-border bg-muted/20'
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {KIND_LABELS[ctx.kind]}
        </span>
        <span
          className={cn(
            'text-[10px] font-medium rounded px-1.5 py-0.5',
            ctx.author === 'contact'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-zinc-100 text-zinc-600'
          )}
        >
          {ctx.author === 'contact' ? 'Kontakt' : 'Seller'}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
          {formatDate(ctx.occurredAt)}
        </span>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{ctx.content}</p>

      {ctx.sourceUrl && (
        <a
          href={ctx.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline w-fit"
        >
          Quelle ansehen
        </a>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
