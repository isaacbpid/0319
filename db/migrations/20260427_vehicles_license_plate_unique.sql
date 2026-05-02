-- Migration: enforce unique license_plate across vehicles (nulls allowed, duplicates not).
--
-- Uses a partial unique index so that:
--   - NULL plates are permitted on multiple rows (car not yet plated).
--   - Any non-null plate can only exist once across the whole table.
--
-- Run the duplicate check query first to catch any existing violations before
-- the index is created.

-- 1) Check for existing duplicate plates (should return 0 rows before proceeding).
-- select license_plate, count(*) as cnt
-- from public.vehicles
-- where license_plate is not null
-- group by license_plate
-- having count(*) > 1
-- order by cnt desc;

-- 2) Create partial unique index (idempotent).
create unique index if not exists ux_vehicles_license_plate
  on public.vehicles (license_plate)
  where license_plate is not null;
