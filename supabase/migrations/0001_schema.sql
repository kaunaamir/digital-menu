-- 0001_schema.sql : core tables, constraints, indexes

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  logo_url text,
  cover_image_url text,
  description text,
  address text,
  phone text,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  opening_hours jsonb not null default '{}'::jsonb,   -- {"text": "10:00 - 23:00"}
  is_accepting_orders boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  order_counter integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
create index on public.restaurant_members (user_id);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number text not null check (table_number ~ '^[A-Za-z0-9_-]{1,20}$'),
  display_name text not null check (length(display_name) between 1 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, table_number)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true
);
create index on public.categories (restaurant_id, display_order);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text,
  image_url text,
  price numeric(10,2) not null check (price >= 0),
  original_price numeric(10,2) check (original_price is null or original_price >= 0),
  dietary_type text not null default 'veg' check (dietary_type in ('veg','non_veg','vegan','egg')),
  is_spicy boolean not null default false,
  allergens text[] not null default '{}',
  preparation_time integer check (preparation_time is null or preparation_time >= 0),
  is_available boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.menu_items (restaurant_id, category_id, display_order);

create table public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  price_adjustment numeric(10,2) not null default 0,
  is_active boolean not null default true,
  display_order integer not null default 0
);
create index on public.menu_item_variants (menu_item_id);

create table public.add_on_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  minimum_selections integer not null default 0 check (minimum_selections >= 0),
  maximum_selections integer not null default 1 check (maximum_selections >= 1),
  is_required boolean not null default false,
  display_order integer not null default 0,
  check (maximum_selections >= minimum_selections)
);
create index on public.add_on_groups (menu_item_id);

create table public.add_on_options (
  id uuid primary key default gen_random_uuid(),
  add_on_group_id uuid not null references public.add_on_groups(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0 check (price >= 0),
  is_available boolean not null default true,
  display_order integer not null default 0
);
create index on public.add_on_options (add_on_group_id);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code text not null check (length(code) between 2 and 30),
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  minimum_order_value numeric(10,2) not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0,
  is_active boolean not null default true
);
create unique index promotions_code_uq on public.promotions (restaurant_id, upper(code));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete restrict,
  order_number integer not null,
  customer_name text,
  customer_phone text,
  status text not null default 'new' check (status in ('new','accepted','preparing','ready','served','completed','rejected','cancelled')),
  payment_method text not null check (payment_method in ('counter','table','online')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed')),
  subtotal numeric(10,2) not null,
  tax_amount numeric(10,2) not null default 0,
  service_charge numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,
  promo_code text,
  order_notes text,
  status_reason text,
  tracking_token_hash text not null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, order_number)
);
create unique index orders_idem_uq on public.orders (restaurant_id, idempotency_key) where idempotency_key is not null;
create index orders_token_idx on public.orders (tracking_token_hash);
create index orders_rest_created_idx on public.orders (restaurant_id, created_at desc);
create index orders_rest_status_idx on public.orders (restaurant_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name_snapshot text not null,
  quantity integer not null check (quantity between 1 and 50),
  unit_price_snapshot numeric(10,2) not null,
  selected_variant_snapshot jsonb,
  selected_add_ons_snapshot jsonb not null default '[]'::jsonb,
  special_instructions text,
  line_total numeric(10,2) not null
);
create index on public.order_items (order_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create index on public.order_status_history (order_id, created_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,                 -- 'razorpay' | 'offline'
  provider_order_id text,
  provider_payment_id text,
  amount numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payments_provider_payment_uq on public.payments (provider, provider_payment_id) where provider_payment_id is not null;
create unique index payments_provider_order_uq on public.payments (provider, provider_order_id) where provider_order_id is not null;
create index on public.payments (order_id);

-- updated_at maintenance
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_restaurants_upd before update on public.restaurants for each row execute function public.touch_updated_at();
create trigger t_menu_items_upd before update on public.menu_items for each row execute function public.touch_updated_at();
create trigger t_orders_upd before update on public.orders for each row execute function public.touch_updated_at();
create trigger t_payments_upd before update on public.payments for each row execute function public.touch_updated_at();

-- profile row for every new auth user
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', '')) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
