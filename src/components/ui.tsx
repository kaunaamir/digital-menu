'use client';
import clsx from 'clsx';
import { X, Loader2 } from 'lucide-react';
import { useEffect } from 'react';

export const cn = clsx;
export function Spinner({ className }: { className?: string }) { return <Loader2 className={cn('animate-spin', className)} aria-label="Loading" />; }

export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn('flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-stone-100" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-stone-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function DietDot({ type }: { type: string }) {
  const c = type === 'non_veg' ? 'border-red-600 bg-red-600' : type === 'egg' ? 'border-amber-500 bg-amber-500' : 'border-green-600 bg-green-600';
  return <span className={cn('inline-grid h-4 w-4 shrink-0 place-items-center rounded-sm border-2 bg-white')} title={type.replace('_', '-')}><span className={cn('h-2 w-2 rounded-full', c)} /></span>;
}

export function Toast({ message, kind = 'error', onClose }: { message: string | null; kind?: 'error' | 'ok'; onClose: () => void }) {
  useEffect(() => { if (!message) return; const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [message, onClose]);
  if (!message) return null;
  return <div role="alert" className={cn('fixed left-1/2 top-4 z-[60] w-[92%] max-w-md -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg', kind === 'error' ? 'bg-red-600' : 'bg-green-600')}>{message}</div>;
}

export function Img({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (!src) return <div className={cn('grid place-items-center bg-gradient-to-br from-orange-100 to-amber-50 text-3xl', className)} aria-hidden>🍽️</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={cn('object-cover', className)}
    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />;
}

export function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">{children}</div>; }
