-- 1. Create the Transactions table
create table if not exists transactions (
  id text primary key,
  receipt_number text,
  occurred_at timestamp with time zone not null,
  type text not null,
  category_id text not null,
  amount numeric not null,
  description text,
  contributed_by text not null,
  image_url text,
  updated_at timestamp with time zone default now(),
  is_initial_investment boolean default false,
  notes text,
  customer_id text,
  from_account_id text,
  to_account_id text,
  split_mode text,
  split_ratio_a numeric(8,4),
  split_ratio_b numeric(8,4),
  checkout_order_id text,
  payment_status text default 'paid',
  payment_method text,
  payment_currency text
);

alter table if exists transactions add column if not exists split_mode text;
alter table if exists transactions add column if not exists split_ratio_a numeric(8,4);
alter table if exists transactions add column if not exists split_ratio_b numeric(8,4);
alter table if exists transactions add column if not exists checkout_order_id text;
alter table if exists transactions add column if not exists payment_status text default 'paid';
alter table if exists transactions add column if not exists payment_method text;
alter table if exists transactions add column if not exists payment_currency text;

-- 2. Create the Audit Logs table
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  table_name text not null,
  record_id text,
  changed_by text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone default now()
);

-- 3. Create the Notes table
create table if not exists notes (
  id text primary key,
  content text,
  created_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 4. Create the Categories table
create table if not exists categories (
  id text primary key,
  name text not null,
  type text not null,
  description text,
  price numeric default 0,
  image_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table if exists categories add column if not exists description text;
alter table if exists categories add column if not exists price numeric default 0;
alter table if exists categories add column if not exists image_url text;
alter table if exists categories add column if not exists updated_at timestamp with time zone default now();
alter table if exists categories add column if not exists estimated_duration_minutes integer not null default 30;
alter table if exists categories add column if not exists is_active_service boolean not null default true;

-- 4.1 Create server-side monotonic category ID allocator
create table if not exists id_sequences (
  key text primary key,
  value bigint not null default 0
);

create or replace function reserve_next_category_id(p_prefix text)
returns text
language plpgsql
security definer
as $$
declare
  seq_key text;
  max_existing bigint;
  next_val bigint;
begin
  if p_prefix not in ('rev', 'exp') then
    raise exception 'Invalid category prefix: %', p_prefix;
  end if;

  seq_key := 'category_' || p_prefix;

  select coalesce(max(((regexp_match(id, ('^' || p_prefix || '-([0-9]+)$')))[1])::bigint), 0)
  into max_existing
  from categories;

  insert into id_sequences (key, value)
  values (seq_key, max_existing)
  on conflict (key)
  do update set value = greatest(id_sequences.value, excluded.value);

  update id_sequences
  set value = value + 1
  where key = seq_key
  returning value into next_val;

  return p_prefix || '-' || next_val::text;
end;
$$;

-- 5. Create the Customers table
create table if not exists customers (
  id text primary key,
  name text not null,
  chinese_name text,
  group_name text,
  country_code text,
  phone text,
  vehicle_id text,
  company_code text,
  birthday date,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table if exists customers add column if not exists group_name text;
alter table if exists customers add column if not exists chinese_name text;
alter table if exists customers add column if not exists country_code text;
alter table if exists customers add column if not exists vehicle_id text;
alter table if exists customers add column if not exists company_code text;
alter table if exists customers add column if not exists birthday date;

-- 5.1 Create the Customer Groups table
create table if not exists customer_groups (
  id text primary key,
  name text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 5.2 Create the Vehicles table
create table if not exists vehicles (
  id text primary key,
  customer_id text not null,
  license_plate text,
  make text,
  model text,
  color text,
  year text,
  vin text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 6. Create Admin Sessions table
create table if not exists admin_sessions (
  session_token text primary key,
  partner_id text not null,
  expires_at timestamp with time zone not null,
  last_active timestamp with time zone default now()
);

-- 7. Create Bank Balance Transactions table
create table if not exists bank_balance_transactions (
  id text primary key,
  type text not null,
  amount numeric not null,
  balance_before numeric not null,
  balance_after numeric not null,
  created_at timestamp with time zone default now()
);

-- 8. Create Accounts table
create table if not exists accounts (
  id text primary key,
  name text not null,
  type text not null,
  created_at timestamp with time zone default now()
);

-- 9. Create Checkout Sales table
create table if not exists checkout_sales (
  id text primary key,
  customer_id text,
  subtotal numeric not null default 0,
  status text not null default 'draft',
  vehicle_id text,
  check_in_at timestamp with time zone default now(),
  committed_at timestamp with time zone,
  checked_out_at timestamp with time zone,
  gross_amount numeric(12,2) not null default 0,
  membership_discount_amount numeric(12,2) not null default 0,
  coupon_discount_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  payment_status text not null default 'pending',
  payment_method text,
  payment_currency text not null default 'RMB',
  paid_amount numeric(12,2) not null default 0,
  paid_at timestamp with time zone,
  linked_transaction_id text,
  estimated_duration_minutes integer not null default 0,
  estimated_finish_at timestamp with time zone,
  notes text,
  occurred_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table if exists checkout_sales add column if not exists status text not null default 'draft';
alter table if exists checkout_sales add column if not exists vehicle_id text;
alter table if exists checkout_sales add column if not exists check_in_at timestamp with time zone default now();
alter table if exists checkout_sales add column if not exists committed_at timestamp with time zone;
alter table if exists checkout_sales add column if not exists checked_out_at timestamp with time zone;
alter table if exists checkout_sales add column if not exists gross_amount numeric(12,2) not null default 0;
alter table if exists checkout_sales add column if not exists membership_discount_amount numeric(12,2) not null default 0;
alter table if exists checkout_sales add column if not exists coupon_discount_amount numeric(12,2) not null default 0;
alter table if exists checkout_sales add column if not exists net_amount numeric(12,2) not null default 0;
alter table if exists checkout_sales add column if not exists payment_status text not null default 'pending';
alter table if exists checkout_sales add column if not exists payment_method text;
alter table if exists checkout_sales add column if not exists payment_currency text not null default 'RMB';
alter table if exists checkout_sales add column if not exists paid_amount numeric(12,2) not null default 0;
alter table if exists checkout_sales add column if not exists paid_at timestamp with time zone;
alter table if exists checkout_sales add column if not exists linked_transaction_id text;
alter table if exists checkout_sales add column if not exists estimated_duration_minutes integer not null default 0;
alter table if exists checkout_sales add column if not exists estimated_finish_at timestamp with time zone;
alter table if exists checkout_sales add column if not exists notes text;
alter table if exists checkout_sales add column if not exists updated_at timestamp with time zone default now();

-- 10. Create Checkout Line Items table
create table if not exists checkout_line_items (
  id text primary key,
  sale_id text not null references checkout_sales(id) on delete cascade,
  category_id text,
  name text not null,
  price numeric not null,
  quantity integer not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_subtotal numeric(12,2) not null default 0,
  estimated_duration_minutes integer not null default 0,
  service_name_snapshot text not null default '',
  is_discount boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table if exists checkout_line_items add column if not exists category_id text;
alter table if exists checkout_line_items add column if not exists quantity integer not null default 1;
alter table if exists checkout_line_items add column if not exists unit_price numeric(12,2) not null default 0;
alter table if exists checkout_line_items add column if not exists line_subtotal numeric(12,2) not null default 0;
alter table if exists checkout_line_items add column if not exists estimated_duration_minutes integer not null default 0;
alter table if exists checkout_line_items add column if not exists service_name_snapshot text not null default '';
alter table if exists checkout_line_items add column if not exists updated_at timestamp with time zone default now();

create index if not exists idx_checkout_sales_status on checkout_sales(status);
create index if not exists idx_checkout_sales_check_in_at on checkout_sales(check_in_at desc);
create index if not exists idx_checkout_sales_committed_at on checkout_sales(committed_at desc);
create index if not exists idx_checkout_sales_checked_out_at on checkout_sales(checked_out_at desc);
create index if not exists idx_checkout_sales_payment_status on checkout_sales(payment_status);
create index if not exists idx_checkout_line_items_sale_id on checkout_line_items(sale_id);
create index if not exists idx_checkout_line_items_category_id on checkout_line_items(category_id);
create unique index if not exists idx_transactions_checkout_order_id_unique
  on transactions(checkout_order_id)
  where checkout_order_id is not null;

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

-- 11. Create Discounts table
create table if not exists discounts (
  id text primary key,
  name text not null,
  amount_type text not null,
  amount numeric not null default 0,
  category text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists transaction_items (
  id text primary key,
  transaction_id text not null references transactions(id) on delete cascade,
  category_id text not null,
  name text not null,
  price numeric(12,2) not null,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_transaction_items_transaction_id on transaction_items(transaction_id);
create index if not exists idx_transaction_items_category_id on transaction_items(category_id);

alter table if exists discounts add column if not exists category text;
alter table if exists discounts add column if not exists updated_at timestamp with time zone default now();

-- 12. DISABLE SECURITY (Fixes the Write Error)
alter table transactions disable row level security;
alter table audit_logs disable row level security;
alter table notes disable row level security;
alter table categories disable row level security;
alter table customers disable row level security;
alter table customer_groups disable row level security;
alter table vehicles disable row level security;
alter table admin_sessions disable row level security;
alter table bank_balance_transactions disable row level security;
alter table accounts disable row level security;
alter table checkout_sales disable row level security;
alter table checkout_line_items disable row level security;
alter table discounts disable row level security;
alter table transaction_items disable row level security;

-- 13. GRANT FULL ACCESS
grant all on table transactions to anon;
grant all on table transactions to authenticated;
grant all on table audit_logs to anon;
grant all on table audit_logs to authenticated;
grant all on table notes to anon;
grant all on table notes to authenticated;
grant all on table categories to anon;
grant all on table categories to authenticated;
grant all on table id_sequences to anon;
grant all on table id_sequences to authenticated;
grant all on table customers to anon;
grant all on table customers to authenticated;
grant all on table customer_groups to anon;
grant all on table customer_groups to authenticated;
grant all on table vehicles to anon;
grant all on table vehicles to authenticated;
grant all on table admin_sessions to anon;
grant all on table admin_sessions to authenticated;
grant all on table bank_balance_transactions to anon;
grant all on table bank_balance_transactions to authenticated;
grant all on table accounts to anon;
grant all on table accounts to authenticated;
grant all on table checkout_sales to anon;
grant all on table checkout_sales to authenticated;
grant all on table checkout_line_items to anon;
grant all on table checkout_line_items to authenticated;
grant all on table discounts to anon;
grant all on table discounts to authenticated;
grant all on table transaction_items to anon;
grant all on table transaction_items to authenticated;

-- 14. Enable Realtime Sync
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table transactions, transaction_items, notes, categories, customers, customer_groups, vehicles, admin_sessions, bank_balance_transactions, accounts, checkout_sales, checkout_line_items, discounts;
commit;

grant execute on function reserve_next_category_id(text) to anon;
grant execute on function reserve_next_category_id(text) to authenticated;

-- 15. Server Time Function
create or replace function get_server_time() returns timestamp with time zone as $$
  select now();
$$ language sql stable;