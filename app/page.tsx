import type { Lead, LeadTrigger } from '@/lib/types';
import { getDb } from '@/lib/db';
import { toLead, toLeadTrigger, type LeadRow, type LeadTriggerRow } from '@/lib/mappers';
import { LeadTable } from '@/components/lead-table';
import { DbError } from '@/components/db-error';

export const dynamic = 'force-dynamic';

interface CockpitData {
  leads: Lead[];
  triggersMap: Record<string, LeadTrigger | null>;
}

/** Loads all leads and the best non-rejected active trigger per lead. Returns null on DB failure. */
async function fetchCockpitData(): Promise<CockpitData | null> {
  try {
    const db = getDb();

    // Fetch all leads (sorting is done client-side by priority → willingness → fitScore)
    const { data: leadRows, error } = await db.from('lead').select('*');
    if (error || !leadRows) return null;

    const leads = (leadRows as LeadRow[]).map(toLead);
    const leadIds = leads.map((l) => l.id);
    const triggersMap: Record<string, LeadTrigger | null> = {};

    if (leadIds.length === 0) return { leads, triggersMap };

    // Fetch active, non-rejected triggers for all leads
    const { data: triggerRows, error: trigError } = await db
      .from('lead_trigger')
      .select('*')
      .in('lead_id', leadIds)
      .neq('verdict', 'reject');

    if (trigError || !triggerRows) return null;

    const triggers = (triggerRows as LeadTriggerRow[]).map(toLeadTrigger);

    for (const id of leadIds) {
      const forLead = triggers.filter((t) => t.leadId === id);
      // Prefer active triggers, then strong verdict
      const active = forLead.filter((t) => t.isActive !== false);
      triggersMap[id] =
        active.find((t) => t.verdict === 'strong') ??
        active.find((t) => t.verdict === 'usable') ??
        forLead.find((t) => t.verdict === 'strong') ??
        forLead.find((t) => t.verdict === 'usable') ??
        null;
    }

    return { leads, triggersMap };
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

  const { leads, triggersMap } = data;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Heute</h1>
          <span className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('de-DE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>

      {/* Lead table (client component — handles tabs, priority sort, row clicks) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <LeadTable leads={leads} triggersMap={triggersMap} />
      </div>
    </div>
  );
}
