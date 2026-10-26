import { z } from 'zod';
const uuid = z.string().uuid();
export const orderItemSchema = z.object({
  menu_item_id: uuid,
  quantity: z.number().int().min(1).max(50),
  variant_id: uuid.nullish(),
  add_on_option_ids: z.array(uuid).max(30).default([]),
  special_instructions: z.string().max(300).optional().default(''),
});
export const placeOrderSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  table: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
  items: z.array(orderItemSchema).min(1).max(50),
  customerName: z.string().trim().max(80).optional().default(''),
  customerPhone: z.string().trim().regex(/^[0-9+()\-\s]{0,20}$/, 'Invalid phone number').optional().default(''),
  paymentMethod: z.enum(['counter', 'table', 'online']),
  notes: z.string().max(500).optional().default(''),
  promoCode: z.string().trim().max(30).optional().default(''),
  idempotencyKey: z.string().min(16).max(80),
  trackingToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export const quoteSchema = z.object({
  slug: placeOrderSchema.shape.slug, items: placeOrderSchema.shape.items, promoCode: z.string().trim().max(30).optional().default(''),
});

/** Error codes raised by SQL functions -> HTTP status + friendly message. */
const MAP: Record<string, [number, string]> = {
  RESTAURANT_NOT_FOUND: [404, 'Restaurant not found.'],
  RESTAURANT_CLOSED: [409, 'The restaurant is not accepting orders right now.'],
  INVALID_TABLE: [400, 'This table is invalid or inactive. Please scan the QR code on your table again.'],
  ITEM_UNAVAILABLE: [409, 'is no longer available.'], ITEM_NOT_FOUND: [409, 'An item in your cart no longer exists. Please refresh the menu.'],
  VARIANT_REQUIRED: [400, 'needs a size/option selection.'], INVALID_VARIANT: [400, 'has an invalid option.'],
  INVALID_ADDON: [400, 'has an invalid add-on selection.'], ADDON_UNAVAILABLE: [409, 'is no longer available.'],
  ADDON_SELECTION: [400, 'Please check the required selections for'], INVALID_QUANTITY: [400, 'Invalid quantity.'],
  EMPTY_CART: [400, 'Your cart is empty.'], CART_TOO_LARGE: [400, 'Too many items in one order.'],
  MIN_ORDER: [400, 'Minimum order amount is'], PROMO_INVALID: [400, 'This promo code is not valid.'],
  PROMO_MIN: [400, 'This promo needs a minimum order of'], PAYMENT_METHOD_DISABLED: [400, 'This payment method is not available.'],
  NAME_REQUIRED: [400, 'Please enter your name.'], PHONE_REQUIRED: [400, 'Please enter your phone number.'],
  IDEMPOTENCY_CONFLICT: [409, 'Duplicate request detected.'], FORBIDDEN: [403, 'Not allowed.'],
};
export function mapDbError(message: string): { status: number; message: string; code: string } {
  const [code, detail] = message.split('|');
  const m = MAP[code];
  if (!m) return { status: 500, code: 'INTERNAL', message: 'Something went wrong. Please try again.' };
  const msg = ['ITEM_UNAVAILABLE', 'VARIANT_REQUIRED', 'INVALID_VARIANT', 'INVALID_ADDON', 'ADDON_UNAVAILABLE'].includes(code)
    ? `“${detail}” ${m[1]}` : ['ADDON_SELECTION', 'MIN_ORDER', 'PROMO_MIN'].includes(code) ? `${m[1]} ${detail}.` : m[1];
  return { status: m[0], code, message: msg };
}
