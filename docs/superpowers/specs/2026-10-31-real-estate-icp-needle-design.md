# Design: Needle → ICP check → call card (real-estate developers)

Date: 2026-10-31 (hackathon day). Owner: Xiaomei. Teammates: Noel, Ben (non-technical).
Sources: Slack #main (2026-10-31), `ICP-Check_Immobilienwirtschaft.pdf` (Noel's workflow prompt),
existing app (`docs/agents/REVISION_V2.md`). UI language: German.

## Intent and why

The hackathon hosts asked for a hard-to-reach industry; the team chose **real-estate developers**.
Hypothesis: email/LinkedIn alone rarely gets these people into meetings, so a well-prepared call wins.
The jury should see **how we discover and approach** them, not a finished lead list.

Demo story: *"From a Needle lead to a well-prepared call in under a minute, and every call makes the
campaign smarter."* The persona is an **agency SDR** calling on behalf of a client. The tool is a means
to meetings, not a product to sell to sales teams (Ben).

## Goals

1. Leads found by a **Needle campaign** flow in automatically (plus a "Jetzt abrufen" button).
2. Each lead's company gets the **ICP check exactly per Noel's PDF** (segments 1–7, fit signals with
   source URLs, disqualifiers, score A/B/C/D or "Nicht bewertbar").
3. **Routing by score**: A/B → phone lookup (if a phone tool is connected) → call queue;
   C → "Nicht jetzt"; D → "Kein Zielkunde"; Nicht bewertbar → "Recherche ergänzen".
4. A/B leads get a **call card in the PDF output format**: Anlass, Anruf-Einstieg (verbatim, ≤ 40 s),
   2 Vertiefungsfragen, wahrscheinlichster Einwand + Umgang, offene Frage vor dem Kontakt.
5. **Every lead shows its origin.**
6. **Fallback**: 10 real German developer companies, prepared in advance, run through the same check.
7. The existing after-call loop (paste transcript → analysis → trigger feedback → proposals) keeps working;
   a teammate role-plays the developer on the call.

## Non-goals (today)

Email sending; polished multi-client admin; automatic opt-outs; any Needle write without a click;
calling from the app (the SDR dials on their phone).

## Anti-goals (failure even if it works)

- A score or pain point stated without evidence. "Ein belegtes Nein ist wertvoller als ein unbegründetes Ja."
- Anything sent or written to Needle without a human click.
- Hiding which leads are prepared vs. live.
- Pitch-style openers (product names, feature lists, "Störe ich gerade?").

## Decisions (made with Xiaomei)

### Lead sources

- **Needle is primary.** After the API key is saved on /integrations, the app lists the account's
  campaigns (`needleListCampaigns`); the SDR picks one on /setup. Its leads are pulled
  (`needleListCampaignLeads`, paginated) on "Jetzt abrufen" and on page load of the inbox if the last
  pull is older than 10 minutes (my call: no cron needed for the demo). Needle LinkedIn people search is a
  secondary Needle route when the campaign is empty.
- **All other sources are optional**: AI Ark, CSV, manual, and phone tools (Lusha/BlitzAPI, keys arrive
  later). Rule: **if at least one lead source is connected, "Leads finden" works**; if none, the page
  says which one is missing instead of showing a dead button.
- Noel will send the team's Needle API key; it replaces the current key via /integrations (no code change).

### Origin label (every lead, list + call view)

`Needle · Kampagne „<name>"` · `Needle · LinkedIn-Suche` · `BlitzAPI` · `AI Ark` · `CSV` · `Manuell` ·
`Vorbereitet` · `Demo (TEST)`. Phone numbers also show their source (`Lusha`, `BlitzAPI`, `manuell`).
The funnel line can be split by origin.

### Sorting-out statuses (no "Block", no misuse of "Opt-out")

| UI label | When | Needle effect (after SDR click) |
|---|---|---|
| **Kein Zielkunde** (company) | ICP D, reason shown | company suppression by domain, `reason: manual`, note = ICP reason, `expiresAt` +12 months |
| **Falscher Ansprechpartner** | company fits, person doesn't | lead suppression, `reason: manual`, permanent; company stays in campaign |
| **Nicht jetzt** | ICP C or no current reason | lead suppression, `reason: manual`, `expiresAt` +90 days |
| **Opt-out** | only when the person says so (call outcome or reply) | lead suppression, `reason: not_interested`/`unsubscribed`, permanent |

The ICP check only *suggests* the first three; nothing is written until the SDR clicks.
Opt-out can never come from the ICP check. If the lead has no Needle id (prepared/CSV/manual), the status
is stored in the app only, and the UI says "nur lokal".

### Client / offer

Assume a real client offer from the hosts (not known yet). The existing campaign fields `offer` and
`offer_knowledge` hold it and are editable on /setup. If the offer is empty, the check runs vendor-neutral
as the PDF prescribes (fit + activity only, no invented product angle). Seed a plausible placeholder
offer clearly labelled `TEST` so the demo works before the hosts' offer arrives.

### Fallback set

10 real developer/Bauträger companies in Germany, chosen from public sources (company + website).
They run through the same live ICP check (no hand-written scores). Contacts and phone numbers only where
publicly listed as business contacts; otherwise "Nummer eintragen". Origin `Vorbereitet`. Must be
deletable after the hackathon together with other real data.

### Settled after the builder check (my calls unless marked)

- **Learning loop**: the ICP check's fit signals and the call card's "Anlass" are stored as `lead_trigger`
  rows against a new **real-estate trigger catalog** (e.g. Ankaufsprofil veröffentlicht, neues Projekt /
  Baustart, Stellenanzeige Ankauf/Projektentwicklung, Konversion/Nachverdichtung, regionale Expansion,
  ESG-/Modernisierungsprogramm). After-call feedback confirms/contradicts these rows, and proposals change
  the catalog as today. The per-person trigger research in `lib/claude/research.ts` is replaced by the
  company ICP check for this campaign. The SDR-onboarding seed (Examples A–E, historic calls) is replaced
  by a real-estate `TEST` seed with the same coverage (one A demo-ready, one B, one C, one D, one
  "Nicht bewertbar", plus historic feedback for one proposal).
- **Person fit**: `campaign.icp_roles` defaults to Geschäftsführung, Leitung Ankauf, Leitung
  Projektentwicklung, Asset Management (editable). A lead whose role clearly doesn't match while the
  company is A/B gets the "Falscher Ansprechpartner" suggestion. The ICP check is cached **per company**;
  the call card is generated **per lead** from that cached check (one short extra call).
- **Phone lookup**: see "BlitzAPI and Lusha" below. Lookup runs **only on click** (paid credits need a
  human click). Without a phone tool, A/B leads show "Nummer eintragen".
- **ICP check volume** (my call, Xiaomei didn't object): runs automatically for at most **10 new
  companies per fetch**; the rest show "ICP-Check starten" (single + "alle offenen prüfen" button).
  No background queue.

### Demo data is secondary (Xiaomei, after builder check)

Real leads come first. The dashboard's default view shows only real leads (origins Needle, BlitzAPI,
AI Ark, CSV, Manuell, Vorbereitet — the prepared fallback companies are real companies). Simulated `TEST`
seed data lives in a separate "Demo (TEST)" tab, is never mixed into the funnel line of real leads, and
"Demo zurücksetzen" only touches TEST rows. If there are no real leads yet, the default view shows an empty
state with "Leads finden" plus a link to the Demo tab.

### BlitzAPI and Lusha (Xiaomei: build both; verified against vendor docs 2026-10-31)

Both are optional connectors on /integrations (`integration.connector_id` widened to include `blitz`,
`lusha`). Keys are stored encrypted like the others; "Verbindung testen" calls the free account endpoint.

**BlitzAPI** — base `https://api.blitz-api.ai`, header `x-api-key`. Role: **lead source** (finding
companies and decision-makers), not phones for this case: its phone endpoint covers US people only, so the
phone button is hidden for non-US leads with the note "BlitzAPI liefert Nummern nur für US-Kontakte".
- Test: `GET /v2/account/key-info` (0 records) → `valid`, `records_remaining`, `allowed_apis`.
- Find companies: `POST /v2/search/companies` with `company.industry.include` (e.g. "Real Estate",
  "Commercial Real Estate", "Residential Building Construction", "Subdivision of Land"),
  `company.keywords.include` (e.g. "Projektentwicklung", "Bauträger"), `company.hq.country_code: ["DE"]`,
  `max_results` ≤ 10; cursor pagination. Returns `name`, `domain`, `website`, `linkedin_url`,
  `employees_on_linkedin`, `hq`, `about`. 1 record per result.
- Find people per company: `POST /v2/search/employee-finder` with `company_linkedin_url`,
  `country_code: ["DE"]`, `job_level: ["C-Team","Director","VP"]`, `max_results` ≤ 5. Returns
  `full_name`, `linkedin_url`, `experiences[]` (current `job_title`, `company_domain`). 1 record per result.
- Phone (US only): `POST /v2/enrichment/phone` `{ person_linkedin_url }` → `{ found, phone }`.
- Origin label: `BlitzAPI`. Errors 402 (limit), 422, 429 shown in plain German.

**Lusha** — base `https://api.lusha.com`, header `api_key`. Role: **phone (and email) for German
contacts**, on click.
- Test: `GET /v3/account/usage` → `credits.remaining`.
- Step 1 `POST /v3/contacts/search` with `contacts: [{ clientReferenceId, linkedinUrl }]` or
  `{ firstName, lastName, companyDomain | companyName }` → `id`, `has`, `canReveal` (costs a search credit).
  Show "Lusha hat eine Nummer (≈ n Credits)" before revealing; if no phone available, say so and stop.
- Step 2 `POST /v3/contacts/enrich` `{ ids: [id], reveal: ["phones"], waterfallEnabled: false }` →
  `results[].phones[] { number (E.164), type, doNotCall }`. If a `job` comes back, poll
  `GET /v3/contacts/jobs/{jobId}` after `retryAfter` for at most ~20 s.
- Store the first non-DNC number (prefer `direct`, then `mobile`) with source `lusha`.
  **If `doNotCall: true`, show a red "Nicht anrufen (DNC-Kennzeichen)" warning and do not offer the call
  button for that number.**
- Errors 402 (no credits), 403 (V3 access), 429 shown in plain German.
- **Domain**: the builder verifies what `needleListCampaignLeads` returns; if the domain is missing, derive
  it from the company website found during the check and fall back to a normalized company name as the
  cache key.
- **Schema**: additive migration (new table/columns, widened check constraints), applied to production
  by Claude during the build, as done for RLS today. `supabase/schema.sql` is updated to match.

## The SDR's screen flow

1. **"Neu von Needle" inbox** (the dashboard `/`): funnel line at the top, e.g.
   `gefunden 24 → ICP A/B 7 → mit Nummer 5 → angerufen 2`. Rows show company, person, origin label,
   ICP score badge, routing status.
2. **ICP result** per company (in the lead view, above the call card): segment(s), score, "Was sie tun"
   (2 sentences), Fit-Signale each with a clickable source URL, "Dagegen spricht", Entscheidung + reason.
   For C/D/Nicht bewertbar: the suggested status button(s) from the table above.
3. **Call card** (A/B only), PDF format, plus the existing phone input / call button.
4. **After the call**: existing outcome flow (transcript paste → analysis, demo-ready, trigger feedback,
   proposals). Add "Opt-out" as an outcome option that triggers the Opt-out status.

## Constraints

- Stack and patterns as in the repo: Next.js 16 App Router, Supabase, `@anthropic-ai/sdk`,
  `claude-sonnet-5-5` with `web_search_20260209` (already used in `lib/claude/research.ts`).
- Needle access only through `lib/needle.ts` (MCP over HTTP). The only new write is suppressions, and only
  from an explicit user action. Send/invite/comment/react tools stay forbidden.
- ICP check is per **company** (cache by `company_domain`), so 5 people at one developer cost one check.
- Function time limits: research route 60 s in `vercel.json`; the ICP check may need its own route with a
  higher `maxDuration` (builder's call, Hobby allows up to 300 s).
- Deploy: push to `main` deploys production. Commit only after Xiaomei's OK.
- Legal guardrails from the plan stay: no outreach without approval, TEST labels on simulated data,
  recording only with consent, real data deleted after the hackathon.

## Left to the builder

- Table shape for ICP results (new `company_check` table keyed by domain vs. columns on `lead`).
- Mapping ICP score → existing `priority` / `fit_status` (suggestion: A→high/fits, B→medium/partial,
  C→low, D→low/outside, Nicht bewertbar→review).
- Whether the call card replaces or extends the existing `CallBriefing`.
- Prompt wording, as long as it encodes the PDF rules and output structure faithfully.
- How the Needle campaign id is stored (campaign row field vs. integration config).
