'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Restaurant } from '@/lib/types';
import { supabaseBrowser } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import { rpcMessage } from '@/lib/rpc';
import { Empty, Spinner, Toast } from './ui';

interface Rep { total_orders: number; total_sales: number; paid_sales: number; avg_order_value: number; cancelled_orders: number;
  top_items: { name: string; quantity: number; revenue: number }[]; by_date: { date: string; orders: number; sales: number }[]; by_payment: { payment_method: string; orders: number; amount: number }[] }
const iso = (d: Date) => d.toLocaleDateString('en-CA');
const csvCell = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };   // also blocks spreadsheet formula injection

export default function ReportsAdmin({ restaurant: r }: { restaurant: Restaurant; role?: string }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 86400_000))); const [to, setTo] = useState(iso(new Date()));
  const [rep, setRep] = useState<Rep | null>(null); const [loading, setLoading] = useState(true); const [toast, setToast] = useState<string | null>(null);
  const m = (n: number) => formatMoney(n, r.currency);
  const load = useCallback(async () => { setLoading(true); const { data, error } = await sb.rpc('report_summary', { p_restaurant: r.id, p_from: from, p_to: to }); if (error) setToast(rpcMessage(error.message)); else setRep(data); setLoading(false); }, [sb, r.id, from, to]);
  useEffect(() => { load(); }, [load]);

  async function exportCsv() {
    const rows: string[][] = [['Order #', 'Date', 'Table', 'Status', 'Payment method', 'Payment status', 'Items', 'Subtotal', 'Discount', 'Tax', 'Service charge', 'Total', 'Promo', 'Customer', 'Phone']];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await sb.from('orders').select('order_number, created_at, status, payment_method, payment_status, subtotal, discount_amount, tax_amount, service_charge, total_amount, promo_code, customer_name, customer_phone, tables(display_name), order_items(item_name_snapshot, quantity)')
        .eq('restaurant_id', r.id).gte('created_at', new Date(`${from}T00:00:00`).toISOString()).lt('created_at', new Date(new Date(`${to}T00:00:00`).getTime() + 86400_000).toISOString()).order('created_at').range(off, off + 999);
      if (error) { setToast(error.message); return; }
      for (const o of (data ?? []) as any[]) rows.push([o.order_number, new Date(o.created_at).toLocaleString(), o.tables?.display_name, o.status, o.payment_method, o.payment_status, o.order_items.map((i: any) => `${i.quantity}x ${i.item_name_snapshot}`).join('; '), o.subtotal, o.discount_amount, o.tax_amount, o.service_charge, o.total_amount, o.promo_code, o.customer_name, o.customer_phone].map(String));
      if ((data?.length ?? 0) < 1000) break;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map((x) => x.map(csvCell).join(',')).join('\n')], { type: 'text/csv' })); a.download = `${r.slug}-orders-${from}_${to}.csv`; a.click();
  }
  const max = Math.max(1, ...(rep?.by_date.map((d) => Number(d.sales)) ?? [1]));
  return (
    <div className="mx-auto max-w-4xl"><Toast message={toast} onClose={() => setToast(null)} />
      <div className="mb-4 flex flex-wrap items-end gap-2"><h1 className="mr-auto text-xl font-extrabold">Reports</h1>
        <div><label className="label">From</label><input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div><div><label className="label">To</label><input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn-ghost" onClick={exportCsv}><Download size={16} />Export CSV</button></div>
      {loading || !rep ? <Spinner className="mx-auto mt-10 h-8 w-8 text-brand-500" /> : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[['Orders', rep.total_orders], ['Sales', m(rep.total_sales)], ['Paid', m(rep.paid_sales)], ['Avg order', m(rep.avg_order_value)], ['Cancelled', rep.cancelled_orders]].map(([l, v]) => <div key={l as string} className="card p-3"><p className="text-xs font-semibold text-stone-500">{l}</p><p className="text-xl font-black">{v}</p></div>)}</div>
          <p className="text-xs text-stone-500">Sales exclude rejected and cancelled orders. “Paid” counts orders whose payment is confirmed.</p>
          <section className="card p-4"><h2 className="mb-3 font-bold">Orders by date</h2>{rep.by_date.length === 0 ? <Empty>No orders in this period.</Empty> : <ul className="grid gap-2 text-sm">{rep.by_date.map((d) => <li key={d.date} className="flex items-center gap-3"><span className="w-24 shrink-0 text-stone-500">{d.date}</span><span className="h-3 rounded bg-brand-500" style={{ width: `${(Number(d.sales) / max) * 100}%`, minWidth: 4 }} /><span className="ml-auto whitespace-nowrap font-semibold">{m(Number(d.sales))} · {d.orders}</span></li>)}</ul>}</section>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="card p-4"><h2 className="mb-2 font-bold">Most ordered items</h2>{rep.top_items.length === 0 ? <p className="text-sm text-stone-400">No data.</p> : <ol className="grid gap-1 text-sm">{rep.top_items.map((i, k) => <li key={i.name} className="flex justify-between"><span>{k + 1}. {i.name}</span><span className="font-semibold">{i.quantity} · {m(Number(i.revenue))}</span></li>)}</ol>}</section>
            <section className="card p-4"><h2 className="mb-2 font-bold">Payment methods</h2>{rep.by_payment.length === 0 ? <p className="text-sm text-stone-400">No data.</p> : <ul className="grid gap-1 text-sm">{rep.by_payment.map((p) => <li key={p.payment_method} className="flex justify-between capitalize"><span>{p.payment_method === 'online' ? 'Online' : `At ${p.payment_method}`}</span><span className="font-semibold">{p.orders} · {m(Number(p.amount))}</span></li>)}</ul>}</section></div>
        </div>)}
    </div>
  );
}
