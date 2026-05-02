create table if not exists charging_rate_configs (
  id text primary key,
  name text not null,
  cost_per_kwh numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists charging_sessions (
  id text primary key,
  status text not null check (status in ('IDLE', 'CHARGING', 'COMPLETED')),
  customer_id text not null references customers(id),
  vehicle_id text not null references vehicles(id),
  meter_at_start numeric(12,1) not null,
  meter_at_end numeric(12,1),
  current_meter_snapshot numeric(12,1) not null default 0,
  consumed_kwh numeric(12,1),
  rate_per_kwh numeric(12,2),
  amount numeric(12,2),
  gap_kwh numeric(12,1),
  gap_transaction_id text,
  gap_confirmed boolean not null default false,
  started_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_charging_sessions_status on charging_sessions(status);
create index if not exists idx_charging_sessions_started_at on charging_sessions(started_at desc);

insert into charging_rate_configs (id, name, cost_per_kwh, is_active, created_at, updated_at)
values ('charging_rate_default', 'EV Charging', 0.0, true, now(), now())
on conflict (id) do nothing;

alter table if exists charging_rate_configs disable row level security;
alter table if exists charging_sessions disable row level security;

grant all on table charging_rate_configs to anon;
grant all on table charging_rate_configs to authenticated;
grant all on table charging_sessions to anon;
grant all on table charging_sessions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.charging_rate_configs;
    exception when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.charging_sessions;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
