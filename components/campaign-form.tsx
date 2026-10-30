"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2Icon, CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Campaign } from "@/lib/types"

interface FormState {
  offer: string
  icpRoles: string
  sizeMin: string
  sizeMax: string
  regions: string
  exclusions: string
  language: string
  tone: string
  offerKnowledge: string
  minSampleSize: string
}

const EMPTY_STATE: FormState = {
  offer: "",
  icpRoles: "",
  sizeMin: "",
  sizeMax: "",
  regions: "",
  exclusions: "",
  language: "de",
  tone: "professional",
  offerKnowledge: "",
  minSampleSize: "3",
}

function campaignToForm(c: Campaign): FormState {
  return {
    offer: c.offer,
    icpRoles: c.icpRoles.join(", "),
    sizeMin: c.icpCompanySizeMin?.toString() ?? "",
    sizeMax: c.icpCompanySizeMax?.toString() ?? "",
    regions: c.icpRegions.join(", "),
    exclusions: c.exclusions.join(", "),
    language: c.language,
    tone: c.tone,
    offerKnowledge: c.offerKnowledge,
    minSampleSize: c.minSampleSize.toString(),
  }
}

export function CampaignForm() {
  const [form, setForm] = React.useState<FormState>(EMPTY_STATE)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [savedOk, setSavedOk] = React.useState(false)

  React.useEffect(() => {
    fetch("/api/campaign")
      .then(async (res) => {
        if (!res.ok) return
        const data: { campaign: Campaign | null } = await res.json()
        if (data.campaign) setForm(campaignToForm(data.campaign))
      })
      .catch(() => {
        // graceful – form stays empty
      })
      .finally(() => setIsLoading(false))
  }, [])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSavedOk(false)
  }

  async function handleSave() {
    if (!form.offer.trim()) {
      toast.error("Bitte gib das Angebot ein – es darf nicht leer sein.")
      return
    }

    setIsSaving(true)
    setSavedOk(false)

    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer: form.offer.trim(),
          icpRoles: form.icpRoles
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          icpCompanySizeMin: form.sizeMin ? parseInt(form.sizeMin, 10) : null,
          icpCompanySizeMax: form.sizeMax ? parseInt(form.sizeMax, 10) : null,
          icpRegions: form.regions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          exclusions: form.exclusions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          language: form.language,
          tone: form.tone,
          offerKnowledge: form.offerKnowledge.trim(),
          minSampleSize: parseInt(form.minSampleSize, 10) || 3,
        }),
      })
      if (!res.ok) {
        toast.error(
          "Kampagne konnte nicht gespeichert werden – bitte versuche es erneut."
        )
        return
      }
      setSavedOk(true)
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="offer">
          Angebot{" "}
          <span className="text-muted-foreground font-normal">(ein Satz)</span>
        </Label>
        <Textarea
          id="offer"
          placeholder="z.B. Wir helfen Vertriebsteams, ihren Outbound-Prozess mit KI zu automatisieren."
          value={form.offer}
          onChange={(e) => setField("offer", e.target.value)}
          rows={2}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="icpRoles">
          ICP-Rollen{" "}
          <span className="text-muted-foreground font-normal">
            (kommagetrennt)
          </span>
        </Label>
        <Input
          id="icpRoles"
          placeholder="VP Sales, Head of Sales, CRO"
          value={form.icpRoles}
          onChange={(e) => setField("icpRoles", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sizeMin">Unternehmensgröße min.</Label>
          <Input
            id="sizeMin"
            type="number"
            placeholder="50"
            value={form.sizeMin}
            onChange={(e) => setField("sizeMin", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sizeMax">Unternehmensgröße max.</Label>
          <Input
            id="sizeMax"
            type="number"
            placeholder="500"
            value={form.sizeMax}
            onChange={(e) => setField("sizeMax", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="regions">
          Regionen{" "}
          <span className="text-muted-foreground font-normal">
            (kommagetrennt)
          </span>
        </Label>
        <Input
          id="regions"
          placeholder="DACH, Nordics"
          value={form.regions}
          onChange={(e) => setField("regions", e.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="exclusions">
          Ausschlüsse{" "}
          <span className="text-muted-foreground font-normal">
            (kommagetrennt)
          </span>
        </Label>
        <Input
          id="exclusions"
          placeholder="Bestandskunden, offene Deals"
          value={form.exclusions}
          onChange={(e) => setField("exclusions", e.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="offerKnowledge">Freigegebenes Angebotswissen</Label>
        <p className="text-xs text-muted-foreground -mt-0.5">
          Einwandantworten nutzen nur dieses Wissen – fehlt etwas, zeigt das
          Briefing eine offene Frage statt eines Versprechens.
        </p>
        <Textarea
          id="offerKnowledge"
          placeholder="z.B. Preise, Funktionen, unterstützte Integrationen, Onboarding-Dauer"
          value={form.offerKnowledge}
          onChange={(e) => setField("offerKnowledge", e.target.value)}
          rows={4}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="minSampleSize">
          Mindestanzahl vergleichbarer Fälle für Kampagnenvorschläge
        </Label>
        <Input
          id="minSampleSize"
          type="number"
          min={1}
          placeholder="3"
          value={form.minSampleSize}
          onChange={(e) => setField("minSampleSize", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Sprache</Label>
          <Select
            value={form.language}
            onValueChange={(val) => setField("language", String(val))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="de">Deutsch</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Ton</Label>
          <Select
            value={form.tone}
            onValueChange={(val) => setField("tone", String(val))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">Professionell</SelectItem>
              <SelectItem value="casual">Locker</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2Icon className="animate-spin" />}
          {isSaving ? "Speichern…" : "Kampagne speichern"}
        </Button>
        {savedOk && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-4" />
            Kampagne gespeichert
          </span>
        )}
      </div>
    </div>
  )
}
