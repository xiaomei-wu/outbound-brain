-- Needle LinkedIn search: leads exist in Needle before they are enrolled (ICP check first).
alter table lead add column if not exists needle_enrolled_at timestamptz,
  add column if not exists needle_enroll_pending boolean not null default false;
alter table campaign add column if not exists needle_search_state jsonb;
-- campaign leads and leads the app already enrolled
update lead set needle_enrolled_at = coalesce(needle_synced_at, created_at)
  where needle_enrolled_at is null
    and (origin = 'needle_campaign' or origin_detail = 'in Needle-Kampagne aufgenommen');
