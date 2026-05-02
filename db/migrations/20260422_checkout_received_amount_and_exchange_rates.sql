-- Checkout payment fields alignment + FX table
-- Replaces received_currency/received_amount/paid_amount with currency/payment_amount
-- Adds currency + payment_amount to transactions for full alignment
-- NOTE: not yet applied to DB — safe to rewrite in-place

-- ── checkout_sales ─────────────────────────────────────────────────────────────

alter table if exists checkout_sales add column if not exists currency text not null default 'RMB';
alter table if exists checkout_sales add column if not exists payment_amount numeric(12,2);
alter table if exists checkout_sales add column if not exists applied_rate numeric(12,6);

-- backfill payment_amount from old paid_amount or net_amount before dropping
update checkout_sales
set
  payment_amount = coalesce(payment_amount, net_amount, 0),
  applied_rate   = coalesce(applied_rate, 1)
where payment_amount is null
   or applied_rate is null;

-- drop redundant old columns
alter table if exists checkout_sales drop column if exists paid_amount;
alter table if exists checkout_sales drop column if exists received_currency;
alter table if exists checkout_sales drop column if exists received_amount;

-- drop old constraints that reference removed columns
alter table checkout_sales drop constraint if exists checkout_sales_received_currency_valid;
alter table checkout_sales drop constraint if exists checkout_sales_received_amount_non_negative;

-- add new constraints
alter table checkout_sales drop constraint if exists checkout_sales_currency_valid;
alter table checkout_sales add constraint checkout_sales_currency_valid
  check (currency in ('HKD', 'RMB', 'MOP'));

alter table checkout_sales drop constraint if exists checkout_sales_payment_amount_non_negative;
alter table checkout_sales add constraint checkout_sales_payment_amount_non_negative
  check (payment_amount is null or payment_amount >= 0);

alter table checkout_sales drop constraint if exists checkout_sales_applied_rate_positive;
alter table checkout_sales add constraint checkout_sales_applied_rate_positive
  check (applied_rate is null or applied_rate > 0);

-- ── transactions ───────────────────────────────────────────────────────────────

alter table if exists transactions add column if not exists currency text not null default 'RMB';
alter table if exists transactions add column if not exists payment_amount numeric(12,2);

alter table transactions drop constraint if exists transactions_currency_valid;
alter table transactions add constraint transactions_currency_valid
  check (currency in ('HKD', 'RMB', 'MOP'));

alter table transactions drop constraint if exists transactions_payment_amount_non_negative;
alter table transactions add constraint transactions_payment_amount_non_negative
  check (payment_amount is null or payment_amount >= 0);

create table if not exists currency_exchange_rates (
  id text primary key,
  from_currency text not null,
  to_currency text not null,
  rate numeric(12,6) not null,
  effective_date date not null,
  created_at timestamptz default now()
);

create unique index if not exists idx_currency_exchange_rates_pair_date_unique
  on currency_exchange_rates(from_currency, to_currency, effective_date);
create index if not exists idx_currency_exchange_rates_lookup
  on currency_exchange_rates(effective_date desc, from_currency, to_currency);

alter table currency_exchange_rates drop constraint if exists currency_exchange_rates_supported_currencies_valid;
alter table currency_exchange_rates add constraint currency_exchange_rates_supported_currencies_valid
  check (
    from_currency in ('HKD', 'RMB', 'MOP')
    and to_currency in ('HKD', 'RMB', 'MOP')
  );

alter table currency_exchange_rates drop constraint if exists currency_exchange_rates_rate_positive;
alter table currency_exchange_rates add constraint currency_exchange_rates_rate_positive
  check (rate > 0);

grant all on table currency_exchange_rates to anon;
grant all on table currency_exchange_rates to authenticated;

insert into currency_exchange_rates (id, from_currency, to_currency, rate, effective_date)
values
  ('fx_rmb_rmb_2026_04_22', 'RMB', 'RMB', 1, date '2026-04-22'),
  ('fx_rmb_hkd_2026_04_22', 'RMB', 'HKD', 1, date '2026-04-22'),
  ('fx_rmb_mop_2026_04_22', 'RMB', 'MOP', 1.1, date '2026-04-22')
on conflict (id) do update set
  rate = excluded.rate,
  effective_date = excluded.effective_date;