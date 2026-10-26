import { adminPage } from '@/lib/adminPage';
import ReportsAdmin from '@/components/ReportsAdmin';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · reports' };
export default function Page({ searchParams }: { searchParams: { r?: string } }) {
  return adminPage('reports', searchParams.r, (restaurant, role) => <ReportsAdmin restaurant={restaurant} role={role} />);
}
