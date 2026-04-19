-- Migration: consolidate category pricing to price only

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'categories'
      and column_name = 'active_selling_price'
  ) then
    update categories
    set price = coalesce(nullif(price, 0), active_selling_price, 0);

    alter table categories
      drop column if exists active_selling_price;
  end if;
end $$;
