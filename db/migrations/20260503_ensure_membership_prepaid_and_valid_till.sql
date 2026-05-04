-- Ensure prepaid_amount and valid_till columns exist on customer_memberships.
-- These were introduced in 20260502_membership_number_and_points_ledger.sql.
-- This file is a safe idempotent guard for environments where that migration
-- was not yet applied, and forces a PostgREST schema cache reload at the end.

ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS prepaid_amount numeric(12,2) NOT NULL DEFAULT 0
    CHECK (prepaid_amount >= 0);

ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS valid_till timestamptz;

-- Add validity constraint only if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_valid_till_after_start'
      AND conrelid = 'customer_memberships'::regclass
  ) THEN
    ALTER TABLE customer_memberships
      ADD CONSTRAINT ck_valid_till_after_start
        CHECK (valid_till IS NULL OR valid_till > start_at);
  END IF;
END;
$$;

-- Reload PostgREST schema cache so the new columns are immediately visible.
NOTIFY pgrst, 'reload schema';
