-- Migration: Add payment split tracking for multi-source payments
-- Allows checkout to be paid by prepaid + cash/card/etc. simultaneously
-- Date: 2026-05-03

-- Prerequisite: ensure prepaid_amount column exists on customer_memberships
-- (added by 20260502_membership_number_and_points_ledger.sql, repeated here as a safety guard)
ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS prepaid_amount numeric(12,2) DEFAULT 0 CHECK (prepaid_amount >= 0);

CREATE TABLE IF NOT EXISTS checkout_payment_splits (
  id                  text        PRIMARY KEY,
  checkout_id         text        NOT NULL REFERENCES checkout_sales(id) ON DELETE CASCADE,
  payment_source      text        NOT NULL CHECK (payment_source IN ('prepaid', 'cash', 'card', 'wechat', 'alipay', 'bank_transfer', 'other')),
  amount_paid         numeric(12,2) NOT NULL CHECK (amount_paid >= 0),
  membership_id       text        REFERENCES customer_memberships(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_payment_splits_checkout_id 
  ON checkout_payment_splits(checkout_id);

CREATE INDEX IF NOT EXISTS idx_checkout_payment_splits_membership_id 
  ON checkout_payment_splits(membership_id);

CREATE INDEX IF NOT EXISTS idx_checkout_payment_splits_source 
  ON checkout_payment_splits(payment_source);

ALTER TABLE checkout_payment_splits DISABLE ROW LEVEL SECURITY;

-- View: Get payment breakdown for a checkout
CREATE OR REPLACE VIEW v_checkout_payment_breakdown AS
SELECT
  cs.id checkout_id,
  cs.net_amount total_owed,
  COALESCE(SUM(cps.amount_paid), 0) as total_paid,
  cs.net_amount - COALESCE(SUM(cps.amount_paid), 0) as remaining_balance,
  cs.payment_status,
  cs.customer_id,
  cps.payment_source,
  SUM(CASE WHEN cps.payment_source = payment_source THEN cps.amount_paid ELSE 0 END) as source_amount
FROM checkout_sales cs
LEFT JOIN checkout_payment_splits cps ON cps.checkout_id = cs.id
GROUP BY cs.id, cps.payment_source
ORDER BY cs.id, cps.payment_source;

-- Function: Calculate membership prepaid balance after all payments
CREATE OR REPLACE FUNCTION get_membership_prepaid_balance(p_membership_id text)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(cm.prepaid_amount, 0) - COALESCE(SUM(cps.amount_paid), 0)
  FROM customer_memberships cm
  LEFT JOIN checkout_payment_splits cps 
    ON cps.membership_id = cm.id 
    AND cps.payment_source = 'prepaid'
  WHERE cm.id = p_membership_id
  GROUP BY cm.id, cm.prepaid_amount;
$$;

-- Function: Get payment split summary for a checkout
CREATE OR REPLACE FUNCTION get_checkout_payment_splits(p_checkout_id text)
RETURNS TABLE (
  payment_source text,
  amount_paid numeric,
  membership_id text
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    cps.payment_source,
    SUM(cps.amount_paid) as amount_paid,
    cps.membership_id
  FROM checkout_payment_splits cps
  WHERE cps.checkout_id = p_checkout_id
  GROUP BY cps.payment_source, cps.membership_id
  ORDER BY cps.payment_source;
$$;
