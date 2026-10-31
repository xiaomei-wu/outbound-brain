'use client';

import { ExternalLinkIcon } from 'lucide-react';
import type { CallCard as CallCardType } from '@/lib/types';

// ---------------------------------------------------------------------------
// CallCard — renders the per-lead call card in PDF order (A/B leads only)
// ---------------------------------------------------------------------------

interface CallCardProps {
  card: CallCardType;
}

export function CallCard({ card }: CallCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Anruf-Vorbereitung
      </p>

      {/* 1. Anlass (with optional URL) */}
      <Section label="Anlass">
        <p className="text-sm text-foreground leading-relaxed">
          {card.anlass}
          {card.anlassUrl && (
            <a
              href={card.anlassUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1.5 inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
              title={card.anlassUrl}
            >
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          )}
        </p>
      </Section>

      {/* 2. Anruf-Einstieg (verbatim; in a quote block per spec) */}
      <Section label="Anruf-Einstieg (≤ 40 s)">
        <blockquote className="border-l-2 border-foreground/20 pl-3 text-sm text-foreground leading-relaxed italic">
          {card.opener}
        </blockquote>
      </Section>

      {/* 3. Wenn die Person andockt — Vertiefungsfragen (2) */}
      {card.followUps.length > 0 && (
        <Section label="Wenn die Person andockt">
          <ol className="flex flex-col gap-1.5 list-decimal list-inside">
            {card.followUps.map((q, i) => (
              <li key={i} className="text-sm text-foreground leading-relaxed">
                {q}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* 4. Wahrscheinlichster Einwand / Umgang */}
      <Section label="Wahrscheinlichster Einwand">
        <div className="flex flex-col gap-1.5 rounded-md bg-muted/50 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Einwand</p>
          <p className="text-sm text-foreground">{card.objection.expected}</p>
          <p className="text-xs font-medium text-muted-foreground mt-1">Umgang</p>
          <p className="text-sm text-foreground">{card.objection.response}</p>
        </div>
      </Section>

      {/* 5. Offene Frage vor dem Kontakt */}
      {card.openQuestion && (
        <Section label="Offene Frage vor dem Kontakt">
          <p className="text-sm text-muted-foreground italic leading-relaxed">
            {card.openQuestion}
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
