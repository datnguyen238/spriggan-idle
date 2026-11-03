const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Kitchen=require('../dist/dumplings/kitchen-life.js');
const Slots=require('../dist/slots/slots-life.js');

// Execute the actual page controller; checkpoints observe only durable local snapshots.
function openKitchen(initial=Kitchen.create(),{flushCheckpoint=false}={}){
 const values=new Map([[Kitchen.KEY,JSON.stringify(initial)]]),elements=new Map(),listeners=new Map(),intervals=[],checkpoints=[];
 let locked=false,failWrites=false,backgroundStep;
 class Element{
  constructor(){this.attributes=new Map();this.dataset={};this.style={};this.textContent='';this.value='';this.classList={contains:()=>false,toggle(){}}}
  setAttribute(k,v){this.attributes.set(k,String(v))}getAttribute(k){return this.attributes.get(k)||null}
  addEventListener(){}contains(){return false}focus(){}scrollIntoView(){}
  getContext(){return{setTransform(){}}}getBoundingClientRect(){return{left:0,top:0,width:1000,height:700}}
 }
 const element=s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s)};
 const on=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)};
 const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(failWrites)throw Error('Storage full');values.set(key,String(value))}};
 class Audio{constructor(){this.players=new Map();this.enabled={};this.needsResume=false}setVolume(){}visibility(){}resume(){}toggle(){}}
 const sandbox={KitchenLife:Kitchen,SlotsLife:Slots,KitchenArt:class{constructor(){this.layout={}}render(){}},PondAudio:Audio,MapRain:class{draw(){}},
  SprigganStorage:storage,localStorage:storage,SprigganWorldLoading:{start:boot=>boot()},
  SprigganAccounts:{saveProgress(){checkpoints.push({locked,kitchen:JSON.parse(storage.getItem(Kitchen.KEY)),wallet:Slots.decode(storage.getItem(Slots.KEY))});if(flushCheckpoint)listeners.get('spriggan:flush')?.forEach(fn=>fn(new Event('spriggan:flush')));return Promise.resolve()}},
  SprigganRuntime:{mobile:false,runBackground(step){backgroundStep=step}},
  navigator:{locks:{async request(name,fn){locked=true;try{return await fn()}finally{locked=false}}}},
  document:{body:{dataset:{}},hidden:false,querySelector:element,querySelectorAll:()=>[],addEventListener:on},
  window:{addEventListener:on},location:{href:'https://spriggan.test/dumplings/'},
  matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}},
  performance:{now:()=>0},requestAnimationFrame(){},setInterval(fn){intervals.push(fn)},
  innerWidth:1000,innerHeight:700,devicePixelRatio:1,URL,structuredClone
 };
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/dumplings/kitchen.js'),'utf8'),sandbox);
 return{element,checkpoints,storage,step:dt=>backgroundStep(dt),periodic:()=>intervals.forEach(fn=>fn()),
  failWrites(value=true){failWrites=value},emit:type=>listeners.get(type)?.forEach(fn=>fn(new Event(type))),
  read:()=>Kitchen.decode(storage.getItem(Kitchen.KEY))};
}

test('kitchen recipe actions checkpoint their durable progress while idle saves do not',()=>{
 const page=openKitchen();
 assert.equal(page.checkpoints.length,0,'opening a kitchen is not a significant event');
 page.periodic();page.emit('spriggan:flush');page.step(.1);
 assert.equal(page.checkpoints.length,0,'background saves and flushes cannot recursively request checkpoints');
 page.element('#make').onclick();
 assert.equal(page.checkpoints.length,1);assert.equal(page.checkpoints[0].kitchen.stage,'wrapper');
 page.element('#make').onclick();
 assert.equal(page.checkpoints.length,2);assert.equal(page.checkpoints[1].kitchen.stage,'filled');
 page.element('#pause').onclick();
 assert.equal(page.checkpoints.at(-1).kitchen.paused,true);
});

test('steaming, cooking completion, serving and a real sale each checkpoint saved kitchen state',()=>{
 const ready=Kitchen.create();ready.basket=['meat'];
 const page=openKitchen(ready);
 page.element('#steamer').onclick();
 assert.equal(page.checkpoints.length,1);assert.equal(page.checkpoints[0].kitchen.cooking.length,1);
 for(let i=0;i<45;i++)page.step(1);
 assert.equal(page.read().ready,true);
 assert.equal(page.checkpoints.length,2,'elapsed cooking time checkpoints only its completion');
 assert.equal(page.checkpoints.at(-1).kitchen.ready,true);
 page.element('#steamer').onclick();
 assert.equal(page.checkpoints.length,3);assert.equal(page.checkpoints.at(-1).kitchen.plate.length,1);

 const selling=Kitchen.create();selling.shop.guests[0].phase='waiting';selling.plate=['meat'];
 const shop=openKitchen(selling);shop.step(.1);
 assert.equal(shop.checkpoints.length,1);assert.equal(shop.checkpoints[0].kitchen.shop.sales,1);
 assert.equal(shop.checkpoints[0].kitchen.shop.coins,3);
 shop.step(.1);assert.equal(shop.checkpoints.length,1,'the same customer cannot checkpoint a second payment');
});

test('seed purchases checkpoint the combined receipt and wallet after releasing the wallet lock',async()=>{
 const initial=Kitchen.create();initial.shop.coins=12;
 const page=openKitchen(initial);
 await page.element('#buy-seeds').onclick();
 assert.equal(page.checkpoints.length,1);assert.equal(page.checkpoints[0].locked,false);
 const checkpoint=page.checkpoints[0];
 assert.equal(checkpoint.wallet.balance,Slots.START+10);
 assert.equal(checkpoint.wallet.kitchenCredits[checkpoint.kitchen.shop.earningsId],10);
 await page.element('#buy-seeds').onclick();
 assert.equal(page.checkpoints.length,1,'an insufficient purchase is not a saved event');
});

for(const retry of ['periodic','flush'])test(`failed kitchen events checkpoint once after a successful ordinary ${retry} retry`,async()=>{
 const initial=Kitchen.create();initial.shop.coins=12;
 const page=openKitchen(initial,{flushCheckpoint:true});page.failWrites();
 page.element('#make').onclick();await page.element('#buy-seeds').onclick();
 assert.equal(page.checkpoints.length,0);assert.equal(page.read().stage,'empty');
 page.failWrites(false);
 if(retry==='periodic')page.periodic();else page.emit('spriggan:flush');
 assert.equal(page.checkpoints.length,1,'a durable retry preserves the pending significant event without recursive checkpoints');
 assert.equal(page.checkpoints[0].kitchen.stage,'wrapper');
 page.periodic();page.emit('spriggan:flush');
 assert.equal(page.checkpoints.length,1,'successful checkpoint requests clear the pending event');
});
