// Client-side price PREVIEW only. The server (public.price_order) recomputes everything from DB rows.
export interface CartAddOn { id: string; groupId: string; name: string; price: number }
export interface CartLine {
  key: string; itemId: string; name: string; image?: string | null; basePrice: number; quantity: number;
  variant?: { id: string; name: string; adj: number } | null; addOns: CartAddOn[]; instructions: string;
}
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const unitPrice = (l: Pick<CartLine, 'basePrice' | 'variant' | 'addOns'>) =>
  round2(l.basePrice + (l.variant?.adj ?? 0) + l.addOns.reduce((s, a) => s + a.price, 0));
export const lineTotal = (l: CartLine) => round2(unitPrice(l) * l.quantity);
export const subtotalOf = (lines: CartLine[]) => round2(lines.reduce((s, l) => s + lineTotal(l), 0));
export function totals(subtotal: number, taxPct: number, svcPct: number, discount = 0) {
  const base = round2(subtotal - discount);
  const tax = round2((base * taxPct) / 100);
  const service = round2((base * svcPct) / 100);
  return { subtotal, discount, tax, service, total: round2(base + tax + service) };
}
export function lineKey(l: Pick<CartLine, 'itemId' | 'variant' | 'addOns' | 'instructions'>): string {
  return [l.itemId, l.variant?.id ?? '', l.addOns.map((a) => a.id).sort().join(','), l.instructions.trim().toLowerCase()].join('|');
}
/** Validate selections against item config before adding to cart (mirrors server rules). */
export function validateSelection(
  variants: { id: string }[], groups: { id: string; name: string; is_required: boolean; minimum_selections: number; maximum_selections: number }[],
  variantId: string | null, optionIdsByGroup: Record<string, string[]>,
): string | null {
  if (variants.length > 0 && !variantId) return 'Please choose an option';
  for (const g of groups) {
    const n = (optionIdsByGroup[g.id] ?? []).length;
    const min = g.is_required ? Math.max(g.minimum_selections, 1) : g.minimum_selections;
    if (n < min) return `Select at least ${min} for “${g.name}”`;
    if (n > g.maximum_selections) return `Select at most ${g.maximum_selections} for “${g.name}”`;
  }
  return null;
}
