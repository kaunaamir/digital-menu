'use client';
import { useMemo, useState } from 'react';
import { Minus, Plus, Clock, AlertTriangle } from 'lucide-react';
import type { MenuItem } from '@/lib/types';
import { CartLine, unitPrice, validateSelection, round2 } from '@/lib/pricing';
import { formatMoney } from '@/lib/money';
import { Sheet, DietDot, Img } from './ui';

export default function ItemSheet({ item, currency, initial, canOrder, onClose, onAdd }: {
  item: MenuItem | null; currency: string; initial?: CartLine | null; canOrder: boolean; onClose: () => void;
  onAdd: (line: Omit<CartLine, 'key'>, replaceKey?: string) => void;
}) {
  if (!item) return null;
  return <Inner key={item.id + (initial?.key ?? '')} {...{ item, currency, initial, canOrder, onClose, onAdd }} />;
}

function Inner({ item, currency, initial, canOrder, onClose, onAdd }: { item: MenuItem; currency: string; initial?: CartLine | null; canOrder: boolean; onClose: () => void; onAdd: (l: Omit<CartLine, 'key'>, k?: string) => void }) {
  const variants = item.menu_item_variants;
  const [variantId, setVariantId] = useState<string | null>(initial?.variant?.id ?? (variants.length === 1 ? variants[0].id : null));
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    const s: Record<string, string[]> = {};
    for (const a of initial?.addOns ?? []) (s[a.groupId] ??= []).push(a.id);
    return s;
  });
  const [qty, setQty] = useState(initial?.quantity ?? 1);
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [err, setErr] = useState<string | null>(null);

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const addOns = useMemo(() => item.add_on_groups.flatMap((g) => g.add_on_options.filter((o) => (sel[g.id] ?? []).includes(o.id)).map((o) => ({ id: o.id, groupId: g.id, name: o.name, price: Number(o.price) }))), [item, sel]);
  const line = { itemId: item.id, name: item.name, image: item.image_url, basePrice: Number(item.price), quantity: qty, instructions: instructions.trim(),
    variant: variant ? { id: variant.id, name: variant.name, adj: Number(variant.price_adjustment) } : null, addOns };
  const total = round2(unitPrice(line) * qty);

  function toggle(gid: string, oid: string, max: number) {
    setErr(null);
    setSel((s) => {
      const cur = s[gid] ?? [];
      if (max === 1) return { ...s, [gid]: cur.includes(oid) ? [] : [oid] };
      if (cur.includes(oid)) return { ...s, [gid]: cur.filter((x) => x !== oid) };
      return cur.length >= max ? s : { ...s, [gid]: [...cur, oid] };
    });
  }
  function add() {
    const e = validateSelection(variants, item.add_on_groups, variantId, sel);
    if (e) { setErr(e); return; }
    onAdd(line, initial?.key); onClose();
  }
  return (
    <Sheet open onClose={onClose} title={item.name} footer={
      canOrder ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-stone-300">
            <button className="grid h-11 w-11 place-items-center" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity"><Minus size={18} /></button>
            <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
            <button className="grid h-11 w-11 place-items-center" onClick={() => setQty(Math.min(50, qty + 1))} aria-label="Increase quantity"><Plus size={18} /></button>
          </div>
          <button className="btn-primary flex-1" onClick={add}>{initial ? 'Update' : 'Add'} · {formatMoney(total, currency)}</button>
        </div>
      ) : <p className="text-center text-sm text-stone-500">Ordering is currently unavailable.</p>}>
      <Img src={item.image_url} alt={item.name} className="mb-3 h-44 w-full rounded-2xl" />
      <div className="mb-1 flex items-center gap-2"><DietDot type={item.dietary_type} />{item.is_spicy && <span className="text-xs font-semibold text-red-600">🌶 Spicy</span>}
        {item.preparation_time ? <span className="flex items-center gap-1 text-xs text-stone-500"><Clock size={12} />{item.preparation_time} min</span> : null}</div>
      {item.description && <p className="text-sm text-stone-600">{item.description}</p>}
      {item.allergens.length > 0 && <p className="mt-2 flex items-start gap-1 text-xs text-amber-700"><AlertTriangle size={14} className="mt-px shrink-0" />Contains: {item.allergens.join(', ')}</p>}

      {variants.length > 0 && (
        <fieldset className="mt-5"><legend className="mb-2 text-sm font-bold">Choose one <span className="font-normal text-red-600">Required</span></legend>
          <div className="grid gap-2">{variants.map((v) => (
            <label key={v.id} className="flex min-h-[48px] cursor-pointer items-center justify-between rounded-xl border border-stone-300 px-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <span className="flex items-center gap-3"><input type="radio" name="variant" checked={variantId === v.id} onChange={() => { setVariantId(v.id); setErr(null); }} className="accent-orange-600" />{v.name}</span>
              <span className="text-sm text-stone-600">{Number(v.price_adjustment) ? `${Number(v.price_adjustment) > 0 ? '+' : ''}${formatMoney(Number(v.price_adjustment), currency)}` : ''}</span>
            </label>))}</div></fieldset>
      )}
      {item.add_on_groups.map((g) => (
        <fieldset key={g.id} className="mt-5"><legend className="mb-2 text-sm font-bold">{g.name}{' '}
          <span className={g.is_required ? 'font-normal text-red-600' : 'font-normal text-stone-500'}>{g.is_required ? 'Required' : 'Optional'} · {g.maximum_selections === 1 ? 'choose 1' : `up to ${g.maximum_selections}`}</span></legend>
          <div className="grid gap-2">{g.add_on_options.map((o) => {
            const checked = (sel[g.id] ?? []).includes(o.id); const off = !o.is_available;
            return (<label key={o.id} className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3 ${off ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${checked ? 'border-brand-500 bg-brand-50' : 'border-stone-300'}`}>
              <span className="flex items-center gap-3"><input type={g.maximum_selections === 1 ? 'radio' : 'checkbox'} name={g.id} disabled={off} checked={checked} onChange={() => toggle(g.id, o.id, g.maximum_selections)} className="accent-orange-600" />{o.name}{off && <em className="text-xs">(unavailable)</em>}</span>
              <span className="text-sm text-stone-600">{Number(o.price) ? `+${formatMoney(Number(o.price), currency)}` : ''}</span></label>);
          })}</div></fieldset>
      ))}
      <div className="mt-5"><label className="label" htmlFor="si">Special instructions</label>
        <textarea id="si" className="input min-h-[72px] py-2" maxLength={300} placeholder="e.g. no onions, less spicy" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
      {err && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{err}</p>}
    </Sheet>
  );
}
