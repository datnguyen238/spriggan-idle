const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {setupWorld}=require('./helpers/canvas-world.cjs');
const paintCount=s=>s.context.calls.filter(c=>['fill','stroke','fillRect','fillText','drawImage'].includes(c.op)).length;
const water=p=>p.op==='stroke'&&p.state.strokeStyle==='#d9f2df75';
function digest(paints){
 // Ignore state that cannot affect a paint (for example stroke color on fillRect).
 const normalized=paints.map(p=>{const s=p.state;return{...p,state:{transform:s.transform,globalAlpha:s.globalAlpha,filter:s.filter,...(p.op==='stroke'?{strokeStyle:s.strokeStyle,lineWidth:s.lineWidth,lineCap:s.lineCap,lineJoin:s.lineJoin}:{fillStyle:s.fillStyle}),...(p.op==='fillText'?{font:s.font,textAlign:s.textAlign}:{})}}});
 return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

// Recorded from the uncached renderers with the same real rules, seeded phases,
// and native 2D transforms. drawImage expands its retained layer's paint stream.
// River highlights are checked separately because they now follow the terrain.
const artFixtures=[
 ['hex','desktop','34a6158c2bb9b2aba91618e5c720171abfe34a8a88b680a944ad817726e1c48c','4ed6c00f06463923b538aacebd753dcb3a4b8f3580ae274710871782cde6dc62'],
 ['hex','mobile','86f983425d62947a63cdd5ee08e785f654a55ce5bd1f80822dd94519991d4760','fc727b1262bef78a4f573c437631acf8e83bb873d997ee93537c5d3a635869e7'],
 ['hex','view','836d4b0bd6878c12a6dfe59dbafc3e325175ad7db25a66f60fbb447be725291a','cf80b97ddb19d04eadaa579db4e8148532f41707df8d8708b696e4383b4c543c'],
 ['farm','desktop','fc2c7ebeb923b571f35166bf6f4c49a1a4e6123f20ae0f0c6bce10d8e5ae8870'],
 ['farm','mobile','eaaa796496a70d91192cc85c9be6aadfd1ced15c8390a8ec82871d9334a0d435'],
];
for(const [kind,variant,art,highlights]of artFixtures)test(`${kind} retains uncached ${variant} material, geometry, and object depth`,()=>{
 const s=setupWorld(kind,variant==='mobile'?{width:390,height:844,dpr:2}:{}),draw=kind==='hex'?'render':'draw';
 if(kind==='hex'){s.world.state.time=7.25;if(variant==='view'){s.world.view={zoom:1.8,pan:{x:79.5,y:-53.25}};s.world.night=true}}
 s.world[draw]();s.reset();s.world[draw]();
 assert.equal(digest(s.canvas.pixels.filter(p=>!water(p))),art);
 if(highlights)assert.equal(digest(s.canvas.pixels.filter(water)),highlights);
});

test('warm Hex frames replace all terrain paths and the blurred shadow with one backing-pixel copy',()=>{
 const s=setupWorld('hex');s.reset();s.frame();
 const cache=s.canvases[1],copies=s.context.calls.filter(c=>c.op==='drawImage');
 assert.equal(copies.length,1);assert.deepEqual(copies[0].transform,[1,0,0,1,0,0]);
 assert.equal(cache.getContext('2d').calls.length,0);
 assert.equal(s.canvas.pixels.filter(p=>p.state.filter==='blur(15px)').length,1,'retained shadow is still present');
 const primitives=s.context.calls.filter(c=>c.op==='fill'||c.op==='stroke').length;
 assert.equal(primitives,1349);assert(primitives<3175*.5,'uncached baseline was 3,175 fills/strokes');
 assert.equal(s.writes(),0,'unchanged counters and controls do not mutate the DOM');
 assert.equal(s.canvas.pixels.filter(water).length,96);
});

test('Hex invalidates terrain for camera, viewport, and DPR changes while preserving animated water',()=>{
 const s=setupWorld('hex'),cache=s.canvases[1],cacheContext=cache.getContext('2d');
 for(const view of [{zoom:1.4},{pan:{x:40,y:-20}}]){
  s.world.view=view;s.reset();s.world.render();assert(cacheContext.calls.length>2000);
  s.reset();s.world.render();assert.equal(cacheContext.calls.length,0);
 }
 const earlier=digest(s.canvas.pixels.filter(water));s.world.state.time+=1;s.reset();s.world.render();
 assert.notEqual(digest(s.canvas.pixels.filter(water)),earlier);assert.equal(cacheContext.calls.length,0);
 s.box.width=390;s.box.height=844;s.ctx.devicePixelRatio=2;s.reset();s.world.resize();
 assert.equal(cache.width,780);assert.equal(cache.height,1688);assert(cacheContext.calls.length>2000);
 assert.deepEqual(s.context.calls.find(c=>c.op==='drawImage').transform,[1,0,0,1,0,0]);
 s.reset();s.element('#light-mode').onclick();assert.equal(cacheContext.calls.length,0,'lighting overlays the retained terrain');
 assert(s.context.calls.some(c=>c.op==='fill'&&c.state.fillStyle==='#eeb565'),'night torches remain live');
});

test('moving river highlights remain inside the cached top faces and below bridges at every zoom',()=>{
 const s=setupWorld('hex');
 for(const zoom of [.85,1,2.3])for(const time of [0,1,7.25,100]){
  s.world.view={zoom};s.world.state.time=time;s.reset();s.world.render();
  const highlights=s.canvas.pixels.filter(water),rivers=s.world.tiles.filter(t=>s.ctx.HexLife.river(t.q,t.r)),{S}=s.world.size;
  for(let i=0;i<highlights.length;i++){
   const p=s.world.project(rivers[Math.floor(i/3)].q,rivers[Math.floor(i/3)].r);
   for(const endpoint of highlights[i].path){
    const x=Math.abs(endpoint.args[0]-p.x)/(S*zoom),y=Math.abs(endpoint.args[1]-p.y)/(S*.6*zoom);
    assert(y<.8660254*.984);assert(.8660254*x+.5*y<.8660254*.984);
   }
  }
  const lastWater=s.context.calls.findLastIndex(c=>c.op==='stroke'&&c.state.strokeStyle==='#d9f2df75');
  const firstBridge=s.context.calls.findIndex(c=>c.op==='fill'&&c.state.fillStyle==='#c8b590');
  assert(firstBridge>lastWater);
 }
});

test('paused Hex skips paint and repeated UI work but responds to rain, input, notes, and resume',()=>{
 const s=setupWorld('hex');s.element('#pause').onclick();const time=s.world.state.time;
 s.reset();s.frame(500);s.frame(500);assert.equal(paintCount(s),0);assert.equal(s.writes(),0);assert.equal(s.world.state.time,time);
 s.world.rain.enabled=true;s.frame();assert(paintCount(s)>0);assert(s.canvas.pixels.some(p=>p.state.fillStyle===`rain:${time}`));
 s.reset();s.frame();assert.equal(paintCount(s),0);
 s.world.invite(3,0);assert(paintCount(s)>0,'user invitations still render immediately while paused');
 s.reset();s.frame(5000);assert.equal(paintCount(s),0);assert.equal(s.element('#map-note').textContent,'The meadow is resting. Resume whenever you like.');
 s.reset();s.frame();assert.equal(s.writes(),0);
 s.element('#pause').onclick();s.reset();s.frame();assert(s.world.state.time>time);assert(paintCount(s)>0);
});

test('Farm copies the exact pixel scenery once per active frame and rebuilds on responsive resize',()=>{
 const s=setupWorld('farm');s.reset();s.frame();
 const cache=s.canvases[1],cacheContext=cache.getContext('2d');
 assert.equal(cacheContext.calls.length,0);assert.equal(s.context.calls.filter(c=>c.op==='fillRect').length,76,'uncached baseline was 877 rectangles');
 assert.equal(s.context.calls.filter(c=>c.op==='drawImage').length,1);
 s.box.width=390;s.box.height=844;s.ctx.devicePixelRatio=2;s.reset();s.world.resize();
 assert.equal(cache.width,780);assert.equal(cache.height,1688);assert(cacheContext.calls.length>700);
 const copy=s.context.calls.find(c=>c.op==='drawImage');assert.deepEqual(copy.transform,[1,0,0,1,0,0]);assert.deepEqual(copy.args,[0,0]);
 s.reset();s.frame();assert.equal(cacheContext.calls.length,0);
});

test('paused Farm skips painting, preserves wall-clock egg hatching, and redraws visual rule changes',()=>{
 const s=setupWorld('farm',{reduced:true}),time=s.world.clock;
 s.world.state.eggs.push({id:'ready-egg',x:.5,y:.6,laid:1800000000000-178900,hatchesAt:1800000001100});
 s.world.draw();s.reset();s.frame(600);assert.equal(paintCount(s),0);
 s.frame(600);assert.equal(s.world.state.eggs.length,0);assert.equal(s.world.state.birds.length,3);assert(paintCount(s)>0);assert.equal(s.world.clock,time);
 s.reset();s.frame(600);s.frame(600);assert.equal(paintCount(s),0);assert.equal(s.writes(),0);
 s.world.rain.enabled=true;s.frame();assert(paintCount(s)>0);s.reset();s.frame();assert.equal(paintCount(s),0);
 s.world.scatter();assert(paintCount(s)>0,'feeding renders while paused');
 s.element('#motion').onclick();s.reset();s.frame();assert(s.world.clock>time);assert(paintCount(s)>0);
});

test('paused Farm keeps selected egg countdown text current without repainting unchanged scenery',()=>{
 const s=setupWorld('farm',{reduced:true});s.world.state.eggs.push({id:'future-egg',x:.5,y:.6,laid:1800000000000,hatchesAt:1800000180000});
 s.world.selected='future-egg';s.world.inspect();const detail=s.element('#bird-detail').textContent;
 s.world.draw();s.reset();s.frame(1100);
 assert.notEqual(s.element('#bird-detail').textContent,detail);assert.equal(paintCount(s),0);
 s.reset();s.world.ui();s.world.ui();assert.equal(s.writes(),0);
});

test('Farm still accepts a cow through a storage event while paused',()=>{
 const s=setupWorld('farm',{reduced:true}),incoming=JSON.parse(JSON.stringify(s.world.state));
 incoming.cows.push(s.ctx.FarmLife.makeCow());s.storage.set(s.ctx.FarmLife.KEY,JSON.stringify(incoming));s.reset();
 s.dispatch('window:storage',{key:s.ctx.FarmLife.KEY});assert.equal(s.world.state.cows.length,1);assert(paintCount(s)>0);
});
