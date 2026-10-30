'use client';

import { useRef, useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export function CsvImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const file = inputRef.current?.files?.[0];
    if (!file) {
      toast.error('Bitte eine CSV-Datei auswählen.');
      return;
    }

    let csvText: string;
    try {
      csvText = await file.text();
    } catch {
      toast.error('Datei konnte nicht gelesen werden. Bitte erneut versuchen.');
      return;
    }

    if (!csvText.trim()) {
      toast.error('Die CSV-Datei ist leer.');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/leads/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText,
      });

      const json = (await res.json()) as ImportResult & { error?: string };

      if (!res.ok) {
        toast.error(json.error ?? 'Import fehlgeschlagen. Bitte erneut versuchen.');
        return;
      }

      setResult(json);
      if (inputRef.current) inputRef.current.value = '';
    } catch {
      toast.error('Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Leads importieren (CSV)</h2>

      <p className="text-sm text-muted-foreground">
        Spalten: <code className="font-mono text-xs">name, role, company, domain, size, region, phone, email, linkedin</code>
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="csv-file">CSV-Datei</Label>
          <Input
            id="csv-file"
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
          />
        </div>

        <Button type="submit" disabled={isLoading} className="self-start">
          {isLoading ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Wird importiert…
            </>
          ) : (
            'Importieren'
          )}
        </Button>
      </form>

      {result && (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <span className="font-medium">{result.created}</span> angelegt,{' '}
            <span className="font-medium">{result.skipped}</span> übersprungen.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
              {result.errors.map((err, i) => (
                <li key={i} className="text-xs">
                  {err}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
