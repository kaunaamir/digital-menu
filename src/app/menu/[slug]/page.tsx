import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import MenuClient from '@/components/MenuClient';
import type { Category, Restaurant } from '@/lib/types';

export const dynamic = 'force-dynamic';   // availability / prices must always be current

async function load(slug: string) {
  const sb = supabaseServer();
  const { data: r } = await sb.from('restaurants').select('*').eq('slug', slug).maybeSingle();
  return { sb, restaurant: r as Restaurant | null };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { restaurant: r } = await load(params.slug);
  if (!r) return { title: 'Menu not found' };
  return { title: `${r.name} - Menu`, description: r.description ?? `Order from ${r.name} at your table.`,
    openGraph: { title: `${r.name} - Menu`, description: r.description ?? undefined, images: r.cover_image_url ? [r.cover_image_url] : undefined } };
}

export default async function MenuPage({ params, searchParams }: { params: { slug: string }; searchParams: { table?: string } }) {
  const { sb, restaurant } = await load(params.slug);
  if (!restaurant) notFound();
  const { data: cats } = await sb.from('categories')
    .select('*, menu_items(*, menu_item_variants(*), add_on_groups(*, add_on_options(*)))')
    .eq('restaurant_id', restaurant.id).eq('is_active', true).order('display_order');
  const sortBy = <T extends { display_order: number }>(a: T[]) => [...a].sort((x, y) => x.display_order - y.display_order);
  const categories = ((cats ?? []) as unknown as Category[]).map((c) => ({
    ...c, menu_items: sortBy(c.menu_items).map((i) => ({
      ...i, menu_item_variants: sortBy(i.menu_item_variants.filter((v) => v.is_active)),
      add_on_groups: sortBy(i.add_on_groups).map((g) => ({ ...g, add_on_options: sortBy(g.add_on_options) })),
    })),
  }));

  let table: { code: string; display_name: string; is_active: boolean } | null = null;
  const code = searchParams.table;
  if (code && /^[A-Za-z0-9_-]{1,20}$/.test(code)) {
    const { data } = await sb.rpc('resolve_table', { p_slug: params.slug, p_code: code });
    table = data ?? null;
  }
  const tableProblem = !code ? 'no-table' : !table ? 'invalid-table' : !table.is_active ? 'inactive-table' : null;
  const onlineEnabled = !!restaurant.settings?.payments?.online && !!process.env.RAZORPAY_KEY_ID;
  return <MenuClient restaurant={restaurant} categories={categories} table={table} tableProblem={tableProblem} onlineEnabled={onlineEnabled} />;
}
