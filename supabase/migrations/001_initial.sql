-- Initial standalone PostgreSQL schema. Run once in the Supabase SQL editor.
BEGIN;
CREATE SCHEMA scimentor;
REVOKE ALL ON SCHEMA scimentor FROM PUBLIC;
SET LOCAL search_path = scimentor, pg_temp;

CREATE TABLE groups (
	"id" text PRIMARY KEY NOT NULL,
	"mentor_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL
);

CREATE TABLE invites (
	"hash" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"revoked" bigint DEFAULT 0 NOT NULL,
	"used_by" text,
	"created_at" bigint NOT NULL,
	FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE members (
	"user_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"invite_hash" text,
	"created_at" bigint NOT NULL,
	FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("invite_hash") REFERENCES "invites"("hash") ON UPDATE no action ON DELETE no action
);

CREATE TABLE slots (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"start" bigint NOT NULL,
	"end" bigint NOT NULL,
	"format" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE meetings (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"mentee_id" text NOT NULL,
	"format" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"agenda" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" bigint NOT NULL,
	FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("mentee_id") REFERENCES "members"("user_id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE announcements (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" bigint NOT NULL,
	FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE messages (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"mentee_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"announcement_id" text,
	"created_at" bigint NOT NULL,
	FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("mentee_id") REFERENCES "members"("user_id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("sender_id") REFERENCES "members"("user_id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE resources (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"created_at" bigint NOT NULL,
	FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE email_jobs (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"announcement_id" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"first_attempt_at" bigint,
	"lease_until" bigint,
	"error" text,
	"created_at" bigint NOT NULL,
	FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON UPDATE no action ON DELETE no action
);

CREATE INDEX "idx_announcements_group" ON "announcements" ("group_id");
CREATE INDEX "idx_email_jobs_status" ON "email_jobs" ("status","group_id");
CREATE UNIQUE INDEX "idx_email_jobs_recipient" ON "email_jobs" ("announcement_id","recipient");
CREATE UNIQUE INDEX "groups_mentor_id_unique" ON "groups" ("mentor_id");
CREATE INDEX "idx_invites_group" ON "invites" ("group_id");
CREATE INDEX "idx_meetings_group" ON "meetings" ("group_id");
CREATE INDEX "idx_meetings_mentee" ON "meetings" ("mentee_id");
CREATE UNIQUE INDEX "members_invite_hash_unique" ON "members" ("invite_hash");
CREATE INDEX "idx_members_group" ON "members" ("group_id");
CREATE INDEX "idx_messages_conversation" ON "messages" ("group_id","mentee_id","created_at");
CREATE INDEX "idx_resources_group" ON "resources" ("group_id");
CREATE INDEX "idx_slots_group_start" ON "slots" ("group_id","start");
CREATE UNIQUE INDEX idx_meetings_active_slot ON meetings(slot_id) WHERE status='confirmed';

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ADD CHECK (role IN ('mentor','mentee'));
ALTER TABLE slots ADD CHECK (format IN ('online','in-person','both'));
ALTER TABLE slots ADD CHECK (status IN ('published','withdrawn'));
ALTER TABLE slots ADD CHECK ("end" > start);
ALTER TABLE meetings ADD CHECK (format IN ('online','in-person'));
ALTER TABLE meetings ADD CHECK (status IN ('confirmed','cancelled'));
ALTER TABLE meetings ADD CHECK (format != 'in-person' OR length(trim(location)) > 0);
ALTER TABLE resources ADD CHECK (kind IN ('faq','resource'));

-- Serialize availability changes and bookings per mentor group, including different slots.
CREATE FUNCTION guard_slot() RETURNS trigger LANGUAGE plpgsql SET search_path = scimentor, pg_temp AS $$
BEGIN
  PERFORM 1 FROM groups WHERE id=NEW.group_id FOR UPDATE;
  IF TG_OP='UPDATE' THEN
    IF NEW.start<>OLD.start OR NEW."end"<>OLD."end" OR NEW.group_id<>OLD.group_id OR NEW.format<>OLD.format THEN
      RAISE EXCEPTION 'slot_unavailable: publish a new slot instead of modifying a time';
    END IF;
    IF NEW.status='withdrawn' AND EXISTS(SELECT 1 FROM meetings WHERE slot_id=OLD.id AND status='confirmed') THEN
      RAISE EXCEPTION 'slot_unavailable';
    END IF;
  END IF;
  IF NEW.status='published' AND EXISTS(SELECT 1 FROM slots WHERE id<>NEW.id AND group_id=NEW.group_id AND status='published' AND start<NEW."end" AND "end">NEW.start) THEN
    RAISE EXCEPTION 'slot_overlap';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_slot BEFORE INSERT OR UPDATE ON slots FOR EACH ROW EXECUTE FUNCTION guard_slot();

CREATE FUNCTION guard_booking() RETURNS trigger LANGUAGE plpgsql SET search_path = scimentor, pg_temp AS $$
DECLARE chosen slots%ROWTYPE;
BEGIN
  PERFORM 1 FROM groups WHERE id=NEW.group_id FOR UPDATE;
  SELECT * INTO chosen FROM slots WHERE id=NEW.slot_id FOR UPDATE;
  IF NOT FOUND OR chosen.group_id<>NEW.group_id OR chosen.status<>'published'
    OR NOT EXISTS(SELECT 1 FROM members WHERE user_id=NEW.mentee_id AND group_id=NEW.group_id AND role='mentee')
    OR (chosen.format<>'both' AND chosen.format<>NEW.format) THEN
    RAISE EXCEPTION 'invalid_booking';
  END IF;
  IF chosen.start < floor(extract(epoch FROM clock_timestamp())*1000)::bigint + 259200000 THEN
    RAISE EXCEPTION 'booking_notice';
  END IF;
  IF EXISTS(SELECT 1 FROM meetings m JOIN slots s ON m.slot_id=s.id WHERE m.status='confirmed' AND m.group_id=NEW.group_id AND s.start<chosen."end" AND s."end">chosen.start) THEN
    RAISE EXCEPTION 'meeting_overlap';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_booking BEFORE INSERT ON meetings FOR EACH ROW EXECUTE FUNCTION guard_booking();
-- Tables live in a private schema. Browsers use authorized server routes, never direct table access.
REVOKE ALL ON ALL TABLES IN SCHEMA scimentor FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA scimentor FROM PUBLIC;
COMMIT;
