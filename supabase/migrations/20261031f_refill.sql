-- Refill: does the Needle campaign send (auto vs. approval), and where the sources continue.
alter table campaign add column if not exists needle_sends boolean,
  add column if not exists aiark_page int not null default 1,
  add column if not exists blitz_cursor text,
  add column if not exists refill_find_at timestamptz;
