-- Vehicle classification + checkout large-vehicle surcharge

-- 1) Vehicle type/size fields.
alter table if exists vehicles add column if not exists vehicle_type text;
alter table if exists vehicles add column if not exists vehicle_size text;

-- Backfill size from type where possible.
update vehicles
set vehicle_size = case
  when lower(coalesce(vehicle_type, '')) in ('suv', 'pickup', 'pick-up', 'mpv', 'van', 'limousine') then 'large'
  when lower(coalesce(vehicle_type, '')) in ('sedan', 'coupe', 'sports') then 'regular'
  else vehicle_size
end
where true;

-- Normalize pick-up alias.
update vehicles
set vehicle_type = 'pickup'
where lower(coalesce(vehicle_type, '')) = 'pick-up';

alter table vehicles drop constraint if exists chk_vehicles_vehicle_type;
alter table vehicles add constraint chk_vehicles_vehicle_type
check (
  vehicle_type is null
  or lower(vehicle_type) in ('sedan', 'coupe', 'sports', 'suv', 'pickup', 'mpv', 'van', 'limousine')
);

alter table vehicles drop constraint if exists chk_vehicles_vehicle_size;
alter table vehicles add constraint chk_vehicles_vehicle_size
check (
  vehicle_size is null
  or lower(vehicle_size) in ('regular', 'large')
);

alter table vehicles drop constraint if exists chk_vehicles_type_size_consistency;
alter table vehicles add constraint chk_vehicles_type_size_consistency
check (
  vehicle_type is null
  or vehicle_size is null
  or (
    (lower(vehicle_type) in ('sedan', 'coupe', 'sports') and lower(vehicle_size) = 'regular')
    or
    (lower(vehicle_type) in ('suv', 'pickup', 'mpv', 'van', 'limousine') and lower(vehicle_size) = 'large')
  )
);

-- 2) Checkout fields for large-vehicle surcharge visibility and persistence.
alter table if exists checkout_sales add column if not exists large_vehicle_surcharge_applied boolean;
alter table if exists checkout_sales add column if not exists large_vehicle_surcharge_rate numeric(5,2);
alter table if exists checkout_sales add column if not exists large_vehicle_surcharge_amount numeric(12,2);

update checkout_sales
set
  large_vehicle_surcharge_applied = coalesce(large_vehicle_surcharge_applied, false),
  large_vehicle_surcharge_rate = coalesce(large_vehicle_surcharge_rate, 0),
  large_vehicle_surcharge_amount = coalesce(large_vehicle_surcharge_amount, 0)
where large_vehicle_surcharge_applied is null
   or large_vehicle_surcharge_rate is null
   or large_vehicle_surcharge_amount is null;

alter table if exists checkout_sales alter column large_vehicle_surcharge_applied set default false;
alter table if exists checkout_sales alter column large_vehicle_surcharge_applied set not null;
alter table if exists checkout_sales alter column large_vehicle_surcharge_rate set default 0;
alter table if exists checkout_sales alter column large_vehicle_surcharge_rate set not null;
alter table if exists checkout_sales alter column large_vehicle_surcharge_amount set default 0;
alter table if exists checkout_sales alter column large_vehicle_surcharge_amount set not null;

alter table checkout_sales drop constraint if exists checkout_sales_large_vehicle_surcharge_valid;
alter table checkout_sales add constraint checkout_sales_large_vehicle_surcharge_valid
check (
  large_vehicle_surcharge_rate >= 0
  and large_vehicle_surcharge_amount >= 0
);
