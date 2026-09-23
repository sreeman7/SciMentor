import { authConfigured, getServerUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LoginForm from './login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await getServerUser()) redirect('/');
  return <LoginForm configured={authConfigured()}/>;
}
