import { cn } from 'cn';
import type { Decision, EventType, LeadEvent, NextAction } from '@/lib/types';
import {
  CalendarCheckIcon,
  MessageCircleIcon,
  ClockIcon,
  BanIcon,
  ZapIcon,
  MailOpenIcon,
  MousePointerClickIcon,
  ArrowRightIcon,
} from 'lucide-react';

const EVENT_LABELS: Record<EventType, string> = {
  meeting_request: 'Terminanfrage',
  positive_reply: 'Positive Antwort',
  not_now: 'Nicht jetzt',
  opt_out: 'Opt-out',
  new_trigger: 'Neuer Trigger',
  open: 'E-Mail geöffnet',
  click: 'Link geklickt',
};

const ACTION_LABELS: Record<NextAction, string> = {
  call_now: 'Jetzt anrufen',
  reply: 'Antworten',
  research: 'Recherchieren',
  follow_up: 'Nachfassen',
  wait: 'Abwarten',
  stop: 'Stoppen',
  demo_handoff: 'Demo-Übergabe',
  identify_contact: 'Kontakt identifizieren',
};

function EventIcon({ type }: { type: EventType }) {
  const cls = 'h-3.5 w-3.5';
  switch (type) {
    case 'meeting_request':
      return <CalendarCheckIcon className={cn(cls, 'text-emerald-600')} />;
    case 'positive_reply':
      return <MessageCircleIcon className={cn(cls, 'text-emerald-600')} />;
    case 'not_now':
      return <ClockIcon className={cn(cls, 'text-amber-500')} />;
    case 'opt_out':
      return <BanIcon className={cn(cls, 'text-destructive')} />;
    case 'new_trigger':
      return <ZapIcon className={cn(cls, 'text-blue-500')} />;
    case 'open':
      return <MailOpenIcon className={cn(cls, 'text-zinc-400')} />;
    case 'click':
      return <MousePointerClickIcon className={cn(cls, 'text-zinc-400')} />;
  }
}

type TimelineItem =
  | { kind: 'event'; data: LeadEvent }
  | { kind: 'decision'; data: Decision };

interface EventTimelineProps {
  events: LeadEvent[];
  decisions: Decision[];
}

export function EventTimeline({ events, decisions }: EventTimelineProps) {
  if (events.length === 0 && decisions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Noch keine Signale oder Entscheidungen.
      </p>
    );
  }

  const items: TimelineItem[] = [
    ...events.map((e): TimelineItem => ({ kind: 'event', data: e })),
    ...decisions.map((d): TimelineItem => ({ kind: 'decision', data: d })),
  ].sort((a, b) => {
    const aTime = a.kind === 'event' ? a.data.occurredAt : a.data.createdAt;
    const bTime = b.kind === 'event' ? b.data.occurredAt : b.data.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime(); // newest first
  });

  return (
    <div className="flex flex-col">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-3 py-2 border-b border-border/40 last:border-0">
          {/* Icon column */}
          <div className="flex flex-col items-center pt-0.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
              {item.kind === 'event' ? (
                <EventIcon type={item.data.type} />
              ) : (
                <ArrowRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {item.kind === 'event'
                  ? EVENT_LABELS[item.data.type]
                  : `Entscheidung: ${ACTION_LABELS[item.data.action]}`}
              </span>
              {item.kind === 'event' && item.data.isTest && (
                <span className="text-[9px] font-bold tracking-wider bg-amber-100 text-amber-800 ring-1 ring-amber-200 rounded px-1.5 py-0.5">
                  TEST
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
                {formatRelative(
                  item.kind === 'event'
                    ? item.data.occurredAt
                    : item.data.createdAt
                )}
              </span>
            </div>
            {item.kind === 'event' && item.data.evidence && (
              <p className="text-xs text-muted-foreground truncate">
                {item.data.evidence}
              </p>
            )}
            {item.kind === 'decision' && (
              <p className="text-xs text-muted-foreground">{item.data.reason}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'gerade eben';
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'gestern';
    if (days < 7) return `vor ${days} Tagen`;
    return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}
