const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Farm=require('../dist/pixel/farm-life.js');

const initialTime=1800000000000;
function openFarm(initial=Farm.create(initialTime),options={}){
 let now=initialTime,perf=0,failWrites=false,background;
 const values=new Map([[Farm.KEY,JSON.stringify(initial)]]),elements=new Map(),listeners=new Map(),checkpoints=[];
 const drawing=new Proxy({}, {get:(target,key)=>target[key]||(()=>{})});
 class Element{
  constructor(){this.value='';this.hidden=false;this.textContent='';this.children=[];this.attributes=new Map();this.classList={toggle(){}}}
  getContext(){return drawing}
  getBoundingClientRect(){return{width:900,height:600,left:0,top:0}}
  setAttribute(key,value){this.attributes.set(key,String(value))}
  getAttribute(key){return this.attributes.get(key)||null}
  addEventListener(type,fn){listeners.set(type,fn)}
  replaceChildren(...children){this.children=children}
  add(child){this.children.push(child)}
  focus(){}
 }
 const element=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector)};
 element('#toggle-controls').setAttribute('aria-expanded','true');
 const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(failWrites)throw Error('Storage full');values.set(key,String(value))}};
 const life={...Farm,...options.life};
 const sandbox={
  FarmLife:life,SprigganStorage:storage,SprigganWorldLoading:{start:boot=>boot()},
  SprigganAccounts:options.guest?undefined:{saveProgress(){checkpoints.push(Farm.decode(storage.getItem(Farm.KEY),now));return Promise.resolve()}},
  SprigganRuntime:{mobile:false,runBackground(update,tick){background={update,tick}}},
  FarmAudio:class{constructor(fn){this.fn=fn}notify(){this.fn({enabled:false,volume:.5,needsResume:false,playing:false})}visibility(){}},
  MapRain:class{constructor(){this.enabled=false}},
  document:{hidden:false,querySelector:element,addEventListener(){}},
  window:{addEventListener(type,fn){listeners.set(type,fn)}},
  ResizeObserver:class{observe(){}},Option:class{constructor(label,value){this.label=label;this.value=value}},
  Date:class extends Date{static now(){return now}},
  Math:Object.assign(Object.create(Math),{random:()=>.5}),
  matchMedia:()=>({matches:false}),devicePixelRatio:1,
  confirm:()=>options.confirm!==false,performance:{now:()=>perf},requestAnimationFrame(){},
 };
 vm.runInNewContext(fs.readFileSync(require.resolve('../dist/pixel/farm.js'),'utf8'),sandbox);
 return{
  checkpoints,element,read:()=>Farm.decode(storage.getItem(Farm.KEY),now),
  fail(value=true){failWrites=value},
  tick(ms=1001){now+=ms;perf+=ms;background.tick()},
  update(dt=.05){background.update(dt)},
  emit(type){listeners.get(type)?.({type})},
  select(id){element('#flock-picker').value=id;element('#flock-picker').onchange()},
 };
}

test('farm clock and movement saves stay local while animal removal checkpoints its saved result',()=>{
 const page=openFarm(),first=page.read().birds[0];
 page.tick();page.tick();page.update();
 assert.equal(page.checkpoints.length,0,'clock-only ticks must not request cloud writes');
 page.select(first.id);page.element('#remove-bird').onclick();
 assert.equal(page.checkpoints.length,1);
 assert.equal(page.checkpoints[0].birds.some(bird=>bird.id===first.id),false);
 assert.equal(page.read().birds.length,1);
 page.tick();assert.equal(page.checkpoints.length,1);
});

test('restarting an empty flock checkpoints the new birds but cancelling a removal does not',()=>{
 const empty=Farm.create(initialTime);empty.birds=[];
 const page=openFarm(empty);page.element('#restart-flock').onclick();
 assert.equal(page.checkpoints.length,1);assert.equal(page.checkpoints[0].birds.length,2);
 const cancelled=openFarm(Farm.create(initialTime),{confirm:false});
 cancelled.select(cancelled.read().birds[0].id);cancelled.element('#remove-bird').onclick();
 assert.equal(cancelled.checkpoints.length,0);assert.equal(cancelled.read().birds.length,2);
});

test('laying eggs, hatching, and maturing chicks checkpoint only after the new farm is stored',()=>{
 const laying=Farm.create(initialTime);laying.birds[0].layFood=Farm.LAY_MEALS;
 const laid=openFarm(laying);
 assert.equal(laid.checkpoints.length,1);assert.equal(laid.checkpoints[0].eggs.length,1);
 laid.tick();assert.equal(laid.checkpoints.length,1,'waiting for an egg is not another event');
 laid.tick(Farm.HATCH);
 assert.equal(laid.checkpoints.length,2);assert.equal(laid.checkpoints[1].hatched,1);assert.equal(laid.checkpoints[1].eggs.length,0);
 const mature=Farm.create(initialTime);mature.birds[0].stage='chick';mature.birds[0].meals=Farm.GROW_MEALS;
 const grown=openFarm(mature);
 assert.equal(grown.checkpoints.length,1);assert.equal(grown.checkpoints[0].birds[0].stage,'adult');
});

test('actual fox removal checkpoints once while a visitor moving through the farm does not',()=>{
 let calls=0;
 const page=openFarm(Farm.create(initialTime),{life:{foxStep(state,visitor){
  if(++calls===2){const lost=Farm.removeBird(state,state.birds[0].id);return{visitor:{},lost}}
  return{visitor:{}};
 }}});
 page.update();assert.equal(page.checkpoints.length,0);
 page.update();assert.equal(page.checkpoints.length,1);assert.equal(page.checkpoints[0].birds.length,1);
 page.update();page.tick();assert.equal(page.checkpoints.length,1);
});

test('individual feeding frames become one checkpoint at the next rule save',()=>{
 const farm=Farm.create(initialTime);for(const bird of farm.birds){bird.x=.5;bird.y=.62}
 const page=openFarm(farm);page.element('#feed').onclick();
 for(let frame=0;frame<8;frame++)page.update();
 assert.equal(page.checkpoints.length,0,'feeding never uploads from each animation frame');
 page.tick();
 assert.equal(page.checkpoints.length,1);assert.ok(page.checkpoints[0].birds.some(bird=>bird.meals>0));
 page.tick();assert.equal(page.checkpoints.length,1,'time passing without another meal is not a checkpoint');
});

test('a failed local write delays the significant checkpoint until a later successful save',()=>{
 const page=openFarm(),first=page.read().birds[0];page.fail();
 page.select(first.id);page.element('#remove-bird').onclick();
 assert.equal(page.checkpoints.length,0);assert.equal(page.read().birds.length,2);
 page.fail(false);page.tick();
 assert.equal(page.checkpoints.length,1);assert.equal(page.checkpoints[0].birds.length,1);
 page.emit('spriggan:flush');assert.equal(page.checkpoints.length,1,'a flush event object is not a significant-event flag');
});

test('guest farms keep significant local changes without requiring the account API',()=>{
 const page=openFarm(Farm.create(initialTime),{guest:true});page.select(page.read().birds[0].id);
 page.element('#remove-bird').onclick();assert.equal(page.read().birds.length,1);assert.equal(page.checkpoints.length,0);
});
