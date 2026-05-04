-- Migration: Remove separate customer account ledger prepaid system
-- Prepaid is now membership-only.
-- Date: 2026-05-03

DROP VIEW IF EXISTS v_customer_account_balance;

DROP FUNCTION IF EXISTS add_customer_account_entry(
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text
);

DROP FUNCTION IF EXISTS get_customer_account_balance(text, text);
DROP FUNCTION IF EXISTS get_customer_account_balance(text);

DROP TABLE IF EXISTS customer_account_ledger;

NOTIFY pgrst, 'reload schema';
