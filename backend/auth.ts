import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export type AuthUser = { userId: string; email: string; fullName: string | null };
export function authConfigured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
export async function authClient() {
  if (!authConfigured()) throw new Error('Email sign-in has not been configured.');
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: values => { try { for (const { name, value, options } of values) store.set(name, value, options); } catch { /* Server Components cannot write cookies; proxy.ts refreshes them. */ } },
    },
  });
}
export async function getServerUser(): Promise<AuthUser | null> {
  if (!authConfigured()) return null;
  const client = await authClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.email || !user.email_confirmed_at) return null;
  return { userId: user.id, email: user.email, fullName: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null };
}
