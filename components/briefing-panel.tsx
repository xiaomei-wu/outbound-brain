'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2Icon,
  SearchIcon,
  FileTextIcon,
  ExternalLinkIcon,
  AlertCircleIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { TriggerCard } from '@/components/trigger-card';
import { BantGrid } from '@/components/bant-grid';
import { ContextPanel } from '@/components/context-panel';
import type { CallBriefing, LeadContext, LeadTrigger } from '@/lib/types';

interface BriefingPanelProps {
  leadId: string;
  brief: CallBriefing | null;
  triggers: LeadTrigger[];
  contexts: LeadContext[];
}

export function BriefingPanel({
  leadId,
  brief: initialBrief,
  triggers: initialTriggers,
  contexts,
}: BriefingPanelProps) {
  const [brief, setBrief] = useState<CallBriefing | null>(initialBrief);
  const [triggers, setTriggers] = useState<LeadTrigger[]>(initialTriggers);
  const [isResearching, setIsResearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeTriggers = triggers.filter(
    (t) => t.isActive !== false && t.verdict !== 'reject'
  );
  const inactiveTriggers = triggers.filter(
    (t) => t.isActive === false
  );
  const rejectedTriggers = triggers.filter(
    (t) => t.verdict === 'reject' && t.isActive !== false
  );

  const canGenerate = activeTriggers.length > 0 || triggers.some((t) => !t.isAssumption);

  async function handleResearch() {
    setIsResearching(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/research`, { method: 'POST' });
      if (!res.ok) {
        toast.error(
          'Recherche fehlgeschlagen. API-Schlüssel auf der Integrationen-Seite prüfen.'
        );
        return;
      }
      const data = (await res.json()) as { triggers: LeadTrigger[] };
      setTriggers(data.triggers);
    } catch {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.');
    } finally {
      setIsResearching(false);
    }
  }

  async function handleGenerateBrief() {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/brief`, { method: 'POST' });
      if (!res.ok) {
        toast.error('Briefing konnte nicht erstellt werden. Bitte erneut versuchen.');
        return;
      }
      const data = (await res.json()) as { briefing: CallBriefing };
      setBrief(data.briefing);
    } catch {
      toast.error('Verbindungsfehler. Bitte erneut versuchen.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Brief content ── */}
      {brief ? (
        <>
          {/* Context */}
          {brief.context && (
            <BriefSection label="Kontext">
              <p className="text-sm text-foreground leading-relaxed">{brief.context}</p>
            </BriefSection>
          )}

          {/* Reason + evidence */}
          <BriefSection label="Gesprächsgrund">
            <p className="text-sm text-foreground leading-relaxed">{brief.whyNow}</p>
            {/* Source: Chat excerpt or public link */}
            {brief.evidenceNote && (
              <div className="mt-1.5 rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  Chat-Beleg
                </p>
                <p className="text-xs text-blue-900 leading-snug">{brief.evidenceNote}</p>
              </div>
            )}
            {brief.evidenceUrl && (
              <a
                href={brief.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                <ExternalLinkIcon className="h-3 w-3" />
                Quelle (öffentlich)
              </a>
            )}
          </BriefSection>

          {/* Opener */}
          <BriefSection label="Einstieg">
            <div className="rounded-lg bg-muted/60 border border-border px-4 py-3">
              <p className="text-sm leading-relaxed italic text-foreground">
                &ldquo;{brief.hook}&rdquo;
              </p>
            </div>
          </BriefSection>

          {/* Facts / Hypotheses / Open questions — visibly separated */}
          {(brief.facts.length > 0 ||
            brief.hypotheses.length > 0 ||
            brief.openQuestions.length > 0) && (
            <BriefSection label="Fakten · Hypothesen · Offene Fragen">
              <div className="flex flex-col gap-3">
                {brief.facts.length > 0 && (
                  <FactGroup
                    heading="Fakten"
                    headingClass="text-foreground"
                    dotClass="bg-emerald-500"
                    items={brief.facts}
                  />
                )}
                {brief.hypotheses.length > 0 && (
                  <FactGroup
                    heading="Hypothesen"
                    headingClass="text-amber-700"
                    dotClass="bg-amber-400"
                    items={brief.hypotheses}
                    italic
                  />
                )}
                {brief.openQuestions.length > 0 && (
                  <FactGroup
                    heading={`Offene Fragen (max. 3)`}
                    headingClass="text-blue-700"
                    dotClass="bg-blue-400"
                    items={brief.openQuestions}
                    numbered
                  />
                )}
              </div>
            </BriefSection>
          )}

          {/* BANT Grid */}
          <BriefSection label="BANT-Status">
            <BantGrid items={brief.bant} />
          </BriefSection>

          {/* Talking points (optional) */}
          {brief.talkingPoints.length > 0 && (
            <BriefSection label="Gesprächspunkte (optional)">
              <ol className="flex flex-col gap-2">
                {brief.talkingPoints.map((point, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ol>
            </BriefSection>
          )}

          {/* Objection answers — "Offene Frage" styled as question when no approved answer */}
          {brief.objections.length > 0 && (
            <BriefSection label="Einwände (optional)">
              <div className="flex flex-col gap-2">
                {brief.objections.map((obj, i) => {
                  const isOpenQuestion = obj.answer.startsWith('Offene Frage');
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5"
                    >
                      <p className="text-sm font-medium text-foreground">
                        &ldquo;{obj.objection}&rdquo;
                      </p>
                      {isOpenQuestion ? (
                        <p className="text-sm text-blue-700 italic">{obj.answer}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">→ {obj.answer}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </BriefSection>
          )}

          {/* Assumptions */}
          {brief.assumptions.length > 0 && (
            <BriefSection label="">
              <div className="flex items-start gap-1.5 mb-1">
                <AlertCircleIcon className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                  Annahmen (nicht verifiziert)
                </p>
              </div>
              <ul className="flex flex-col gap-1">
                {brief.assumptions.map((a, i) => (
                  <li
                    key={i}
                    className="text-xs text-amber-800 bg-amber-50 rounded px-2.5 py-1.5"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Existing chats */}
          <BriefSection label="Bisherige Kontakte">
            <ContextPanel contexts={contexts} />
          </BriefSection>

          {/* Re-research button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleResearch()}
            disabled={isResearching || isGenerating}
            className="w-fit text-muted-foreground"
          >
            {isResearching ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SearchIcon className="h-3.5 w-3.5" />
            )}
            Trigger neu recherchieren
          </Button>
        </>
      ) : (
        /* ── No brief yet ── */
        <div className="flex flex-col gap-4">
          {/* Existing chats always visible */}
          {contexts.length > 0 && (
            <BriefSection label="Bisherige Kontakte">
              <ContextPanel contexts={contexts} />
            </BriefSection>
          )}

          {/* Triggers */}
          {triggers.length > 0 ? (
            <BriefSection label="Trigger">
              <TriggerList
                activeTriggers={activeTriggers}
                inactiveTriggers={inactiveTriggers}
                rejectedTriggers={rejectedTriggers}
              />
            </BriefSection>
          ) : null}

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {triggers.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Noch keine Trigger recherchiert.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleResearch()}
                  disabled={isResearching}
                  className="w-fit"
                >
                  {isResearching ? (
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <SearchIcon className="h-3.5 w-3.5" />
                  )}
                  Recherche starten
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleResearch()}
                disabled={isResearching || isGenerating}
                className="w-fit text-muted-foreground"
              >
                {isResearching && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
                Trigger neu recherchieren
              </Button>
            )}

            {canGenerate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleGenerateBrief()}
                disabled={isGenerating || isResearching}
                className="w-fit"
              >
                {isGenerating ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileTextIcon className="h-3.5 w-3.5" />
                )}
                Briefing erstellen
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Triggers (shown separately when brief exists) ── */}
      {brief && triggers.length > 0 && (
        <BriefSection label="Trigger">
          <TriggerList
            activeTriggers={activeTriggers}
            inactiveTriggers={inactiveTriggers}
            rejectedTriggers={rejectedTriggers}
          />
        </BriefSection>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BriefSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h2>
      )}
      {children}
    </div>
  );
}

interface FactGroupProps {
  heading: string;
  headingClass: string;
  dotClass: string;
  items: string[];
  italic?: boolean;
  numbered?: boolean;
}

function FactGroup({
  heading,
  headingClass,
  dotClass,
  items,
  italic,
  numbered,
}: FactGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className={cn('h-2 w-2 rounded-full shrink-0', dotClass)} />
        <span className={cn('text-[10px] font-semibold uppercase tracking-wider', headingClass)}>
          {heading}
        </span>
      </div>
      <ul className="flex flex-col gap-1 pl-3.5">
        {items.map((item, i) => (
          <li key={i} className={cn('flex gap-2 text-sm text-foreground leading-snug', italic && 'italic')}>
            {numbered && (
              <span className="text-muted-foreground shrink-0 font-medium">{i + 1}.</span>
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TriggerListProps {
  activeTriggers: LeadTrigger[];
  inactiveTriggers: LeadTrigger[];
  rejectedTriggers: LeadTrigger[];
}

function TriggerList({
  activeTriggers,
  inactiveTriggers,
  rejectedTriggers,
}: TriggerListProps) {
  const primary = activeTriggers.find((t) => t.verdict === 'strong') ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* Active triggers — strong first, then usable */}
      {activeTriggers.length > 0 && (
        <div className="flex flex-col gap-2">
          {primary && <TriggerCard trigger={primary} />}
          {activeTriggers
            .filter((t) => t !== primary)
            .map((t) => (
              <TriggerCard key={t.id} trigger={t} compact={primary !== null} />
            ))}
        </div>
      )}

      {/* Inactive triggers — separate, grayed */}
      {inactiveTriggers.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Inaktiv (veraltet / nicht belegt)
          </p>
          {inactiveTriggers.map((t) => (
            <TriggerCard key={t.id} trigger={t} compact />
          ))}
        </div>
      )}

      {/* Rejected triggers */}
      {rejectedTriggers.length > 0 && (
        <div className="flex flex-col gap-2">
          {rejectedTriggers.map((t) => (
            <TriggerCard key={t.id} trigger={t} compact />
          ))}
        </div>
      )}

      {activeTriggers.length === 0 && inactiveTriggers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Keine aktiven Trigger gefunden. Recherche erneut starten oder Trigger-Katalog prüfen.
        </p>
      )}
    </div>
  );
}
