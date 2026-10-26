import { adminPage } from '@/lib/adminPage';
import TablesAdmin from '@/components/TablesAdmin';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · tables' };
export default function Page({ searchParams }: { searchParams: { r?: string } }) {
  return adminPage('tables', searchParams.r, (restaurant, role) => <TablesAdmin restaurant={restaurant} role={role} />);
}
