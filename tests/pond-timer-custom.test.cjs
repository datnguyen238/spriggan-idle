const {test}=require('node:test');
const assert=require('node:assert/strict');
const t=require('../dist/pond/pond-timer.js');
const minute=60000;
const custom={focus:25*minute,short:7*minute,long:20*minute};

test('custom durations apply when a session is selected or reset',()=>{
  const s=t.create();
  assert.equal(t.setDurations(s,custom),true);
  assert.equal(s.duration,50*minute);
  t.select(s,'focus');
  assert.equal(s.duration,25*minute);
  assert.equal(s.remaining,25*minute);
  assert.equal(s.endsAt,null);
  t.select(s,'short');
  assert.equal(s.remaining,7*minute);
});

test('editing preferences preserves a running deadline and progress basis',()=>{
  const s=t.create();
  t.toggle(s,1000);
  const before={endsAt:s.endsAt,remaining:s.remaining,duration:s.duration};
  t.setDurations(s,custom);
  assert.equal(s.endsAt,before.endsAt);
  assert.equal(s.remaining,before.remaining);
  assert.equal(s.duration,before.duration);
  assert.equal(t.remaining(s,61000),49*minute);
});

test('editing preferences preserves a paused session and survives reload',()=>{
  const s=t.create();
  t.toggle(s,0);
  t.toggle(s,10*minute);
  t.setDurations(s,custom);
  const restored=t.decode(JSON.stringify(s));
  assert.deepEqual(restored,s);
  assert.equal(restored.remaining,40*minute);
  assert.equal(restored.duration,50*minute);
  t.toggle(restored,100*minute);
  assert.equal(restored.endsAt,140*minute);
});

test('custom durations drive short and fourth-session long breaks',()=>{
  const s=t.create();
  t.setDurations(s,custom);
  t.select(s,'focus');
  for(let i=1;i<=4;i++){
    t.toggle(s,0);
    assert.equal(t.advance(s,custom.focus),'focus');
    assert.equal(s.mode,i===4?'long':'short');
    assert.equal(s.duration,custom[s.mode]);
    assert.equal(s.remaining,custom[s.mode]);
    assert.equal(s.endsAt,null);
    t.toggle(s,0);
    assert.notEqual(t.advance(s,s.duration),null);
    assert.equal(s.mode,'focus');
    assert.equal(s.duration,custom.focus);
    assert.equal(s.completed,i);
  }
});

test('invalid duration preferences are rejected without mutation',()=>{
  const s=t.create(),before=JSON.stringify(s);
  for(const value of [
    null,{},[],
    {...custom,focus:0},
    {...custom,focus:181*minute},
    {...custom,focus:1.5*minute},
    {...custom,short:NaN},
    {...custom,long:'120000'}
  ]){
    assert.equal(t.setDurations(s,value),false);
    assert.equal(JSON.stringify(s),before);
  }
});

test('duration bounds are inclusive and input objects are copied',()=>{
  const s=t.create();
  const input={focus:minute,short:180*minute,long:15*minute};
  assert.equal(t.setDurations(s,input),true);
  input.focus=99*minute;
  assert.equal(s.durations.focus,minute);
});

test('version two saves migrate without changing active countdowns',()=>{
  const old={version:2,mode:'focus',remaining:40*minute,
    endsAt:9999999,completed:3,collapsed:true,chime:false};
  const s=t.decode(JSON.stringify(old));
  assert.equal(s.version,3);
  assert.deepEqual(s.durations,t.DURATIONS);
  assert.equal(s.duration,50*minute);
  assert.equal(s.remaining,old.remaining);
  assert.equal(s.endsAt,old.endsAt);
  assert.equal(s.completed,3);
  assert.equal(s.collapsed,true);
  assert.equal(s.chime,false);
});

test('invalid custom saves fall back safely',()=>{
  const s=t.create();
  for(const value of [
    {...s,duration:0},
    {...s,durations:{...custom,focus:181*minute}},
    {...s,remaining:s.duration+1}
  ])assert.deepEqual(t.decode(JSON.stringify(value)),t.create());
});

test('restoring defaults preserves the current custom session until reset',()=>{
  const s=t.create();
  t.setDurations(s,custom);
  t.select(s,'focus');
  t.toggle(s,0);
  t.setDurations(s,t.DURATIONS);
  assert.equal(s.duration,25*minute);
  assert.equal(s.endsAt,25*minute);
  t.select(s,'focus');
  assert.equal(s.duration,50*minute);
  assert.equal(s.remaining,50*minute);
  assert.equal(s.endsAt,null);
});