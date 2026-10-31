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
