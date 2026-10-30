import { IntegrationCard } from "@/components/integration-card"

export default function IntegrationsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Integrationen
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Füge die API-Keys der Partner ein, die die Gastgeber bereitstellen.
            Keys werden verschlüsselt gespeichert und nie im Klartext
            angezeigt.
          </p>
        </div>

        {/* Integration cards */}
        <div className="grid gap-4">
          <IntegrationCard
            connectorId="ai_ark"
            label="AI Ark"
            description="Lead-Suche und Anreicherung"
            helpText="Deinen AI Ark-Key findest du im AI Ark-Portal unter Account → API Keys. Wird für 'Leads finden' auf der Setup-Seite benötigt."
            fields={[
              {
                name: "apiKey",
                label: "API Key",
                placeholder: "ark_live_...",
                isPassword: true,
              },
            ]}
          />

          <IntegrationCard
            connectorId="needle"
            label="Needle"
            description="LinkedIn-Suche und Outreach via MCP"
            helpText="Deinen Needle-API-Key findest du im Needle-Dashboard unter Settings → API Keys. Für LinkedIn-Recherche benötigt."
            fields={[
              {
                name: "apiKey",
                label: "API Key",
                placeholder: "ndl_...",
                isPassword: true,
              },
              {
                name: "connectedAccountId",
                label: "LinkedIn-Konto-ID (optional)",
                placeholder: "00000000-…",
                isPassword: false,
              },
            ]}
          />

          <IntegrationCard
            connectorId="zapmail"
            label="Zapmail"
            description="E-Mail-Postfach für Outreach"
            helpText="SMTP- und IMAP-URLs erhältst du von den Gastgebern beim Kickoff. Format: smtp://nutzer:passwort@host:587"
            fields={[
              {
                name: "smtpUrl",
                label: "SMTP URL",
                placeholder: "smtp://user:pass@mail.zapmail.io:587",
                isPassword: true,
              },
              {
                name: "imapUrl",
                label: "IMAP URL",
                placeholder: "imap://user:pass@mail.zapmail.io:993",
                isPassword: true,
              },
            ]}
          />
        </div>
      </div>
    </main>
  )
}
