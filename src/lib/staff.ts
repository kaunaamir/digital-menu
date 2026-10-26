import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';
import type { Restaurant } from './types';
export type Role = 'owner' | 'manager' | 'staff';
export interface StaffContext { userId: string; email: string; memberships: { role: Role; restaurant: Restaurant }[]; current: { role: Role; restaurant: Restaurant } | null }
/** Loads the signed-in staff member and picks the active restaurant (?r=<id>, default first). RLS already scopes the rows. */
export async function getStaffContext(restaurantId?: string, next = '/dashboard'): Promise<StaffContext> {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data } = await sb.from('restaurant_members').select('role, restaurants(*)').eq('user_id', user.id).order('created_at');
  const memberships = ((data ?? []) as unknown as { role: Role; restaurants: Restaurant }[]).map((m) => ({ role: m.role, restaurant: m.restaurants }));
  const current = memberships.find((m) => m.restaurant.id === restaurantId) ?? memberships[0] ?? null;
  return { userId: user.id, email: user.email ?? '', memberships, current };
}
