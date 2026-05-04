-- Add HZMB shuttle pickup service allowance to membership tier model and member snapshots.

ALTER TABLE IF EXISTS membership_tiers
  ADD COLUMN IF NOT EXISTS hzmb_service integer NOT NULL DEFAULT 0 CHECK (hzmb_service >= 0);

ALTER TABLE IF EXISTS customer_memberships
  ADD COLUMN IF NOT EXISTS hzmb_service_snapshot integer NOT NULL DEFAULT 0 CHECK (hzmb_service_snapshot >= 0);

-- Backfill tier defaults by class (times per cycle):
-- Guest=0, Plus=1, Priority=2, Platinum=3, Sapphire=3
UPDATE membership_tiers
SET hzmb_service = CASE UPPER(name)
  WHEN 'GUEST' THEN 0
  WHEN 'PLUS' THEN 1
  WHEN 'PRIORITY' THEN 2
  WHEN 'PLATINUM' THEN 3
  WHEN 'SAPPHIRE' THEN 3
  ELSE COALESCE(hzmb_service, 0)
END;

-- Backfill existing memberships from current tier value.
UPDATE customer_memberships cm
SET hzmb_service_snapshot = COALESCE(mt.hzmb_service, 0)
FROM membership_tiers mt
WHERE cm.tier_id = mt.id;

-- Keep snapshots in sync on assignment / tier change.
CREATE OR REPLACE FUNCTION apply_membership_tier_snapshots()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status_points_threshold integer;
  v_birthday_gift boolean;
  v_discounted_rate numeric(5,2);
  v_linked_license_plates integer;
  v_hzmb_service integer;
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
      COALESCE(mt.hzmb_service, 0),
      COALESCE(mt.complimentary_car_care_upgrade, 0),
      COALESCE(mt.priority_wash, mt.priority_level, 0),
      COALESCE(mt.exclusive_events, false)
    INTO
      v_status_points_threshold,
      v_birthday_gift,
      v_discounted_rate,
      v_linked_license_plates,
      v_hzmb_service,
      v_complimentary_car_care_upgrade,
      v_priority_wash,
      v_exclusive_events
    FROM membership_tiers mt
    WHERE mt.id = new.tier_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'tier_id % does not exist', new.tier_id;
    END IF;

    -- Legacy snapshots retained for compatibility.
    new.discount_eligible_car_limit_snapshot := v_linked_license_plates;
    new.priority_level_snapshot := v_priority_wash;
    new.exclusive_events_snapshot := v_exclusive_events;

    -- Extended snapshots.
    new.status_points_snapshot := v_status_points_threshold;
    new.birthday_gift_snapshot := v_birthday_gift;
    new.discounted_rate_snapshot := v_discounted_rate;
    new.linked_license_plates_snapshot := v_linked_license_plates;
    new.hzmb_service_snapshot := v_hzmb_service;
    new.complimentary_car_care_upgrade_snapshot := v_complimentary_car_care_upgrade;
    new.priority_wash_snapshot := v_priority_wash;
    new.exclusive_invitation_snapshot := v_exclusive_events;
  END IF;

  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';
