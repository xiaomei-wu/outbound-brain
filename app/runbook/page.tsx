import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Static demo runbook page for non-technical teammates.
// Print or open on phone before the hackathon.

export const metadata = { title: 'Runbook – Outbound Brain' };

interface ChecklistItem {
  text: string;
  note?: string;
}

function Checklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-400 text-xs text-gray-400 print:border-gray-600">
            ✓
          </span>
          <span className="text-sm leading-relaxed">
            {item.text}
            {item.note && (
              <span className="ml-1 text-muted-foreground">({item.note})</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Demo script steps ─────────────────────────────────────────────────────────
const demoSteps = [
  {
    label: 'Problem',
    time: '20 Sek.',
    text: '„Ein Junior-Verkäufer hat 1.000 Leads. Er recherchiert 40 Minuten vor jedem Anruf – oder er ruft nie an. Und wenn er bucht, fehlt oft der konkrete Bedarf für die Demo."',
  },
  {
    label: 'Liste des Tages',
    time: '20 Sek.',
    text: 'Cockpit öffnen. „Outbound Brain zeigt, wen ich heute anrufe und warum – mit Priorität, Anrufgrund und Quellenlink. Keine versteckte Zahl."',
  },
  {
    label: 'Briefing',
    time: '30 Sek.',
    text: 'Den Top-Lead antippen. „Chatkontext auf einen Blick: der Kontakt hat selbst das Problem erwähnt. Ein konkreter Anlass mit Beleg, drei offene Fragen für den Call. Einwandantworten kommen nur aus freigegebenem Angebotswissen – fehlt etwas, steht dort eine offene Frage, kein Versprechen."',
  },
  {
    label: 'Qualifizierungsgespräch',
    time: '45 Sek.',
    text: '„Jetzt anrufen" antippen. Anruf tätigen – oder Backup-Aufnahme mit dem vorher einverstandenen Kontakt abspielen. Einwilligungslinie zuerst. Bedarf und Demo-Ziel klären. Slot vorschlagen. Ergebnis mit einem Klick erfassen.',
  },
  {
    label: 'Transkript-Analyse & Demo-Übergabe',
    time: '35 Sek.',
    text: 'Zur Analyse scrollen. „BANT-Status aktualisiert mit Belegen aus dem Gespräch. Gesprächs-Score mit Zitat. Demo-Übergabe: Use Case, bekannte Beteiligte, gemeinsames Demo-Ziel – oder offen, wenn es nicht geklärt wurde. Das ist die Übergabe an den Demo-Seller."',
  },
  {
    label: 'Feedback-Loop mit Freigabe',
    time: '20 Sek.',
    text: 'Zu „Kampagnenvorschläge" auf der Setup-Seite wechseln. „Das System sieht: dieser Trigger wurde dreimal widerlegt. Es schlägt vor, das Zeitfenster zu kürzen – mit Fallzahl, Belegen und Unsicherheit. Ich entscheide, ob ich freigebe. Erst dann wird es aktiv."',
  },
  {
    label: 'Abschluss',
    time: '10 Sek.',
    text: '„Was Sie gesehen haben, war echt: echte Leads, echter Chatkontext, echte Trigger-Quellen. Die Anruf-Analyse und die Kampagnenvorschläge sind TEST-Daten mit Beispielinhalt. Roadmap: Kalender-Integration, automatische Transkription und teamweite Lernschleife."',
  },
];

// ── Kickoff decisions ─────────────────────────────────────────────────────────
const kickoffRows = [
  {
    decision: 'Angebot und ICP',
    rule: 'Kundenfall übernehmen; Problem, Nutzen, Grenzen, Zielgruppe und Ausschlüsse kurz festhalten. Fehlende Angaben als Beispielannahmen kennzeichnen.',
  },
  {
    decision: 'Trigger und Priorität',
    rule: 'Typen am Angebot freigeben; konkrete Gewichte festlegen. Geäußerter Bedarf ist eigener Trigger.',
  },
  {
    decision: 'Anruf und Aufnahme',
    rule: 'Erlaubte Ansprache, Telefonnummern, Einwilligung und Transkriptpfad klären; Backup festlegen.',
  },
  {
    decision: 'Demo-Übergabe',
    rule: 'Bestätigter Bedarf/Use Case und gemeinsames Ziel als Mindeststandard; bekannte Beteiligte und offene BANT-Punkte müssen in der Übergabe stehen.',
  },
  {
    decision: 'Rollen',
    rule: 'Vorcall und Demo können bei derselben oder verschiedenen Personen liegen; Fall entscheidet.',
  },
  {
    decision: 'Lernschleife',
    rule: 'Lead-Updates direkt; globale Änderungen erst aus vergleichbaren Fällen und zur Freigabe. Mindestfallzahl am Case festlegen; kein autonomes Modelltraining.',
  },
];

// ── Troubleshooting ───────────────────────────────────────────────────────────
const troubleshootingRows = [
  {
    problem: 'Keine Aufnahme oder Transkript fehlt',
    action:
      'Transkript oder Gesprächsnotizen in das Textfeld auf der Ergebnis-Seite einfügen. Fehlende Evidenz nicht bewerten – der Score zeigt "nicht beobachtet".',
  },
  {
    problem: 'Needle oder AI Ark nicht erreichbar',
    action:
      'Verfügbare freigegebene Quelle nutzen oder Leads als CSV importieren. Seed-Daten (Demo zurücksetzen) haben vorberechnete Trigger.',
  },
  {
    problem: 'Slack-Nachricht erscheint nicht',
    action:
      'Cockpit-Karte auf der Lead-Seite zeigen. Sagen: „Dies würde normalerweise in Ihrem Slack-Kanal erscheinen."',
  },
  {
    problem: 'Live-Anruf – kein Abnehmer oder hartes Nein',
    action:
      'Vorher abgestimmten Kontakt anrufen oder Backup-Aufnahme mit klarer Markierung abspielen. Kein inszeniertes Ergebnis als echt ausgeben.',
  },
  {
    problem: 'Status-Seite zeigt Rot',
    action:
      'Screenshot machen → Xiaomei per Slack schreiben. Sie korrigiert die Konfiguration vom Handy.',
  },
  {
    problem: 'Recherche dauert zu lange',
    action:
      'Bis zu 2 Minuten warten. Bei Timeout → Demo zurücksetzen. Seed-Daten haben vorberechnete Trigger und Briefings.',
  },
  {
    problem: 'Briefing wird nicht angezeigt',
    action:
      'Auf der Lead-Seite „Briefing generieren" antippen. Schlägt das fehl → Demo zurücksetzen.',
  },
  {
    problem: 'Kampagnenvorschlag erscheint nicht',
    action:
      'Sicherstellen, dass Seed-Daten geladen sind (Demo zurücksetzen). Dann „Vorschläge berechnen" antippen.',
  },
  {
    problem: 'Jury fragt nach DSGVO',
    action:
      '„Jede Kontaktaufnahme braucht eine menschliche Freigabe. Opt-out stoppt alle Kontakte. Jeder Datenpunkt hat eine Quelle. Aufnahmen nur mit bestätigter Einwilligung."',
  },
  {
    problem: 'Jury fragt nach Ergebnissen / Conversion-Zahlen',
    action:
      '„Ehrliche Antwort: Noch keine gemessenen Conversion-Zahlen. Wir haben den Mechanismus gebaut. Roadmap: Messen, welche Trigger und Gesprächsführung zu qualifizierten Demo-Terminen führen."',
  },
];

export default function RunbookPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 print:py-4">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Outbound Brain — Demo Runbook
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            GTM Hackathon · Halloween Edition · Berlin, 31. Oktober 2026 · v2
          </p>
        </div>
        <Badge variant="outline" className="print:hidden">
          Für das Team
        </Badge>
      </div>

      {/* ── Block 1: Setup-Checkliste ─────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Setup-Checkliste</span>
            <Badge variant="secondary">vor dem Demo</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          <div>
            <p className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Schritt 1 — Anmelden
            </p>
            <Checklist
              items={[
                {
                  text: 'App öffnen und mit dem Demo-Passwort anmelden.',
                  note: 'Passwort bekommt ihr von Xiaomei – auf der Login-Seite eingeben',
                },
                {
                  text: 'Status-Seite aufrufen. Alles grün? Wenn etwas rot ist → Screenshot + Slack an Xiaomei.',
                },
              ]}
            />
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Schritt 2 — Integrationen konfigurieren
            </p>
            <Checklist
              items={[
                { text: 'Integrationen-Seite öffnen.' },
                {
                  text: 'AI Ark: Key einfügen → „Verbindung testen" → „Verbunden, X Credits".',
                },
                {
                  text: 'Needle: Key einfügen → „Verbindung testen" → „Verbunden, 112 Tools".',
                  note: '0 LinkedIn-Accounts → Xiaomei per Slack',
                },
                {
                  text: 'Zapmail (falls vorhanden): SMTP-URL und IMAP-URL einfügen → testen.',
                },
                { text: 'Status-Seite erneut aufrufen – alles grün?' },
              ]}
            />
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Schritt 3 — Kampagne und Angebotswissen eingeben
            </p>
            <Checklist
              items={[
                { text: 'Setup-Seite öffnen.' },
                {
                  text: 'Angebot, ICP-Rollen, Unternehmensgröße, Regionen und Ausschlüsse aus dem Kundenfall eintragen.',
                },
                {
                  text: 'Freigegebenes Angebotswissen ausfüllen: Preise, Funktionen, Integrationen – alles, was Verkäufer im Gespräch nennen dürfen.',
                  note: 'Fehlt etwas hier, zeigt das Briefing eine offene Frage statt eines Versprechens',
                },
                {
                  text: 'Mindestanzahl vergleichbarer Fälle prüfen.',
                  note: 'Standard: 3',
                },
                { text: '„Kampagne speichern" antippen.' },
              ]}
            />
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Schritt 4 — Trigger freigeben
            </p>
            <Checklist
              items={[
                {
                  text: 'Zum Trigger-Katalog scrollen. Jeden Trigger lesen.',
                },
                {
                  text: 'Passende Trigger aktivieren, unpassende deaktivieren.',
                  note: 'Geäußerter Bedarf und Ausdrücklicher Gesprächswunsch sind eigene Typen',
                },
                { text: '„Trigger speichern" antippen.' },
              ]}
            />
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Schritt 5 — Leads finden
            </p>
            <Checklist
              items={[
                {
                  text: '„Leads finden" antippen. Das Tool durchsucht AI Ark mit den ICP-Filtern der Kampagne.',
                },
                {
                  text: '~10 Sekunden warten. 10–20 Leads sollten in der Tabelle erscheinen.',
                },
              ]}
            />
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Schritt 6 — Status prüfen und Demo vorbereiten
            </p>
            <Checklist
              items={[
                { text: 'Status-Seite aufrufen – alles grün?' },
                {
                  text: 'Demo-Skript (unten) einmal durchgehen. Unter 3 Minuten bleiben.',
                },
                {
                  text: 'Vor jeder Probe: „Demo zurücksetzen" antippen – die Seed-Daten sind immer bereit.',
                },
              ]}
            />
          </div>

        </CardContent>
      </Card>

      {/* ── Block 2: Demo-Skript ──────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Demo-Skript</span>
            <Badge variant="secondary">~3 Minuten</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {demoSteps.map((step) => (
            <div key={step.label} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium text-sm">{step.label}</span>
                <Badge variant="outline" className="text-xs">
                  {step.time}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.text}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Block 3: Kickoff-Entscheidungen ──────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Entscheidungen beim Kickoff</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Entscheidung</TableHead>
                <TableHead>Standard / zu klären</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kickoffRows.map((row) => (
                <TableRow key={row.decision}>
                  <TableCell className="align-top font-medium text-sm">
                    {row.decision}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.rule}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Block 4: Fehlerbehebungstabelle ──────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Wenn etwas nicht klappt</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Was passiert</TableHead>
                <TableHead>Was zu tun ist</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {troubleshootingRows.map((row) => (
                <TableRow key={row.problem}>
                  <TableCell className="align-top font-medium text-sm">
                    {row.problem}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.action}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <p className="text-center text-xs text-muted-foreground">
        Fragen? Xiaomei auf Slack schreiben. Sie ist während des gesamten
        Hackathons erreichbar.
      </p>
    </main>
  );
}
