import { deliverEmails } from './email';
import { getDatabase } from '@/backend/db';
const env = process.env;
import { getServerUser, type AuthUser } from '@/backend/auth';
import type { Member, PortalState } from '@/shared/types';
import { canBook, makeSlots, safeUrl } from '@/shared/rules';
export class ApiError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export function database() { return getDatabase(); }
async function rows<T>(sql: string, ...args: unknown[]): Promise<T[]> { return (await database().prepare(sql).bind(...args).all<T>()).results; }
async function one<T>(sql: string, ...args: unknown[]): Promise<T | null> { return database().prepare(sql).bind(...args).first<T>(); }
export async function identity() { const user = await getServerUser(); if (!user)
    throw new ApiError('Sign in to continue.', 401); return user; }
async function membership(user: AuthUser) { return one<Member>('SELECT user_id,group_id,role,name,email,suspended_at FROM members WHERE user_id=?', user.userId); }
function field(v: unknown, label: string, max = 2000) { if (typeof v !== 'string' || !v.trim() || v.trim().length > max)
    throw new ApiError(`${label} is required (maximum ${max} characters).`); return v.trim(); }
function mentor(m: Member) { if (m.role !== 'mentor')
    throw new ApiError('Only your mentor can make that change.', 403); }
async function hash(code: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.toUpperCase().replace(/[^A-Z0-9]/g, ''))))).map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function state(user: AuthUser): Promise<PortalState> {
    const member = await membership(user);
    const empty = { member: null, people: [], slots: [], meetings: [], announcements: [], messages: [], resources: [], invites: [], emailReady: !!(env.RESEND_API_KEY && env.EMAIL_FROM), emailPending: 0 };
    if (!member)
        return empty;
    if (member.suspended_at != null) return { ...empty, member, emailReady: false };
    const g = member.group_id;
    const isMentor = member.role === 'mentor';
    const [group, people, slots, meetings, announcements, messages, resources, invites, pending] = await Promise.all([
        one<{
            id: string;
            name: string;
        }>('SELECT id,name FROM groups WHERE id=?', g),
        rows<Member>(isMentor ? 'SELECT user_id,group_id,role,name,email,suspended_at FROM members WHERE group_id=?' : 'SELECT user_id,group_id,role,name,email,suspended_at FROM members WHERE group_id=? AND (user_id=? OR role=\'mentor\')', ...(isMentor ? [g] : [g, member.user_id])),
        rows<PortalState['slots'][number]>(`SELECT s.*,CAST(EXISTS(SELECT 1 FROM meetings m WHERE m.slot_id=s.id AND m.status='confirmed') AS integer) AS taken FROM slots s WHERE s.group_id=? AND s.status='published' AND s.end>? ORDER BY s.start`, g, Date.now()),
        rows<PortalState['meetings'][number]>(`SELECT m.*,s.start,s.end,u.name AS mentee_name FROM meetings m JOIN slots s ON s.id=m.slot_id JOIN members u ON u.user_id=m.mentee_id WHERE m.group_id=? ${isMentor ? '' : 'AND m.mentee_id=?'} ORDER BY s.start`, ...(isMentor ? [g] : [g, member.user_id])),
        rows<PortalState['announcements'][number]>(`SELECT a.* ${isMentor ? ",(SELECT COUNT(*) FROM email_jobs e WHERE e.announcement_id=a.id AND e.status='sent') AS sent,(SELECT COUNT(*) FROM email_jobs e WHERE e.announcement_id=a.id AND e.status NOT IN ('sent','cancelled')) AS pending" : ''} FROM announcements a WHERE a.group_id=? ORDER BY a.created_at DESC`, g),
        rows<PortalState['messages'][number]>(`SELECT m.*,a.title AS announcement_title FROM messages m LEFT JOIN announcements a ON a.id=m.announcement_id WHERE m.group_id=? ${isMentor ? '' : 'AND m.mentee_id=?'} ORDER BY m.created_at`, ...(isMentor ? [g] : [g, member.user_id])),
        rows<PortalState['resources'][number]>('SELECT * FROM resources WHERE group_id=? ORDER BY created_at DESC', g),
        isMentor ? rows<PortalState['invites'][number]>('SELECT hash,email,name,expires_at,revoked,used_by FROM invites WHERE group_id=? ORDER BY created_at DESC', g) : [],
        isMentor ? one<{
            n: number;
        }>("SELECT COUNT(*) AS n FROM email_jobs WHERE group_id=? AND status NOT IN ('sent','cancelled')", g) : null,
    ]);
    const currentMember = await membership(user);
    if (currentMember?.suspended_at != null) return { ...empty, member: currentMember, emailReady: false };
    return { ...empty, member, group: group ?? undefined, people, slots, meetings, announcements, messages, resources, invites, emailPending: pending?.n ?? 0 };
}
export async function act(user: AuthUser, input: Record<string, unknown>) {
    const db = database(), now = Date.now();
    const action = field(input.action, 'Action', 40);
    const m = await membership(user);
    if (m?.suspended_at != null) throw new ApiError('Your access to this mentoring space is suspended. Contact your mentor.', 403);
    if (action === 'create-group') {
        if (m)
            throw new ApiError('You already belong to a mentoring space.');
        const name = field(input.name, 'Your name', 80), title = field(input.title, 'Space name', 100), id = crypto.randomUUID();
        await db.batch([db.prepare('INSERT INTO groups (id,mentor_id,name,created_at) VALUES (?,?,?,?)').bind(id, user.userId, title, now), db.prepare("INSERT INTO members(user_id,group_id,role,name,email,created_at) VALUES (?,?,'mentor',?,?,?)").bind(user.userId, id, name, user.email.toLowerCase(), now)]);
        return { message: 'Your mentoring space is ready.' };
    }
    if (action === 'join') {
        if (m)
            throw new ApiError('You already belong to a mentoring space.');
        const code = field(input.code, 'Invite code', 80), name = field(input.name, 'Your name', 80), h = await hash(code);
        const result = await db.batch([
            db.prepare("INSERT INTO members(user_id,group_id,role,name,email,invite_hash,created_at) SELECT ?,group_id,'mentee',?,?,hash,? FROM invites WHERE hash=? AND email=? AND expires_at>? AND revoked=0 AND used_by IS NULL").bind(user.userId, name, user.email.toLowerCase(), now, h, user.email.toLowerCase(), now),
            db.prepare('UPDATE invites SET used_by=? WHERE hash=? AND used_by IS NULL AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND invite_hash=?)').bind(user.userId, h, user.userId, h),
        ]);
        if (!result[0].meta.changes)
            throw new ApiError('This code is invalid, expired, used, or assigned to a different email address.');
        return { message: 'Welcome to your mentoring space.' };
    }
    if (!m)
        throw new ApiError('Create a space or join using your mentor’s invite code.', 403);
    const g = m.group_id;
    if (action === 'suspend-member' || action === 'restore-member') {
        mentor(m);
        const id = field(input.id, 'Mentee');
        const result = await db.prepare("UPDATE members SET suspended_at=? WHERE user_id=? AND group_id=? AND role='mentee'")
            .bind(action === 'suspend-member' ? now : null, id, g).run();
        if (!result.meta.changes) throw new ApiError('Mentee not found.', 404);
        return { message: action === 'suspend-member'
            ? 'Access suspended. Future meetings cancelled; message and meeting history preserved.'
            : 'Access restored. Cancelled meetings stay cancelled; the mentee can book again.' };
    }
    if (action === 'invite') {
        mentor(m);
        const email = field(input.email, 'Email', 254).toLowerCase(), name = field(input.name, 'Mentee name', 80);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new ApiError('Enter a valid email address.');
        if (await one('SELECT user_id FROM members WHERE group_id=? AND email=? AND suspended_at IS NOT NULL', g, email))
            throw new ApiError('This mentee is suspended. Restore their access from Mentees instead.');
        const raw = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
        const code = raw.match(/.{1,4}/g)!.join('-');
        await db.prepare('INSERT INTO invites(hash,group_id,email,name,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(await hash(code), g, email, name, now + 7 * 86400000, now).run();
        return { message: 'Invite created. Copy the code now; it will only be shown once.', code };
    }
    if (action === 'revoke-invite') {
        mentor(m);
        await db.prepare('UPDATE invites SET revoked=1 WHERE hash=? AND group_id=? AND used_by IS NULL').bind(field(input.hash, 'Invite'), g).run();
        return { message: 'Invite revoked.' };
    }
    if (action === 'publish-slots') {
        mentor(m);
        const format = field(input.format, 'Format', 20);
        if (!['online', 'in-person', 'both'].includes(format))
            throw new ApiError('Choose a valid format.');
        let slots;
        try {
            slots = makeSlots(field(input.day, 'Date', 10), field(input.from, 'Start time', 5), field(input.to, 'End time', 5), Number(input.duration));
        }
        catch (e) {
            throw new ApiError((e as Error).message);
        }
        await db.batch(slots.map(s => db.prepare("INSERT INTO slots(id,group_id,start,end,format,status) VALUES (?,?,?,?,?,'published')").bind(crypto.randomUUID(), g, s.start, s.end, format)));
        return { message: `${slots.length} meeting slots published.` };
    }
    if (action === 'withdraw-slot') {
        mentor(m);
        const r = await db.prepare("UPDATE slots SET status='withdrawn' WHERE id=? AND group_id=? AND NOT EXISTS(SELECT 1 FROM meetings WHERE slot_id=slots.id AND status='confirmed')").bind(field(input.id, 'Slot'), g).run();
        if (!r.meta.changes)
            throw new ApiError('This slot is booked or unavailable. Cancel the meeting before removing its availability.');
        return { message: 'Availability removed.' };
    }
    if (action === 'book') {
        if (m.role !== 'mentee')
            throw new ApiError('Meetings are booked from a mentee account.', 403);
        const slot = await one<{
            id: string;
            start: number;
            format: string;
        }>("SELECT id,start,format FROM slots WHERE id=? AND group_id=? AND status='published'", field(input.slotId, 'Slot'), g);
        if (!slot || !canBook(slot.start))
            throw new ApiError('Choose an available slot at least 72 hours from now.');
        const format = field(input.format, 'Format', 20);
        if (!['online', 'in-person'].includes(format) || (slot.format !== 'both' && slot.format !== format))
            throw new ApiError('This meeting format is not offered for that slot.');
        const location = format === 'in-person' ? field(input.location, 'In-person location', 250) : '';
        await db.prepare("INSERT INTO meetings(id,group_id,slot_id,mentee_id,format,location,agenda,status,created_at) VALUES (?,?,?,?,?,?,?,'confirmed',?)").bind(crypto.randomUUID(), g, slot.id, m.user_id, format, location, field(input.agenda, 'Discussion topic', 2000), now).run();
        return { message: 'Meeting confirmed. You can find the details in My meetings.' };
    }
    if (action === 'reschedule') {
        const id = field(input.id, 'Meeting');
        const slot = await one<{ id: string; start: number; format: string }>(
            "SELECT id,start,format FROM slots WHERE id=? AND group_id=? AND status='published'", field(input.slotId, 'Slot'), g);
        if (!slot || !canBook(slot.start))
            throw new ApiError('Choose an available slot at least 72 hours from now.');
        const format = field(input.format, 'Format', 20);
        if (!['online', 'in-person'].includes(format) || (slot.format !== 'both' && slot.format !== format))
            throw new ApiError('This meeting format is not offered for that slot.');
        const location = format === 'in-person' ? field(input.location, 'In-person location', 250) : '';
        // One statement: a failed replacement rolls back the cancellation as well.
        // The existing booking guard validates the new slot under the group lock.
        const result = await db.prepare(`WITH moved AS (
            UPDATE meetings SET status='cancelled'
            WHERE id=? AND group_id=? AND status='confirmed' AND slot_id<>?
              AND EXISTS(SELECT 1 FROM slots WHERE slots.id=meetings.slot_id AND slots.start>?)
              ${m.role === 'mentor' ? '' : 'AND mentee_id=?'}
            RETURNING mentee_id,agenda
        ) INSERT INTO meetings(id,group_id,slot_id,mentee_id,format,location,agenda,status,created_at)
          SELECT ?,?,?,mentee_id,?,?,agenda,'confirmed',? FROM moved`)
            .bind(id, g, slot.id, now, ...(m.role === 'mentor' ? [] : [m.user_id]),
                crypto.randomUUID(), g, slot.id, format, location, now).run();
        if (!result.meta.changes)
            throw new ApiError('That meeting cannot be rescheduled. Refresh and choose a different available time.');
        return { message: 'Meeting rescheduled. The previous time has been released.' };
    }
    if (action === 'cancel') {
        const r = await db.prepare(`UPDATE meetings SET status='cancelled' WHERE id=? AND group_id=? AND status='confirmed' AND EXISTS(SELECT 1 FROM slots WHERE slots.id=meetings.slot_id AND slots.start>?) ${m.role === 'mentor' ? '' : 'AND mentee_id=?'}`).bind(...(m.role === 'mentor' ? [field(input.id, 'Meeting'), g, now] : [field(input.id, 'Meeting'), g, now, m.user_id])).run();
        if (!r.meta.changes)
            throw new ApiError('That meeting cannot be cancelled.');
        return { message: 'Meeting cancelled. The slot is available again if it meets the booking notice.' };
    }
    if (action === 'meeting-link') {
        mentor(m);
        let link;
        try {
            link = safeUrl(field(input.link, 'Meeting link', 1500));
        }
        catch (e) {
            throw new ApiError((e as Error).message);
        }
        const r = await db.prepare("UPDATE meetings SET link=? WHERE id=? AND group_id=? AND format='online' AND status='confirmed'").bind(link, field(input.id, 'Meeting'), g).run();
        if (!r.meta.changes)
            throw new ApiError('Meeting not found.');
        return { message: 'Meeting link saved.' };
    }
    if (action === 'read-messages') {
        if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 100 ||
            input.ids.some(id => typeof id !== 'string' || !id || id.length > 100))
            throw new ApiError('Choose between 1 and 100 messages to mark as read.');
        // Acknowledge only the displayed IDs, never messages arriving after this request.
        await db.prepare(`UPDATE messages SET read_at=?
            WHERE group_id=? AND sender_id<>? AND read_at IS NULL
              ${m.role === 'mentor' ? '' : 'AND mentee_id=?'}
              AND id IN (${input.ids.map(() => '?').join(',')})`)
            .bind(now, g, m.user_id, ...(m.role === 'mentor' ? [] : [m.user_id]), ...input.ids).run();
        return { message: 'Messages marked as read.' };
    }
    if (action === 'message') {
        const menteeId = m.role === 'mentee' ? m.user_id : field(input.menteeId, 'Mentee');
        if (!await one("SELECT user_id FROM members WHERE user_id=? AND group_id=? AND role='mentee' AND suspended_at IS NULL", menteeId, g))
            throw new ApiError('Conversation not found.', 404);
        const announcementId = input.announcementId ? field(input.announcementId, 'Announcement') : null;
        if (announcementId && !await one('SELECT id FROM announcements WHERE id=? AND group_id=?', announcementId, g))
            throw new ApiError('Announcement not found.', 404);
        await db.prepare('INSERT INTO messages(id,group_id,mentee_id,sender_id,body,announcement_id,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), g, menteeId, m.user_id, field(input.body, 'Message', 5000), announcementId, now).run();
        return { message: 'Private message sent.' };
    }
    if (action === 'announce') {
        mentor(m);
        const id = crypto.randomUUID(), title = field(input.title, 'Title', 150), body = field(input.body, 'Announcement', 10000);
        await db.batch([db.prepare('INSERT INTO announcements(id,group_id,title,body,created_at) VALUES (?,?,?,?,?)').bind(id, g, title, body, now), db.prepare("INSERT INTO email_jobs(id,group_id,announcement_id,recipient,subject,body,created_at) SELECT ?||':'||user_id,group_id,?,email,?,?,? FROM members WHERE group_id=? AND role='mentee' AND suspended_at IS NULL").bind(id, id, `[SciMentor] ${title}`, `${body}\n\n— ${m.name}\nPlease reply privately through your SciMentor portal.`, now, g)]);
        const mail = await deliverEmails(g);
        return { message: mail.configured ? 'Announcement published. Email delivery status is shown on the announcement.' : 'Announcement published. Emails are queued until the email service is connected.' };
    }
    if (action === 'retry-email') {
        mentor(m);
        const r = await deliverEmails(g);
        if (!r.configured)
            throw new ApiError('Email delivery needs a verified sender and an email service connection.', 503);
        return { message: 'Email delivery attempted. Check the announcement status.' };
    }
    if (action === 'resource') {
        mentor(m);
        const kind = field(input.kind, 'Type', 20);
        if (!['faq', 'resource'].includes(kind))
            throw new ApiError('Choose FAQ or resource.');
        let url = '';
        if (kind === 'resource') {
            try {
                url = safeUrl(field(input.url, 'Resource link', 1500));
            }
            catch (e) {
                throw new ApiError((e as Error).message);
            }
        }
        await db.prepare('INSERT INTO resources(id,group_id,kind,title,body,url,category,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), g, kind, field(input.title, kind === 'faq' ? 'Question' : 'Title', 200), field(input.body, kind === 'faq' ? 'Answer' : 'Description', 10000), url, field(input.category, 'Category', 60), now).run();
        return { message: kind === 'faq' ? 'FAQ published.' : 'Resource added.' };
    }
    if (action === 'delete-resource') {
        mentor(m);
        await db.prepare('DELETE FROM resources WHERE id=? AND group_id=?').bind(field(input.id, 'Resource'), g).run();
        return { message: 'Resource removed.' };
    }
    throw new ApiError('Unknown action.');
}
