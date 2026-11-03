/* Skill-based grabs; no random win roll. Shared by the renderer and tests. */
(function(root){'use strict';
const KEY='spriggan.claw.v1',TYPES=[{id:'frog',name:'Moss',label:'the pond frog',color:'#a6b89c'},{id:'koi',name:'Kin',label:'the little koi',color:'#e7c58c'},{id:'chick',name:'Pip',label:'the sleepy chick',color:'#ead49b'},{id:'bunny',name:'Clover',label:'the soft-eared rabbit',color:'#ddc8be'},{id:'dumpling',name:'Fold',label:'the little dumpling',color:'#e8ddc5'},{id:'cat',name:'Toast',label:'the marmalade cat',color:'#cfae91'},{id:'moonfox',name:'Lune',label:'the moonlit fox',color:'#c4bed8',secret:true}];
const REGULAR=TYPES.filter(t=>!t.secret),SECRET_CHANCE=.02;
function refillType(s,random){return !s.toys.some(t=>t.type==='moonfox')&&random()<SECRET_CHANCE?'moonfox':REGULAR[s.serial%REGULAR.length].id;}
const START_COINS=10,TURN_COST=1,SELL_PRICE=2,AIM_SECONDS=30;
const durations={coin:.6,down:.8,grip:.4,up:.8,carry:.7,release:.8,return:.55};
function pile(){const xs=[236,320,407,488,220,307,393,492,240,330,417,515],ys=[433,442,430,436,459,458,460,457,478,480,475,480],angles=[-15,8,4,-10,7,-8,12,3,-11,12,-12,5];return Array.from({length:12},(_,i)=>({id:i,type:TYPES[i%6].id,x:xs[i],y:ys[i],angle:angles[i],depth:Math.floor(i/4)}));}
function create(random=()=>1){const toys=pile();if(random()<SECRET_CHANCE)toys[Math.min(11,Math.max(0,Math.floor(random()*12)))].type='moonfox';return {phase:'idle',elapsed:0,scanRemaining:AIM_SECONDS,autoDropped:false,x:365,y:185,z:0,depthAim:0,originZ:0,aim:365,origin:365,target:null,caught:false,held:null,serial:12,toys,pending:null,round:0,direction:1};}
function aim(s,x){if(s.phase!=='scanning'||!Number.isFinite(x))return false;s.aim=Math.max(208,Math.min(535,x));s.x=s.aim;return true;}
function aimDepth(s,z){if(s.phase!=='scanning'||!Number.isFinite(z))return false;s.depthAim=Math.max(-.8,Math.min(.8,z));return true;}
function insert(s){if(s.phase!=='idle')return false;s.phase='coin';s.elapsed=0;s.scanRemaining=AIM_SECONDS;s.autoDropped=false;return true;}
function drop(s,physics){if(s.phase!=='scanning')return false;s.origin=s.x;s.originZ=s.z;s.target=physics?physics.target(s):s.toys.filter(t=>Math.abs(t.x-s.x)<47).sort((a,b)=>a.y-b.y)[0]||null;s.caught=!physics&&!!s.target&&Math.abs(s.target.x-s.x)<=24;s.targetY=s.target?s.target.y-28:490;s.phase='down';s.elapsed=0;s.round++;return true;}
const ease=t=>t*t*(3-2*t);
function update(s,dt,physics,random=()=>1){if(!Number.isFinite(dt)||dt<=0)return;let remaining=Math.min(dt,10);
while(remaining>0&&s.phase!=='idle'){if(s.phase==='scanning'){const part=Math.min(remaining,s.scanRemaining),dz=s.depthAim-s.z;s.z+=Math.sign(dz)*Math.min(Math.abs(dz),part*2.4);let travel=part*85;while(travel>0){const edge=s.direction>0?535:208,distance=Math.abs(edge-s.x),step=Math.min(distance,travel);s.x+=s.direction*step;travel-=step;if(distance<=step+1e-8)s.direction*=-1;}s.aim=s.x;s.scanRemaining=Math.max(0,s.scanRemaining-part);remaining-=part;if(s.scanRemaining<=1e-8){drop(s,physics);s.autoDropped=true;}else break;continue;}const phase=s.phase,duration=durations[phase],part=Math.min(remaining,duration-s.elapsed);s.elapsed+=part;remaining-=part;const t=ease(Math.min(1,s.elapsed/duration)),targetY=s.targetY??(s.target?s.target.y-28:490);
if(phase==='down'){s.x=s.origin;s.y=185+(targetY-185)*t;}
if(phase==='up'){s.y=targetY+(185-targetY)*t;}
if(phase==='carry'){s.x=s.origin+(147-s.origin)*t;s.y=185+130*t;s.z=s.originZ+(-.75-s.originZ)*t;}
if(phase==='release'){s.x=147;s.y=315;}
if(phase==='return'){s.x=147+(s.origin-147)*t;s.y=315-130*t;s.z=-.75+(s.originZ+.75)*t;}
if(s.elapsed>=duration-1e-8){s.elapsed=0;
 if(phase==='coin')s.phase='scanning';
 else if(phase==='down')s.phase='grip';
 else if(phase==='grip'){if(physics){const toy=physics.grab(s);s.caught=!!toy;if(toy)s.target=toy;}s.phase='up';if(s.caught){s.held={...s.target};s.toys=s.toys.filter(t=>t.id!==s.target.id);}}
 else if(phase==='up'){if(s.held)s.phase='carry';else{s.phase='idle';s.target=null;}}
 else if(phase==='carry')s.phase='release';
 else if(phase==='release'){s.pending={type:s.held.type,round:s.round};const slot=s.target;s.toys.push({...slot,id:s.serial++,type:refillType(s,random)});s.held=null;s.phase='return';}
 else if(phase==='return'){s.phase='idle';s.target=null;s.caught=false;}
}}
}
const SPOTS=['shelf','cushion','window'];
function decode(raw){const p={version:1,collection:{},sound:false,lastKept:null,friends:[],coins:START_COINS};try{const s=JSON.parse(raw);if(s?.version!==1||typeof s.collection!=='object'||!s.collection)return p;for(const t of TYPES){const n=s.collection[t.id];if(Number.isSafeInteger(n)&&n>0)p.collection[t.id]=Math.min(n,9999);}p.sound=s.sound===true;p.coins=s.coins===undefined?START_COINS:Number.isSafeInteger(s.coins)&&s.coins>=0?Math.min(s.coins,999999):0;
const seen=new Set(),counts={};if(Array.isArray(s.friends))for(const f of s.friends){if(!f||typeof f.id!=='string'||f.id.length>100||seen.has(f.id)||!TYPES.some(t=>t.id===f.type))continue;if((counts[f.type]||0)>=(p.collection[f.type]||0))continue;seen.add(f.id);counts[f.type]=(counts[f.type]||0)+1;p.friends.push({id:f.id,type:f.type,name:typeof f.name==='string'&&f.name.trim()?f.name.trim().slice(0,24):TYPES.find(t=>t.id===f.type).name,spot:SPOTS.includes(f.spot)?f.spot:'shelf'});}
for(const t of TYPES){let n=counts[t.id]||0;for(;n<(p.collection[t.id]||0);n++){let id=`legacy-${t.id}-${n}`;while(seen.has(id))id+='-';seen.add(id);p.friends.push({id,type:t.id,name:t.name,spot:'shelf'});}}
p.lastKept=TYPES.some(t=>t.id===s.lastKept)&&p.collection[s.lastKept]?s.lastKept:Object.keys(p.collection).at(-1)||null;}catch{}return p;}
function collect(p,type,id){const t=TYPES.find(t=>t.id===type);if(!t)return false;if(id&&p.friends.some(f=>f.id===id))return false;if((p.collection[type]||0)>=9999)return false;p.collection[type]=(p.collection[type]||0)+1;p.lastKept=type;p.friends.push({id:id||globalThis.crypto?.randomUUID?.()||`friend-${Date.now()}-${Math.random().toString(36).slice(2)}`,type,name:t.name,spot:'shelf'});return true;}
function arrange(p,id,name,spot){const f=p.friends.find(f=>f.id===id);if(!f||typeof name!=='string'||!name.trim()||!SPOTS.includes(spot))return false;f.name=name.trim().slice(0,24);f.spot=spot;return true;}
function spend(p){if(!Number.isSafeInteger(p.coins)||p.coins<TURN_COST)return false;p.coins-=TURN_COST;return true;}
function sellValue(type){return type==='moonfox'?8:SELL_PRICE;}
function sell(p,id){const i=p.friends.findIndex(f=>f.id===id);if(i<0||p.coins>999999-sellValue(p.friends[i].type))return false;const [f]=p.friends.splice(i,1);p.collection[f.type]--;if(p.collection[f.type]<=0)delete p.collection[f.type];p.coins+=sellValue(f.type);p.lastKept=p.friends.at(-1)?.type||null;return true;}
const api={KEY,TYPES,durations,create,insert,aim,aimDepth,drop,update,decode,collect,arrange,SPOTS,START_COINS,TURN_COST,SELL_PRICE,AIM_SECONDS,spend,sell,sellValue,SECRET_CHANCE,refillType};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ClawLife=api;
})(globalThis);
