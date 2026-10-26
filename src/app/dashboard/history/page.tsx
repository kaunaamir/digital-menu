import { getStaffContext } from '@/lib/staff';
import StaffShell from '@/components/StaffShell';
import OrderHistory from '@/components/OrderHistory';
import SetupRestaurant from '@/components/SetupRestaurant';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order history' };
export default async function Page({ searchParams }: { searchParams: { r?: string } }) {
  const ctx = await getStaffContext(searchParams.r, '/dashboard/history');
  if (!ctx.current) return <SetupRestaurant />;
  return <StaffShell ctx={ctx} active="history"><OrderHistory restaurant={ctx.current.restaurant} /></StaffShell>;
}
