# Real-Estate ICP Flow (Needle → ICP check → call card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Needle campaign leads (plus optional BlitzAPI/AI Ark/CSV/manual) get a per-company ICP check following Noel's PDF, are routed by score, A/B leads get a PDF-format call card and an on-click Lusha phone lookup, and every lead shows its origin; TEST demo data is secondary.

**Architecture:** Additive Supabase migration + pure, unit-tested helpers in `lib/` (mapping, routing, phone choice, expiry) wrapped by thin Next.js route handlers. Claude (`claude-sonnet-5-5`, web search/fetch) does the ICP check per company (cached in `company_check`) and a short per-lead call card. UI changes reuse existing shadcn components.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before route code — see AGENTS.md), React 19, TypeScript strict, Supabase JS, `@anthropic-ai/sdk` 1.3 with `zodOutputFormat`, zod 4 (no `z.tuple`), Vitest (added in Task 0), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-31-real-estate-icp-needle-design.md`

## Global Constraints

- UI copy German; code/comments English. Match surrounding code style (see `lib/connectors.ts`, `components/phone-input.tsx`).
- Model `process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'`; no `budget_tokens`, no forced `tool_choice`, no `thinking: {type:'disabled'}`.
- Needle: only read tools plus `needleCreateSuppressions`, and that only from an explicit user click. Never call send/invite/comment/react/enroll tools.
- Paid lookups (Lusha search/enrich, BlitzAPI phone) only on click. ICP check auto-runs for **at most 10 new companies per fetch**.
- Lusha `doNotCall: true` numbers are never offered as callable.
- Opt-out can only be set from a call outcome, never from the ICP check.
- Sort-out expiry: Kein Zielkunde = company, +12 months; Falscher Ansprechpartner = lead, permanent; Nicht jetzt = lead, +90 days; Opt-out = lead, permanent, reason `not_interested`.
- No secrets in logs or responses; API keys only via `getCredentials()` (DB encrypted → env fallback).
- **No git commits during execution.** Xiaomei reviews everything at the end and approves one commit (her standing rule). "Checkpoint" steps below mean: typecheck + tests green, then continue.
- Demo data: rows with `is_test = true` never appear in the default dashboard view or in the real funnel line.

## Review Focus

1. Needle returns a lead without `companyDomain` → check still runs, cache key falls back to normalized company name (`companyKey()` test in Task 0).
2. Same company pulled twice (two contacts, or two fetches) → exactly one `company_check` row, second lead reuses it (Task 4 test on `selectCompaniesToCheck`).
3. Lusha returns only DNC numbers or a pending async `job` → UI says "Nur Nummern mit Nicht-anrufen-Kennzeichen" / waits ≤ 20 s then "Lusha liefert noch — später erneut versuchen" (Task 2 `pickPhone` tests).
4. ICP model output says A/B but lists zero fit signals with URLs → downgraded to "nicht_bewertbar" (Task 4 `normalizeIcpResult` test).
5. Only one lead source connected (e.g. Needle without AI Ark) → "Leads finden" imports from it and reports the others as "nicht verbunden", never a global error (Task 6 `summarizeFind` tests).
6. A sort-out click on a lead without Needle id (prepared/CSV/manual) → stored locally, response says `syncedToNeedle: false`, UI shows "nur lokal" (Task 5 test on `buildSuppression` returning null).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261031_real_estate_icp.sql` (new) + append to `supabase/schema.sql` | schema changes |
| `vitest.config.ts` (new), `package.json` | test runner |
| `lib/types.ts`, `lib/mappers.ts` | new types/fields |
| `lib/origin.ts` (new) | `originLabel`, `companyKey` |
| `lib/blitz.ts` (new) | BlitzAPI client + pure mappers |
| `lib/lusha.ts` (new) | Lusha client + `pickPhone` |
| `lib/needle.ts` | + campaigns, campaign leads, suppressions |
| `lib/needle-sync.ts` (new) | map + upsert campaign leads |
| `lib/icp/routing.ts` (new) | score → route/priority/suggested status, expiry, suppression payload |
| `lib/claude/icp-check.ts` (new) | ICP check prompt + schema + cache |
| `lib/claude/call-card.ts` (new) | per-lead call card |
| `lib/connectors.ts` | + `blitz`, `lusha` connectors |
| `app/api/...` routes (listed per task) | thin handlers |
| `components/icp-panel.tsx`, `components/call-card.tsx`, `components/phone-lookup.tsx`, `components/sortout-actions.tsx`, `components/origin-badge.tsx`, `components/funnel-line.tsx`, `components/lead-sources.tsx` (new) | UI |
| `lib/seed-data.ts`, `lib/seed-real-estate.ts` (new) | TEST seed + prepared companies |

---

### Task 0: Foundation (schema, types, test runner, origin helpers) — run first, alone

**Files:**
- Create: `supabase/migrations/20261031_real_estate_icp.sql`, `vitest.config.ts`, `lib/origin.ts`, `lib/origin.test.ts`
- Modify: `supabase/schema.sql` (append same SQL), `package.json`, `lib/types.ts`, `lib/mappers.ts`

**Interfaces — Produces:**
- Types in `lib/types.ts`:
  - `type ConnectorId = 'needle' | 'ai_ark' | 'zapmail' | 'blitz' | 'lusha'`
  - `type LeadOrigin = 'needle_campaign' | 'needle_search' | 'blitz' | 'ai_ark' | 'csv' | 'manual' | 'prepared' | 'test'`
  - `type IcpScore = 'A' | 'B' | 'C' | 'D' | 'nicht_bewertbar'`
  - `type SortoutStatus = 'not_a_fit' | 'wrong_contact' | 'not_now' | 'opt_out'`
  - `interface IcpSignal { text: string; url: string }`
  - `interface CompanyCheck { id; companyKey; companyName; domain: string|null; segments: string[]; score: IcpScore; whatTheyDo: string; fitSignals: IcpSignal[]; against: string[]; decision: string; decisionReason: string; painHypothesis: string; entryPoint: string; openQuestion: string; checkedAt: string }`
  - `interface CallCard { anlass: string; anlassUrl: string|null; opener: string; followUps: string[]; objection: { expected: string; response: string }; openQuestion: string }`
  - `Lead` gains: `origin: LeadOrigin; originDetail: string|null; isTest: boolean; companyKey: string|null; sortoutStatus: SortoutStatus|null; sortoutSyncedNeedle: boolean; sortoutUntil: string|null; phoneSource: string|null; phoneDnc: boolean; callCard: CallCard|null`
  - `Campaign` gains: `needleCampaignId: string|null; needleCampaignName: string|null`
- `lib/origin.ts`: `originLabel(origin: LeadOrigin, detail: string|null): string`, `companyKey(domain: string|null, name: string|null): string|null`

- [ ] **Step 1: Add Vitest.** `pnpm add -D vitest@3.2.4`; script `"test": "vitest run"`; `vitest.config.ts` with `resolve.alias['@'] = path.resolve(__dirname)` and `test.environment = 'node'`.
- [ ] **Step 2: Write failing tests** `lib/origin.test.ts`:

```ts
expect(originLabel('needle_campaign', 'Projektentwickler Berlin')).toBe('Needle · Kampagne „Projektentwickler Berlin"');
expect(originLabel('needle_search', null)).toBe('Needle · LinkedIn-Suche');
expect(originLabel('blitz', null)).toBe('BlitzAPI');
expect(originLabel('ai_ark', null)).toBe('AI Ark');
expect(originLabel('csv', null)).toBe('CSV');
expect(originLabel('manual', null)).toBe('Manuell');
expect(originLabel('prepared', null)).toBe('Vorbereitet');
expect(originLabel('test', null)).toBe('Demo (TEST)');
expect(companyKey('https://www.Instone.de/kontakt', 'x')).toBe('instone.de');
expect(companyKey(null, 'Instone Real Estate Group SE')).toBe('name:instone real estate group');
expect(companyKey(null, '  ')).toBeNull();
```
  (`companyKey`: strip protocol, `www.`, path, lowercase; for names lowercase, trim, drop legal suffixes `gmbh & co. kg|gmbh|ag|se|kg|mbh|ug` and collapse spaces, prefix `name:`.)
- [ ] **Step 3:** `pnpm test lib/origin.test.ts` → FAIL (module not found).
- [ ] **Step 4: Implement** `lib/origin.ts`.
- [ ] **Step 5:** `pnpm test` → PASS.
- [ ] **Step 6: Migration SQL** (exact):

```sql
alter table integration drop constraint if exists integration_connector_id_check;
alter table integration add constraint integration_connector_id_check
  check (connector_id in ('needle','ai_ark','zapmail','blitz','lusha'));
alter table campaign add column if not exists needle_campaign_id text,
                     add column if not exists needle_campaign_name text;
alter table lead add column if not exists origin text not null default 'manual'
    check (origin in ('needle_campaign','needle_search','blitz','ai_ark','csv','manual','prepared','test')),
  add column if not exists origin_detail text,
  add column if not exists is_test boolean not null default false,
  add column if not exists company_key text,
  add column if not exists sortout_status text check (sortout_status in ('not_a_fit','wrong_contact','not_now','opt_out')),
  add column if not exists sortout_synced_needle boolean not null default false,
  add column if not exists sortout_until timestamptz,
  add column if not exists phone_source text,
  add column if not exists phone_dnc boolean not null default false,
  add column if not exists call_card jsonb;
create unique index if not exists idx_lead_needle_id on lead (needle_lead_id) where needle_lead_id is not null;
create index if not exists idx_lead_company_key on lead (company_key);
create table if not exists company_check (
  id uuid primary key default gen_random_uuid(),
  company_key text not null unique,
  company_name text not null,
  domain text,
  result jsonb not null,
  score text not null check (score in ('A','B','C','D','nicht_bewertbar')),
  checked_at timestamptz not null default now()
);
alter table company_check enable row level security;
-- existing demo rows become TEST
update lead set is_test = true, origin = 'test' where name like '%[TEST%' or id::text like '30000001-%';
```
  (`result` holds the full `CompanyCheck` JSON minus id/companyKey/checkedAt.)
- [ ] **Step 7: Apply** locally: `docker exec -i supabase_db_outbound-brain-app psql -U postgres -q < supabase/migrations/20261031_real_estate_icp.sql`; prod: `npx supabase db query --linked --project-ref xaephwucuejbswxtycwm -f supabase/migrations/20261031_real_estate_icp.sql`. Expected: no error; `select count(*) from company_check` → 0 on both.
- [ ] **Step 8:** Update `lib/types.ts` + `lib/mappers.ts` (`toLead` maps new snake_case columns; `toCompanyCheck(row)` new). Existing seed inserts must set `origin: 'test', is_test: true`.
- [ ] **Step 9: Checkpoint:** `pnpm typecheck && pnpm test` → clean.

---

### Task 1: BlitzAPI connector + lead source  *(parallel after Task 0)*

**Files:** Create `lib/blitz.ts`, `lib/blitz.test.ts`, `app/api/leads/find/blitz/route.ts`. Modify `lib/connectors.ts` (registry entry + `testBlitz`).

**Interfaces:**
- Consumes: `getCredentials('blitz')`, `companyKey`, `createLead`-style insert (write rows directly with `origin: 'blitz'`).
- Produces:
  - `blitzKeyInfo(apiKey: string): Promise<{ valid: boolean; recordsRemaining: number }>` (GET `/v2/account/key-info`)
  - `blitzSearchCompanies(apiKey, opts: { maxResults: number; cursor?: string|null }): Promise<{ companies: BlitzCompany[]; cursor: string|null }>` (POST `/v2/search/companies`, body below)
  - `blitzFindEmployees(apiKey, companyLinkedinUrl: string, maxResults: number): Promise<BlitzPerson[]>` (POST `/v2/search/employee-finder`, `country_code:['DE']`, `job_level:['C-Team','Director','VP']`)
  - `blitzPhone(apiKey, personLinkedinUrl: string): Promise<string|null>` (POST `/v2/enrichment/phone`; US only)
  - pure `mapBlitzPerson(p: BlitzPerson, c: BlitzCompany): NewLeadRow` and `blitzErrorMessage(status: number): string`
  - Route `POST /api/leads/find/blitz` body `{ limit?: number }` (default 5 companies × 2 people) → `{ created: number; skipped: number; message: string }`
- Company search body (exact): `{ company: { industry: { include: ['Real Estate','Commercial Real Estate','Residential Building Construction','Subdivision of Land'] }, keywords: { include: ['Projektentwicklung','Bauträger','Projektentwickler'] }, hq: { country_code: ['DE'] } }, max_results, cursor }`. Header `x-api-key`. Base `https://api.blitz-api.ai`.

- [ ] **Step 1: Failing tests** (`lib/blitz.test.ts`, fixtures inline):

```ts
const company = { name: 'Beispiel Projekt GmbH', domain: 'beispiel-projekt.de', linkedin_url: 'https://www.linkedin.com/company/x', hq: { city: 'Berlin', country_code: 'DE' }, employees_on_linkedin: 40 };
const person = { full_name: 'Erika Muster', linkedin_url: 'https://www.linkedin.com/in/erika', location: { city: 'Berlin', country_code: 'DE' }, experiences: [{ job_title: 'Leitung Ankauf', job_is_current: true, company_domain: 'beispiel-projekt.de' }] };
const row = mapBlitzPerson(person, company);
expect(row).toMatchObject({ name: 'Erika Muster', role: 'Leitung Ankauf', company: 'Beispiel Projekt GmbH', company_domain: 'beispiel-projekt.de', company_key: 'beispiel-projekt.de', profile_url: 'https://www.linkedin.com/in/erika', region: 'Berlin', origin: 'blitz', source: 'blitz', is_test: false, company_size: 40 });
expect(blitzErrorMessage(402)).toBe('BlitzAPI-Kontingent für diesen Monat aufgebraucht.');
expect(blitzErrorMessage(401)).toBe('BlitzAPI-Schlüssel ungültig — bitte auf der Integrations-Seite prüfen.');
expect(blitzErrorMessage(429)).toBe('BlitzAPI: zu viele Anfragen — bitte kurz warten.');
```
- [ ] **Step 2:** `pnpm test lib/blitz.test.ts` → FAIL.
- [ ] **Step 3: Implement** `lib/blitz.ts` (fetch with 30 s `AbortSignal.timeout`, throw `Error(blitzErrorMessage(status))` on non-2xx). `role` = current experience `job_title`.
- [ ] **Step 4:** tests → PASS.
- [ ] **Step 5: Connector** entry `blitz: { id:'blitz', label:'BlitzAPI', description:'Firmen- und Entscheider-Suche (Telefon nur US)', fields:[{ name:'apiKey', label:'API-Schlüssel', placeholder:'blitz_…', secret:true }], test: testBlitz }`; `testBlitz` → `ok` message `Verbunden — ${recordsRemaining} Datensätze übrig.`
- [ ] **Step 6: Route** `POST /api/leads/find/blitz`: no key → 400 `"BlitzAPI ist nicht verbunden."`; upsert by `profile_url` (skip existing); after insert call `scheduleIcpChecks(newLeadIds)` from Task 4 (import; if Task 4 not merged yet, leave a `// TODO(Task 4)` — integrator resolves).
- [ ] **Step 7: Checkpoint:** typecheck + tests green.

---

### Task 2: Lusha connector + on-click phone lookup  *(parallel after Task 0)*

**Files:** Create `lib/lusha.ts`, `lib/lusha.test.ts`, `app/api/leads/[id]/phone-lookup/route.ts`, `components/phone-lookup.tsx`. Modify `lib/connectors.ts` (entry + `testLusha`), `app/api/leads/[id]/phone/route.ts` (set `phone_source: 'manuell'`, `phone_dnc: false`).

**Interfaces — Produces:**
- `lushaUsage(apiKey): Promise<{ remaining: number }>` (GET `/v3/account/usage`, header `api_key`)
- `lushaSearch(apiKey, c: { linkedinUrl?: string; firstName?: string; lastName?: string; companyDomain?: string; companyName?: string }): Promise<{ id: string; phoneCredits: number|null } | null>` (POST `/v3/contacts/search`, `contacts:[{ clientReferenceId:'1', ...}]`; `phoneCredits` from `canReveal` entry with `field==='phones'`, null if none)
- `lushaRevealPhones(apiKey, id): Promise<LushaPhone[] | { pendingJobId: string; retryAfter: number }>` (POST `/v3/contacts/enrich` `{ ids:[id], reveal:['phones'], waterfallEnabled:false }`; poll `GET /v3/contacts/jobs/{jobId}` until done or 20 s total)
- pure `pickPhone(phones: LushaPhone[]): { number: string; type: string } | { allDnc: true } | null` — prefer `direct`, then `mobile`, then `work`, then any; skip `doNotCall`
- `lushaErrorMessage(status: number): string`
- Route `POST /api/leads/[id]/phone-lookup` body `{ step: 'search' | 'reveal', lushaId?: string }`:
  - `search` → `{ found: boolean; lushaId?: string; credits?: number|null; message: string }`
  - `reveal` → `{ phone?: string; dnc?: boolean; message: string }`; saves `phone`, `phone_source:'lusha'`, `phone_dnc:false`; if all DNC saves nothing and returns `dnc:true`.
  - BlitzAPI fallback: if Lusha not connected and Blitz connected and lead region/country is US → `blitzPhone`; else message `"BlitzAPI liefert Nummern nur für US-Kontakte."`
- `<PhoneLookup leadId hasLusha hasBlitz />`: button "Nummer über Lusha suchen" → shows "Lusha hat eine Nummer (≈ n Credits) — aufdecken?" → reveal; red alert for DNC.

- [ ] **Step 1: Failing tests:**

```ts
expect(pickPhone([{ number:'+4930111', type:'mobile', doNotCall:false }, { number:'+4930222', type:'direct', doNotCall:false }])).toEqual({ number:'+4930222', type:'direct' });
expect(pickPhone([{ number:'+4930222', type:'direct', doNotCall:true }, { number:'+4930111', type:'mobile', doNotCall:false }])).toEqual({ number:'+4930111', type:'mobile' });
expect(pickPhone([{ number:'+4930222', type:'direct', doNotCall:true }])).toEqual({ allDnc: true });
expect(pickPhone([])).toBeNull();
expect(lushaErrorMessage(402)).toBe('Lusha: keine Credits mehr.');
expect(lushaErrorMessage(403)).toBe('Lusha: API-Zugang (V3) nicht freigeschaltet.');
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5:** connector entry `lusha: { label:'Lusha', description:'Telefonnummern (auf Klick, kostet Credits)', fields:[apiKey secret] }`, test message `Verbunden — ${remaining} Credits übrig.`
- [ ] **Step 6:** route + component; mount `<PhoneLookup>` next to `<PhoneInput>` in `app/leads/[id]/page.tsx:332` only when `lead.phone` is empty and ICP score is A/B (Task 6 wires the condition; here accept a `visible` prop).
- [ ] **Step 7: Checkpoint.**

---

### Task 3: Needle campaign source + suppressions  *(parallel after Task 0)*

**Files:** Modify `lib/needle.ts`. Create `lib/needle-sync.ts`, `lib/needle-sync.test.ts`, `app/api/needle/campaigns/route.ts`, `app/api/leads/sync-needle/route.ts`. Modify `app/api/campaign/route.ts` (accept `needleCampaignId`, `needleCampaignName`).

**Interfaces — Produces:**
- `lib/needle.ts`: `listCampaigns(): Promise<{ id: string; name: string; status: string; enrollmentCount: number }[]>` (`needleListCampaigns`, limit 100); `listCampaignLeads(campaignId: string, cursor?: string): Promise<{ leads: NeedleCampaignLead[]; nextCursor: string|null }>` (`needleListCampaignLeads`, limit 100); `createSuppression(entry: NeedleSuppressionEntry): Promise<void>` (`needleCreateSuppressions` with `entries:[entry]`) — doc comment: "Only call from an explicit user action."
- `NeedleCampaignLead` = `{ leadId: string; firstName: string|null; lastName: string|null; companyName: string|null; companyDomain: string|null; jobTitle: string|null; email: string|null; status: string }` (verified shape 2026-10-31).
- `lib/needle-sync.ts`: pure `mapCampaignLead(l: NeedleCampaignLead, campaignName: string): NewLeadRow` (origin `needle_campaign`, `origin_detail` = campaignName, `needle_lead_id` = leadId, `company_key` = `companyKey(domain,name)`, `source:'needle'`); `syncNeedleCampaign(): Promise<{ fetched: number; created: number; newLeadIds: string[] }>` (reads active campaign's `needle_campaign_id`, pages until done or 500 leads, upsert on `needle_lead_id`, skips leads with `status === 'exited'`).
- Routes: `GET /api/needle/campaigns` → `{ campaigns }` or 400 `"Needle ist nicht verbunden."`; `POST /api/leads/sync-needle` → `{ fetched, created, checksStarted }` (calls `scheduleIcpChecks(newLeadIds)`); if no campaign chosen → 400 `"Bitte zuerst auf der Setup-Seite eine Needle-Kampagne wählen."`

- [ ] **Step 1: Failing tests:**

```ts
const l = { leadId:'01a1-x', firstName:'Erika', lastName:'Muster', companyName:'Beispiel Bau GmbH', companyDomain:'beispiel-bau.de', jobTitle:'Geschäftsführerin', email:null, status:'active' };
expect(mapCampaignLead(l, 'Projektentwickler Berlin')).toMatchObject({ name:'Erika Muster', role:'Geschäftsführerin', company:'Beispiel Bau GmbH', company_domain:'beispiel-bau.de', company_key:'beispiel-bau.de', needle_lead_id:'01a1-x', origin:'needle_campaign', origin_detail:'Projektentwickler Berlin', is_test:false });
expect(mapCampaignLead({ ...l, companyDomain:null }, 'X').company_key).toBe('name:beispiel bau');
expect(mapCampaignLead({ ...l, firstName:null, lastName:null }, 'X').name).toBe('Unbekannt (Beispiel Bau GmbH)');
```
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** routes. Verify against the real Needle account read-only: `curl` `GET /api/needle/campaigns` on local server → lists ≥ 1 campaign.
- [ ] **Step 6: Checkpoint.**

---

### Task 4: ICP check + call card + routing  *(parallel after Task 0; largest)*

**Files:** Create `lib/icp/routing.ts`, `lib/icp/routing.test.ts`, `lib/claude/icp-check.ts`, `lib/claude/call-card.ts`, `lib/icp/schedule.ts`, `app/api/leads/[id]/icp-check/route.ts`, `app/api/leads/icp-check-open/route.ts`. Modify `vercel.json` (add `"app/api/leads/[id]/icp-check/route.ts": { "maxDuration": 180 }`, `"app/api/leads/icp-check-open/route.ts": { "maxDuration": 300 }`).

**Interfaces — Produces:**
- `lib/icp/routing.ts` (pure):
  - `normalizeIcpResult(r: CompanyCheck): CompanyCheck` — A/B with 0 `fitSignals` having an `https?://` url → score `nicht_bewertbar`, decision `Recherche ergänzen`.
  - `routeForScore(score: IcpScore): { route: 'call' | 'park' | 'exclude' | 'research'; priority: Priority; fitStatus: FitStatus; suggested: SortoutStatus[] }` — A→call/high/fits/[], B→call/medium/partial/[], C→park/low/partial/['not_now'], D→exclude/low/outside/['not_a_fit'], nicht_bewertbar→research/review/unknown/[].
  - `roleMatches(role: string|null, icpRoles: string[]): boolean` — case-insensitive substring either way; null role → true (unknown is not a mismatch). If company A/B and `!roleMatches` → add `'wrong_contact'` to suggested.
  - `selectCompaniesToCheck(leads: { id: string; companyKey: string|null }[], alreadyChecked: Set<string>, cap: number): string[]` — unique company keys not yet checked, in input order, max `cap`; leads with null key skipped.
  - `sortoutExpiry(status: SortoutStatus, now: Date): Date | null` — not_a_fit +12 months, not_now +90 days, wrong_contact/opt_out null.
  - `buildSuppression(status: SortoutStatus, lead: { needleLeadId: string|null; companyDomain: string|null }, note: string, now: Date): NeedleSuppressionEntry | null` — not_a_fit → `{ scope:'company', companyDomain, reason:'manual', note, expiresAt }` (null if no domain); others → `{ scope:'lead', leadId, reason: status==='opt_out' ? 'not_interested' : 'manual', note, expiresAt }` (null if no needleLeadId).
- `lib/claude/icp-check.ts`: `runIcpCheck(input: { companyName: string; domain: string|null; campaign: Campaign }): Promise<CompanyCheck>` and `getOrRunCompanyCheck(lead: Lead, campaign: Campaign): Promise<CompanyCheck>` (cache by `company_key` in `company_check`). System prompt encodes the PDF verbatim in substance: segments 1–7 with fit criteria and "Kein Fit", disqualifiers (segment-specific), A/B/C/D/Nicht bewertbar definitions, evidence rules ("nicht auffindbar" ≠ "nicht vorhanden", current projects only, group vs. SPV), pain hypothesis rules incl. literal fallback „Keine belastbare Pain-Hypothese ableitbar.", offer used only if `campaign.offer` non-empty. Tools: `web_search_20260209` (max_uses 6) + `web_fetch_20260209` (max_uses 6). Output via `zodOutputFormat(CompanyCheckSchema)`, `max_tokens` 8000, streaming `.finalMessage()` not needed with parse; set `output_config.effort: 'medium'`. Result passed through `normalizeIcpResult`.
- `lib/claude/call-card.ts`: `generateCallCard(lead: Lead, check: CompanyCheck, campaign: Campaign): Promise<CallCard | null>` — returns null unless score A/B. Prompt encodes PDF "Regeln für den Anruf-Einstieg" + "Formulierung" (≤ 40 s, no product name, no "Störe ich gerade?", self-intro ≤ half sentence, open process question, exit offer) and "Vertiefungsfragen und Einwand". No tools, `effort: 'low'`.
- `lib/icp/schedule.ts`: `scheduleIcpChecks(leadIds: string[]): Promise<number>` — loads leads, `selectCompaniesToCheck(…, 10)`, runs inside `after()` sequentially, then for every lead of each checked company: write `priority`, `fit_status`, `priority_reason` (= decision reason), `call_card`, and `lead_trigger` rows (one per fit signal: `type` = signal text, `evidence_kind:'public'`, `source_url` = url, `trigger_type_id` = matched real-estate catalog id by keyword or null). Returns number of companies scheduled.
- Routes: `POST /api/leads/[id]/icp-check` (sync, returns `{ check, callCard }`; `?force=1` bypasses cache); `POST /api/leads/icp-check-open` (schedules all unchecked non-test leads, cap 10) → `{ scheduled }`.

- [ ] **Step 1: Failing tests** (`lib/icp/routing.test.ts`): one `expect` per mapping row above for `routeForScore`; `normalizeIcpResult` downgrade (A with `fitSignals:[{text:'x',url:''}]` → `nicht_bewertbar`) and keep (A with url `https://a.de/projekte` → `A`); `roleMatches('Geschäftsführer', ['Geschäftsführung'])` → false? — **use stem matching**: lowercase, compare first 8 chars of each word; assert `roleMatches('Geschäftsführer', ['Geschäftsführung']) === true`, `roleMatches('Werkstudent Marketing', ['Geschäftsführung','Leitung Ankauf']) === false`, `roleMatches(null, ['x']) === true`; `selectCompaniesToCheck([{id:'1',companyKey:'a.de'},{id:'2',companyKey:'a.de'},{id:'3',companyKey:null},{id:'4',companyKey:'b.de'}], new Set(['b.de']), 10)` → `['a.de']`; cap test with 12 distinct keys → length 10; `sortoutExpiry('not_a_fit', new Date('2026-10-31T12:00:00Z'))` → `2027-10-31T12:00:00.000Z`, `'not_now'` → `2027-01-29T12:00:00.000Z`, `'opt_out'` → null; `buildSuppression('not_a_fit', {needleLeadId:'l1', companyDomain:null}, 'n', now)` → null; `buildSuppression('opt_out', {needleLeadId:'l1', companyDomain:'a.de'}, 'n', now)` → `{ scope:'lead', leadId:'l1', reason:'not_interested', note:'n', expiresAt:null }`.
- [ ] **Step 2–4:** fail → implement `routing.ts` → pass.
- [ ] **Step 5:** implement `icp-check.ts`, `call-card.ts`, `schedule.ts`, routes.
- [ ] **Step 6: Live check (costs ~10 ct):** with local server, create a manual lead for a real developer (e.g. company "Instone Real Estate", domain `instone.de`) and `POST /api/leads/{id}/icp-check` → 200, `check.score` ∈ A–D/nicht_bewertbar, every `fitSignals[].url` starts with `https://`, `callCard` non-null iff score A/B. Delete that lead afterwards.
- [ ] **Step 7: Checkpoint.**

---

### Task 5: Sort-out statuses  *(after Tasks 3 + 4)*

**Files:** Create `app/api/leads/[id]/sortout/route.ts`, `components/sortout-actions.tsx`. Modify `app/api/leads/[id]/outcome/route.ts` (accept `optOut: boolean` → applies `opt_out`).

**Interfaces:**
- Consumes: `buildSuppression`, `sortoutExpiry` (Task 4), `createSuppression` (Task 3).
- Produces: `POST /api/leads/[id]/sortout` body `{ status: 'not_a_fit' | 'wrong_contact' | 'not_now' | null }` (`opt_out` rejected with 400 `"Opt-out nur aus dem Gesprächsergebnis."`; `null` = undo locally) → `{ status, until: string|null, syncedToNeedle: boolean, message }`. `not_a_fit` applies to **all leads with the same `company_key`**. Lead `status` → `'stopped'` for not_a_fit/wrong_contact/opt_out, `'paused'` for not_now. Needle failure → still saved locally, message `"Lokal gespeichert — Needle nicht erreichbar."`
- `<SortoutActions leadId suggested={SortoutStatus[]} current={SortoutStatus|null} />` — German labels: Kein Zielkunde / Falscher Ansprechpartner / Nicht jetzt; suggested ones emphasised; shows "nur lokal" when `syncedToNeedle:false`; no success toast (result visible), error toast on failure.

- [ ] **Step 1:** implement route; **Step 2:** manual verification on local DB with a prepared (non-Needle) lead → response `syncedToNeedle:false`, row has `sortout_status` and `sortout_until` ≈ +90 days for not_now. Do **not** test the Needle write against production Needle unless Xiaomei approves; verify the payload by unit test (Task 4) instead.
- [ ] **Step 3:** component + outcome `optOut` checkbox "Person möchte nicht kontaktiert werden (Opt-out)".
- [ ] **Step 4: Checkpoint.**

---

### Task 6: UI — inbox, origin, ICP panel, call card, lead sources  *(after Tasks 1–5)*

**Files:** Create `components/origin-badge.tsx`, `components/funnel-line.tsx`, `components/icp-panel.tsx`, `components/call-card.tsx`, `components/lead-sources.tsx`. Modify `components/lead-table.tsx` (tabs), `app/page.tsx`, `app/leads/[id]/page.tsx`, `app/setup/page.tsx`, `app/integrations/page.tsx` (shows new connectors automatically from registry — verify).

**Interfaces / behaviour:**
- `funnelCounts(leads: Lead[]): { found: number; ab: number; withPhone: number; called: number }` pure in `components/funnel-line.tsx` (exported for test) — only `!isTest`; `ab` = priority high|medium with fitStatus fits|partial; `called` = status called. Rendered: `gefunden {found} → ICP A/B {ab} → mit Nummer {withPhone} → angerufen {called}`.
- Lead table: first tab "Echte Leads" (default, `!isTest`, `sortoutStatus === null`), existing priority tabs filter within real leads, new tab "Aussortiert" (sortoutStatus set), last tab "Demo (TEST)" (`isTest`). Each row shows `<OriginBadge>`; phone source shown as small text when present.
- Empty state (no real leads): "Noch keine echten Leads." + `<LeadSources>` button + link "Demo (TEST) ansehen".
- **Bug fix (Xiaomei, live today):** the dashboard button in `components/lead-table.tsx:197` calls only the AI Ark import and shows "Leads konnten nicht importiert werden. AI Ark Schlüssel …" when AI Ark is missing, even if Needle is connected. Replace it with a unified `POST /api/leads/find` (new `app/api/leads/find/route.ts`) that runs **every connected lead source** in order Needle campaign → BlitzAPI → AI Ark, each in its own try/catch, and returns `{ results: { source: LeadOrigin; ok: boolean; created: number; message: string }[]; totalCreated: number }`. HTTP 200 if at least one source succeeded; 400 `Keine Lead-Quelle verbunden — …` only if none is connected. A missing/failed source never fails the whole call. The UI shows one line per source (e.g. "Needle: 12 neu · AI Ark: nicht verbunden"). Pure helper `summarizeFind(results)` in `lib/lead-find.ts` with tests: (a) Needle ok + AI Ark not connected → `ok`, message contains "Needle: 12 neu"; (b) all not connected → not ok; (c) Needle throws, BlitzAPI ok → `ok`, message contains "Needle: Fehler".
- `<LeadSources>` (on `/setup` "Leads finden" section and dashboard empty state): primary button "Leads finden" (unified endpoint) plus one button per connected source — "Aus Needle-Kampagne abrufen", "Mit BlitzAPI suchen", existing AI Ark import, CSV, manual. If no source connected: `Keine Lead-Quelle verbunden — bitte Needle (empfohlen) oder BlitzAPI auf der Integrations-Seite verbinden.` with link. Plus "Offene ICP-Checks starten (max. 10)".
- `/setup`: Needle campaign `<select>` filled from `GET /api/needle/campaigns`, saved via campaign PUT; `icp_roles` default shown as `Geschäftsführung, Leitung Ankauf, Leitung Projektentwicklung, Asset Management` when empty.
- Lead page (`app/leads/[id]/page.tsx`): above the existing brief, `<IcpPanel check routeInfo />` (segment, score badge, "Was sie tun", Fit-Signale as links, "Dagegen spricht", Entscheidung + reason, pain hypothesis, `<SortoutActions>`); for A/B `<CallCard card />` in PDF order (Anlass with link, Anruf-Einstieg in a quote block, Wenn die Person andockt (2), Wahrscheinlichster Einwand / Umgang, Offene Frage vor dem Kontakt). No check yet → button "ICP-Check starten" (spinner, calls Task 4 route, `router.refresh()`). `phone_dnc` → red "Nicht anrufen (DNC-Kennzeichen)" and hide call button. Origin badge in header.

- [ ] **Step 1: Failing test** `components/funnel-line.test.ts` for `funnelCounts` with 1 test lead + 3 real (A with phone called, B no phone, D) → `{ found:3, ab:2, withPhone:1, called:1 }`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** components + wiring. **Step 6:** `pnpm build` → success. **Step 7:** browser check (Playwright script in scratchpad like the earlier login test): dashboard default tab shows no TEST rows; Demo tab shows them; lead page of an A lead shows ICP panel + call card; `/setup` scrolls to "Leads finden".
- [ ] **Step 8: Checkpoint.**

---

### Task 7: Seeds — real-estate TEST data + 10 prepared real companies  *(parallel after Task 0; seed wiring after Task 4)*

**Files:** Create `lib/seed-real-estate.ts`. Modify `lib/seed-data.ts` (replace SDR examples), `scripts/seed.ts`, `app/api/seed/route.ts` (reset deletes only `is_test = true` rows and their children).

**Interfaces — Produces:**
- `REAL_ESTATE_TRIGGER_CATALOG`: 6 entries (ids `re-ankaufsprofil`, `re-neues-projekt`, `re-stellen-ankauf`, `re-konversion`, `re-expansion`, `re-esg-modernisierung`), names as in the spec, tier 1–2, window 90 days, `approved:true`, each with `keywords: string[]` used by `scheduleIcpChecks` matching.
- TEST seed (all names suffixed `[TEST/Beispiel]`, `is_test:true`, `origin:'test'`): one A demo-ready (with call log), one B, one C, one D, one nicht_bewertbar, 4 historic leads whose `lead_trigger` feedback makes "Stellenanzeige Ankauf" 3 of 4 contradicted (keeps the proposal demo). Pre-computed `company_check` rows + `call_card` for A and B so the demo needs no API calls. Campaign offer placeholder: `"[TEST] Software für Ankaufsprüfung und Projektpriorisierung bei Projektentwicklern"` with `offer_knowledge` 3 short facts, editable.
- `PREPARED_COMPANIES: { name: string; domain: string; city: string; sourceUrl: string }[]` — exactly 10 real German Projektentwickler/Bauträger, researched now from public sources (company websites); each `sourceUrl` must resolve (HTTP 200/301). Inserted as leads with `origin:'prepared'`, `name: 'Ansprechpartner offen (<company>)'`, no person data, `is_test:false`. ICP checks run via "Offene ICP-Checks starten" (not pre-baked).

- [ ] **Step 1:** research the 10 companies (web search), verify each `sourceUrl` with `curl -sI`.
- [ ] **Step 2:** write seed modules; **Step 3:** `pnpm seed` locally → counts printed, dashboard default view shows 10 prepared + 0 TEST, Demo tab shows TEST set.
- [ ] **Step 4: Checkpoint.**

---

### Task 8: Integration, verification, deploy  *(last; native)*

- [ ] **Step 1:** resolve any `TODO(Task 4)` imports; `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all clean.
- [ ] **Step 2:** apply migration to prod (if not done in Task 0) and `pnpm seed` against prod with `~/.ob_prod.env` (as earlier today).
- [ ] **Step 3:** local end-to-end: Needle campaign list → pick a campaign → sync (read-only) → ICP auto-checks (≤ 10) → A/B lead shows call card → Lusha button shows "nicht verbunden" message (no key yet) → sort-out "Nicht jetzt" on a prepared lead → "nur lokal".
- [ ] **Step 4:** **Stop and ask Xiaomei** to review the diff and approve the commit (one squashed commit, her rule). On OK: commit, `git push`, watch the Vercel deploy, rerun the Playwright login + scroll + dashboard checks against `https://outbound-brain.vercel.app`.

---

## Parallelization

Task 0 alone → Tasks 1, 2, 3, 4, 7 in parallel (disjoint files except `lib/connectors.ts` touched by 1 and 2: Task 1 owns the registry edit, Task 2 sends its entry to the integrator if conflict) → Task 5 → Task 6 → Task 8.
