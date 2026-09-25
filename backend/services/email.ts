import { getDatabase } from '@/backend/db';
const env = process.env;
const database = getDatabase;
async function rows<T>(sql: string, ...args: unknown[]): Promise<T[]> { return (await database().prepare(sql).bind(...args).all<T>()).results; }
type EmailJob = {
    id: string;
    recipient: string;
    subject: string;
    body: string;
    first_attempt_at: number | null;
};
export async function deliverEmails(groupId?: string) {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
        return { configured: false };
    const db = database(), now = Date.now();
    const jobs = await rows<EmailJob>(`SELECT id,recipient,subject,body,first_attempt_at FROM email_jobs WHERE status IN ('pending','retry','sending') AND (lease_until IS NULL OR lease_until<?) AND EXISTS(SELECT 1 FROM members WHERE members.group_id=email_jobs.group_id AND members.email=email_jobs.recipient AND members.suspended_at IS NULL) ${groupId ? 'AND group_id=?' : ''} ORDER BY created_at LIMIT 20`, ...(groupId ? [now, groupId] : [now]));
    for (const job of jobs) {
        // Resend's idempotency window is finite: older uncertain sends need reconciliation.
        if (job.first_attempt_at && now - job.first_attempt_at > 23 * 3600000) {
            await db.prepare("UPDATE email_jobs SET status='review',error='Delivery needs manual reconciliation before retrying.' WHERE id=?").bind(job.id).run();
            continue;
        }
        const claim = await db.prepare("UPDATE email_jobs SET status='sending',lease_until=?,attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=? AND status IN ('pending','retry','sending') AND (lease_until IS NULL OR lease_until<?) AND EXISTS(SELECT 1 FROM members WHERE members.group_id=email_jobs.group_id AND members.email=email_jobs.recipient AND members.suspended_at IS NULL)").bind(now + 120000, now, job.id, now).run();
        if (!claim.meta.changes)
            continue;
        try {
            const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.id }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [job.recipient], subject: job.subject, text: job.body }), signal: AbortSignal.timeout(12000) });
            if (!response.ok)
                throw new Error(`Email provider returned ${response.status}.`);
            await db.prepare("UPDATE email_jobs SET status='sent',lease_until=NULL,error=NULL WHERE id=?").bind(job.id).run();
        }
        catch (e) {
            await db.prepare("UPDATE email_jobs SET status='retry',lease_until=NULL,error=? WHERE id=?").bind((e as Error).message.slice(0, 200), job.id).run();
        }
    }
    return { configured: true };
}
