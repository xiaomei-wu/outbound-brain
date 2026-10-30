'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2Icon, ZapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EventType, Lead } from '@/lib/types';

const EVENT_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'meeting_request', label: 'Terminanfrage' },
  { value: 'positive_reply', label: 'Positive Antwort' },
  { value: 'not_now', label: 'Nicht jetzt' },
  { value: 'opt_out', label: 'Opt-out' },
  { value: 'new_trigger', label: 'Neuer Trigger' },
  { value: 'open', label: 'E-Mail geöffnet' },
  { value: 'click', label: 'Link geklickt' },
];

interface SimulateEventProps {
  leads: Pick<Lead, 'id' | 'name' | 'company'>[];
  onEventFired?: () => void;
}

export function SimulateEvent({ leads, onEventFired }: SimulateEventProps) {
  const [selectedLead, setSelectedLead] = useState<string>(leads[0]?.id ?? '');
  const [selectedType, setSelectedType] = useState<EventType>('positive_reply');
  const [isFiring, setIsFiring] = useState(false);

  async function handleFire() {
    if (!selectedLead || !selectedType) {
      toast.error('Bitte Lead und Ereignistyp auswählen.');
      return;
    }
    setIsFiring(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead,
          type: selectedType,
          evidence: 'Manuell ausgelöst via Cockpit – TEST',
          isTest: true,
        }),
      });
      if (!res.ok) {
        toast.error('Ereignis konnte nicht ausgelöst werden. Bitte erneut versuchen.');
        return;
      }
      const lead = leads.find((l) => l.id === selectedLead);
      toast.success(
        `TEST-Ereignis ausgelöst: ${EVENT_OPTIONS.find((e) => e.value === selectedType)?.label} für ${lead?.name ?? selectedLead}.`
      );
      onEventFired?.();
    } catch {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.');
    } finally {
      setIsFiring(false);
    }
  }

  const selectCls =
    'h-8 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none transition-colors';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded px-2 py-1">
        TEST
      </span>

      {/* Lead picker */}
      <select
        value={selectedLead}
        onChange={(e) => setSelectedLead(e.target.value)}
        className={selectCls}
        aria-label="Lead auswählen"
        disabled={isFiring}
      >
        {leads.map((lead) => (
          <option key={lead.id} value={lead.id}>
            {lead.name} {lead.company ? `· ${lead.company}` : ''}
          </option>
        ))}
      </select>

      {/* Event type picker */}
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value as EventType)}
        className={selectCls}
        aria-label="Ereignistyp auswählen"
        disabled={isFiring}
      >
        {EVENT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Fire button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleFire()}
        disabled={isFiring || !selectedLead}
      >
        {isFiring ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ZapIcon className="h-3.5 w-3.5" />
        )}
        Auslösen
      </Button>
    </div>
  );
}
