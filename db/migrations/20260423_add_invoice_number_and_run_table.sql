-- Add invoice_number to checkout_sales and a table for invoice run numbers
-- Date: 2026-04-23

alter table if exists checkout_sales add column if not exists invoice_number text unique;

create table if not exists invoice_run_numbers (
  year smallint not null,
  last_run_number integer not null,
  updated_at timestamptz default now(),
  primary key (year)
);

-- Optional: backfill invoice_number for existing records (not strictly needed for new logic)
-- update checkout_sales set invoice_number = ...
