'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { GraduationCap, ArrowRight, LockKeyhole } from 'lucide-react';
export default function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const result = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: sent ? 'verify' : 'send', email, code }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      if (sent) { router.replace('/'); router.refresh(); } else setSent(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="onboarding px-5 py-12"><Link href="/" className="brand w-fit"><GraduationCap/><span>SciMentor<span className="brand-sub">SCIENCE MENTORING</span></span></Link><section className="panel"><p className="eyebrow">YOUR MENTORING SPACE</p><h1>Welcome in.</h1><p className="muted mt-4 mb-6">Sign in with a code sent to your email. New mentees can enter their mentor’s invite code after signing in.</p>{!configured ? <div className="notice">Email sign-in hasn’t been connected yet. Your mentor will let you know when the portal is ready.</div> : <form onSubmit={submit} className="form-stack">{error && <div className="error" role="alert">{error}</div>}<label className="field">Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required disabled={sent || busy}/></label>{sent && <><p className="notice info">Check {email} for your sign-in code.</p><label className="field">Sign-in code<input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required/></label><button className="text-link" type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(''); }}>Use another email or request a new code</button></>}<button className="button" disabled={busy}>{busy ? 'Please wait…' : sent ? 'Sign in' : 'Email me a code'}<ArrowRight size={17}/></button><p className="privacy-line"><LockKeyhole size={14}/> Your meetings and messages remain private.</p></form>}</section></main>;
}
