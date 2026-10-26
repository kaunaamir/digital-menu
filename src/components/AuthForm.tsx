'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Spinner } from './ui';

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter(); const params = useSearchParams();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setInfo(null);
    const sb = supabaseBrowser();
    if (mode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message); else { router.replace(safeNext); router.refresh(); }
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/dashboard` } });
      if (error) setErr(error.message);
      else if (!data.session) setInfo('Check your email to confirm your account, then log in.');
      else { router.replace('/dashboard'); router.refresh(); }
    }
    setBusy(false);
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-extrabold">{mode === 'login' ? 'Staff login' : 'Create your account'}</h1>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        {mode === 'signup' && <div><label className="label" htmlFor="n">Your name</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>}
        <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="input" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        {info && <p className="text-sm text-green-700">{info}</p>}
        <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}{mode === 'login' ? 'Log in' : 'Sign up'}</button>
      </form>
      <p className="mt-4 text-sm text-stone-600">
        {mode === 'login' ? <>New here? <Link className="font-semibold text-brand-600" href="/signup">Create an account</Link></> : <>Already registered? <Link className="font-semibold text-brand-600" href="/login">Log in</Link></>}
      </p>
    </main>
  );
}
