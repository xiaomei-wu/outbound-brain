"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Loader2Icon,
  UsersIcon,
  ZapIcon,
  SettingsIcon,
  LightbulbIcon,
  RefreshCwIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { CampaignForm } from "@/components/campaign-form"
import { TriggerCatalogTable } from "@/components/trigger-catalog-table"
import { ProposalsPanel } from "@/components/proposals-panel"
import { LinkedinImport } from "@/components/linkedin-import"
import { ManualLeadForm } from "@/components/manual-lead-form"
import { CsvImport } from "@/components/csv-import"
import { LeadSources } from "@/components/lead-sources"

// ---------------------------------------------------------------------------
// Needle campaign select
// ---------------------------------------------------------------------------

interface NeedleCampaign {
  id: string;
  name: string;
  status: string;
  enrollmentCount: number;
}

function NeedleCampaignSelect() {
  const [campaigns, setCampaigns] = React.useState<NeedleCampaign[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [selected, setSelected] = React.useState<string>("")
  const [savedId, setSavedId] = React.useState<string | null>(null)
  const [savedName, setSavedName] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Load active campaign's existing choice on mount
  React.useEffect(() => {
    fetch("/api/campaign")
      .then((r) => r.json())
      .then((d: { campaign?: { needleCampaignId?: string | null; needleCampaignName?: string | null } }) => {
        if (d.campaign?.needleCampaignId) {
          setSelected(d.campaign.needleCampaignId)
          setSavedId(d.campaign.needleCampaignId)
          setSavedName(d.campaign.needleCampaignName ?? null)
        }
      })
      .catch(() => undefined)
    // Load the list right away so the current choice is visible in the select
    void loadCampaigns()
  }, [])

  async function loadCampaigns() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/needle/campaigns")
      const data: { campaigns?: NeedleCampaign[]; error?: string } = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Kampagnen konnten nicht geladen werden.")
        return
      }
      setCampaigns(data.campaigns ?? [])
    } catch {
      setError("Verbindungsfehler beim Laden der Kampagnen.")
    } finally {
      setLoading(false)
    }
  }

  async function saveCampaign() {
    if (!campaigns || !selected) return
    setSaving(true)
    try {
      const chosen = campaigns.find((c) => c.id === selected)
      const res = await fetch("/api/campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          needleCampaignId: chosen?.id ?? null,
          needleCampaignName: chosen?.name ?? null,
        }),
      })
      if (!res.ok) {
        const d: { error?: string } = await res.json().catch(() => ({}))
        toast.error(d.error ?? "Kampagne konnte nicht gespeichert werden.")
        return
      }
      setSavedId(chosen?.id ?? null)
      setSavedName(chosen?.name ?? null)
      // No success toast — the saved selection is visible
    } catch {
      toast.error("Verbindungsfehler. Bitte erneut versuchen.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Wähle die Needle-Kampagne, aus der Leads importiert werden sollen. Stelle
        sicher, dass Needle auf der{" "}
        <a href="/integrations" className="underline underline-offset-4 hover:text-foreground">
          Integrations-Seite
        </a>{" "}
        verbunden ist.
      </p>

      {savedId && !campaigns && (
        <p className="text-xs text-emerald-600">
          Aktuelle Kampagne: {savedName ?? savedId}
        </p>
      )}

      {!campaigns && (
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => void loadCampaigns()}
          disabled={loading}
        >
          {loading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <RefreshCwIcon className="h-4 w-4" />}
          {loading ? "Wird geladen…" : "Kampagnen laden"}
        </Button>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {campaigns && (
        <div className="flex flex-col gap-3">
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Kampagnen im Needle-Account gefunden.
            </p>
          ) : (
            <>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="block w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Kampagne wählen —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.status} · {c.enrollmentCount} Leads
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="w-fit"
                onClick={() => void saveCampaign()}
                disabled={saving || !selected}
              >
                {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
                Speichern
              </Button>
              {savedId === selected && selected && (
                <p className="text-xs text-emerald-600">Kampagne gespeichert.</p>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-fit text-xs text-muted-foreground"
            onClick={() => { setCampaigns(null); void loadCampaigns() }}
            disabled={loading}
          >
            <RefreshCwIcon className="h-3 w-3" />
            Aktualisieren
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LeadImportSection — replaces old AI-Ark-only import with unified LeadSources
// ---------------------------------------------------------------------------

function LeadImportSection() {
  // Connectivity is checked lazily by the unified endpoint; we show all sources.
  // We pass hasNeedle/hasBlitz/hasAiArk=true so the component doesn't show the
  // "not connected" message — the backend will report per-source results.
  // A more accurate approach would be a dedicated connectivity check endpoint;
  // for the hackathon, the per-source result lines are sufficient feedback.
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Sucht in allen verbundenen Quellen nach Leads. Verbinde Needle (empfohlen)
        oder BlitzAPI auf der{" "}
        <a href="/integrations" className="underline underline-offset-4 hover:text-foreground">
          Integrations-Seite
        </a>
        .
      </p>
      {/* Pass all=true — each source reports its own status in the result lines */}
      <LeadSources hasNeedle hasBlitz hasAiArk />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const DEFAULT_ICP_ROLES = "Geschäftsführung, Leitung Ankauf, Leitung Projektentwicklung, Asset Management"

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Konfiguriere die Kampagne und die Trigger-Kriterien für den heutigen Kundenfall.
          </p>
        </div>

        {/* Section 1: Campaign config */}
        <section className="mb-10">
          <div className="mb-5 flex items-center gap-2">
            <SettingsIcon className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Kampagnen-Konfiguration</h2>
          </div>
          <div className="mb-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Standard ICP-Rollen (wenn leer):{" "}
            <span className="font-medium text-foreground">{DEFAULT_ICP_ROLES}</span>
          </div>
          <CampaignForm />
        </section>

        <Separator className="my-8" />

        {/* Section 1b: Needle campaign select */}
        <section className="mb-10">
          <div className="mb-3 flex items-center gap-2">
            <UsersIcon className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Needle-Kampagne</h2>
          </div>
          <NeedleCampaignSelect />
        </section>

        <Separator className="my-8" />

        {/* Section 2: Trigger catalog */}
        <section className="mb-10">
          <div className="mb-1 flex items-center gap-2">
            <ZapIcon className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Trigger-Katalog</h2>
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            Welche Ereignisse öffnen ein Kaufzeitfenster? Genehmige die Trigger, die für diesen Fall passen.
          </p>
          <TriggerCatalogTable />
        </section>

        <Separator className="my-8" />

        {/* Section 3: Campaign proposals */}
        <section className="mb-10">
          <div className="mb-1 flex items-center gap-2">
            <LightbulbIcon className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Kampagnenvorschläge</h2>
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            Erkenntnisse aus mehreren vergleichbaren Gesprächen als Regeländerung vorschlagen und freigeben.
          </p>
          <ProposalsPanel />
        </section>

        <Separator className="my-8" />

        {/* Section 4: Find leads — unified */}
        <section id="leads-finden">
          <div className="mb-5 flex items-center gap-2">
            <UsersIcon className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Leads finden</h2>
          </div>
          <LeadImportSection />

          <div className="mt-8 flex flex-col gap-8">
            <div>
              <h3 className="mb-1 text-sm font-semibold">Lead aus LinkedIn übernehmen</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Profil-URL einfügen – Profil, Posts und euer Chatverlauf aus Needle werden übernommen.
              </p>
              <LinkedinImport />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">Lead manuell anlegen</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Falls AI Ark oder Needle nicht verfügbar sind.
              </p>
              <ManualLeadForm />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">Leads aus CSV importieren</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Spalten: name, role, company, domain, size, region, phone, email, linkedin.
              </p>
              <CsvImport />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
