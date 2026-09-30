const test=require('node:test'),assert=require('node:assert/strict');
const Events=require('../dist/pond/pond-surprises.js');
const pads=Array.from({length:10},(_,i)=>({x:.15+i%5*.17,y:.3+Math.floor(i/5)*.4}));
function seeded(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
test('groups have requested counts, staggered arrivals, finite poses, and longer bounded lifetimes',()=>{
 for(const [kind,count] of Object.entries({frog:4,dragonfly:6,leaf:12,petals:32})){
  const e=Events.create(kind,pads,seeded(123));assert.equal(e.actors.length,count);assert(e.duration>=60&&e.duration<=80);
  assert(new Set(e.actors.map(a=>a.delay)).size>1);
  for(const a of e.actors){
   e.age=-1;assert.equal(Events.pose(e,a,pads,390,844),null);
   for(let t=0;t<=e.duration;t+=.1){e.age=t;const p=Events.pose(e,a,pads.map(p=>({x:p.x*390,y:p.y*844})),390,844);if(p)for(const v of Object.values(p))if(typeof v==='number')assert(Number.isFinite(v))}
   e.age=e.duration+1;assert.equal(Events.pose(e,a,pads,390,844),null);
  }
 }
});
test('frog and dragonfly routes visit multiple pads and follow their current positions while resting',()=>{
 for(const kind of ['frog','dragonfly'])for(let seed=0;seed<100;seed++){
  const e=Events.create(kind,pads,seeded(seed));
  for(const a of e.actors){
   assert(new Set(a.route.map(s=>s.point.pad).filter(p=>p!==undefined)).size>=2);
   for(let i=1;i<a.route.length;i++)assert(a.route[i].at>a.route[i-1].at);
   assert.equal(a.route.at(-1).at,a.life);
   const resting=a.route[1];e.age=a.delay+(resting.at+a.route[2].at)/2;
   const positions=pads.map(p=>({x:p.x*1200,y:p.y*800}));const before=Events.pose(e,a,positions,1200,800);
   positions[resting.point.pad].x+=40;const after=Events.pose(e,a,positions,1200,800);
   assert(Math.abs(after.x-before.x-40)<1e-9);assert.equal(after.flying,false);
  }
 }
});
test('routes vary between events and rendering does not advance time while paused',()=>{
 for(const kind of Object.keys(Events.counts)){
  const a=Events.create(kind,pads,seeded(1)),b=Events.create(kind,pads,seeded(2));assert.notDeepEqual(a.actors,b.actors);
  a.age=20;const first=Events.pose(a,a.actors[0],pads,1440,900);assert.deepEqual(Events.pose(a,a.actors[0],pads,1440,900),first);assert.equal(a.age,20);
 }
});
