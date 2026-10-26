import Link from 'next/link';
import type { StaffContext } from '@/lib/staff';
import SignOut from './SignOut';

export default function StaffShell({ ctx, active, children }: { ctx: StaffContext; active: string; children: React.ReactNode }) {
  const cur = ctx.current!; const q = `?r=${cur.restaurant.id}`; const mgr = cur.role !== 'staff';
  const links = [{ href: '/dashboard', label: 'Live orders', id: 'dashboard' }, { href: '/dashboard/history', label: 'History', id: 'history' },
    ...(mgr ? [{ href: '/admin/menu', label: 'Menu', id: 'menu' }, { href: '/admin/tables', label: 'Tables & QR', id: 'tables' }, { href: '/admin/reports', label: 'Reports', id: 'reports' }, { href: '/admin/settings', label: 'Settings', id: 'settings' }] : [])];
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2">
          <div className="min-w-0">
            {ctx.memberships.length > 1 ? (
              <details className="relative"><summary className="cursor-pointer list-none font-extrabold">{cur.restaurant.name} ▾</summary>
                <div className="card absolute left-0 top-8 z-50 w-56 p-1">{ctx.memberships.map((m) => <Link key={m.restaurant.id} className="block rounded-lg px-3 py-2 text-sm hover:bg-stone-100" href={`?r=${m.restaurant.id}`}>{m.restaurant.name} <span className="text-xs text-stone-400">({m.role})</span></Link>)}</div></details>
            ) : <p className="truncate font-extrabold">{cur.restaurant.name}</p>}
            <p className="text-[11px] capitalize text-stone-500">{cur.role === 'staff' ? 'Kitchen / counter' : cur.role}</p>
          </div>
          <nav className="no-scrollbar ml-2 flex flex-1 gap-1 overflow-x-auto">
            {links.map((l) => <Link key={l.id} href={`${l.href}${q}`} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${active === l.id ? 'bg-ink text-white' : 'text-stone-600 hover:bg-stone-100'}`}>{l.label}</Link>)}
          </nav>
          <SignOut />
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] p-4">{children}</div>
    </div>
  );
}
