const test = require('node:test');
const assert = require('node:assert/strict');
const Life = require('../dist/fishing/fishing-life.js');
const {harness} = require('./helpers/fishing-ui.cjs');

test('the controller launcher exposes one accessible, initially closed controls panel',()=>{
  const h=harness(),launcher=h.$('#toggle-controls'),panel=h.$('#fishing-panel');
  assert.equal(h.$('#river-settings').open,false);assert.equal(panel.inert,true);
  assert.equal(launcher.getAttribute('aria-expanded'),'false');
  assert.equal(launcher.getAttribute('aria-label'),'Open fishing controls');
  assert.equal(h.$('#field-guide').tagName,'SECTION');assert.equal(h.$('#field-guide').hidden,true);
  assert.equal(h.$('#fishing-controls-view').hidden,false);assert.equal(h.$('#close-guide').hidden,true);
  h.openControls();assert.equal(panel.inert,false);assert.equal(panel.getAttribute('aria-hidden'),'false');
  assert.equal(launcher.getAttribute('aria-expanded'),'true');assert.equal(launcher.getAttribute('aria-label'),'Close fishing controls');
  h.closeControls();assert.equal(panel.inert,true);assert.equal(h.document.activeElement,launcher);
});

test('the guide is a controller view and both back buttons return to the controls without closing the panel',()=>{
  const h=harness();h.openControls();
  for(const back of ['#close-guide','#return-river']){
    h.click('#open-guide');
    assert.equal(h.$('#field-guide').hidden,false);assert.equal(h.$('#fishing-controls-view').hidden,true);
    assert.equal(h.$('#close-guide').hidden,false);assert.equal(h.$('#controller-title').textContent,'Field guide');
    assert.equal(h.document.activeElement,h.$('#close-guide'));
    assert.equal(h.$('#river-settings').contains(h.$('#field-guide')),true);
    assert.equal(h.$('#river-settings').contains(h.$('#river-pause')),true);
    h.click(back);assert.equal(h.$('#river-settings').open,true);assert.equal(h.$('#field-guide').hidden,true);
    assert.equal(h.$('#fishing-controls-view').hidden,false);assert.equal(h.$('#controller-title').textContent,'By the river');
    assert.equal(h.document.activeElement,h.$('#open-guide'));
  }
});

test('header close, summary, Escape, and outside input all reset the guide before the next opening',()=>{
  for(const close of ['header','summary','escape','outside']){
    const h=harness();h.openControls();h.click('#open-guide');
    if(close==='header')h.click('#close-fishing-controls');
    else if(close==='summary')h.click('#toggle-controls');
    else if(close==='escape')h.key('keydown',{key:'Escape',code:'Escape',target:h.$('#close-guide')});
    else h.document.fire('pointerdown',{target:h.$('#river-scene')});
    h.drainToggles();assert.equal(h.$('#river-settings').open,false,close);
    assert.equal(h.$('#field-guide').hidden,true,close);assert.equal(h.$('#fishing-panel').inert,true,close);
    assert.equal(h.document.activeElement,h.$('#toggle-controls'),close);
    h.openControls();assert.equal(h.$('#fishing-controls-view').hidden,false);assert.equal(h.$('#close-guide').hidden,true);
  }
});

test('a queued native toggle after catch-guide opens keeps the selected inline specimen intact',()=>{
  const h=harness();h.reel();h.value('session.progress=.999;session.tension=.2;holding=true');h.tick();
  const oldPortrait=h.$('#catch-portrait').children[0];
  h.click('#catch-guide');
  assert.equal(h.$('#river-settings').open,true);assert.equal(h.value('guideOpen'),true);
  assert.equal(h.$('#field-guide').hidden,false);assert.equal(h.value('guideSelection'),h.value('session.catch.species'));
  assert.equal(h.$('#specimen-name').textContent,h.value('session.fish.name'));
  h.$('#river-settings').fire('toggle');assert.equal(h.value('guideOpen'),true);
  h.closeControls();assert.notEqual(h.$('#catch-portrait').children[0],oldPortrait,'closing the guide restores the catch portrait');
  assert.equal(h.value('session.phase'),'caught');assert.equal(h.value('guide.total'),1);
});

test('casting spots stay visible in the controller and lock only while a line is out',()=>{
  const h=harness();h.openControls();h.click('[data-spot=deep]');
  assert.equal(h.value('spot'),'deep');assert.equal(h.value('session.phase'),'idle');
  h.click('#fishing-action');assert.equal(h.value('session.spot'),'deep');h.openControls();
  assert.equal(h.$('#cast-spots').hidden,false);
  assert(h.document.querySelectorAll('[data-spot]').every(button=>button.disabled));
  h.click('[data-spot=reeds]');assert.equal(h.value('spot'),'deep');
  h.closeControls();h.advance(12);assert.equal(h.value('session.phase'),'escaped');h.openControls();
  assert(h.document.querySelectorAll('[data-spot]').every(button=>!button.disabled));
  h.click('[data-spot=reeds]');assert.equal(h.value('spot'),'reeds');
});

test('actual cast and hook controls need a fresh action after the bite, then hold and release reel',()=>{
  const h=harness();h.click('#fishing-action');
  assert.equal(h.value('session.phase'),'casting');assert.equal(h.$('#fishing-action').disabled,true);
  h.advance(3);assert.equal(h.value('session.phase'),'waiting');
  h.click('#fishing-action');assert.equal(h.value('session.phase'),'waiting');
  h.advance(3);assert.equal(h.value('session.phase'),'bite');h.click('#fishing-action');
  assert.equal(h.value('session.phase'),'reeling');assert.equal(h.value('holding'),false);
  h.pointerDown();assert.equal(h.value('holding'),true);h.advance(.5);
  const progress=h.value('session.progress');assert(progress>0);
  h.pointerUp();assert.equal(h.value('holding'),false);h.advance(.5);
  assert(h.value('session.progress')<progress);
});

test('the click ending a pointer hold cannot dismiss a landing or automatically recast an escape',()=>{
  for(const phase of ['caught','escaped']){
    const h=harness();h.reel();h.pointerDown();
    h.value(`session.phase='${phase}'`);h.pointerUp();
    assert.equal(h.value('session.phase'),phase,'a held gesture must not activate the next phase');
    h.click('#fishing-action');assert.equal(h.value('session.phase'),phase==='caught'?'idle':'casting');
  }
});

test('Space hold and toggle handle repeats and do not hijack native buttons or summaries',()=>{
  const h=harness();h.reel();
  assert.equal(h.key('keydown').defaultPrevented,true);assert.equal(h.value('holding'),true);
  h.key('keyup');assert.equal(h.value('holding'),false);
  const summary=h.$('#river-settings').querySelector('summary');
  assert.equal(h.key('keydown',{target:summary}).defaultPrevented,false);
  assert.equal(h.value('holding'),false);
  h.openControls();h.openSectionFor('[data-method=toggle]');h.click('[data-method=toggle]');h.closeControls();
  const button=h.$('#fishing-action');
  assert.equal(h.key('keydown',{target:button}).defaultPrevented,true);assert.equal(h.value('holding'),true);
  h.key('keydown',{target:button,repeat:true});assert.equal(h.value('holding'),true);
  h.key('keyup',{target:button});assert.equal(h.value('holding'),true);
  h.key('keydown',{target:button});assert.equal(h.value('holding'),false);
  h.click('#fishing-action');assert.equal(h.value('holding'),true);
  h.click('#fishing-action');assert.equal(h.value('holding'),false);
});

test('the controller and its inline guide pause the line and always release a held input',()=>{
  const h=harness();h.reel();h.pointerDown();h.openControls();h.click('#open-guide');
  assert.equal(h.value('holding'),false);assert.equal(h.$('#field-guide').hidden,false);
  const progress=h.value('session.progress');h.advance(10);assert.equal(h.value('session.progress'),progress);
  h.click('#close-guide');assert.equal(h.$('#field-guide').hidden,true);assert.equal(h.$('#river-settings').open,true);
  assert.equal(h.value('holding'),false);const time=h.value('session.reelTime');h.advance(2);assert.equal(h.value('session.reelTime'),time);
  h.closeControls();h.advance(.1);assert(h.value('session.reelTime')>time);
});

test('a bite window lasts through a long visit to the guide and expires only after returning',()=>{
  const h=harness();h.click('#fishing-action');h.advance(6);
  assert.equal(h.value('session.phase'),'bite');const time=h.value('session.phaseTime');
  h.openControls();h.click('#open-guide');h.advance(30);assert.equal(h.value('session.phase'),'bite');
  assert.equal(h.value('session.phaseTime'),time);
  h.key('keydown',{key:'Escape',code:'Escape',target:h.$('#close-guide')});assert.equal(h.$('#field-guide').hidden,true);
  h.advance(2.7);assert.equal(h.value('session.phase'),'escaped');
});

test('a pointer cancellation clears hold without triggering a catch action',()=>{
  const h=harness();h.reel();h.pointerDown();h.$('#fishing-action').fire('pointercancel');
  assert.equal(h.value('holding'),false);assert.equal(h.value('session.phase'),'reeling');
  assert.equal(h.$('#fishing-action').getAttribute('aria-pressed'),'false');
});

test('manual pause, hidden tabs, and reopening the guide never spend absent time reeling',()=>{
  const h=harness();h.reel();h.pointerDown();h.openControls();h.click('#river-pause');
  const before=h.value('session.reelTime');h.advance(5);assert.equal(h.value('session.reelTime'),before);
  h.click('#fishing-action');assert.equal(h.value('paused'),false);assert.equal(h.value('holding'),false);
  h.pointerDown();h.document.hidden=true;h.document.fire('visibilitychange');h.advance(100);
  assert.equal(h.value('holding'),false);assert.equal(h.value('session.reelTime'),before);
  h.document.hidden=false;h.document.fire('visibilitychange');h.tick(60);
  assert(h.value('session.reelTime')-before<=.061);
});

test('losing focus or hiding the page clears both the held state and its accessible button state',()=>{
  for(const kind of ['blur','visibilitychange']){
    const h=harness();h.reel();h.pointerDown();
    assert.equal(h.$('#fishing-action').getAttribute('aria-pressed'),'true');
    if(kind==='blur')h.window.fire(kind);else{h.document.hidden=true;h.document.fire(kind);}
    assert.equal(h.value('holding'),false);
    assert.equal(h.$('#fishing-action').getAttribute('aria-pressed'),'false');
    assert.equal(h.document.body.dataset.holding,'false');
  }
});

test('the real landing handler records exactly once before release and survives a reload',()=>{
  const h=harness();h.reel();let holding=false;
  for(let n=0;n<1000&&h.value('session.phase')==='reeling';n++){
    const want=h.value('session.tension<.32&&!session.struggling')?true:h.value('session.tension>.7||session.struggling')?false:holding;
    if(want!==holding){holding=want;if(holding)h.pointerDown();else h.pointerUp();}h.tick(.025);
  }
  assert.equal(h.value('session.phase'),'caught');assert.equal(h.value('guide.total'),1);
  assert.equal(h.$('#catch-note').hidden,false);
  const saved=h.storage.get(Life.KEY);assert.equal(Life.decodeProgress(saved).total,1);
  h.advance(5);assert.equal(h.value('guide.total'),1);
  assert.equal(h.writes.filter(w=>w.key===Life.KEY).length,1);
  const restored=harness({saved});assert.equal(restored.value('guide.total'),1);assert.equal(restored.value('session.phase'),'idle');
  h.click('#catch-guide');assert.equal(h.$('#field-guide').hidden,false);assert.equal(h.$('#river-settings').open,true);assert.equal(h.value('guide.total'),1);
  h.click('#return-river');assert.equal(h.$('#river-settings').open,true);h.closeControls();h.click('#fishing-action');assert.equal(h.value('session.phase'),'idle');assert.equal(h.$('#catch-note').hidden,true);
});

test('unavailable storage keeps the playable guide in memory and reports the save failure',()=>{
  const h=harness({noStorage:true});h.reel();
  h.value("session.progress=.999;session.tension=.2;holding=true");h.tick();
  assert.equal(h.value('guide.total'),1);assert.equal(h.$('#catch-note').hidden,false);
  assert.match(h.$('#save-status').textContent,/in memory/);
  h.click('#fishing-action');assert.equal(h.value('session.phase'),'idle');assert.equal(h.value('guide.total'),1);
});

test('a failed 3D scene retains cast controls and a useful retry action',()=>{
  const h=harness({sceneFails:true});assert.equal(h.$('#scene-error').hidden,false);
  h.click('#fishing-action');assert.equal(h.value('session.phase'),'casting');
  h.click('#retry-scene');assert.equal(h.$('#scene-error').hidden,false);
});

test('scene context loss pauses the line and restoration safely resumes without holding',()=>{
  const h=harness();h.reel();h.pointerDown();h.$('#river-scene').fire('fishing-scene-lost');
  const time=h.value('session.reelTime');h.advance(2);assert.equal(h.value('session.reelTime'),time);
  assert.equal(h.value('holding'),false);assert.equal(h.$('#scene-error').hidden,false);
  h.$('#river-scene').fire('fishing-scene-restored');assert.equal(h.value('paused'),false);
  assert.equal(h.$('#scene-error').hidden,true);h.tick();assert(h.value('session.reelTime')>time);
});

test('an interrupted renderer enters the control fallback without breaking the animation loop',()=>{
  const h=harness({sceneUpdateFails:true});assert.doesNotThrow(()=>h.tick());
  assert.equal(h.$('#scene-error').hidden,false);assert.doesNotThrow(()=>h.tick());
  h.click('#fishing-action');assert.equal(h.value('session.phase'),'casting');h.advance(1);
  assert.equal(h.value('session.phase'),'waiting');
});
