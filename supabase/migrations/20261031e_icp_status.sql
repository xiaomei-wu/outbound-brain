-- Visible progress of background ICP checks (and the Needle write-back that follows each one).
alter table lead add column if not exists icp_status text check (icp_status in ('queued','running','failed')),
  add column if not exists icp_status_at timestamptz;
