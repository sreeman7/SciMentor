import { getChatGPTUser } from './chatgpt-auth';
import Portal from './portal';
import Welcome from './welcome';
export const dynamic = 'force-dynamic';
export default async function Page() { const user = await getChatGPTUser(); return user ? <Portal user={{ name: user.fullName ?? '', email: user.email }}/> : <Welcome />; }
