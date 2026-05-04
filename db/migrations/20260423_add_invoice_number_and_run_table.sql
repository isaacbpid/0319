-- Add invoice_number to checkout_sales and a table for invoice run numbers
-- Date: 2026-04-23

alter table if exists checkout_sales add column if not exists invoice_number text unique;

create table if not exists running_numbers (
  number_type text not null,
  year smallint not null,
  last_run_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (number_type, year)
);

create or replace function reserve_running_number(p_number_type text, p_year smallint)
returns integer
language plpgsql
as $$
declare
  v_next integer;
begin
  if p_number_type is null or btrim(p_number_type) = '' then
    raise exception 'p_number_type is required';
  end if;

  insert into running_numbers (number_type, year, last_run_number, updated_at)
  values (lower(btrim(p_number_type)), p_year, 1, now())
  on conflict (number_type, year) do update
    set last_run_number = running_numbers.last_run_number + 1,
        updated_at = now()
  returning last_run_number into v_next;

  return v_next;
end;
$$;

alter table running_numbers disable row level security;

-- Optional: backfill invoice_number for existing records (not strictly needed for new logic)
-- update checkout_sales set invoice_number = ...
