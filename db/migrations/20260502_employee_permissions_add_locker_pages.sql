-- Extend employee page key constraint with locker pages.
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'employee_page_permissions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%page_key%'
  LOOP
    EXECUTE format('ALTER TABLE employee_page_permissions DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

ALTER TABLE employee_page_permissions
  ADD CONSTRAINT employee_page_permissions_page_key_chk
  CHECK (page_key IN (
    'overview',
    'transactions',
    'input',
    'startup',
    'balance',
    'settings',
    'audit',
    'notes',
    'customers',
    'vehicles',
    'checkout',
    'completed_checkout',
    'service_lifecycle',
    'locker_deposit',
    'locker_pickup',
    'categories',
    'accounts',
    'memberships',
    'charging',
    'appointments'
  ));

insert into employee_page_permissions (id, username, page_key, can_view, created_at, updated_at)
select
  'epp_locker_deposit_' || u.username,
  u.username,
  'locker_deposit',
  true,
  now(),
  now()
from employee_users u
where not exists (
  select 1 from employee_page_permissions p
  where lower(p.username) = lower(u.username)
    and p.page_key = 'locker_deposit'
);

insert into employee_page_permissions (id, username, page_key, can_view, created_at, updated_at)
select
  'epp_locker_pickup_' || u.username,
  u.username,
  'locker_pickup',
  true,
  now(),
  now()
from employee_users u
where not exists (
  select 1 from employee_page_permissions p
  where lower(p.username) = lower(u.username)
    and p.page_key = 'locker_pickup'
);
