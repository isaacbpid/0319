-- Add completed_checkout page permission and backfill access for all employees

DO $$
BEGIN
  BEGIN
    ALTER TABLE IF EXISTS employee_page_permissions
      DROP CONSTRAINT chk_employee_page_key;
  EXCEPTION
    WHEN undefined_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE employee_page_permissions
      ADD CONSTRAINT chk_employee_page_key
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
        'categories',
        'accounts',
        'memberships'
      ));
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Backfill: ensure every existing employee can view completed_checkout.
INSERT INTO employee_page_permissions (id, username, page_key, can_view, created_at, updated_at)
SELECT
  'epp_completed_checkout_' || u.username,
  u.username,
  'completed_checkout',
  true,
  NOW(),
  NOW()
FROM employee_users u
WHERE NOT EXISTS (
  SELECT 1
  FROM employee_page_permissions p
  WHERE lower(p.username) = lower(u.username)
    AND p.page_key = 'completed_checkout'
);

UPDATE employee_page_permissions
SET
  can_view = true,
  updated_at = NOW()
WHERE page_key = 'completed_checkout';
