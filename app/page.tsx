import type { Lead, LeadTrigger } from '@/lib/types';
import { getDb } from '@/lib/db';
import { toLead, toLeadTrigger, type LeadRow, type LeadTriggerRow } from '@/lib/mappers';
import { getCredentials } from '@/lib/connectors';
import { LeadTable } from '@/components/lead-table';
import { FunnelLine } from '@/components/funnel-line';
import { SyncIndicator } from '@/components/sync-indicator';
import { RefillBanner } from '@/components/refill-banner';
import { refillState } from '@/lib/refill-run';
import { icpActivity } from '@/lib/icp/status';
import { DbError } from '@/components/db-error';

export const dynamic = 'force-dynamic';

interface CockpitData {
  leads: Lead[];
  triggersMap: Record<string, LeadTrigger | null>;
  icpScores: Record<string, string>;
  hasNeedle: boolean;
  hasBlitz: boolean;
  hasAiArk: boolean;
}

/** Loads all leads, best trigger per lead, and connector connectivity. */
async function fetchCockpitData(): Promise<CockpitData | null> {
  try {
    const db = getDb();

    const [leadRes, checkRes, credsResults] = await Promise.all([
      db.from('lead').select('*'),
      db.from('company_check').select('company_key, score'),
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

    const scoreByCompany = new Map(
      ((checkRes.data ?? []) as { company_key: string; score: string }[]).map((c) => [c.company_key, c.score]),
    );
    const icpScores: Record<string, string> = {};
    for (const l of leads) {
      const score = l.companyKey ? scoreByCompany.get(l.companyKey) : undefined;
      if (score) icpScores[l.id] = score;
    }

    return {
      leads,
      triggersMap,
      icpScores,
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

  const { leads, triggersMap, icpScores, hasNeedle, hasBlitz, hasAiArk } = data;
  const activity = icpActivity(leads.filter((l) => !l.isTest), new Date());
  // Stored campaign mode only (no Needle call on every page load); refill routes refresh it
  const refill = await refillState(false).catch(() => null);

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

      {/* Background ICP checks + Needle write-back in progress */}
      <SyncIndicator active={activity.active} failed={activity.failed} creditExhausted={activity.creditExhausted} />
      {refill && <RefillBanner state={refill} />}

      {/* Lead table (client component) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <LeadTable
          leads={leads}
          triggersMap={triggersMap}
          icpScores={icpScores}
          needleSends={refill?.mode !== 'auto'}
          hasNeedle={hasNeedle}
          hasBlitz={hasBlitz}
          hasAiArk={hasAiArk}
        />
      </div>
    </div>
  );
}
