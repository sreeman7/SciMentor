import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const groups = sqliteTable('groups', {
    id: text('id').primaryKey(), mentorId: text('mentor_id').notNull().unique(), name: text('name').notNull(), createdAt: integer('created_at').notNull(),
});
export const invites = sqliteTable('invites', {
    hash: text('hash').primaryKey(), groupId: text('group_id').notNull().references(() => groups.id), email: text('email').notNull(), name: text('name').notNull(), expiresAt: integer('expires_at').notNull(), revoked: integer('revoked').notNull().default(0), usedBy: text('used_by'), createdAt: integer('created_at').notNull(),
}, t => [index('idx_invites_group').on(t.groupId)]);
export const members = sqliteTable('members', {
    userId: text('user_id').primaryKey(), groupId: text('group_id').notNull().references(() => groups.id), role: text('role', { enum: ['mentor', 'mentee'] }).notNull(), name: text('name').notNull(), email: text('email').notNull(), inviteHash: text('invite_hash').unique().references(() => invites.hash), createdAt: integer('created_at').notNull(),
}, t => [index('idx_members_group').on(t.groupId)]);
export const slots = sqliteTable('slots', {
    id: text('id').primaryKey(), groupId: text('group_id').notNull().references(() => groups.id), start: integer('start').notNull(), end: integer('end').notNull(), format: text('format', { enum: ['online', 'in-person', 'both'] }).notNull(), status: text('status', { enum: ['published', 'withdrawn'] }).notNull().default('published'),
}, t => [index('idx_slots_group_start').on(t.groupId, t.start)]);
export const meetings = sqliteTable('meetings', {
    id: text('id').primaryKey(), groupId: text('group_id').notNull().references(() => groups.id), slotId: text('slot_id').notNull().references(() => slots.id), menteeId: text('mentee_id').notNull().references(() => members.userId), format: text('format', { enum: ['online', 'in-person'] }).notNull(), location: text('location').notNull().default(''), link: text('link').notNull().default(''), agenda: text('agenda').notNull(), status: text('status', { enum: ['confirmed', 'cancelled'] }).notNull().default('confirmed'), createdAt: integer('created_at').notNull(),
}, t => [index('idx_meetings_group').on(t.groupId), index('idx_meetings_mentee').on(t.menteeId)]);
export const announcements = sqliteTable('announcements', {
    id: text('id').primaryKey(), groupId: text('group_id').notNull().references(() => groups.id), title: text('title').notNull(), body: text('body').notNull(), createdAt: integer('created_at').notNull(),
}, t => [index('idx_announcements_group').on(t.groupId)]);
export const messages = sqliteTable('messages', {
    id: text('id').primaryKey(), groupId: text('group_id').notNull().references(() => groups.id), menteeId: text('mentee_id').notNull().references(() => members.userId), senderId: text('sender_id').notNull().references(() => members.userId), body: text('body').notNull(), announcementId: text('announcement_id').references(() => announcements.id), createdAt: integer('created_at').notNull(),
}, t => [index('idx_messages_conversation').on(t.groupId, t.menteeId, t.createdAt)]);
export const resources = sqliteTable('resources', {
    id: text('id').primaryKey(), groupId: text('group_id').notNull().references(() => groups.id), kind: text('kind', { enum: ['faq', 'resource'] }).notNull(), title: text('title').notNull(), body: text('body').notNull(), url: text('url').notNull().default(''), category: text('category').notNull(), createdAt: integer('created_at').notNull(),
}, t => [index('idx_resources_group').on(t.groupId)]);
export const emailJobs = sqliteTable('email_jobs', {
    id: text('id').primaryKey(), groupId: text('group_id').notNull().references(() => groups.id), announcementId: text('announcement_id').notNull().references(() => announcements.id), recipient: text('recipient').notNull(), subject: text('subject').notNull(), body: text('body').notNull(), status: text('status').notNull().default('pending'), attempts: integer('attempts').notNull().default(0), firstAttemptAt: integer('first_attempt_at'), leaseUntil: integer('lease_until'), error: text('error'), createdAt: integer('created_at').notNull(),
}, t => [index('idx_email_jobs_status').on(t.status, t.groupId), uniqueIndex('idx_email_jobs_recipient').on(t.announcementId, t.recipient)]);
