import Link from 'next/link';
import { QrCode, ChefHat, Smartphone } from 'lucide-react';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      <div>
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-500 text-white"><QrCode size={30} /></div>
        <h1 className="text-4xl font-extrabold tracking-tight">Scan. Order. Eat.</h1>
        <p className="mt-3 text-lg text-stone-600">QR-based menus and table ordering for restaurants. Customers order from their phones; your counter sees it instantly.</p>
      </div>
      <ul className="grid gap-3 text-sm text-stone-700">
        <li className="card flex items-center gap-3 p-4"><Smartphone className="text-brand-600" /> Customers scan the table QR - no app, no sign-up.</li>
        <li className="card flex items-center gap-3 p-4"><ChefHat className="text-brand-600" /> Orders appear live on the staff dashboard with a sound alert.</li>
      </ul>
      <div className="flex gap-3">
        <Link href="/signup" className="btn-primary">Create your restaurant</Link>
        <Link href="/login" className="btn-ghost">Staff login</Link>
      </div>
    </main>
  );
}
