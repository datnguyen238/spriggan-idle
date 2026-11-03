const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Hex=require('../dist/hex/hex-life.js');
const KEY='spriggan.hex.totals.v1';

function openMeadow(initial={shooed:4,snacks:2,storeys:1},{failInitialWrites=false}={}){
 const values=new Map([[KEY,JSON.stringify(initial)]]),elements=new Map(),frames=[],listeners=new Map(),checkpoints=[];
 let mutation=null,failWrites=failInitialWrites,backgroundStep,backgroundSave;
 const gradient={addColorStop(){}},context=new Proxy({},{get(target,key){return target[key]||(['createLinearGradient','createRadialGradient'].includes(key)?()=>gradient:()=>{})}});
 class Element{
  constructor(){this.attributes=new Map();this.style={};this.dataset={};this.classList={contains:()=>false,toggle(){}}}
  getContext(){return context}getBoundingClientRect(){return{width:1000,height:650,left:0,top:0}}
  setAttribute(k,v){this.attributes.set(k,String(v))}getAttribute(k){return this.attributes.get(k)||null}
  addEventListener(){}contains(){return false}
 }
 const element=s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s)};
 const on=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)};
 const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(failWrites)throw Error('Storage full');values.set(key,String(value))}};
 const sandbox={HexLife:{...Hex,step(state,dt){state.time+=dt;mutation?.(state);mutation=null}},
  SprigganStorage:storage,localStorage:storage,SprigganWorldLoading:{start:boot=>boot()},
  SprigganAccounts:{saveProgress(){checkpoints.push(JSON.parse(storage.getItem(KEY)));return Promise.resolve()}},
  SprigganRuntime:{runBackground(step,save){backgroundStep=step;backgroundSave=save}},MapRain:class{enabled=false;draw(){}},
  document:{hidden:false,body:{dataset:{}},querySelector:element,querySelectorAll:()=>[],addEventListener:on},
  window:{addEventListener:on},matchMedia:()=>({matches:true}),performance:{now:()=>0},
  ResizeObserver:class{observe(){}},devicePixelRatio:1,requestAnimationFrame:fn=>frames.push(fn)
 };
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/hex/hex.js'),'utf8'),sandbox);
 return{checkpoints,element,frame(now=20){frames.shift()(now)},
  change(fn){mutation=fn},background(){backgroundStep(.1);backgroundSave()},
  failWrites(value=true){failWrites=value},read:()=>JSON.parse(storage.getItem(KEY)),
  emit:type=>listeners.get(type)?.forEach(fn=>fn(new Event(type)))};
}

test('meadow frames and view controls do not checkpoint unchanged scores',()=>{
 const page=openMeadow();assert.equal(page.checkpoints.length,0);
 page.frame();page.frame(40);page.element('#zoom-in').onclick();page.emit('spriggan:flush');
 assert.equal(page.checkpoints.length,0);assert.deepEqual(page.read(),{shooed:4,snacks:2,storeys:1});
});

test('a saved shoo, snack, or keep change checkpoints the current totals once',()=>{
 const page=openMeadow();page.change(state=>{state.shooed++;state.storeys++});page.frame();
 assert.deepEqual(page.checkpoints,[{shooed:5,snacks:2,storeys:2}]);
 page.frame(40);assert.equal(page.checkpoints.length,1);
 page.change(state=>state.snacks++);page.background();
 assert.deepEqual(page.checkpoints.at(-1),{shooed:5,snacks:3,storeys:2});
 page.emit('spriggan:flush');assert.equal(page.checkpoints.length,2,'checkpoint flush does not recurse');
});

test('a failed local meadow write waits for a successful retry before requesting a cloud save',()=>{
 const page=openMeadow();page.failWrites();page.change(state=>state.shooed++);page.frame();
 assert.equal(page.checkpoints.length,0);assert.equal(page.read().shooed,4);
 page.failWrites(false);page.frame(40);
 assert.deepEqual(page.checkpoints,[{shooed:5,snacks:2,storeys:1}]);
});

test('a failed startup write does not hide a real score event in the first successful retry',()=>{
 for(const changed of [false,true]){
  const page=openMeadow(undefined,{failInitialWrites:true});
  assert.equal(page.checkpoints.length,0);
  if(changed)page.change(state=>state.shooed++);
  page.failWrites(false);page.frame();
  assert.deepEqual(page.checkpoints,changed?[{shooed:5,snacks:2,storeys:1}]:[],
   'only actual score changes request a checkpoint after startup storage recovers');
  page.frame(40);assert.equal(page.checkpoints.length,changed?1:0);
 }
});
