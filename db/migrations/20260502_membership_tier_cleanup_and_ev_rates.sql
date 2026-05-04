-- Membership tier cleanup: remove duplicate columns and add EV charging rates
ALTER TABLE IF EXISTS membership_tiers
  ADD COLUMN IF NOT EXISTS ev_charging_rates numeric(10,2) NOT NULL DEFAULT 0 CHECK (ev_charging_rates >= 0);

-- Backfill from legacy duplicate columns if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'membership_tiers' AND column_name = 'status_points'
  ) THEN
    UPDATE membership_tiers
    SET status_points_threshold = COALESCE(status_points_threshold, status_points, 0)
    WHERE true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'membership_tiers' AND column_name = 'exclusive_invitation'
  ) THEN
    UPDATE membership_tiers
    SET exclusive_events = COALESCE(exclusive_events, exclusive_invitation, false)
    WHERE true;
  END IF;
END;
$$;

-- Rebuild snapshot trigger so it no longer depends on dropped duplicate columns.
CREATE OR REPLACE FUNCTION apply_membership_tier_snapshots()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status_points_threshold integer;
  v_birthday_gift boolean;
  v_discounted_rate numeric(5,2);
  v_linked_license_plates integer;
  v_complimentary_car_care_upgrade integer;
  v_priority_wash integer;
  v_exclusive_events boolean;
BEGIN
  IF tg_op = 'INSERT' OR new.tier_id IS DISTINCT FROM old.tier_id THEN
    SELECT
      COALESCE(mt.status_points_threshold, 0),
      COALESCE(mt.birthday_gift, false),
      COALESCE(mt.discounted_rate, 0),
      COALESCE(mt.linked_license_plates, mt.discount_eligible_car_limit, 0),
      COALESCE(mt.complimentary_car_care_upgrade, 0),
      COALESCE(mt.priority_wash, mt.priority_level, 0),
      COALESCE(mt.exclusive_events, false)
    INTO
      v_status_points_threshold,
      v_birthday_gift,
      v_discounted_rate,
      v_linked_license_plates,
      v_complimentary_car_care_upgrade,
      v_priority_wash,
      v_exclusive_events
    FROM membership_tiers mt
    WHERE mt.id = new.tier_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'tier_id % does not exist', new.tier_id;
    END IF;

    new.discount_rate_snapshot := v_discounted_rate;
    new.discount_eligible_car_limit_snapshot := v_linked_license_plates;
    new.priority_level_snapshot := v_priority_wash;
    new.exclusive_events_snapshot := v_exclusive_events;

    new.status_points_snapshot := v_status_points_threshold;
    new.birthday_gift_snapshot := v_birthday_gift;
    new.discounted_rate_snapshot := v_discounted_rate;
    new.linked_license_plates_snapshot := v_linked_license_plates;
    new.complimentary_car_care_upgrade_snapshot := v_complimentary_car_care_upgrade;
    new.priority_wash_snapshot := v_priority_wash;
    new.exclusive_invitation_snapshot := v_exclusive_events;
  END IF;

  RETURN new;
END;
$$;

ALTER TABLE IF EXISTS membership_tiers
  DROP COLUMN IF EXISTS status_points,
  DROP COLUMN IF EXISTS exclusive_invitation,
  DROP COLUMN IF EXISTS discount_rate,
  DROP COLUMN IF EXISTS upgrade_threshold;

ALTER TABLE IF EXISTS customer_memberships
  DROP COLUMN IF EXISTS discount_rate_snapshot;
