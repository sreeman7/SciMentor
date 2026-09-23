CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_announcements_group` ON `announcements` (`group_id`);--> statement-breakpoint
CREATE TABLE `email_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`announcement_id` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer,
	`lease_until` integer,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_email_jobs_status` ON `email_jobs` (`status`,`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_jobs_recipient` ON `email_jobs` (`announcement_id`,`recipient`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`mentor_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_mentor_id_unique` ON `groups` (`mentor_id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`hash` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`used_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invites_group` ON `invites` (`group_id`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`mentee_id` text NOT NULL,
	`format` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`agenda` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentee_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_meetings_group` ON `meetings` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_meetings_mentee` ON `meetings` (`mentee_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`invite_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invite_hash`) REFERENCES `invites`(`hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_invite_hash_unique` ON `members` (`invite_hash`);--> statement-breakpoint
CREATE INDEX `idx_members_group` ON `members` (`group_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`mentee_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`announcement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentee_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`group_id`,`mentee_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_resources_group` ON `resources` (`group_id`);--> statement-breakpoint
CREATE TABLE `slots` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`format` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_slots_group_start` ON `slots` (`group_id`,`start`);--> statement-breakpoint
CREATE UNIQUE INDEX idx_meetings_active_slot ON meetings(slot_id) WHERE status='confirmed';
--> statement-breakpoint
CREATE TRIGGER prevent_slot_overlap BEFORE INSERT ON slots
WHEN NEW.status='published'
BEGIN
 SELECT CASE WHEN NEW.end<=NEW.start THEN RAISE(ABORT,'invalid_slot') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM slots WHERE group_id=NEW.group_id AND status='published' AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'slot_overlap') END;
END;
--> statement-breakpoint
CREATE TRIGGER validate_booking BEFORE INSERT ON meetings
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM slots s JOIN members u ON u.user_id=NEW.mentee_id WHERE s.id=NEW.slot_id AND s.group_id=NEW.group_id AND s.status='published' AND u.group_id=NEW.group_id AND u.role='mentee' AND (s.format='both' OR s.format=NEW.format) AND NEW.format IN ('online','in-person') AND (NEW.format!='in-person' OR length(trim(NEW.location))>0)) THEN RAISE(ABORT,'invalid_booking') END;
 SELECT CASE WHEN (SELECT start FROM slots WHERE id=NEW.slot_id)<CAST(strftime('%s','now') AS INTEGER)*1000+259200000 THEN RAISE(ABORT,'booking_notice') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM meetings m JOIN slots s ON m.slot_id=s.id JOIN slots n ON n.id=NEW.slot_id WHERE m.status='confirmed' AND m.group_id=NEW.group_id AND s.start<n.end AND s.end>n.start) THEN RAISE(ABORT,'meeting_overlap') END;
END;
--> statement-breakpoint
CREATE TRIGGER preserve_booked_slot BEFORE UPDATE OF status ON slots
WHEN NEW.status='withdrawn' AND EXISTS(SELECT 1 FROM meetings WHERE slot_id=OLD.id AND status='confirmed')
BEGIN SELECT RAISE(ABORT,'slot_unavailable'); END;
