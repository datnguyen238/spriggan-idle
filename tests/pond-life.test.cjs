const test=require('node:test');
const assert=require('node:assert/strict');
const Life=require(process.env.POND_LIFE_PATH||'../dist/pond/pond-life.js');
const now=1800000000000;
test('roundtrip preserves names, IDs, empty ponds, and settings',()=>{
 const p=Life.create(now);p.fish[0].name='Mochi the brave';p.settings.night=true;p.settings.raining=true;p.settings.pace=1.6;p.settings.audio.music=true;
 const saved=Life.decode(JSON.stringify(p),now);
 assert.equal(saved.fish[0].name,'Mochi the brave');assert.equal(saved.fish[0].id,p.fish[0].id);assert.deepEqual(saved.settings,p.settings);
 p.fish=[];assert.equal(Life.decode(JSON.stringify(p),now).fish.length,0);
});
test('feeding does not cause immediate growth, then supports growth over elapsed days',()=>{
 const f=Life.makeFish(0,now);for(let i=0;i<10;i++)Life.feed(f,now);
 assert.equal(f.growth,0);Life.settleGrowth(f,now+Life.DAY);assert(Math.abs(f.growth-.12)<1e-8);
 Life.settleGrowth(f,now+Life.DAY*10);assert(Math.abs(f.growth-.12)<1e-8);
});
test('new food cannot retroactively fund time spent unfed',()=>{
 const f=Life.makeFish(0,now);Life.feed(f,now+Life.DAY*10);assert.equal(f.growth,0);
 Life.settleGrowth(f,now+Life.DAY*11);assert(Math.abs(f.growth-.012)<1e-8);
});
test('growth and stored nutrition are bounded, including long absences',()=>{
 const f=Life.makeFish(0,now);for(let i=0;i<200;i++)Life.feed(f,now);assert.equal(f.nutrition,3);
 Life.settleGrowth(f,now+Life.DAY*90);assert.equal(f.nutrition,0);assert(Math.abs(f.growth-.36)<1e-8);
 for(let day=91;day<120;day++){for(let i=0;i<15;i++)Life.feed(f,now+Life.DAY*day);Life.settleGrowth(f,now+Life.DAY*(day+1))}
 assert.equal(f.growth,.75);
});
test('clock rollback does not create growth or double count elapsed time',()=>{
 const f=Life.makeFish(0,now);Life.feed(f,now);Life.settleGrowth(f,now-Life.DAY);assert.equal(f.growth,0);assert.equal(f.lastGrowthAt,now);
 Life.settleGrowth(f,now);assert.equal(f.growth,0);
});
test('golden check cannot be rerolled on reload and never exceeds twelve koi',()=>{
 const p=Life.create(now);assert.equal(Life.maybeGolden(p,now,()=>0),null);
 assert.equal(Life.maybeGolden(p,now+Life.DAY,()=>.9),null);
 const restored=Life.decode(JSON.stringify(p),now+Life.DAY);
 assert.equal(Life.maybeGolden(restored,now+Life.DAY,()=>0),null);
 const golden=Life.maybeGolden(restored,now+Life.DAY*2,()=>0);assert(golden.golden);assert.equal(restored.fish.length,6);
 assert.equal(Life.maybeGolden(restored,now+Life.DAY*3,()=>0),null);
 const full=Life.create(now);while(full.fish.length<12)full.fish.push(Life.makeFish(full.fish.length,now));assert.equal(Life.maybeGolden(full,now+Life.DAY,()=>0),null);assert.equal(full.fish.length,12);
});
test('invalid saves are rejected and malformed fields normalized',()=>{
 for(const raw of ['not json','null','{}','{"version":1,"fish":[null]}'])assert.equal(Life.decode(raw,now),null);
 const p=Life.create(now);p.fish[0].name='x'.repeat(200);p.fish[0].growth=999;p.fish[0].nutrition=-8;p.fish[1].id=p.fish[0].id;p.settings.pace=900;
 const decoded=Life.decode(JSON.stringify(p),now);assert.equal(decoded.fish[0].name.length,24);assert.equal(decoded.fish[0].growth,.75);assert.equal(decoded.fish[0].nutrition,0);assert.notEqual(decoded.fish[0].id,decoded.fish[1].id);assert.equal(decoded.settings.pace,2);
});

test('existing growth survives reload and formerly mature koi can keep growing',()=>{
 const p=Life.create(now);p.fish[0].growth=.35;p.fish[0].nutrition=1;
 const restored=Life.decode(JSON.stringify(p),now);assert.equal(restored.fish[0].growth,.35);
 Life.settleGrowth(restored.fish[0],now+Life.DAY);assert(Math.abs(restored.fish[0].growth-.47)<1e-8);
 const reloaded=Life.decode(JSON.stringify(restored),now+Life.DAY);assert.equal(reloaded.fish[0].growth,restored.fish[0].growth);
});
