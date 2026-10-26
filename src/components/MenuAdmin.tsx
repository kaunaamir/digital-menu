'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Category, MenuItem, Restaurant } from '@/lib/types';
import { supabaseBrowser } from '@/lib/supabase/client';
import { uploadImage } from '@/lib/upload';
import { formatMoney } from '@/lib/money';
import { DietDot, Empty, Img, Sheet, Spinner, Toast, cn } from './ui';

interface Draft {
  id?: string; category_id: string; name: string; description: string; image_url: string | null; price: string; original_price: string; dietary_type: string; is_spicy: boolean;
  allergens: string; preparation_time: string; is_available: boolean;
  variants: { name: string; adj: string }[];
  groups: { name: string; required: boolean; min: string; max: string; options: { name: string; price: string; available: boolean }[] }[];
}
const blank = (category_id: string): Draft => ({ category_id, name: '', description: '', image_url: null, price: '', original_price: '', dietary_type: 'veg', is_spicy: false, allergens: '', preparation_time: '', is_available: true, variants: [], groups: [] });
const fromItem = (i: MenuItem): Draft => ({ id: i.id, category_id: i.category_id, name: i.name, description: i.description ?? '', image_url: i.image_url, price: String(i.price), original_price: i.original_price ? String(i.original_price) : '',
  dietary_type: i.dietary_type, is_spicy: i.is_spicy, allergens: i.allergens.join(', '), preparation_time: i.preparation_time ? String(i.preparation_time) : '', is_available: i.is_available,
  variants: i.menu_item_variants.map((v) => ({ name: v.name, adj: String(v.price_adjustment) })),
  groups: [...i.add_on_groups].sort((a, b) => a.display_order - b.display_order).map((g) => ({ name: g.name, required: g.is_required, min: String(g.minimum_selections), max: String(g.maximum_selections),
    options: [...g.add_on_options].sort((a, b) => a.display_order - b.display_order).map((o) => ({ name: o.name, price: String(o.price), available: o.is_available })) })) });

export default function MenuAdmin({ restaurant: r }: { restaurant: Restaurant; role?: string }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [cats, setCats] = useState<Category[] | null>(null); const [toast, setToast] = useState<{ m: string; k: 'error' | 'ok' } | null>(null);
  const [newCat, setNewCat] = useState(''); const [draft, setDraft] = useState<Draft | null>(null);
  const err = (m: string) => setToast({ m, k: 'error' });

  const load = useCallback(async () => {
    const { data, error } = await sb.from('categories').select('*, menu_items(*, menu_item_variants(*), add_on_groups(*, add_on_options(*)))').eq('restaurant_id', r.id).order('display_order');
    if (error) { err(error.message); return; }
    setCats(((data ?? []) as unknown as Category[]).map((c) => ({ ...c, menu_items: [...c.menu_items].sort((a, b) => a.display_order - b.display_order) })));
  }, [sb, r.id]);
  useEffect(() => { load(); }, [load]);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) { const { error } = await p; if (error) err(error.message); await load(); }
  const addCat = async () => { if (!newCat.trim()) return; await run(sb.from('categories').insert({ restaurant_id: r.id, name: newCat.trim(), display_order: cats?.length ?? 0 })); setNewCat(''); };
  const renameCat = (c: Category) => { const n = prompt('Category name', c.name); if (n?.trim()) run(sb.from('categories').update({ name: n.trim() }).eq('id', c.id)); };
  const delCat = (c: Category) => confirm(`Delete "${c.name}" and its ${c.menu_items.length} item(s)? Past orders are not affected.`) && run(sb.from('categories').delete().eq('id', c.id));
  async function move<T extends { id: string }>(list: T[], idx: number, dir: -1 | 1, table: 'categories' | 'menu_items') {
    const j = idx + dir; if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[idx], next[j]] = [next[j], next[idx]];
    await Promise.all(next.map((x, n) => sb.from(table).update({ display_order: n }).eq('id', x.id))); await load();
  }
  const toggleAvail = (i: MenuItem) => run(sb.from('menu_items').update({ is_available: !i.is_available }).eq('id', i.id));
  const delItem = (i: MenuItem) => confirm(`Delete "${i.name}"? Past orders keep their own copy.`) && run(sb.from('menu_items').delete().eq('id', i.id));

  async function save(d: Draft): Promise<string | null> {
    const price = Number(d.price); if (!d.name.trim()) return 'Name is required.'; if (!(price >= 0) || d.price === '') return 'Enter a valid price.';
    if (d.original_price && Number(d.original_price) < price) return 'Original price should be higher than the selling price.';
    for (const g of d.groups) { if (!g.name.trim() || g.options.length === 0 || g.options.some((o) => !o.name.trim())) return 'Each add-on group needs a name and named options.'; if (Number(g.max) < Math.max(1, Number(g.min))) return `"${g.name}": maximum must be at least the minimum.`; }
    if (d.variants.some((v) => !v.name.trim())) return 'Every variant needs a name.';
    const cat = cats?.find((c) => c.id === d.category_id);
    const row = { restaurant_id: r.id, category_id: d.category_id, name: d.name.trim(), description: d.description.trim() || null, image_url: d.image_url, price, original_price: d.original_price ? Number(d.original_price) : null,
      dietary_type: d.dietary_type, is_spicy: d.is_spicy, allergens: d.allergens.split(',').map((s) => s.trim()).filter(Boolean), preparation_time: d.preparation_time ? Number(d.preparation_time) : null, is_available: d.is_available };
    let id = d.id;
    if (id) { const { error } = await sb.from('menu_items').update(row).eq('id', id); if (error) return error.message; }
    else { const { data, error } = await sb.from('menu_items').insert({ ...row, display_order: cat?.menu_items.length ?? 0 }).select('id').single(); if (error) return error.message; id = data.id; }
    await sb.from('menu_item_variants').delete().eq('menu_item_id', id!); await sb.from('add_on_groups').delete().eq('menu_item_id', id!);
    if (d.variants.length) { const { error } = await sb.from('menu_item_variants').insert(d.variants.map((v, n) => ({ menu_item_id: id, name: v.name.trim(), price_adjustment: Number(v.adj) || 0, display_order: n }))); if (error) return error.message; }
    for (const [n, g] of d.groups.entries()) {
      const { data: gr, error } = await sb.from('add_on_groups').insert({ menu_item_id: id, name: g.name.trim(), is_required: g.required, minimum_selections: Math.max(Number(g.min) || 0, g.required ? 1 : 0), maximum_selections: Math.max(Number(g.max) || 1, 1), display_order: n }).select('id').single();
      if (error) return error.message;
      const { error: e2 } = await sb.from('add_on_options').insert(g.options.map((o, k) => ({ add_on_group_id: gr.id, name: o.name.trim(), price: Number(o.price) || 0, is_available: o.available, display_order: k }))); if (e2) return e2.message;
    }
    await load(); return null;
  }

  if (!cats) return <Spinner className="mx-auto mt-10 h-8 w-8 text-brand-500" />;
  return (
    <div className="mx-auto max-w-4xl">
      <Toast message={toast?.m ?? null} kind={toast?.k} onClose={() => setToast(null)} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-extrabold">Menu</h1>
        <a className="text-sm font-semibold text-brand-600" href={`/menu/${r.slug}`} target="_blank" rel="noreferrer">View customer menu ↗</a></div>
      <form className="mb-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); addCat(); }}><input className="input" placeholder="New category (e.g. Starters)" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={80} aria-label="New category name" /><button className="btn-primary shrink-0"><Plus size={16} />Add category</button></form>
      {cats.length === 0 && <Empty>Create your first category, then add dishes to it.</Empty>}
      <div className="grid gap-6">
        {cats.map((c, ci) => (
          <section key={c.id} className="card p-3">
            <div className="flex flex-wrap items-center gap-1">
              <h2 className={cn('mr-auto text-lg font-extrabold', !c.is_active && 'text-stone-400 line-through')}>{c.name}</h2>
              <IconBtn label="Move up" onClick={() => move(cats, ci, -1, 'categories')}><ArrowUp size={16} /></IconBtn><IconBtn label="Move down" onClick={() => move(cats, ci, 1, 'categories')}><ArrowDown size={16} /></IconBtn>
              <IconBtn label={c.is_active ? 'Hide category' : 'Show category'} onClick={() => run(sb.from('categories').update({ is_active: !c.is_active }).eq('id', c.id))}>{c.is_active ? <Eye size={16} /> : <EyeOff size={16} />}</IconBtn>
              <IconBtn label="Rename" onClick={() => renameCat(c)}><Pencil size={16} /></IconBtn><IconBtn label="Delete category" onClick={() => delCat(c)} danger><Trash2 size={16} /></IconBtn>
              <button className="btn-ghost !min-h-[40px]" onClick={() => setDraft(blank(c.id))}><Plus size={16} />Item</button>
            </div>
            <ul className="mt-2 divide-y divide-stone-100">
              {c.menu_items.map((i, ii) => (
                <li key={i.id} className="flex items-center gap-3 py-2">
                  <Img src={i.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1"><p className="flex items-center gap-2 font-semibold"><DietDot type={i.dietary_type} /><span className="truncate">{i.name}</span></p><p className="text-xs text-stone-500">{formatMoney(i.price, r.currency)}{i.menu_item_variants.length ? ` · ${i.menu_item_variants.length} variants` : ''}{i.add_on_groups.length ? ` · ${i.add_on_groups.length} add-on groups` : ''}</p></div>
                  <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold"><input type="checkbox" className="h-5 w-5 accent-green-600" checked={i.is_available} onChange={() => toggleAvail(i)} />{i.is_available ? 'Available' : 'Sold out'}</label>
                  <IconBtn label="Move up" onClick={() => move(c.menu_items, ii, -1, 'menu_items')}><ArrowUp size={16} /></IconBtn><IconBtn label="Move down" onClick={() => move(c.menu_items, ii, 1, 'menu_items')}><ArrowDown size={16} /></IconBtn>
                  <IconBtn label="Edit item" onClick={() => setDraft(fromItem(i))}><Pencil size={16} /></IconBtn><IconBtn label="Delete item" onClick={() => delItem(i)} danger><Trash2 size={16} /></IconBtn>
                </li>))}
              {c.menu_items.length === 0 && <li className="py-4 text-center text-sm text-stone-400">No items yet.</li>}
            </ul>
          </section>))}
      </div>
      {draft && <ItemForm key={draft.id ?? 'new'} draft={draft} cats={cats} restaurantId={r.id} onClose={() => setDraft(null)} onSave={save} />}
    </div>
  );
}
const IconBtn = ({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) => <button type="button" aria-label={label} title={label} onClick={onClick} className={cn('grid h-10 w-10 place-items-center rounded-lg hover:bg-stone-100', danger ? 'text-red-600' : 'text-stone-500')}>{children}</button>;

function ItemForm({ draft, cats, restaurantId, onClose, onSave }: { draft: Draft; cats: Category[]; restaurantId: string; onClose: () => void; onSave: (d: Draft) => Promise<string | null> }) {
  const [d, setD] = useState(draft); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  async function pick(file?: File | null) { if (!file) return; setBusy(true); try { set({ image_url: await uploadImage(restaurantId, file) }); } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); } setBusy(false); }
  async function submit() { setBusy(true); setErr(null); const e = await onSave(d); setBusy(false); if (e) setErr(e); else onClose(); }
  const upGroup = (i: number, p: Partial<Draft['groups'][0]>) => set({ groups: d.groups.map((g, k) => (k === i ? { ...g, ...p } : g)) });
  return (
    <Sheet open onClose={onClose} wide title={d.id ? 'Edit item' : 'New item'} footer={<div>{err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}<button className="btn-primary w-full" disabled={busy} onClick={submit}>{busy && <Spinner className="h-4 w-4" />}Save item</button></div>}>
      <div className="grid gap-4">
        <div className="flex items-center gap-3"><Img src={d.image_url} alt="" className="h-20 w-20 rounded-xl" />
          <label className="btn-ghost cursor-pointer"><ImagePlus size={16} />Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} /></label>
          {d.image_url && <button className="text-sm text-red-600" onClick={() => set({ image_url: null })}>Remove</button>}</div>
        <div><label className="label">Name</label><input className="input" value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} /></div>
        <div><label className="label">Description</label><textarea className="input min-h-[64px] py-2" value={d.description} onChange={(e) => set({ description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label">Price</label><input className="input" inputMode="decimal" value={d.price} onChange={(e) => set({ price: e.target.value })} /></div>
          <div><label className="label">Original price (strike-through)</label><input className="input" inputMode="decimal" value={d.original_price} onChange={(e) => set({ original_price: e.target.value })} /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label">Category</label><select className="input" value={d.category_id} onChange={(e) => set({ category_id: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label">Type</label><select className="input" value={d.dietary_type} onChange={(e) => set({ dietary_type: e.target.value })}><option value="veg">Vegetarian</option><option value="non_veg">Non-vegetarian</option><option value="vegan">Vegan</option><option value="egg">Contains egg</option></select></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label">Allergens (comma separated)</label><input className="input" value={d.allergens} onChange={(e) => set({ allergens: e.target.value })} placeholder="nuts, dairy" /></div>
          <div><label className="label">Prep time (minutes)</label><input className="input" inputMode="numeric" value={d.preparation_time} onChange={(e) => set({ preparation_time: e.target.value })} /></div></div>
        <div className="flex gap-6 text-sm"><label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={d.is_spicy} onChange={(e) => set({ is_spicy: e.target.checked })} />Spicy</label><label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={d.is_available} onChange={(e) => set({ is_available: e.target.checked })} />Available</label></div>

        <fieldset className="rounded-xl border border-stone-200 p-3"><legend className="px-1 text-sm font-bold">Variants (size, portion, crust…)</legend>
          <p className="mb-2 text-xs text-stone-500">If you add variants, customers must pick one. The price adjustment is added to the base price.</p>
          {d.variants.map((v, i) => (<div key={i} className="mb-2 flex gap-2"><input className="input" placeholder="Name (e.g. Large)" value={v.name} onChange={(e) => set({ variants: d.variants.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
            <input className="input !w-28" inputMode="decimal" placeholder="+ price" value={v.adj} onChange={(e) => set({ variants: d.variants.map((x, k) => (k === i ? { ...x, adj: e.target.value } : x)) })} />
            <IconBtn label="Remove variant" danger onClick={() => set({ variants: d.variants.filter((_, k) => k !== i) })}><Trash2 size={16} /></IconBtn></div>))}
          <button className="btn-ghost !min-h-[40px]" onClick={() => set({ variants: [...d.variants, { name: '', adj: '0' }] })}><Plus size={16} />Add variant</button></fieldset>

        <fieldset className="rounded-xl border border-stone-200 p-3"><legend className="px-1 text-sm font-bold">Add-on groups (toppings, extras, spice level…)</legend>
          {d.groups.map((g, i) => (<div key={i} className="mb-3 rounded-xl bg-stone-50 p-3">
            <div className="flex gap-2"><input className="input" placeholder="Group name (e.g. Extra toppings)" value={g.name} onChange={(e) => upGroup(i, { name: e.target.value })} /><IconBtn label="Remove group" danger onClick={() => set({ groups: d.groups.filter((_, k) => k !== i) })}><Trash2 size={16} /></IconBtn></div>
            <div className="my-2 flex flex-wrap items-center gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={g.required} onChange={(e) => upGroup(i, { required: e.target.checked })} />Required</label>
              <label className="flex items-center gap-1">Min<input className="input !w-16" inputMode="numeric" value={g.min} onChange={(e) => upGroup(i, { min: e.target.value })} /></label><label className="flex items-center gap-1">Max<input className="input !w-16" inputMode="numeric" value={g.max} onChange={(e) => upGroup(i, { max: e.target.value })} /></label></div>
            {g.options.map((o, k) => (<div key={k} className="mb-2 flex items-center gap-2"><input className="input" placeholder="Option" value={o.name} onChange={(e) => upGroup(i, { options: g.options.map((x, n) => (n === k ? { ...x, name: e.target.value } : x)) })} />
              <input className="input !w-24" inputMode="decimal" placeholder="Price" value={o.price} onChange={(e) => upGroup(i, { options: g.options.map((x, n) => (n === k ? { ...x, price: e.target.value } : x)) })} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="h-5 w-5" checked={o.available} onChange={(e) => upGroup(i, { options: g.options.map((x, n) => (n === k ? { ...x, available: e.target.checked } : x)) })} />On</label>
              <IconBtn label="Remove option" danger onClick={() => upGroup(i, { options: g.options.filter((_, n) => n !== k) })}><Trash2 size={14} /></IconBtn></div>))}
            <button className="text-sm font-semibold text-brand-600" onClick={() => upGroup(i, { options: [...g.options, { name: '', price: '0', available: true }] })}>+ Add option</button></div>))}
          <button className="btn-ghost !min-h-[40px]" onClick={() => set({ groups: [...d.groups, { name: '', required: false, min: '0', max: '1', options: [{ name: '', price: '0', available: true }] }] })}><Plus size={16} />Add add-on group</button></fieldset>
      </div>
    </Sheet>
  );
}
