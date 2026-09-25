import { authClient, authConfigured } from '@/backend/auth';
import { isSameOrigin } from '@/backend/request-origin';
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (authConfigured()) {
    const { error } = await (await authClient()).auth.signOut({ scope: 'local' });
    if (error) return new Response('Sign-out failed. Please try again.', { status: 503 });
  }
  return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store' } });
}
