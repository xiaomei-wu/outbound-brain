-- Outbound Brain. Applied to Supabase EU (Frankfurt) by the lead.

create table campaign (
  id                  uuid primary key default gen_random_uuid(),
  offer               text not null,
  icp_roles           text[] not null default '{}',
  icp_company_size_min int,
  icp_company_size_max int,
  icp_regions         text[] not null default '{}',
  exclusions          text[] not null default '{}',
  language            text not null default 'de',
  tone                text not null default 'professional',
  offer_knowledge     text not null default '',
  min_sample_size     int not null default 3,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create table trigger_catalog (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaign on delete cascade,
  name              text not null,
  buying_reason     text not null,
  tier              int not null default 2 check (tier in (1,2,3)),
  window_days       int not null default 90,
  required_evidence text not null,
  approved          boolean not null default false,
  created_at        timestamptz not null default now()
);

create table integration (
  id               uuid primary key default gen_random_uuid(),
  connector_id     text not null unique
                     check (connector_id in ('needle','ai_ark','zapmail')),
  encrypted_config text not null,
  iv               text not null,
  status           text not null default 'untested'
                     check (status in ('untested','ok','failed')),
  error_message    text,
  last_tested_at   timestamptz,
  created_at       timestamptz not null default now()
);

create table lead (
  id             uuid primary key default gen_random_uuid(),
  ai_ark_id      text unique,
  needle_lead_id text,
  name           text not null,
  role           text,
  company        text,
  company_domain text,
  company_size   int,
  region         text,
  email          text,
  phone          text,
  cached_brief   jsonb,
  profile_url    text,
  source         text not null default 'ai_ark',
  fit_score      int not null default 0,
  interest_score int not null default 0,
  priority       text not null default 'medium'
                   check (priority in ('high','medium','low','review')),
  priority_reason text not null default '',
  fit_status     text not null default 'unknown'
                   check (fit_status in ('fits','partial','outside','unknown')),
  need_status    text not null default 'unknown'
                   check (need_status in ('expressed','hypothesis','none','unknown')),
  willingness    text not null default 'unknown'
                   check (willingness in ('requested','open','declined','unknown')),
  status         text not null default 'new'
                   check (status in (
                     'new','researched','briefed','calling',
                     'called','paused','stopped')),
  owner          text,
  last_alert_at  timestamptz,
  created_at     timestamptz not null default now()
);

create table lead_trigger (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references lead on delete cascade,
  trigger_type_id  text,
  type             text not null,
  content          text not null,
  source_url       text not null,
  found_at         date,
  is_assumption    boolean not null default false,
  verdict          text not null default 'reject'
                     check (verdict in ('strong','usable','reject')),
  offer_relevance  int not null default 0 check (offer_relevance between 0 and 3),
  person_relevance int not null default 0 check (person_relevance between 0 and 3),
  evidence_kind    text not null default 'public'
                     check (evidence_kind in ('chat','call','public','seller')),
  is_active        boolean not null default true,
  feedback         text check (feedback in ('confirmed','contradicted','not_tested')),
  feedback_evidence text
);

create table lead_context (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references lead on delete cascade,
  kind        text not null check (kind in ('chat','email','linkedin','note')),
  author      text not null default 'contact' check (author in ('contact','seller')),
  content     text not null,
  occurred_at timestamptz not null default now(),
  source_url  text
);

create table bant_claim (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references lead on delete cascade,
  dimension   text not null check (dimension in ('budget','authority','need','timeline')),
  status      text not null default 'open' check (status in ('confirmed','assumed','open')),
  value       text,
  evidence    text,
  source      text check (source in ('chat','call','public','seller')),
  call_log_id uuid,
  created_at  timestamptz not null default now()
);

create table campaign_proposal (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaign on delete cascade,
  trigger_type_id text,
  title           text not null,
  rationale       text not null,
  old_rule        text not null,
  new_rule        text not null,
  assessed_count  int not null default 0,
  denominator     int not null default 0,
  evidence        jsonb not null default '[]',
  uncertainty     text not null default '',
  status          text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

create table cadence_step (
  id       uuid primary key default gen_random_uuid(),
  lead_id  uuid not null references lead on delete cascade,
  step_no  int not null default 1,
  channel  text not null check (channel in ('email','linkedin')),
  subject  text,
  body     text not null,
  status   text not null default 'draft'
             check (status in ('draft','approved','sent','cancelled'))
);

create table lead_event (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references lead on delete cascade,
  type        text not null
                check (type in ('meeting_request','positive_reply','not_now','opt_out','new_trigger','open','click')),
  occurred_at timestamptz not null default now(),
  evidence    text,
  is_test     boolean not null default false,
  dedupe_key  text unique
);

create table call_log (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references lead on delete cascade,
  outcome    text not null
               check (outcome in ('booked','not_booked','not_now','opt_out')),
  notes      text,
  transcript text,
  analysis   jsonb,
  demo_ready boolean not null default false,
  recommended_action text,
  seller_action text,
  seller_reason text,
  created_at timestamptz not null default now()
);

create table decision (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references lead on delete cascade,
  action         text not null
                   check (action in ('call_now','reply','research','follow_up','wait','stop','demo_handoff','identify_contact')),
  reason         text not null,
  fit_score      int not null,
  interest_score int not null,
  decided_by     text not null default 'rules',
  created_at     timestamptz not null default now()
);

create table agent_step (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null,
  agent          text not null check (agent in ('prospecting','signal')),
  lead_id        uuid references lead on delete cascade,
  step_no        int not null,
  tool           text not null,
  input          jsonb,
  output_summary text,
  created_at     timestamptz not null default now()
);

-- Indexes
create index idx_lead_status       on lead (status);
create index idx_lead_priority     on lead (fit_score desc, interest_score desc);
create index idx_trigger_lead      on lead_trigger (lead_id);
create index idx_event_lead        on lead_event (lead_id);
create index idx_event_dedupe      on lead_event (dedupe_key);
create index idx_calllog_lead      on call_log (lead_id);
create index idx_decision_lead     on decision (lead_id);
create index idx_agentstep_run     on agent_step (run_id);
create index idx_trigger_catalog   on trigger_catalog (campaign_id);
create index idx_context_lead      on lead_context (lead_id);
create index idx_bant_lead         on bant_claim (lead_id);
create index idx_lead_priority_v2  on lead (priority);

-- Server-only access: the app uses the service role (bypasses RLS). RLS without policies
-- blocks the public anon key from reading or writing any table via the REST API.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Real-estate ICP flow (2026-10-31): lead origin, ICP check cache, sort-out statuses, phone source.
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
  id           uuid primary key default gen_random_uuid(),
  company_key  text not null unique,
  company_name text not null,
  domain       text,
  result       jsonb not null,
  score        text not null check (score in ('A','B','C','D','nicht_bewertbar')),
  checked_at   timestamptz not null default now()
);
alter table company_check enable row level security;
-- existing demo rows become TEST
update lead set is_test = true, origin = 'test' where name like '%[TEST%' or id::text like '30000001-%';
update lead set origin = 'needle_search' where is_test = false and needle_lead_id is not null and origin = 'manual';
-- Remembers when the cheaper phone chain (AI Ark, BlitzAPI) was tried without a hit,
-- so the UI can offer Lusha (last resort) directly.
alter table lead add column if not exists phone_lookup_at timestamptz;
-- Needle chats and replies (2026-10-31): dedupe synced messages, store the reply signal per lead.
alter table lead_context add column if not exists external_id text;
-- plain (not partial) unique index so upserts can use ON CONFLICT (external_id); NULLs never collide
create unique index if not exists idx_context_external on lead_context (external_id);
alter table lead add column if not exists reply_signal text
    check (reply_signal in ('call_request','interested','later','not_interested','opt_out','wrong_contact','disqualifier','neutral')),
  add column if not exists reply_quote text,
  add column if not exists reply_reason text,
  add column if not exists reply_at timestamptz;
-- ICP result written back to Needle (campaign routing) and campaign engagement per lead.
alter table lead add column if not exists needle_synced_at timestamptz,
  add column if not exists engagement_stage text
    check (engagement_stage in ('invited','connected','messaged','replied')),
  add column if not exists engagement_at timestamptz;
-- Visible progress of background ICP checks (and the Needle write-back that follows each one).
alter table lead add column if not exists icp_status text check (icp_status in ('queued','running','failed')),
  add column if not exists icp_status_at timestamptz;
