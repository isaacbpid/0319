-- Migration: Membership benefit redemptions ledger
-- Tracks consumption of per-membership coupon benefits (Car Care upgrade, HZMB shuttle).
-- Remaining entitlement = snapshot value - sum of active redemptions.
-- Date: 2026-05-03

CREATE TABLE IF NOT EXISTS membership_benefit_redemptions (
  id                    text        NOT NULL PRIMARY KEY,
  membership_id         text        NOT NULL REFERENCES customer_memberships(id) ON DELETE CASCADE,
  customer_id           text        NOT NULL,
  benefit_type          text        NOT NULL
                          CHECK (benefit_type IN ('car_care_upgrade', 'hzmb_shuttle')),
  quantity              integer     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  checkout_sale_id      text,
  checkout_line_item_id text,
  status                text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'reversed')),
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  reversed_at           timestamptz
);

-- Prevent double-redemption of the same benefit type on the same checkout line.
CREATE UNIQUE INDEX IF NOT EXISTS uq_benefit_redemption_per_line
  ON membership_benefit_redemptions (checkout_line_item_id, benefit_type)
  WHERE status = 'active' AND checkout_line_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_mbr_membership
  ON membership_benefit_redemptions (membership_id);

CREATE INDEX IF NOT EXISTS ix_mbr_checkout
  ON membership_benefit_redemptions (checkout_sale_id);

ALTER TABLE membership_benefit_redemptions DISABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- Helper: compute remaining entitlement for a benefit type on a membership.
-- Returns 0 if membership is not found or not active.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_membership_benefit_remaining(
  p_membership_id text,
  p_benefit_type  text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_entitlement integer := 0;
  v_consumed    integer := 0;
BEGIN
  SELECT
    CASE p_benefit_type
      WHEN 'car_care_upgrade' THEN complimentary_car_care_upgrade_snapshot
      WHEN 'hzmb_shuttle'     THEN hzmb_service_snapshot
      ELSE 0
    END
  INTO v_entitlement
  FROM customer_memberships
  WHERE id = p_membership_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
  INTO v_consumed
  FROM membership_benefit_redemptions
  WHERE membership_id = p_membership_id
    AND benefit_type  = p_benefit_type
    AND status        = 'active';

  RETURN GREATEST(0, v_entitlement - v_consumed);
END;
$$;

NOTIFY pgrst, 'reload schema';
