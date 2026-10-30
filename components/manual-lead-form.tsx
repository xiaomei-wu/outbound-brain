'use client';

import { useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Lead } from '@/lib/types';

interface CreatedLead {
  id: string;
  name: string;
}

export function ManualLeadForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [created, setCreated] = useState<CreatedLead | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const sizeRaw = (data.get('companySize') as string | null)?.trim();
    const body: Record<string, unknown> = {
      name: (data.get('name') as string).trim(),
    };

    const optionals: Array<[string, string]> = [
      ['role', 'role'],
      ['company', 'company'],
      ['companyDomain', 'companyDomain'],
      ['region', 'region'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['profileUrl', 'profileUrl'],
      ['note', 'note'],
    ];
    for (const [field, key] of optionals) {
      const val = (data.get(field) as string | null)?.trim();
      if (val) body[key] = val;
    }
    if (sizeRaw && !Number.isNaN(Number(sizeRaw))) {
      body['companySize'] = Number(sizeRaw);
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as { lead?: Lead; error?: string };

      if (!res.ok || !json.lead) {
        toast.error(json.error ?? 'Lead konnte nicht angelegt werden. Bitte erneut versuchen.');
        return;
      }

      setCreated({ id: json.lead.id, name: json.lead.name });
      form.reset();
    } catch {
      toast.error('Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Lead manuell anlegen</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Required */}
        <div className="flex flex-col gap-1">
          <Label htmlFor="ml-name">Name *</Label>
          <Input id="ml-name" name="name" required placeholder="Max Mustermann" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ml-role">Rolle</Label>
            <Input id="ml-role" name="role" placeholder="Head of Sales" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ml-company">Unternehmen</Label>
            <Input id="ml-company" name="company" placeholder="Muster GmbH" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ml-domain">Domain</Label>
            <Input id="ml-domain" name="companyDomain" placeholder="muster.de" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ml-size">Mitarbeiter</Label>
            <Input id="ml-size" name="companySize" type="number" min="1" placeholder="50" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ml-region">Region</Label>
            <Input id="ml-region" name="region" placeholder="DACH" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ml-phone">Telefon</Label>
            <Input id="ml-phone" name="phone" placeholder="+49 ..." />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ml-email">E-Mail</Label>
            <Input id="ml-email" name="email" type="email" placeholder="max@muster.de" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ml-profile">LinkedIn-URL</Label>
            <Input id="ml-profile" name="profileUrl" placeholder="https://linkedin.com/in/..." />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="ml-note">Notiz</Label>
          <Textarea
            id="ml-note"
            name="note"
            rows={3}
            placeholder="Hintergrund, Gesprächsanlass, …"
          />
        </div>

        <Button type="submit" disabled={isLoading} className="self-start">
          {isLoading ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Wird angelegt…
            </>
          ) : (
            'Lead anlegen'
          )}
        </Button>
      </form>

      {created && (
        <p className="text-sm text-muted-foreground">
          Lead angelegt:{' '}
          <a
            href={`/leads/${created.id}`}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {created.name} öffnen
          </a>
        </p>
      )}
    </div>
  );
}
