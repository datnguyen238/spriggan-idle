const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Journal = require('../dist/shared/park-journal.js');
const Pond = require('../dist/pond/pond-life.js');
const Farm = require('../dist/pixel/farm-life.js');
const Fishing = require('../dist/fishing/fishing-life.js');
const Claw = require('../dist/claw/claw-life.js');
const Kitchen = require('../dist/dumplings/kitchen-life.js');
const Slots = require('../dist/slots/slots-life.js');
const now = 1800000000000;

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {getItem:key => values.get(key) ?? null,setItem:(key,value) => values.set(key,value),removeItem:key => values.delete(key),values};
}
function save(store, key, value) {store.setItem(key,JSON.stringify(value));}
function visit(previous, store, options = {}) {
  return Journal.updateJournal(previous,Journal.readSnapshot(store,now),{now,...options});
}

test('the browser global and CommonJS module expose the same dependency-free journal', () => {
  const context = vm.createContext({Date,Math,Set,Map});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/shared/park-journal.js'),'utf8'),context);
  assert.equal(context.SprigganJournal.KEY,'spriggan.park.v1');
  assert.equal(typeof context.SprigganJournal.readSnapshot,'function');
  assert.deepEqual(JSON.parse(JSON.stringify(context.SprigganJournal.updateJournal(null,{}, {now}))),{version:1,lastWorld:null,lastVisitedAt:0,snapshot:{},memories:[]});
});

test('an established park gets an honest baseline rather than invented new achievements', () => {
  const store = storage(), pond = Pond.create(now), farm = Farm.create(now), guide = Fishing.createProgress();
  Fishing.recordCatch(guide,{id:'first-catch',species:'willow-minnow',length:9,at:now});
  save(store,Pond.KEY,pond); save(store,Farm.KEY,farm); save(store,Fishing.KEY,guide);
  const before = Object.fromEntries(store.values), journal = visit(null,store);
  assert.equal(journal.memories.length,0);
  assert.equal(journal.snapshot.pond.fish.length,5);
  assert.equal(journal.snapshot.fishing.records['willow-minnow'].count,1);
  assert.deepEqual(Object.fromEntries(store.values),before,'reading never saves, feeds, hatches or settles growth');
  assert.deepEqual(visit(journal,store),journal);
});

test('the first catch and a later length record become different memories, without one per repeated catch', () => {
  const store = storage(), guide = Fishing.createProgress();
  let journal = visit(null,store,{world:'fishing'});
  Fishing.recordCatch(guide,{id:'first-catch',species:'willow-minnow',length:9,at:now});
  save(store,Fishing.KEY,guide);
  journal = visit(journal,store,{now:now+1});
  assert.equal(journal.memories.length,1);
  assert.match(journal.memories[0].text,/met the Willow Minnow/);
  Fishing.recordCatch(guide,{id:'small-catch',species:'willow-minnow',length:8,at:now+2});
  save(store,Fishing.KEY,guide);
  journal = visit(journal,store,{now:now+2});
  assert.equal(journal.memories.length,1);
  Fishing.recordCatch(guide,{id:'record-catch',species:'willow-minnow',length:11.5,at:now+3});
  save(store,Fishing.KEY,guide);
  journal = visit(journal,store,{now:now+3});
  assert.equal(journal.memories.length,2);
  assert.match(journal.memories[0].text,/record: 11\.5 cm/);
  assert.equal(journal.memories[0].world,'fishing');
  assert.equal(visit(journal,store).memories.length,2);
});

test('new koi and gradual saved growth are remembered without simulating elapsed days', () => {
  const store = storage(), pond = Pond.create(now);
  save(store,Pond.KEY,pond);
  let journal = visit(null,store);
  pond.fish[0].nutrition = 3;
  save(store,Pond.KEY,pond);
  assert.equal(visit(journal,store,{now:now+86400000*30}).memories.length,0,'nutrition and absence alone do not prove saved growth');
  for (let i=1;i<=11;i++) {
    pond.fish[0].growth = i / 100;
    save(store,Pond.KEY,pond);
    journal = visit(journal,store,{now:now+i});
  }
  assert.equal(journal.memories.length,1);
  assert.match(journal.memories[0].text,/Mochi has grown a little/);
  pond.fish.push({...Pond.makeFish(5,now,true),id:'golden-new'});
  save(store,Pond.KEY,pond);
  journal = visit(journal,store,{now:now+20});
  assert.match(journal.memories[0].text,/Kin joined your pond/);
  assert.equal(journal.memories.length,2);
});

test('farm memories distinguish persisted hatching and growing up from merely due eggs', () => {
  const store = storage(), farm = Farm.create(now);
  farm.eggs.push({id:'egg-one',x:.5,y:.6,laid:now,hatchesAt:now+Farm.HATCH});
  save(store,Farm.KEY,farm);
  let journal = visit(null,store);
  assert.equal(visit(journal,store,{now:now+Farm.HATCH}).memories.length,0);
  Farm.advance(farm,now+Farm.HATCH,()=>0);
  save(store,Farm.KEY,farm);
  journal = visit(journal,store,{now:now+Farm.HATCH});
  assert.match(journal.memories[0].text,/An egg hatched/);
  const chick = farm.birds.find(b=>b.stage==='chick');
  chick.meals = Farm.GROW_MEALS;
  Farm.advance(farm,now+Farm.HATCH+1,()=>0);
  save(store,Farm.KEY,farm);
  journal = visit(journal,store,{now:now+Farm.HATCH+1});
  assert.equal(journal.memories.length,2);
  assert.match(journal.memories[0].text,/grew up and joined the flock/);
  assert.equal(journal.memories[0].world,'pixel');
});

test('a kept plush is remembered, while selling and restoring older counts do not replay it', () => {
  const store = storage(), claw = Claw.decode(null);
  let journal = visit(null,store);
  Claw.collect(claw,'frog','frog-one'); save(store,Claw.KEY,claw);
  journal = visit(journal,store);
  assert.match(journal.memories[0].text,/Moss found a home/);
  Claw.sell(claw,'frog-one'); save(store,Claw.KEY,claw);
  journal = visit(journal,store);
  Claw.collect(claw,'frog','frog-two'); save(store,Claw.KEY,claw);
  journal = visit(journal,store);
  assert.equal(journal.memories.length,1);
  Claw.collect(claw,'frog','frog-three'); save(store,Claw.KEY,claw);
  journal = visit(journal,store);
  assert.match(journal.memories[0].text,/2 Moss friends/);
});

test('the kitchen celebrates meals actually sold rather than each fold or cooked batch', () => {
  const store = storage(), shop = Kitchen.create();
  let journal = visit(null,store);
  shop.served = 6; shop.plate = Array(6).fill('mushroom');
  save(store,Kitchen.KEY,shop);
  journal = visit(journal,store);
  assert.equal(journal.memories.length,0);
  shop.shop.sales = 1; save(store,Kitchen.KEY,shop);
  journal = visit(journal,store);
  assert.match(journal.memories[0].text,/first dumpling found a hungry neighbor/);
  shop.shop.sales = 9; save(store,Kitchen.KEY,shop);
  journal = visit(journal,store);
  assert.equal(journal.memories.length,1);
  shop.shop.sales = 11; save(store,Kitchen.KEY,shop);
  journal = visit(journal,store);
  assert.match(journal.memories[0].text,/shared 10 dumplings/);
});

test('Golden Seed prizes and new keep heights produce specific world memories', () => {
  const store = storage(), slots = Slots.create(now);
  let journal = visit(null,store);
  Slots.spin(slots,()=>0,now); save(store,Slots.KEY,slots);
  save(store,Journal.SAVE_KEYS.hex,{shooed:0,snacks:0,storeys:2});
  journal = visit(journal,store);
  assert.equal(journal.memories.length,2);
  assert(journal.memories.some(m=>m.world==='slots' && /Stillwater Pond/.test(m.text)));
  assert(journal.memories.some(m=>m.world==='hex' && /2 storeys/.test(m.text)));
});

test('missing, corrupted and blocked storage never replace known facts or invent progress', () => {
  const store = storage(), pond = Pond.create(now), guide = Fishing.createProgress();
  Fishing.recordCatch(guide,{id:'caught',species:'glassfin',length:12,at:now});
  save(store,Pond.KEY,pond); save(store,Fishing.KEY,guide);
  const journal = visit(null,store);
  store.setItem(Pond.KEY,'{bad'); store.setItem(Fishing.KEY,JSON.stringify({version:1,records:{glassfin:{count:2,bestLength:999}}}));
  let next = visit(journal,store);
  assert.deepEqual(next.snapshot,journal.snapshot);
  assert.equal(next.memories.length,0);
  next = visit(next,{getItem(){throw new Error('storage blocked');}});
  assert.deepEqual(next,journal);
  assert.deepEqual(Journal.readSnapshot(undefined),{});
  store.removeItem(Pond.KEY); store.removeItem(Fishing.KEY);
  next = visit(journal,store);
  assert.deepEqual(next.snapshot.pond,journal.snapshot.pond);
  assert.deepEqual(next.snapshot.fishing,journal.snapshot.fishing);
  assert.equal(next.memories.length,0);
});

test('the most recent world continues across park updates and metadata reloads', () => {
  const store = storage();
  let journal = visit(null,store,{world:'fishing',now});
  journal = visit(JSON.stringify(journal),store,{world:null,now:now+10});
  assert.equal(journal.lastWorld,'fishing'); assert.equal(journal.lastVisitedAt,now);
  journal = visit(journal,store,{world:'pixel',now:now+20});
  assert.equal(journal.lastWorld,'pixel'); assert.equal(journal.lastVisitedAt,now+20);
  journal = visit(journal,store,{world:'https://untrusted.example/',now:now+30});
  assert.equal(journal.lastWorld,'pixel'); assert.equal(journal.lastVisitedAt,now+20);
});

test('memories stay bounded, newest first, and deduplicated across repeated reads', () => {
  const store = storage();
  let journal = visit(null,store);
  for (let storeys=2;storeys<=35;storeys++) {
    save(store,Journal.SAVE_KEYS.hex,{shooed:0,snacks:0,storeys});
    journal = visit(journal,store,{now:now+storeys});
  }
  assert.equal(journal.memories.length,Journal.MAX_MEMORIES);
  assert.match(journal.memories[0].text,/35 storeys/);
  assert.equal(new Set(journal.memories.map(m=>m.id)).size,20);
  assert(journal.memories.every((m,i)=>!i || journal.memories[i-1].at >= m.at));
  assert.deepEqual(visit(journal,store),journal);
});

test('a clock rollback preserves memory order and does not replay recorded achievements', () => {
  const store = storage();
  let journal = visit(null,store);
  save(store,Journal.SAVE_KEYS.hex,{storeys:2});
  journal = visit(journal,store,{now:now+100});
  save(store,Journal.SAVE_KEYS.hex,{storeys:3});
  journal = visit(journal,store,{now:now+10});
  assert(journal.memories[0].at >= journal.memories[1].at);
  save(store,Journal.SAVE_KEYS.hex,{storeys:1});
  journal = visit(journal,store,{now:now+200});
  save(store,Journal.SAVE_KEYS.hex,{storeys:3});
  journal = visit(journal,store,{now:now+300});
  assert.equal(journal.memories.length,2);
});

test('untrusted metadata is normalized and functions never mutate their arguments', () => {
  const store = storage(), baseline = visit(null,store);
  const snapshot = Journal.readSnapshot(store), previous = JSON.stringify(baseline), incoming = JSON.stringify(snapshot);
  Journal.updateJournal(baseline,snapshot,{world:'pond',now});
  assert.equal(JSON.stringify(baseline),previous); assert.equal(JSON.stringify(snapshot),incoming);
  const malformed = {version:1,lastWorld:'elsewhere',lastVisitedAt:-1,snapshot:{fishing:{records:{'__proto__':{count:1,bestLength:10}}}},memories:[{id:'bad',world:'pond',text:'x',at:-1}]};
  const clean = visit(malformed,store);
  assert.equal(clean.lastWorld,null); assert.equal(clean.lastVisitedAt,0); assert.equal(clean.memories.length,0);
  assert.doesNotThrow(()=>visit('{bad',store));
});
