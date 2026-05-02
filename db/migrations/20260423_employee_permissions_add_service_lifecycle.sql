-- Add service_lifecycle page permission and backfill access for all employees

-- Drop and recreate the check constraint to include service_lifecycle
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'employee_page_permissions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%page_key%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE employee_page_permissions DROP CONSTRAINT %I', c_name);
  END IF;
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
    'categories',
    'accounts',
    'memberships'
  ));

-- Backfill service_lifecycle permission for all existing employees
INSERT INTO employee_page_permissions (id, username, page_key, can_view, created_at, updated_at)
SELECT
  'epp_sl_' || u.username,
  u.username,
  'service_lifecycle',
  true,
  NOW(),
  NOW()
FROM employee_users u
WHERE NOT EXISTS (
  SELECT 1 FROM employee_page_permissions p
  WHERE lower(p.username) = lower(u.username)
    AND p.page_key = 'service_lifecycle'
);
