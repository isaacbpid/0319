-- Create locker inventory and reservation tables for deposit/pickup workflow.

create table if not exists public.lockers (
  id text primary key,
  location_code text not null default 'main',
  locker_number integer not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lockers_locker_number_positive_chk check (locker_number > 0),
  constraint lockers_location_number_unique unique (location_code, locker_number)
);

create table if not exists public.locker_reservations (
  id text primary key,
  locker_id text not null references public.lockers(id) on update cascade on delete restrict,
  checkout_order_id text references public.checkout_sales(id) on update cascade on delete set null,
  vehicle_id text references public.vehicles(id) on update cascade on delete set null,
  plate_number text not null,
  reservation_type text not null,
  status text not null default 'reserved',
  item_description text,
  created_by text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  stored_at timestamp with time zone,
  collected_at timestamp with time zone,
  constraint locker_reservations_type_chk check (reservation_type in ('deposit', 'pickup')),
  constraint locker_reservations_status_chk check (status in ('reserved', 'stored', 'collected', 'cancelled'))
);

create index if not exists idx_locker_reservations_status on public.locker_reservations(status);
create index if not exists idx_locker_reservations_plate on public.locker_reservations(plate_number);
create index if not exists idx_locker_reservations_locker_id on public.locker_reservations(locker_id);
create index if not exists idx_locker_reservations_created_at on public.locker_reservations(created_at desc);

-- A locker can only hold one active reservation at a time.
create unique index if not exists ux_locker_active_reservation
  on public.locker_reservations(locker_id)
  where status in ('reserved', 'stored');

alter table if exists public.checkout_sales
  add column if not exists locker_service_type text;

alter table if exists public.checkout_sales
  add column if not exists locker_deposit_reservation_id text;

alter table if exists public.checkout_sales
  add column if not exists locker_pickup_reservation_id text;

do $$
begin
  begin
    alter table public.checkout_sales
      add constraint checkout_sales_locker_service_type_chk
      check (locker_service_type in ('deposit_only', 'pickup_only', 'deposit_and_pickup'));
  exception
    when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    alter table public.checkout_sales
      add constraint checkout_sales_locker_deposit_fk
      foreign key (locker_deposit_reservation_id) references public.locker_reservations(id)
      on update cascade on delete set null;
  exception
    when duplicate_object then null;
  end;
end $$;

do $$
begin
  begin
    alter table public.checkout_sales
      add constraint checkout_sales_locker_pickup_fk
      foreign key (locker_pickup_reservation_id) references public.locker_reservations(id)
      on update cascade on delete set null;
  exception
    when duplicate_object then null;
  end;
end $$;

-- Seed lockers if table is empty.
insert into public.lockers (id, location_code, locker_number, is_active, created_at, updated_at)
select
  'locker_main_' || g::text,
  'main',
  g,
  true,
  now(),
  now()
from generate_series(1, 12) as g
where not exists (select 1 from public.lockers)
on conflict (id) do nothing;

alter table public.lockers disable row level security;
alter table public.locker_reservations disable row level security;

grant all on table public.lockers to anon;
grant all on table public.lockers to authenticated;
grant all on table public.locker_reservations to anon;
grant all on table public.locker_reservations to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.lockers;
    exception when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.locker_reservations;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
