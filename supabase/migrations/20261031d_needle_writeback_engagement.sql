-- ICP result written back to Needle (campaign routing) and campaign engagement per lead.
alter table lead add column if not exists needle_synced_at timestamptz,
  add column if not exists engagement_stage text
    check (engagement_stage in ('invited','connected','messaged','replied')),
  add column if not exists engagement_at timestamptz;
