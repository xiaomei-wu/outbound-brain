import type { Lead, LeadTrigger } from '@/lib/types';
import { getDb } from '@/lib/db';
import { toLead, toLeadTrigger, type LeadRow, type LeadTriggerRow } from '@/lib/mappers';
import { getCredentials } from '@/lib/connectors';
import { LeadTable } from '@/components/lead-table';
import { FunnelLine } from '@/components/funnel-line';
import { DbError } from '@/components/db-error';

export const dynamic = 'force-dynamic';

interface CockpitData {
  leads: Lead[];
  triggersMap: Record<string, LeadTrigger | null>;
  hasNeedle: boolean;
  hasBlitz: boolean;
  hasAiArk: boolean;
}

/** Loads all leads, best trigger per lead, and connector connectivity. */
async function fetchCockpitData(): Promise<CockpitData | null> {
  try {
    const db = getDb();

    const [leadRes, credsResults] = await Promise.all([
      db.from('lead').select('*'),
      Promise.all([
        getCredentials('needle'),
        getCredentials('blitz'),
        getCredentials('ai_ark'),
      ]),
    ]);

    if (leadRes.error || !leadRes.data) return null;

    const leads = (leadRes.data as LeadRow[]).map(toLead);
    const leadIds = leads.map((l) => l.id);
    const triggersMap: Record<string, LeadTrigger | null> = {};

    if (leadIds.length > 0) {
      const { data: triggerRows, error: trigError } = await db
        .from('lead_trigger')
        .select('*')
        .in('lead_id', leadIds)
        .neq('verdict', 'reject');

      if (!trigError && triggerRows) {
        const triggers = (triggerRows as LeadTriggerRow[]).map(toLeadTrigger);
        for (const id of leadIds) {
          const forLead = triggers.filter((t) => t.leadId === id);
          const active = forLead.filter((t) => t.isActive !== false);
          triggersMap[id] =
            active.find((t) => t.verdict === 'strong') ??
            active.find((t) => t.verdict === 'usable') ??
            forLead.find((t) => t.verdict === 'strong') ??
            forLead.find((t) => t.verdict === 'usable') ??
            null;
        }
      }
    }

    const [needleCreds, blitzCreds, aiArkCreds] = credsResults;

    return {
      leads,
      triggersMap,
      hasNeedle: needleCreds != null,
      hasBlitz: blitzCreds != null,
      hasAiArk: aiArkCreds != null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function CockpitPage() {
  const data = await fetchCockpitData();
  if (!data) return <DbError />;

  const { leads, triggersMap, hasNeedle, hasBlitz, hasAiArk } = data;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-lg font-semibold tracking-tight">Heute</h1>
          <span className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>

        {/* Funnel line — real leads only */}
        <div className="mt-2">
          <FunnelLine leads={leads} />
        </div>
      </div>

      {/* Lead table (client component) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <LeadTable
          leads={leads}
          triggersMap={triggersMap}
          hasNeedle={hasNeedle}
          hasBlitz={hasBlitz}
          hasAiArk={hasAiArk}
        />
      </div>
    </div>
  );
}
