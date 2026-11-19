-- این فایل را یک‌بار در Supabase SQL Editor اجرا کنید تا بارگذاری عکس محصولات فعال شود.
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists image_url text;
create unique index if not exists products_barcode_unique
on public.products(barcode) where barcode is not null and barcode <> '';

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());
