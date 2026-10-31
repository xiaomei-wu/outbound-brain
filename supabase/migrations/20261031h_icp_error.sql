-- Why the last background ICP check failed (shown on the dashboard, e.g. Claude credit used up).
alter table lead add column if not exists icp_error text;
