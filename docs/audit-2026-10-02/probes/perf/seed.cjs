process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8480';
const req=require('module').createRequire('/home/user/Wasatofficial-Shop-/functions/index.js');
const admin=req('firebase-admin');
const {getFirestore}=req('firebase-admin/firestore');
const fs=require('fs');
const app=admin.initializeApp({projectId:'ai-studio-applet-webapp-e9574'});
const db=getFirestore(app,'ai-studio-manstyle-2b22f2fb-6b7b-4e97-90a0-bda904528869');
const photos=JSON.parse(fs.readFileSync(__dirname+'/photos.json'));
const mode=process.argv[2]; // live | p50
const cats=[{id:'shirts',name:'Рубашки',icon:'shirt'},{id:'tshirts',name:'Футболки',icon:'shirt'},{id:'trousers',name:'Брюки',icon:'other'}];
function prod(i,nImg){const sizes=['S','M','L','XL'];const colors=[{name:'Синий',hex:'#2C4A6B'},{name:'Серый',hex:'#888888'}];
 const skus=[];for(const s of sizes)for(const c of colors)skus.push({id:`${i}-${s}-${c.name}`,size:s,color:c.name,stock:5,sku:`WS-${i}-${s}`});
 return {id:'p'+i,title:'Рубашка льняная модель '+i,category:cats[i%3].id,categoryLabel:cats[i%3].name,price:3000+i*100,description:'Описание товара '+i+' '.repeat(10)+'Лён, свободный крой, на каждый день. '.repeat(6),
 material:'Лён',images:Array.from({length:nImg},(_,k)=>photos[(i*3+k)%photos.length]),colors,sizes,inStock:true,skus,isPopular:i<10,rating:0,reviewsCount:0};}
(async()=>{
 const old=await db.collection('products').listDocuments();for(const d of old)await d.delete();
 await db.doc('settings/storefront').set({storeName:'Wasat Shop',categories:cats,paymentMethods:[{id:'card',title:'Перевод на карту',isActive:true}],freeDeliveryThreshold:10000,returnDays:14});
 await db.doc('delivery_methods/courier').set({id:'courier',name:'Курьер',price:400,isActive:true,type:'courier'});
 const n=mode==='p50'?50:7;
 for(let i=0;i<n;i++){const nImg=mode==='p50'?1+(i%3):(i===0?3:0);await db.doc('products/p'+i).set(prod(i,nImg));}
 const snap=await db.collection('products').get();let bytes=0;snap.forEach(d=>bytes+=JSON.stringify(d.data()).length);
 console.log(mode,'products',snap.size,'json chars',bytes);process.exit(0);})();
