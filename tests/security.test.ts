import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { verifyRazorpaySignature, sha256 } from '@/lib/security';
import { rateLimit, _resetRateLimit } from '@/lib/ratelimit';
import { placeOrderSchema, mapDbError } from '@/lib/validation';

describe('payment webhook signature', () => {
  const body = JSON.stringify({ event: 'payment.captured' });
  const sig = createHmac('sha256', 'secret').update(body).digest('hex');
  it('accepts a valid signature', () => expect(verifyRazorpaySignature(body, sig, 'secret')).toBe(true));
  it('rejects forged / missing / wrong-secret signatures', () => {
    expect(verifyRazorpaySignature(body, 'deadbeef', 'secret')).toBe(false);
    expect(verifyRazorpaySignature(body, null, 'secret')).toBe(false);
    expect(verifyRazorpaySignature(body, sig, 'other')).toBe(false);
    expect(verifyRazorpaySignature(body + ' ', sig, 'secret')).toBe(false);
    expect(verifyRazorpaySignature(body, sig, '')).toBe(false);
  });
});
describe('rate limiter', () => {
  beforeEach(_resetRateLimit);
  it('blocks after the limit and recovers after the window', () => {
    expect([1, 2, 3].map((i) => rateLimit('ip', 3, 1000, i))).toEqual([true, true, true]);
    expect(rateLimit('ip', 3, 1000, 4)).toBe(false);
    expect(rateLimit('other', 3, 1000, 4)).toBe(true);
    expect(rateLimit('ip', 3, 1000, 2000)).toBe(true);
  });
});
describe('order input validation', () => {
  const ok = { slug: 'cafe-one', table: 'T01', items: [{ menu_item_id: '3f1d6b0e-8f5a-4b0e-9d5e-1a2b3c4d5e6f', quantity: 2 }],
    paymentMethod: 'counter', idempotencyKey: 'x'.repeat(20), trackingToken: 'a'.repeat(43) };
  it('accepts a valid order and ignores client-sent prices', () => {
    const r = placeOrderSchema.safeParse({ ...ok, items: [{ ...ok.items[0], price: 1 }], total: 1 });
    expect(r.success).toBe(true);
    expect(JSON.stringify(r.success && r.data)).not.toContain('"price"');
  });
  it.each([
    ['bad quantity', { items: [{ ...ok.items[0], quantity: 0 }] }], ['empty cart', { items: [] }], ['bad table', { table: '../x' }],
    ['short token', { trackingToken: 'abc' }], ['bad payment', { paymentMethod: 'crypto' }], ['bad phone', { customerPhone: 'abc<script>' }],
  ])('rejects %s', (_n, patch) => expect(placeOrderSchema.safeParse({ ...ok, ...patch }).success).toBe(false));
  it('maps database errors to friendly HTTP responses', () => {
    expect(mapDbError('ITEM_UNAVAILABLE|Soup')).toMatchObject({ status: 409, message: '“Soup” is no longer available.' });
    expect(mapDbError('INVALID_TABLE').status).toBe(400);
    expect(mapDbError('weird internal pg error').status).toBe(500);
  });
  it('hashes tracking tokens deterministically', () => expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
});
