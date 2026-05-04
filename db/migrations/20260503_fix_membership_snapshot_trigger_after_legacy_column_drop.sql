-- Fix membership snapshot trigger after removing legacy discount_rate_snapshot column
-- Without this, inserts can fail with: record "new" has no field "discount_rate_snapshot"

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
  IF tg_op = 'INSERT' OR NEW.tier_id IS DISTINCT FROM OLD.tier_id THEN
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
    WHERE mt.id = NEW.tier_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'tier_id % does not exist', NEW.tier_id;
    END IF;

    -- Keep currently-used snapshot fields in sync with selected tier.
    NEW.discount_eligible_car_limit_snapshot := v_linked_license_plates;
    NEW.priority_level_snapshot := v_priority_wash;
    NEW.exclusive_events_snapshot := v_exclusive_events;

    NEW.status_points_snapshot := v_status_points_threshold;
    NEW.birthday_gift_snapshot := v_birthday_gift;
    NEW.discounted_rate_snapshot := v_discounted_rate;
    NEW.linked_license_plates_snapshot := v_linked_license_plates;
    NEW.complimentary_car_care_upgrade_snapshot := v_complimentary_car_care_upgrade;
    NEW.priority_wash_snapshot := v_priority_wash;
    NEW.exclusive_invitation_snapshot := v_exclusive_events;
  END IF;

  RETURN NEW;
END;
$$;
