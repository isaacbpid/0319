-- Create appointments table for service booking.
create table if not exists public.appointments (
  id text primary key,
  status text not null default 'PENDING',
  customer_id text not null,
  vehicle_id text not null,
  scheduled_at timestamp with time zone not null,
  service_category_ids text[] not null default '{}',
  notes text,
  cancelled_reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint appointments_status_chk check (
    status in ('PENDING', 'CONFIRMED', 'CANCELLED')
  )
);

create index if not exists idx_appointments_scheduled_at on public.appointments (scheduled_at);
create index if not exists idx_appointments_status on public.appointments (status);
create index if not exists idx_appointments_customer_id on public.appointments (customer_id);

alter table public.appointments disable row level security;

grant all on table public.appointments to anon;
grant all on table public.appointments to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.appointments;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
