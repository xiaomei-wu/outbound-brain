# Lead notes for all workstream agents (read before you start)

Plan: /private/tmp/claude-501/-Users-xiaomei/6f60fa4c-01a7-4547-bf23-9d678cdedd42/scratchpad/ralplan/implementation-plan.md
Product context: /private/tmp/claude-501/-Users-xiaomei/6f60fa4c-01a7-4547-bf23-9d678cdedd42/scratchpad/ralplan/context/plan.md
Binding facts: /private/tmp/claude-501/-Users-xiaomei/6f60fa4c-01a7-4547-bf23-9d678cdedd42/scratchpad/ralplan/context/facts-and-decisions.md

## Project state (done by the lead)
- App: /Users/xiaomei/outbound-brain-app — Next.js 16.4 (App Router), React 19.3, TypeScript strict, Tailwind 4, shadcn/ui (components/ui/*: alert badge button card dialog input label select separator skeleton sonner switch table tabs textarea), pnpm.
- Installed: @anthropic-ai/sdk 1.3.0, zod 4 (works with `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod` — verified), @supabase/supabase-js, @supabase/ssr (do NOT use it), nodemailer, imapflow, papaparse, tsx.
- Contracts (FROZEN — never edit; message in your final report if you need a change): `lib/types.ts`, `lib/env.ts`, `supabase/schema.sql`. Schema is applied to the LOCAL Supabase (Docker): API http://127.0.0.1:54321, DB postgresql://postgres:postgres@127.0.0.1:54322/postgres. `.env.local` holds real keys (Anthropic, Slack webhook, Needle) and local Supabase keys — never print, copy or log their values.
- `lead.cached_brief jsonb` / `Lead.cachedBrief` exist (architect fix): the brief route reads it first and writes it after generating; the seed fills it.

## Architect fixes that override the plan
1. DB client: `import { createClient } from '@supabase/supabase-js'` with the service key — NOT @supabase/ssr. W1 owns `lib/db.ts`:
   `export function getDb() { return createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY()); }`
   Until it exists, other workstreams may import `getDb` from '@/lib/db' anyway (W1 writes it first, within minutes) — do not create your own copy of lib/db.ts.
2. Next.js 16: `params` (and `searchParams`) are Promises in pages and route handlers; `cookies()`/`headers()` are async. Always `const { id } = await params;`. Before writing Next-specific code, check `node_modules/next/dist/docs/` for the API you use.
3. Supabase rows are snake_case; `lib/types.ts` is camelCase. Map at the boundary (W1 provides `lib/mappers.ts` with `toLead`, `toLeadTrigger`, `toCallLog`, … — W1 owns it).
4. Web search pattern: use definite assignment (`let response!: Anthropic.Message;`).

## Rules for every agent
- NO git commands that change state (no init/add/commit/push). No tests (owner decision): verify with `pnpm typecheck` and `pnpm lint`, and only care about errors in files you own (others are mid-work).
- Do NOT run `pnpm build`, `pnpm dev`, `next build` or `next dev` (shared .next folder; the lead integrates). Pure modules can be smoke-run with `npx tsx <script>` from a temp file you delete afterwards.
- Do NOT install or remove packages. If you truly need one, use what exists or list it in your final report.
- Edit only files your workstream owns (plan section 4 + this note). Create new files only inside your owned paths.
- Model: `env` has no model getter; use `process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'` only inside `lib/claude/*` (W2). Sonnet 5.5: set `output_config.effort` explicitly; never `thinking: {type:'disabled'}`; never forced `tool_choice`.
- Coding standards: `interface` for object shapes/props, `type` for unions, no `any`; small components; UI separate from logic hooks; hooks return named objects; skeleton for content loading, spinner for actions; no success toast when the result is visible; always an error toast on failure; every user-facing error is one plain sentence saying what to do next (non-technical users).
- User-facing UI language: German by default (campaign.language can switch to English later); code, comments and logs in English.
- Never send real outreach. Slack test posts are allowed only with a visible "TEST" marker.
- Final report (your last message): files created/changed, how you verified, anything unfinished, any contract change you need, and exact API shapes you expose or consume.
