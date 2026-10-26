'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Minus, ShoppingBag, Clock, MapPin, Phone, QrCode, Flame, ChevronRight } from 'lucide-react';
import type { Category, MenuItem, Restaurant } from '@/lib/types';
import { useCart, cartCount } from '@/lib/cart';
import { CartLine, lineKey, subtotalOf } from '@/lib/pricing';
import { formatMoney } from '@/lib/money';
import { DietDot, Img, cn, Empty } from './ui';
import ItemSheet from './ItemSheet';
import CartSheet from './CartSheet';

type Diet = 'veg' | 'non_veg' | 'vegan' | 'spicy';
const DIETS: { id: Diet; label: string }[] = [{ id: 'veg', label: 'Veg' }, { id: 'non_veg', label: 'Non-veg' }, { id: 'vegan', label: 'Vegan' }, { id: 'spicy', label: '🌶 Spicy' }];

export default function MenuClient({ restaurant: r, categories, table, tableProblem, onlineEnabled }: {
  restaurant: Restaurant; categories: Category[]; table: { code: string; display_name: string } | null;
  tableProblem: 'no-table' | 'invalid-table' | 'inactive-table' | null; onlineEnabled: boolean;
}) {
  const cart = useCart();
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState(''); const [diets, setDiets] = useState<Diet[]>([]);
  const [active, setActive] = useState(categories[0]?.id ?? '');
  const [item, setItem] = useState<MenuItem | null>(null); const [editing, setEditing] = useState<CartLine | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted) cart.init(r.slug, table && !tableProblem ? table.code : null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mounted, r.slug, table?.code, tableProblem]);

  const orderBlock = !r.is_accepting_orders ? (r.settings.closed_message || 'The restaurant is not accepting orders right now.')
    : tableProblem === 'no-table' ? 'Scan the QR code on your table to place an order.'
    : tableProblem === 'invalid-table' ? 'This table QR code is not valid. Please scan the code on your table again or ask staff.'
    : tableProblem === 'inactive-table' ? 'This table is currently inactive. Please ask staff for help.' : null;
  const canOrder = !orderBlock;

  const lines = mounted && cart.slug === r.slug ? cart.lines : [];
  const count = cartCount(lines);
  const qtyOf = (id: string) => lines.filter((l) => l.itemId === id).reduce((n, l) => n + l.quantity, 0);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return categories.map((c) => ({ ...c, menu_items: c.menu_items.filter((i) =>
      (!s || i.name.toLowerCase().includes(s) || (i.description ?? '').toLowerCase().includes(s)) &&
      diets.every((d) => (d === 'spicy' ? i.is_spicy : i.dietary_type === d || (d === 'veg' && i.dietary_type === 'vegan')))) })).filter((c) => c.menu_items.length > 0);
  }, [categories, q, diets]);

  // highlight the category in view
  useEffect(() => {
    const obs = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id.replace('cat-', '')); }, { rootMargin: '-120px 0px -70% 0px' });
    document.querySelectorAll('[data-cat]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [filtered]);
  useEffect(() => { navRef.current?.querySelector(`[data-nav="${active}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [active]);

  function quickAdd(i: MenuItem) {   // items with no customisation are added in one tap
    cart.add({ itemId: i.id, name: i.name, image: i.image_url, basePrice: Number(i.price), quantity: 1, variant: null, addOns: [], instructions: '' });
  }
  const simple = (i: MenuItem) => i.menu_item_variants.length === 0 && i.add_on_groups.length === 0;

  // warn before leaving with items in the cart
  useEffect(() => {
    if (count === 0) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [count]);

  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-28">
      <header>
        <div className="relative h-36 w-full overflow-hidden sm:h-48 sm:rounded-b-3xl">
          {r.cover_image_url ? <Img src={r.cover_image_url} alt="" className="h-full w-full" /> : <div className="h-full w-full bg-gradient-to-br from-brand-500 to-amber-400" />}
        </div>
        <div className="-mt-9 px-4">
          <div className="card flex items-start gap-3 p-4">
            <div className="-mt-10 h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-white shadow">
              {r.logo_url ? <Img src={r.logo_url} alt={`${r.name} logo`} className="h-full w-full" /> : <div className="grid h-full w-full place-items-center bg-brand-500 text-2xl font-black text-white">{r.name[0]}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold">{r.name}</h1>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', r.is_accepting_orders ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700')}>{r.is_accepting_orders ? 'Open for orders' : 'Closed'}</span>
              </div>
              {r.description && <p className="mt-1 text-sm text-stone-600">{r.description}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                {r.opening_hours?.text && <span className="flex items-center gap-1"><Clock size={12} />{r.opening_hours.text}</span>}
                {r.address && <span className="flex items-center gap-1"><MapPin size={12} />{r.address}</span>}
                {r.phone && <a href={`tel:${r.phone}`} className="flex items-center gap-1"><Phone size={12} />{r.phone}</a>}
              </div>
            </div>
          </div>
          {table && !tableProblem ? <p className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700"><QrCode size={16} />Ordering for {table.display_name}</p> : null}
          {orderBlock && <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{orderBlock} You can still browse the menu.</p>}
        </div>
      </header>

      <div className="sticky top-0 z-30 mt-3 border-b border-stone-200 bg-stone-50/95 px-4 pb-2 pt-2 backdrop-blur">
        <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" type="search" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dishes" /></div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {DIETS.map((d) => (<button key={d.id} onClick={() => setDiets((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} aria-pressed={diets.includes(d.id)}
            className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold', diets.includes(d.id) ? 'border-brand-500 bg-brand-500 text-white' : 'border-stone-300 bg-white')}>{d.label}</button>))}
        </div>
        <div ref={navRef} className="no-scrollbar mt-2 flex gap-1 overflow-x-auto" role="tablist" aria-label="Menu categories">
          {filtered.map((c) => (<button key={c.id} data-nav={c.id} role="tab" aria-selected={active === c.id}
            onClick={() => { setActive(c.id); document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            className={cn('shrink-0 rounded-lg px-3 py-2 text-sm font-semibold', active === c.id ? 'bg-ink text-white' : 'text-stone-600')}>{c.name}</button>))}
        </div>
      </div>

      <main className="px-4">
        {filtered.length === 0 && <div className="mt-6"><Empty>{categories.length === 0 ? 'The menu is being set up. Please check back soon.' : 'No dishes match your search.'}</Empty></div>}
        {filtered.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} data-cat className="scroll-mt-44 pt-6">
            <h2 className="text-lg font-extrabold">{c.name}</h2>
            {c.description && <p className="text-sm text-stone-500">{c.description}</p>}
            <ul className="mt-3 grid gap-3">
              {c.menu_items.map((i) => {
                const n = qtyOf(i.id); const off = !i.is_available; const fromPrice = Number(i.price) + (i.menu_item_variants.length ? Math.min(...i.menu_item_variants.map((v) => Number(v.price_adjustment))) : 0);
                return (
                  <li key={i.id} className={cn('card flex gap-3 p-3', off && 'opacity-60')}>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setItem(i)} aria-label={`View ${i.name}`}>
                      <div className="flex items-center gap-2"><DietDot type={i.dietary_type} />{i.is_spicy && <Flame size={14} className="text-red-500" />}</div>
                      <h3 className="mt-1 font-bold leading-tight">{i.name}</h3>
                      <p className="mt-0.5 flex items-baseline gap-2 text-sm"><span className="font-bold">{i.menu_item_variants.length ? 'from ' : ''}{formatMoney(fromPrice, r.currency)}</span>
                        {i.original_price && Number(i.original_price) > Number(i.price) && <s className="text-xs text-stone-400">{formatMoney(Number(i.original_price), r.currency)}</s>}</p>
                      {i.description && <p className="mt-1 line-clamp-2 text-xs text-stone-500">{i.description}</p>}
                      {i.preparation_time ? <p className="mt-1 flex items-center gap-1 text-xs text-stone-400"><Clock size={11} />{i.preparation_time} min</p> : null}
                      {off && <p className="mt-1 text-xs font-bold text-red-600">Currently unavailable</p>}
                    </button>
                    <div className="relative shrink-0">
                      <Img src={i.image_url} alt={i.name} className="h-24 w-24 rounded-xl" />
                      {!off && canOrder && (
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                          {simple(i) && n > 0 ? (
                            <div className="flex items-center rounded-xl border border-brand-500 bg-white shadow">
                              <button className="grid h-9 w-9 place-items-center text-brand-600" aria-label={`Remove one ${i.name}`} onClick={() => cart.setQty(lineKey({ itemId: i.id, variant: null, addOns: [], instructions: '' }), n - 1)}><Minus size={16} /></button>
                              <span className="w-6 text-center text-sm font-bold">{n}</span>
                              <button className="grid h-9 w-9 place-items-center text-brand-600" aria-label={`Add one ${i.name}`} onClick={() => quickAdd(i)}><Plus size={16} /></button>
                            </div>
                          ) : (
                            <button onClick={() => (simple(i) ? quickAdd(i) : setItem(i))} className="flex h-9 items-center gap-1 rounded-xl border border-brand-500 bg-white px-4 text-sm font-bold text-brand-600 shadow">
                              {n > 0 ? `Add more (${n})` : 'ADD'}{!simple(i) && n === 0 && <span className="text-[10px]">+</span>}</button>
                          )}
                        </div>)}
                    </div>
                  </li>);
              })}
            </ul>
          </section>
        ))}
        <p className="mt-10 text-center text-xs text-stone-400">Prices in {r.currency}. {r.settings.tax_percent ? `Taxes (${r.settings.tax_percent}%) added at checkout.` : ''}</p>
      </main>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={() => setCartOpen(true)} className="mx-auto flex min-h-[56px] w-full max-w-3xl items-center justify-between rounded-2xl bg-brand-500 px-5 text-white shadow-xl">
            <span className="flex items-center gap-2 font-bold"><ShoppingBag size={20} />{count} item{count > 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1 font-bold">{formatMoney(subtotalOf(lines), r.currency)} · View cart <ChevronRight size={18} /></span>
          </button>
        </div>)}

      <ItemSheet item={item} currency={r.currency} canOrder={canOrder && !!item?.is_available} initial={editing} onClose={() => { setItem(null); setEditing(null); }} onAdd={(l, k) => cart.add(l, k)} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} restaurant={r} table={table && !tableProblem ? table : null} canOrder={canOrder} orderBlock={orderBlock} onlineEnabled={onlineEnabled}
        onEdit={(line: CartLine) => { const it = categories.flatMap((c) => c.menu_items).find((x) => x.id === line.itemId); if (it) { setCartOpen(false); setEditing(line); setItem(it); } }} />
    </div>
  );
}
