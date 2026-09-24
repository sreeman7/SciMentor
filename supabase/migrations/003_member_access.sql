BEGIN;
ALTER TABLE scimentor.members ADD COLUMN IF NOT EXISTS suspended_at bigint;

-- Share the booking lock so a concurrent booking cannot survive suspension.
CREATE OR REPLACE FUNCTION scimentor.lock_member_access() RETURNS trigger
LANGUAGE plpgsql SET search_path = scimentor, pg_temp AS $$
BEGIN
  PERFORM 1 FROM groups WHERE id=NEW.group_id FOR UPDATE;
  IF NEW.role='mentor' AND NEW.suspended_at IS NOT NULL THEN
    RAISE EXCEPTION 'mentor_cannot_be_suspended';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION scimentor.apply_member_suspension() RETURNS trigger
LANGUAGE plpgsql SET search_path = scimentor, pg_temp AS $$
BEGIN
  IF NEW.suspended_at IS NOT NULL THEN
    UPDATE meetings SET status='cancelled'
      WHERE mentee_id=NEW.user_id AND group_id=NEW.group_id AND status='confirmed'
        AND slot_id IN (SELECT id FROM slots WHERE start > floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
    UPDATE invites SET revoked=1 WHERE group_id=NEW.group_id AND email=NEW.email AND used_by IS NULL;
    UPDATE email_jobs SET status='cancelled',lease_until=NULL
      WHERE group_id=NEW.group_id AND recipient=NEW.email AND status IN ('pending','retry','review');
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION scimentor.guard_active_participant() RETURNS trigger
LANGUAGE plpgsql SET search_path = scimentor, pg_temp AS $$
BEGIN
  PERFORM 1 FROM groups WHERE id=NEW.group_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM members WHERE user_id=NEW.mentee_id AND group_id=NEW.group_id AND role='mentee' AND suspended_at IS NULL) THEN
    RAISE EXCEPTION 'member_suspended';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lock_member_access ON scimentor.members;
CREATE TRIGGER lock_member_access BEFORE UPDATE OF suspended_at ON scimentor.members FOR EACH ROW EXECUTE FUNCTION scimentor.lock_member_access();
DROP TRIGGER IF EXISTS apply_member_suspension ON scimentor.members;
CREATE TRIGGER apply_member_suspension AFTER UPDATE OF suspended_at ON scimentor.members FOR EACH ROW EXECUTE FUNCTION scimentor.apply_member_suspension();
DROP TRIGGER IF EXISTS guard_booking_access ON scimentor.meetings;
CREATE TRIGGER guard_booking_access BEFORE INSERT ON scimentor.meetings FOR EACH ROW EXECUTE FUNCTION scimentor.guard_active_participant();
DROP TRIGGER IF EXISTS guard_message_access ON scimentor.messages;
CREATE TRIGGER guard_message_access BEFORE INSERT ON scimentor.messages FOR EACH ROW EXECUTE FUNCTION scimentor.guard_active_participant();
REVOKE ALL ON FUNCTION scimentor.lock_member_access(), scimentor.apply_member_suspension(), scimentor.guard_active_participant() FROM PUBLIC;
COMMIT;
