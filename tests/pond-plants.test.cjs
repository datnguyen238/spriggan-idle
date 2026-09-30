const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.env.POND_PROJECT||path.join(__dirname,'..');
const Plants=require(path.join(root,'dist/pond/pond-plants.js'));
const app=fs.readFileSync(path.join(root,'dist/pond/app.js'),'utf8');
const definitions=Function('return '+app.match(/const LILY_PADS=(\[[\s\S]*?\n  \]);/)[1])();
function check(bodies,w,h){
 for(const b of bodies){assert(b.x>=b.radius+2.99&&b.x<=w-b.radius-2.99);assert(b.y>=b.radius+2.99&&b.y<=h-b.radius-2.99)}
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
  const a=bodies[i],b=bodies[j];assert(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+Plants.GAP-.02,`overlap between ${i} and ${j}`);
 }
}
for(const flowers of [[false,false],[false,'ivory'],['rose','ivory']])test(`contact reverses approaching plants: ${flowers}`,()=>{
 const defs=flowers.map((flower,i)=>({x:.45+i*.1,y:.5,r:.04,phase:i,flower}));
 const bodies=Plants.resize([],defs,800,600);const [a,b]=bodies;
 a.x=350;b.x=a.x+a.radius+b.radius+Plants.GAP+.1;a.y=b.y=300;a.vx=5;b.vx=-5;a.vy=b.vy=0;
 Plants.update(bodies,.05,.05,800,600);check(bodies,800,600);assert(a.vx<0&&b.vx>0);
});
test('ten minutes of drift stay separated on desktop and narrow mobile at different frame rates',()=>{
 for(const [w,h,dt] of [[1440,1000,1/60],[390,844,1/30],[320,600,.05]]){
  const bodies=Plants.resize([],definitions,w,h);check(bodies,w,h);
  for(let tick=0;tick<600/dt;tick++){Plants.update(bodies,dt,tick*dt,w,h);check(bodies,w,h)}
 }
});
test('resizing resolves clusters and the lotus footprint includes protruding petals',()=>{
 let bodies=Plants.resize([],definitions,1440,1000);
 for(let i=0;i<300;i++)Plants.update(bodies,1/30,i/30,1440,1000);
 bodies=Plants.resize(bodies,definitions,320,600,1440,1000);check(bodies,320,600);
 for(let i=0;i<bodies.length;i++)if(definitions[i].flower)assert(bodies[i].radius>=21+320*definitions[i].r*.19);
 const before=bodies.map(b=>({...b}));bodies=Plants.resize(bodies,definitions,320,600,320,600);for(let i=0;i<bodies.length;i++){assert(Math.abs(bodies[i].x-before[i].x)<1e-9);assert(Math.abs(bodies[i].y-before[i].y)<1e-9);assert.equal(bodies[i].vx,before[i].vx);assert.equal(bodies[i].vy,before[i].vy)}
});
test('exactly coincident plants separate without invalid coordinates',()=>{
 const defs=definitions.map(p=>({...p,x:.5,y:.5}));const bodies=Plants.resize([],defs,390,844);check(bodies,390,844);
});
