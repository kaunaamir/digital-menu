-- 0003_functions.sql : trusted business logic (pricing, order placement, status workflow, reports)
-- Error convention: RAISE EXCEPTION 'CODE|detail'. The API maps CODE -> HTTP status.

-- ---------- pricing (single source of truth, all prices come from DB rows) ----------
create function public.price_order(p_restaurant uuid, p_items jsonb, p_promo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r restaurants%rowtype; it jsonb; mi menu_items%rowtype; v menu_item_variants%rowtype; g add_on_groups%rowtype;
  opt record; promo promotions%rowtype;
  qty int; unit numeric; line_total numeric; cnt int; minsel int;
  lines jsonb := '[]'::jsonb; addons jsonb; vsnap jsonb; opt_ids uuid[];
  subtotal numeric := 0; disc numeric := 0; base numeric; tax numeric; svc numeric;
  taxp numeric; svcp numeric; minorder numeric;
begin
  select * into r from restaurants where id = p_restaurant;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'EMPTY_CART'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'CART_TOO_LARGE'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    qty := (it->>'quantity')::int;
    if qty is null or qty < 1 or qty > 50 then raise exception 'INVALID_QUANTITY'; end if;

    select * into mi from menu_items where id = (it->>'menu_item_id')::uuid and restaurant_id = p_restaurant;
    if not found then raise exception 'ITEM_NOT_FOUND'; end if;
    if not mi.is_available or not exists (select 1 from categories c where c.id = mi.category_id and c.is_active) then
      raise exception 'ITEM_UNAVAILABLE|%', mi.name;
    end if;

    unit := mi.price; vsnap := null;
    if exists (select 1 from menu_item_variants x where x.menu_item_id = mi.id and x.is_active) then
      select * into v from menu_item_variants
        where id = nullif(it->>'variant_id','')::uuid and menu_item_id = mi.id and is_active;
      if not found then raise exception 'VARIANT_REQUIRED|%', mi.name; end if;
      unit := unit + v.price_adjustment;
      vsnap := jsonb_build_object('id', v.id, 'name', v.name, 'price_adjustment', v.price_adjustment);
    elsif nullif(it->>'variant_id','') is not null then
      raise exception 'INVALID_VARIANT|%', mi.name;
    end if;

    select coalesce(array_agg(x::uuid), '{}') into opt_ids
      from jsonb_array_elements_text(coalesce(it->'add_on_option_ids', '[]'::jsonb)) x;
    if (select count(distinct o) from unnest(opt_ids) o) <> coalesce(array_length(opt_ids, 1), 0) then
      raise exception 'INVALID_ADDON|%', mi.name;
    end if;

    addons := '[]'::jsonb;
    for opt in
      select o.id, o.name, o.price, o.is_available, o.add_on_group_id
      from add_on_options o join add_on_groups g2 on g2.id = o.add_on_group_id
      where g2.menu_item_id = mi.id and o.id = any(opt_ids)
    loop
      if not opt.is_available then raise exception 'ADDON_UNAVAILABLE|%', opt.name; end if;
      unit := unit + opt.price;
      addons := addons || jsonb_build_array(jsonb_build_object(
        'id', opt.id, 'group_id', opt.add_on_group_id, 'name', opt.name, 'price', opt.price));
    end loop;
    if jsonb_array_length(addons) <> coalesce(array_length(opt_ids, 1), 0) then
      raise exception 'INVALID_ADDON|%', mi.name;   -- option does not belong to this item
    end if;

    for g in select * from add_on_groups where menu_item_id = mi.id loop
      select count(*) into cnt from jsonb_array_elements(addons) a where (a->>'group_id')::uuid = g.id;
      minsel := case when g.is_required then greatest(g.minimum_selections, 1) else g.minimum_selections end;
      if cnt > g.maximum_selections or cnt < minsel then
        raise exception 'ADDON_SELECTION|%', g.name;
      end if;
    end loop;

    line_total := unit * qty;
    subtotal := subtotal + line_total;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'menu_item_id', mi.id, 'name', mi.name, 'quantity', qty, 'unit_price', unit, 'line_total', line_total,
      'variant', vsnap, 'add_ons', addons,
      'special_instructions', left(coalesce(it->>'special_instructions', ''), 300)));
  end loop;

  taxp := coalesce((r.settings->>'tax_percent')::numeric, 0);
  svcp := coalesce((r.settings->>'service_charge_percent')::numeric, 0);
  minorder := coalesce((r.settings->>'min_order_amount')::numeric, 0);
  if subtotal < minorder then raise exception 'MIN_ORDER|%', minorder; end if;

  if p_promo is not null and length(trim(p_promo)) > 0 then
    select * into promo from promotions
      where restaurant_id = p_restaurant and upper(code) = upper(trim(p_promo)) and is_active
        and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at > now())
        and (usage_limit is null or usage_count < usage_limit);
    if not found then raise exception 'PROMO_INVALID'; end if;
    if subtotal < promo.minimum_order_value then raise exception 'PROMO_MIN|%', promo.minimum_order_value; end if;
    disc := case when promo.discount_type = 'percent'
                 then round(subtotal * least(promo.discount_value, 100) / 100, 2)
                 else least(promo.discount_value, subtotal) end;
  end if;

  base := subtotal - disc;
  tax := round(base * taxp / 100, 2);
  svc := round(base * svcp / 100, 2);
  return jsonb_build_object('lines', lines, 'subtotal', subtotal, 'discount', disc, 'tax', tax,
    'service_charge', svc, 'total', base + tax + svc, 'promo_id', promo.id, 'promo_code', promo.code);
end $$;

create function public.quote_order(p_slug text, p_items jsonb, p_promo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select id into rid from restaurants where slug = p_slug;
  if rid is null then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  return price_order(rid, p_items, p_promo);
end $$;

-- ---------- order placement ----------
create function public.order_summary(o orders) returns jsonb language sql immutable as $$
  select jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', o.status,
    'payment_status', o.payment_status, 'payment_method', o.payment_method, 'total', o.total_amount);
$$;

create function public.place_order(
  p_slug text, p_table text, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_payment_method text, p_notes text, p_promo text, p_idempotency_key text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r restaurants%rowtype; t tables%rowtype; ex orders%rowtype; pr jsonb; line jsonb; oid uuid; onum int;
begin
  select * into r from restaurants where slug = p_slug;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;

  if p_idempotency_key is not null then           -- replay of an already-created order
    select * into ex from orders where restaurant_id = r.id and idempotency_key = p_idempotency_key;
    if found then
      if ex.tracking_token_hash <> p_token_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      return order_summary(ex);
    end if;
  end if;

  if not r.is_accepting_orders then raise exception 'RESTAURANT_CLOSED'; end if;
  select * into t from tables where restaurant_id = r.id and table_number = p_table;
  if not found or not t.is_active then raise exception 'INVALID_TABLE'; end if;
  if p_payment_method is null or p_payment_method not in ('counter','table','online')
     or coalesce((r.settings->'payments'->>p_payment_method)::boolean, false) is not true then
    raise exception 'PAYMENT_METHOD_DISABLED';
  end if;
  if coalesce((r.settings->>'require_name')::boolean, false) and coalesce(trim(p_customer_name), '') = '' then
    raise exception 'NAME_REQUIRED'; end if;
  if coalesce((r.settings->>'require_phone')::boolean, false) and coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'PHONE_REQUIRED'; end if;

  pr := price_order(r.id, p_items, p_promo);

  begin
    update restaurants set order_counter = order_counter + 1 where id = r.id returning order_counter into onum;
    insert into orders (restaurant_id, table_id, order_number, customer_name, customer_phone, payment_method,
        subtotal, tax_amount, service_charge, discount_amount, total_amount, promo_code, order_notes,
        tracking_token_hash, idempotency_key)
      values (r.id, t.id, onum, nullif(left(trim(coalesce(p_customer_name,'')), 80), ''),
        nullif(left(trim(coalesce(p_customer_phone,'')), 20), ''), p_payment_method,
        (pr->>'subtotal')::numeric, (pr->>'tax')::numeric, (pr->>'service_charge')::numeric,
        (pr->>'discount')::numeric, (pr->>'total')::numeric, pr->>'promo_code',
        nullif(left(coalesce(p_notes,''), 500), ''), p_token_hash, p_idempotency_key)
      returning id into oid;
  exception when unique_violation then          -- concurrent duplicate submit
    select * into ex from orders where restaurant_id = r.id and idempotency_key = p_idempotency_key;
    if found and ex.tracking_token_hash = p_token_hash then return order_summary(ex); end if;
    raise;
  end;

  if pr->>'promo_id' is not null then
    update promotions set usage_count = usage_count + 1
      where id = (pr->>'promo_id')::uuid and (usage_limit is null or usage_count < usage_limit);
    if not found then raise exception 'PROMO_INVALID'; end if;   -- rolls back the whole order
  end if;

  for line in select * from jsonb_array_elements(pr->'lines') loop
    insert into order_items (order_id, menu_item_id, item_name_snapshot, quantity, unit_price_snapshot,
        selected_variant_snapshot, selected_add_ons_snapshot, special_instructions, line_total)
      values (oid, (line->>'menu_item_id')::uuid, line->>'name', (line->>'quantity')::int,
        (line->>'unit_price')::numeric, nullif(line->'variant', 'null'::jsonb), line->'add_ons',
        nullif(line->>'special_instructions', ''), (line->>'line_total')::numeric);
  end loop;
  insert into order_status_history (order_id, previous_status, new_status) values (oid, null, 'new');

  select * into ex from orders where id = oid;
  return order_summary(ex);
end $$;

-- ---------- staff workflow ----------
create function public.update_order_status(p_order uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; r restaurants%rowtype;
  path text[] := array['new','accepted','preparing','ready','served','completed'];
  idx int; cur int; nxt int; ok boolean;
begin
  select * into o from orders where id = p_order for update;
  if not found or auth.uid() is null or not is_member(o.restaurant_id) then raise exception 'FORBIDDEN'; end if;
  select * into r from restaurants where id = o.restaurant_id;
  idx := array_position(path, coalesce(r.settings->>'workflow_end', 'completed'));
  cur := array_position(path, o.status);
  nxt := array_position(path, p_status);
  if p_status = 'rejected' then ok := o.status = 'new';
  elsif p_status = 'cancelled' then ok := cur is not null and cur >= 2 and cur < idx;
  else ok := cur is not null and nxt = cur + 1 and nxt <= idx;
  end if;
  if not ok then raise exception 'INVALID_TRANSITION|% -> %', o.status, p_status; end if;
  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;

  update orders set status = p_status,
    status_reason = case when p_status in ('rejected','cancelled') then left(p_reason, 300) else status_reason end
    where id = o.id returning * into o;
  insert into order_status_history (order_id, previous_status, new_status, changed_by, reason)
    values (o.id, (select new_status from order_status_history where order_id = o.id order by created_at desc, id limit 1),
            p_status, auth.uid(), left(p_reason, 300));
  return order_summary(o);
end $$;

create function public.mark_payment_received(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order for update;
  if not found or auth.uid() is null or not is_member(o.restaurant_id) then raise exception 'FORBIDDEN'; end if;
  if o.payment_method not in ('counter','table') then raise exception 'ONLINE_PAYMENT_VERIFIED_BY_GATEWAY_ONLY'; end if;
  if o.status in ('rejected','cancelled') then raise exception 'INVALID_TRANSITION|order is %', o.status; end if;
  if o.payment_status = 'paid' then return order_summary(o); end if;
  update orders set payment_status = 'paid' where id = o.id returning * into o;
  insert into payments (order_id, provider, amount, status) values (o.id, 'offline', o.total_amount, 'paid');
  return order_summary(o);
end $$;

-- ---------- restaurants, tables, team ----------
create function public.create_restaurant(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  insert into restaurants (name, slug, settings) values (trim(p_name), lower(trim(p_slug)), jsonb_build_object(
    'tax_percent', 5, 'service_charge_percent', 0, 'min_order_amount', 0,
    'payments', jsonb_build_object('counter', true, 'table', true, 'online', false),
    'workflow_end', 'completed', 'prep_time_minutes', 20, 'require_name', false, 'require_phone', false,
    'closed_message', 'We are not taking orders right now.'))
  returning id into rid;
  insert into restaurant_members (restaurant_id, user_id, role) values (rid, auth.uid(), 'owner');
  return rid;
exception when unique_violation then raise exception 'SLUG_TAKEN';
end $$;

create function public.resolve_table(p_slug text, p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', t.table_number, 'display_name', t.display_name, 'is_active', t.is_active)
  from tables t join restaurants r on r.id = t.restaurant_id where r.slug = p_slug and t.table_number = p_code;
$$;

create function public.list_members(p_restaurant uuid)
returns table (user_id uuid, email text, full_name text, role text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_restaurant, array['owner','manager']) then raise exception 'FORBIDDEN'; end if;
  return query select m.user_id, u.email::text, p.full_name, m.role
    from restaurant_members m join auth.users u on u.id = m.user_id left join profiles p on p.id = m.user_id
    where m.restaurant_id = p_restaurant order by m.created_at;
end $$;

create function public.add_member(p_restaurant uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_member(p_restaurant, array['owner']) then raise exception 'FORBIDDEN'; end if;
  if p_role not in ('manager','staff') then raise exception 'INVALID_ROLE'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'USER_NOT_FOUND'; end if;
  insert into restaurant_members (restaurant_id, user_id, role) values (p_restaurant, uid, p_role)
    on conflict (restaurant_id, user_id) do update set role = excluded.role where restaurant_members.role <> 'owner';
end $$;

create function public.remove_member(p_restaurant uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_restaurant, array['owner']) then raise exception 'FORBIDDEN'; end if;
  delete from restaurant_members where restaurant_id = p_restaurant and user_id = p_user and role <> 'owner';
end $$;

-- ---------- reports ----------
create function public.report_summary(p_restaurant uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tz text; f timestamptz; t timestamptz; res jsonb;
begin
  if not is_member(p_restaurant, array['owner','manager']) then raise exception 'FORBIDDEN'; end if;
  select timezone into tz from restaurants where id = p_restaurant;
  f := p_from::timestamp at time zone tz;
  t := (p_to + 1)::timestamp at time zone tz;
  with o as (select * from orders where restaurant_id = p_restaurant and created_at >= f and created_at < t),
       valid as (select * from o where status not in ('rejected','cancelled'))
  select jsonb_build_object(
    'total_orders', (select count(*) from valid),
    'total_sales', (select coalesce(sum(total_amount), 0) from valid),
    'paid_sales', (select coalesce(sum(total_amount), 0) from valid where payment_status = 'paid'),
    'avg_order_value', (select coalesce(round(avg(total_amount), 2), 0) from valid),
    'cancelled_orders', (select count(*) from o where status in ('rejected','cancelled')),
    'top_items', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select oi.item_name_snapshot as name, sum(oi.quantity)::int as quantity, sum(oi.line_total) as revenue
        from order_items oi join valid v on v.id = oi.order_id group by 1 order by 2 desc limit 10) x),
    'by_date', (select coalesce(jsonb_agg(x order by x.date), '[]'::jsonb) from (
        select (created_at at time zone tz)::date as date, count(*)::int as orders, sum(total_amount) as sales
        from valid group by 1) x),
    'by_payment', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select payment_method, count(*)::int as orders, sum(total_amount) as amount from valid group by 1) x)
  ) into res;
  return res;
end $$;

-- ---------- function privileges ----------
revoke all on function public.price_order(uuid, jsonb, text), public.quote_order(text, jsonb, text),
  public.order_summary(orders),
  public.place_order(text, text, jsonb, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.price_order(uuid, jsonb, text), public.quote_order(text, jsonb, text),
  public.order_summary(orders),
  public.place_order(text, text, jsonb, text, text, text, text, text, text, text) to service_role;

revoke all on function public.update_order_status(uuid, text, text), public.mark_payment_received(uuid),
  public.create_restaurant(text, text), public.list_members(uuid), public.add_member(uuid, text, text),
  public.remove_member(uuid, uuid), public.report_summary(uuid, date, date) from public, anon;
grant execute on function public.update_order_status(uuid, text, text), public.mark_payment_received(uuid),
  public.create_restaurant(text, text), public.list_members(uuid), public.add_member(uuid, text, text),
  public.remove_member(uuid, uuid), public.report_summary(uuid, date, date) to authenticated, service_role;

revoke all on function public.resolve_table(text, text) from public;
grant execute on function public.resolve_table(text, text) to anon, authenticated, service_role;
