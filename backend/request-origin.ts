/** Next.js may use an internal hostname in request.url. Host retains the browser-facing authority. */
export function isSameOrigin(request: Request) {
    const origin = request.headers.get('origin');
    if (!origin || origin === 'null') return false;
    try {
        const source = new URL(origin);
        const target = new URL(request.url);
        const host = request.headers.get('host') || target.host;
        // Vercel terminates TLS before forwarding requests to the application.
        const forwardedProtocol = process.env.VERCEL === '1' ? request.headers.get('x-forwarded-proto') : null;
        const protocol = forwardedProtocol === 'https' ? 'https:' : target.protocol;
        return source.origin === origin && ['http:', 'https:'].includes(source.protocol)
            && source.origin === new URL(`${protocol}//${host}`).origin;
    } catch {
        return false;
    }
}
