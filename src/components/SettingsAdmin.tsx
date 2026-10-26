'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { Restaurant, RestaurantSettings } from '@/lib/types';
import type { Role } from '@/lib/staff';
import { supabaseBrowser } from '@/lib/supabase/client';
import { uploadImage } from '@/lib/upload';
import { rpcMessage } from '@/lib/rpc';
import { Img, Spinner, Toast } from './ui';

interface Promo { id: string; code: string; discount_type: 'percent' | 'fixed'; discount_value: number; minimum_order_value: number; expires_at: string | null; usage_limit: number | null; usage_count: number; is_active: boolean }
interface Member { user_id: string; email: string; full_name: string | null; role: string }

export default function SettingsAdmin({ restaurant, role }: { restaurant: Restaurant; role: Role }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [r, setR] = useState({ name: restaurant.name, description: restaurant.description ?? '', address: restaurant.address ?? '', phone: restaurant.phone ?? '', currency: restaurant.currency, timezone: restaurant.timezone,
    hours: restaurant.opening_hours?.text ?? '', logo_url: restaurant.logo_url, cover_image_url: restaurant.cover_image_url, is_accepting_orders: restaurant.is_accepting_orders });
  const [s, setS] = useState<RestaurantSettings>(restaurant.settings);
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState<{ m: string; k: 'ok' | 'error' } | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]); const [members, setMembers] = useState<Member[]>([]);
  const [np, setNp] = useState({ code: '', type: 'percent', value: '', min: '', limit: '', expires: '' }); const [inv, setInv] = useState({ email: '', role: 'staff' });
  const ok = (m: string) => setToast({ m, k: 'ok' }); const bad = (m: string) => setToast({ m, k: 'error' });

  const loadAux = useCallback(async () => {
    const [p, m] = await Promise.all([sb.from('promotions').select('*').eq('restaurant_id', restaurant.id).order('code'), sb.rpc('list_members', { p_restaurant: restaurant.id })]);
    setPromos((p.data ?? []) as Promo[]); setMembers((m.data ?? []) as Member[]);
  }, [sb, restaurant.id]);
  useEffect(() => { loadAux(); }, [loadAux]);

  async function saveAll() {
    if (!r.name.trim()) return bad('Restaurant name is required.');
    setBusy(true);
    const { error } = await sb.from('restaurants').update({ name: r.name.trim(), description: r.description || null, address: r.address || null, phone: r.phone || null, currency: r.currency.toUpperCase(), timezone: r.timezone,
      opening_hours: { text: r.hours }, logo_url: r.logo_url, cover_image_url: r.cover_image_url, is_accepting_orders: r.is_accepting_orders, settings: s }).eq('id', restaurant.id);
    setBusy(false); error ? bad(error.message) : ok('Settings saved.');
  }
  async function up(kind: 'logo_url' | 'cover_image_url', f?: File | null) { if (!f) return; try { setR({ ...r, [kind]: await uploadImage(restaurant.id, f) }); } catch (e) { bad(e instanceof Error ? e.message : 'Upload failed'); } }
  const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));

  async function addPromo() {
    if (!np.code.trim() || !(Number(np.value) > 0)) return bad('Enter a code and a discount value.'); if (np.type === 'percent' && Number(np.value) > 100) return bad('Percent discount cannot exceed 100.');
    const { error } = await sb.from('promotions').insert({ restaurant_id: restaurant.id, code: np.code.trim().toUpperCase(), discount_type: np.type, discount_value: Number(np.value), minimum_order_value: num(np.min), usage_limit: np.limit ? Number(np.limit) : null, expires_at: np.expires ? new Date(`${np.expires}T23:59:59`).toISOString() : null });
    error ? bad(error.message.includes('duplicate') ? 'That code already exists.' : error.message) : (setNp({ code: '', type: 'percent', value: '', min: '', limit: '', expires: '' }), loadAux());
  }
  const togglePromo = async (p: Promo) => { await sb.from('promotions').update({ is_active: !p.is_active }).eq('id', p.id); loadAux(); };
  const delPromo = async (p: Promo) => { if (confirm(`Delete ${p.code}?`)) { await sb.from('promotions').delete().eq('id', p.id); loadAux(); } };
  async function invite() { const { error } = await sb.rpc('add_member', { p_restaurant: restaurant.id, p_email: inv.email, p_role: inv.role }); error ? bad(rpcMessage(error.message)) : (setInv({ email: '', role: 'staff' }), loadAux(), ok('Team member added.')); }
  async function removeMember(m: Member) { if (!confirm(`Remove ${m.email}?`)) return; const { error } = await sb.rpc('remove_member', { p_restaurant: restaurant.id, p_user: m.user_id }); error ? bad(rpcMessage(error.message)) : loadAux(); }

  const card = 'card grid gap-3 p-4'; const chk = (label: string, v: boolean, on: (b: boolean) => void) => <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-5 w-5 accent-orange-600" checked={v} onChange={(e) => on(e.target.checked)} />{label}</label>;
  return (
    <div className="mx-auto grid max-w-3xl gap-4"><Toast message={toast?.m ?? null} kind={toast?.k} onClose={() => setToast(null)} />
      <div className="flex items-center justify-between"><h1 className="text-xl font-extrabold">Settings</h1><button className="btn-primary" disabled={busy} onClick={saveAll}>{busy && <Spinner className="h-4 w-4" />}Save changes</button></div>

      <section className={card}><h2 className="font-bold">Ordering</h2>
        {chk('Accepting orders (turn off to temporarily close ordering; the menu stays visible)', r.is_accepting_orders, (b) => setR({ ...r, is_accepting_orders: b }))}
        <div><label className="label">Message shown when closed</label><input className="input" value={s.closed_message} onChange={(e) => setS({ ...s, closed_message: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div><label className="label">Tax %</label><input className="input" inputMode="decimal" value={s.tax_percent} onChange={(e) => setS({ ...s, tax_percent: num(e.target.value) })} /></div>
          <div><label className="label">Service charge %</label><input className="input" inputMode="decimal" value={s.service_charge_percent} onChange={(e) => setS({ ...s, service_charge_percent: num(e.target.value) })} /></div>
          <div><label className="label">Minimum order</label><input className="input" inputMode="decimal" value={s.min_order_amount} onChange={(e) => setS({ ...s, min_order_amount: num(e.target.value) })} /></div>
          <div><label className="label">Prep estimate (min)</label><input className="input" inputMode="numeric" value={s.prep_time_minutes} onChange={(e) => setS({ ...s, prep_time_minutes: num(e.target.value) })} /></div></div>
        <div><label className="label">Order workflow ends at</label><select className="input" value={s.workflow_end} onChange={(e) => setS({ ...s, workflow_end: e.target.value as RestaurantSettings['workflow_end'] })}><option value="ready">Ready (self-service / counter pickup)</option><option value="served">Served</option><option value="completed">Completed (Ready → Served → Completed)</option></select></div>
        <div className="grid gap-1">{chk('Require customer name', s.require_name, (b) => setS({ ...s, require_name: b }))}{chk('Require customer phone', s.require_phone, (b) => setS({ ...s, require_phone: b }))}</div></section>

      <section className={card}><h2 className="font-bold">Payment options</h2>
        {chk('Pay at counter', s.payments.counter, (b) => setS({ ...s, payments: { ...s.payments, counter: b } }))}{chk('Pay at table', s.payments.table, (b) => setS({ ...s, payments: { ...s.payments, table: b } }))}
        {chk('Online payment (Razorpay) - also needs server keys configured', s.payments.online, (b) => setS({ ...s, payments: { ...s.payments, online: b } }))}</section>

      <section className={card}><h2 className="font-bold">Restaurant profile</h2>
        <div className="flex flex-wrap gap-4">{(['logo_url', 'cover_image_url'] as const).map((k) => <div key={k} className="flex items-center gap-3"><Img src={r[k]} alt="" className="h-16 w-16 rounded-xl" /><label className="btn-ghost cursor-pointer"><ImagePlus size={16} />{k === 'logo_url' ? 'Logo' : 'Cover image'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => up(k, e.target.files?.[0])} /></label></div>)}</div>
        <div><label className="label">Name</label><input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} maxLength={120} /></div>
        <div><label className="label">Description</label><textarea className="input min-h-[64px] py-2" value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><label className="label">Address</label><input className="input" value={r.address} onChange={(e) => setR({ ...r, address: e.target.value })} /></div><div><label className="label">Phone</label><input className="input" value={r.phone} onChange={(e) => setR({ ...r, phone: e.target.value })} /></div>
          <div><label className="label">Opening hours</label><input className="input" placeholder="Mon-Sun 10:00 - 23:00" value={r.hours} onChange={(e) => setR({ ...r, hours: e.target.value })} /></div><div><label className="label">Currency (ISO code)</label><input className="input" value={r.currency} maxLength={3} onChange={(e) => setR({ ...r, currency: e.target.value.toUpperCase() })} /></div>
          <div><label className="label">Time zone</label><input className="input" value={r.timezone} onChange={(e) => setR({ ...r, timezone: e.target.value })} /></div></div></section>

      <section className={card}><h2 className="font-bold">Promo codes</h2>
        <ul className="divide-y divide-stone-100 text-sm">{promos.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 py-2"><b>{p.code}</b><span>{p.discount_type === 'percent' ? `${p.discount_value}% off` : `${p.discount_value} off`}</span><span className="text-xs text-stone-500">min {p.minimum_order_value} · used {p.usage_count}{p.usage_limit ? `/${p.usage_limit}` : ''}{p.expires_at ? ` · until ${new Date(p.expires_at).toLocaleDateString()}` : ''}</span>
          <span className="flex-1" /><label className="flex items-center gap-1 text-xs"><input type="checkbox" className="h-5 w-5" checked={p.is_active} onChange={() => togglePromo(p)} />Active</label><button aria-label="Delete promo" className="text-red-600" onClick={() => delPromo(p)}><Trash2 size={16} /></button></li>)}</ul>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6"><input className="input uppercase" placeholder="CODE" value={np.code} onChange={(e) => setNp({ ...np, code: e.target.value })} aria-label="Promo code" /><select className="input" value={np.type} onChange={(e) => setNp({ ...np, type: e.target.value })} aria-label="Type"><option value="percent">%</option><option value="fixed">Fixed</option></select>
          <input className="input" placeholder="Value" inputMode="decimal" value={np.value} onChange={(e) => setNp({ ...np, value: e.target.value })} aria-label="Value" /><input className="input" placeholder="Min order" inputMode="decimal" value={np.min} onChange={(e) => setNp({ ...np, min: e.target.value })} aria-label="Minimum order" />
          <input className="input" placeholder="Max uses" inputMode="numeric" value={np.limit} onChange={(e) => setNp({ ...np, limit: e.target.value })} aria-label="Usage limit" /><input className="input" type="date" value={np.expires} onChange={(e) => setNp({ ...np, expires: e.target.value })} aria-label="Expires" /></div>
        <button className="btn-ghost" onClick={addPromo}>Add promo code</button></section>

      <section className={card}><h2 className="font-bold">Team</h2>
        <ul className="divide-y divide-stone-100 text-sm">{members.map((m) => <li key={m.user_id} className="flex items-center gap-2 py-2"><span className="min-w-0 flex-1 truncate">{m.full_name || m.email} <span className="text-xs text-stone-500">{m.email}</span></span><span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold capitalize">{m.role === 'staff' ? 'kitchen/counter' : m.role}</span>{role === 'owner' && m.role !== 'owner' && <button aria-label="Remove" className="text-red-600" onClick={() => removeMember(m)}><Trash2 size={16} /></button>}</li>)}</ul>
        {role === 'owner' ? <div className="flex flex-wrap gap-2"><input className="input !w-auto min-w-[200px] flex-1" type="email" placeholder="Email of an existing account" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} aria-label="Email" /><select className="input !w-auto" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })} aria-label="Role"><option value="staff">Kitchen / counter</option><option value="manager">Manager</option></select><button className="btn-ghost" onClick={invite}>Add</button></div>
          : <p className="text-xs text-stone-500">Only the owner can add or remove team members. The person must sign up at /signup first.</p>}</section>
    </div>
  );
}
