-- PostgreSQL / Supabase DDL
-- Model:
-- customers 1---N vehicles
-- membership_tiers 1---N customer_memberships
-- customers 1---N customer_memberships (history), max 1 active at a time
-- customer_memberships 1---N customer_discount_vehicles (eligible cars for discount)

-- Optional if you want DB-generated UUID text IDs:
-- create extension if not exists pgcrypto;

-- 1) Membership tier defaults/templates
create table if not exists membership_tiers (
  id text primary key,
  name text not null,
  status_points_threshold integer not null default 0 check (status_points_threshold >= 0),
  discount_rate numeric(5,2) not null default 0 check (discount_rate >= 0 and discount_rate <= 100),
  discount_eligible_car_limit integer not null default 0 check (discount_eligible_car_limit >= 0),
  upgrade_threshold numeric(12,2) not null default 0 check (upgrade_threshold >= 0),
  priority_level integer not null default 0 check (priority_level >= 0),
  exclusive_events boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- unique tier name among active tiers
create unique index if not exists ux_membership_tiers_active_name
  on membership_tiers (lower(name))
  where is_active = true;


-- 2) Customers (if table already exists, keep and only add needed columns)
-- Existing table likely already has many columns; this is minimal shape.
create table if not exists customers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- 3) Vehicles owned by customer (one customer can own many vehicles)
create table if not exists vehicles (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  license_plate text,
  make text,
  model text,
  color text,
  year text,
  vin text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_vehicles_customer_id on vehicles(customer_id);

-- Needed for composite FK check in customer_discount_vehicles
create unique index if not exists ux_vehicles_customer_vehicle
  on vehicles(customer_id, id);


-- 4) Customer membership assignment/history (snapshot copied from tier at assignment time)
create table if not exists customer_memberships (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  tier_id text not null references membership_tiers(id) on delete restrict,

  -- Snapshot fields (copied from membership_tiers at assignment time)
  discount_rate_snapshot numeric(5,2) not null check (discount_rate_snapshot >= 0 and discount_rate_snapshot <= 100),
  discount_eligible_car_limit_snapshot integer not null check (discount_eligible_car_limit_snapshot >= 0),
  priority_level_snapshot integer not null check (priority_level_snapshot >= 0),
  exclusive_events_snapshot boolean not null default false,

  -- Customer-specific progress
  status_points integer not null default 0 check (status_points >= 0),

  start_at timestamptz not null default now(),
  end_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (end_at is null or end_at >= start_at)
);

create index if not exists ix_customer_memberships_customer_id
  on customer_memberships(customer_id);

create index if not exists ix_customer_memberships_tier_id
  on customer_memberships(tier_id);

-- Only one active membership per customer
create unique index if not exists ux_customer_memberships_one_active
  on customer_memberships(customer_id)
  where is_active = true;


-- 5) Which owned vehicles are eligible for membership discount
create table if not exists customer_discount_vehicles (
  id text primary key,
  customer_membership_id text not null references customer_memberships(id) on delete cascade,
  customer_id text not null references customers(id) on delete cascade,
  vehicle_id text not null references vehicles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_customer_discount_vehicles_membership
  on customer_discount_vehicles(customer_membership_id);

create index if not exists ix_customer_discount_vehicles_customer
  on customer_discount_vehicles(customer_id);

create index if not exists ix_customer_discount_vehicles_vehicle
  on customer_discount_vehicles(vehicle_id);

-- Prevent duplicate active eligibility link for same customer+vehicle
create unique index if not exists ux_customer_discount_vehicles_active_pair
  on customer_discount_vehicles(customer_id, vehicle_id)
  where is_active = true;

-- Ensure linked vehicle belongs to same customer
alter table customer_discount_vehicles
  add constraint fk_customer_discount_vehicles_customer_vehicle
  foreign key (customer_id, vehicle_id)
  references vehicles(customer_id, id)
  on delete cascade;


-- 6) Trigger: enforce discount-eligible car limit + active membership consistency
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
  -- Only enforce when row is active
  if new.is_active is distinct from true then
    return new;
  end if;

  -- Membership must exist and be active
  select cm.customer_id, cm.is_active, cm.discount_eligible_car_limit_snapshot
    into v_membership_customer_id, v_membership_is_active, v_limit
  from customer_memberships cm
  where cm.id = new.customer_membership_id;

  if not found then
    raise exception 'customer_membership_id % does not exist', new.customer_membership_id;
  end if;

  if v_membership_is_active is distinct from true then
    raise exception 'customer_membership_id % is not active', new.customer_membership_id;
  end if;

  -- customer_id in link must match membership.customer_id
  if v_membership_customer_id <> new.customer_id then
    raise exception 'customer_id % does not match membership owner %', new.customer_id, v_membership_customer_id;
  end if;

  -- Count currently active eligible vehicles for this membership (excluding self on update)
  select count(*)
    into v_active_count
  from customer_discount_vehicles cdv
  where cdv.customer_membership_id = new.customer_membership_id
    and cdv.is_active = true
    and (tg_op <> 'UPDATE' or cdv.id <> new.id);

  if v_active_count >= v_limit then
    raise exception
      'Discount-eligible vehicle limit exceeded: limit=%, current_active=%',
      v_limit, v_active_count;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_en force_discount_vehicle_rules on customer_discount_vehicles;
create trigger trg_enforce_discount_vehicle_rules
before insert or update on customer_discount_vehicles
for each row execute function enforce_discount_vehicle_rules();


-- 7) Seed default tiers
insert into membership_tiers (
  id, name, status_points_threshold, discount_rate, discount_eligible_car_limit, upgrade_threshold, priority_level, exclusive_events, is_active
) values
  ('tier_guest',    'GUEST',    0,    0.00, 0,    0, 0, false, true),
  ('tier_plus',     'PLUS',     150,  5.00, 1,    0, 0, false, true),
  ('tier_priority', 'PRIORITY', 500,  10.00, 1,   0, 1, false,  true),
  ('tier_platinum', 'PLATINUM', 750,  15.00, 1,   1, 2, false,  true),
  ('tier_sapphire', 'SAPPHIRE', 1000, 20.00, 2,   4, 3, true,  true)
on conflict (id) do update
set
  name = excluded.name,
  status_points_threshold = excluded.status_points_threshold,
  discount_rate = excluded.discount_rate,
  discount_eligible_car_limit = excluded.discount_eligible_car_limit,
  upgrade_threshold = excluded.upgrade_threshold,
  priority_level = excluded.priority_level,
  exclusive_events = excluded.exclusive_events,
  is_active = excluded.is_active,
  updated_at = now();
