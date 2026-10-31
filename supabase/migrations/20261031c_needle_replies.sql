-- Needle chats and replies (2026-10-31): dedupe synced messages, store the reply signal per lead.
alter table lead_context add column if not exists external_id text;
-- plain (not partial) unique index so upserts can use ON CONFLICT (external_id); NULLs never collide
create unique index if not exists idx_context_external on lead_context (external_id);
alter table lead add column if not exists reply_signal text
    check (reply_signal in ('call_request','interested','later','not_interested','opt_out','wrong_contact','disqualifier','neutral')),
  add column if not exists reply_quote text,
  add column if not exists reply_reason text,
  add column if not exists reply_at timestamptz;
