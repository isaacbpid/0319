-- Extend employee page key constraint with appointments page.
-- Drop ALL existing check constraints on page_key (handles multiple or differently-named constraints).
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
    'categories',
    'accounts',
    'memberships',
    'charging',
    'appointments'
  ));
