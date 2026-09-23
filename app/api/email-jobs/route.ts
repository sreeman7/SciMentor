const env = process.env;
import { deliverEmails } from '@/lib/server';
export async function POST(request: Request) {
    if (!env.EMAIL_JOB_SECRET || request.headers.get('authorization') !== `Bearer ${env.EMAIL_JOB_SECRET}`)
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        return Response.json(await deliverEmails(), { headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return Response.json({ error: 'Delivery unavailable' }, { status: 503 });
    }
}
