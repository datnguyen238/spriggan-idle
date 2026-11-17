/* Run the real UI handlers with a small DOM/renderer adapter; no browser or WebGL needed. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Life = require('../dist/fishing/fishing-life.js');
const html = fs.readFileSync(require.resolve('../dist/fishing/index.html'), 'utf8');
const source = fs.readFileSync(require.resolve('../dist/fishing/fishing.js'), 'utf8').replace(/^import[^\n]*\n/gm, '');

function harness({saved, settings, noStorage=false, sceneFails=false, sceneUpdateFails=false, AudioContext}={}) {
  const nodes = [], ids = new Map(), listeners = new Map(), storage = new Map(), writes = [];
  let now = 0, nextFrame, document;
  function event(type, target, extra={}) {
    return {type,target,button:0,pointerId:1,code:'',key:'',repeat:false,defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;},...extra};
  }
  function dispatch(target, type, extra={}) {
    const e = event(type,target,extra);
    for(const fn of (target===document?listeners:target.listeners)?.get(type)||[])fn(e);
    target['on'+type]?.(e);
    if(target!==document && target!==window)for(const fn of listeners.get(type)||[])fn(e);
    return e;
  }
  function node(tag='div', attrs={}) {
    const n = {tagName:tag.toUpperCase(),dataset:{},attributes:{},listeners:new Map(),children:[],
      parentElement:null,isConnected:true,hidden:false,open:false,textContent:'',style:{setProperty(){}},
      clientWidth:240,clientHeight:140,offsetHeight:180,value:0,
      setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k]??null;},
      removeAttribute(k){delete this.attributes[k];},
      addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);},
      append(...children){for(const child of children){child.parentElement=this;child.isConnected=true;this.children.push(child);}},
      replaceChildren(...children){for(const child of this.children)child.isConnected=false;this.children=[];this.append(...children);},
      contains(other){for(let at=other;at;at=at.parentElement)if(at===this)return true;return false;},
      closest(selectors){return selectors.split(',').some(s=>s.trim()===tag||s.trim()==='[contenteditable=true]'&&this.attributes.contenteditable==='true')?this:this.parentElement?.closest(selectors)||null;},
      querySelector(selector){return nodes.find(candidate=>candidate!==this&&this.contains(candidate)&&matches(candidate,selector))||null;},
      focus(){document.activeElement=this;},setPointerCapture(){},
      showModal(){this.open=true;},close(){this.open=false;},
      getBoundingClientRect(){return {left:10,right:830,top:10,bottom:610};},
      fire(type,extra){return dispatch(this,type,extra);}
    };
    for(const [key,value] of Object.entries(attrs)) {
      if(key==='id'){n.id=value;ids.set(value,n);}
      else if(key==='class')n.className=value;
      else if(key.startsWith('data-'))n.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
      else if(key==='hidden')n.hidden=true;
      n.attributes[key]=value;
    }
    nodes.push(n);return n;
  }
  function matches(n,selector){
    if(!n.isConnected)return false;
    if(selector.startsWith('#'))return n.id===selector.slice(1);
    if(selector.startsWith('.'))return n.className?.split(' ').includes(selector.slice(1));
    const data=selector.match(/^\[data-([\w-]+)\]$/);
    if(data)return Object.hasOwn(n.dataset,data[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase()));
    return n.tagName.toLowerCase()===selector;
  }
  for(const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)){
    const attrs={};for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[attr[1]]=attr[2]||'';
    node(match[1],attrs);
  }
  const $=selector=>nodes.find(n=>matches(n,selector))||null;
  document={body:$('body'),hidden:false,activeElement:$('body'),querySelector:$,
    querySelectorAll:selector=>nodes.filter(n=>matches(n,selector)),
    createElement:tag=>node(tag),createElementNS:(_,tag)=>node(tag),
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    fire(type,extra){return dispatch(this,type,extra);}};
  for(const id of ['river-evening','river-rain','river-sound','river-pause','save-status'])ids.get(id).parentElement=ids.get('river-settings');
  for(const n of document.querySelectorAll('[data-method]'))n.parentElement=ids.get('river-settings');
  const summary=nodes.find(n=>n.tagName==='SUMMARY');summary.parentElement=ids.get('river-settings');
  for(const id of ['close-guide','return-river','fish-index','guide-portrait'])ids.get(id).parentElement=ids.get('field-guide');
  const window={FishingLife:{...Life,createSession:()=>Life.createSession(()=>.5)},AudioContext,
    listeners:new Map(),addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);},
    fire(type,extra){return dispatch(this,type,extra);}};
  if(saved!==undefined)storage.set(Life.KEY,typeof saved==='string'?saved:Life.encodeProgress(saved));
  if(settings)storage.set('spriggan.fishing.settings.v1',JSON.stringify(settings));
  const localStorage={getItem(key){if(noStorage)throw Error('storage denied');return storage.get(key)||null;},
    setItem(key,value){if(noStorage)throw Error('storage denied');storage.set(key,value);writes.push({key,value});}};
  class FishingScene{constructor(){if(sceneFails)throw Error('no WebGL');}aimAt(){}update(){if(sceneUpdateFails)throw Error('render interrupted');}dispose(){}}
  const context=vm.createContext({window,document,localStorage,performance:{now:()=>now},
    matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}},
    requestAnimationFrame:fn=>{nextFrame=fn;},FishingScene,
    T:{WebGLRenderer:class{constructor(){throw Error('portrait fallback');}}},devicePixelRatio:1,console});
  vm.runInContext(source,context,{filename:'fishing.js'});
  function value(expression){return vm.runInContext(expression,context);}
  function tick(seconds=.05){now+=seconds*1000;nextFrame(now);}
  function advance(seconds){for(let left=seconds;left>1e-8;left-=.05)tick(Math.min(.05,left));}
  function click(selector){const button=$(selector);button.fire('pointerdown');button.fire('pointerup');button.fire('lostpointercapture');return button.fire('click',{detail:1});}
  function pointerDown(){return $('#fishing-action').fire('pointerdown');}
  function pointerUp(){const button=$('#fishing-action');button.fire('pointerup');button.fire('lostpointercapture');return button.fire('click',{detail:1});}
  function key(type,extra={}){return document.fire(type,{target:document.body,code:'Space',key:' ',...extra});}
  function reel(){click('#fishing-action');for(let n=0;n<200&&value('session.phase')!=='bite';n++)tick();assert.equal(value('session.phase'),'bite');click('#fishing-action');assert.equal(value('session.phase'),'reeling');}
  return {$,document,window,storage,writes,context,value,tick,advance,click,pointerDown,pointerUp,key,reel};
}

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
  h.$('[data-method]').fire('click');
  const toggle=h.document.querySelectorAll('[data-method]').find(n=>n.dataset.method==='toggle');toggle.fire('click');
  const button=h.$('#fishing-action');
  assert.equal(h.key('keydown',{target:button}).defaultPrevented,true);assert.equal(h.value('holding'),true);
  h.key('keydown',{target:button,repeat:true});assert.equal(h.value('holding'),true);
  h.key('keyup',{target:button});assert.equal(h.value('holding'),true);
  h.key('keydown',{target:button});assert.equal(h.value('holding'),false);
  h.click('#fishing-action');assert.equal(h.value('holding'),true);
  h.click('#fishing-action');assert.equal(h.value('holding'),false);
});

test('opening the guide or settings pauses a bite and always releases a held input',()=>{
  const h=harness();h.reel();h.pointerDown();h.click('#open-guide');
  assert.equal(h.value('holding'),false);assert.equal(h.$('#field-guide').open,true);
  const progress=h.value('session.progress');h.advance(10);assert.equal(h.value('session.progress'),progress);
  h.click('#close-guide');assert.equal(h.$('#field-guide').open,false);
  h.pointerDown();h.$('#river-settings').open=true;h.$('#river-settings').fire('toggle');
  assert.equal(h.value('holding'),false);const time=h.value('session.reelTime');h.advance(2);assert.equal(h.value('session.reelTime'),time);
  h.$('#river-settings').open=false;h.$('#river-settings').fire('toggle');h.advance(.1);assert(h.value('session.reelTime')>time);
});

test('a bite window lasts through a long visit to the guide and expires only after returning',()=>{
  const h=harness();h.click('#fishing-action');h.advance(6);
  assert.equal(h.value('session.phase'),'bite');const time=h.value('session.phaseTime');
  h.click('#open-guide');h.advance(30);assert.equal(h.value('session.phase'),'bite');
  assert.equal(h.value('session.phaseTime'),time);
  h.$('#field-guide').fire('cancel');assert.equal(h.$('#field-guide').open,false);
  h.advance(2.7);assert.equal(h.value('session.phase'),'escaped');
});

test('a pointer cancellation clears hold without triggering a catch action',()=>{
  const h=harness();h.reel();h.pointerDown();h.$('#fishing-action').fire('pointercancel');
  assert.equal(h.value('holding'),false);assert.equal(h.value('session.phase'),'reeling');
  assert.equal(h.$('#fishing-action').getAttribute('aria-pressed'),'false');
});

test('manual pause, hidden tabs, and reopening the guide never spend absent time reeling',()=>{
  const h=harness();h.reel();h.pointerDown();h.click('#river-pause');
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
  h.click('#catch-guide');assert.equal(h.$('#field-guide').open,true);assert.equal(h.value('guide.total'),1);
  h.click('#return-river');h.click('#fishing-action');assert.equal(h.value('session.phase'),'idle');assert.equal(h.$('#catch-note').hidden,true);
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

test('unsupported audio degrades to muted play without an unhandled rejection',async()=>{
  const h=harness();h.click('#river-sound');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.value('settings.sound'),false);h.reel();assert.equal(h.value('session.phase'),'reeling');
});

test('sound effect failures cannot interrupt hook and landing UI',async()=>{
  class FailingNotes{
    constructor(){this.state='running';this.sampleRate=1;this.currentTime=0;this.destination={};}
    createBuffer(){return {getChannelData:()=>new Float32Array(3)};}
    createBufferSource(){return {connect(){return this;},start(){}};}
    createBiquadFilter(){return {frequency:{value:0},connect(){return this;}};}
    createGain(){return {gain:{value:0},connect(){return this;}};}
    resume(){return Promise.resolve();}suspend(){return Promise.resolve();}
    createOscillator(){throw Error('audio device unavailable');}
  }
  const h=harness({AudioContext:FailingNotes});h.click('#river-sound');await new Promise(resolve=>setImmediate(resolve));
  assert.doesNotThrow(()=>h.reel());
  h.value("session.progress=.999;session.tension=.2;holding=true");assert.doesNotThrow(()=>h.tick());
  assert.equal(h.$('#catch-note').hidden,false);assert.equal(h.value('guide.total'),1);
});
