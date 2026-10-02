const test=require('node:test'),assert=require('node:assert/strict'),Life=require('../dist/hex/hex-life.js');
test('larger meadow protects the farm with four corner guards',()=>{
 assert.equal(Life.SIZE,7);assert.deepEqual(Life.TOWERS,[{q:-2,r:-2},{q:2,r:-2},{q:-2,r:2},{q:2,r:2}]);
 const s=Life.create();for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++)for(const type of Object.keys(Life.TYPES))assert.equal(Life.spawn(s,q,r,type).ok,false);
});
test('every creature spawns only in its habitat, never beyond the island',()=>{
 for(const type of Object.keys(Life.TYPES))for(let q=-7;q<=7;q++)for(let r=-7;r<=7;r++)assert.equal(Life.spawn(Life.create(),q,r,type).ok,Life.habitat(q,r,type));
 for(const [q,r] of [[8,0],[0,-8],[.5,3],[NaN,0]])assert.equal(Life.spawn(Life.create(),q,r).ok,false);
 assert.equal(Life.spawn(Life.create(),3,0,'invalid').ok,false);
});
test('every spawn tile has a connected habitat route ending outside the fence',()=>{
 for(const type of Object.keys(Life.TYPES))for(let q=-7;q<=7;q++)for(let r=-7;r<=7;r++){
 if(!Life.habitat(q,r,type))continue;const path=Life.path(q,r,type);let previous=[q,r];
 for(const tile of path){assert(Life.habitat(...tile,type));assert(!Life.farm(...tile));assert(Life.DIRS.some(([a,b])=>previous[0]+a===tile[0]&&previous[1]+b===tile[1]));previous=tile}
 assert(Life.bank(...previous),`${type} at ${q},${r} cannot reach fence`);
 }
});
test('land and aquatic movement stays outside the farm through the entire visit',()=>{
 for(const type of ['mochi','puddle'])for(let q=-7;q<=7;q++)for(let r=-7;r<=7;r++){
 if(!Life.habitat(q,r,type))continue;const s=Life.create();s.towers=[];Life.spawn(s,q,r,type);
 for(let i=0;i<1500&&s.creatures.length;i++){Life.step(s,.05);for(const c of s.creatures)assert(!Life.farm(c.q,c.r),`${type} crossed fence`)}
 assert(s.snacks>1);assert.equal(s.creatures.length,1);assert.equal(s.creatures[0].hp,Life.TYPES[type].hp);assert(s.creatures[0].chew>0);
 }
});
test('guards shoot traveling arrows and shoo creatures without duplicate rewards',()=>{
 const s=Life.create(),result=Life.spawn(s,-5,-2,'truffle');Life.step(s,.05);assert(s.arrows.length);assert.equal(result.creature.hp,4);
 for(let i=0;i<400;i++)Life.step(s,.05);assert.equal(s.shooed,1);assert.equal(s.creatures.length,0);assert.equal(s.arrows.length,0);
});
test('crowd stays bounded and creatures retain distinct behavior',()=>{
 assert(Life.TYPES.mochi.speed>Life.TYPES.sprout.speed);assert(Life.TYPES.truffle.hp>Life.TYPES.sprout.hp);
 const s=Life.create();for(let i=0;i<Life.LIMIT;i++)assert(Life.spawn(s,3,0).ok);assert.equal(Life.spawn(s,3,0).ok,false);
});
test('guards can hit every type spawned directly beside the farm',()=>{
 for(const type of Object.keys(Life.TYPES))for(let q=-7;q<=7;q++)for(let r=-7;r<=7;r++){
  if(!Life.habitat(q,r,type)||!Life.bank(q,r))continue;
  const s=Life.create(),c=Life.spawn(s,q,r,type).creature;
  Life.step(s,.05);assert(s.creatures.includes(c));assert.equal(s.snacks,0);
  for(let i=0;i<30;i++)Life.step(s,.05);
  assert(c.hp<c.maxHp,`${type} at ${q},${r} was ignored while nibbling`);
 }
});
test('unguarded fence visitors keep eating until their HP reaches zero',()=>{
 const s=Life.create();s.towers=[];Life.spawn(s,3,0);Life.step(s,.05);
 for(let i=0;i<40;i++)Life.step(s,.05);assert.equal(s.creatures.length,1);assert.equal(s.snacks,0);
 for(let i=0;i<42;i++)Life.step(s,.05);assert.equal(s.creatures.length,1);assert.equal(s.snacks,1);
 for(let i=0;i<160;i++)Life.step(s,.05);assert.equal(s.creatures.length,1);assert.equal(s.snacks,3);
 s.creatures[0].hp=1;s.towers=Life.create().towers;
 for(let i=0;i<60;i++)Life.step(s,.05);assert.equal(s.creatures.length,0);assert.equal(s.shooed,1);
 const snacks=s.snacks;for(let i=0;i<200;i++)Life.step(s,.05);assert.equal(s.snacks,snacks);
});
test('both rivers accept swimmers and have bridges for land creatures',()=>{
 for(const r of [-4,4]){assert(Life.spawn(Life.create(),0,r,'puddle').ok);assert(!Life.spawn(Life.create(),0,r,'mochi').ok);for(const q of [-4,4])assert(Life.spawn(Life.create(),q,r,'mochi').ok)}
});
test('the hundredth shooed monster adds a storey and resets only its counter',()=>{
 const s=Life.create();s.shooed=99;s.snacks=37;Life.spawn(s,3,0,'mochi');
 for(let i=0;i<60;i++)Life.step(s,.05);
 assert.equal(s.storeys,2);assert.equal(s.shooed,0);assert.equal(s.snacks,37);
});
test('the hundredth snack removes a storey and keeps the monster eating',()=>{
 const s=Life.create();s.towers=[];s.storeys=3;s.snacks=99;s.shooed=41;Life.spawn(s,3,0);
 for(let i=0;i<83;i++)Life.step(s,.05);
 assert.equal(s.storeys,2);assert.equal(s.snacks,0);assert.equal(s.shooed,41);assert.equal(s.creatures.length,1);
 s.storeys=1;s.snacks=99;s.creatures[0].chew=.01;Life.step(s,.05);
 assert.equal(s.storeys,1);assert.equal(s.snacks,0);
});
test('saved progress migrates old totals, carries overflow and tolerates invalid data',()=>{
 assert.deepEqual(Life.progress('{bad'),{storeys:1,shooed:0,snacks:0});
 assert.deepEqual(Life.progress(JSON.stringify({shooed:253,snacks:117})),{storeys:2,shooed:53,snacks:17});
 const saved={storeys:5,shooed:42,snacks:19};assert.deepEqual(Life.progress(JSON.stringify(saved)),saved);
 assert.deepEqual(Life.progress(JSON.stringify({storeys:-2,shooed:1.5,snacks:'99'})),{storeys:1,shooed:0,snacks:0});
});
