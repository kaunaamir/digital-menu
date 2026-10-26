'use client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
export default function SignOut() {
  const router = useRouter();
  return <button className="btn-ghost !min-h-[40px] !px-3" onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace('/login'); router.refresh(); }} aria-label="Sign out"><LogOut size={16} /></button>;
}
