insert into categories (id, name, type, description, price, created_at, updated_at, estimated_duration_minutes, is_active_service)
values
  (
    'rev-ev-charging',
    '電車充電 (EV Charging)',
    'REVENUE',
    'Revenue category for completed EV charging sessions',
    0,
    now(),
    now(),
    0,
    true
  ),
  (
    'rev-ev-gap',
    '充電缺口補錄 (Charging Gap)',
    'REVENUE',
    'Draft gap transaction category for meter input gaps',
    0,
    now(),
    now(),
    0,
    true
  )
on conflict (id) do nothing;
