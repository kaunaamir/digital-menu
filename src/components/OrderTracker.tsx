'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, WifiOff, XCircle, CreditCard } from 'lucide-react';
import { STATUS_LABEL, progressSteps, type OrderStatus, type WorkflowEnd } from '@/lib/status';
import { formatMoney } from '@/lib/money';
import { Spinner, cn, Toast } from './ui';

interface Tracked {
  order_number: number; status: OrderStatus; status_reason: string | null; payment_method: 'counter' | 'table' | 'online'; payment_status: 'pending' | 'paid' | 'failed';
  subtotal: number; tax_amount: number; service_charge: number; discount_amount: number; total_amount: number; created_at: string; updated_at: string;
  tables: { display_name: string } | null;
  restaurant: { name: string; slug: string; currency: string; workflow_end: WorkflowEnd; prep_time_minutes: number | null; online_enabled: boolean };
  order_items: { item_name_snapshot: string; quantity: number; line_total: number; selected_variant_snapshot: { name: string } | null; selected_add_ons_snapshot: { name: string }[]; special_instructions: string | null }[];
  order_status_history: { new_status: string; created_at: string }[];
}
declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void } } }

export default function OrderTracker({ token, autoPay }: { token: string; autoPay: boolean }) {
  const [o, setO] = useState<Tracked | null>(null); const [err, setErr] = useState<string | null>(null); const [offline, setOffline] = useState(false);
  const [paying, setPaying] = useState(false); const [toast, setToast] = useState<string | null>(null);
  const last = useRef<string>(''); const autoStarted = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/track/${token}`, { cache: 'no-store' });
      if (res.status === 404) { setErr('We could not find this order. Check the link you were given.'); return; }
      if (!res.ok) throw new Error(String(res.status));
      const j: Tracked = await res.json(); setO(j); setOffline(false); setErr(null);
      if (last.current && last.current !== j.status && 'vibrate' in navigator) navigator.vibrate?.(200);
      last.current = j.status;
    } catch { setOffline(true); }
  }, [token]);

  // Poll every 4s while visible (fallback-safe: works without websockets); back off when the order is finished.
  useEffect(() => {
    load();
    const done = o && ['completed', 'rejected', 'cancelled'].includes(o.status) && o.payment_status !== 'pending';
    const id = setInterval(() => { if (!document.hidden) load(); }, done ? 30000 : 4000);
    const vis = () => !document.hidden && load();
    document.addEventListener('visibilitychange', vis); window.addEventListener('online', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis); };
  }, [load, o?.status, o?.payment_status]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = useCallback(async () => {
    setPaying(true);
    try {
      const res = await fetch('/api/payments/razorpay/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error);
      if (!window.Razorpay) await new Promise<void>((ok, bad) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = () => ok(); s.onerror = () => bad(new Error('Could not load payment window')); document.body.appendChild(s); });
      const rz = new window.Razorpay!({ key: j.keyId, amount: j.amount, currency: j.currency, order_id: j.razorpayOrderId, name: o?.restaurant.name, description: `Order #${j.orderNumber}`,
        handler: () => { setToast('Payment received - confirming with your bank…'); setTimeout(load, 1500); },   // UI hint only; "paid" is set by the verified webhook
        modal: { ondismiss: () => setPaying(false) }, theme: { color: '#ea580c' } });
      rz.on('payment.failed', () => setToast('Payment failed. You can try again.'));
      rz.open();
    } catch (e) { setToast(e instanceof Error ? e.message : 'Could not start payment.'); }
    setPaying(false);
  }, [token, o?.restaurant.name, load]);

  useEffect(() => { if (autoPay && o && !autoStarted.current && o.payment_method === 'online' && o.payment_status === 'pending' && o.restaurant.online_enabled) { autoStarted.current = true; pay(); } }, [autoPay, o, pay]);

  if (err) return <main className="mx-auto max-w-md p-6"><div className="card p-6 text-center"><XCircle className="mx-auto text-red-500" /><p className="mt-2">{err}</p></div></main>;
  if (!o) return <main className="grid min-h-dvh place-items-center"><Spinner className="h-8 w-8 text-brand-500" /></main>;

  const money = (n: number) => formatMoney(n, o.restaurant.currency);
  const steps = progressSteps(o.restaurant.workflow_end); const failed = o.status === 'rejected' || o.status === 'cancelled';
  const idx = steps.indexOf(o.status as (typeof steps)[number]);
  const label = (s: string) => (s === 'new' ? 'Order placed' : STATUS_LABEL[s as OrderStatus]);
  const headline = failed ? (o.status === 'rejected' ? 'Order declined' : 'Order cancelled') : o.status === 'new' ? 'Waiting for the restaurant to accept' : o.status === 'accepted' ? 'Order accepted' : o.status === 'preparing' ? 'Your food is being prepared' : o.status === 'ready' ? 'Your order is ready' : o.status === 'served' ? 'Served - enjoy your meal!' : 'Order completed';
  const latest = o.order_status_history.at(-1);

  return (
    <main className="mx-auto max-w-md px-4 pb-12 pt-6">
      <Toast message={toast} kind="ok" onClose={() => setToast(null)} />
      {offline && <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><WifiOff size={16} />Connection lost - retrying… Your order is safe.</p>}
      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{o.restaurant.name} · {o.tables?.display_name}</p>
        <h1 className="mt-1 text-2xl font-extrabold">Order #{o.order_number}</h1>
        <p className={cn('mt-1 font-semibold', failed ? 'text-red-600' : 'text-brand-600')} aria-live="polite">{headline}</p>
        {failed && o.status_reason && <p className="mt-1 text-sm text-stone-600">Reason: {o.status_reason}</p>}
        {!failed && o.restaurant.prep_time_minutes && ['new', 'accepted', 'preparing'].includes(o.status) && <p className="mt-1 flex items-center gap-1 text-sm text-stone-500"><Clock size={14} />Estimated preparation: ~{o.restaurant.prep_time_minutes} min</p>}
        {latest && <p className="mt-1 text-xs text-stone-400">Updated {new Date(latest.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
        {!failed && (
          <ol className="mt-5 grid gap-0" aria-label="Order progress">
            {steps.map((s, i) => { const done = i <= idx; return (
              <li key={s} className="flex gap-3">
                <div className="flex flex-col items-center"><span className={cn('grid h-7 w-7 place-items-center rounded-full border-2 text-white', done ? 'border-brand-500 bg-brand-500' : 'border-stone-300 bg-white')}>{done && <Check size={14} />}</span>{i < steps.length - 1 && <span className={cn('h-6 w-0.5', i < idx ? 'bg-brand-500' : 'bg-stone-200')} />}</div>
                <p className={cn('pt-0.5 text-sm', done ? 'font-bold' : 'text-stone-400', i === idx && 'text-brand-600')}>{label(s)}</p></li>); })}
          </ol>)}
      </div>

      <div className="card mt-4 p-5">
        <div className="flex items-center justify-between"><h2 className="font-bold">Summary</h2>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', o.payment_status === 'paid' ? 'bg-green-100 text-green-800' : o.payment_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')}>
            {o.payment_status === 'paid' ? 'Paid' : o.payment_status === 'failed' ? 'Payment failed' : o.payment_method === 'online' ? 'Payment pending' : `Pay at ${o.payment_method}`}</span></div>
        <ul className="mt-3 divide-y divide-stone-100 text-sm">{o.order_items.map((i, k) => (
          <li key={k} className="flex justify-between py-2"><span>{i.quantity} × {i.item_name_snapshot}<span className="block text-xs text-stone-500">{[i.selected_variant_snapshot?.name, ...i.selected_add_ons_snapshot.map((a) => a.name)].filter(Boolean).join(' · ')}{i.special_instructions ? ` — “${i.special_instructions}”` : ''}</span></span><span>{money(i.line_total)}</span></li>))}</ul>
        <div className="mt-3 grid gap-1 border-t border-stone-200 pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
          {o.discount_amount > 0 && <div className="flex justify-between text-green-700"><span>Discount</span><span>−{money(o.discount_amount)}</span></div>}
          {o.tax_amount > 0 && <div className="flex justify-between"><span>Taxes</span><span>{money(o.tax_amount)}</span></div>}
          {o.service_charge > 0 && <div className="flex justify-between"><span>Service charge</span><span>{money(o.service_charge)}</span></div>}
          <div className="flex justify-between text-base font-extrabold"><span>Total</span><span>{money(o.total_amount)}</span></div></div>
        {o.payment_method === 'online' && o.payment_status !== 'paid' && !failed && o.restaurant.online_enabled && (
          <button className="btn-primary mt-4 w-full" onClick={pay} disabled={paying}>{paying ? <Spinner className="h-4 w-4" /> : <CreditCard size={16} />}{o.payment_status === 'failed' ? 'Retry payment' : 'Pay now'}</button>)}
      </div>
      <p className="mt-4 text-center text-sm"><Link className="font-semibold text-brand-600" href={`/menu/${o.restaurant.slug}`}>Back to menu</Link></p>
    </main>
  );
}
