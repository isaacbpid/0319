-- Membership rules verification script.
--
-- Purpose:
-- 1) Validate tier snapshot auto-population on customer_memberships insert.
-- 2) Validate discount-eligible vehicle limit enforcement.
-- 3) Validate one active membership per customer.
--
-- This script is non-destructive: it runs in a transaction and rolls back.

begin;

create temp table __membership_test_ctx (
  customer_id text not null,
  membership_id text not null,
  second_membership_id text not null,
  vehicle_one_id text not null,
  vehicle_two_id text not null
);

insert into __membership_test_ctx (
  customer_id,
  membership_id,
  second_membership_id,
  vehicle_one_id,
  vehicle_two_id
)
values (
  'test_cust_' || substr(md5(random()::text), 1, 12),
  'test_mem_' || substr(md5(random()::text), 1, 12),
  'test_mem2_' || substr(md5(random()::text), 1, 12),
  'test_vehicle1_' || substr(md5(random()::text), 1, 12),
  'test_vehicle2_' || substr(md5(random()::text), 1, 12)
);

insert into customers (id, name)
select customer_id, 'Membership Verification Customer'
from __membership_test_ctx;

insert into vehicles (id, customer_id, license_plate, make, model, color)
select vehicle_one_id, customer_id, 'TEST-001', 'TEST', 'MODEL-A', 'BLUE'
from __membership_test_ctx
union all
select vehicle_two_id, customer_id, 'TEST-002', 'TEST', 'MODEL-B', 'RED'
from __membership_test_ctx;

-- Insert membership with deliberately incorrect snapshots.
-- Trigger should replace these with tier snapshots from tier_plus.
insert into customer_memberships (
  id,
  customer_id,
  tier_id,
  discount_rate_snapshot,
  discount_eligible_car_limit_snapshot,
  priority_level_snapshot,
  exclusive_events_snapshot,
  status_points_snapshot,
  birthday_gift_snapshot,
  discounted_rate_snapshot,
  linked_license_plates_snapshot,
  complimentary_car_care_upgrade_snapshot,
  priority_wash_snapshot,
  exclusive_invitation_snapshot,
  status_points,
  is_active
)
select
  membership_id,
  customer_id,
  'tier_plus',
  0,
  0,
  0,
  false,
  0,
  false,
  0,
  0,
  0,
  0,
  false,
  0,
  true
from __membership_test_ctx;

do $$
declare
  m customer_memberships%rowtype;
  t membership_tiers%rowtype;
begin
  select *
  into m
  from customer_memberships
  where id = (select membership_id from __membership_test_ctx limit 1);

  select *
  into t
  from membership_tiers
  where id = 'tier_plus';

  if m.discount_rate_snapshot <> coalesce(t.discounted_rate, t.discount_rate, 0) then
    raise exception 'discount_rate_snapshot mismatch: membership=%, tier=%',
      m.discount_rate_snapshot,
      coalesce(t.discounted_rate, t.discount_rate, 0);
  end if;

  if m.discount_eligible_car_limit_snapshot <> coalesce(t.linked_license_plates, t.discount_eligible_car_limit, 0) then
    raise exception 'discount_eligible_car_limit_snapshot mismatch: membership=%, tier=%',
      m.discount_eligible_car_limit_snapshot,
      coalesce(t.linked_license_plates, t.discount_eligible_car_limit, 0);
  end if;

  if m.discounted_rate_snapshot <> coalesce(t.discounted_rate, t.discount_rate, 0) then
    raise exception 'discounted_rate_snapshot mismatch: membership=%, tier=%',
      m.discounted_rate_snapshot,
      coalesce(t.discounted_rate, t.discount_rate, 0);
  end if;

  if m.linked_license_plates_snapshot <> coalesce(t.linked_license_plates, t.discount_eligible_car_limit, 0) then
    raise exception 'linked_license_plates_snapshot mismatch: membership=%, tier=%',
      m.linked_license_plates_snapshot,
      coalesce(t.linked_license_plates, t.discount_eligible_car_limit, 0);
  end if;

  if m.priority_wash_snapshot <> coalesce(t.priority_wash, t.priority_level, 0) then
    raise exception 'priority_wash_snapshot mismatch: membership=%, tier=%',
      m.priority_wash_snapshot,
      coalesce(t.priority_wash, t.priority_level, 0);
  end if;

  if m.exclusive_invitation_snapshot is distinct from coalesce(t.exclusive_invitation, t.exclusive_events, false) then
    raise exception 'exclusive_invitation_snapshot mismatch: membership=%, tier=%',
      m.exclusive_invitation_snapshot,
      coalesce(t.exclusive_invitation, t.exclusive_events, false);
  end if;

  raise notice 'PASS: membership snapshots auto-populated from tier_plus';
end;
$$;

-- First eligible vehicle should succeed.
insert into customer_discount_vehicles (id, customer_membership_id, customer_id, vehicle_id, is_active)
select
  'test_link1_' || substr(md5(random()::text), 1, 12),
  membership_id,
  customer_id,
  vehicle_one_id,
  true
from __membership_test_ctx;

-- Second active eligible vehicle should fail for tier_plus (limit=1).
do $$
declare
  limit_violation_caught boolean := false;
begin
  begin
    insert into customer_discount_vehicles (id, customer_membership_id, customer_id, vehicle_id, is_active)
    select
      'test_link2_' || substr(md5(random()::text), 1, 12),
      membership_id,
      customer_id,
      vehicle_two_id,
      true
    from __membership_test_ctx;
  exception
    when others then
      limit_violation_caught := true;
      raise notice 'PASS: vehicle limit enforcement triggered (%).', sqlerrm;
  end;

  if not limit_violation_caught then
    raise exception 'Expected vehicle limit enforcement, but second active vehicle insert succeeded.';
  end if;
end;
$$;

-- A second active membership for same customer should fail (partial unique index).
do $$
declare
  active_membership_violation_caught boolean := false;
begin
  begin
    insert into customer_memberships (
      id,
      customer_id,
      tier_id,
      discount_rate_snapshot,
      discount_eligible_car_limit_snapshot,
      priority_level_snapshot,
      exclusive_events_snapshot,
      status_points,
      is_active
    )
    select
      second_membership_id,
      customer_id,
      'tier_guest',
      0,
      0,
      0,
      false,
      0,
      true
    from __membership_test_ctx;
  exception
    when unique_violation then
      active_membership_violation_caught := true;
      raise notice 'PASS: one-active-membership rule triggered (%).', sqlerrm;
  end;

  if not active_membership_violation_caught then
    raise exception 'Expected one-active-membership rule, but second active membership insert succeeded.';
  end if;
end;
$$;

do $$
begin
  raise notice 'ALL CHECKS PASSED: rolling back verification data.';
end;
$$;

select 'ALL CHECKS PASSED' as verification_result;

rollback;