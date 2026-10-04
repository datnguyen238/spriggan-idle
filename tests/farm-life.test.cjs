const {test}=require('node:test');const assert=require('node:assert/strict');const L=require('../dist/pixel/farm-life.js');
function meals(b,count){for(let i=0;i<count;i++)L.feed(b)}
test('farm begins with an adult hen and rooster',()=>{const s=L.create(0);assert.deepEqual(s.birds.map(b=>b.sex),['hen','rooster']);assert.equal(s.eggs.length,0)});
test('each egg needs 100 meals eaten by the hen, with no extra time gate',()=>{const s=L.create(0),hen=s.birds[0];meals(s.birds[1],100);L.advance(s,999999);assert.equal(s.eggs.length,0);meals(hen,99);L.advance(s,999999);assert.equal(s.eggs.length,0);L.feed(hen);L.advance(s,0);assert.equal(s.eggs.length,1);assert.equal(hen.layFood,0);L.advance(s,0);assert.equal(s.eggs.length,1);meals(hen,99);L.advance(s,0);assert.equal(s.eggs.length,1);L.feed(hen);L.advance(s,0);assert.equal(s.eggs.length,2);const alone=L.create(0);alone.birds.pop();meals(alone.birds[0],100);L.advance(alone,0);assert.equal(alone.eggs.length,0)});
test('egg hatches at exactly three minutes and chick grows at exactly 200 meals',()=>{const s=L.create(0);meals(s.birds[0],100);L.advance(s,0);assert.equal(L.HATCH,180000);L.advance(s,179999);assert.equal(s.birds.length,2);L.advance(s,180000,()=>0);assert.equal(s.birds.length,3);assert.equal(s.eggs.length,0);const chick=s.birds[2];meals(chick,199);L.advance(s,180000);assert.equal(chick.stage,'chick');L.feed(chick);L.advance(s,180000);assert.equal(chick.stage,'adult');assert.equal(chick.layFood,0);meals(chick,100);L.advance(s,180000);assert.equal(s.eggs.length,1);assert.equal(s.hatched,1)});
test('saved eggs hatch once on return without creating generations of offline birds',()=>{const s=L.create(0);meals(s.birds[0],100);L.advance(s,0);const restored=L.decode(JSON.stringify(s),99999999);L.advance(restored,99999999);assert.equal(restored.birds.length,3);assert.equal(restored.birds[2].stage,'chick');L.advance(restored,99999999);assert.equal(restored.birds.length,3)});
test('population includes eggs and never exceeds sixteen; full yard preserves laying meals',()=>{const s=L.create(0);while(s.birds.length<16)s.birds.push({...s.birds[0],id:String(s.birds.length),layFood:100});meals(s.birds[0],100);L.advance(s,0);assert.equal(s.eggs.length,0);assert.equal(s.birds[0].layFood,100);s.birds.pop();L.advance(s,0);assert.equal(s.eggs.length,1);L.advance(s,L.HATCH);assert.equal(s.birds.length,16);assert.equal(s.eggs.length,0)});
test('storage validates data and preserves partial progress on reload',()=>{const s=L.create();meals(s.birds[0],87);assert.deepEqual(L.decode(JSON.stringify(s)),s);for(const value of ['no','null','{}',JSON.stringify({...s,birds:[null]})])assert.equal(L.decode(value),null)});
test('older farm saves retain birds and progress while eggs migrate to three-minute incubation',()=>{const s=L.create(0);s.version=1;s.birds[0].layFood=2;s.birds[0].meals=8;s.birds[0].nextEgg=1234;s.eggs=[{id:'old-egg',x:.5,y:.5,laid:1000,hatchesAt:91000}];const restored=L.decode(JSON.stringify(s),100000);assert.equal(restored.version,2);assert.equal(restored.birds[0].meals,8);assert.equal(restored.birds[0].layFood,2);assert.equal(restored.eggs[0].hatchesAt,181000);L.advance(restored,100000);assert.equal(restored.birds.length,2);assert.equal('nextEgg' in restored.birds[0],false)});

test('remove only the selected chicken, preserving eggs and other birds',()=>{const s=L.create(0),hen=s.birds[0];meals(hen,100);L.advance(s,0);assert.equal(L.removeBird(s,hen.id),hen);assert.equal(s.birds.length,1);assert.equal(s.birds[0].sex,'rooster');assert.equal(s.eggs.length,1);assert.equal(L.removeBird(s,hen.id),null);assert.deepEqual(L.decode(JSON.stringify(s),0),s)});
test('empty farms persist without silently restoring removed chickens',()=>{const s=L.create(0);for(const b of [...s.birds])L.removeBird(s,b.id);assert.equal(s.birds.length,0);assert.deepEqual(L.decode(JSON.stringify(s),0),s)});
test('fox visits permanently remove one extra adult and preserve the breeding pair',()=>{
 const s=L.create(0);s.birds.push({...s.birds[0],id:'extra',name:'Daisy'});s.foxWait=L.FOX_WAIT-.01;
 let visitor=null,lost=0;for(let i=0;i<1000;i++){const result=L.foxStep(s,visitor,.05,()=>0);visitor=result.visitor;if(result.lost){lost++;assert.equal(visitor.carrying.name,result.lost.name)}}
 assert.equal(lost,1);assert.equal(s.birds.length,2);assert.equal(s.birds.filter(b=>b.sex==='hen').length,1);assert.equal(s.birds.filter(b=>b.sex==='rooster').length,1);assert.equal(visitor,null);
 assert.equal(L.decode(JSON.stringify(s),0).birds.length,2);
});
test('fox countdown does not attack chicks, eggs, cows, or the last pair',()=>{
 const s=L.create(0);s.birds.push({...s.birds[0],id:'chick',stage:'chick'});s.cows.push(L.makeCow(0));s.foxWait=L.FOX_WAIT;
 assert.equal(L.foxStep(s,null,.05).visitor,null);assert.equal(s.birds.length,3);assert.equal(s.cows.length,1);
});
test('fox waiting time persists but wall-clock absence never triggers an attack',()=>{
 const s=L.create(0);s.birds.push({...s.birds[0],id:'extra'});s.foxWait=60;
 const restored=L.decode(JSON.stringify(s),9999999);L.advance(restored,9999999);assert.equal(restored.birds.length,3);assert.equal(restored.foxWait,60);
 assert.equal(L.foxStep(restored,null,.05).visitor,null);assert.equal(restored.foxWait,60.05);
});
test('a fox leaves safely if its target is removed before it arrives',()=>{
 const s=L.create(0);s.birds.push({...s.birds[0],id:'extra'});s.foxWait=L.FOX_WAIT;
 let {visitor}=L.foxStep(s,null,.05,()=>0);L.removeBird(s,visitor.target);
 for(let i=0;i<1000&&visitor;i++){const result=L.foxStep(s,visitor,.05);assert.equal(result.lost,undefined);visitor=result.visitor}
 assert.equal(visitor,null);assert.equal(s.birds.length,2);
});

test("fox interval is two minutes",()=>assert.equal(L.FOX_WAIT,120));
test('a carrying fox retraces its curved pursuit to the exact entrance from all four directions',()=>{
 for(const side of [.1,.35,.6,.9]){
  const s=L.create(0);s.birds.push({...s.birds[0],id:'extra'});s.foxWait=L.FOX_WAIT;
  let result=L.foxStep(s,null,.05,()=>side),v=result.visitor,entrance={...v.trail[0]};
  for(let i=0;i<600&&!v.carrying;i++){
   const b=s.birds.find(b=>b.id===v.target);b.y=.6+Math.sin(i*.05)*.08;
   result=L.foxStep(s,v,.05,()=>side);v=result.visitor;
  }
  assert(v.carrying);const fox=v;
  while(v){
   const goal=v.trail.at(-1),before={x:v.x,y:v.y};
   result=L.foxStep(s,v,.001,()=>side);v=result.visitor;
   if(v&&v.trail.at(-1)===goal){const cross=(v.x-before.x)*(goal.y-before.y)-(v.y-before.y)*(goal.x-before.x);assert(Math.abs(cross)<1e-10)}
  }
  assert.equal(fox.x,entrance.x);assert.equal(fox.y,entrance.y);assert.equal(s.birds.length,2);
 }
});

test('fox entry varies along every edge of the farm',()=>{
 for(let side=0;side<4;side++){
  const entries=[];
  for(const along of [.2,.8]){
   const s=L.create(0);s.birds.push({...s.birds[0],id:'extra'});s.foxWait=L.FOX_WAIT;
   const rolls=[0,(side+.5)/4,along];const {visitor}=L.foxStep(s,null,.05,()=>rolls.shift());const point=visitor.trail[0];entries.push(point);
   assert(side===0?point.x<0:side===1?point.x>1:side===2?point.y<0:point.y>1);
  }
  assert.notDeepEqual(entries[0],entries[1]);
 }
});
