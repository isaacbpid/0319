-- Add extra line-item metadata for checkout items.
alter table if exists checkout_line_items
  add column if not exists item_description text;

alter table if exists checkout_line_items
  add column if not exists not_sold_separately boolean not null default false;

update checkout_line_items
set service_name_snapshot = coalesce(service_name_snapshot, name, '')
where service_name_snapshot is null;

create or replace function normalize_checkout_line_item_row()
returns trigger
language plpgsql
as $$
begin
  if new.sale_id is not null then
    insert into checkout_sales (id)
    values (new.sale_id)
    on conflict (id) do nothing;
  end if;

  new.service_name_snapshot := coalesce(new.service_name_snapshot, new.name, '');
  new.not_sold_separately := coalesce(new.not_sold_separately, false);
  return new;
end;
$$;

drop trigger if exists trg_checkout_line_items_normalize on checkout_line_items;
create trigger trg_checkout_line_items_normalize
before insert or update on checkout_line_items
for each row execute function normalize_checkout_line_item_row();
