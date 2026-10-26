'use client';
import { useEffect, useState } from 'react';
import type { OrderRow } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/status';
import { formatMoney } from '@/lib/money';
import { cn } from './ui';

export const STATUS_COLOR: Record<string, string> = {
  new: 'bg-orange-100 text-orange-800', accepted: 'bg-blue-100 text-blue-800', preparing: 'bg-amber-100 text-amber-800', ready: 'bg-green-100 text-green-800',
  served: 'bg-teal-100 text-teal-800', completed: 'bg-stone-200 text-stone-700', rejected: 'bg-red-100 text-red-700', cancelled: 'bg-red-100 text-red-700',
};
export const StatusBadge = ({ s }: { s: string }) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', STATUS_COLOR[s])}>{STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s}</span>;
export function PayBadge({ o }: { o: Pick<OrderRow, 'payment_method' | 'payment_status'> }) {
  const paid = o.payment_status === 'paid';
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', paid ? 'bg-green-100 text-green-800' : o.payment_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')}>
    {o.payment_method === 'online' ? 'Online' : o.payment_method === 'table' ? 'At table' : 'At counter'} · {paid ? 'Paid' : o.payment_status === 'failed' ? 'Failed' : 'Unpaid'}</span>;
}
export function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(id); }, []);
  const m = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  return <span className={cn(m >= 20 && 'font-bold text-red-600')}>{m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`}</span>;
}
export function ItemsList({ o }: { o: OrderRow }) {
  return (
    <ul className="grid gap-1.5 text-sm">{o.order_items.map((i) => (
      <li key={i.id}><span className="font-bold">{i.quantity}×</span> {i.item_name_snapshot}
        {(i.selected_variant_snapshot || i.selected_add_ons_snapshot?.length > 0) && <span className="block pl-5 text-xs text-stone-600">{[i.selected_variant_snapshot?.name, ...(i.selected_add_ons_snapshot ?? []).map((a) => `+ ${a.name}`)].filter(Boolean).join(', ')}</span>}
        {i.special_instructions && <span className="block pl-5 text-xs font-semibold text-red-700">Note: {i.special_instructions}</span>}</li>))}</ul>);
}
export function Ticket({ o, restaurant, currency }: { o: OrderRow; restaurant: string; currency: string }) {
  const m = (n: number) => formatMoney(n, currency);
  return (
    <div id="ticket"><div style={{ textAlign: 'center', fontWeight: 700 }}>{restaurant}</div>
      <div style={{ textAlign: 'center' }}>ORDER #{o.order_number} · {o.tables?.display_name}</div><div style={{ textAlign: 'center' }}>{new Date(o.created_at).toLocaleString()}</div><hr />
      {o.order_items.map((i) => (<div key={i.id} style={{ marginBottom: 4 }}><b>{i.quantity} x {i.item_name_snapshot}</b>
        {i.selected_variant_snapshot && <div>  {i.selected_variant_snapshot.name}</div>}{(i.selected_add_ons_snapshot ?? []).map((a, k) => <div key={k}>  + {a.name}</div>)}{i.special_instructions && <div>  NOTE: {i.special_instructions}</div>}</div>))}
      <hr />{o.order_notes && <div>Notes: {o.order_notes}</div>}{o.customer_name && <div>Customer: {o.customer_name} {o.customer_phone}</div>}
      <div>Subtotal {m(o.subtotal)}</div>{o.discount_amount > 0 && <div>Discount -{m(o.discount_amount)}</div>}{o.tax_amount > 0 && <div>Tax {m(o.tax_amount)}</div>}{o.service_charge > 0 && <div>Service {m(o.service_charge)}</div>}
      <div style={{ fontWeight: 700 }}>TOTAL {m(o.total_amount)}</div><div>Pay: {o.payment_method} / {o.payment_status}</div></div>);
}
