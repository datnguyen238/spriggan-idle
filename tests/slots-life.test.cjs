const test = require('node:test');
const assert = require('node:assert/strict');
const Life = require('../dist/slots/slots-life.js');
const PondLife = require('../dist/pond/pond-life.js');
const now = 1800000000000;

function sequence(...values) {
  let index = 0;
  return () => values[index++];
}

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value)
  };
}

function unlockedState() {
  const state = Life.create(now);
  state.goldenUnlocked = true;
  return state;
}


const FarmLife=require('../dist/pixel/farm-life.js');
test('new purse starts at 200 seeds with no prizes unlocked',()=>{const s=Life.create(now);assert.equal(s.balance,200);assert.equal(s.selectedMap,'pond');assert.equal(s.goldenUnlocked,false);assert.equal(s.cowUnlocked,false)});
test('a pair awards 20 seeds for a net gain of 10 and a miss costs 10',()=>{const s=Life.create(now);let r=Life.spin(s,sequence(0,0,.3),now);assert.equal(r.kind,'pair');assert.equal(r.payout,20);assert.equal(r.net,10);assert.equal(s.balance,210);r=Life.spin(s,sequence(0,.3,.5),now);assert.equal(r.kind,'miss');assert.equal(s.balance,200)});
test('any triple unlocks only the chosen map; duplicate wins do not duplicate rewards',()=>{for(const value of [0,.2,.4,.6,.8,.99]){const s=Life.create(now);s.selectedMap='farm';const r=Life.spin(s,()=>value,now);assert.equal(r.kind,'triple');assert.equal(r.newReward,true);assert.equal(r.map,'farm');assert.equal(s.cowUnlocked,true);assert.equal(s.goldenUnlocked,false);assert.equal(s.balance,190);assert.equal(Life.spin(s,()=>value,now).newReward,false);s.selectedMap='pond';Life.spin(s,()=>value,now);assert.equal(s.goldenUnlocked,true)}});
test('sixty spins no longer grant a guaranteed collectible',()=>{const s=Life.create(now);s.spins=59;Life.spin(s,sequence(0,.3,.5),now);assert.equal(s.goldenUnlocked,false);assert.equal(Life.decode(JSON.stringify(s),now).goldenUnlocked,false)});
test('empty purse waits until next local midnight, refills once to 50, never accumulates missed days',()=>{const t=new Date(2026,9,1,20,30).getTime(),s=Life.create(t);s.balance=10;Life.spin(s,sequence(0,.3,.5),t);const next=new Date(2026,9,2).getTime();assert.equal(s.refillAt,next);assert.equal(s.balance,0);assert.equal(Life.refill(s,t+1000),false);assert.equal(Life.spin(s,()=>0,t),null);const reloaded=Life.decode(JSON.stringify(s),t);assert.equal(Life.refill(reloaded,next-1),false);assert.equal(Life.refill(reloaded,next),true);assert.equal(reloaded.balance,50);assert.equal(Life.refill(reloaded,next),false);reloaded.balance=10;Life.spin(reloaded,sequence(0,.3,.5),next);assert.equal(Life.refill(reloaded,next+1),false);assert.equal(Life.refill(reloaded,new Date(2026,9,9).getTime()),true);assert.equal(reloaded.balance,50)});
test('nonempty balances remain untouched on later days and clock rollback cannot refill',()=>{const s=Life.create(now);s.balance=20;assert.equal(Life.refill(s,now+864000000),false);assert.equal(s.balance,20);s.balance=10;Life.spin(s,sequence(0,.3,.5),now);assert.equal(Life.refill(s,now-86400000),false)});
test('older balances and earned golden rewards migrate without a spin-count unlock',()=>{const s={...Life.create(now),version:1,balance:170,spins:80,goldenUnlocked:true};const migrated=Life.decode(JSON.stringify(s),now);assert.equal(migrated.balance,200);assert.equal(migrated.goldenUnlocked,true);assert.equal(migrated.version,3);assert.equal(Life.decode(JSON.stringify({...s,goldenUnlocked:false}),now).goldenUnlocked,false)});
test('results and separate prize flags survive reloading',()=>{const s=Life.create(now);s.selectedMap='farm';Life.spin(s,()=>0,now);assert.deepEqual(Life.decode(JSON.stringify(s),now),s);for(const bad of ['bad','null','{}',JSON.stringify({...s,balance:-10})])assert.equal(Life.decode(bad,now),null)});
test('all 216 equally likely outcomes have honest pair and triple frequencies',()=>{let pair=0,triple=0,miss=0;for(const a of Life.SYMBOLS)for(const b of Life.SYMBOLS)for(const c of Life.SYMBOLS){const r=Life.evaluate([a.id,b.id,c.id]);if(r.kind==='pair')pair++;else if(r.kind==='triple')triple++;else miss++}assert.equal(pair,90);assert.equal(triple,6);assert.equal(miss,120)});
test('cow claim adds one actual saved cow and preserves chickens, eggs, and meals',()=>{const s=Life.create(now);s.cowUnlocked=true;const farm=FarmLife.create(now);farm.birds[0].meals=83;farm.birds[0].layFood=83;const storage=memoryStorage([[FarmLife.KEY,JSON.stringify(farm)]]);assert.equal(Life.claimCow(s,storage,FarmLife,now).status,'claimed');const after=FarmLife.decode(storage.getItem(FarmLife.KEY),now);assert.deepEqual(after.birds,farm.birds);assert.equal(after.cow.id,Life.COW_ID);assert.equal(after.cow.name,'Buttercup');assert.equal(s.cowClaimed,true);assert.equal(Life.claimCow(s,storage,FarmLife,now).status,'existing')});
test('cow receipt retries safely after partial storage failure',()=>{const s=Life.create(now);s.cowUnlocked=true;const storage=memoryStorage(),write=storage.setItem;storage.setItem=(key,value)=>{if(key===Life.KEY)throw Error('full');write(key,value)};assert.equal(Life.claimCow(s,storage,FarmLife,now).status,'storage-error');assert.equal(s.cowClaimed,false);assert(FarmLife.decode(storage.getItem(FarmLife.KEY),now).cow);storage.setItem=write;assert.equal(Life.claimCow(s,storage,FarmLife,now).status,'existing');assert.equal(s.cowClaimed,true)});
test('locked prizes and invalid farm saves are never overwritten',()=>{const s=Life.create(now),storage=memoryStorage([[FarmLife.KEY,'bad']]);assert.equal(Life.claimCow(s,storage,FarmLife,now).status,'locked');s.cowUnlocked=true;assert.equal(Life.claimCow(s,storage,FarmLife,now).status,'invalid');assert.equal(storage.getItem(FarmLife.KEY),'bad')});
test('claim creates a missing pond and saves one stable golden Kin before the claim receipt', () => {
  const storage = memoryStorage();
  const state = unlockedState();
  const writes = [];
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { writes.push(key); setItem(key, value); };
  const result = Life.claimGolden(state, storage, PondLife, now);
  assert.equal(result.status, 'claimed');
  assert.equal(result.fish.id, Life.GOLDEN_FISH_ID);
  assert.equal(result.fish.name, 'Kin');
  assert.equal(result.fish.golden, true);
  assert.deepEqual(writes, [PondLife.KEY, Life.KEY]);
  const pond = PondLife.decode(storage.getItem(PondLife.KEY), now);
  assert.equal(pond.fish.length, 6);
  assert.equal(pond.fish.filter(fish => fish.golden).length, 1);
  assert.equal(state.goldenClaimed, true);
  assert.equal(Life.decode(storage.getItem(Life.KEY), now).goldenClaimed, true);
  assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'existing');
  assert.equal(PondLife.decode(storage.getItem(PondLife.KEY), now).fish.length, 6);
});

test('claim freshly reads the pond and preserves fish identities, care, and settings', () => {
  const pond = PondLife.create(now);
  pond.settings.night = true;
  pond.settings.rainVolume = 21;
  pond.settings.audio.ambient = true;
  pond.fish[0].name = 'Favorite koi';
  PondLife.feed(pond.fish[0], now);
  const storage = memoryStorage([[PondLife.KEY, JSON.stringify(pond)]]);
  const before = PondLife.decode(storage.getItem(PondLife.KEY), now);
  const state = unlockedState();
  assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'claimed');
  const after = PondLife.decode(storage.getItem(PondLife.KEY), now);
  assert.deepEqual(after.fish.slice(0, before.fish.length), before.fish);
  assert.deepEqual(after.settings, before.settings);
});

test('an existing golden koi satisfies the reward even in a full pond', () => {
  const pond = PondLife.create(now);
  while (pond.fish.length < PondLife.MAX_KOI) pond.fish.push(PondLife.makeFish(pond.fish.length, now));
  pond.fish[3].golden = true;
  pond.fish[3].name = 'My golden koi';
  const storage = memoryStorage([[PondLife.KEY, JSON.stringify(pond)]]);
  const state = unlockedState();
  const result = Life.claimGolden(state, storage, PondLife, now);
  assert.equal(result.status, 'existing');
  assert.equal(result.fish.id, pond.fish[3].id);
  assert.equal(result.fish.name, 'My golden koi');
  assert.equal(PondLife.decode(storage.getItem(PondLife.KEY), now).fish.length, 12);
  assert.equal(state.goldenClaimed, true);
});

test('locked, full, and invalid ponds are never overwritten or marked claimed', () => {
  const locked = Life.create(now);
  assert.equal(Life.claimGolden(locked, { getItem() { throw Error('must not read'); } }, PondLife, now).status, 'locked');
  const pond = PondLife.create(now);
  while (pond.fish.length < 12) pond.fish.push(PondLife.makeFish(pond.fish.length, now));
  for (const [raw, status] of [[JSON.stringify(pond), 'full'], ['not json', 'invalid'], ['null', 'invalid']]) {
    const state = unlockedState();
    const storage = memoryStorage([[PondLife.KEY, raw]]);
    assert.equal(Life.claimGolden(state, storage, PondLife, now).status, status);
    assert.equal(storage.getItem(PondLife.KEY), raw);
    assert.equal(storage.getItem(Life.KEY), null);
    assert.equal(state.goldenClaimed, false);
  }
});

test('storage read and pond-write failures leave the claim honest and retryable', () => {
  for (const failingMethod of ['getItem', 'setItem']) {
    const state = unlockedState();
    const storage = memoryStorage();
    const original = storage[failingMethod];
    storage[failingMethod] = () => { throw Error('Storage unavailable'); };
    assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'storage-error');
    assert.equal(state.goldenClaimed, false);
    storage[failingMethod] = original;
    assert.equal(storage.getItem(PondLife.KEY), null);
    assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'claimed');
  }
});

test('a failed slot receipt retries against the already saved fish without duplicating it', () => {
  const state = unlockedState();
  const storage = memoryStorage();
  const setItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === Life.KEY) throw Error('Slot receipt failed');
    setItem(key, value);
  };
  assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'storage-error');
  assert.equal(state.goldenClaimed, false);
  const firstPond = PondLife.decode(storage.getItem(PondLife.KEY), now);
  assert.equal(firstPond.fish.length, 6);
  assert.equal(firstPond.fish.find(fish => fish.golden).id, Life.GOLDEN_FISH_ID);
  storage.setItem = setItem;
  assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'existing');
  assert.equal(PondLife.decode(storage.getItem(PondLife.KEY), now).fish.length, 6);
  assert.equal(state.goldenClaimed, true);
});

test('the 200-seed migration applies once and preserves richer wallets and earned rewards',()=>{
 for(const version of [1,2])for(const balance of [0,50,190,350]){
  const old={...Life.create(now),version,balance,spins:12,cowUnlocked:true,goldenClaimed:true,selectedMap:'farm',refillAt:now+10000};
  const upgraded=Life.decode(JSON.stringify(old),now);
  assert.equal(upgraded.balance,Math.max(200,balance));assert.equal(upgraded.refillAt,null);assert.equal(upgraded.cowUnlocked,true);assert.equal(upgraded.goldenClaimed,true);assert.equal(upgraded.spins,12);assert.equal(upgraded.selectedMap,'farm');
  Life.spin(upgraded,sequence(0,.3,.5),now);
  const reloaded=Life.decode(JSON.stringify(upgraded),now);
  assert.equal(reloaded.balance,Math.max(200,balance)-10);
 }
});
