alter table public.appointments
  add column if not exists linked_checkout_order_id text,
  add column if not exists converted_at timestamp with time zone;

create index if not exists idx_appointments_linked_checkout_order_id
  on public.appointments (linked_checkout_order_id);
