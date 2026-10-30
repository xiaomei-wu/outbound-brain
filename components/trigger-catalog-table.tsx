"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2Icon, PlusIcon, SaveIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TriggerCatalogEntry, TriggerTier } from "@/lib/types"

interface NewEntryDraft {
  name: string
  buyingReason: string
  tier: string
  windowDays: string
  requiredEvidence: string
}

const EMPTY_DRAFT: NewEntryDraft = {
  name: "",
  buyingReason: "",
  tier: "2",
  windowDays: "90",
  requiredEvidence: "",
}

const TIER_LABEL: Record<TriggerTier, string> = {
  1: "Hoch",
  2: "Mittel",
  3: "Niedrig",
}

const TIER_COLOR: Record<TriggerTier, string> = {
  1: "text-emerald-600 dark:text-emerald-400",
  2: "text-amber-600 dark:text-amber-400",
  3: "text-muted-foreground",
}

export function TriggerCatalogTable() {
  const [entries, setEntries] = React.useState<TriggerCatalogEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<NewEntryDraft>(EMPTY_DRAFT)
  const [isSavingDraft, setIsSavingDraft] = React.useState(false)

  React.useEffect(() => {
    fetch("/api/campaign/triggers")
      .then(async (res) => {
        if (!res.ok) return
        const data: { entries: TriggerCatalogEntry[] } = await res.json()
        if (data?.entries) setEntries(data.entries)
      })
      .catch(() => {
        // graceful – show empty table
      })
      .finally(() => setIsLoading(false))
  }, [])

  function toggleApproved(id: string, approved: boolean) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, approved } : e))
    )
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch("/api/campaign/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      })
      if (!res.ok) {
        toast.error(
          "Trigger konnten nicht gespeichert werden – bitte versuche es erneut."
        )
        return
      }
      const data: { entries: TriggerCatalogEntry[] } = await res.json()
      if (data?.entries) setEntries(data.entries)
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setIsSaving(false)
    }
  }

  function setDraftField<K extends keyof NewEntryDraft>(
    key: K,
    value: NewEntryDraft[K]
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function handleAddEntry() {
    if (!draft.name.trim()) {
      toast.error("Bitte gib einen Namen für den Trigger ein.")
      return
    }
    if (!draft.buyingReason.trim()) {
      toast.error("Bitte erkläre, warum dieser Trigger ein Kaufsignal ist.")
      return
    }
    if (!draft.requiredEvidence.trim()) {
      toast.error("Bitte gib an, welche Belege Claude suchen soll.")
      return
    }

    setIsSavingDraft(true)

    const newEntry: TriggerCatalogEntry = {
      id: "",
      campaignId: "",
      name: draft.name.trim(),
      buyingReason: draft.buyingReason.trim(),
      tier: parseInt(draft.tier, 10) as TriggerTier,
      windowDays: parseInt(draft.windowDays, 10) || 90,
      requiredEvidence: draft.requiredEvidence.trim(),
      approved: true,
      createdAt: new Date().toISOString(),
    }

    const nextEntries = [...entries, newEntry]

    try {
      const res = await fetch("/api/campaign/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: nextEntries }),
      })
      if (!res.ok) {
        toast.error(
          "Trigger konnte nicht hinzugefügt werden – bitte versuche es erneut."
        )
        return
      }
      const data: { entries: TriggerCatalogEntry[] } = await res.json()
      if (data?.entries) setEntries(data.entries)
      else setEntries(nextEntries)
      setDraft(EMPTY_DRAFT)
      setDialogOpen(false)
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setIsSavingDraft(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Genehmige die Trigger, die für diesen Kundenfall passen. Claude sucht
        nur nach Belegen für genehmigte Trigger.
      </p>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Noch keine Trigger vorhanden. Führe zuerst &ldquo;Demo
          zurücksetzen&rdquo; aus oder füge unten einen Trigger hinzu.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Trigger</TableHead>
                <TableHead>Beleg &amp; Relevanz</TableHead>
                <TableHead className="w-[120px]">Fenster / Status</TableHead>
                <TableHead className="text-right w-[90px]">Freigabe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id || entry.name}
                  className={entry.approved ? "" : "opacity-50"}
                >
                  <TableCell className="font-medium whitespace-normal align-top">
                    {entry.name}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="grid gap-1">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {entry.buyingReason}
                      </p>
                      {entry.requiredEvidence && (
                        <p className="text-xs text-muted-foreground/70 leading-relaxed">
                          <span className="font-medium text-foreground/60">
                            Beleg:
                          </span>{" "}
                          {entry.requiredEvidence}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="grid gap-1">
                      <span className="text-xs text-muted-foreground">
                        {entry.windowDays} Tage
                      </span>
                      <span
                        className={`text-xs font-medium ${TIER_COLOR[entry.tier]}`}
                      >
                        {TIER_LABEL[entry.tier]}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <div className="flex items-center justify-end gap-2">
                      {entry.approved ? (
                        <Badge variant="secondary" className="text-xs">
                          Ja
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Nein
                        </Badge>
                      )}
                      <Switch
                        checked={entry.approved}
                        onCheckedChange={(checked) =>
                          toggleApproved(entry.id, checked)
                        }
                        size="sm"
                        aria-label={`Trigger ${entry.name} genehmigen`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Fenster sind Startannahmen, keine gemessenen Grenzen.
      </p>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SaveIcon />
          )}
          {isSaving ? "Speichern…" : "Trigger speichern"}
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button variant="outline">
                <PlusIcon />
                Trigger hinzufügen
              </Button>
            }
          />
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Neuen Trigger hinzufügen</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="t-name">Name</Label>
                <Input
                  id="t-name"
                  placeholder="z.B. Neuer Sales-Leiter"
                  value={draft.name}
                  onChange={(e) => setDraftField("name", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-reason">Warum ein Kaufsignal</Label>
                <Textarea
                  id="t-reason"
                  placeholder="z.B. Neue Führungskräfte überprüfen Anbieter und Prozesse frühzeitig."
                  value={draft.buyingReason}
                  onChange={(e) =>
                    setDraftField("buyingReason", e.target.value)
                  }
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Priorität</Label>
                  <Select
                    value={draft.tier}
                    onValueChange={(val) => setDraftField("tier", String(val))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Hoch (Tier 1)</SelectItem>
                      <SelectItem value="2">Mittel (Tier 2)</SelectItem>
                      <SelectItem value="3">Niedrig (Tier 3)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="t-window">Zeitfenster (Tage)</Label>
                  <Input
                    id="t-window"
                    type="number"
                    placeholder="90"
                    value={draft.windowDays}
                    onChange={(e) =>
                      setDraftField("windowDays", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-evidence">Welche Belege soll Claude suchen?</Label>
                <Input
                  id="t-evidence"
                  placeholder="z.B. LinkedIn-Profil, Pressemitteilung"
                  value={draft.requiredEvidence}
                  onChange={(e) =>
                    setDraftField("requiredEvidence", e.target.value)
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleAddEntry}
                disabled={isSavingDraft}
              >
                {isSavingDraft && <Loader2Icon className="animate-spin" />}
                {isSavingDraft ? "Hinzufügen…" : "Trigger hinzufügen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
