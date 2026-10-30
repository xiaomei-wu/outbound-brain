# Outbound Brain

KI-gestützte Outbound-Plattform: zeigt, wen ein Verkäufer heute anrufen soll und warum — mit einem vollständigen Briefing in unter einer Minute.

Gebaut beim GTM Hackathon, Halloween Edition, Berlin, 31. Oktober 2026.

---

## Was neu ist in v2

- **Booked ≠ demo-ready.** Demo-reif = bestätigter Bedarf UND gemeinsam vereinbartes Demo-Ziel (`objectiveStatus === 'agreed'`). Budget, Rolle und Timing dürfen offen bleiben.
- **Unbekannt ist nicht Nein.** Fehlende BANT-Dimensionen senken den Fit nicht — sie werden als offene Fragen angezeigt.
- **Freigegebenes Angebotswissen** im Kampagnen-Setup: Einwandantworten im Briefing verwenden nur dieses Wissen; fehlt etwas, zeigt das Briefing eine offene Frage statt eines Versprechens.
- **Geäußerter Bedarf** und **Ausdrücklicher Gesprächswunsch** sind eigene Trigger-Typen im Katalog.
- **Kampagnenvorschläge** brauchen eine Mindestfallzahl (Standard: 3 vergleichbare Fälle mit Trigger-Feedback) und müssen manuell freigegeben werden, bevor sie den Katalog ändern.
- **Demo-Übergabe** direkt auf der Lead-Seite: Use Case mit Beleg, bekannte Beteiligte, BANT-Stand, Demo-Ziel und offene Fragen.
- **Seller-Override**: Verkäufer können die empfohlene Aktion mit optionalem Grund ändern, ohne den Qualifizierungsstatus zu überschreiben.

---

## Was es macht

1. **Cockpit** — priorisierte Lead-Liste (Hoch / Mittel / Niedrig / Prüfen) mit Begründung und drei Dimensionen (Fit, Timing, Bedarf).
2. **Call-Briefing** — Trigger (mit Quellenlinks), Chatkontext, BANT-Stand, bis zu 3 Fragen, bis zu 2 Einwandantworten (nur aus freigegebenem Angebotswissen), Telefonnummer, Meeting-Slots (als Vorschläge), Einwilligungslinie.
3. **Ergebnis-Loop** — Gesprächsnotizen oder Transkript eingeben → Claude analysiert nach 8 Kriterien, aktualisiert BANT mit Belegen, gibt Trigger-Feedback und erstellt bei Bedarf eine Demo-Übergabe.
4. **Kampagnenvorschläge** — aus vergleichbaren Gesprächen; mit Fallzahl, Belegen, Unsicherheit und alter/neuer Regel; erst nach manueller Freigabe aktiv.
5. **Setup** — Kampagnenkonfiguration, Angebotswissen, Trigger-Katalog und Proposals-Panel direkt im Browser (kein Code).
6. **Integrationen** — AI Ark, Needle, Zapmail — Keys im Browser einfügen und testen.
7. **Status** — Systemstatus auf einen Blick, inklusive klarer Fehlermeldungen.
8. **Runbook** — Demo-Anleitung für das Team unter `/runbook`.

---

## Lokales Setup

### Voraussetzungen

- Node.js 20+, pnpm 10+
- Docker Desktop (für lokales Supabase)
- Supabase CLI: `brew install supabase/tap/supabase`

### Schritte

```bash
# 1. Abhängigkeiten installieren
pnpm install

# 2. Lokales Supabase starten
supabase start
# Gibt API-URL und Service-Key aus — beides in .env.local eintragen

# 3. Schema anwenden
supabase db reset
# oder manuell:
# psql postgresql://postgres:postgres@localhost:54322/postgres < supabase/schema.sql

# 4. Umgebungsvariablen setzen
cp .env.example .env.local
# .env.local bearbeiten — alle Pflichtfelder ausfüllen

# 5. Seed-Daten laden
pnpm seed

# 6. Entwicklungsserver starten
pnpm dev
# App läuft auf http://localhost:3000
```

### Umgebungsvariablen

Alle Variablen sind in `.env.example` dokumentiert. Pflichtfelder:

| Variable | Beschreibung |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Console |
| `SUPABASE_URL` | Supabase-Projekt-URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service-Role-Key |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook |
| `ENCRYPTION_KEY` | 32-Byte-Hex (`openssl rand -hex 32`) |
| `EVENTS_WEBHOOK_SECRET` | 16-Byte-Hex (`openssl rand -hex 16`) |
| `NEXT_PUBLIC_APP_URL` | Öffentliche URL der App |

Partner-Keys (AI Ark, Needle, Zapmail) können alternativ über die `/integrations`-Seite eingegeben werden.

---

## Deployment auf Vercel

### Erstmalige Einrichtung

1. GitHub-Repository erstellen (privat empfohlen).
2. Im Vercel-Dashboard: **New Project → Import from GitHub** → Repository auswählen.
3. Framework: Next.js (wird automatisch erkannt).
4. Alle Umgebungsvariablen unter **Settings → Environment Variables** eintragen (Production + Preview).
5. Erster Deploy startet automatisch nach dem Import.

### Jeder Push auf `main` = sofortiger Produktions-Deploy

Kein manueller Schritt nötig. Vercel baut und deployed automatisch.

```bash
git add -A
git commit -m "update"
git push
```

### Rollback

Bei einem fehlerhaften Deploy: **Vercel Dashboard → Deployments → vorherigen Deploy → drei Punkte → „Promote to Production"**. Dauert Sekunden.

### Env-Vars ändern

Nur die Eigentümerin kann sie ändern (Vercel-Dashboard, auch vom Handy). Alternativ können Partner-Keys direkt über `/integrations` aktualisiert werden — kein Vercel-Zugriff nötig.

---

## Nützliche Befehle

```bash
pnpm dev          # Entwicklungsserver
pnpm build        # Produktions-Build (nicht beim Hackathon ausführen — shared .next)
pnpm typecheck    # TypeScript-Prüfung ohne Build
pnpm lint         # ESLint
pnpm seed         # Demo-Daten zurücksetzen (liest .env.local automatisch)
```

---

## Demo-Anleitung für das Team

Die vollständige Schritt-für-Schritt-Anleitung (Setup-Checkliste, 3-Minuten-Skript, Fehlerbehebung) ist unter `/runbook` erreichbar — auf dem Handy lesbar, druckbar.

---

## Projektstruktur (Kurzübersicht)

```
app/
  page.tsx               Cockpit: Lead-Liste
  leads/[id]/page.tsx    Call-Ansicht: Briefing + Ergebnis
  setup/page.tsx         Kampagnenkonfiguration
  integrations/page.tsx  Partner-Keys
  status/page.tsx        Systemstatus
  runbook/page.tsx       Demo-Anleitung
  api/                   API-Routen (Next.js Route Handlers)
lib/
  types.ts               Gemeinsame TypeScript-Typen
  env.ts                 Env-Variablen-Zugriff
  db.ts                  Supabase-Client
supabase/
  schema.sql             Datenbankschema
  seed.sql               SQL-Seed (Fallback für Supabase SQL Editor)
scripts/
  seed.ts                Seed-Skript (pnpm seed)
```
