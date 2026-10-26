'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2, Pencil, Tag } from 'lucide-react';
import type { Restaurant } from '@/lib/types';
import { useCart } from '@/lib/cart';
import { CartLine, lineTotal, unitPrice, totals, subtotalOf } from '@/lib/pricing';
import { formatMoney } from '@/lib/money';
import { Sheet, Spinner, Toast, Empty } from './ui';

interface Quote { subtotal: number; discount: number; tax: number; service: number; total: number; promoCode: string | null }
const randomToken = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const toApiItems = (lines: CartLine[]) => lines.map((l) => ({ menu_item_id: l.itemId, quantity: l.quantity, variant_id: l.variant?.id ?? null, add_on_option_ids: l.addOns.map((a) => a.id), special_instructions: l.instructions }));

export default function CartSheet({ open, onClose, restaurant: r, table, canOrder, orderBlock, onlineEnabled, onEdit }: {
  open: boolean; onClose: () => void; restaurant: Restaurant; table: { code: string; display_name: string } | null; canOrder: boolean;
  orderBlock: string | null; onlineEnabled: boolean; onEdit: (l: CartLine) => void;
}) {
  const router = useRouter();
  const cart = useCart(); const lines = cart.slug === r.slug ? cart.lines : [];
  const [step, setStep] = useState<'cart' | 'confirm'>('cart');
  const [quote, setQuote] = useState<Quote | null>(null); const [quoteErr, setQuoteErr] = useState<string | null>(null); const [quoting, setQuoting] = useState(false);
  const [promoInput, setPromoInput] = useState(cart.promoCode);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [notes, setNotes] = useState('');
  const methods = useMemo(() => (['counter', 'table', 'online'] as const).filter((m) => r.settings.payments?.[m] && (m !== 'online' || onlineEnabled)), [r, onlineEnabled]);
  const [method, setMethod] = useState<'counter' | 'table' | 'online'>(methods[0] ?? 'counter');
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!methods.includes(method) && methods[0]) setMethod(methods[0]); }, [methods, method]);
  useEffect(() => { if (open) setStep('cart'); }, [open]);

  const sig = JSON.stringify([lines.map((l) => [l.key, l.quantity]), cart.promoCode]);
  const refreshQuote = useCallback(async () => {
    if (lines.length === 0) { setQuote(null); return; }
    setQuoting(true); setQuoteErr(null);
    try {
      const res = await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: r.slug, items: toApiItems(lines), promoCode: cart.promoCode }) });
      const j = await res.json();
      if (!res.ok) { setQuote(null); setQuoteErr(j.error ?? 'Could not price your order.'); } else setQuote(j);
    } catch { setQuote(null); setQuoteErr('Network problem. Check your connection and try again.'); }
    setQuoting(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, r.slug]);
  useEffect(() => { if (open) refreshQuote(); }, [open, refreshQuote]);

  // local preview shown instantly while the authoritative quote loads
  const preview = totals(subtotalOf(lines), r.settings.tax_percent ?? 0, r.settings.service_charge_percent ?? 0);
  const bill = quote ?? { ...preview, promoCode: null };
  const money = (n: number) => formatMoney(n, r.currency);

  async function place() {
    if (!table || !canOrder || !quote) return;
    setBusy(true);
    // One idempotency key + tracking token per distinct cart, reused on retries so a network retry can never create a second order.
    const attemptSig = JSON.stringify([sig, method, table.code]);
    let a = cart.attempt;
    if (!a || a.sig !== attemptSig) { a = { sig: attemptSig, idempotencyKey: crypto.randomUUID(), trackingToken: randomToken() }; cart.setAttempt(a); }
    try {
      const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        slug: r.slug, table: table.code, items: toApiItems(lines), customerName: name, customerPhone: phone, paymentMethod: method, notes,
        promoCode: cart.promoCode, idempotencyKey: a.idempotencyKey, trackingToken: a.trackingToken }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(j.error ?? 'Could not place your order.');
        if (['ITEM_UNAVAILABLE', 'ITEM_NOT_FOUND', 'INVALID_TABLE', 'RESTAURANT_CLOSED'].includes(j.code)) { router.refresh(); setStep('cart'); refreshQuote(); }
        setBusy(false); return;
      }
      try { const k = 'qrmenu-orders'; const prev = JSON.parse(localStorage.getItem(k) ?? '[]'); localStorage.setItem(k, JSON.stringify([{ t: a.trackingToken, n: j.orderNumber, at: Date.now() }, ...prev].slice(0, 10))); } catch { /* ignore */ }
      cart.clear();
      router.push(`/order/${a.trackingToken}${method === 'online' ? '?pay=1' : ''}`);
    } catch {
      // The order may or may not have reached the server. The same key is kept, so pressing again is safe.
      setToast('Connection problem - your order may not have been sent. Tap "Place order" again; it will not be duplicated.');
      setBusy(false);
    }
  }

  const footer = lines.length === 0 ? null : step === 'cart' ? (
    <div>
      {quoteErr && <p role="alert" className="mb-2 text-sm font-medium text-red-600">{quoteErr}</p>}
      <button className="btn-primary w-full" disabled={!canOrder || !!quoteErr || quoting || !quote || (r.settings.min_order_amount > 0 && bill.subtotal < r.settings.min_order_amount)} onClick={() => setStep('confirm')}>
        {quoting ? <Spinner className="h-4 w-4" /> : null}Continue · {money(bill.total)}</button>
      {!canOrder && <p className="mt-2 text-center text-xs text-stone-500">{orderBlock}</p>}
      {r.settings.min_order_amount > 0 && bill.subtotal < r.settings.min_order_amount && <p className="mt-2 text-center text-xs text-stone-500">Minimum order is {money(r.settings.min_order_amount)}.</p>}
    </div>
  ) : (
    <div className="grid gap-2">
      <button className="btn-primary w-full" disabled={busy || !quote || methods.length === 0} onClick={place}>{busy && <Spinner className="h-4 w-4" />}{busy ? 'Placing order…' : `Place order · ${money(bill.total)}`}</button>
      <button className="btn-ghost w-full" disabled={busy} onClick={() => setStep('cart')}>Back to cart</button>
    </div>
  );

  return (
    <>
      <Toast message={toast} onClose={() => setToast(null)} />
      <Sheet open={open} onClose={onClose} title={step === 'cart' ? 'Your cart' : 'Confirm your order'} footer={footer}>
        {lines.length === 0 ? <Empty>Your cart is empty. Add something tasty!</Empty> : step === 'cart' ? (
          <div className="grid gap-4">
            <ul className="divide-y divide-stone-100">
              {lines.map((l) => (
                <li key={l.key} className="py-3">
                  <div className="flex justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{l.name}</p>
                    <p className="text-xs text-stone-500">{[l.variant?.name, ...l.addOns.map((a) => a.name)].filter(Boolean).join(' · ')}</p>
                    {l.instructions && <p className="text-xs italic text-stone-500">“{l.instructions}”</p>}
                    <p className="mt-0.5 text-xs text-stone-500">{money(unitPrice(l))} each</p></div>
                    <p className="font-bold">{money(lineTotal(l))}</p></div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center rounded-xl border border-stone-300">
                      <button className="grid h-10 w-10 place-items-center" onClick={() => cart.setQty(l.key, l.quantity - 1)} aria-label={`Decrease ${l.name}`}><Minus size={16} /></button>
                      <span className="w-7 text-center font-semibold">{l.quantity}</span>
                      <button className="grid h-10 w-10 place-items-center" onClick={() => cart.setQty(l.key, l.quantity + 1)} aria-label={`Increase ${l.name}`}><Plus size={16} /></button></div>
                    <div className="flex gap-1">
                      {(l.variant || l.addOns.length > 0 || true) && <button className="grid h-10 w-10 place-items-center rounded-lg text-stone-500 hover:bg-stone-100" onClick={() => onEdit(l)} aria-label={`Edit ${l.name}`}><Pencil size={16} /></button>}
                      <button className="grid h-10 w-10 place-items-center rounded-lg text-red-600 hover:bg-red-50" onClick={() => cart.remove(l.key)} aria-label={`Remove ${l.name}`}><Trash2 size={16} /></button></div>
                  </div>
                </li>))}
            </ul>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); cart.setPromo(promoInput.trim().toUpperCase()); }}>
              <div className="relative flex-1"><Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="input pl-9 uppercase" placeholder="Promo code" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} maxLength={30} aria-label="Promo code" /></div>
              <button className="btn-ghost" type="submit">Apply</button></form>
            <Bill bill={bill} money={money} taxPct={r.settings.tax_percent} svcPct={r.settings.service_charge_percent} loading={quoting} />
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">{table?.display_name}</p>
            <ul className="text-sm">{lines.map((l) => (<li key={l.key} className="flex justify-between py-1"><span>{l.quantity} × {l.name}<span className="block text-xs text-stone-500">{[l.variant?.name, ...l.addOns.map((a) => a.name)].filter(Boolean).join(' · ')}{l.instructions ? ` — “${l.instructions}”` : ''}</span></span><span>{money(lineTotal(l))}</span></li>))}</ul>
            <Bill bill={bill} money={money} taxPct={r.settings.tax_percent} svcPct={r.settings.service_charge_percent} loading={quoting} />
            <div className="grid gap-3">
              <div><label className="label" htmlFor="cn">Name {r.settings.require_name ? '' : '(optional)'}</label><input id="cn" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required={r.settings.require_name} autoComplete="name" /></div>
              <div><label className="label" htmlFor="cp">Phone {r.settings.require_phone ? '' : '(optional)'}</label><input id="cp" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} required={r.settings.require_phone} autoComplete="tel" /></div>
              <div><label className="label" htmlFor="cno">Order notes (optional)</label><textarea id="cno" className="input min-h-[64px] py-2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
            </div>
            <fieldset><legend className="label">Payment</legend>
              {methods.length === 0 ? <p className="text-sm text-red-600">No payment method is enabled. Please ask staff.</p> : (
                <div className="grid gap-2">{methods.map((m) => (
                  <label key={m} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-stone-300 px-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input type="radio" name="pm" className="accent-orange-600" checked={method === m} onChange={() => setMethod(m)} />
                    {m === 'counter' ? 'Pay at counter' : m === 'table' ? 'Pay at table' : 'Pay online now'}</label>))}</div>)}
            </fieldset>
          </div>
        )}
      </Sheet>
    </>
  );
}

function Bill({ bill, money, taxPct, svcPct, loading }: { bill: Quote; money: (n: number) => string; taxPct: number; svcPct: number; loading: boolean }) {
  const row = (l: string, v: string, cls = '') => <div className={`flex justify-between ${cls}`}><span>{l}</span><span>{v}</span></div>;
  return (
    <div className="grid gap-1 rounded-xl bg-stone-50 p-3 text-sm" aria-busy={loading}>
      {row('Subtotal', money(bill.subtotal))}
      {bill.discount > 0 && row(`Discount${bill.promoCode ? ` (${bill.promoCode})` : ''}`, `−${money(bill.discount)}`, 'text-green-700')}
      {bill.tax > 0 && row(`Taxes (${taxPct}%)`, money(bill.tax))}
      {bill.service > 0 && row(`Service charge (${svcPct}%)`, money(bill.service))}
      {row('Total payable', money(bill.total), 'mt-1 border-t border-stone-200 pt-2 text-base font-extrabold')}
    </div>
  );
}
