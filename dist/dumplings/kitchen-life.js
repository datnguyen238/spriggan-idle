/* A forgiving kitchen: only active time cooks; nothing burns or expires. */
(()=>{'use strict';const KEY='spriggan.dumplings.v1',CAPACITY=6,STEAM_SECONDS=35,FILLINGS=['mushroom','greens','ginger','meat'];
const GUEST_NAMES=['June','Theo','Mina','Bo'];
function newGuest(id,seat,takeaway=false){return{id,seat,takeaway,order:[],kind:id%4,name:GUEST_NAMES[id%4],phase:'arriving',age:0,meal:null}}
function newShop(){return{earningsId:globalThis.crypto?.randomUUID?.()||'shop-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),guests:[{...newGuest(0,0),age:3}],nextId:1,nextArrival:18,coins:0,sales:0}}
function decodeShop(raw){const shop=newShop();if(!raw||typeof raw!=='object')return shop;shop.earningsId=typeof raw.earningsId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(raw.earningsId)?raw.earningsId:'legacy-kitchen';for(const key of ['coins','sales','nextId'])if(Number.isSafeInteger(raw[key])&&raw[key]>=0)shop[key]=Math.min(raw[key],1000000000);if(Number.isFinite(raw.nextArrival))shop.nextArrival=Math.max(0,Math.min(45,raw.nextArrival));if(Array.isArray(raw.guests)){const seats=new Set(),ids=new Set();shop.guests=raw.guests.slice(0,4).filter(c=>c&&Number.isInteger(c.seat)&&c.seat>=0&&c.seat<4&&(c.seat<3||c.takeaway===true)&&!seats.has(c.seat)&&(seats.add(c.seat),true)).map((c,i)=>{let id=Number.isSafeInteger(c.id)&&c.id>=0&&c.id<1000000000?c.id:i;while(ids.has(id))id++;ids.add(id);const a=newGuest(id,c.seat);a.phase=['arriving','waiting','paying','seating','eating','leaving'].includes(c.phase)?c.phase:'arriving';a.age=Number.isFinite(c.age)?Math.max(0,Math.min(30,c.age)):0;a.meal=FILLINGS.includes(c.meal)?c.meal:null;a.takeaway=c.takeaway===true;a.order=Array.isArray(c.order)?c.order.filter(f=>FILLINGS.includes(f)).slice(0,6):[];if(!a.takeaway)a.order=[];if(a.takeaway&&['seating','eating'].includes(a.phase)){a.phase='leaving';a.age=0}if(['paying','seating','eating'].includes(a.phase)&&!a.meal){a.phase='waiting';a.age=0}if(['waiting','arriving'].includes(a.phase)){a.meal=null;a.order=[];}return a});shop.nextId=Math.max(shop.nextId,...shop.guests.map(c=>c.id+1))}return shop}
function updateShop(s,dt,reserved=0){const shop=s.shop;for(const c of shop.guests){c.age+=dt;const next=phase=>{c.phase=phase;c.age=0};if(c.phase==='arriving'&&c.age>=6)next('waiting');else if(c.phase==='waiting'&&s.plate.length>reserved){const count=c.takeaway?Math.min(6,s.plate.length-reserved):1;c.order=c.takeaway?s.plate.splice(0,count):[];c.meal=c.takeaway?c.order[0]:s.plate.shift();shop.coins+=count*3;shop.sales+=count;next('paying')}else if(c.phase==='paying'&&c.age>=2.5)next(c.takeaway?'leaving':'seating');else if(c.phase==='seating'&&c.age>=4)next('eating');else if(c.phase==='eating'&&c.age>=18)next('leaving')}
 shop.guests=shop.guests.filter(c=>c.phase!=='leaving'||c.age<6);
 // Takeaway can use the pickup spot even while all three dining places are occupied.
 const busy=s.plate.length>=12,limit=busy?4:3;
 if(shop.guests.length<limit){
  shop.nextArrival=Math.max(0,Math.min(shop.nextArrival,busy?5:12)-dt);
  if(shop.nextArrival===0){
   const seat=[0,1,2,3].find(seat=>!shop.guests.some(c=>c.seat===seat));
   const takeaway=seat===3||Math.random()<(busy?.8:.4);
   shop.guests.push(newGuest(shop.nextId++,seat,takeaway));
   shop.nextArrival=busy?3+Math.random()*2:9+Math.random()*3;
  }
 }

}
function create(){return{version:1,stage:'empty',folds:0,filling:'mushroom',basket:[],cooking:[],remaining:0,ready:false,served:0,plate:[],shop:newShop(),paused:false,settings:{night:false,rainVolume:40,audio:{rain:false,ambient:false,music:false}}}}
function decode(raw){const s=create();try{const p=JSON.parse(raw);if(p?.version!==1)return s;const valid=(a,max=CAPACITY)=>Array.isArray(a)?a.filter(f=>FILLINGS.includes(f)).slice(0,max):[];s.stage=['empty','wrapper','filled'].includes(p.stage)?p.stage:'empty';s.folds=s.stage==='filled'&&Number.isInteger(p.folds)?Math.max(0,Math.min(2,p.folds)):0;s.filling=FILLINGS.includes(p.filling)?p.filling:s.filling;s.basket=valid(p.basket);s.cooking=valid(p.cooking);s.plate=valid(p.plate,24);s.shop=decodeShop(p.shop);s.remaining=s.cooking.length&&Number.isFinite(p.remaining)?Math.max(0,Math.min(STEAM_SECONDS,p.remaining)):0;s.ready=s.cooking.length>0&&s.remaining===0;s.served=Number.isSafeInteger(p.served)&&p.served>=0?p.served:0;s.paused=p.paused===true;const c=p.settings||{};s.settings={night:c.night===true,rainVolume:Number.isFinite(c.rainVolume)?Math.max(0,Math.min(100,c.rainVolume)):40,audio:{rain:c.audio?.rain===true,ambient:false,music:false}}}catch{}return s}
function make(s){if(s.paused||s.basket.length>=CAPACITY)return null;if(s.stage==='empty'){s.stage='wrapper';return'wrapper'}if(s.stage==='wrapper'){s.stage='filled';return'filled'}s.folds++;if(s.folds<3)return'pleat';s.basket.push(s.filling);s.stage='empty';s.folds=0;return'folded'}
function steam(s){if(s.paused||s.cooking.length||!s.basket.length)return false;s.cooking=s.basket.splice(0);s.remaining=STEAM_SECONDS;s.ready=false;return true}
function serve(s){if(s.paused||!s.ready||s.plate.length+s.cooking.length>24)return false;const batch=s.cooking.splice(0);s.plate.push(...batch);s.served+=batch.length;s.ready=false;s.remaining=0;return true}
function step(s,dt,reserved=0){if(s.paused||!Number.isFinite(dt)||dt<=0)return false;dt=Math.min(dt,1);updateShop(s,dt,Math.max(0,reserved));if(!s.cooking.length||s.ready)return false;s.remaining=Math.max(0,s.remaining-dt);if(s.remaining===0){s.ready=true;return true}return false}
const api={KEY,CAPACITY,STEAM_SECONDS,FILLINGS,create,decode,make,steam,serve,step};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.KitchenLife=api;
})();
