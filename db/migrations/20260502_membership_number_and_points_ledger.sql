-- ============================================================
-- Migration: Membership running number, primary vehicle, and points ledger
-- ============================================================

-- 1. Shared running-number table for invoice + membership
CREATE TABLE IF NOT EXISTS running_numbers (
  number_type     text        NOT NULL,
  year            smallint    NOT NULL,
  last_run_number integer     NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (number_type, year)
);

-- Keep existing systems consistent by moving previous counters into the shared table.
DO $$
BEGIN
  IF to_regclass('public.invoice_run_numbers') IS NOT NULL THEN
    INSERT INTO running_numbers (number_type, year, last_run_number, updated_at)
    SELECT 'invoice', irn.year, irn.last_run_number, COALESCE(irn.updated_at, now())
    FROM invoice_run_numbers irn
    ON CONFLICT (number_type, year) DO UPDATE
      SET last_run_number = GREATEST(running_numbers.last_run_number, EXCLUDED.last_run_number),
          updated_at = now();
  END IF;

  IF to_regclass('public.membership_run_numbers') IS NOT NULL THEN
    INSERT INTO running_numbers (number_type, year, last_run_number, updated_at)
    SELECT 'membership', mrn.year, mrn.last_run_number, COALESCE(mrn.updated_at, now())
    FROM membership_run_numbers mrn
    ON CONFLICT (number_type, year) DO UPDATE
      SET last_run_number = GREATEST(running_numbers.last_run_number, EXCLUDED.last_run_number),
          updated_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_running_number(p_number_type text, p_year smallint)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  IF p_number_type IS NULL OR btrim(p_number_type) = '' THEN
    RAISE EXCEPTION 'p_number_type is required';
  END IF;

  INSERT INTO running_numbers (number_type, year, last_run_number, updated_at)
  VALUES (lower(btrim(p_number_type)), p_year, 1, now())
  ON CONFLICT (number_type, year) DO UPDATE
    SET last_run_number = running_numbers.last_run_number + 1,
        updated_at = now()
  RETURNING last_run_number INTO v_next;

  RETURN v_next;
END;
$$;

-- 2. Add membership_no column (YYXXXX, unique, nullable for old rows)
ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS membership_no text UNIQUE;

-- 3. Add primary_vehicle_id (text FK to vehicles.id, nullable)
ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS primary_vehicle_id text
    REFERENCES vehicles(id) ON DELETE RESTRICT;

-- 3b. Add prepaid_amount and valid_till for prepaid membership feature
ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS prepaid_amount numeric(12,2) DEFAULT 0 CHECK (prepaid_amount >= 0);

ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS valid_till timestamptz,
  ADD CONSTRAINT ck_valid_till_after_start CHECK (valid_till IS NULL OR valid_till > start_at);

-- 4. Backfill membership_no for all currently-active memberships using a DO block
DO $$
DECLARE
  rec             RECORD;
  yy              smallint;
  next_run        integer;
  v_membership_no text;
BEGIN
  FOR rec IN
    SELECT id, created_at
    FROM customer_memberships
    WHERE is_active = true AND membership_no IS NULL
    ORDER BY created_at ASC
  LOOP
    -- Derive two-digit year from the membership's created_at
    yy := CAST(EXTRACT(YEAR FROM rec.created_at AT TIME ZONE 'UTC') AS integer) % 100;

    -- Atomically increment the shared membership counter for this year.
    SELECT reserve_running_number('membership', yy) INTO next_run;

    v_membership_no := LPAD(yy::text, 2, '0') || LPAD(next_run::text, 4, '0');

    UPDATE customer_memberships
    SET membership_no = v_membership_no
    WHERE id = rec.id;
  END LOOP;
END;
$$;

-- 5. Points ledger table (1 point = 1 RMB; redeemed in full at checkout)
CREATE TABLE IF NOT EXISTS membership_points_ledger (
  id                   text        NOT NULL PRIMARY KEY,
  membership_id        text        NOT NULL REFERENCES customer_memberships(id) ON DELETE CASCADE,
  customer_id          text        NOT NULL,
  entry_type           text        NOT NULL CHECK (entry_type IN ('add', 'redeem', 'refund_add')),
  points_delta         integer     NOT NULL,
  points_balance_after integer     NOT NULL CHECK (points_balance_after >= 0),
  reference_type       text,
  reference_id         text,
  notes                text,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Disable RLS so the service key can read/write freely (consistent with other tables)
ALTER TABLE running_numbers            DISABLE ROW LEVEL SECURITY;
ALTER TABLE membership_points_ledger   DISABLE ROW LEVEL SECURITY;
