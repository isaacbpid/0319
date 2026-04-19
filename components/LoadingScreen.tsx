import React from 'react';

interface LoadingScreenProps {
  language?: 'zh' | 'en';
}

const sqlScript = `-- Core setup script
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
  split_ratio_b numeric(8,4)
);

alter table if exists transactions add column if not exists split_mode text;
alter table if exists transactions add column if not exists split_ratio_a numeric(8,4);
alter table if exists transactions add column if not exists split_ratio_b numeric(8,4);

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

create table if not exists customer_groups (
  id text primary key,
  name text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists vehicles (
  id text primary key,
  customer_id text not null,
  license_plate text,
  make text,
  model text,
  color text,
  vehicle_type text,
  vehicle_size text,
  year text,
  vin text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists id_sequences (
  key text primary key,
  value bigint not null default 0
);

create table if not exists discounts (
  id text primary key,
  name text not null,
  code text,
  effect_type text not null default 'discount',
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
alter table if exists discounts add column if not exists code text;
alter table if exists discounts add column if not exists effect_type text not null default 'discount';

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

  update id_sequences set value = value + 1 where key = seq_key returning value into next_val;
  return p_prefix || '-' || next_val::text;
end;
$$;`;

const LoadingScreen: React.FC<LoadingScreenProps> = ({ language = 'en' }) => {
  const handleCopySql = async () => {
    await navigator.clipboard.writeText(sqlScript);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black p-8 space-y-8 animate-pulse">
      <div className="flex justify-end">
        <button
          onClick={handleCopySql}
          className="animate-none bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest dark:bg-white dark:text-slate-900"
        >
          <i className="fas fa-copy mr-2"></i>
          {language === 'zh' ? '複製 SQL 腳本' : 'Copy SQL Script'}
        </button>
      </div>
      <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
      </div>
      <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-[40px]"></div>
    </div>
  );
};

export default LoadingScreen;
