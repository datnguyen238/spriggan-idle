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
function create(now=Date.now()){return{version:3,balance:START,spins:0,selectedMap:'pond',lastResult:null,...Object.fromEntries(DESTINATIONS.flatMap(map=>[[map.unlocked,false],[map.claimed,false]])),refillAt:null,lastRefillDay:null,settings:{sound:false,motion:true},savedAt:timestamp(now)}}
function evaluate(symbols){const [a,b,c]=symbols;if(a===b&&b===c)return{kind:'triple',payout:0};if(a===b||a===c||b===c)return{kind:'pair',payout:PAIR_PAYOUT};return{kind:'miss',payout:0}}
function decode(raw,now=Date.now()){
 try{const s=JSON.parse(raw);if(!s||![1,2,3].includes(s.version)||!whole(s.balance)||!whole(s.spins))return null;
 const n=create(now);n.balance=s.version<3?Math.max(START,s.balance):s.balance;n.spins=s.spins;n.selectedMap=destination(s.selectedMap).id;
 for(const key of DESTINATIONS.flatMap(map=>[map.unlocked,map.claimed]))n[key]=s[key]===true;
 for(const map of DESTINATIONS)n[map.unlocked] ||= n[map.claimed];
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
 const outcome=evaluate(symbols),map=destination(s.selectedMap).id,key=destination(map).unlocked;
 const result={symbols,...outcome,net:outcome.payout-COST,map,newReward:outcome.kind==='triple'&&!s[key]};
 if(outcome.kind==='triple')s[key]=true;
 s.balance+=result.net;s.spins++;s.lastResult=result;s.savedAt=timestamp(now);
 if(s.balance<COST)s.refillAt=tomorrow(now);
 return result;
}
  function claimGolden(state, storage, PondLife, now = Date.now()) {
    if (!state.goldenUnlocked) return { status: 'locked' };
    if (!PondLife || typeof PondLife.decode !== 'function' ||
        typeof PondLife.create !== 'function' || typeof PondLife.makeFish !== 'function') {
      return { status: 'invalid' };
    }
    const time = timestamp(now);
    try {
      // Read again at the moment of claiming so we never replace a stale pond snapshot.
      const raw = storage.getItem(PondLife.KEY);
      const pond = raw === null || raw === undefined ? PondLife.create(time) : PondLife.decode(raw, time);
      if (!pond || !Array.isArray(pond.fish)) return { status: 'invalid' };
      let fish = pond.fish.find(item => item.golden);
      if (!fish) fish = pond.fish.find(item => item.id === GOLDEN_FISH_ID);
      const existing = Boolean(fish);
      if (!fish) {
        if (pond.fish.length >= Math.min(12, PondLife.MAX_KOI || 12)) return { status: 'full' };
        fish = PondLife.makeFish(pond.fish.length, time, true);
        fish.id = GOLDEN_FISH_ID;
        fish.name = 'Kin';
        pond.fish.push(fish);
      }
      fish.golden = true;
      pond.savedAt = time;

      // Pond first, then claim receipt. The stable ID makes a partial-write retry safe.
      storage.setItem(PondLife.KEY, JSON.stringify(pond));
      const claimed = { ...state, goldenClaimed: true, savedAt: time };
      storage.setItem(KEY, JSON.stringify(claimed));
      state.goldenClaimed = true;
      state.savedAt = time;
      return { status: existing ? 'existing' : 'claimed', fish };
    } catch {
      return { status: 'storage-error' };
    }
  }


function claimCow(state,storage,FarmLife,now=Date.now()){
 if(!state.cowUnlocked)return{status:'locked'};
 try{
  const raw=storage.getItem(FarmLife.KEY),farm=raw==null?FarmLife.create(now):FarmLife.decode(raw,now);
  if(!farm)return{status:'invalid'};
  const existing=!!farm.cow;
  if(!farm.cow)farm.cow=FarmLife.makeCow(now);
  farm.savedAt=now;storage.setItem(FarmLife.KEY,JSON.stringify(farm));
  const claimed={...state,cowClaimed:true,savedAt:timestamp(now)};storage.setItem(KEY,JSON.stringify(claimed));Object.assign(state,claimed);
  return{status:existing?'existing':'claimed',cow:farm.cow};
 }catch{return{status:'storage-error'}}
}
const api={KEY,COST,START,REFILL,PAIR_PAYOUT,GOLDEN_FISH_ID,COW_ID,SYMBOLS,DESTINATIONS,destination,create,decode,evaluate,spin,refill,day,tomorrow,claimGolden,claimCow};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.SlotsLife=api;
})();
