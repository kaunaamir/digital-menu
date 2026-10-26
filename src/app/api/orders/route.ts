import { NextResponse } from 'next/server';
import { placeOrderSchema, mapDbError } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sha256 } from '@/lib/security';
import { rateLimit } from '@/lib/ratelimit';
import { clientIp, fail, noStore } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`order:${ip}`, 10, 60_000)) return fail(429, 'Too many requests. Please wait a minute and try again.', 'RATE_LIMITED');
  let body: unknown;
  try { body = await req.json(); } catch { return fail(400, 'Invalid request.', 'BAD_JSON'); }
  const parsed = placeOrderSchema.safeParse(body);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid order.', 'VALIDATION');
  const o = parsed.data;
  if (o.paymentMethod === 'online' && !process.env.RAZORPAY_KEY_ID) return fail(400, 'Online payment is not available.', 'ONLINE_NOT_CONFIGURED');

  // Only IDs/quantities/selections are forwarded. Prices are looked up inside the database function.
  const items = o.items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity, variant_id: i.variant_id ?? null,
    add_on_option_ids: i.add_on_option_ids, special_instructions: i.special_instructions }));
  const { data, error } = await supabaseAdmin().rpc('place_order', {
    p_slug: o.slug, p_table: o.table, p_items: items, p_customer_name: o.customerName, p_customer_phone: o.customerPhone,
    p_payment_method: o.paymentMethod, p_notes: o.notes, p_promo: o.promoCode || null,
    p_idempotency_key: o.idempotencyKey, p_token_hash: sha256(o.trackingToken),
  });
  if (error || !data) {
    const m = mapDbError(error?.message ?? '');
    if (m.status === 500) console.error('place_order failed', error);
    return fail(m.status, m.message, m.code);
  }
  // Confirmation is only returned after the DB confirmed the insert.
  return NextResponse.json({ ok: true, orderNumber: data.order_number, status: data.status, paymentStatus: data.payment_status, total: data.total }, { headers: noStore });
}
