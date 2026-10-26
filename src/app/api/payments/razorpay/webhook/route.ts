import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyRazorpaySignature } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * The ONLY place an online payment becomes "paid". Configure in Razorpay Dashboard -> Webhooks with events
 * payment.captured, order.paid, payment.failed and the secret in RAZORPAY_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  const raw = await req.text();                               // signature is over the exact raw body
  if (!verifyRazorpaySignature(raw, req.headers.get('x-razorpay-signature'), secret)) return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  const evt = JSON.parse(raw);
  const pay = evt?.payload?.payment?.entity;
  const rpOrderId: string | undefined = pay?.order_id ?? evt?.payload?.order?.entity?.id;
  if (!rpOrderId) return NextResponse.json({ ok: true });
  const db = supabaseAdmin();
  const { data: p } = await db.from('payments').select('id, order_id, amount, status').eq('provider', 'razorpay').eq('provider_order_id', rpOrderId).maybeSingle();
  if (!p) return NextResponse.json({ ok: true });             // unknown order: ack so Razorpay stops retrying

  if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
    const paidPaise = pay?.amount ?? evt?.payload?.order?.entity?.amount_paid;
    if (Math.round(Number(p.amount) * 100) !== paidPaise) { console.error('amount mismatch', rpOrderId, paidPaise); return NextResponse.json({ error: 'amount mismatch' }, { status: 400 }); }
    await db.from('payments').update({ status: 'paid', provider_payment_id: pay?.id ?? null }).eq('id', p.id);
    await db.from('orders').update({ payment_status: 'paid' }).eq('id', p.order_id);
  } else if (evt.event === 'payment.failed' && p.status !== 'paid') {
    await db.from('payments').update({ status: 'failed' }).eq('id', p.id);
    await db.from('orders').update({ payment_status: 'failed' }).eq('id', p.order_id).neq('payment_status', 'paid');
  }
  return NextResponse.json({ ok: true });
}
