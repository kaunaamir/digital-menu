-- Optional demo data. First sign up in the app, create your restaurant, then run this in the SQL editor
-- after replacing the slug below. It adds a few categories/items/tables to that restaurant.
do $$
declare rid uuid; c1 uuid; c2 uuid; i1 uuid; g uuid;
begin
  select id into rid from public.restaurants where slug = 'your-restaurant-slug';
  if rid is null then raise exception 'Restaurant slug not found - edit seed.sql first'; end if;
  insert into public.tables (restaurant_id, table_number, display_name) values
    (rid,'T01','Table 1'),(rid,'T02','Table 2'),(rid,'T03','Table 3') on conflict do nothing;
  insert into public.categories (restaurant_id, name, display_order) values (rid,'Starters',1) returning id into c1;
  insert into public.categories (restaurant_id, name, display_order) values (rid,'Pizza',2) returning id into c2;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, dietary_type, display_order)
    values (rid,c1,'Paneer Tikka','Smoky tandoor-grilled paneer with mint chutney',249,'veg',1),
           (rid,c1,'Chicken Wings','Crispy wings tossed in hot sauce',299,'non_veg',2);
  insert into public.menu_items (restaurant_id, category_id, name, description, price, dietary_type, display_order)
    values (rid,c2,'Margherita Pizza','Tomato, mozzarella, basil',299,'veg',1) returning id into i1;
  insert into public.menu_item_variants (menu_item_id, name, price_adjustment, display_order)
    values (i1,'Regular 8"',0,1),(i1,'Medium 10"',100,2),(i1,'Large 12"',200,3);
  insert into public.add_on_groups (menu_item_id, name, minimum_selections, maximum_selections, is_required)
    values (i1,'Extra toppings',0,3,false) returning id into g;
  insert into public.add_on_options (add_on_group_id, name, price) values (g,'Extra cheese',40),(g,'Olives',30),(g,'Jalapeños',30);
end $$;
