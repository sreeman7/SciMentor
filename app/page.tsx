import { getServerUser } from '@/lib/auth';
import Portal from './portal';
import Welcome from './welcome';
export const dynamic = 'force-dynamic';
export default async function Page() { const user = await getServerUser(); return user ? <Portal user={{ name: user.fullName ?? '', email: user.email }}/> : <Welcome />; }
