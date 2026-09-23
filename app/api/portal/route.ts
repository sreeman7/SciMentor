import { act, ApiError, identity, state } from '@/lib/server';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' };
function failure(error: unknown) {
    if (error instanceof ApiError)
        return Response.json({ error: error.message }, { status: error.status, headers });
    const message = String(error);
    console.error('SciMentor request failed', message);
    if (/slot_overlap|UNIQUE constraint failed: meetings.slot_id|slot_unavailable|booking_notice|meeting_overlap|invalid_booking/i.test(message))
        return Response.json({ error: 'That time is no longer available or overlaps another slot. Choose a different time.' }, { status: 409, headers });
    if (/UNIQUE constraint/i.test(message))
        return Response.json({ error: 'This record already exists. Refresh and try again.' }, { status: 409, headers });
    return Response.json({ error: 'We could not complete that request. Your input has been kept; please try again.' }, { status: 503, headers });
}
export async function GET() { try {
    return Response.json(await state(await identity()), { headers });
}
catch (e) {
    return failure(e);
} }
export async function POST(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (!origin || origin !== new URL(request.url).origin)
            throw new ApiError('This request must come from your SciMentor portal.', 403);
        if (!request.headers.get('content-type')?.includes('application/json'))
            throw new ApiError('Expected a JSON request.');
        const user = await identity();
        const raw = await request.text();
        if (raw.length > 20000)
            throw new ApiError('That request is too large.', 413);
        let input;
        try {
            input = JSON.parse(raw);
        }
        catch {
            throw new ApiError('Invalid request.');
        }
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new ApiError('Invalid request.');
        const result = await act(user, input);
        return Response.json({ ...result, state: await state(user) }, { headers });
    }
    catch (e) {
        return failure(e);
    }
}
