-- Discount/surcharge code model for checkout pricing

-- 1) Extend discounts table with code + effect type.
alter table if exists discounts add column if not exists code text;
alter table if exists discounts add column if not exists effect_type text;

update discounts
set effect_type = coalesce(effect_type, 'discount')
where effect_type is null;

alter table if exists discounts alter column effect_type set default 'discount';
alter table if exists discounts alter column effect_type set not null;

alter table discounts drop constraint if exists chk_discounts_effect_type;
alter table discounts add constraint chk_discounts_effect_type
check (lower(effect_type) in ('discount', 'surcharge'));

alter table discounts drop constraint if exists chk_discounts_amount_type;
alter table discounts add constraint chk_discounts_amount_type
check (lower(amount_type) in ('fixed', 'percent'));

create unique index if not exists ux_discounts_code_upper
on discounts (upper(code))
where code is not null and btrim(code) <> '';

-- 2) Persist pricing codes on checkout orders.
alter table if exists checkout_sales add column if not exists discount_code text;
alter table if exists checkout_sales add column if not exists surcharge_code text;

-- 3) Make surcharge defaults neutral (rate is code-driven, not hardcoded).
update checkout_sales
set large_vehicle_surcharge_rate = 0
where large_vehicle_surcharge_rate is null;

alter table if exists checkout_sales alter column large_vehicle_surcharge_rate set default 0;

-- 4) Seed standard large-car surcharge code at 20%.
insert into discounts (
  id,
  name,
  code,
  effect_type,
  amount_type,
  amount,
  category,
  created_at,
  updated_at
)
values (
  'dsc_large_car_surcharge',
  'Large Car surcharge',
  'LARGE_CAR_SURCHARGE',
  'surcharge',
  'percent',
  20,
  'pricing',
  now(),
  now()
)
on conflict (id) do update
set
  name = excluded.name,
  code = excluded.code,
  effect_type = excluded.effect_type,
  amount_type = excluded.amount_type,
  amount = excluded.amount,
  category = excluded.category,
  updated_at = now();
