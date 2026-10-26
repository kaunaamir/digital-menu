import { redirect } from 'next/navigation';
import { getStaffContext } from './staff';
import StaffShell from '@/components/StaffShell';
import SetupRestaurant from '@/components/SetupRestaurant';
import type { Restaurant } from './types';
import type { Role } from './staff';

/** Shared guard for /admin/*: needs a manager/owner role (kitchen staff are sent back to the dashboard). Data access is separately enforced by RLS. */
export async function adminPage(active: string, rid: string | undefined, render: (r: Restaurant, role: Role) => React.ReactNode) {
  const ctx = await getStaffContext(rid, `/admin/${active}`);
  if (!ctx.current) return <SetupRestaurant />;
  if (ctx.current.role === 'staff') redirect('/dashboard');
  return <StaffShell ctx={ctx} active={active}>{render(ctx.current.restaurant, ctx.current.role)}</StaffShell>;
}
