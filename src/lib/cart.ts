'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CartLine, lineKey, subtotalOf } from './pricing';

interface Attempt { sig: string; idempotencyKey: string; trackingToken: string }
interface CartState {
  slug: string | null; table: string | null; lines: CartLine[]; promoCode: string; attempt: Attempt | null;
  init: (slug: string, table: string | null) => void;
  add: (line: Omit<CartLine, 'key'>, replaceKey?: string) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  setPromo: (c: string) => void;
  setAttempt: (a: Attempt | null) => void;
  clear: () => void;
}
export const useCart = create<CartState>()(persist((set, get) => ({
  slug: null, table: null, lines: [], promoCode: '', attempt: null,
  // Never mix restaurants: switching restaurant (or table) starts a fresh cart.
  init: (slug, table) => { const s = get(); if (s.slug !== slug || s.table !== table) set({ slug, table, lines: [], promoCode: '', attempt: null }); },
  add: (line, replaceKey) => set((s) => {
    const key = lineKey(line); let lines = replaceKey ? s.lines.filter((l) => l.key !== replaceKey) : s.lines;
    const ex = lines.find((l) => l.key === key);
    lines = ex ? lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l)) : [...lines, { ...line, key }];
    return { lines, attempt: null };
  }),
  setQty: (key, qty) => set((s) => ({ lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, qty) } : l)), attempt: null })),
  remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key), attempt: null })),
  setPromo: (promoCode) => set({ promoCode, attempt: null }),
  setAttempt: (attempt) => set({ attempt }),
  clear: () => set({ lines: [], promoCode: '', attempt: null }),
}), { name: 'qrmenu-cart-v1', storage: createJSONStorage(() => localStorage) }));
export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotal = subtotalOf;
