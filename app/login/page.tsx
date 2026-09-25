import { authConfigured, getServerUser } from '@/backend/auth';
import { redirect } from 'next/navigation';
import LoginForm from '@/frontend/pages/login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await getServerUser()) redirect('/');
  return <LoginForm configured={authConfigured()}/>;
}
