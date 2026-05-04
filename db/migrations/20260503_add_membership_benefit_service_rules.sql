-- Migration: Service-to-membership benefit redemption rules
-- Defines which service can consume which membership benefit coupon.
-- Date: 2026-05-03

CREATE TABLE IF NOT EXISTS membership_benefit_service_rules (
  id                    text        NOT NULL PRIMARY KEY,
  category_id           text        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  benefit_type          text        NOT NULL
                          CHECK (benefit_type IN ('car_care_upgrade', 'hzmb_shuttle')),
  coupon_code_template  text        NOT NULL,
  discount_mode         text        NOT NULL DEFAULT 'full_line'
                          CHECK (discount_mode IN ('full_line', 'fixed_amount', 'percent')),
  discount_value        numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  is_active             boolean     NOT NULL DEFAULT true,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One active rule per (service, benefit type).
CREATE UNIQUE INDEX IF NOT EXISTS uq_mbsr_active_service_benefit
  ON membership_benefit_service_rules (category_id, benefit_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_mbsr_category
  ON membership_benefit_service_rules (category_id);

CREATE INDEX IF NOT EXISTS ix_mbsr_benefit_type
  ON membership_benefit_service_rules (benefit_type);

ALTER TABLE membership_benefit_service_rules DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
