const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PondLife = require('../dist/pond/pond-life.js');
const SlotsLife = require('../dist/slots/slots-life.js');
const PondPlants = require('../dist/pond/pond-plants.js');
const now = Date.now();

// Execute the complete app with a small browser surface; exercise its real event and save paths.
function openPond(initial = PondLife.create(now), setup) {
  const elements = new Map();
  const listeners = new Map();
  const tools = new Map();
  const frames = [], errors = [], timers = new Map();
  let clock = 0, timerId = 0;
  const values = new Map([[PondLife.KEY, JSON.stringify(initial)]]);
  const gradient = { addColorStop() {} };
  const drawing = new Proxy({}, {
    get(target, property) {
      if (property === 'createRadialGradient' || property === 'createLinearGradient') return () => gradient;
      return target[property] || (() => {});
    }
  });
  class Element {
    constructor() {
      this.value = '';
      this.hidden = true;
      this.style = {};
      this.dataset = {};
      this.textContent = '';
      this.attributes = new Map();
      this.children = [];
      this.offsetWidth = 220;this.offsetHeight = 150;
      this.parts = new Map();
      const classes = new Set();
      this.classList = {
        contains: value => classes.has(value),
        add: value => classes.add(value),
        remove: value => classes.delete(value),
        toggle(value, enabled) {
          if (enabled === undefined) enabled = !classes.has(value);
          if (enabled) classes.add(value); else classes.delete(value);
        }
      };
    }
    querySelector(selector) {
      if (!this.parts.has(selector)) this.parts.set(selector, new Element());
      return this.parts.get(selector);
    }
    closest() { return this.querySelector('parent'); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) || null; }
    removeAttribute(key) { this.attributes.delete(key); }
    replaceChildren(...children) { this.children = children; }
    add(child) { this.children.push(child); }
    addEventListener() {}
    getContext() { return drawing; }
    getBoundingClientRect() { return { width: 900, height: 600, left: 0, top: 0 }; }
    click() { this.onclick?.(); }
    focus() {}
    select() {}
    setCustomValidity() {}
  }
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('main').setAttribute('data-pond-loading', '');
  element('#pond-loading').hidden = false;
  element('#pond-loading-title').textContent = 'Opening your saved pond…';
  element('#toggle-controls').setAttribute('aria-expanded', 'true');
  const on = (key, callback) => {
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(callback);
  };
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const integration = setup?.(storage) || {};
  class Audio {
    constructor() { this.enabled = {}; this.loading = new Set(); }
    setVolume() {}
    visibility() {}
  }
  const sandbox = {
    PondLife, PondPlants, PondAudio: Audio, SprigganRuntime:{mobile:true,runBackground(){}},
    localStorage: storage,
    SprigganStorage: integration.storage,
    SprigganAccounts: integration.accounts,
    devicePixelRatio: 1,
    innerWidth:900,innerHeight:600,
    Path2D: class { moveTo() {} bezierCurveTo() {} quadraticCurveTo() {} },
    Event,
    console: { error: (...details) => errors.push(details) },
    ResizeObserver: class { observe() {} },
    Option: class { constructor(label, value) { this.label = label; this.value = value; } },
    document: {
      hidden: false,
      querySelector: element,
      createElement: () => new Element(),
      addEventListener: on,
      modelContext: { registerTool: tool => tools.set(tool.name, tool) }
    },
    window: {
      Event, matchMedia: () => ({ matches: false }), addEventListener: on,
      dispatchEvent: event => { listeners.get(event.type)?.forEach(callback => callback(event)); return true; }
    },
    setTimeout(callback, delay) { const id=++timerId;timers.set(id,{callback,at:clock+delay});return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {},
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; }, cancelAnimationFrame() {}, performance: { now: () => 0 }
  };
  if(integration.fixedRandom)sandbox.Math=Object.assign(Object.create(Math),{random:()=>.5});
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/pond/app.js'), 'utf8'), sandbox);
  if (integration.failFirstRender) drawing.drawImage = () => { throw Error('Drawing failed'); };
  function render(time = 16) { const frame = frames.shift(); if (frame) frame(time); return !!frame; }
  render();
  return {
    storage, element,
    render, errors,
    tick(ms) {
      const end=clock+ms;
      for(;;){
        const next=[...timers.entries()].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next)break;
        const [id,job]=next;clock=job.at;timers.delete(id);job.callback();
      }
      clock=end;
    },
    failDrawing() { drawing.drawImage = () => { throw Error('Drawing failed'); }; },
    loadControls() { vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/shared/map-controls.js'), 'utf8'), sandbox); },
    emit: (key, event = {}) => listeners.get(key)?.forEach(callback => callback(event)),
    invoke: (name, input = {}) => tools.get(name).execute(input),
    hasTool: name => tools.has(name),
    read: () => PondLife.decode(storage.getItem(PondLife.KEY)),
    claim() {
      const slots = SlotsLife.create();
      slots.goldenUnlocked = true;
      return SlotsLife.claimGolden(slots, storage, PondLife);
    }
  };
}

test('an already-open pond welcomes external Kin and preserves its unsaved local fish and settings', () => {
  const app = openPond();
  app.invoke('add_koi');
  app.element('#night').onclick();
  const result = app.claim();
  assert.equal(result.status, 'claimed');
  const event = { key: PondLife.KEY, newValue: app.storage.getItem(PondLife.KEY), storageArea: app.storage };
  app.emit('storage', event);
  const choices = app.element('#koi-picker').children;
  assert.equal(choices.filter(choice => choice.value === SlotsLife.GOLDEN_FISH_ID).length, 1);
  assert.match(app.element('#pond-moment').textContent, /Kin has arrived/);
  app.emit('storage', event);
  app.emit('pagehide');
  const saved = app.read();
  assert.equal(saved.fish.length, 7);
  assert.equal(saved.fish.filter(fish => fish.golden).length, 1);
  assert.equal(saved.settings.night, true);
  assert.equal(saved.fish.find(fish => fish.golden).id, SlotsLife.GOLDEN_FISH_ID);

  const number = saved.fish.findIndex(fish => fish.id === SlotsLife.GOLDEN_FISH_ID) + 1;
  app.invoke('remove_koi', { number });
  app.emit('pagehide');
  assert.equal(app.read().fish.length, 6);
  assert.equal(app.read().fish.some(fish => fish.golden), false);
});

test('a save catches the external reward even before a queued storage event arrives', () => {
  const app = openPond();
  app.invoke('add_koi');
  assert.equal(app.claim().status, 'claimed');
  app.emit('pagehide');
  const saved = app.read();
  assert.equal(saved.fish.length, 7);
  assert.equal(saved.fish.find(fish => fish.golden).id, SlotsLife.GOLDEN_FISH_ID);
});

test('a stale concurrent pond snapshot cannot displace a full live pond or lose its waiting reward', () => {
  const app = openPond();
  const earlier=app.storage.getItem(PondLife.KEY);
  for (let i = 0; i < 7; i++) app.invoke('add_koi');
  app.storage.setItem(PondLife.KEY,earlier); // A concurrent claim started from the older snapshot.
  assert.equal(app.claim().status, 'claimed');
  const remote = app.storage.getItem(PondLife.KEY);
  app.emit('storage', { key: PondLife.KEY, newValue: remote, storageArea: app.storage });
  app.emit('pagehide');
  assert.equal(app.storage.getItem(PondLife.KEY), remote);
  assert.match(app.element('#pond-memory').textContent, /Kin is waiting/);
  app.invoke('remove_koi', { number: 1 });
  app.emit('pagehide');
  const saved = app.read();
  assert.equal(saved.fish.length, 12);
  assert.equal(saved.fish.filter(fish => fish.golden).length, 1);
  assert.equal(saved.fish.find(fish => fish.golden).id, SlotsLife.GOLDEN_FISH_ID);
});

test('an existing local golden koi is kept while a newly won golden koi arrives', () => {
  const initial = PondLife.create(now);
  initial.fish[0].golden = true;
  initial.fish[0].name = 'Local golden';
  const app = openPond(initial);
  const remote = PondLife.decode(app.storage.getItem(PondLife.KEY));
  remote.fish[0].golden = false;
  app.storage.setItem(PondLife.KEY, JSON.stringify(remote));
  assert.equal(app.claim().status, 'claimed');
  app.emit('storage', { key: PondLife.KEY, newValue: app.storage.getItem(PondLife.KEY), storageArea: app.storage });
  app.emit('pagehide');
  const saved = app.read();
  assert.equal(saved.fish.length, 6);
  assert.equal(saved.fish.filter(fish => fish.golden).length, 2);
  assert.equal(saved.fish.find(fish => fish.golden).id, initial.fish[0].id);
});

test('an open pond receives successive golden prizes once and does not resurrect a removed prize',()=>{
 const app=openPond(),slots=SlotsLife.create();
 for(let i=1;i<=3;i++){
  SlotsLife.spin(slots,()=>0);
  assert.equal(SlotsLife.claimGolden(slots,app.storage,PondLife).status,'claimed');
  app.emit('storage',{key:PondLife.KEY,newValue:app.storage.getItem(PondLife.KEY),storageArea:app.storage});app.emit('pagehide');
  assert.equal(app.read().fish.filter(f=>f.golden).length,i);
 }
 const removed=app.read().fish.findIndex(f=>f.id===SlotsLife.GOLDEN_FISH_ID)+1;
 app.invoke('remove_koi',{number:removed});app.emit('pagehide');
 SlotsLife.spin(slots,()=>0);SlotsLife.claimGolden(slots,app.storage,PondLife);app.emit('pagehide');
 const fish=app.read().fish;assert.equal(fish.filter(f=>f.golden).length,3);assert(!fish.some(f=>f.id===SlotsLife.GOLDEN_FISH_ID));
});

test('the real pond waits for account hydration and writes only its account worlds',async()=>{
 const Saves=require('../dist/shared/account-storage.js');
 const guest=PondLife.create(now),cloud=PondLife.create(now);cloud.fish=cloud.fish.slice(0,2);cloud.fish[0].name='Cloud companion';
 let release,profile;
 const ready=new Promise(resolve=>{release=resolve});
 const app=openPond(guest,raw=>{
  Saves.setActive(raw,'pond-player');profile=Saves.create(raw,{events:null});
  return{storage:profile,accounts:{ready}};
 });
 assert.equal(app.hasTool('add_koi'),false);
 assert.deepEqual(profile.snapshot(),{});
 profile.replace({[PondLife.KEY]:JSON.stringify(cloud)},8);
 release();await ready;await Promise.resolve();
 app.render();
 assert.equal(app.invoke('add_koi').koiCount,3);
 app.emit('spriggan:flush');
 const account=PondLife.decode(profile.getItem(PondLife.KEY));
 assert.equal(account.fish.length,3);assert.equal(account.fish[0].name,'Cloud companion');
 assert.equal(profile.state().dirty,true);
 assert.equal(app.storage.getItem(PondLife.KEY),JSON.stringify(guest));
});

test('an old live pond cannot overwrite a same-account restore',async()=>{
 const Saves=require('../dist/shared/account-storage.js');let profile;
 const app=openPond(PondLife.create(now),raw=>{
  Saves.setActive(raw,'pond-player');profile=Saves.create(raw,{events:null});
  profile.replace({[PondLife.KEY]:JSON.stringify(PondLife.create(now))},3);
  return{storage:profile};
 });
 app.invoke('add_koi');
 Saves.setActive(app.storage,'pond-player');
 const restored=Saves.create(app.storage,{events:null}),replacement=PondLife.create(now);replacement.fish=[];
 restored.replace({[PondLife.KEY]:JSON.stringify(replacement)},4);
 app.emit('pagehide');
 assert.equal(PondLife.decode(restored.getItem(PondLife.KEY)).fish.length,0);
 assert.match(app.element('#pond-memory').textContent,/Saving is unavailable/);
 assert.equal(PondLife.decode(app.storage.getItem(PondLife.KEY)).fish.length,5);
});

test('delayed account hydration keeps the loading backdrop and collapses controls after handlers exist',async()=>{
 const Saves=require('../dist/shared/account-storage.js');let profile,release;
 const ready=new Promise(resolve=>{release=resolve});
 const state={loading:true,worldsReady:false,message:'Opening saved worlds…'};
 const app=openPond(PondLife.create(now),raw=>{
  Saves.setActive(raw,'delayed-player');profile=Saves.create(raw,{events:null});
  return{storage:profile,accounts:{ready,state}};
 });
 app.loadControls();
 assert.equal(app.element('#pond-loading').hidden,false);
 assert.equal(app.element('#pond-loading-title').textContent,'Opening your saved pond…');
 assert.equal(app.hasTool('add_koi'),false);
 app.emit('spriggan:flush');assert.deepEqual(profile.snapshot(),{});
 const restored=PondLife.create(now);restored.fish=restored.fish.slice(0,2);restored.fish[0].name='Restored friend';
 profile.replace({[PondLife.KEY]:JSON.stringify(restored)},3);
 state.loading=false;state.worldsReady=true;release();
 for(let i=0;i<5;i++)await Promise.resolve();
 assert.equal(app.element('#toggle-controls').getAttribute('aria-expanded'),'false');
 assert.equal(app.element('#pond-loading').hidden,false,'no blank canvas before the first complete frame');
 app.render();
 assert.equal(app.element('#pond-loading').hidden,true);
 app.emit('spriggan:flush');
 const saved=PondLife.decode(profile.getItem(PondLife.KEY));
 assert.equal(saved.fish.length,2);assert.equal(saved.fish[0].name,'Restored friend');
 assert.deepEqual(app.errors,[]);
});

test('failed account loading cannot boot or replace worlds, and a successful retry boots once',async()=>{
 const Saves=require('../dist/shared/account-storage.js');let profile;
 const state={loading:false,worldsReady:false,user:{emailVerified:true},message:'Could not read your cloud save.'},subscribers=new Set();
 const accounts={ready:Promise.resolve(),state,subscribe(fn){subscribers.add(fn);fn();return()=>subscribers.delete(fn)}};
 const app=openPond(PondLife.create(now),raw=>{
  Saves.setActive(raw,'retry-player');profile=Saves.create(raw,{events:null});return{storage:profile,accounts};
 });
 for(let i=0;i<3;i++)await Promise.resolve();
 assert.equal(app.hasTool('add_koi'),false);
 assert.equal(app.element('#pond-loading').hidden,false);
 assert.equal(app.element('#pond-loading-actions').hidden,false);
 assert.equal(app.element('#pond-loading-detail').textContent,state.message);
 app.emit('pagehide');app.emit('spriggan:flush');assert.deepEqual(profile.snapshot(),{});
 const restored=PondLife.create(now);restored.fish=restored.fish.slice(0,2);restored.fish[0].name='Safe recovery';
 let retries=0;
 accounts.sync=async()=>{
  retries++;profile.replace({[PondLife.KEY]:JSON.stringify(restored)},4);
  state.worldsReady=true;for(const fn of subscribers)fn();
 };
 await app.element('#pond-loading-retry').onclick();app.render();
 assert.equal(retries,1);assert.equal(app.element('#pond-loading-retry').disabled,false);
 assert.equal(app.element('#pond-loading').hidden,true);
 assert.equal(app.invoke('add_koi').koiCount,3);
 for(const fn of subscribers)fn();
 assert.equal(app.invoke('add_koi').koiCount,4,'a later account update must not restart the simulation');
 app.emit('spriggan:flush');assert.equal(PondLife.decode(profile.getItem(PondLife.KEY)).fish[0].name,'Safe recovery');
});

test('an intentionally empty saved pond stays empty after loading and rendering',()=>{
 const empty=PondLife.create(now);empty.fish=[];
 const app=openPond(empty);
 assert.equal(app.element('#pond-loading').hidden,true);
 assert.equal(app.element('#status').textContent,'0 koi swimming');
 app.emit('spriggan:flush');assert.equal(app.read().fish.length,0);
 assert.deepEqual(app.errors,[]);
});

test('a failed first render keeps a recoverable placeholder and never saves an empty replacement',()=>{
 const initial=PondLife.create(now),app=openPond(initial,()=>({failFirstRender:true}));
 assert.equal(app.element('#pond-loading').hidden,false);
 assert.equal(app.element('#pond-loading-actions').hidden,false);
 assert.match(app.element('#pond-loading-title').textContent,/could not open/);
 app.emit('pagehide');app.emit('spriggan:flush');app.render(32);
 assert.equal(app.storage.getItem(PondLife.KEY),JSON.stringify(initial));
 assert.equal(app.errors.length,1,'stop drawing after the first rendering failure');
});

test('a later render failure stops further pond saves and preserves the last healthy snapshot',()=>{
 const app=openPond();app.emit('spriggan:flush');const healthy=app.storage.getItem(PondLife.KEY);
 app.failDrawing();app.render(32);
 assert.equal(app.element('#pond-loading').hidden,false);
 app.invoke('add_koi');app.emit('spriggan:flush');app.emit('pagehide');
 assert.equal(app.storage.getItem(PondLife.KEY),healthy);
 assert.equal(app.errors.length,1);
});

async function eventPond(initial=PondLife.create(now),extra={}){
 const saves=[];
 const accounts={ready:Promise.resolve(),state:{loading:false,worldsReady:true},subscribe(){return()=>{} }};
 const app=openPond(initial,raw=>{
  accounts.saveProgress=async()=>saves.push(JSON.parse(raw.getItem(PondLife.KEY)));
  return {accounts,...extra};
 });
 for(let i=0;i<5;i++)await Promise.resolve();
 app.render();
 return {app,saves};
}

test('the first healthy pond frame saves timestamps and membership edits immediately checkpoint their local snapshot',async()=>{
 const {app,saves}=await eventPond();
 assert.equal(saves.length,1);assert.equal(saves[0].fish.length,5);
 assert.ok(saves[0].savedAt>=now);assert.ok(saves[0].fish.every(f=>f.lastGrowthAt>=now));
 app.invoke('add_koi');assert.equal(saves.length,2);assert.equal(saves[1].fish.length,6);
 app.invoke('remove_koi',{number:1});assert.equal(saves.length,3);assert.equal(saves[2].fish.length,5);
 app.emit('spriggan:flush');assert.equal(saves.length,3,'a flush cannot recursively request another event save');
});

test('pond names and committed settings checkpoint, while ordinary motion and slider input stay batched',async()=>{
 const {app,saves}=await eventPond();const id=app.read().fish[0].id;
 app.element('#koi-picker').value=id;app.element('#koi-picker').onchange();
 app.element('#koi-name').value='Saved friend';app.element('#rename-koi').onsubmit({preventDefault(){}});
 assert.equal(saves.at(-1).fish[0].name,'Saved friend');
 app.element('#night').onclick();assert.equal(saves.at(-1).settings.night,true);
 const count=saves.length;
 app.element('#speed').value='1.5';app.element('#speed').oninput();app.render(32);app.render(48);
 assert.equal(saves.length,count);
 app.element('#speed').onchange();assert.equal(saves.at(-1).settings.pace,1.5);assert.equal(saves.length,count+1);
 app.emit('visibilitychange');assert.equal(saves.length,count+2,'returning settles time before checkpointing');
});

test('continuous feeding is persisted and checkpointed within the first bounded feeding interval',async()=>{
 const initial=PondLife.create(now);initial.fish=initial.fish.slice(0,1);initial.fish[0].x=.5;initial.fish[0].y=.5;
 const {app,saves}=await eventPond(initial,{fixedRandom:true});
 app.invoke('feed_koi',{x:50,y:50});
 for(let i=0;i<5;i++){app.render(32+i*16);if(i<4)app.tick(200)}
 assert.equal(saves.length,1,'individual bites do not each request an upload');
 app.tick(100);
 assert.equal(saves.length,2);assert.equal(saves[1].fish[0].meals,5);
 assert.ok(saves[1].fish[0].nutrition>0);
});

test('pond event saves never request cloud work after a local write fails',async()=>{
 const {app,saves}=await eventPond();const write=app.storage.setItem;
 app.storage.setItem=()=>{throw Error('storage full')};app.invoke('add_koi');assert.equal(saves.length,1);
 app.storage.setItem=write;app.emit('spriggan:flush');
 assert.equal(saves.length,2);assert.equal(saves[1].fish.length,6,'the pending significant change survives a local-write retry');
});
