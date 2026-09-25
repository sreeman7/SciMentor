import { authClient, authConfigured } from '@/backend/auth';
import { isSameOrigin } from '@/backend/request-origin';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!isSameOrigin(request)) return Response.json({ error: 'Use the sign-in form on SciMentor.' }, { status: 403, headers });
  if (!authConfigured()) return Response.json({ error: 'Email sign-in is not connected yet.' }, { status: 503, headers });
  try {
    const raw = await request.text();
    if (raw.length > 2000) return Response.json({ error: 'Invalid request.' }, { status: 400, headers });
    const input = JSON.parse(raw) as { action?: string; email?: string; code?: string };
    if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return Response.json({ error: 'Enter a valid email address.' }, { status: 400, headers });
    const email = input.email.trim().toLowerCase();
    const client = await authClient();
    if (input.action === 'send') {
      const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) return Response.json({ error: 'We could not send a code. Wait a moment and try again.' }, { status: 429, headers });
      return Response.json({ message: 'Check your email for your sign-in code.' }, { headers });
    }
    if (input.action === 'verify' && typeof input.code === 'string' && /^\d{6,8}$/.test(input.code.trim())) {
      const { error } = await client.auth.verifyOtp({ email, token: input.code.trim(), type: 'email' });
      if (error) return Response.json({ error: 'That code is invalid or expired. Request a new one.' }, { status: 400, headers });
      return Response.json({ message: 'Signed in.' }, { headers });
    }
    return Response.json({ error: 'Enter the sign-in code from your email.' }, { status: 400, headers });
  } catch { return Response.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503, headers }); }
}
