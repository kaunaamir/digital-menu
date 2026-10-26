import { describe, it, expect } from 'vitest';
import { unitPrice, lineTotal, subtotalOf, totals, lineKey, validateSelection, CartLine } from '@/lib/pricing';

const pizza: CartLine = { key: 'k', itemId: 'p', name: 'Pizza', basePrice: 299, quantity: 2, variant: { id: 'v', name: 'Medium', adj: 100 },
  addOns: [{ id: 'a', groupId: 'g', name: 'Cheese', price: 40 }], instructions: '' };

describe('cart pricing', () => {
  it('adds variant and add-ons to the unit price', () => { expect(unitPrice(pizza)).toBe(439); expect(lineTotal(pizza)).toBe(878); });
  it('sums lines and computes tax/service/discount', () => {
    expect(subtotalOf([pizza, { ...pizza, quantity: 1 }])).toBe(1317);
    expect(totals(878, 5, 0)).toMatchObject({ tax: 43.9, total: 921.9 });
    expect(totals(594, 5, 0, 59.4).total).toBe(561.33);
  });
  it('avoids float drift', () => { expect(totals(0.1 + 0.2, 0, 0).total).toBe(0.3); });
  it('merges identical customisations but not different ones', () => {
    const more: CartLine = { ...pizza, quantity: 5 };
    expect(lineKey(pizza)).toBe(lineKey(more));
    expect(lineKey(pizza)).not.toBe(lineKey({ ...pizza, instructions: 'no onions' }));
  });
  it('validates required selections', () => {
    const groups = [{ id: 'g', name: 'Crust', is_required: true, minimum_selections: 1, maximum_selections: 1 }];
    expect(validateSelection([{ id: 'v' }], groups, null, {})).toMatch(/choose/);
    expect(validateSelection([{ id: 'v' }], groups, 'v', {})).toMatch(/Crust/);
    expect(validateSelection([{ id: 'v' }], groups, 'v', { g: ['a', 'b'] })).toMatch(/at most/);
    expect(validateSelection([{ id: 'v' }], groups, 'v', { g: ['a'] })).toBeNull();
  });
});
