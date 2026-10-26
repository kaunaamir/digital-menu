import { createHash, createHmac, timingSafeEqual } from 'crypto';
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** Razorpay webhook: HMAC-SHA256(rawBody, webhookSecret) compared in constant time. */
export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
