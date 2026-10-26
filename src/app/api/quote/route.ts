import { NextResponse } from 'next/server';
import { quoteSchema, mapDbError } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/ratelimit';
import { clientIp, fail, noStore } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Authoritative price quote (re-validates availability + promo) used by the checkout screen. */
export async function POST(req: Request) {
  if (!rateLimit(`quote:${clientIp(req)}`, 60, 60_000)) return fail(429, 'Too many requests.', 'RATE_LIMITED');
  let body: unknown;
  try { body = await req.json(); } catch { return fail(400, 'Invalid request.'); }
  const p = quoteSchema.safeParse(body);
  if (!p.success) return fail(400, p.error.issues[0]?.message ?? 'Invalid request.', 'VALIDATION');
  const items = p.data.items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity, variant_id: i.variant_id ?? null,
    add_on_option_ids: i.add_on_option_ids, special_instructions: i.special_instructions }));
  const { data, error } = await supabaseAdmin().rpc('quote_order', { p_slug: p.data.slug, p_items: items, p_promo: p.data.promoCode || null });
  if (error || !data) { const m = mapDbError(error?.message ?? ''); return fail(m.status, m.message, m.code); }
  return NextResponse.json({ subtotal: data.subtotal, discount: data.discount, tax: data.tax, service: data.service_charge, total: data.total, promoCode: data.promo_code }, { headers: noStore });
}
