import type { Product } from './types';
import { supabase, isSupabaseConfigured } from './supabase';

export async function fetchProducts(): Promise<Product[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.from('products')
    .select('id,name,category,price,unit,stock,emoji,barcode,image_url')
    .eq('active', true).order('name');
  if (error) throw error;
  return (data ?? []) as Product[];
}
export function subscribeToProducts(onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase.channel('products-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onChange).subscribe();
  return () => { void supabase.removeChannel(channel); };
}
export async function saveProductPrice(id: string, price: number) {
  if (!supabase) throw new Error('اتصال پایگاه داده تنظیم نشده است.');
  const { error } = await supabase.from('products').update({ price }).eq('id', id);
  if (error) throw error;
}
export async function uploadProductImage(uri: string): Promise<string> {
  if (!supabase) throw new Error('اتصال پایگاه داده تنظیم نشده است.');
  const response = await fetch(uri); const blob = await response.blob();
  const ext = (uri.split('.').pop() || 'jpg').split('?')[0];
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('product-images').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
export async function saveProduct(input: {name:string;category:string;barcode:string|null;price:number;stock:number;unit:string;image_url:string|null;emoji:string;active:boolean}) {
  if (!supabase) throw new Error('اتصال پایگاه داده تنظیم نشده است.');
  const { data, error } = await supabase.from('products').insert(input).select('id,name,category,price,unit,stock,emoji,barcode,image_url').single();
  if (error) throw error;
  return data as Product;
}
