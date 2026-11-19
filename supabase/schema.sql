-- سوپرمارکت صدرا | Supabase SQL
-- این فایل را در Supabase > SQL Editor اجرا کنید.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'عمومی',
  price bigint not null check (price >= 0),
  unit text not null default 'عدد',
  stock integer not null default 0 check (stock >= 0),
  emoji text not null default '🛒',
  barcode text,
  image_url text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  status text not null default 'ثبت شده'
    check (status in ('ثبت شده','در حال آماده‌سازی','ارسال شده','تحویل شد','لغو شد')),
  subtotal bigint not null check (subtotal >= 0),
  delivery_fee bigint not null default 0 check (delivery_fee >= 0),
  total bigint not null check (total >= 0),
  wallet_earned bigint not null default 0,
  wallet_released boolean not null default false,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0)
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  order_id uuid references public.orders(id),
  amount bigint not null,
  kind text not null check (kind in ('gift_pending','gift_release','spend','adjustment')),
  available_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "profiles own or admin read" on public.profiles;
create policy "profiles own or admin read" on public.profiles for select
using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update
using (id = auth.uid()) with check (id = auth.uid() and role = 'customer');

drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products for select using (active = true or public.is_admin());
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products for all
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders owner or admin read" on public.orders;
create policy "orders owner or admin read" on public.orders for select
using (customer_id = auth.uid() or public.is_admin());
drop policy if exists "order items owner or admin read" on public.order_items;
create policy "order items owner or admin read" on public.order_items for select
using (exists(select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_admin())));
drop policy if exists "wallet owner or admin read" on public.wallet_transactions;
create policy "wallet owner or admin read" on public.wallet_transactions for select
using (customer_id = auth.uid() or public.is_admin());

-- ثبت سفارش باید فقط از طریق RPC سمت سرور انجام شود تا قیمت و موجودی قابل دستکاری از اپ نباشد.
create or replace function public.place_order(items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal bigint := 0;
  v_delivery bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_total bigint;
begin
  if auth.uid() is null then raise exception 'برای ثبت سفارش ابتدا وارد شوید'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'سبد خرید خالی است';
  end if;

  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty <= 0 then raise exception 'تعداد کالا نامعتبر است'; end if;
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and active = true for update;
    if not found then raise exception 'کالا موجود نیست'; end if;
    if v_product.stock < v_qty then raise exception 'موجودی % کافی نیست', v_product.name; end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  if v_subtotal <= 500000 then v_delivery := 30000; end if;
  v_total := v_subtotal + v_delivery;

  insert into public.orders(customer_id,subtotal,delivery_fee,total,wallet_earned)
  values(auth.uid(),v_subtotal,v_delivery,v_total,floor(v_subtotal * 0.03))
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid for update;
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price)
    values(v_order_id,v_product.id,v_product.name,v_qty,v_product.price);
    update public.products set stock = stock - v_qty, updated_at = now() where id = v_product.id;
  end loop;
  return v_order_id;
end;
$$;

-- فقط مدیر می‌تواند وضعیت سفارش را تغییر دهد. هنگام تحویل، هدیه ۳٪ به حالت انتظار می‌رود.
create or replace function public.admin_set_order_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_order public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'دسترسی مدیر لازم است'; end if;
  if p_status not in ('در حال آماده‌سازی','ارسال شده','تحویل شد','لغو شد') then raise exception 'وضعیت نامعتبر'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'سفارش پیدا نشد'; end if;
  update public.orders set status=p_status,
    delivered_at=case when p_status='تحویل شد' then now() else delivered_at end
    where id=p_order_id;
  if p_status='تحویل شد' and v_order.status <> 'تحویل شد' then
    insert into public.wallet_transactions(customer_id,order_id,amount,kind,available_at,note)
    values(v_order.customer_id,v_order.id,v_order.wallet_earned,'gift_pending',
      (date_trunc('month', now()) + interval '1 month'), 'هدیه ۳ درصد سفارش؛ آزادسازی در پایان ماه');
  end if;
end;
$$;

grant execute on function public.place_order(jsonb) to authenticated;
grant execute on function public.admin_set_order_status(uuid,text) to authenticated;

-- انتشار تغییرات محصولات برای دریافت زنده در اپ و وب
do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- پس از ایجاد حساب کاربری مدیر، این دستور را با شناسه واقعی auth.users اجرا کنید:
-- update public.profiles set role='admin' where id='UUID-OF-ADMIN-USER';
-- پروفایل‌ها را در مرحله ثبت‌نام از طریق trigger یا API امن ایجاد کنید.
