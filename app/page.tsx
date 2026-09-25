import { getServerUser } from '@/backend/auth';
import Portal from '@/frontend/pages/portal';
import Welcome from '@/frontend/pages/welcome';
export const dynamic = 'force-dynamic';
export default async function Page() { const user = await getServerUser(); return user ? <Portal user={{ name: user.fullName ?? '', email: user.email }}/> : <Welcome />; }
