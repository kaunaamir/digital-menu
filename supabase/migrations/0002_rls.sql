-- 0002_rls.sql : membership helper + Row Level Security

create function public.is_member(rid uuid, roles text[] default array['owner','manager','staff'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = rid and m.user_id = auth.uid() and m.role = any(roles)
  );
$$;
revoke all on function public.is_member(uuid, text[]) from public;
grant execute on function public.is_member(uuid, text[]) to anon, authenticated, service_role;

alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_item_variants enable row level security;
alter table public.add_on_groups enable row level security;
alter table public.add_on_options enable row level security;
alter table public.promotions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;

-- Defense in depth: clients can never write these tables directly (only SECURITY DEFINER functions / service role).
revoke insert, update, delete on public.orders, public.order_items, public.order_status_history,
  public.payments, public.restaurant_members from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
revoke all on public.profiles, public.restaurant_members, public.tables, public.promotions,
  public.orders, public.order_items, public.order_status_history, public.payments from anon;
revoke insert, update, delete on public.restaurants, public.categories, public.menu_items, public.menu_item_variants,
  public.add_on_groups, public.add_on_options from anon;

-- restaurants: public read (menu), owner/manager update. Creation only via create_restaurant().
create policy restaurants_read on public.restaurants for select using (true);
create policy restaurants_update on public.restaurants for update to authenticated
  using (public.is_member(id, array['owner','manager'])) with check (public.is_member(id, array['owner','manager']));
revoke insert, delete on public.restaurants from authenticated;

-- profiles
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- members: read own rows, owners/managers read the whole team
create policy members_read on public.restaurant_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(restaurant_id, array['owner','manager']));

-- tables: staff only (customers resolve a table through resolve_table())
create policy tables_read on public.tables for select to authenticated using (public.is_member(restaurant_id));
create policy tables_write on public.tables for all to authenticated
  using (public.is_member(restaurant_id, array['owner','manager'])) with check (public.is_member(restaurant_id, array['owner','manager']));

-- menu: public read of active content, owner/manager write
create policy categories_read on public.categories for select using (is_active or public.is_member(restaurant_id));
create policy categories_write on public.categories for all to authenticated
  using (public.is_member(restaurant_id, array['owner','manager'])) with check (public.is_member(restaurant_id, array['owner','manager']));

create policy items_read on public.menu_items for select using (
  public.is_member(restaurant_id) or exists (select 1 from public.categories c where c.id = category_id and c.is_active));
create policy items_write on public.menu_items for all to authenticated
  using (public.is_member(restaurant_id, array['owner','manager']))
  with check (public.is_member(restaurant_id, array['owner','manager'])
    and exists (select 1 from public.categories c where c.id = category_id and c.restaurant_id = menu_items.restaurant_id));

create policy variants_read on public.menu_item_variants for select using (true);
create policy variants_write on public.menu_item_variants for all to authenticated
  using (exists (select 1 from public.menu_items i where i.id = menu_item_id and public.is_member(i.restaurant_id, array['owner','manager'])))
  with check (exists (select 1 from public.menu_items i where i.id = menu_item_id and public.is_member(i.restaurant_id, array['owner','manager'])));

create policy groups_read on public.add_on_groups for select using (true);
create policy groups_write on public.add_on_groups for all to authenticated
  using (exists (select 1 from public.menu_items i where i.id = menu_item_id and public.is_member(i.restaurant_id, array['owner','manager'])))
  with check (exists (select 1 from public.menu_items i where i.id = menu_item_id and public.is_member(i.restaurant_id, array['owner','manager'])));

create policy options_read on public.add_on_options for select using (true);
create policy options_write on public.add_on_options for all to authenticated
  using (exists (select 1 from public.add_on_groups g join public.menu_items i on i.id = g.menu_item_id
                 where g.id = add_on_group_id and public.is_member(i.restaurant_id, array['owner','manager'])))
  with check (exists (select 1 from public.add_on_groups g join public.menu_items i on i.id = g.menu_item_id
                 where g.id = add_on_group_id and public.is_member(i.restaurant_id, array['owner','manager'])));

-- promotions: never readable by customers (validated server-side inside price_order)
create policy promos_all on public.promotions for all to authenticated
  using (public.is_member(restaurant_id, array['owner','manager'])) with check (public.is_member(restaurant_id, array['owner','manager']));

-- orders & friends: read-only for staff of that restaurant. Customers use the token API.
create policy orders_read on public.orders for select to authenticated using (public.is_member(restaurant_id));
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_member(o.restaurant_id)));
create policy history_read on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_member(o.restaurant_id)));
create policy payments_read on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_member(o.restaurant_id)));
