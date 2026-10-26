'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Download, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import type { Restaurant } from '@/lib/types';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Empty, Spinner, Toast } from './ui';

interface T { id: string; table_number: string; display_name: string; is_active: boolean }
const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

export default function TablesAdmin({ restaurant: r }: { restaurant: Restaurant; role?: string }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [tables, setTables] = useState<T[] | null>(null); const [qr, setQr] = useState<Record<string, string>>({});
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [bulk, setBulk] = useState('');
  const [toast, setToast] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [printAll, setPrintAll] = useState(false);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const urlFor = useCallback((t: T) => `${base}/menu/${r.slug}?table=${encodeURIComponent(t.table_number)}`, [base, r.slug]);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('tables').select('id, table_number, display_name, is_active').eq('restaurant_id', r.id).order('table_number');
    if (error) { setToast(error.message); return; }
    const list = (data ?? []).sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true })); setTables(list);
    const m: Record<string, string> = {}; for (const t of list) m[t.id] = await QRCode.toDataURL(urlFor(t), { width: 512, margin: 2, errorCorrectionLevel: 'M' }); setQr(m);
  }, [sb, r.id, urlFor]);
  useEffect(() => { load(); }, [load]);
  const fail = (e: { message: string } | null) => { if (e) setToast(e.message.includes('duplicate') ? 'That table code already exists.' : e.message); };

  async function add() {
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(code)) { setToast('Table code: letters, numbers, - or _ (max 20), e.g. T01.'); return; }
    const { error } = await sb.from('tables').insert({ restaurant_id: r.id, table_number: code, display_name: name.trim() || `Table ${code}` }); fail(error); setCode(''); setName(''); load();
  }
  async function addBulk() {
    const n = Math.min(100, Number(bulk) || 0); if (!n) return; const have = new Set(tables?.map((t) => t.table_number)); const rows = [];
    for (let i = 1; rows.length < n && i < 1000; i++) { const c = `T${String(i).padStart(2, '0')}`; if (!have.has(c)) rows.push({ restaurant_id: r.id, table_number: c, display_name: `Table ${i}` }); }
    const { error } = await sb.from('tables').insert(rows); fail(error); setBulk(''); load();
  }
  const rename = async (t: T) => { const n = prompt('Table name', t.display_name); if (n?.trim()) { const { error } = await sb.from('tables').update({ display_name: n.trim() }).eq('id', t.id); fail(error); load(); } };
  const toggle = async (t: T) => { const { error } = await sb.from('tables').update({ is_active: !t.is_active }).eq('id', t.id); fail(error); load(); };
  const del = async (t: T) => { if (!confirm(`Delete ${t.display_name}? Its QR code will stop working.`)) return; const { error } = await sb.from('tables').delete().eq('id', t.id);
    if (error) setToast(error.code === '23503' ? 'This table has past orders, so it cannot be deleted. Deactivate it instead.' : error.message); load(); };

  async function pdf() {
    if (!tables?.length) return; setBusy(true);
    try {
      const doc = await PDFDocument.create(); const bold = await doc.embedFont(StandardFonts.HelveticaBold); const font = await doc.embedFont(StandardFonts.Helvetica);
      const W = 595, H = 842, cols = 2, rows = 3, cw = W / cols, ch = H / rows; const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, '?');
      for (let i = 0; i < tables.length; i++) {
        if (i % (cols * rows) === 0) doc.addPage([W, H]); const page = doc.getPages()[doc.getPageCount() - 1]; const k = i % (cols * rows);
        const x0 = (k % cols) * cw, y0 = H - (Math.floor(k / cols) + 1) * ch; const t = tables[i];
        const img = await doc.embedPng(await fetch(qr[t.id]).then((x) => x.arrayBuffer())); const s = 190;
        page.drawRectangle({ x: x0 + 12, y: y0 + 12, width: cw - 24, height: ch - 24, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
        const title = clean(r.name); page.drawText(title, { x: x0 + (cw - bold.widthOfTextAtSize(title, 15)) / 2, y: y0 + ch - 42, size: 15, font: bold });
        page.drawImage(img, { x: x0 + (cw - s) / 2, y: y0 + 62, width: s, height: s });
        const tn = clean(t.display_name); page.drawText(tn, { x: x0 + (cw - bold.widthOfTextAtSize(tn, 20)) / 2, y: y0 + 36, size: 20, font: bold });
        const hint = 'Scan to view menu & order'; page.drawText(hint, { x: x0 + (cw - font.widthOfTextAtSize(hint, 10)) / 2, y: y0 + 20, size: 10, font });
      }
      save(new Blob([await doc.save() as BlobPart], { type: 'application/pdf' }), `${r.slug}-table-qr-codes.pdf`);
    } catch (e) { setToast(e instanceof Error ? e.message : 'Could not create PDF'); }
    setBusy(false);
  }
  const png = (t: T) => fetch(qr[t.id]).then((x) => x.blob()).then((b) => save(b, `${r.slug}-${t.table_number}.png`));
  const svg = async (t: T) => save(new Blob([await QRCode.toString(urlFor(t), { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })], { type: 'image/svg+xml' }), `${r.slug}-${t.table_number}.svg`);
  useEffect(() => { if (!printAll) return; const id = setTimeout(() => { window.print(); setPrintAll(false); }, 200); return () => clearTimeout(id); }, [printAll]);

  if (!tables) return <Spinner className="mx-auto mt-10 h-8 w-8 text-brand-500" />;
  return (
    <div className="mx-auto max-w-4xl">
      <Toast message={toast} onClose={() => setToast(null)} />
      <div className="print:hidden">
        <h1 className="mb-1 text-xl font-extrabold">Tables & QR codes</h1>
        <p className="mb-4 text-sm text-stone-600">Each QR code opens <code className="rounded bg-stone-100 px-1">{base}/menu/{r.slug}?table=CODE</code>. The code identifies the table; orders are validated on the server.</p>
        {!process.env.NEXT_PUBLIC_SITE_URL && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">NEXT_PUBLIC_SITE_URL is not set, so QR codes use this browser&apos;s address ({base}). Set it to your public domain before printing.</p>}
        <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" placeholder="Code, e.g. T01" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Table code" /><input className="input" placeholder="Display name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
          <button className="btn-primary" onClick={add}><Plus size={16} />Add table</button>
          <div className="flex gap-2 sm:col-span-3"><input className="input !w-40" inputMode="numeric" placeholder="Add N tables" value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Number of tables to add" /><button className="btn-ghost" onClick={addBulk}>Create T01, T02…</button>
            <span className="flex-1" /><button className="btn-ghost" disabled={busy || !tables.length} onClick={pdf}>{busy ? <Spinner className="h-4 w-4" /> : <FileText size={16} />}PDF sheet</button><button className="btn-ghost" disabled={!tables.length} onClick={() => setPrintAll(true)}><Printer size={16} />Print labels</button></div>
        </div>
        {tables.length === 0 ? <Empty>No tables yet. Add one above.</Empty> : (
          <ul className="grid gap-3 sm:grid-cols-2">{tables.map((t) => (
            <li key={t.id} className="card flex gap-3 p-3">
              {qr[t.id] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr[t.id]} alt={`QR code for ${t.display_name}`} className="h-28 w-28 shrink-0 rounded-lg border border-stone-200" /> : <div className="h-28 w-28" />}
              <div className="min-w-0 flex-1"><p className="font-bold">{t.display_name} <span className="text-xs font-normal text-stone-500">({t.table_number})</span></p>
                <p className={`text-xs font-semibold ${t.is_active ? 'text-green-700' : 'text-red-600'}`}>{t.is_active ? 'Active' : 'Inactive'}</p>
                <a className="block truncate text-xs text-brand-600" href={urlFor(t)} target="_blank" rel="noreferrer">{urlFor(t)}</a>
                <div className="mt-2 flex flex-wrap gap-1 text-xs"><button className="btn-ghost !min-h-[36px] !px-2" onClick={() => png(t)}><Download size={14} />PNG</button><button className="btn-ghost !min-h-[36px] !px-2" onClick={() => svg(t)}><Download size={14} />SVG</button>
                  <button className="btn-ghost !min-h-[36px] !px-2" onClick={() => rename(t)}>Rename</button><button className="btn-ghost !min-h-[36px] !px-2" onClick={() => toggle(t)}>{t.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button className="btn-ghost !min-h-[36px] !px-2 !text-red-600" onClick={() => del(t)} aria-label="Delete table"><Trash2 size={14} /></button></div></div></li>))}</ul>)}
      </div>
      {printAll && <div className="print-grid hidden print:grid print:grid-cols-2 print:gap-4">{tables.map((t) => (
        <div key={t.id} className="break-inside-avoid rounded-xl border border-stone-400 p-4 text-center"><p className="text-lg font-bold">{r.name}</p>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qr[t.id]} alt="" className="mx-auto h-48 w-48" /><p className="text-2xl font-extrabold">{t.display_name}</p><p className="text-xs">Scan to view menu &amp; order</p></div>))}</div>}
    </div>
  );
}
