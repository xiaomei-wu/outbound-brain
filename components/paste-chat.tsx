'use client';

import { useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ContextKind, PriorityResult } from '@/lib/types';

interface PasteChatProps {
  leadId: string;
  leadName: string;
}

const KIND_OPTIONS: Array<{ value: ContextKind; label: string }> = [
  { value: 'chat', label: 'Chat' },
  { value: 'email', label: 'E-Mail' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'note', label: 'Notiz' },
];

export function PasteChat({ leadId, leadName }: PasteChatProps) {
  const [kind, setKind] = useState<ContextKind>('chat');
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ added: number; priority: PriorityResult } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!text.trim()) {
      toast.error('Bitte Text einfügen, bevor Sie speichern.');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/leads/${leadId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, text: text.trim() }),
      });

      const json = (await res.json()) as { added?: number; priority?: PriorityResult; error?: string };

      if (!res.ok || json.added === undefined) {
        toast.error(json.error ?? 'Kontext konnte nicht gespeichert werden. Bitte erneut versuchen.');
        return;
      }

      setResult({ added: json.added, priority: json.priority! });
      setText('');
    } catch {
      toast.error('Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Kontext hinzufügen – {leadName}</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pc-kind">Art</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as ContextKind)}>
            <SelectTrigger id="pc-kind" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="pc-text">Chat oder E-Mail einfügen</Label>
          <Textarea
            id="pc-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={
              kind === 'note'
                ? 'Interne Notiz …'
                : 'Max Müller: Hallo, wir suchen gerade nach einer Lösung für …\nVerkäufer: Danke für Ihre Nachricht …'
            }
          />
        </div>

        <Button type="submit" disabled={isLoading || !text.trim()} className="self-start">
          {isLoading ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Wird gespeichert…
            </>
          ) : (
            'Kontext hinzufügen'
          )}
        </Button>
      </form>

      {result && (
        <p className="text-sm text-muted-foreground">
          {result.added === 1
            ? '1 Nachricht hinzugefügt'
            : `${result.added} Nachrichten hinzugefügt`}{' '}
          – Briefing wird beim nächsten Erzeugen aktualisiert.
        </p>
      )}
    </div>
  );
}
