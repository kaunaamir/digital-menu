'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, Printer, Wifi, WifiOff, X } from 'lucide-react';
import type { OrderRow, Restaurant } from '@/lib/types';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ACTION_LABEL, canCancel, canReject, isTerminal, nextStatus, type OrderStatus, type WorkflowEnd } from '@/lib/status';
import { formatMoney } from '@/lib/money';
import { rpcMessage } from '@/lib/rpc';
import { cn, Spinner, Toast } from './ui';
import { Elapsed, ItemsList, PayBadge, StatusBadge, Ticket } from './OrderParts';

const SELECT = '*, tables(display_name), order_items(*)';
const OPEN = ['new', 'accepted', 'preparing', 'ready', 'served'];

export default function LiveOrders({ restaurant: r, role }: { restaurant: Restaurant; role: string }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const end = (r.settings.workflow_end ?? 'completed') as WorkflowEnd;
  const [orders, setOrders] = useState<OrderRow[]>([]); const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false); const [toast, setToast] = useState<string | null>(null); const [busyId, setBusyId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false); const [soundOn, setSoundOn] = useState(false);
  const [f, setF] = useState({ status: '', table: '', date: '', pay: '', q: '' });
  const [printing, setPrinting] = useState<OrderRow | null>(null);
  const [tab, setTab] = useState<'new' | 'accepted' | 'preparing' | 'ready'>('new');
  const audio = useRef<AudioContext | null>(null); const knownNew = useRef<Set<string> | null>(null); const mutedRef = useRef(false);

  useEffect(() => { const m = localStorage.getItem('qrmenu-muted') === '1'; setMuted(m); mutedRef.current = m; }, []);
  const enableSound = () => { audio.current ??= new AudioContext(); audio.current.resume(); setSoundOn(true); beep(); };
  const beep = useCallback(() => {
    const ctx = audio.current; if (!ctx || mutedRef.current) return;
    [0, 0.22, 0.44].forEach((t, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = i === 2 ? 1175 : 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22); });
  }, []);
  const toggleMute = () => { const m = !muted; setMuted(m); mutedRef.current = m; localStorage.setItem('qrmenu-muted', m ? '1' : '0'); };

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 36 * 3600_000).toISOString();
    const { data, error } = await sb.from('orders').select(SELECT).eq('restaurant_id', r.id).or(`status.in.(${OPEN.join(',')}),created_at.gte.${since}`).order('created_at', { ascending: false }).limit(300);
    if (error) { setToast('Could not refresh orders. Retrying…'); setLoading(false); return; }
    const list = (data ?? []) as unknown as OrderRow[];
    const newIds = new Set(list.filter((o) => o.status === 'new').map((o) => o.id));
    if (knownNew.current && [...newIds].some((id) => !knownNew.current!.has(id))) beep();      // alert on any order we haven't seen
    knownNew.current = newIds; setOrders(list); setLoading(false);
  }, [sb, r.id, beep]);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout>;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
    const ch = sb.channel(`orders-${r.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${r.id}` }, debounced)
      .subscribe((s) => setLive(s === 'SUBSCRIBED'));
    const poll = setInterval(load, 20000);                       // safety net if the socket silently drops
    const vis = () => !document.hidden && load(); document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(timer); clearInterval(poll); document.removeEventListener('visibilitychange', vis); sb.removeChannel(ch); };
  }, [sb, r.id, load]);

  useEffect(() => { if (!printing) return; const t = setTimeout(() => { window.print(); setPrinting(null); }, 150); return () => clearTimeout(t); }, [printing]);

  async function act(o: OrderRow, status: string, reason?: string) {
    setBusyId(o.id);
    const { error } = await sb.rpc('update_order_status', { p_order: o.id, p_status: status, p_reason: reason ?? null });
    if (error) setToast(rpcMessage(error.message));
    await load(); setBusyId(null);
  }
  async function markPaid(o: OrderRow) {
    if (!confirm(`Mark ${formatMoney(o.total_amount, r.currency)} as received for order #${o.order_number}?`)) return;
    setBusyId(o.id);
    const { error } = await sb.rpc('mark_payment_received', { p_order: o.id });
    if (error) setToast(rpcMessage(error.message));
    await load(); setBusyId(null);
  }
  function reject(o: OrderRow) { const why = prompt(`Reject order #${o.order_number}? Enter a reason (shown to the customer):`, 'Item unavailable'); if (why?.trim()) act(o, 'rejected', why.trim()); }
  function cancel(o: OrderRow) { const why = prompt(`Cancel order #${o.order_number}? Reason (shown to the customer):`); if (why !== null) act(o, 'cancelled', why.trim() || 'Cancelled by restaurant'); }

  const visible = useMemo(() => orders.filter((o) =>
    (!f.status || o.status === f.status) && (!f.table || o.table_id === f.table) && (!f.pay || o.payment_status === f.pay) &&
    (!f.date || new Date(o.created_at).toLocaleDateString('en-CA') === f.date) && (!f.q || String(o.order_number) === f.q.replace('#', ''))), [orders, f]);
  const tables = useMemo(() => [...new Map(orders.map((o) => [o.table_id, o.tables?.display_name ?? '?'])).entries()], [orders]);
  const inCol = (k: string) => visible.filter((o) => (k === 'ready' ? (o.status === 'ready' || o.status === 'served') && !isTerminal(o.status, end) : o.status === k)).reverse();
  const done = visible.filter((o) => !['rejected', 'cancelled'].includes(o.status) && isTerminal(o.status, end));
  const cancelled = visible.filter((o) => ['rejected', 'cancelled'].includes(o.status));
  const count = (k: string) => orders.filter((o) => (k === 'ready' ? (o.status === 'ready' || o.status === 'served') && !isTerminal(o.status, end) : o.status === k)).length;
  const cols = [{ k: 'new', t: 'New' }, { k: 'accepted', t: 'Accepted' }, { k: 'preparing', t: 'Preparing' }, { k: 'ready', t: end === 'ready' ? 'Ready' : 'Ready to serve' }] as const;

  const Card = ({ o }: { o: OrderRow }) => {
    const nxt = nextStatus(o.status, end); const busy = busyId === o.id;
    const needsPay = o.payment_method !== 'online' && o.payment_status === 'pending' && !['rejected', 'cancelled'].includes(o.status);
    return (
      <article className={cn('card p-3', o.status === 'new' && 'new-order border-brand-500')} aria-label={`Order ${o.order_number}`}>
        <div className="flex items-start justify-between gap-2"><div><p className="text-lg font-black leading-none">#{o.order_number} <span className="text-base font-bold text-brand-600">{o.tables?.display_name}</span></p>
          <p className="mt-1 text-xs text-stone-500">{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · <Elapsed since={o.created_at} /></p></div><StatusBadge s={o.status} /></div>
        <div className="my-2 border-y border-dashed border-stone-200 py-2"><ItemsList o={o} /></div>
        {o.order_notes && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Order note: {o.order_notes}</p>}
        {(o.customer_name || o.customer_phone) && <p className="mb-2 text-xs text-stone-500">{o.customer_name} {o.customer_phone}</p>}
        {o.status_reason && ['rejected', 'cancelled'].includes(o.status) && <p className="mb-2 text-xs text-red-700">Reason: {o.status_reason}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-extrabold">{formatMoney(o.total_amount, r.currency)}</span><PayBadge o={o} /></div>
        <div className="mt-3 flex flex-wrap gap-2">
          {nxt && <button className="btn-primary flex-1 !min-h-[44px]" disabled={busy} onClick={() => (nxt === 'completed' && !confirm(`Complete order #${o.order_number}?`)) ? null : act(o, nxt)}>{busy && <Spinner className="h-4 w-4" />}{ACTION_LABEL[nxt as OrderStatus]}</button>}
          {canReject(o.status) && <button className="btn-ghost !text-red-600" disabled={busy} onClick={() => reject(o)}>Reject</button>}
          {canCancel(o.status, end) && <button className="btn-ghost !text-red-600" disabled={busy} onClick={() => cancel(o)}>Cancel</button>}
          {needsPay && <button className="btn-ghost" disabled={busy} onClick={() => markPaid(o)}>Mark paid</button>}
          <button className="btn-ghost !px-3" onClick={() => setPrinting(o)} aria-label="Print ticket"><Printer size={16} /></button>
        </div>
      </article>);
  };

  return (
    <div className="print:hidden">
      <Toast message={toast} onClose={() => setToast(null)} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-3 gap-2 text-center">{[['Waiting', count('new'), 'bg-orange-100 text-orange-800'], ['Preparing', count('preparing') + count('accepted'), 'bg-amber-100 text-amber-800'], ['Ready', count('ready'), 'bg-green-100 text-green-800']].map(([l, n, c]) => (
          <div key={l as string} className={cn('rounded-xl px-4 py-1.5', c as string)}><p className="text-xl font-black leading-tight">{n}</p><p className="text-[11px] font-semibold">{l}</p></div>))}</div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn('flex items-center gap-1 text-xs font-semibold', live ? 'text-green-700' : 'text-amber-700')}>{live ? <Wifi size={14} /> : <WifiOff size={14} />}{live ? 'Live' : 'Reconnecting…'}</span>
          {!soundOn && !muted && <button className="btn-primary !min-h-[40px]" onClick={enableSound}><Volume2 size={16} />Enable sound</button>}
          <button className="btn-ghost !min-h-[40px]" onClick={toggleMute} aria-pressed={muted}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'Unmute' : 'Mute'}</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Filter by status"><option value="">All statuses</option>{['new', 'accepted', 'preparing', 'ready', 'served', 'completed', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className="input" value={f.table} onChange={(e) => setF({ ...f, table: e.target.value })} aria-label="Filter by table"><option value="">All tables</option>{tables.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Filter by date" />
        <select className="input" value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })} aria-label="Filter by payment"><option value="">Any payment</option><option value="pending">Unpaid</option><option value="paid">Paid</option><option value="failed">Failed</option></select>
        <div className="relative"><input className="input" inputMode="numeric" placeholder="Order #" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search by order number" />{f.q && <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setF({ ...f, q: '' })} aria-label="Clear"><X size={16} /></button>}</div>
      </div>

      {loading ? <div className="grid place-items-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div> : (
        <>
          <div className="mb-3 flex gap-1 overflow-x-auto lg:hidden" role="tablist">{cols.map((c) => <button key={c.k} role="tab" aria-selected={tab === c.k} onClick={() => setTab(c.k)} className={cn('shrink-0 rounded-lg px-3 py-2 text-sm font-bold', tab === c.k ? 'bg-ink text-white' : 'bg-white')}>{c.t} ({inCol(c.k).length})</button>)}</div>
          <div className="grid gap-4 lg:grid-cols-4">
            {cols.map((c) => (
              <section key={c.k} className={cn('min-w-0', tab !== c.k && 'hidden lg:block')} aria-label={c.t}>
                <h2 className="mb-2 hidden items-center justify-between text-sm font-extrabold uppercase tracking-wide text-stone-600 lg:flex">{c.t}<span className="rounded-full bg-stone-200 px-2 text-xs">{inCol(c.k).length}</span></h2>
                <div className="grid content-start gap-3">{inCol(c.k).map((o) => <Card key={o.id} o={o} />)}{inCol(c.k).length === 0 && <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">{c.k === 'new' ? 'No new orders. New ones appear here automatically.' : 'Nothing here'}</p>}</div>
              </section>))}
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section><h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-stone-600">Completed ({done.length})</h2><div className="grid gap-3 md:grid-cols-2">{done.slice(0, 20).map((o) => <Card key={o.id} o={o} />)}{done.length === 0 && <p className="text-sm text-stone-400">None yet.</p>}</div></section>
            <section><h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-stone-600">Rejected / cancelled ({cancelled.length})</h2><div className="grid gap-3 md:grid-cols-2">{cancelled.slice(0, 20).map((o) => <Card key={o.id} o={o} />)}{cancelled.length === 0 && <p className="text-sm text-stone-400">None.</p>}</div></section>
          </div>
        </>)}
      {printing && <Ticket o={printing} restaurant={r.name} currency={r.currency} />}
      <p className="sr-only">Signed in as {role}</p>
    </div>
  );
}
