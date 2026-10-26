import { getStaffContext } from '@/lib/staff';
import StaffShell from '@/components/StaffShell';
import LiveOrders from '@/components/LiveOrders';
import SetupRestaurant from '@/components/SetupRestaurant';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Live orders' };
export default async function Page({ searchParams }: { searchParams: { r?: string } }) {
  const ctx = await getStaffContext(searchParams.r);
  if (!ctx.current) return <SetupRestaurant />;
  return <StaffShell ctx={ctx} active="dashboard"><LiveOrders restaurant={ctx.current.restaurant} role={ctx.current.role} /></StaffShell>;
}
