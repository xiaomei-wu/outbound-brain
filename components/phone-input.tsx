'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon, PhoneIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PhoneInputProps {
  leadId: string;
}

/** Shown when a lead has no phone number (e.g. LinkedIn imports); saves it and refreshes the call view. */
export function PhoneInput({ leadId }: PhoneInputProps) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Telefonnummer konnte nicht gespeichert werden.');
        return;
      }
      router.refresh();
    } catch {
      toast.error('Keine Verbindung zum Server. Bitte erneut versuchen.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <PhoneIcon className="h-4 w-4" />
        Telefonnummer fehlt – bitte ergänzen.
      </span>
      <div className="flex gap-2">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+49 30 1234567"
          inputMode="tel"
        />
        <Button onClick={() => void handleSave()} disabled={isSaving || phone.trim().length < 6}>
          {isSaving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          Speichern
        </Button>
      </div>
    </div>
  );
}
