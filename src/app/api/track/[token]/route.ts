import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sha256 } from '@/lib/security';
import { rateLimit } from '@/lib/ratelimit';
import { clientIp, fail, noStore } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Customer order tracking. The unguessable token (256-bit, only its hash is stored) is the sole credential. Read-only. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(params.token)) return fail(404, 'Order not found.', 'NOT_FOUND');
  if (!rateLimit(`track:${clientIp(req)}`, 120, 60_000)) return fail(429, 'Too many requests.', 'RATE_LIMITED');
  const { data, error } = await supabaseAdmin().from('orders')
    .select(`order_number, status, status_reason, payment_method, payment_status, subtotal, tax_amount, service_charge, discount_amount, total_amount,
      created_at, updated_at, tables(display_name),
      restaurants(name, slug, currency, settings),
      order_items(item_name_snapshot, quantity, line_total, selected_variant_snapshot, selected_add_ons_snapshot, special_instructions),
      order_status_history(new_status, created_at)`)
    .eq('tracking_token_hash', sha256(params.token)).maybeSingle();
  if (error) { console.error('track failed', error); return fail(500, 'Could not load order.'); }
  if (!data) return fail(404, 'Order not found.', 'NOT_FOUND');
  const r = (data as any).restaurants;
  (data as any).order_status_history?.sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
  return NextResponse.json({ ...data, restaurants: undefined, restaurant: { name: r.name, slug: r.slug, currency: r.currency,
    workflow_end: r.settings?.workflow_end ?? 'completed', prep_time_minutes: r.settings?.prep_time_minutes ?? null,
    online_enabled: !!r.settings?.payments?.online && !!process.env.RAZORPAY_KEY_ID } }, { headers: noStore });
}
