-- Remembers when the cheaper phone chain (AI Ark, BlitzAPI) was tried without a hit,
-- so the UI can offer Lusha (last resort) directly.
alter table lead add column if not exists phone_lookup_at timestamptz;
