const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Life=require('../dist/slots/slots-life.js');
const Pond=require('../dist/pond/pond-life.js');
const Farm=require('../dist/pixel/farm-life.js');

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
async function settle(){for(let i=0;i<20;i++)await Promise.resolve()}

// Run the real slot UI and prize helpers with only browser/network boundaries replaced.
function openSlots(options={}){
 const saved=Life.create();
 if(options.won!==false)for(let i=0;i<(options.wins||1);i++)Life.spin(saved,()=>0);
 if(options.claimed){saved.rewards.pond.claimed=options.claimed;saved.goldenClaimed=saved.rewards.pond.won===options.claimed}
 if(options.wallet)Object.assign(saved,options.wallet);
 const values=new Map([[Life.KEY,JSON.stringify(saved)]]),elements=new Map();
 if(options.pondRaw!==undefined)values.set(Pond.KEY,options.pondRaw);
 else if(options.pond)values.set(Pond.KEY,JSON.stringify(options.pond));
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 class Element{
  constructor(){this.hidden=false;this.disabled=false;this.open=false;this.dataset={};this.textContent='';this.value='';this.children=[];this.attributes=new Map();this.classList={add(){},remove(){}}}
  setAttribute(key,value){this.attributes.set(key,String(value))}
  addEventListener(){}
  append(child){this.children.push(child)}
  showModal(){this.open=true}
  close(){this.open=false}
 }
 const element=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector)};
 const reels=Array.from({length:3},()=>new Element()),names=Array.from({length:3},()=>new Element());
 const listeners=new Set(),windowListeners=new Map(),navigations=[],checkpoints=[],eventSaves=[];
 let locked=false;
 const accountState={user:options.guest?null:{uid:'player',emailVerified:options.verified!==false},status:options.status||'synced'};
 const page={storage,element,navigations,checkpoints,eventSaves,get locked(){return locked},wallet:()=>Life.decode(storage.getItem(Life.KEY)),pond:()=>Pond.decode(storage.getItem(Pond.KEY))};
 page.emit=(type,event={})=>{for(const listener of windowListeners.get(type)||[])listener(event)};
 const accounts={
  ready:Promise.resolve(),get state(){return accountState},
  subscribe(fn){listeners.add(fn);fn(accountState);return()=>listeners.delete(fn)},
  async checkpoint(){
   checkpoints.push({locked,entries:Object.fromEntries(values)});
   if(options.checkpoint)await options.checkpoint(page);
  },
  async saveProgress(){eventSaves.push({locked,entries:Object.fromEntries(values)})}
 };
 page.publish=patch=>{Object.assign(accountState,patch);for(const fn of listeners)fn(accountState)};
 const sandbox={
  SlotsLife:{...Life,spin:state=>{let i=0;const values=options.randomValues||[0];return Life.spin(state,()=>values[i++%values.length])}},PondLife:Pond,FarmLife:Farm,
  SlotsArt:{icon:()=>'<svg></svg>'},SprigganRuntime:{mobile:false,runBackground(){}},
  SprigganAccounts:accounts,SprigganStorage:storage,localStorage:storage,
  document:{hidden:false,querySelector:element,querySelectorAll:selector=>selector==='.symbol-art'?reels:selector==='.symbol-name'?names:[],createElement:()=>new Element(),addEventListener(){}},
  navigator:{locks:{async request(name,fn){assert.equal(locked,false,'wallet transactions do not overlap');locked=true;try{return await fn()}finally{locked=false}}}},
  window:{addEventListener(type,fn){if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(fn)}},matchMedia:()=>({matches:!options.motion,addEventListener(){}}),
  sessionStorage:{setItem(){}},URL,
  location:{href:'https://spriggan.test/slots/',assign:href=>navigations.push(href)},
  performance:{now:()=>0},requestAnimationFrame(){},setInterval(){}
 };
 vm.createContext(sandbox);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/slots/slots.js'),'utf8'),sandbox);
 page.claim=()=>element('#claim').onclick();page.spin=()=>element('#spin').onclick();
 return page;
}

test('a persisted triple requests an account checkpoint immediately without holding the wallet lock',async()=>{
 const gate=deferred(),page=openSlots({won:false,checkpoint:()=>gate.promise});await settle();
 await page.spin();await settle();
 assert.equal(page.checkpoints.length,1);
 assert.equal(page.checkpoints[0].locked,false);
 const checkpointWallet=Life.decode(page.checkpoints[0].entries[Life.KEY]);
 assert.equal(Life.reward(checkpointWallet,'pond').won,1);
 assert.equal(Life.reward(checkpointWallet,'pond').claimed,0);
 assert.equal(page.wallet().spins,1);
 assert.deepEqual(page.navigations,[]);
 gate.resolve();await settle();
});

for(const [kind,randomValues,balance] of [['pair',[0,0,.3],210],['miss',[0,.3,.6],190]])test(`a ${kind} saves seed spending immediately after releasing the wallet lock`,async()=>{
 const page=openSlots({won:false,randomValues});await settle();
 assert.equal(page.eventSaves.length,0);await page.spin();await settle();
 assert.equal(page.eventSaves.length,1);assert.equal(page.eventSaves[0].locked,false);
 const saved=Life.decode(page.eventSaves[0].entries[Life.KEY]);
 assert.equal(saved.lastResult.kind,kind);assert.equal(saved.balance,balance);
 assert.equal(page.checkpoints.length,0,'strict prize navigation checkpoints are separate');
});

test('an actual calendar refill requests an event save while an ordinary slot startup does not',async()=>{
 const page=openSlots({won:false,wallet:{balance:0,refillAt:Date.now()-86400000,lastRefillDay:null}});await settle();
 assert.equal(page.wallet().balance,Life.REFILL);assert.equal(page.eventSaves.length,1);
 assert.equal(page.eventSaves[0].locked,false);
 const ordinary=openSlots({won:false});await settle();assert.equal(ordinary.eventSaves.length,0);
});

test('a verified claim saves the koi and receipt, releases the wallet lock, and waits for cloud acknowledgement before navigating',async()=>{
 const gate=deferred(),page=openSlots({checkpoint:()=>gate.promise});await settle();
 const claiming=page.claim();await settle();
 assert.equal(page.checkpoints.length,1);
 assert.equal(page.checkpoints[0].locked,false,'network saving happens after the seed wallet lock is released');
 assert.equal(page.pond().fish.filter(fish=>fish.golden).length,1);
 assert.equal(Life.reward(page.wallet(),'pond').claimed,1);
 const captured=page.checkpoints[0].entries;
 assert.equal(Pond.decode(captured[Pond.KEY]).fish.filter(fish=>fish.golden).length,1);
 assert.equal(Life.reward(Life.decode(captured[Life.KEY]),'pond').claimed,1);
 assert.equal(page.element('#claim').disabled,true);
 assert.match(page.element('#claim-status').textContent,/Saving Kin to your account/);
 assert.deepEqual(page.navigations,[]);
 gate.resolve();await claiming;
 assert.deepEqual(page.navigations,['https://spriggan.test/pond/']);
});

test('failed account upload retains the local koi and receipt and exposes a retry that cannot duplicate the prize',async()=>{
 let attempts=0;
 const page=openSlots({checkpoint:p=>{
  attempts++;
  if(attempts===1){p.publish({status:'offline'});throw Object.assign(Error('connection lost'),{code:'unavailable'})}
  p.publish({status:'synced'});
 }});await settle();
 await page.claim();
 assert.deepEqual(page.navigations,[]);
 assert.equal(page.pond().fish.filter(fish=>fish.golden).length,1);
 assert.equal(Life.reward(page.wallet(),'pond').claimed,1);
 assert.equal(page.element('#claim').hidden,false);
 assert.equal(page.element('#claim').disabled,false);
 assert.equal(page.element('#claim').textContent,'Save & visit pond');
 assert.equal(page.element('#claim-hint').hidden,false);
 assert.match(page.element('#claim-status').textContent,/saved on this device.*account save did not finish/);
 assert.match(page.element('#save-status').textContent,/account save needs attention/);
 const balance=page.wallet().balance;
 await page.claim();
 assert.equal(attempts,2);
 assert.equal(page.wallet().balance,balance);
 assert.equal(page.pond().fish.filter(fish=>fish.golden).length,1);
 assert.equal(Life.reward(page.wallet(),'pond').claimed,1);
 assert.deepEqual(page.navigations,['https://spriggan.test/pond/']);
});

test('retrying a failed visit save does not consume another earned koi',async()=>{
 let attempts=0;
 const page=openSlots({wins:2,checkpoint:()=>{
  if(++attempts===1)throw Object.assign(Error('connection lost'),{code:'unavailable'});
 }});await settle();
 await page.claim();
 assert.equal(Life.reward(page.wallet(),'pond').won,2);
 assert.equal(Life.reward(page.wallet(),'pond').claimed,1);
 assert.equal(page.pond().fish.filter(fish=>fish.golden).length,1);
 await page.claim();
 assert.equal(attempts,2);
 assert.equal(Life.reward(page.wallet(),'pond').won,2);
 assert.equal(Life.reward(page.wallet(),'pond').claimed,1);
 assert.equal(page.pond().fish.filter(fish=>fish.golden).length,1);
 assert.deepEqual(page.navigations,['https://spriggan.test/pond/']);
});

test('a checkpoint flush preserves the reel reveal and reads a newer wallet instead of overwriting it',async()=>{
 const page=openSlots({won:false,motion:true,checkpoint:p=>p.emit('spriggan:flush')});await settle();
 await page.spin();await settle();
 assert.equal(page.checkpoints.length,1);
 assert.equal(page.element('#spin-label').textContent,'Turning…');
 const newer=page.wallet();newer.balance+=10;newer.kitchenCredits['another-world']=10;
 page.storage.setItem(Life.KEY,JSON.stringify(newer));
 page.emit('spriggan:flush');
 assert.equal(page.wallet().balance,newer.balance);
 assert.equal(page.wallet().kitchenCredits['another-world'],10);
 assert.equal(page.element('#spin-label').textContent,'Turning…');
});

test('a checkpoint that finishes after account context changes cannot navigate implicitly',async()=>{
 const gate=deferred(),page=openSlots({checkpoint:()=>gate.promise});await settle();
 const claiming=page.claim();await settle();page.publish({status:'changed'});gate.resolve();await claiming;
 assert.deepEqual(page.navigations,[]);
 assert.equal(page.pond().fish.filter(fish=>fish.golden).length,1);
 assert.equal(page.element('#claim').hidden,false);
 assert.match(page.element('#claim-status').textContent,/account changed/);
});

for(const mode of ['guest','unverified'])test(`${mode} claim keeps the local game flow without pretending to save to an account`,async()=>{
 const page=openSlots(mode==='guest'?{guest:true}:{verified:false});await settle();
 await page.claim();
 assert.equal(page.checkpoints.length,0);
 assert.equal(page.pond().fish.filter(fish=>fish.golden).length,1);
 assert.deepEqual(page.navigations,['https://spriggan.test/pond/']);
 assert.match(page.element('#save-status').textContent,mode==='guest'?/Saved in this browser/:/verify email/);
});

test('the slot save footer follows the account cloud status',async()=>{
 const page=openSlots();await settle();
 page.publish({status:'local'});assert.match(page.element('#save-status').textContent,/account save pending/);
 page.publish({status:'saving'});assert.match(page.element('#save-status').textContent,/saving to your account/);
 page.publish({status:'synced'});assert.equal(page.element('#save-status').textContent,'Saved to your account');
});

test('a missing previously claimed Kin offers explicit recovery and saves it before visiting',async()=>{
 const pond=Pond.create();pond.fish=[pond.fish[0]];pond.fish[0].name='Mochi';
 const gate=deferred(),page=openSlots({claimed:1,pond,checkpoint:()=>gate.promise});await settle();
 const before=page.wallet();
 assert.equal(page.element('#claim').textContent,'Recover Kin');
 assert.equal(page.element('#claim').hidden,false);
 assert.equal(page.element('#claim').disabled,false);
 assert.equal(page.pond().fish.length,1,'opening slots never resurrects a removed koi');
 const recovering=page.claim();await settle();
 assert.equal(page.checkpoints.length,1);
 assert.equal(page.checkpoints[0].locked,false);
 assert.equal(page.pond().fish.length,2);
 assert.equal(page.pond().fish[0].name,'Mochi');
 assert.equal(page.pond().fish[1].id,Life.GOLDEN_FISH_ID);
 assert.deepEqual(page.wallet(),before,'recovery neither spends seeds nor changes prize counts');
 assert.deepEqual(page.navigations,[]);
 gate.resolve();await recovering;
 assert.deepEqual(page.navigations,['https://spriggan.test/pond/']);
});

test('recovery upload retry preserves a single Kin and leaves the earned receipt unchanged',async()=>{
 const pond=Pond.create();pond.fish=[];
 let attempts=0;
 const page=openSlots({claimed:1,pond,checkpoint:()=>{if(++attempts===1)throw Error('offline')}});await settle();
 const before=page.wallet();
 await page.claim();
 assert.equal(page.element('#claim').textContent,'Save & visit pond');
 assert.equal(page.element('#claim').hidden,false);
 assert.deepEqual(page.navigations,[]);
 await page.claim();
 assert.equal(attempts,2);
 assert.equal(page.pond().fish.length,1);
 assert.equal(page.pond().fish[0].id,Life.GOLDEN_FISH_ID);
 assert.deepEqual(page.wallet(),before);
 assert.deepEqual(page.navigations,['https://spriggan.test/pond/']);
});

test('recovery is absent without a claim, for unreadable ponds, and for Kin already at home',async()=>{
 const pond=Pond.create();
 const home=Pond.create();const kin=Pond.makeFish(home.fish.length,Date.now(),true);kin.id=Life.GOLDEN_FISH_ID;home.fish.push(kin);
 for(const options of [{won:false,pond},{claimed:1},{claimed:1,pondRaw:'bad'},{claimed:1,pond:home}]){
  const page=openSlots(options);await settle();
  assert.equal(page.element('#claim').hidden,true);
  assert.equal(page.checkpoints.length,0);
 }
});

test('a full pond explains that Kin recovery needs room without creating or spending anything',async()=>{
 const pond=Pond.create();while(pond.fish.length<Pond.MAX_KOI)pond.fish.push(Pond.makeFish(pond.fish.length,Date.now()));
 const page=openSlots({claimed:1,pond});await settle();
 const before=page.wallet();
 assert.equal(page.element('#claim').textContent,'Recover Kin');
 assert.equal(page.element('#claim').disabled,true);
 assert.match(page.element('#claim-status').textContent,/Make room.*recover Kin/);
 await page.claim();
 assert.equal(page.pond().fish.length,Pond.MAX_KOI);
 assert.deepEqual(page.wallet(),before);
 assert.equal(page.checkpoints.length,0);
 assert.deepEqual(page.navigations,[]);
});
