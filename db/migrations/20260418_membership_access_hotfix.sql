-- Membership access hotfix
-- Ensures anon/authenticated API roles can read/write membership entities.

-- Some environments may have RLS force-enabled from dashboard defaults.
alter table if exists membership_tiers no force row level security;
alter table if exists customer_memberships no force row level security;
alter table if exists customer_discount_vehicles no force row level security;

alter table if exists membership_tiers disable row level security;
alter table if exists customer_memberships disable row level security;
alter table if exists customer_discount_vehicles disable row level security;

grant usage on schema public to anon;
grant usage on schema public to authenticated;

grant select, insert, update, delete on table membership_tiers to anon;
grant select, insert, update, delete on table membership_tiers to authenticated;
grant select, insert, update, delete on table customer_memberships to anon;
grant select, insert, update, delete on table customer_memberships to authenticated;
grant select, insert, update, delete on table customer_discount_vehicles to anon;
grant select, insert, update, delete on table customer_discount_vehicles to authenticated;
