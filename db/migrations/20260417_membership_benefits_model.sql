-- Membership benefits model upgrade
-- Adds required tier attributes and snapshots while preserving existing schema.

-- 1) Extend membership tier template fields to match requirement.
alter table if exists membership_tiers
  add column if not exists status_points integer not null default 0 check (status_points >= 0),
  add column if not exists birthday_gift boolean not null default false,
  add column if not exists discounted_rate numeric(5,2) not null default 0 check (discounted_rate >= 0 and discounted_rate <= 100),
  add column if not exists linked_license_plates integer not null default 0 check (linked_license_plates >= 0),
  add column if not exists complimentary_car_care_upgrade integer not null default 0 check (complimentary_car_care_upgrade >= 0),
  add column if not exists priority_wash integer not null default 0 check (priority_wash >= 0),
  add column if not exists exclusive_invitation boolean not null default false;

-- Backfill new columns from existing legacy fields where available.
update membership_tiers
set
  status_points = status_points_threshold,
  discounted_rate = discount_rate,
  linked_license_plates = discount_eligible_car_limit,
  exclusive_invitation = exclusive_events,
  priority_wash = priority_level
where true;

-- Allow only the 5 supported membership classes.
create unique index if not exists ux_membership_tiers_name_exact
  on membership_tiers (upper(name));

alter table membership_tiers
  drop constraint if exists chk_membership_tiers_name_supported;

alter table membership_tiers
  add constraint chk_membership_tiers_name_supported
  check (upper(name) in ('GUEST', 'PLUS', 'PRIORITY', 'PLATINUM', 'SAPPHIRE'));

-- 2) Extend customer membership snapshots for the new tier benefit model.
alter table if exists customer_memberships
  add column if not exists status_points_snapshot integer not null default 0 check (status_points_snapshot >= 0),
  add column if not exists birthday_gift_snapshot boolean not null default false,
  add column if not exists discounted_rate_snapshot numeric(5,2) not null default 0 check (discounted_rate_snapshot >= 0 and discounted_rate_snapshot <= 100),
  add column if not exists linked_license_plates_snapshot integer not null default 0 check (linked_license_plates_snapshot >= 0),
  add column if not exists complimentary_car_care_upgrade_snapshot integer not null default 0 check (complimentary_car_care_upgrade_snapshot >= 0),
  add column if not exists priority_wash_snapshot integer not null default 0 check (priority_wash_snapshot >= 0),
  add column if not exists exclusive_invitation_snapshot boolean not null default false;

-- Backfill snapshot values from legacy snapshot columns where available.
update customer_memberships cm
set
  status_points_snapshot = coalesce(mt.status_points, mt.status_points_threshold, 0),
  birthday_gift_snapshot = coalesce(mt.birthday_gift, false),
  discounted_rate_snapshot = coalesce(cm.discount_rate_snapshot, mt.discounted_rate, mt.discount_rate, 0),
  linked_license_plates_snapshot = coalesce(cm.discount_eligible_car_limit_snapshot, mt.linked_license_plates, mt.discount_eligible_car_limit, 0),
  complimentary_car_care_upgrade_snapshot = coalesce(mt.complimentary_car_care_upgrade, 0),
  priority_wash_snapshot = coalesce(cm.priority_level_snapshot, mt.priority_wash, mt.priority_level, 0),
  exclusive_invitation_snapshot = coalesce(cm.exclusive_events_snapshot, mt.exclusive_invitation, mt.exclusive_events, false)
from membership_tiers mt
where cm.tier_id = mt.id;

-- Keep membership snapshot fields in sync with selected tier at assignment time.
create or replace function apply_membership_tier_snapshots()
returns trigger
language plpgsql
as $$
declare
  v_status_points integer;
  v_birthday_gift boolean;
  v_discounted_rate numeric(5,2);
  v_linked_license_plates integer;
  v_complimentary_car_care_upgrade integer;
  v_priority_wash integer;
  v_exclusive_invitation boolean;
begin
  if tg_op = 'INSERT' or new.tier_id is distinct from old.tier_id then
    select
      coalesce(mt.status_points, mt.status_points_threshold, 0),
      coalesce(mt.birthday_gift, false),
      coalesce(mt.discounted_rate, mt.discount_rate, 0),
      coalesce(mt.linked_license_plates, mt.discount_eligible_car_limit, 0),
      coalesce(mt.complimentary_car_care_upgrade, 0),
      coalesce(mt.priority_wash, mt.priority_level, 0),
      coalesce(mt.exclusive_invitation, mt.exclusive_events, false)
    into
      v_status_points,
      v_birthday_gift,
      v_discounted_rate,
      v_linked_license_plates,
      v_complimentary_car_care_upgrade,
      v_priority_wash,
      v_exclusive_invitation
    from membership_tiers mt
    where mt.id = new.tier_id;

    if not found then
      raise exception 'tier_id % does not exist', new.tier_id;
    end if;

    -- Legacy snapshots retained for compatibility.
    new.discount_rate_snapshot := v_discounted_rate;
    new.discount_eligible_car_limit_snapshot := v_linked_license_plates;
    new.priority_level_snapshot := v_priority_wash;
    new.exclusive_events_snapshot := v_exclusive_invitation;

    -- New snapshots requested by membership benefits model.
    new.status_points_snapshot := v_status_points;
    new.birthday_gift_snapshot := v_birthday_gift;
    new.discounted_rate_snapshot := v_discounted_rate;
    new.linked_license_plates_snapshot := v_linked_license_plates;
    new.complimentary_car_care_upgrade_snapshot := v_complimentary_car_care_upgrade;
    new.priority_wash_snapshot := v_priority_wash;
    new.exclusive_invitation_snapshot := v_exclusive_invitation;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_membership_tier_snapshots on customer_memberships;
create trigger trg_apply_membership_tier_snapshots
before insert or update of tier_id on customer_memberships
for each row execute function apply_membership_tier_snapshots();

-- 3) Keep limit enforcement rule aligned with the new snapshot name.
create or replace function enforce_discount_vehicle_rules()
returns trigger
language plpgsql
as $$
declare
  v_membership_customer_id text;
  v_membership_is_active boolean;
  v_limit integer;
  v_active_count integer;
begin
  if new.is_active is distinct from true then
    return new;
  end if;

  select
    cm.customer_id,
    cm.is_active,
    coalesce(cm.linked_license_plates_snapshot, cm.discount_eligible_car_limit_snapshot, 0)
  into v_membership_customer_id, v_membership_is_active, v_limit
  from customer_memberships cm
  where cm.id = new.customer_membership_id;

  if not found then
    raise exception 'customer_membership_id % does not exist', new.customer_membership_id;
  end if;

  if v_membership_is_active is distinct from true then
    raise exception 'customer_membership_id % is not active', new.customer_membership_id;
  end if;

  if v_membership_customer_id <> new.customer_id then
    raise exception 'customer_id % does not match membership owner %', new.customer_id, v_membership_customer_id;
  end if;

  select count(*)
  into v_active_count
  from customer_discount_vehicles cdv
  where cdv.customer_membership_id = new.customer_membership_id
    and cdv.is_active = true
    and (tg_op <> 'UPDATE' or cdv.id <> new.id);

  if v_active_count >= v_limit then
    raise exception
      'Discount-eligible vehicle limit exceeded: limit=%, current_active=%',
      v_limit,
      v_active_count;
  end if;

  return new;
end;
$$;

-- 4) Upsert the 5 fixed classes.
insert into membership_tiers (
  id,
  name,
  status_points_threshold,
  discount_rate,
  discount_eligible_car_limit,
  priority_level,
  exclusive_events,
  status_points,
  birthday_gift,
  discounted_rate,
  linked_license_plates,
  complimentary_car_care_upgrade,
  priority_wash,
  exclusive_invitation,
  is_active
) values
  ('tier_guest', 'Guest', 0, 0.00, 0, 0, false, 0, false, 0.00, 0, 0, 0, false, true),
  ('tier_plus', 'Plus', 100, 3.00, 1, 1, false, 100, false, 3.00, 1, 0, 1, false, true),
  ('tier_priority', 'Priority', 300, 5.00, 1, 2, true, 300, true, 5.00, 1, 1, 2, true, true),
  ('tier_platinum', 'Platinum', 700, 8.00, 2, 3, true, 700, true, 8.00, 2, 2, 3, true, true),
  ('tier_sapphire', 'Sapphire', 1200, 10.00, 2, 4, true, 1200, true, 10.00, 2, 3, 4, true, true)
on conflict (id) do update
set
  name = excluded.name,
  status_points_threshold = excluded.status_points_threshold,
  discount_rate = excluded.discount_rate,
  discount_eligible_car_limit = excluded.discount_eligible_car_limit,
  priority_level = excluded.priority_level,
  exclusive_events = excluded.exclusive_events,
  status_points = excluded.status_points,
  birthday_gift = excluded.birthday_gift,
  discounted_rate = excluded.discounted_rate,
  linked_license_plates = excluded.linked_license_plates,
  complimentary_car_care_upgrade = excluded.complimentary_car_care_upgrade,
  priority_wash = excluded.priority_wash,
  exclusive_invitation = excluded.exclusive_invitation,
  is_active = excluded.is_active,
  updated_at = now();

-- 5) Supabase access policy baseline for membership tables.
alter table if exists membership_tiers disable row level security;
alter table if exists customer_memberships disable row level security;
alter table if exists customer_discount_vehicles disable row level security;

grant all on table membership_tiers to anon;
grant all on table membership_tiers to authenticated;
grant all on table customer_memberships to anon;
grant all on table customer_memberships to authenticated;
grant all on table customer_discount_vehicles to anon;
grant all on table customer_discount_vehicles to authenticated;
