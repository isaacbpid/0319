-- Migration: add categories.item_category and remap legacy category IDs to new rev codes.
--
-- Usage flow:
-- 1) Run this migration (creates column + mapping table + helper function).
-- 2) Import new categories/rev codes into categories table.
-- 3) Insert old->new pairs into public.category_id_remap.
-- 4) Execute: select public.apply_category_id_remap();
-- 5) Review validation queries at bottom, then optionally remove old categories.

-- 1) Add new classification column to categories.
alter table if exists public.categories
  add column if not exists item_category text;

-- Backfill item_category for existing rows if empty.
-- Keep this generic/safe: derive from current type and ID prefix.
update public.categories
set item_category = case
  when upper(coalesce(type, '')) = 'REVENUE' then 'revenue'
  when upper(coalesce(type, '')) = 'EXPENSE' then 'expense'
  when id ilike 'rev-%' then 'revenue'
  when id ilike 'exp-%' then 'expense'
  else 'other'
end
where coalesce(trim(item_category), '') = '';

alter table if exists public.categories
  alter column item_category set default 'other';

-- 2) Mapping table for old category IDs -> new category IDs.
create table if not exists public.category_id_remap (
  old_category_id text primary key,
  new_category_id text not null,
  created_at timestamptz not null default now(),
  note text
);

create index if not exists idx_category_id_remap_new_category_id
  on public.category_id_remap(new_category_id);

-- 3) Helper function to apply remap across all known category references.
create or replace function public.apply_category_id_remap()
returns table(table_name text, updated_rows bigint)
language plpgsql
as $$
declare
  v_count bigint;
begin
  -- Safety check: every target ID must exist in categories before remap.
  if exists (
    select 1
    from public.category_id_remap m
    left join public.categories c on c.id = m.new_category_id
    where c.id is null
  ) then
    raise exception 'Remap aborted: some new_category_id values do not exist in categories';
  end if;

  update public.transactions t
  set category_id = m.new_category_id
  from public.category_id_remap m
  where t.category_id = m.old_category_id;
  get diagnostics v_count = row_count;
  table_name := 'transactions';
  updated_rows := v_count;
  return next;

  update public.transaction_items ti
  set category_id = m.new_category_id
  from public.category_id_remap m
  where ti.category_id = m.old_category_id;
  get diagnostics v_count = row_count;
  table_name := 'transaction_items';
  updated_rows := v_count;
  return next;

  update public.checkout_line_items li
  set category_id = m.new_category_id
  from public.category_id_remap m
  where li.category_id = m.old_category_id;
  get diagnostics v_count = row_count;
  table_name := 'checkout_line_items';
  updated_rows := v_count;
  return next;

  update public.appointments a
  set service_category_ids = (
    select coalesce(array_agg(coalesce(m.new_category_id, x.sid) order by x.ord), '{}')
    from unnest(a.service_category_ids) with ordinality as x(sid, ord)
    left join public.category_id_remap m
      on m.old_category_id = x.sid
  )
  where exists (
    select 1
    from unnest(a.service_category_ids) as sid
    join public.category_id_remap m on m.old_category_id = sid
  );
  get diagnostics v_count = row_count;
  table_name := 'appointments';
  updated_rows := v_count;
  return next;

  -- Optional: discounts.category stores category code in some environments.
  update public.discounts d
  set category = m.new_category_id
  from public.category_id_remap m
  where d.category = m.old_category_id;
  get diagnostics v_count = row_count;
  table_name := 'discounts';
  updated_rows := v_count;
  return next;
end;
$$;

-- 4) Validation helpers (run manually after remap).
-- A) Find remap rows pointing to missing targets (should be 0 rows).
-- select m.*
-- from public.category_id_remap m
-- left join public.categories c on c.id = m.new_category_id
-- where c.id is null;

-- B) Find references still using mapped old IDs (should be 0 per query).
-- select count(*) as remaining_old_in_transactions
-- from public.transactions t
-- join public.category_id_remap m on m.old_category_id = t.category_id;
--
-- select count(*) as remaining_old_in_transaction_items
-- from public.transaction_items ti
-- join public.category_id_remap m on m.old_category_id = ti.category_id;
--
-- select count(*) as remaining_old_in_checkout_line_items
-- from public.checkout_line_items li
-- join public.category_id_remap m on m.old_category_id = li.category_id;
--
-- select count(*) as remaining_old_in_appointments
-- from public.appointments a
-- where exists (
--   select 1
--   from unnest(a.service_category_ids) as sid
--   join public.category_id_remap m on m.old_category_id = sid
-- );

-- C) Optional cleanup of old categories after all checks pass.
-- delete from public.categories c
-- using public.category_id_remap m
-- where c.id = m.old_category_id;
