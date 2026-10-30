"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  AlertTriangleIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatusCheck } from "@/components/status-check"
import type { ServiceStatus } from "@/components/status-check"

interface ServiceHealth {
  name: string
  status: "ok" | "error"
  message: string
}

interface StatusResponse {
  services: ServiceHealth[]
}

/** Map API service name → what the user should do next when red. */
function getNextStep(
  name: string
): { nextStep?: string; nextStepHref?: string } {
  const lower = name.toLowerCase()
  if (
    lower.includes("ai ark") ||
    lower.includes("needle") ||
    lower.includes("zapmail")
  ) {
    return {
      nextStep: "Integrations-Seite öffnen",
      nextStepHref: "/integrations",
    }
  }
  return { nextStep: "Screenshot machen und Xiaomei auf Slack schreiben" }
}

const REFRESH_INTERVAL_MS = 30_000

export default function StatusPage() {
  const router = useRouter()

  const [services, setServices] = React.useState<ServiceHealth[] | null>(null)
  const [fetchError, setFetchError] = React.useState(false)
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null)
  const [isManualRefreshing, setIsManualRefreshing] = React.useState(false)
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false)
  const [isResetting, setIsResetting] = React.useState(false)

  /**
   * All setState calls happen after the first await, so no synchronous
   * setState from within the effect body.
   */
  async function fetchStatus() {
    try {
      const res = await fetch("/api/status")
      if (!res.ok) {
        setFetchError(true)
        return
      }
      const data: StatusResponse = await res.json()
      setFetchError(false)
      setServices(data.services ?? [])
      setLastRefreshed(new Date())
    } catch {
      setFetchError(true)
    }
  }

  async function handleManualRefresh() {
    setIsManualRefreshing(true)
    try {
      await fetchStatus()
    } finally {
      setIsManualRefreshing(false)
    }
  }

  // Initial load + 30-second auto-refresh.
  // Both calls are inside callbacks so the linter's set-state-in-effect rule
  // is satisfied: setState only fires from async event/timer callbacks, not
  // synchronously within the effect body.
  React.useEffect(() => {
    const initial = setTimeout(() => void fetchStatus(), 0)
    const timer = setInterval(() => void fetchStatus(), REFRESH_INTERVAL_MS)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [])

  async function handleReset() {
    setIsResetting(true)
    try {
      const res = await fetch("/api/seed", { method: "POST" })
      if (!res.ok) {
        toast.error(
          "Demo konnte nicht zurückgesetzt werden – bitte versuche es erneut."
        )
        return
      }
      setResetDialogOpen(false)
      router.push("/")
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setIsResetting(false)
    }
  }

  function formatTime(date: Date): string {
    return new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date)
  }

  const isInitialLoading = services === null && !fetchError
  const allOk =
    services != null &&
    services.length > 0 &&
    services.every((s) => s.status === "ok")

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              System-Status
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Alle Services müssen grün sein, bevor ihr startet. Wird alle 30
              Sekunden aktualisiert.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleManualRefresh()}
            disabled={isManualRefreshing}
            aria-label="Manuell aktualisieren"
          >
            <RefreshCwIcon
              className={isManualRefreshing ? "animate-spin" : ""}
            />
            Aktualisieren
          </Button>
        </div>

        {/* Status card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Services</CardTitle>
              {lastRefreshed && (
                <CardDescription className="text-xs">
                  Stand: {formatTime(lastRefreshed)}
                </CardDescription>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isInitialLoading && (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Services werden geprüft…
              </div>
            )}

            {fetchError && (
              <div className="flex items-center gap-2 py-4 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangleIcon className="size-4 shrink-0" />
                Service-Check momentan nicht verfügbar – API-Routen noch nicht
                deployt. Versuche es in wenigen Sekunden erneut.
              </div>
            )}

            {services !== null && services.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                Keine Services gefunden.
              </p>
            )}

            {services !== null && services.length > 0 && (
              <div className="divide-y">
                {services.map((svc, i) => {
                  const { nextStep, nextStepHref } = getNextStep(svc.name)
                  return (
                    <StatusCheck
                      key={`${svc.name}-${i}`}
                      name={svc.name}
                      status={svc.status as ServiceStatus}
                      message={svc.message}
                      nextStep={svc.status === "error" ? nextStep : undefined}
                      nextStepHref={
                        svc.status === "error" ? nextStepHref : undefined
                      }
                    />
                  )
                })}
              </div>
            )}

            {allOk && (
              <>
                <Separator className="my-2" />
                <p className="pt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Alles bereit. Los geht&apos;s!
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Demo controls */}
        <Card>
          <CardHeader>
            <CardTitle>Demo-Steuerung</CardTitle>
            <CardDescription>
              Setzt alle Leads, Trigger, Anrufe und Ergebnisse auf den
              Ausgangszustand zurück. Kampagnenkonfiguration und API-Keys
              bleiben erhalten.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(true)}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              <RotateCcwIcon />
              Demo zurücksetzen
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Reset confirmation dialog */}
      <Dialog
        open={resetDialogOpen}
        onOpenChange={(open) => setResetDialogOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demo wirklich zurücksetzen?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>
              Alle Leads, Trigger, Anrufe und Ergebnisse werden gelöscht und
              durch die 5 Demo-Leads ersetzt.
            </p>
            <p>Kampagnenkonfiguration und API-Keys bleiben erhalten.</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={isResetting}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleReset()}
              disabled={isResetting}
            >
              {isResetting && <Loader2Icon className="animate-spin" />}
              {isResetting ? "Wird zurückgesetzt…" : "Zurücksetzen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
