/* Golden Seed: virtual seeds, calendar-day refill, and persistent map prizes. */
(()=>{
'use strict';
const KEY='spriggan.slots.v1',COST=10,START=200,REFILL=50,PAIR_PAYOUT=20;
const GOLDEN_FISH_ID='spriggan-golden-seed-koi',COW_ID='spriggan-golden-seed-cow';
const SYMBOLS=Object.freeze(['leaf','flower','moon','star','seed','friend'].map(id=>Object.freeze({id,label:{leaf:'Leaf',flower:'Blossom',moon:'Moon',star:'Star',seed:'Seed',friend:'Friend'}[id],weight:1})));
// Add playable reward destinations here; the selector and reward details follow this registry.
const DESTINATIONS=Object.freeze([
 {id:'pond',name:'Stillwater Pond',shortName:'pond',friend:'Kin',title:'Kin, the golden koi',art:'koi',href:'../pond/',unlocked:'goldenUnlocked',claimed:'goldenClaimed',claim:'claimGolden',description:'A golden shimmer to swim, feed, and grow in your pond.'},
 {id:'farm',name:'Sunny Side Farm',shortName:'farm',friend:'Buttercup',title:'Buttercup, the cow',art:'cow',href:'../pixel/',unlocked:'cowUnlocked',claimed:'cowClaimed',claim:'claimCow',description:'A gentle grazer to wander and snack with your flock.'}
].map(Object.freeze));
const destination=id=>DESTINATIONS.find(map=>map.id===id)||DESTINATIONS[0];
const whole=n=>Number.isSafeInteger(n)&&n>=0;
const timestamp=n=>Number.isFinite(n)&&n>=0?Math.floor(n):Date.now();
function day(now){const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function tomorrow(now){const d=new Date(now);d.setHours(24,0,0,0);return d.getTime()}
function create(now=Date.now()){return{version:3,balance:START,spins:0,selectedMap:'pond',lastResult:null,rewards:Object.fromEntries(DESTINATIONS.map(map=>[map.id,{won:0,claimed:0}])),...Object.fromEntries(DESTINATIONS.flatMap(map=>[[map.unlocked,false],[map.claimed,false]])),refillAt:null,lastRefillDay:null,settings:{sound:false,motion:true},savedAt:timestamp(now)}}
// Counts retain every win, including prizes waiting to be claimed after a later visit.
function reward(s,id){
 const map=destination(id),r=s.rewards?.[map.id];
 const claimed=Math.max(r?.claimed||0,s[map.claimed]?1:0);
 return{won:Math.max(r?.won||0,s[map.unlocked]?1:0,claimed),claimed};
}
function setReward(s,id,r){
 const map=destination(id);s.rewards||={};s.rewards[map.id]={...r};
 s[map.unlocked]=r.won>0;s[map.claimed]=r.won>0&&r.claimed===r.won;
}
function evaluate(symbols){const [a,b,c]=symbols;if(a===b&&b===c)return{kind:'triple',payout:0};if(a===b||a===c||b===c)return{kind:'pair',payout:PAIR_PAYOUT};return{kind:'miss',payout:0}}
function decode(raw,now=Date.now()){
 try{const s=JSON.parse(raw);if(!s||![1,2,3].includes(s.version)||!whole(s.balance)||!whole(s.spins))return null;
 const n=create(now);n.balance=s.version<3?Math.max(START,s.balance):s.balance;n.spins=s.spins;n.selectedMap=destination(s.selectedMap).id;
 for(const key of DESTINATIONS.flatMap(map=>[map.unlocked,map.claimed]))n[key]=s[key]===true;
 for(const map of DESTINATIONS){
  const r=s.rewards?.[map.id];
  if(r&&(!whole(r.won)||!whole(r.claimed)||r.claimed>r.won))return null;
  setReward(n,map.id,reward(s,map.id));
 }
 n.settings={sound:s.settings?.sound===true,motion:s.settings?.motion!==false};n.savedAt=timestamp(s.savedAt??now);
 n.lastRefillDay=typeof s.lastRefillDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.lastRefillDay)?s.lastRefillDay:null;
 n.refillAt=s.refillAt!==null&&Number.isFinite(s.refillAt)&&s.refillAt>=0?s.refillAt:null;
 if(n.balance<COST&&n.refillAt===null)n.refillAt=tomorrow(n.savedAt);
 if(n.balance>=COST)n.refillAt=null;
 if(s.version===3&&Array.isArray(s.lastResult?.symbols)&&s.lastResult.symbols.length===3&&s.lastResult.symbols.every(id=>SYMBOLS.some(v=>v.id===id))){
  const result=s.lastResult;n.lastResult={symbols:[...result.symbols],...evaluate(result.symbols),map:destination(result.map).id,newReward:result.newReward===true};n.lastResult.net=n.lastResult.payout-COST;
 }
 return n;
 }catch{return null}
}
function refill(s,now=Date.now()){
 if(s.balance>=COST){s.refillAt=null;return false}
 if(s.refillAt===null){s.refillAt=tomorrow(now);return false}
 const today=day(now);
 if(now<s.refillAt||s.lastRefillDay===today)return false;
 // One fresh balance, even after several absent days. Never add to a nonempty purse.
 s.balance=REFILL;s.refillAt=null;s.lastRefillDay=today;s.savedAt=timestamp(now);return true;
}
function spin(s,random=Math.random,now=Date.now()){
 refill(s,now);if(s.balance<COST)return null;
 const symbols=Array.from({length:3},()=>{const r=random();if(!Number.isFinite(r)||r<0||r>1)throw RangeError('Random value must be between 0 and 1');return SYMBOLS[Math.min(SYMBOLS.length-1,Math.floor(r*SYMBOLS.length))].id});
 const outcome=evaluate(symbols),map=destination(s.selectedMap).id;
 const result={symbols,...outcome,net:outcome.payout-COST,map,newReward:outcome.kind==='triple'};
 if(outcome.kind==='triple'){const r=reward(s,map);r.won++;setReward(s,map,r)}
 s.balance+=result.net;s.spins++;s.lastResult=result;s.savedAt=timestamp(now);
 if(s.balance<COST)s.refillAt=tomorrow(now);
 return result;
}
function claimPrize(state,storage,MapLife,map,now=Date.now()){
 const counts=reward(state,map);
 if(counts.claimed>=counts.won)return{status:counts.won?'existing':'locked'};
 const number=counts.claimed+1,base=map==='pond'?GOLDEN_FISH_ID:COW_ID;
 const prizeId=number===1?base:`${base}-${number}`,time=timestamp(now);
 if(!MapLife||typeof MapLife.decode!=='function'||typeof MapLife.create!=='function')return{status:'invalid'};
 try{
  const raw=storage.getItem(MapLife.KEY),world=raw==null?MapLife.create(time):MapLife.decode(raw,time);
  if(!world)return{status:'invalid'};
  const animals=map==='pond'?world.fish:world.cows;
  if(!Array.isArray(animals))return{status:'invalid'};
  let animal=animals.find(a=>a.id===prizeId);const existing=!!animal;
  if(!animal){
   if(map==='pond'&&animals.length>=MapLife.MAX_KOI)return{status:'full'};
   animal=map==='pond'?MapLife.makeFish(animals.length,time,true):MapLife.makeCow(time);
   animal.id=prizeId;animal.name=(map==='pond'?'Kin':'Buttercup')+(number>1?` ${number}`:'');
   animals.push(animal);
  }
  world.savedAt=time;
  // Animal first, receipt second: retries use the same per-win ID, never another animal.
  storage.setItem(MapLife.KEY,JSON.stringify(world));
  const receipt={...state,rewards:{...state.rewards},savedAt:time};
  setReward(receipt,map,{...counts,claimed:number});
  storage.setItem(KEY,JSON.stringify(receipt));Object.assign(state,receipt);
  return{status:existing?'existing':'claimed',[map==='pond'?'fish':'cow']:animal};
 }catch{return{status:'storage-error'}}
}
function claimGolden(state,storage,PondLife,now=Date.now()){return claimPrize(state,storage,PondLife,'pond',now)}
function claimCow(state,storage,FarmLife,now=Date.now()){return claimPrize(state,storage,FarmLife,'farm',now)}
const api={KEY,COST,START,REFILL,PAIR_PAYOUT,GOLDEN_FISH_ID,COW_ID,SYMBOLS,DESTINATIONS,destination,reward,create,decode,evaluate,spin,refill,day,tomorrow,claimGolden,claimCow};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.SlotsLife=api;
})();
