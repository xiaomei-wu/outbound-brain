"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2Icon, LightbulbIcon, CheckIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { CampaignProposal, ProposalStatus } from "@/lib/types"

const STATUS_LABEL: Record<ProposalStatus, string> = {
  proposed: "Vorgeschlagen",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
}

const STATUS_VARIANT: Record<
  ProposalStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  proposed: "outline",
  approved: "secondary",
  rejected: "destructive",
}

export function ProposalsPanel() {
  const [proposals, setProposals] = React.useState<CampaignProposal[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isComputing, setIsComputing] = React.useState(false)
  const [computeMessage, setComputeMessage] = React.useState<string | null>(null)
  const [decidingId, setDecidingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch("/api/proposals")
      .then(async (res) => {
        if (!res.ok) return
        const data: { proposals: CampaignProposal[] } = await res.json()
        if (data?.proposals) setProposals(data.proposals)
      })
      .catch(() => {
        // graceful – show empty list
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function handleCompute() {
    setIsComputing(true)
    setComputeMessage(null)
    try {
      const res = await fetch("/api/proposals", { method: "POST" })
      if (!res.ok) {
        toast.error(
          "Vorschläge konnten nicht berechnet werden – bitte versuche es erneut."
        )
        return
      }
      const data: { proposals: CampaignProposal[]; message: string } =
        await res.json()
      if (data?.proposals) setProposals(data.proposals)
      if (data?.message) setComputeMessage(data.message)
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setIsComputing(false)
    }
  }

  async function handleDecide(id: string, decision: "approved" | "rejected") {
    setDecidingId(id)
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      })
      if (!res.ok) {
        toast.error(
          "Entscheidung konnte nicht gespeichert werden – bitte versuche es erneut."
        )
        return
      }
      const data: { proposal: CampaignProposal } = await res.json()
      if (data?.proposal) {
        setProposals((prev) =>
          prev.map((p) => (p.id === id ? data.proposal : p))
        )
      }
    } catch {
      toast.error(
        "Netzwerkfehler – prüfe deine Verbindung und versuche es erneut."
      )
    } finally {
      setDecidingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Vorschläge entstehen aus mehreren vergleichbaren Gesprächen mit
        bestätigtem oder widerlegtem Trigger-Feedback. Vorschläge werden erst
        nach Freigabe aktiv. Einzelne Gespräche korrigieren nur den Lead.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={handleCompute}
          disabled={isComputing}
          variant="outline"
        >
          {isComputing ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <LightbulbIcon />
          )}
          {isComputing ? "Wird berechnet…" : "Vorschläge berechnen"}
        </Button>
        {computeMessage && !isComputing && (
          <span className="text-sm text-muted-foreground">
            {computeMessage}
          </span>
        )}
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Noch keine Vorschläge vorhanden. Klicke &ldquo;Vorschläge
          berechnen&rdquo;, sobald genügend Gesprächsfeedback vorliegt.
        </div>
      ) : (
        <div className="grid gap-3">
          {proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="rounded-lg border p-4 grid gap-3"
            >
              {/* Header row: title, count, status badge, action buttons */}
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {proposal.title}
                    </span>
                    <Badge variant={STATUS_VARIANT[proposal.status]}>
                      {STATUS_LABEL[proposal.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {proposal.assessedCount} von {proposal.denominator}{" "}
                    Fällen bewertet
                  </p>
                </div>

                {proposal.status === "proposed" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecide(proposal.id, "approved")}
                      disabled={decidingId === proposal.id}
                      className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                    >
                      {decidingId === proposal.id ? (
                        <Loader2Icon className="animate-spin size-3" />
                      ) : (
                        <CheckIcon className="size-3" />
                      )}
                      Freigeben
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecide(proposal.id, "rejected")}
                      disabled={decidingId === proposal.id}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      <XIcon className="size-3" />
                      Ablehnen
                    </Button>
                  </div>
                )}
              </div>

              {/* Rationale */}
              <p className="text-sm text-muted-foreground">
                {proposal.rationale}
              </p>

              {/* Old rule → new rule */}
              <div className="rounded bg-muted/40 px-3 py-2 grid gap-1 text-xs">
                <span>
                  <span className="font-medium text-foreground">
                    Alte Regel:
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {proposal.oldRule}
                  </span>
                </span>
                <span>
                  <span className="font-medium text-foreground">
                    Neue Regel:
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {proposal.newRule}
                  </span>
                </span>
              </div>

              {/* Evidence list */}
              {proposal.evidence.length > 0 && (
                <ul className="grid gap-0.5 text-xs text-muted-foreground">
                  {proposal.evidence.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0 text-muted-foreground/60">
                        ·
                      </span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Uncertainty note */}
              {proposal.uncertainty && (
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded px-2.5 py-1.5">
                  Unsicherheit: {proposal.uncertainty}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
