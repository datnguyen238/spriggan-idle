/* The meadow is an axial hex grid. Rendering is independent of these rules. */
(()=>{'use strict';
const SIZE=7,LIMIT=60,TYPES={sprout:{name:'Sprout',hp:2,speed:.57,color:'#6cbd83'},mochi:{name:'Mochi',hp:1,speed:.91,color:'#ed9caa'},truffle:{name:'Truffle',hp:4,speed:.39,color:'#dfa45f'},puddle:{name:'Puddle',hp:3,speed:.62,color:'#68badd',aquatic:true}};
const DIRS=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1]];
const TOWERS=[{q:-2,r:-2},{q:2,r:-2},{q:-2,r:2},{q:2,r:2}];
const inside=(q,r)=>Number.isInteger(q)&&Number.isInteger(r)&&Math.abs(q)<=SIZE&&Math.abs(r)<=SIZE;
const farm=(q,r)=>Math.abs(q)<=2&&Math.abs(r)<=2;
const tower=(q,r)=>TOWERS.some(t=>t.q===q&&t.r===r);
const distance=(a,b)=>Math.hypot(1.5*(a.q-b.q-a.r+b.r),Math.sqrt(3)/2*(a.q-b.q+a.r-b.r))/Math.sqrt(3);
const river=(q,r)=>inside(q,r)&&(Math.abs(r)===4||(q===0&&Math.abs(r)===3));
const bridge=(q,r)=>Math.abs(r)===4&&Math.abs(q)===4;
const habitat=(q,r,type)=>inside(q,r)&&!farm(q,r)&&!tower(q,r)&&(TYPES[type]?.aquatic?river(q,r):!river(q,r)||bridge(q,r));
const bank=(q,r)=>!farm(q,r)&&DIRS.some(([dq,dr])=>farm(q+dq,r+dr)&&!tower(q+dq,r+dr));
function create(){return{time:0,nextId:1,creatures:[],arrows:[],effects:[],shooed:0,snacks:0,storeys:1,towers:TOWERS.map((t,i)=>({...t,id:i,cooldown:i*.25,aim:0,flash:0}))}}
function milestones(s){
 const up=Math.floor(s.shooed/100),down=Math.floor(s.snacks/100);
 s.storeys=Math.max(1,s.storeys+up-down);s.shooed%=100;s.snacks%=100;
}
function progress(raw){
 let saved;try{saved=JSON.parse(raw)}catch{}
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 const s={shooed:valid(saved?.shooed)?saved.shooed:0,snacks:valid(saved?.snacks)?saved.snacks:0,storeys:valid(saved?.storeys)&&saved.storeys>=1?saved.storeys:1};
 milestones(s);return s;
}
function path(q,r,type='sprout'){
 if(!habitat(q,r,type))return[];
 const queue=[[q,r]],visited=new Set([q+','+r]),parents=new Map();let end;
 for(let i=0;i<queue.length;i++){
  const [x,y]=queue[i];if(bank(x,y)){end=[x,y];break}
  for(const [dx,dy] of DIRS){const nx=x+dx,ny=y+dy,key=nx+','+ny;if(!habitat(nx,ny,type)||visited.has(key))continue;visited.add(key);parents.set(key,[x,y]);queue.push([nx,ny])}
 }
 if(!end)return[];const result=[end];while(end[0]!==q||end[1]!==r){end=parents.get(end.join(','));result.push(end)}return result.reverse().slice(1);
}
function spawn(s,q,r,type='sprout'){
 if(!inside(q,r))return{ok:false,reason:'Choose a tile in the meadow.'};
 if(farm(q,r))return{ok:false,reason:'That is the carrot patch! Invite your friend outside the fence.'};
 if(tower(q,r))return{ok:false,reason:'A guard lives here. Try a meadow tile beside the tower.'};
 if(s.creatures.length>=LIMIT)return{ok:false,reason:'A full meadow! Let a few friends finish their visit.'};
 if(!TYPES[type])return{ok:false,reason:'Choose a little friend first.'};
 if(!habitat(q,r,type))return{ok:false,reason:TYPES[type].aquatic?'Puddle needs a river tile to swim in.':'This friend likes dry paws. Choose a grass tile.'};
 const stats=TYPES[type],c={id:s.nextId++,q,r,type,hp:stats.hp,maxHp:stats.hp,path:path(q,r,type),phase:s.nextId*2.399,hit:0,chew:0};s.creatures.push(c);return{ok:true,creature:c};
}
function puff(s,q,r,color){s.effects.push({q,r,color,age:0,seed:s.nextId++})}
function defeat(s,c){
 if(c.done||c.hp>0)return;
 c.hp=0;c.done=true;c.chew=0;c.path=[];s.shooed++;milestones(s);puff(s,c.q,c.r,TYPES[c.type].color);
}
function step(s,dt){
 s.time+=dt;
 for(const c of s.creatures){
  if(c.hp<=0)defeat(s,c);
  if(c.done)continue;
  c.hit=Math.max(0,c.hit-dt);
  if(c.chew){c.chew-=dt;while(c.chew<=0){s.snacks++;milestones(s);c.chew+=4;puff(s,c.q,c.r,'#e7b887')}continue}
  const next=c.path[0];if(!next){c.chew=4;continue}
  const dest={q:next[0],r:next[1]},d=distance(c,dest),travel=TYPES[c.type].speed*dt;
  if(d<=travel){c.q=dest.q;c.r=dest.r;c.path.shift()}else{c.q+=(dest.q-c.q)*travel/d;c.r+=(dest.r-c.r)*travel/d}
 }
 for(const t of s.towers){
  t.cooldown-=dt;t.flash=Math.max(0,t.flash-dt);
  const target=s.creatures.filter(c=>!c.done&&c.hp>0&&distance(t,c)<4.4).sort((a,b)=>distance(a,{q:0,r:0})-distance(b,{q:0,r:0}))[0];
  if(target){t.aim=Math.atan2(target.r-t.r,target.q-t.q);if(t.cooldown<=0){t.cooldown=1.1;t.flash=.25;s.arrows.push({id:s.nextId++,from:{q:t.q,r:t.r},target:target.id,to:{q:target.q,r:target.r},age:0,duration:.4+distance(t,target)*.1})}}
 }
 for(const a of s.arrows){
  a.age+=dt;const c=s.creatures.find(c=>c.id===a.target);if(c)a.to={q:c.q,r:c.r};
  if(a.age>=a.duration){a.done=true;if(c&&!c.done&&c.hp>0){c.hp--;c.hit=.22;puff(s,c.q,c.r,'#f5e6b2');defeat(s,c)}}
 }
 s.creatures=s.creatures.filter(c=>!c.done&&c.hp>0);const living=new Set(s.creatures.map(c=>c.id));s.arrows=s.arrows.filter(a=>!a.done&&living.has(a.target));for(const p of s.effects)p.age+=dt;s.effects=s.effects.filter(p=>p.age<.7);
}
const api={SIZE,LIMIT,TYPES,TOWERS,DIRS,inside,farm,tower,river,bridge,habitat,bank,distance,progress,milestones,create,spawn,step,path};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.HexLife=api;
})();
