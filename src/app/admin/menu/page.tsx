import { adminPage } from '@/lib/adminPage';
import MenuAdmin from '@/components/MenuAdmin';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · menu' };
export default function Page({ searchParams }: { searchParams: { r?: string } }) {
  return adminPage('menu', searchParams.r, (restaurant, role) => <MenuAdmin restaurant={restaurant} role={role} />);
}
