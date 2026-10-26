-- Run after stub_supabase.sql (local) or against a scratch Supabase project. Raises on the first failed assertion.
create schema t; grant usage on schema t to public;
create function t.q(p_role text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    if p_sql ~* '(returning|^\s*(select|with))' then execute p_sql into res; else execute p_sql; end if;
  exception when others then reset role; return 'ERR:' || sqlerrm; end;
  reset role; return coalesce(res, '');
end $$;
create function t.must(p_role text, p_uid uuid, p_sql text) returns void language plpgsql as $$
declare r text; begin r := t.q(p_role, p_uid, p_sql); if r like 'ERR:%' then raise exception 'SETUP FAILED: % -> %', p_sql, r; end if; end $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'TEST FAILED: %', msg; end if; raise notice 'PASS  %', msg; end $$;

do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  r1 uuid; r2 uuid; c1 uuid; i_pizza uuid; i_soup uuid; i_other uuid; v_reg uuid; v_med uuid; g1 uuid; o_cheese uuid; o_other uuid;
  res text; oid uuid; tok text := repeat('a', 43); items jsonb; j jsonb;
  place text := 'select public.place_order(%L,%L,%L::jsonb,%L,%L,%L,%L,%L,%L,%L)::text';
begin
  insert into auth.users (id, email) values (u1,'owner@one.test'),(u2,'owner@two.test'),(u3,'kitchen@one.test');
  perform t.ok((select count(*) from public.profiles) = 3, 'profile created for each new user');

  r1 := t.q('authenticated', u1, $q$select public.create_restaurant('Cafe One','cafe-one')::text$q$)::uuid;
  r2 := t.q('authenticated', u2, $q$select public.create_restaurant('Other Place','other-place')::text$q$)::uuid;
  perform t.ok(t.q('authenticated', u2, $q$select public.create_restaurant('Dup','cafe-one')::text$q$) like 'ERR:SLUG_TAKEN%', 'duplicate slug rejected');
  perform t.ok(t.q('anon', null, $q$select public.create_restaurant('X','anon-rest')::text$q$) like 'ERR:%', 'anon cannot create restaurant');
  perform t.ok(t.q('authenticated', u1, format($q$select public.add_member(%L,'kitchen@one.test','staff')::text$q$, r1)) = '', 'owner adds staff member');
  perform t.ok(t.q('authenticated', u3, format($q$select public.add_member(%L,'owner@two.test','manager')::text$q$, r1)) like 'ERR:FORBIDDEN%', 'staff cannot add members');

  -- menu setup through RLS as the owner
  perform t.must('authenticated', u1, format($q$insert into public.tables (restaurant_id,table_number,display_name) values (%L,'T01','Table 1'),(%L,'T02','Table 2')$q$, r1, r1));
  perform t.must('authenticated', u1, format($q$update public.tables set is_active=false where restaurant_id=%L and table_number='T02'$q$, r1));
  perform t.must('authenticated', u2, format($q$insert into public.tables (restaurant_id,table_number,display_name) values (%L,'X01','Other 1')$q$, r2));
  c1 := t.q('authenticated', u1, format($q$insert into public.categories (restaurant_id,name) values (%L,'Pizza') returning id::text$q$, r1))::uuid;
  i_pizza := t.q('authenticated', u1, format($q$insert into public.menu_items (restaurant_id,category_id,name,price) values (%L,%L,'Margherita',299) returning id::text$q$, r1, c1))::uuid;
  i_soup  := t.q('authenticated', u1, format($q$insert into public.menu_items (restaurant_id,category_id,name,price,is_available) values (%L,%L,'Soup',120,false) returning id::text$q$, r1, c1))::uuid;
  i_other := t.q('authenticated', u1, format($q$insert into public.menu_items (restaurant_id,category_id,name,price) values (%L,%L,'Garlic Bread',99) returning id::text$q$, r1, c1))::uuid;
  v_reg := t.q('authenticated', u1, format($q$insert into public.menu_item_variants (menu_item_id,name,price_adjustment) values (%L,'Regular',0) returning id::text$q$, i_pizza))::uuid;
  v_med := t.q('authenticated', u1, format($q$insert into public.menu_item_variants (menu_item_id,name,price_adjustment) values (%L,'Medium',100) returning id::text$q$, i_pizza))::uuid;
  g1 := t.q('authenticated', u1, format($q$insert into public.add_on_groups (menu_item_id,name,minimum_selections,maximum_selections,is_required) values (%L,'Crust',1,1,true) returning id::text$q$, i_pizza))::uuid;
  o_cheese := t.q('authenticated', u1, format($q$insert into public.add_on_options (add_on_group_id,name,price) values (%L,'Cheese burst',40) returning id::text$q$, g1))::uuid;
  perform t.must('authenticated', u1, format($q$insert into public.promotions (restaurant_id,code,discount_type,discount_value,minimum_order_value,usage_limit) values (%L,'SAVE10','percent',10,500,1)$q$, r1));
  perform t.ok(t.q('authenticated', u3, format($q$insert into public.menu_items (restaurant_id,category_id,name,price) values (%L,%L,'Hack',1)$q$, r1, c1)) like 'ERR:%', 'kitchen staff cannot write menu');
  perform t.ok(t.q('authenticated', u2, format($q$insert into public.menu_items (restaurant_id,category_id,name,price) values (%L,%L,'Hack',1)$q$, r1, c1)) like 'ERR:%', 'other restaurant owner cannot write this menu');
  perform t.ok(t.q('authenticated', u2, format($q$with u as (update public.restaurants set name='Hacked' where id=%L returning 1) select count(*)::text from u$q$, r1)) = '0', 'other owner cannot update this restaurant');

  -- customer-side reads
  perform t.ok(t.q('anon', null, format($q$select count(*)::text from public.menu_items where restaurant_id=%L$q$, r1)) = '3', 'anon can read menu items');
  perform t.ok(t.q('anon', null, $q$select count(*)::text from public.orders$q$) like 'ERR:%', 'anon cannot read orders');
  perform t.ok(t.q('anon', null, $q$select count(*)::text from public.promotions$q$) like 'ERR:%', 'anon cannot read promotions');
  perform t.ok(t.q('anon', null, $q$select count(*)::text from public.tables$q$) like 'ERR:%', 'anon cannot list tables');
  perform t.ok(t.q('anon', null, $q$select public.resolve_table('cafe-one','T01')->>'display_name'$q$) = 'Table 1', 'anon resolves table by code');
  perform t.ok(t.q('anon', null, format(place, 'cafe-one','T01','[]','','','counter','','','k1',repeat('b',64))) like 'ERR:%', 'anon cannot call place_order directly');

  -- order placement (service role = our API route)
  items := jsonb_build_array(jsonb_build_object('menu_item_id', i_pizza, 'quantity', 2, 'variant_id', v_med,
            'add_on_option_ids', jsonb_build_array(o_cheese), 'price', 1, 'unit_price', 1, 'special_instructions', 'less spicy'));
  res := t.q('service_role', null, format(place, 'cafe-one','T01', items, 'Asha','', 'counter','', '', 'key-1', repeat('b',64)));
  perform t.ok(res not like 'ERR:%', 'valid order accepted: ' || res);
  j := res::jsonb; oid := (j->>'order_id')::uuid;
  perform t.ok((select subtotal = 878 and tax_amount = 43.90 and total_amount = 921.90 from public.orders where id = oid), 'server computed 2 x (299+100+40)=878, +5% tax = 921.90 (client price fields ignored)');
  perform t.ok((j->>'order_number')::int = 1, 'order number starts at 1');

  res := t.q('service_role', null, format(place, 'cafe-one','T01', items, 'Asha','', 'counter','', '', 'key-1', repeat('b',64)));
  perform t.ok((res::jsonb->>'order_id')::uuid = oid and (select count(*) from public.orders) = 1, 'same idempotency key does not create a duplicate');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', items, 'Asha','', 'counter','', '', 'key-1', repeat('c',64))) like 'ERR:IDEMPOTENCY_CONFLICT%', 'idempotency key with different token rejected');

  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','NOPE', items, '','', 'counter','', '', 'k2', repeat('b',64))) like 'ERR:INVALID_TABLE%', 'unknown table rejected');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T02', items, '','', 'counter','', '', 'k3', repeat('b',64))) like 'ERR:INVALID_TABLE%', 'inactive table rejected');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','X01', items, '','', 'counter','', '', 'k4', repeat('b',64))) like 'ERR:INVALID_TABLE%', 'table of another restaurant rejected');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_soup,'quantity',1)), '','', 'counter','', '', 'k5', repeat('b',64))) like 'ERR:ITEM_UNAVAILABLE%', 'unavailable item cannot be ordered');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_pizza,'quantity',1,'add_on_option_ids',jsonb_build_array(o_cheese))), '','', 'counter','', '', 'k6', repeat('b',64))) like 'ERR:VARIANT_REQUIRED%', 'required variant enforced');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_pizza,'quantity',1,'variant_id',v_reg)), '','', 'counter','', '', 'k7', repeat('b',64))) like 'ERR:ADDON_SELECTION%', 'required add-on group enforced');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_other,'quantity',1,'add_on_option_ids',jsonb_build_array(o_cheese))), '','', 'counter','', '', 'k8', repeat('b',64))) like 'ERR:INVALID_ADDON%', 'add-on from another item rejected');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_other,'quantity',0)), '','', 'counter','', '', 'k9', repeat('b',64))) like 'ERR:INVALID_QUANTITY%', 'zero quantity rejected');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_other,'quantity',1)), '','', 'online','', '', 'k10', repeat('b',64))) like 'ERR:PAYMENT_METHOD_DISABLED%', 'disabled payment method rejected');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_other,'quantity',1)), '','', 'counter','', 'NOSUCH', 'k11', repeat('b',64))) like 'ERR:PROMO_INVALID%', 'invalid promo rejected');

  res := t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_other,'quantity',6)), '','', 'counter','', 'save10', 'k12', repeat('d',64)));
  perform t.ok(res not like 'ERR:%' and (select discount_amount = 59.40 and total_amount = 561.33 from public.orders where id = (res::jsonb->>'order_id')::uuid), 'promo: 6 x 99 = 594, minus 10% = 534.60, plus 5% tax = 561.33');
  perform t.ok(t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_other,'quantity',6)), '','', 'counter','', 'SAVE10', 'k13', repeat('e',64))) like 'ERR:PROMO_INVALID%', 'promo usage limit enforced');

  -- staff workflow
  perform t.ok(t.q('authenticated', u3, format($q$select public.update_order_status(%L,'preparing')::text$q$, oid)) like 'ERR:INVALID_TRANSITION%', 'cannot skip accepted');
  perform t.ok(t.q('authenticated', u2, format($q$select public.update_order_status(%L,'accepted')::text$q$, oid)) like 'ERR:FORBIDDEN%', 'other restaurant staff cannot change status');
  perform t.ok(t.q('anon', null, format($q$select public.update_order_status(%L,'accepted')::text$q$, oid)) like 'ERR:%', 'anon cannot change status');
  perform t.ok(t.q('authenticated', u3, format($q$select public.update_order_status(%L,'accepted')::text$q$, oid)) not like 'ERR:%', 'staff accepts');
  perform t.ok(t.q('authenticated', u3, format($q$select public.update_order_status(%L,'rejected','x')::text$q$, oid)) like 'ERR:INVALID_TRANSITION%', 'cannot reject after accepting');
  perform t.ok(t.q('authenticated', u3, format($q$select public.update_order_status(%L,'preparing')::text$q$, oid)) not like 'ERR:%', 'staff -> preparing');
  perform t.ok(t.q('authenticated', u3, format($q$select public.update_order_status(%L,'ready')::text$q$, oid)) not like 'ERR:%', 'staff -> ready');
  res := t.q('authenticated', u3, format($q$select public.mark_payment_received(%L)::text$q$, oid));
  perform t.ok(res not like 'ERR:%', 'staff marks counter payment received: ' || res);
  perform t.ok((select payment_status = 'paid' from public.orders where id = oid), 'order payment_status is paid after offline payment');
  perform t.ok(t.q('authenticated', u3, format($q$select public.update_order_status(%L,'served')::text$q$, oid)) not like 'ERR:%', 'staff -> served');
  perform t.ok(t.q('authenticated', u3, format($q$select public.update_order_status(%L,'completed')::text$q$, oid)) not like 'ERR:%', 'staff -> completed');
  perform t.ok(t.q('authenticated', u3, format($q$select public.update_order_status(%L,'new')::text$q$, oid)) like 'ERR:%', 'cannot go backwards');
  perform t.ok((select count(*) from public.order_status_history where order_id = oid) = 6, 'status history recorded (new + 5 transitions)');

  -- reject needs reason; workflow_end config
  res := t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_other,'quantity',1)), '','', 'table','', '', 'k14', repeat('f',64)));
  perform t.ok(t.q('authenticated', u1, format($q$select public.update_order_status(%L,'rejected','')::text$q$, res::jsonb->>'order_id')) like 'ERR:REASON_REQUIRED%', 'rejection requires a reason');
  perform t.ok(t.q('authenticated', u1, format($q$select public.update_order_status(%L,'rejected','Out of stock')::text$q$, res::jsonb->>'order_id')) not like 'ERR:%', 'rejection with reason ok');
  perform t.must('authenticated', u1, format($q$update public.restaurants set settings = jsonb_set(settings,'{workflow_end}','"ready"') where id=%L$q$, r1));
  res := t.q('service_role', null, format(place, 'cafe-one','T01', jsonb_build_array(jsonb_build_object('menu_item_id', i_other,'quantity',1)), '','', 'table','', '', 'k15', repeat('9',64)));
  perform t.must('authenticated', u1, format($q$select public.update_order_status(%L,'accepted')$q$, res::jsonb->>'order_id'));
  perform t.must('authenticated', u1, format($q$select public.update_order_status(%L,'preparing')$q$, res::jsonb->>'order_id'));
  perform t.must('authenticated', u1, format($q$select public.update_order_status(%L,'ready')$q$, res::jsonb->>'order_id'));
  perform t.ok(t.q('authenticated', u1, format($q$select public.update_order_status(%L,'served')::text$q$, res::jsonb->>'order_id')) like 'ERR:INVALID_TRANSITION%', 'workflow ending at Ready stops there');

  -- isolation
  perform t.ok(t.q('authenticated', u3, $q$select count(*)::text from public.orders$q$)::int >= 3, 'staff sees own restaurant orders');
  perform t.ok(t.q('authenticated', u2, $q$select count(*)::text from public.orders$q$) = '0', 'other restaurant sees zero orders');
  perform t.ok(t.q('authenticated', u2, $q$select count(*)::text from public.order_items$q$) = '0', 'other restaurant sees zero order items');
  perform t.ok(t.q('authenticated', u3, format($q$update public.orders set total_amount = 1 where id=%L$q$, oid)) like 'ERR:%', 'staff cannot edit order amounts directly');
  perform t.ok(t.q('authenticated', u3, $q$select count(*)::text from public.promotions$q$) = '0', 'kitchen staff cannot read promotions');
  perform t.ok(t.q('authenticated', u1, format($q$select count(*)::text from public.public_noop$q$)) like 'ERR:%', 'sanity: error path works');

  -- snapshots survive menu edits / deletes
  perform t.must('authenticated', u1, format($q$update public.menu_items set price = 999, name='Renamed' where id=%L$q$, i_pizza));
  perform t.must('authenticated', u1, format($q$delete from public.menu_items where id=%L$q$, i_pizza));
  perform t.ok((select item_name_snapshot = 'Margherita' and unit_price_snapshot = 439 and menu_item_id is null from public.order_items where order_id = oid), 'order items keep snapshots after menu item is edited and deleted');

  -- reports
  j := t.q('authenticated', u1, format($q$select public.report_summary(%L, current_date - 1, current_date)::text$q$, r1))::jsonb;
  perform t.ok((j->>'total_orders')::int = 3 and (j->>'cancelled_orders')::int = 1, 'report counts orders and cancellations: ' || j::text);
  perform t.ok(t.q('authenticated', u3, format($q$select public.report_summary(%L, current_date - 1, current_date)::text$q$, r1)) like 'ERR:FORBIDDEN%', 'staff cannot read reports');
  raise notice 'ALL SQL TESTS PASSED';
end $$;
