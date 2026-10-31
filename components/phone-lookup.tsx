'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon, PhoneIcon, AlertTriangleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface PhoneLookupProps {
  leadId: string;
  hasLusha: boolean;
  hasBlitz: boolean;
  hasAiArk: boolean;
  /** The cheaper chain already ran without a hit (bulk search): offer Lusha directly. */
  chainTried: boolean;
  /** Controls whether this component is rendered (Task 6 wires the condition). */
  visible: boolean;
}

type SearchResult = {
  found: boolean;
  lushaId?: string;
  credits?: number | null;
  message: string;
};

type RevealResult = {
  phone?: string;
  dnc?: boolean;
  message: string;
};

type ChainResult = { found: boolean; message: string };

/**
 * On-click phone lookup chain: AI Ark → BlitzAPI (US only) on the server, then Lusha as the
 * last resort, offered with its credit cost only when the cheaper sources found nothing.
 * Rendered next to <PhoneInput> when a lead has no phone number.
 * Only shown when visible=true (Task 6 gates on ICP score A/B).
 */
export function PhoneLookup({ leadId, hasLusha, hasBlitz, hasAiArk, chainTried, visible }: PhoneLookupProps) {
  const router = useRouter();

  type LookupState = 'idle' | 'chain' | 'searching' | 'awaiting_confirm' | 'revealing' | 'done_dnc' | 'done';
  const [state, setState] = useState<LookupState>('idle');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [dncMessage, setDncMessage] = useState<string | null>(null);
  const [chainMessage, setChainMessage] = useState<string | null>(
    chainTried ? 'Keine Nummer über AI Ark / BlitzAPI gefunden.' : null,
  );

  // Compute before TypeScript narrows `state` in render branches
  const isSearching = state === 'searching' || state === 'chain';
  const hasChain = hasAiArk || hasBlitz;
  const isRevealing = state === 'revealing';

  if (!visible) return null;
  if (!hasLusha && !hasChain) return null;

  /** Step 1: cheaper sources on the server; falls through to the Lusha offer. */
  async function handleFind() {
    if (!hasChain) {
      await handleSearch();
      return;
    }
    setState('chain');
    try {
      const res = await fetch(`/api/leads/${leadId}/phone-lookup/chain`, { method: 'POST' });
      const data: ChainResult = await res.json().catch(() => ({ found: false, message: 'Unbekannter Fehler.' }));
      if (data.found) {
        setState('done');
        router.refresh();
        return;
      }
      setChainMessage(data.message);
      setState('idle');
    } catch {
      toast.error('Keine Verbindung zum Server. Bitte erneut versuchen.');
      setState('idle');
    }
  }

  /** Last resort: Lusha search, then reveal after confirmation. */
  async function handleSearch() {
    setState('searching');
    try {
      const res = await fetch(`/api/leads/${leadId}/phone-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'search' }),
      });
      const data: SearchResult = await res.json().catch(() => ({ found: false, message: 'Unbekannter Fehler.' }));

      if (!res.ok || !data.found) {
        toast.error(data.message || 'Lusha hat keinen Kontakt gefunden.');
        setState('idle');
        return;
      }

      setSearchResult(data);
      setState('awaiting_confirm');
    } catch {
      toast.error('Keine Verbindung zum Server. Bitte erneut versuchen.');
      setState('idle');
    }
  }

  async function handleReveal() {
    if (!searchResult?.lushaId) return;
    setState('revealing');
    try {
      const res = await fetch(`/api/leads/${leadId}/phone-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'reveal', lushaId: searchResult.lushaId }),
      });
      const data: RevealResult = await res.json().catch(() => ({ message: 'Unbekannter Fehler.' }));

      if (!res.ok) {
        toast.error(data.message || 'Nummer konnte nicht aufgedeckt werden.');
        setState('awaiting_confirm');
        return;
      }

      if (data.dnc) {
        setDncMessage(data.message);
        setState('done_dnc');
        return;
      }

      if (data.phone) {
        setState('done');
        router.refresh();
        return;
      }

      // No phone found
      toast.error(data.message || 'Keine Nummer gefunden.');
      setState('idle');
    } catch {
      toast.error('Keine Verbindung zum Server. Bitte erneut versuchen.');
      setState('awaiting_confirm');
    }
  }

  function handleCancel() {
    setState('idle');
    setSearchResult(null);
  }

  if (state === 'done') return null;

  if (state === 'done_dnc') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{dncMessage ?? 'Nicht anrufen (DNC-Kennzeichen).'}</span>
      </div>
    );
  }

  if (state === 'awaiting_confirm' && searchResult) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <PhoneIcon className="h-4 w-4" />
          {searchResult.message}
        </span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void handleReveal()} disabled={isRevealing}>
            {isRevealing && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Aufdecken
          </Button>
          <Button size="sm" variant="outline" onClick={handleCancel}>
            Abbrechen
          </Button>
        </div>
      </div>
    );
  }

  // Cheaper sources found nothing: offer Lusha as the last resort
  if (chainMessage) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <PhoneIcon className="h-4 w-4" />
          {chainMessage}
        </span>
        {hasLusha ? (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => void handleSearch()} disabled={isSearching}>
            {isSearching && <Loader2Icon className="h-4 w-4 animate-spin" />}
            Letzte Option: Lusha suchen (kostet Credits)
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Lusha ist nicht verbunden — Nummer bitte manuell eintragen.</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <PhoneIcon className="h-4 w-4" />
        {hasChain
          ? 'Nummer suchen: erst AI Ark / BlitzAPI, Lusha nur als letzte Option.'
          : 'Nummer über Lusha suchen (kostet Credits).'}
      </span>
      <Button size="sm" className="w-fit" onClick={() => void handleFind()} disabled={isSearching}>
        {isSearching && <Loader2Icon className="h-4 w-4 animate-spin" />}
        Nummer suchen
      </Button>
    </div>
  );
}
