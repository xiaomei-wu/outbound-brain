'use client';

import * as React from 'react';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Lead } from '@/lib/types';

interface ImportResult {
  lead: Lead;
  imported: { messages: number; posts: number };
}

export function LinkedinImport() {
  const [profileUrl, setProfileUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!profileUrl.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/leads/import-linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: profileUrl.trim() }),
      });

      const data = (await res.json()) as
        | ImportResult
        | { error: string };

      if (!res.ok || 'error' in data) {
        const msg = 'error' in data ? data.error : 'Unbekannter Fehler – bitte erneut versuchen.';
        toast.error(msg);
        return;
      }

      setResult(data);
    } catch {
      toast.error('Netzwerkfehler – bitte Verbindung prüfen und erneut versuchen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleImport} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="linkedin-url">LinkedIn-Profil-URL</Label>
        <Input
          id="linkedin-url"
          type="url"
          placeholder="https://www.linkedin.com/in/muster-person/"
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          disabled={loading}
          required
        />
      </div>

      <Button type="submit" disabled={loading || !profileUrl.trim()} className="self-start">
        {loading ? (
          <>
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            Wird übernommen …
          </>
        ) : (
          'Lead übernehmen'
        )}
      </Button>

      {result && (
        <p className="text-sm text-muted-foreground">
          Übernommen: {result.imported.messages} Nachrichten, {result.imported.posts} Posts →{' '}
          <a
            href={`/leads/${result.lead.id}`}
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            Lead öffnen
          </a>
        </p>
      )}
    </form>
  );
}
