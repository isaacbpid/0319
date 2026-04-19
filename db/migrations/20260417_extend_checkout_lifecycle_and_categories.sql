-- Migration: extend checkout order lifecycle and categories-first service catalog

-- Extend categories for service-selling use cases.
alter table if exists categories add column if not exists active_selling_price numeric(12,2);
alter table if exists categories add column if not exists estimated_duration_minutes integer;
alter table if exists categories add column if not exists is_active_service boolean not null default true;

update categories
set
  active_selling_price = coalesce(active_selling_price, price, 0),
  estimated_duration_minutes = coalesce(estimated_duration_minutes, 30)
where active_selling_price is null
   or estimated_duration_minutes is null;

alter table if exists categories alter column active_selling_price set default 0;
alter table if exists categories alter column estimated_duration_minutes set default 30;
alter table if exists categories alter column active_selling_price set not null;
alter table if exists categories alter column estimated_duration_minutes set not null;

-- Extend checkout_sales to support draft -> committed -> checked_out lifecycle.
alter table if exists checkout_sales add column if not exists status text;
alter table if exists checkout_sales add column if not exists vehicle_id text;
alter table if exists checkout_sales add column if not exists check_in_at timestamptz;
alter table if exists checkout_sales add column if not exists committed_at timestamptz;
alter table if exists checkout_sales add column if not exists checked_out_at timestamptz;
alter table if exists checkout_sales add column if not exists gross_amount numeric(12,2);
alter table if exists checkout_sales add column if not exists membership_discount_amount numeric(12,2);
alter table if exists checkout_sales add column if not exists coupon_discount_amount numeric(12,2);
alter table if exists checkout_sales add column if not exists net_amount numeric(12,2);
alter table if exists checkout_sales add column if not exists estimated_duration_minutes integer;
alter table if exists checkout_sales add column if not exists estimated_finish_at timestamptz;
alter table if exists checkout_sales add column if not exists notes text;
alter table if exists checkout_sales add column if not exists updated_at timestamptz;

update checkout_sales
set
  status = coalesce(status, 'draft'),
  check_in_at = coalesce(check_in_at, occurred_at, created_at, now()),
  gross_amount = coalesce(gross_amount, subtotal, 0),
  membership_discount_amount = coalesce(membership_discount_amount, 0),
  coupon_discount_amount = coalesce(coupon_discount_amount, 0),
  net_amount = coalesce(net_amount, subtotal, 0),
  estimated_duration_minutes = coalesce(estimated_duration_minutes, 0),
  updated_at = coalesce(updated_at, now())
where status is null
   or check_in_at is null
   or gross_amount is null
   or membership_discount_amount is null
   or coupon_discount_amount is null
   or net_amount is null
   or estimated_duration_minutes is null
   or updated_at is null;

alter table if exists checkout_sales alter column status set default 'draft';
alter table if exists checkout_sales alter column status set not null;
alter table if exists checkout_sales alter column gross_amount set default 0;
alter table if exists checkout_sales alter column gross_amount set not null;
alter table if exists checkout_sales alter column membership_discount_amount set default 0;
alter table if exists checkout_sales alter column membership_discount_amount set not null;
alter table if exists checkout_sales alter column coupon_discount_amount set default 0;
alter table if exists checkout_sales alter column coupon_discount_amount set not null;
alter table if exists checkout_sales alter column net_amount set default 0;
alter table if exists checkout_sales alter column net_amount set not null;
alter table if exists checkout_sales alter column estimated_duration_minutes set default 0;
alter table if exists checkout_sales alter column estimated_duration_minutes set not null;
alter table if exists checkout_sales alter column updated_at set default now();
alter table if exists checkout_sales alter column updated_at set not null;

create index if not exists idx_checkout_sales_status on checkout_sales(status);
create index if not exists idx_checkout_sales_check_in_at on checkout_sales(check_in_at desc);
create index if not exists idx_checkout_sales_committed_at on checkout_sales(committed_at desc);
create index if not exists idx_checkout_sales_checked_out_at on checkout_sales(checked_out_at desc);

-- Add lifecycle constraints idempotently.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'checkout_sales_status_valid'
  ) then
    alter table checkout_sales
      add constraint checkout_sales_status_valid
      check (status in ('draft', 'committed', 'checked_out'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'checkout_sales_non_negative_amounts'
  ) then
    alter table checkout_sales
      add constraint checkout_sales_non_negative_amounts
      check (
        gross_amount >= 0
        and membership_discount_amount >= 0
        and coupon_discount_amount >= 0
        and net_amount >= 0
        and estimated_duration_minutes >= 0
      );
  end if;
end $$;

-- Extend checkout_line_items with service snapshots and quantity math.
alter table if exists checkout_line_items add column if not exists category_id text;
alter table if exists checkout_line_items add column if not exists quantity integer;
alter table if exists checkout_line_items add column if not exists unit_price numeric(12,2);
alter table if exists checkout_line_items add column if not exists line_subtotal numeric(12,2);
alter table if exists checkout_line_items add column if not exists estimated_duration_minutes integer;
alter table if exists checkout_line_items add column if not exists service_name_snapshot text;
alter table if exists checkout_line_items add column if not exists updated_at timestamptz;

update checkout_line_items
set
  quantity = coalesce(quantity, 1),
  unit_price = coalesce(unit_price, price, 0),
  line_subtotal = coalesce(line_subtotal, price, 0),
  estimated_duration_minutes = coalesce(estimated_duration_minutes, 0),
  service_name_snapshot = coalesce(service_name_snapshot, name),
  updated_at = coalesce(updated_at, now())
where quantity is null
   or unit_price is null
   or line_subtotal is null
   or estimated_duration_minutes is null
   or service_name_snapshot is null
   or updated_at is null;

alter table if exists checkout_line_items alter column quantity set default 1;
alter table if exists checkout_line_items alter column quantity set not null;
alter table if exists checkout_line_items alter column unit_price set default 0;
alter table if exists checkout_line_items alter column unit_price set not null;
alter table if exists checkout_line_items alter column line_subtotal set default 0;
alter table if exists checkout_line_items alter column line_subtotal set not null;
alter table if exists checkout_line_items alter column estimated_duration_minutes set default 0;
alter table if exists checkout_line_items alter column estimated_duration_minutes set not null;
alter table if exists checkout_line_items alter column service_name_snapshot set not null;
alter table if exists checkout_line_items alter column updated_at set default now();
alter table if exists checkout_line_items alter column updated_at set not null;

create index if not exists idx_checkout_line_items_sale_id on checkout_line_items(sale_id);
create index if not exists idx_checkout_line_items_category_id on checkout_line_items(category_id);

-- Add line-level constraints idempotently.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'checkout_line_items_non_negative'
  ) then
    alter table checkout_line_items
      add constraint checkout_line_items_non_negative
      check (
        quantity >= 0
        and unit_price >= 0
        and line_subtotal >= 0
        and estimated_duration_minutes >= 0
      );
  end if;
end $$;
