const {test}=require('node:test');
const assert=require('node:assert/strict');
const t=require('../dist/pond/pond-timer.js');
test('pause and resume preserve time against an absolute deadline',()=>{
 const s=t.create();t.toggle(s,1000);assert.equal(s.endsAt,1501000);
 t.toggle(s,61000);assert.equal(s.remaining,1440000);assert.equal(t.remaining(s,999999),1440000);
 t.toggle(s,1000000);assert.equal(s.endsAt,2440000);assert.equal(t.remaining(s,1060000),1380000);
});
test('returning after a long absence completes once and waits for the break to start',()=>{
 const s=t.create();t.toggle(s,0);assert.equal(t.advance(s,99999999),'focus');
 assert.equal(s.completed,1);assert.equal(s.mode,'short');assert.equal(s.endsAt,null);
 assert.equal(t.advance(s,199999999),null);assert.equal(s.completed,1);
});
test('every fourth focus earns a long break; breaks do not count as focus',()=>{
 const s=t.create();for(let i=1;i<=4;i++){
 t.toggle(s,0);t.advance(s,t.DURATIONS.focus);assert.equal(s.mode,i===4?'long':'short');
 t.toggle(s,0);t.advance(s,t.DURATIONS[s.mode]);assert.equal(s.mode,'focus');assert.equal(s.completed,i);
 }
});
test('changing session resets countdown without adding a completed session',()=>{
 const s=t.create();t.toggle(s,0);t.select(s,'long');assert.equal(s.endsAt,null);
 assert.equal(s.remaining,900000);assert.equal(s.completed,0);t.select(s,'toString');assert.equal(s.mode,'long');
});
test('saved running and paused timers restore, including minimized preference',()=>{
 const s=t.create();s.collapsed=true;t.toggle(s,1000);
 assert.deepEqual(t.decode(JSON.stringify(s)),s);t.toggle(s,2000);assert.deepEqual(t.decode(JSON.stringify(s)),s);
});
test('invalid storage safely falls back to a fresh timer',()=>{
 for(const raw of ['bad','null','{}',JSON.stringify({...t.create(),mode:'toString'}),JSON.stringify({...t.create(),remaining:-1}),JSON.stringify({...t.create(),completed:1.5})])assert.deepEqual(t.decode(raw),t.create());
});
test('pressing pause at the deadline completes rather than starting another session',()=>{
 const s=t.create();t.toggle(s,0);assert.equal(t.toggle(s,1500000),'focus');assert.equal(s.endsAt,null);assert.equal(s.mode,'short');
});

test('chime preference persists while older saves enable it by default',()=>{
 const s=t.create();assert.equal(s.chime,true);s.chime=false;
 assert.equal(t.decode(JSON.stringify(s)).chime,false);
 delete s.chime;assert.equal(t.decode(JSON.stringify(s)).chime,true);
});
