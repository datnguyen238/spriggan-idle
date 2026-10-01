/* Farm rules and saves, independent of the canvas. */
(()=>{
'use strict';
const KEY='spriggan.farm.v1',LIMIT=16,LAY_MEALS=100,HATCH=180000,GROW_MEALS=200;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const id=()=>globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now();
function bird(sex,now,chick=false){return{id:id(),name:chick?'Little peep':sex==='hen'?'Clover':'Bramble',sex,stage:chick?'chick':'adult',born:now,meals:0,layFood:0,x:.35+Math.random()*.3,y:.5+Math.random()*.22}}
function makeCow(now=Date.now()){return{id:'spriggan-golden-seed-cow',species:'cow',name:'Buttercup',stage:'adult',sex:'cow',born:now,meals:0,layFood:0,x:.64,y:.64}}
function create(now=Date.now()){return{version:2,savedAt:now,birds:[bird('hen',now),bird('rooster',now)],eggs:[],hatched:0,cow:null}}
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
function decode(raw,now=Date.now()){
 try{const s=JSON.parse(raw);if(!s||![1,2].includes(s.version)||!Array.isArray(s.birds)||!Array.isArray(s.eggs)||s.birds.length+s.eggs.length>LIMIT) return null;
 const ids=new Set();for(const b of s.birds){if(!b||typeof b.id!=='string'||ids.has(b.id)||!['hen','rooster'].includes(b.sex)||!['adult','chick'].includes(b.stage)||!['born','meals','layFood','x','y'].every(k=>Number.isFinite(b[k])))return null;ids.add(b.id);b.name=typeof b.name==='string'?b.name.slice(0,24):'Peep';b.meals=clamp(Math.floor(b.meals),0,1000000);b.layFood=clamp(Math.floor(b.layFood),0,LAY_MEALS);b.x=clamp(b.x,.1,.9);b.y=clamp(b.y,.38,.85);b.born=Math.min(now,b.born);delete b.nextEgg}
 for(const e of s.eggs){if(!e||typeof e.id!=='string'||ids.has(e.id)||!['x','y','laid','hatchesAt'].every(k=>Number.isFinite(e[k]))||e.hatchesAt<e.laid)return null;ids.add(e.id);e.x=clamp(e.x,.1,.9);e.y=clamp(e.y,.38,.85);e.hatchesAt=e.laid+HATCH}
 if(s.cow!=null){const c=s.cow;if(c.id!=='spriggan-golden-seed-cow'||!['x','y','meals','born'].every(k=>Number.isFinite(c[k])))return null;s.cow={...makeCow(now),name:typeof c.name==='string'?c.name.slice(0,24):'Buttercup',x:clamp(c.x,.17,.82),y:clamp(c.y,.4,.82),meals:clamp(Math.floor(c.meals),0,1000000),born:Math.min(c.born,now)}}else s.cow=null;
 s.version=2;s.hatched=Number.isInteger(s.hatched)&&s.hatched>=0?s.hatched:0;return s;
 }catch{return null}
}
const api={makeCow,KEY,LIMIT,LAY_MEALS,HATCH,GROW_MEALS,create,feed,advance,decode,removeBird};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.FarmLife=api;
})();
