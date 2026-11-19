export type Product = { id:string; name:string; category:string; price:number; unit:string; stock:number; emoji:string; barcode?:string|null; image_url?:string|null };
export type OrderStatus = 'ثبت شده'|'در حال آماده‌سازی'|'ارسال شده'|'تحویل شد'|'لغو شد';
export type Order = { id:string; items:{productId:string; name:string; qty:number; price:number}[]; subtotal:number; delivery:number; total:number; status:OrderStatus; createdAt:string; walletCredited:boolean };
