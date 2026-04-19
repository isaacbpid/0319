-- Payment gate + checkout-to-transaction linkage

-- 1) Checkout payment fields
alter table if exists checkout_sales add column if not exists payment_status text;
alter table if exists checkout_sales add column if not exists payment_method text;
alter table if exists checkout_sales add column if not exists payment_currency text;
alter table if exists checkout_sales add column if not exists paid_amount numeric(12,2);
alter table if exists checkout_sales add column if not exists paid_at timestamptz;
alter table if exists checkout_sales add column if not exists linked_transaction_id text;

update checkout_sales
set
  payment_status = coalesce(payment_status, 'pending'),
  payment_currency = coalesce(payment_currency, 'RMB'),
  paid_amount = coalesce(paid_amount, 0)
where payment_status is null
   or payment_currency is null
   or paid_amount is null;

alter table if exists checkout_sales alter column payment_status set default 'pending';
alter table if exists checkout_sales alter column payment_status set not null;
alter table if exists checkout_sales alter column payment_currency set default 'RMB';
alter table if exists checkout_sales alter column payment_currency set not null;
alter table if exists checkout_sales alter column paid_amount set default 0;
alter table if exists checkout_sales alter column paid_amount set not null;

-- 2) Transactions linkage/payment snapshot fields
alter table if exists transactions add column if not exists checkout_order_id text;
alter table if exists transactions add column if not exists payment_status text;
alter table if exists transactions add column if not exists payment_method text;
alter table if exists transactions add column if not exists payment_currency text;

-- Existing transactions are already finalized accounting entries.
update transactions
set payment_status = coalesce(payment_status, 'paid')
where payment_status is null;

alter table if exists transactions alter column payment_status set default 'paid';
alter table if exists transactions alter column payment_status set not null;

create unique index if not exists idx_transactions_checkout_order_id_unique
  on transactions(checkout_order_id)
  where checkout_order_id is not null;

-- 3) Validation constraints
alter table checkout_sales drop constraint if exists checkout_sales_payment_status_valid;
alter table checkout_sales add constraint checkout_sales_payment_status_valid
  check (payment_status in ('pending', 'paid'));

alter table checkout_sales drop constraint if exists checkout_sales_payment_method_valid;
alter table checkout_sales add constraint checkout_sales_payment_method_valid
  check (
    payment_method is null
    or payment_method in ('FPS', 'Payme', 'HKD_cash', 'RMB_cash', 'Alipay', 'wechat', 'MOP_cash', 'MPay')
  );

alter table checkout_sales drop constraint if exists checkout_sales_payment_currency_valid;
alter table checkout_sales add constraint checkout_sales_payment_currency_valid
  check (payment_currency in ('HKD', 'RMB', 'MOP'));

alter table checkout_sales drop constraint if exists checkout_sales_cash_currency_mapping_valid;
alter table checkout_sales add constraint checkout_sales_cash_currency_mapping_valid
  check (
    payment_method is null
    or payment_method not in ('HKD_cash', 'RMB_cash', 'MOP_cash')
    or (payment_method = 'HKD_cash' and payment_currency = 'HKD')
    or (payment_method = 'RMB_cash' and payment_currency = 'RMB')
    or (payment_method = 'MOP_cash' and payment_currency = 'MOP')
  );

alter table transactions drop constraint if exists transactions_payment_status_valid;
alter table transactions add constraint transactions_payment_status_valid
  check (payment_status in ('pending', 'paid'));

alter table transactions drop constraint if exists transactions_payment_method_valid;
alter table transactions add constraint transactions_payment_method_valid
  check (
    payment_method is null
    or payment_method in ('FPS', 'Payme', 'HKD_cash', 'RMB_cash', 'Alipay', 'wechat', 'MOP_cash', 'MPay')
  );

alter table transactions drop constraint if exists transactions_payment_currency_valid;
alter table transactions add constraint transactions_payment_currency_valid
  check (
    payment_currency is null
    or payment_currency in ('HKD', 'RMB', 'MOP')
  );

alter table transactions drop constraint if exists transactions_cash_currency_mapping_valid;
alter table transactions add constraint transactions_cash_currency_mapping_valid
  check (
    payment_method is null
    or payment_currency is null
    or payment_method not in ('HKD_cash', 'RMB_cash', 'MOP_cash')
    or (payment_method = 'HKD_cash' and payment_currency = 'HKD')
    or (payment_method = 'RMB_cash' and payment_currency = 'RMB')
    or (payment_method = 'MOP_cash' and payment_currency = 'MOP')
  );
