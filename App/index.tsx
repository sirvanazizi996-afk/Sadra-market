import React, {useMemo, useState} from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, Platform, Image } from 'react-native';
import { STORE } from '../src/config';
import type {Product,Order,OrderStatus} from '../src/types';
import * as ImagePicker from 'expo-image-picker';
import { fetchProducts, subscribeToProducts, saveProductPrice, saveProduct, uploadProductImage } from '../src/data';
import { isSupabaseConfigured } from '../src/supabase';

const initialProducts:Product[] = [
 {id:'p1',name:'شیر کم‌چرب',category:'لبنیات',price:38000,unit:'بطری ۱ لیتری',stock:30,emoji:'🥛'},
 {id:'p2',name:'ماست',category:'لبنیات',price:52000,unit:'دبه ۱ کیلویی',stock:20,emoji:'🥣'},
 {id:'p3',name:'برنج ایرانی',category:'خشکبار',price:185000,unit:'کیسه ۱ کیلویی',stock:40,emoji:'🍚'},
 {id:'p4',name:'روغن مایع',category:'مواد غذایی',price:92000,unit:'بطری',stock:18,emoji:'🫒'},
 {id:'p5',name:'تخم‌مرغ',category:'پروتئینی',price:110000,unit:'شانه',stock:15,emoji:'🥚'},
 {id:'p6',name:'نوشابه',category:'نوشیدنی',price:35000,unit:'بطری',stock:25,emoji:'🥤'},
 {id:'p7',name:'رب گوجه‌فرنگی',category:'مواد غذایی',price:47000,unit:'قوطی',stock:22,emoji:'🍅'},
 {id:'p8',name:'دستمال کاغذی',category:'بهداشتی',price:68000,unit:'بسته',stock:12,emoji:'🧻'},
];
const money=(n:number)=>new Intl.NumberFormat('fa-IR').format(n)+' تومان';
const Card=({children,style}:any)=><View style={[{backgroundColor:'#fff',borderRadius:16,padding:14,marginBottom:12,borderWidth:1,borderColor:'#e5eee6'},style]}>{children}</View>;
const Btn=({title,onPress,secondary=false}:any)=><Pressable onPress={onPress} style={{backgroundColor:secondary?'#eaf4ec':'#168044',padding:12,borderRadius:12,alignItems:'center',marginTop:8}}><Text style={{color:secondary?'#17683a':'white',fontWeight:'700'}}>{title}</Text></Pressable>;

export default function Home(){
 const [tab,setTab]=useState<'shop'|'cart'|'orders'|'wallet'|'admin'>('shop');
 const [products,setProducts]=useState(initialProducts);
 const [connectionLabel,setConnectionLabel]=useState(isSupabaseConfigured?'در حال اتصال به پایگاه داده...':'حالت آزمایشی؛ پایگاه داده هنوز تنظیم نشده');
 const [cart,setCart]=useState<Record<string,number>>({});
 const [orders,setOrders]=useState<Order[]>([]);
 const [wallet,setWallet]=useState(0);
 const [pendingWallet,setPendingWallet]=useState(0);
 const [search,setSearch]=useState('');
 const [newName,setNewName]=useState('');
 const [newCategory,setNewCategory]=useState('لبنیات');
 const [newBarcode,setNewBarcode]=useState('');
 const [newPrice,setNewPrice]=useState('');
 const [newStock,setNewStock]=useState('');
 const [newUnit,setNewUnit]=useState('عدد');
 const [newImage,setNewImage]=useState<string|null>(null);
 const [savingProduct,setSavingProduct]=useState(false);
 React.useEffect(()=>{
   let active=true;
   const load=async()=>{try{const rows=await fetchProducts();if(active&&rows){setProducts(rows);setConnectionLabel('متصل به پایگاه داده آنلاین');}}catch(e){if(active)setConnectionLabel('خطا در دریافت اطلاعات آنلاین');}};
   void load();
   const stop=subscribeToProducts(()=>{void load();});
   return ()=>{active=false;stop();};
 },[]);
 const [phone,setPhone]=useState('');
 const subtotal=useMemo(()=>products.reduce((s,p)=>s+p.price*(cart[p.id]||0),0),[products,cart]);
 const delivery=subtotal>STORE.freeDeliveryThreshold?0:(subtotal===0?0:30000);
 const visible=products.filter(p=>(p.name+' '+p.category).includes(search));
 const add=(id:string)=>setCart(c=>({...c,[id]:(c[id]||0)+1}));
 const changePrice=async(id:string,value:string)=>{
   const price=Math.max(0,Number(value)||0);
   setProducts(ps=>ps.map(p=>p.id===id?{...p,price}:p));
   if(isSupabaseConfigured){try{await saveProductPrice(id,price);setConnectionLabel('قیمت در سرور ذخیره شد');}catch(e){setConnectionLabel('ذخیره قیمت ناموفق بود؛ دسترسی مدیر را بررسی کنید');}}
 };
 const chooseProductImage=async()=>{
   const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
   if(!permission.granted){Alert.alert('دسترسی لازم است','برای انتخاب عکس، اجازه دسترسی به گالری را بدهید.');return;}
   const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeOptions.Images,quality:0.75});
   if(!result.canceled)setNewImage(result.assets[0].uri);
 };
 const addProduct=async()=>{
   if(!newName.trim()||!newPrice.trim()){Alert.alert('اطلاعات ناقص','نام و قیمت کالا را وارد کنید.');return;}
   if(!isSupabaseConfigured){Alert.alert('اتصال لازم است','برای ذخیره دائمی، ابتدا اتصال Supabase را تنظیم کنید.');return;}
   setSavingProduct(true);
   try{
     let image_url:string|null=null;
     if(newImage) image_url=await uploadProductImage(newImage);
     const row=await saveProduct({name:newName.trim(),category:newCategory.trim()||'عمومی',barcode:newBarcode.trim()||null,price:Math.max(0,Number(newPrice)),stock:Math.max(0,Number(newStock)||0),unit:newUnit.trim()||'عدد',image_url,emoji:'🛒',active:true});
     setProducts(ps=>[row,...ps]);setNewName('');setNewBarcode('');setNewPrice('');setNewStock('');setNewImage(null);
     Alert.alert('ذخیره شد','کالا به فهرست فروشگاه اضافه شد.');
   }catch(e:any){Alert.alert('ذخیره ناموفق',e?.message||'اتصال یا مجوزهای پایگاه داده را بررسی کنید.');}
   finally{setSavingProduct(false);}
 };
 const placeOrder=()=>{
   if(!Object.values(cart).some(Boolean)){Alert.alert('سبد خرید خالی است');return;}
   const items=products.filter(p=>cart[p.id]).map(p=>({productId:p.id,name:p.name,qty:cart[p.id],price:p.price}));
   const order:Order={id:'SD-'+Date.now().toString().slice(-6),items,subtotal,delivery,total:subtotal+delivery,status:'ثبت شده',createdAt:new Date().toLocaleString('fa-IR'),walletCredited:false};
   setOrders(o=>[order,...o]); setCart({});
   Alert.alert('سفارش ثبت شد','سفارش شما با موفقیت ثبت شد. هدیه ۳٪ پس از تحویل موفق به کیف پول اضافه می‌شود.');
   setTab('orders');
 };
 const deliverOrder=(id:string,status:OrderStatus)=>{
   setOrders(os=>os.map(o=>{
     if(o.id!==id)return o;
     const shouldCredit=status==='تحویل شد'&&!o.walletCredited;
     if(shouldCredit)setPendingWallet(w=>w+Math.floor(o.subtotal*STORE.walletRate));
     return {...o,status,walletCredited:o.walletCredited||shouldCredit};
   }));
 };
 const nav=(key:any,label:string)=><Pressable onPress={()=>setTab(key)} style={{flex:1,paddingVertical:11,alignItems:'center',backgroundColor:tab===key?'#e7f4e9':'transparent',borderRadius:10}}><Text style={{fontSize:12,color:tab===key?'#126b37':'#637269',fontWeight:'700'}}>{label}</Text></Pressable>;
 return <View style={{flex:1,backgroundColor:'#f4faf5',paddingTop:Platform.OS==='web'?22:44}}>
  <View style={{paddingHorizontal:16,paddingBottom:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
   <View><Text style={{fontSize:22,fontWeight:'900',color:'#145b32'}}>🛒 صدرا</Text><Text style={{fontSize:11,color:'#637269'}}>خرید آسان، سریع و مطمئن</Text><Text style={{fontSize:10,color:isSupabaseConfigured?'#168044':'#a66a16',marginTop:3}}>{connectionLabel}</Text></View>
   <View style={{backgroundColor:'#e2f2e5',padding:9,borderRadius:12}}><Text style={{fontWeight:'800',color:'#17683a'}}>باشگاه مشتریان</Text></View>
  </View>
  <View style={{flexDirection:'row',marginHorizontal:12,backgroundColor:'#fff',padding:5,borderRadius:14,marginBottom:10}}>
   {nav('shop','فروشگاه')}{nav('cart','سبد خرید')}{nav('orders','سفارش‌ها')}{nav('wallet','کیف پول')}{nav('admin','مدیریت')}
  </View>
  <ScrollView contentContainerStyle={{padding:14,paddingBottom:35}}>
   {tab==='shop'&&<>
    <Card style={{backgroundColor:'#17683a',borderColor:'#17683a'}}><Text style={{color:'#fff',fontSize:20,fontWeight:'900'}}>به فروشگاه صدرا خوش آمدید</Text><Text style={{color:'#e4f5e8',marginTop:6}}>خرید بالای ۵۰۰ هزار تومان = ارسال رایگان</Text><Text style={{color:'#e4f5e8',marginTop:4}}>۳٪ هدیه خرید در کیف پول شما</Text></Card>
    <TextInput value={search} onChangeText={setSearch} placeholder="جستجوی کالا..." style={{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:12,textAlign:'right',borderWidth:1,borderColor:'#e5eee6'}}/>
    {visible.map(p=><Card key={p.id}><View style={{flexDirection:'row',alignItems:'center',gap:12}}>{p.image_url?<Image source={{uri:p.image_url}} style={{width:58,height:58,borderRadius:10}}/>:<Text style={{fontSize:30}}>{p.emoji}</Text>}<View style={{flex:1}}><Text style={{fontWeight:'800',fontSize:16,color:'#21352a'}}>{p.name}</Text><Text style={{color:'#7a8980',fontSize:12}}>{p.category} • {p.unit} • موجودی: {p.stock}</Text><Text style={{color:'#17683a',fontWeight:'900',marginTop:4}}>{money(p.price)}</Text></View><Pressable onPress={()=>add(p.id)} style={{backgroundColor:'#168044',paddingHorizontal:16,paddingVertical:10,borderRadius:10}}><Text style={{color:'#fff',fontWeight:'900'}}>+ افزودن</Text></Pressable></View></Card>)}
   </>}
   {tab==='cart'&&<>
    <Text style={{fontSize:20,fontWeight:'900',marginBottom:12,color:'#145b32'}}>سبد خرید</Text>
    {products.filter(p=>cart[p.id]).map(p=><Card key={p.id}><Text style={{fontWeight:'800'}}>{p.name} × {cart[p.id]}</Text><Text style={{color:'#17683a',marginTop:5}}>{money(p.price*cart[p.id])}</Text><View style={{flexDirection:'row',gap:8}}><Btn title="+" onPress={()=>add(p.id)}/><Btn title="−" secondary onPress={()=>setCart(c=>({...c,[p.id]:Math.max(0,(c[p.id]||0)-1)}))}/></View></Card>)}
    <Card><Text>جمع کالاها: {money(subtotal)}</Text><Text style={{marginTop:6}}>هزینه پیک: {subtotal>STORE.freeDeliveryThreshold?'رایگان':money(delivery)}</Text><Text style={{fontWeight:'900',fontSize:18,marginTop:8}}>مبلغ نهایی: {money(subtotal+delivery)}</Text><Text style={{color:'#17683a',marginTop:5}}>هدیه پس از تحویل: {money(Math.floor(subtotal*.03))}</Text><Btn title="ثبت سفارش" onPress={placeOrder}/></Card>
   </>}
   {tab==='orders'&&<><Text style={{fontSize:20,fontWeight:'900',marginBottom:12,color:'#145b32'}}>سفارش‌های من</Text>{orders.length===0?<Text style={{color:'#718078'}}>هنوز سفارشی ثبت نشده است.</Text>:orders.map(o=><Card key={o.id}><Text style={{fontWeight:'900'}}>{o.id} • {o.status}</Text><Text style={{marginTop:5}}>{o.items.map(i=>i.name+' × '+i.qty).join('، ')}</Text><Text style={{marginTop:5}}>مبلغ: {money(o.total)}</Text><Text style={{fontSize:12,color:'#718078',marginTop:4}}>{o.createdAt}</Text></Card>)}</>}
   {tab==='wallet'&&<><Card style={{backgroundColor:'#17683a',borderColor:'#17683a'}}><Text style={{color:'#e3f4e7'}}>اعتبار آزادشده</Text><Text style={{fontSize:28,color:'#fff',fontWeight:'900',marginTop:8}}>{money(wallet)}</Text><Text style={{color:'#e3f4e7',marginTop:12}}>هدیه در انتظار پایان ماه</Text><Text style={{fontSize:22,color:'#fff',fontWeight:'800',marginTop:4}}>{money(pendingWallet)}</Text><Text style={{color:'#e3f4e7',fontSize:12,marginTop:6}}>۳٪ پس از تحویل موفق سفارش محاسبه می‌شود و در پایان ماه آزاد خواهد شد.</Text></Card><Text style={{color:'#65756b'}}>این نسخه نمایشی است؛ آزادسازی و خرج‌کردن اعتبار در نسخه متصل به سرور پیاده‌سازی می‌شود.</Text></>}
   {tab==='admin'&&<><Text style={{fontSize:20,fontWeight:'900',marginBottom:6,color:'#145b32'}}>مدیریت فروشگاه</Text><Card><Text style={{fontWeight:'900',marginBottom:8}}>ویرایش قیمت محصولات (نمونه اولیه)</Text><Text style={{fontWeight:'900',marginBottom:8}}>افزودن کالای جدید</Text>
   <Btn title={newImage?'عکس انتخاب شد؛ تغییر عکس':'انتخاب عکس از گالری'} onPress={chooseProductImage} secondary/>
   {newImage?<Text style={{color:'#168044',marginTop:5}}>عکس برای بارگذاری انتخاب شده است.</Text>:null}
   {[['نام کالا',newName,setNewName],['دسته‌بندی',newCategory,setNewCategory],['بارکد',newBarcode,setNewBarcode],['قیمت به تومان',newPrice,setNewPrice],['موجودی',newStock,setNewStock],['واحد فروش',newUnit,setNewUnit]].map(([label,value,setter]:any)=><TextInput key={label} value={value} onChangeText={setter} placeholder={label} keyboardType={label==='قیمت به تومان'||label==='موجودی'?'numeric':'default'} style={{borderWidth:1,borderColor:'#dce8de',borderRadius:9,padding:11,textAlign:'right',marginTop:8,backgroundColor:'#fbfefb'}}/>)}
   <Btn title={savingProduct?'در حال ذخیره...':'ذخیره کالا'} onPress={addProduct}/>
   <Text style={{fontWeight:'900',marginTop:18,marginBottom:8}}>ویرایش قیمت محصولات</Text>{products.map(p=><View key={p.id} style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:10}}><Text style={{flex:1,fontWeight:'700'}}>{p.name}</Text><TextInput keyboardType="numeric" defaultValue={String(p.price)} onEndEditing={e=>changePrice(p.id,e.nativeEvent.text)} style={{width:125,borderWidth:1,borderColor:'#dce8de',borderRadius:8,padding:8,textAlign:'center',backgroundColor:'#fbfefb'}}/></View>)}</Card><Text style={{fontWeight:'900',marginBottom:8}}>مدیریت سفارش‌ها</Text>{orders.map(o=><Card key={o.id}><Text style={{fontWeight:'800'}}>{o.id} — {money(o.total)}</Text><Text style={{marginTop:5}}>وضعیت: {o.status}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8}}>{(['در حال آماده‌سازی','ارسال شده','تحویل شد','لغو شد'] as OrderStatus[]).map(s=><Pressable onPress={()=>deliverOrder(o.id,s)} style={{backgroundColor:'#e7f4e9',padding:8,borderRadius:8}}><Text style={{fontSize:11,color:'#17683a'}}>{s}</Text></Pressable>)}</View></Card>)}</>}
   <Card style={{marginTop:8}}><Text style={{fontWeight:'900',color:'#145b32'}}>{STORE.name}</Text><Text style={{fontSize:12,color:'#64746a',marginTop:4}}>{STORE.address}</Text><Text style={{fontSize:12,color:'#64746a',marginTop:4}}>تلفن: {STORE.phone}</Text></Card>
  </ScrollView>
 </View>;
}
