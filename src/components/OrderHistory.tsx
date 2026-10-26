'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OrderRow, Restaurant } from '@/lib/types';
import { supabaseBrowser } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import { Sheet, Spinner, Empty } from './ui';
import { ItemsList, PayBadge, StatusBadge } from './OrderParts';

const today = () => new Date().toLocaleDateString('en-CA');
export default function OrderHistory({ restaurant: r }: { restaurant: Restaurant }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [f, setF] = useState({ from: today(), to: today(), status: '', pay: '', q: '' });
  const [rows, setRows] = useState<OrderRow[]>([]); const [loading, setLoading] = useState(true); const [sel, setSel] = useState<OrderRow | null>(null);
  const [hist, setHist] = useState<{ new_status: string; created_at: string; reason: string | null }[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    let q = sb.from('orders').select('*, tables(display_name), order_items(*)').eq('restaurant_id', r.id)
      .gte('created_at', new Date(`${f.from}T00:00:00`).toISOString()).lt('created_at', new Date(new Date(`${f.to}T00:00:00`).getTime() + 86400_000).toISOString())
      .order('created_at', { ascending: false }).limit(500);
    if (f.status) q = q.eq('status', f.status); if (f.pay) q = q.eq('payment_status', f.pay); if (f.q) q = q.eq('order_number', Number(f.q.replace('#', '')) || -1);
    const { data } = await q; setRows((data ?? []) as unknown as OrderRow[]); setLoading(false);
  }, [sb, r.id, f]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!sel) return; sb.from('order_status_history').select('new_status, created_at, reason').eq('order_id', sel.id).order('created_at').then(({ data }) => setHist(data ?? [])); }, [sel, sb]);
  return (
    <div>
      <h1 className="mb-3 text-xl font-extrabold">Order history</h1>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input className="input" type="date" value={f.from} max={f.to} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From date" />
        <input className="input" type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To date" />
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status"><option value="">All statuses</option>{['new', 'accepted', 'preparing', 'ready', 'served', 'completed', 'rejected', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })} aria-label="Payment"><option value="">Any payment</option><option value="pending">Unpaid</option><option value="paid">Paid</option><option value="failed">Failed</option></select>
        <input className="input" placeholder="Order #" inputMode="numeric" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Order number" />
      </div>
      {loading ? <Spinner className="mx-auto h-6 w-6 text-brand-500" /> : rows.length === 0 ? <Empty>No orders match these filters.</Empty> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase text-stone-500"><tr><th className="p-3">#</th><th>Time</th><th>Table</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>{rows.map((o) => (<tr key={o.id} className="cursor-pointer border-b border-stone-100 hover:bg-stone-50" onClick={() => setSel(o)}>
            <td className="p-3 font-bold">#{o.order_number}</td><td>{new Date(o.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td><td>{o.tables?.display_name}</td>
            <td className="max-w-[240px] truncate">{o.order_items.map((i) => `${i.quantity}× ${i.item_name_snapshot}`).join(', ')}</td><td className="font-semibold">{formatMoney(o.total_amount, r.currency)}</td><td><PayBadge o={o} /></td><td><StatusBadge s={o.status} /></td></tr>))}</tbody></table></div>)}
      {rows.length === 500 && <p className="mt-2 text-xs text-stone-500">Showing the latest 500. Narrow the date range to see more.</p>}
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? `Order #${sel.order_number} · ${sel.tables?.display_name}` : ''}>
        {sel && <div className="grid gap-4"><div className="flex flex-wrap gap-2"><StatusBadge s={sel.status} /><PayBadge o={sel} /></div><ItemsList o={sel} />
          <p className="font-extrabold">Total {formatMoney(sel.total_amount, r.currency)}</p>
          <div><h3 className="mb-1 text-sm font-bold">Timeline</h3><ul className="text-sm text-stone-600">{hist.map((h, i) => <li key={i}>{new Date(h.created_at).toLocaleTimeString()} · {h.new_status}{h.reason ? ` (${h.reason})` : ''}</li>)}</ul></div></div>}
      </Sheet>
    </div>
  );
}
