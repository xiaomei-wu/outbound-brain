import type { CallBriefing, Lead } from '@/lib/types';
import { ExternalLinkIcon, SlashIcon } from 'lucide-react';

interface SlackFallbackCardProps {
  brief: CallBriefing;
  lead: Pick<Lead, 'id' | 'name' | 'company'>;
  appUrl: string;
}

/**
 * Renders a Slack-style briefing card inline — shown when the Slack webhook
 * failed so the caller still has access to the briefing in the UI.
 */
export function SlackFallbackCard({ brief, lead, appUrl }: SlackFallbackCardProps) {
  const callUrl = `${appUrl}/leads/${lead.id}`;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      {/* Warning banner */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-200 bg-amber-100">
        <SlashIcon className="h-3.5 w-3.5 text-amber-700" />
        <span className="text-xs font-semibold text-amber-800">
          Slack-Briefing konnte nicht gesendet werden – hier ist die Zusammenfassung:
        </span>
      </div>

      {/* Card body — mirrors Slack Block Kit layout */}
      <div className="px-4 py-3 flex flex-col gap-3">
        {/* Header */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Neuer Anruf-Hinweis
          </p>
          <p className="text-base font-semibold leading-snug mt-0.5">
            {brief.headline}
          </p>
        </div>

        {/* Who */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Field label="Kontakt" value={brief.contact} />
          <Field label="Ziel" value={brief.goal} />
        </div>

        {/* Why now */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Warum jetzt
          </p>
          <p className="text-sm text-foreground">{brief.whyNow}</p>
          {brief.evidenceUrl && (
            <a
              href={brief.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline mt-1"
            >
              <ExternalLinkIcon className="h-3 w-3" />
              Quelle
            </a>
          )}
        </div>

        {/* Hook */}
        <div className="rounded-md bg-white ring-1 ring-border px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Einstieg
          </p>
          <p className="text-sm italic text-foreground">&ldquo;{brief.hook}&rdquo;</p>
        </div>

        {/* Talking points */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Gesprächspunkte
          </p>
          <ol className="flex flex-col gap-1">
            {brief.talkingPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="font-semibold text-muted-foreground shrink-0 w-4">
                  {i + 1}.
                </span>
                {point}
              </li>
            ))}
          </ol>
        </div>

        {/* Meeting slots */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Terminvorschläge:</span>
          {brief.meetingSlots.map((slot) => (
            <span
              key={slot}
              className="text-xs font-medium rounded-full bg-white ring-1 ring-border px-2.5 py-0.5"
            >
              {slot}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="flex gap-2 pt-1">
          <a
            href={callUrl}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-80 transition-opacity"
          >
            Zur Anruf-Ansicht
          </a>
          {brief.phone && (
            <a
              href={`tel:${brief.phone}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-white ring-1 ring-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              {brief.phone}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
