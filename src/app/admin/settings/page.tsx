import { adminPage } from '@/lib/adminPage';
import SettingsAdmin from '@/components/SettingsAdmin';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · settings' };
export default function Page({ searchParams }: { searchParams: { r?: string } }) {
  return adminPage('settings', searchParams.r, (restaurant, role) => <SettingsAdmin restaurant={restaurant} role={role} />);
}
