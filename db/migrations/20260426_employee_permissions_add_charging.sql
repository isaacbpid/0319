-- Extend employee page key constraint with charging page.
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
    'memberships',
    'charging'
  ));
