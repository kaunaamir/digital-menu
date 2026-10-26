'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { rpcMessage } from '@/lib/rpc';
import { Spinner } from './ui';

export default function SetupRestaurant() {
  const router = useRouter(); const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabaseBrowser().rpc('create_restaurant', { p_name: name, p_slug: slug || slugify(name) });
    if (error) { setErr(rpcMessage(error.message)); setBusy(false); return; }
    router.replace('/admin/menu'); router.refresh();
  }
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-extrabold">Set up your restaurant</h1>
      <p className="mt-1 text-sm text-stone-600">You will be the owner. You can add staff and managers later.</p>
      <form onSubmit={go} className="mt-6 grid gap-4">
        <div><label className="label" htmlFor="rn">Restaurant name</label><input id="rn" className="input" value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} required maxLength={120} /></div>
        <div><label className="label" htmlFor="rs">Menu web address</label>
          <div className="flex items-center gap-2 text-sm text-stone-500"><span>/menu/</span><input id="rs" className="input" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} required minLength={3} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></div></div>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Create restaurant</button>
      </form>
    </main>
  );
}
