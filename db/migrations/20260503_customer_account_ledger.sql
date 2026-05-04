-- Migration: Customer account ledger
-- Unified, auditable per-customer money tracking (top-ups, deductions, refunds, adjustments)
-- Date: 2026-05-03

-- ============================================================
-- Table: customer_account_ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_account_ledger (
  id              text          PRIMARY KEY,
  customer_id     text          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  currency        text          NOT NULL DEFAULT 'RMB' CHECK (currency IN ('RMB', 'HKD', 'MOP')),
  -- entry_type: topup | deduct | refund | adjustment
  entry_type      text          NOT NULL CHECK (entry_type IN ('topup', 'deduct', 'refund', 'adjustment')),
  -- amount_delta: positive = money added, negative = money spent/deducted
  amount_delta    numeric(12,2) NOT NULL,
  -- balance_after: running balance after this entry (denormalised for fast reads)
  balance_after   numeric(12,2) NOT NULL,
  -- optional links back to source events
  reference_type  text,         -- e.g. 'checkout_order', 'manual'
  reference_id    text,         -- e.g. checkout_sale id
  notes           text,
  created_by      text,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cal_customer_id  ON customer_account_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_cal_created_at   ON customer_account_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_reference    ON customer_account_ledger(reference_type, reference_id);

ALTER TABLE customer_account_ledger DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- View: v_customer_account_balance
-- Current balance per customer per currency (sum of all deltas)
-- ============================================================
CREATE OR REPLACE VIEW v_customer_account_balance AS
SELECT
  c.id            AS customer_id,
  c.name          AS customer_name,
  cal.currency,
  COALESCE(SUM(cal.amount_delta), 0)          AS balance,
  COUNT(cal.id)                               AS entry_count,
  MAX(cal.created_at)                         AS last_activity_at
FROM customers c
LEFT JOIN customer_account_ledger cal ON cal.customer_id = c.id
GROUP BY c.id, c.name, cal.currency;

-- ============================================================
-- Function: get_customer_account_balance(customer_id, currency)
-- Returns the current balance for one customer+currency
-- ============================================================
CREATE OR REPLACE FUNCTION get_customer_account_balance(
  p_customer_id text,
  p_currency    text DEFAULT 'RMB'
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(amount_delta), 0)
  FROM customer_account_ledger
  WHERE customer_id = p_customer_id
    AND currency    = p_currency;
$$;

-- ============================================================
-- Function: add_customer_account_entry
-- Inserts a ledger row and returns the new running balance.
-- Raises an exception if a deduct would go negative.
-- ============================================================
CREATE OR REPLACE FUNCTION add_customer_account_entry(
  p_id            text,
  p_customer_id   text,
  p_currency      text,
  p_entry_type    text,
  p_amount_delta  numeric,
  p_reference_type text DEFAULT NULL,
  p_reference_id   text DEFAULT NULL,
  p_notes          text DEFAULT NULL,
  p_created_by     text DEFAULT NULL
)
RETURNS numeric          -- returns balance_after
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance numeric;
  v_balance_after   numeric;
BEGIN
  -- Lock the customer row for the duration of the transaction to avoid races
  PERFORM 1 FROM customers WHERE id = p_customer_id FOR UPDATE;

  v_current_balance := get_customer_account_balance(p_customer_id, p_currency);
  v_balance_after   := v_current_balance + p_amount_delta;

  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'Insufficient balance: current=%, delta=%, would_be=%',
      v_current_balance, p_amount_delta, v_balance_after;
  END IF;

  INSERT INTO customer_account_ledger (
    id, customer_id, currency, entry_type, amount_delta,
    balance_after, reference_type, reference_id, notes, created_by, created_at
  ) VALUES (
    p_id, p_customer_id, p_currency, p_entry_type, p_amount_delta,
    v_balance_after, p_reference_type, p_reference_id, p_notes, p_created_by, now()
  );

  RETURN v_balance_after;
END;
$$;
