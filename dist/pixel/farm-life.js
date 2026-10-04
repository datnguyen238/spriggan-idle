/* Farm rules and saves, independent of the canvas. */
(()=>{
'use strict';
const KEY='spriggan.farm.v1',LIMIT=16,LAY_MEALS=100,HATCH=180000,GROW_MEALS=200,FOX_WAIT=120;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const id=()=>globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now();
function bird(sex,now,chick=false){return{id:id(),name:chick?'Little peep':sex==='hen'?'Clover':'Bramble',sex,stage:chick?'chick':'adult',born:now,meals:0,layFood:0,x:.35+Math.random()*.3,y:.5+Math.random()*.22}}
function makeCow(now=Date.now()){return{id:'spriggan-golden-seed-cow',species:'cow',name:'Buttercup',stage:'adult',sex:'cow',born:now,meals:0,layFood:0,x:.64,y:.64}}
function create(now=Date.now()){return{version:2,savedAt:now,birds:[bird('hen',now),bird('rooster',now)],eggs:[],hatched:0,cows:[],foxWait:0}}
function feed(b){b.meals++;if(b.stage==='adult'&&b.sex==='hen')b.layFood=Math.min(LAY_MEALS,b.layFood+1)}
function advance(s,now=Date.now(),random=Math.random){
 const events=[];
 for(const e of [...s.eggs])if(now>=e.hatchesAt){const b=bird(random()<.65?'hen':'rooster',now,true);b.x=e.x;b.y=e.y;s.birds.push(b);s.eggs=s.eggs.filter(v=>v.id!==e.id);s.hatched++;events.push('A little peep! Your egg has hatched.')}
 for(const b of s.birds)if(b.stage==='chick'&&b.meals>=GROW_MEALS){b.stage='adult';b.name=b.sex==='hen'?'Daisy':'Rusty';b.layFood=0;events.push('A chick has grown up. Welcome to the flock!')}
 if(s.birds.some(b=>b.stage==='adult'&&b.sex==='rooster'))for(const b of s.birds){
  if(s.birds.length+s.eggs.length>=LIMIT)break;
  if(b.stage==='adult'&&b.sex==='hen'&&b.layFood>=LAY_MEALS){s.eggs.push({id:id(),x:clamp(b.x+.04,.15,.85),y:clamp(b.y+.035,.38,.83),laid:now,hatchesAt:now+HATCH});b.layFood=0;events.push('A warm little egg. A new beginning.')}
 }
 s.savedAt=now;return events;
}
function removeBird(s,id){const index=s.birds.findIndex(b=>b.id===id);if(index<0)return null;return s.birds.splice(index,1)[0]}
function foxPrey(s){
 const adults=s.birds.filter(b=>b.stage==='adult'),hens=adults.filter(b=>b.sex==='hen').length,roosters=adults.length-hens;
 return s.birds.length<=2?[]:adults.filter(b=>b.sex==='hen'?hens>1:roosters>1);
}
function foxStep(s,visitor,dt,random=Math.random){
 if(!Number.isFinite(dt)||dt<=0)return{visitor};
 dt=Math.min(dt,.1);
 const prey=foxPrey(s);
 if(!visitor){
  if(!prey.length){s.foxWait=0;return{visitor:null}}
  s.foxWait=(s.foxWait||0)+dt;
  if(s.foxWait<FOX_WAIT)return{visitor:null};
  s.foxWait=0;const target=prey[Math.min(prey.length-1,Math.floor(random()*prey.length))];
  const side=Math.min(3,Math.floor(random()*4)),along=.1+random()*.8;
  const entry=side===0?{x:-.25,y:along}:side===1?{x:1.25,y:along}:side===2?{x:along,y:-.6}:{x:along,y:1.6};
  visitor={...entry,trail:[],target:target.id,leaving:false,phase:0};
 }
 visitor.phase+=dt;
 const target=prey.find(b=>b.id===visitor.target);
 if(!target)visitor.leaving=true;
 let travel=(visitor.carrying?.075:.12)*dt;
 if(visitor.leaving){
  // Replay the actual pursuit in reverse, including turns after a wandering chicken.
  while(visitor.trail.length&&travel>0){
   const point=visitor.trail[visitor.trail.length-1],dx=point.x-visitor.x,dy=point.y-visitor.y,distance=Math.hypot(dx,dy);
   if(Math.abs(dx)>1e-9)visitor.left=dx<0;
   if(distance<=travel){visitor.x=point.x;visitor.y=point.y;travel-=distance;visitor.trail.pop()}
   else{visitor.x+=dx*travel/distance;visitor.y+=dy*travel/distance;travel=0}
  }
  return{visitor:visitor.trail.length?visitor:null};
 }
 const x=target.x,y=target.y,distance=Math.hypot(x-visitor.x,y-visitor.y);
 visitor.left=x<visitor.x;visitor.trail.push({x:visitor.x,y:visitor.y});
 if(distance<=travel){
  visitor.x=x;visitor.y=y;
  const lost=removeBird(s,target.id);visitor.carrying=lost?{...lost}:null;visitor.leaving=true;return{visitor,lost};
 }
 visitor.x+=(x-visitor.x)*travel/distance;visitor.y+=(y-visitor.y)*travel/distance;return{visitor};
}
function decode(raw,now=Date.now()){
 try{const s=JSON.parse(raw);if(!s||![1,2].includes(s.version)||!Array.isArray(s.birds)||!Array.isArray(s.eggs)||s.birds.length+s.eggs.length>LIMIT) return null;
 const ids=new Set();for(const b of s.birds){if(!b||typeof b.id!=='string'||ids.has(b.id)||!['hen','rooster'].includes(b.sex)||!['adult','chick'].includes(b.stage)||!['born','meals','layFood','x','y'].every(k=>Number.isFinite(b[k])))return null;ids.add(b.id);b.name=typeof b.name==='string'?b.name.slice(0,24):'Peep';b.meals=clamp(Math.floor(b.meals),0,1000000);b.layFood=clamp(Math.floor(b.layFood),0,LAY_MEALS);b.x=clamp(b.x,.1,.9);b.y=clamp(b.y,.38,.85);b.born=Math.min(now,b.born);delete b.nextEgg}
 for(const e of s.eggs){if(!e||typeof e.id!=='string'||ids.has(e.id)||!['x','y','laid','hatchesAt'].every(k=>Number.isFinite(e[k]))||e.hatchesAt<e.laid)return null;ids.add(e.id);e.x=clamp(e.x,.1,.9);e.y=clamp(e.y,.38,.85);e.hatchesAt=e.laid+HATCH}
 const cows=s.cows===undefined?(s.cow?[s.cow]:[]):s.cows;
 if(!Array.isArray(cows))return null;
 s.cows=[];
 for(const c of cows){
  if(!c||typeof c.id!=='string'||!/^spriggan-golden-seed-cow(?:-\d+)?$/.test(c.id)||ids.has(c.id)||!['x','y','meals','born'].every(k=>Number.isFinite(c[k])))return null;
  ids.add(c.id);s.cows.push({...makeCow(now),id:c.id,name:typeof c.name==='string'?c.name.slice(0,24):'Buttercup',x:clamp(c.x,.17,.82),y:clamp(c.y,.4,.82),meals:clamp(Math.floor(c.meals),0,1000000),born:Math.min(c.born,now)});
 }
 delete s.cow;
 s.foxWait=Number.isFinite(s.foxWait)?clamp(s.foxWait,0,FOX_WAIT):0;
 s.version=2;s.hatched=Number.isInteger(s.hatched)&&s.hatched>=0?s.hatched:0;return s;
 }catch{return null}
}
const api={foxPrey,foxStep,FOX_WAIT,makeCow,KEY,LIMIT,LAY_MEALS,HATCH,GROW_MEALS,create,feed,advance,decode,removeBird};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.FarmLife=api;
})();
