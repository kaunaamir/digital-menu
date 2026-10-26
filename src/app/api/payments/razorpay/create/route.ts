import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sha256 } from '@/lib/security';
import { rateLimit } from '@/lib/ratelimit';
import { clientIp, fail, noStore } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Creates a Razorpay order for an existing, unpaid online order. Amount always comes from the DB, never the client. */
export async function POST(req: Request) {
  const keyId = process.env.RAZORPAY_KEY_ID, keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return fail(503, 'Online payment is not configured.', 'ONLINE_NOT_CONFIGURED');
  if (!rateLimit(`pay:${clientIp(req)}`, 10, 60_000)) return fail(429, 'Too many requests.', 'RATE_LIMITED');
  const p = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(400, 'Invalid request.');
  const db = supabaseAdmin();
  const { data: o } = await db.from('orders').select('id, total_amount, payment_method, payment_status, status, order_number, restaurants(currency)')
    .eq('tracking_token_hash', sha256(p.data.token)).maybeSingle();
  if (!o) return fail(404, 'Order not found.');
  if (o.payment_method !== 'online' || o.payment_status === 'paid') return fail(409, 'This order does not need payment.');
  if (o.status === 'rejected' || o.status === 'cancelled') return fail(409, 'This order was cancelled.');
  const currency = (o as any).restaurants?.currency ?? 'INR';
  const amount = Math.round(Number(o.total_amount) * 100);
  const rp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') },
    body: JSON.stringify({ amount, currency, receipt: `ord_${o.id}`.slice(0, 40), notes: { order_id: o.id } }),
  });
  if (!rp.ok) { console.error('razorpay order failed', rp.status, await rp.text()); return fail(502, 'Payment provider error. Please try again.'); }
  const rpo = await rp.json();
  const { error } = await db.from('payments').insert({ order_id: o.id, provider: 'razorpay', provider_order_id: rpo.id, amount: o.total_amount, status: 'pending' });
  if (error) { console.error(error); return fail(500, 'Could not start payment.'); }
  return NextResponse.json({ keyId, razorpayOrderId: rpo.id, amount, currency, orderNumber: o.order_number }, { headers: noStore });
}
