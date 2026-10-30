"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2Icon, UsersIcon, ZapIcon, SettingsIcon, LightbulbIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { CampaignForm } from "@/components/campaign-form"
import { TriggerCatalogTable } from "@/components/trigger-catalog-table"
import { ProposalsPanel } from "@/components/proposals-panel"
import { LinkedinImport } from "@/components/linkedin-import"
import { ManualLeadForm } from "@/components/manual-lead-form"
import { CsvImport } from "@/components/csv-import"

function LeadImportSection() {
  const [isImporting, setIsImporting] = React.useState(false)
  const [importResult, setImportResult] = React.useState<number | null>(null)

  async function handleImport() {
    setIsImporting(true)
    setImportResult(null)
    try {
      const res = await fetch("/api/import", { method: "POST" })
      if (!res.ok) {
        toast.error(
          "Leads konnten nicht geladen werden – prüfe den AI Ark-Key auf der Integrations-Seite."
        )
        return
      }
      const data: { imported: number } = await res.json()
      setImportResult(data.imported)
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Sucht in AI Ark nach Leads, die deiner Kampagnenkonfiguration
        entsprechen. Speichere zuerst die Kampagne und konfiguriere den AI
        Ark-Key auf der{" "}
        <a href="/integrations" className="underline underline-offset-4 hover:text-foreground">
          Integrations-Seite
        </a>
        .
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={handleImport} disabled={isImporting}>
          {isImporting ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <UsersIcon />
          )}
          {isImporting ? "Wird gesucht…" : "Leads finden"}
        </Button>
        {importResult !== null && (
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            {importResult === 0
              ? "Keine neuen Leads gefunden."
              : `${importResult} ${importResult === 1 ? "Lead" : "Leads"} gefunden.`}
          </span>
        )}
      </div>
    </div>
  )
}

export default function SetupPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Setup
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Konfiguriere die Kampagne und die Trigger-Kriterien für den
            heutigen Kundenfall.
          </p>
        </div>

        {/* Section 1: Campaign config */}
        <section className="mb-10">
          <div className="mb-5 flex items-center gap-2">
            <SettingsIcon className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Kampagnen-Konfiguration</h2>
          </div>
          <CampaignForm />
        </section>

        <Separator className="my-8" />

        {/* Section 2: Trigger catalog */}
        <section className="mb-10">
          <div className="mb-1 flex items-center gap-2">
            <ZapIcon className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Trigger-Katalog</h2>
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            Welche Ereignisse öffnen ein Kaufzeitfenster? Genehmige die
            Trigger, die für diesen Fall passen – lehne die anderen ab.
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
            Erkenntnisse aus mehreren vergleichbaren Gesprächen als
            Regeländerung vorschlagen und freigeben.
          </p>
          <ProposalsPanel />
        </section>

        <Separator className="my-8" />

        {/* Section 4: Find leads */}
        <section>
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
