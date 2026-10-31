-- Removes all simulated TEST data (2026-10-31, Xiaomei: use Needle campaign leads only).
-- Real leads (Needle, BlitzAPI, AI Ark, CSV, manual) and prepared companies are kept.
delete from lead where is_test = true;                        -- child rows cascade
delete from company_check where company_key like '%.example.com';
delete from campaign_proposal;                                -- all were computed from TEST feedback
update campaign set offer = '', offer_knowledge = '' where offer like '[TEST]%';
