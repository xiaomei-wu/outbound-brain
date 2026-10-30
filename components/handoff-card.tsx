import { cn } from 'cn';
import { CheckCircleIcon, CircleDotIcon, CircleIcon } from 'lucide-react';
import type { DemoHandoff } from '@/lib/types';
import { BantGrid, type BantItem } from '@/components/bant-grid';

interface HandoffCardProps {
  handoff: DemoHandoff;
  demoReady: boolean;
}

export function HandoffCard({ handoff, demoReady }: HandoffCardProps) {
  const bantItems: BantItem[] = handoff.bant.map((b) => ({
    dimension: b.dimension,
    status: b.status,
    value: b.value,
    evidence: b.evidence,
  }));

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground">Demo-Übergabe</h3>
        <div className="ml-auto flex items-center gap-2">
          {demoReady ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300">
              <CheckCircleIcon className="h-3 w-3" />
              Demo-ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200">
              <CircleIcon className="h-3 w-3" />
              Nicht demo-ready
            </span>
          )}
        </div>
      </div>

      {/* Company / ICP */}
      <HandoffSection label="Unternehmen / ICP">
        <p className="text-sm text-foreground">{handoff.companyIcp}</p>
      </HandoffSection>

      {/* Participants */}
      <HandoffSection label="Beteiligte">
        {handoff.participants.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {handoff.participants.map((p, i) => (
              <li key={i} className="text-sm text-foreground">
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">Noch nicht bekannt</p>
        )}
      </HandoffSection>

      {/* Use case */}
      {handoff.useCase && (
        <HandoffSection label="Anwendungsfall / Bedarf">
          <p className="text-sm text-foreground">{handoff.useCase}</p>
          {handoff.useCaseEvidence && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              Beleg: {handoff.useCaseEvidence}
            </p>
          )}
        </HandoffSection>
      )}

      {/* BANT */}
      <HandoffSection label="BANT-Status">
        <BantGrid items={bantItems} />
      </HandoffSection>

      {/* Demo objective */}
      {handoff.demoObjective && (
        <HandoffSection label="Demo-Ziel">
          <div className="flex items-start gap-2">
            <ObjectiveIcon status={handoff.objectiveStatus} />
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-sm text-foreground">{handoff.demoObjective}</p>
              <span
                className={cn(
                  'text-[10px] font-medium rounded px-1.5 py-0.5 w-fit',
                  handoff.objectiveStatus === 'agreed'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                )}
              >
                {handoff.objectiveStatus === 'agreed' ? 'Vereinbart' : 'Vorgeschlagen'}
              </span>
            </div>
          </div>
        </HandoffSection>
      )}

      {/* Demo suggestion — always marked as system suggestion */}
      {handoff.demoSuggestion && (
        <HandoffSection label="Demo-Vorschlag">
          <div className="rounded-md bg-muted/40 border border-border px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Systemvorschlag – kein Kundenzusage
            </p>
            <p className="text-sm text-foreground">{handoff.demoSuggestion}</p>
          </div>
        </HandoffSection>
      )}

      {/* Next action */}
      <HandoffSection label="Nächster Schritt">
        <p className="text-sm text-foreground">{handoff.nextAction}</p>
      </HandoffSection>

      {/* Open questions */}
      {handoff.openQuestions.length > 0 && (
        <HandoffSection label="Offene Fragen">
          <ul className="flex flex-col gap-1">
            {handoff.openQuestions.map((q, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="text-muted-foreground shrink-0">·</span>
                {q}
              </li>
            ))}
          </ul>
        </HandoffSection>
      )}
    </div>
  );
}

function HandoffSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function ObjectiveIcon({ status }: { status: DemoHandoff['objectiveStatus'] }) {
  if (status === 'agreed') {
    return <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
  }
  return <CircleDotIcon className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />;
}
