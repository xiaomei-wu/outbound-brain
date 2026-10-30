"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Loader2Icon,
  EyeIcon,
  EyeOffIcon,
  CheckCircleIcon,
  XCircleIcon,
  CircleDotIcon,
  TrashIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ConnectorId } from "@/lib/types"

interface ConnectorField {
  name: string
  label: string
  placeholder: string
  isPassword: boolean
}

interface IntegrationStatusResponse {
  connectorId: ConnectorId
  status: "untested" | "ok" | "failed"
  errorMessage: string | null
  lastTestedAt: string | null
  maskedKey: string | null
}

interface IntegrationCardProps {
  connectorId: ConnectorId
  label: string
  description: string
  helpText: string
  fields: ConnectorField[]
}

function StatusBadge({
  status,
  message,
}: {
  status: "untested" | "ok" | "failed" | "loading"
  message?: string | null
}) {
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Wird geprüft…
      </span>
    )
  }
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircleIcon className="size-4" />
        {message ?? "Verbunden"}
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
        <XCircleIcon className="size-4" />
        {message ?? "Verbindung fehlgeschlagen"}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <CircleDotIcon className="size-4" />
      Nicht konfiguriert
    </span>
  )
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return ""
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ts))
  } catch {
    return ""
  }
}

export function IntegrationCard({
  connectorId,
  label,
  description,
  helpText,
  fields,
}: IntegrationCardProps) {
  const [savedStatus, setSavedStatus] =
    React.useState<IntegrationStatusResponse | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = React.useState(true)
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, ""]))
  )
  const [showPassword, setShowPassword] = React.useState<
    Record<string, boolean>
  >(Object.fromEntries(fields.map((f) => [f.name, false])))
  const [isTesting, setIsTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{
    status: "ok" | "failed"
    message: string
  } | null>(null)
  const [removeDialogOpen, setRemoveDialogOpen] = React.useState(false)
  const [isRemoving, setIsRemoving] = React.useState(false)

  React.useEffect(() => {
    fetch(`/api/integrations/${connectorId}`)
      .then(async (res) => {
        if (!res.ok) return
        const data: IntegrationStatusResponse = await res.json()
        setSavedStatus(data)
      })
      .catch(() => {
        // graceful – show unconfigured state
      })
      .finally(() => setIsLoadingStatus(false))
  }, [connectorId])

  function setFieldValue(name: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [name]: value }))
    setTestResult(null)
  }

  function toggleShowPassword(name: string) {
    setShowPassword((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  async function handleTest() {
    const config = Object.fromEntries(
      Object.entries(fieldValues).filter(([, v]) => v.trim())
    )
    if (Object.keys(config).length === 0) {
      toast.error(
        "Bitte gib zuerst die Zugangsdaten ein, bevor du die Verbindung testest."
      )
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const res = await fetch(`/api/integrations/${connectorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      })
      if (!res.ok) {
        toast.error(
          "Verbindungstest fehlgeschlagen – bitte prüfe den eingegebenen Key."
        )
        setTestResult({
          status: "failed",
          message: "Verbindungstest fehlgeschlagen.",
        })
        return
      }
      const data: { status: "ok" | "failed"; message: string } =
        await res.json()
      setTestResult(data)

      // Reload the saved status to show masked key
      const statusRes = await fetch(`/api/integrations/${connectorId}`)
      if (statusRes.ok) {
        const statusData: IntegrationStatusResponse = await statusRes.json()
        setSavedStatus(statusData)
      }

      // Clear input fields after successful save
      if (data.status === "ok") {
        setFieldValues(
          Object.fromEntries(fields.map((f) => [f.name, ""]))
        )
      }
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setIsTesting(false)
    }
  }

  async function handleRemove() {
    setIsRemoving(true)
    try {
      const res = await fetch(`/api/integrations/${connectorId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        toast.error(
          "Key konnte nicht entfernt werden – bitte versuche es erneut."
        )
        return
      }
      setSavedStatus(null)
      setTestResult(null)
      setRemoveDialogOpen(false)
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setIsRemoving(false)
    }
  }

  const currentStatus: "untested" | "ok" | "failed" | "loading" =
    isLoadingStatus
      ? "loading"
      : testResult?.status ?? savedStatus?.status ?? "untested"

  const statusMessage =
    testResult?.message ??
    (savedStatus?.status === "failed" ? savedStatus.errorMessage : null) ??
    undefined

  const hasKey =
    !isLoadingStatus && savedStatus?.maskedKey != null

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-0.5">
              <CardTitle>{label}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="shrink-0 pt-0.5">
              <StatusBadge status={currentStatus} message={statusMessage} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          {/* Saved key display */}
          {hasKey && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Gespeicherter Key:</span>
                <code className="font-mono text-xs">{savedStatus!.maskedKey}</code>
                {savedStatus?.lastTestedAt && (
                  <span className="text-xs text-muted-foreground">
                    · zuletzt geprüft {formatTimestamp(savedStatus.lastTestedAt)}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setRemoveDialogOpen(true)}
                aria-label="Key entfernen"
                className="text-muted-foreground hover:text-destructive"
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </div>
          )}

          {/* Credential inputs */}
          {fields.map((field) => (
            <div key={field.name} className="grid gap-1.5">
              <Label htmlFor={`${connectorId}-${field.name}`}>
                {field.label}
              </Label>
              <div className="relative flex items-center">
                <Input
                  id={`${connectorId}-${field.name}`}
                  type={
                    field.isPassword && !showPassword[field.name]
                      ? "password"
                      : "text"
                  }
                  placeholder={hasKey ? "Neuen Key eingeben um zu überschreiben" : field.placeholder}
                  value={fieldValues[field.name]}
                  onChange={(e) => setFieldValue(field.name, e.target.value)}
                  className="pr-9"
                  autoComplete="off"
                />
                {field.isPassword && (
                  <button
                    type="button"
                    onClick={() => toggleShowPassword(field.name)}
                    className="absolute right-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showPassword[field.name]
                        ? "Key verbergen"
                        : "Key anzeigen"
                    }
                  >
                    {showPassword[field.name] ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">{helpText}</p>

          <div className="flex items-center gap-3">
            <Button onClick={handleTest} disabled={isTesting}>
              {isTesting && <Loader2Icon className="animate-spin" />}
              {isTesting ? "Wird geprüft…" : "Verbindung testen"}
            </Button>

            {testResult && (
              <span
                className={`text-sm font-medium ${
                  testResult.status === "ok"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {testResult.message}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Remove confirmation dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Key entfernen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Der gespeicherte Key für {label} wird unwiderruflich gelöscht. Du
            kannst danach einen neuen Key eingeben.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
              disabled={isRemoving}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving && <Loader2Icon className="animate-spin" />}
              {isRemoving ? "Wird entfernt…" : "Key entfernen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
