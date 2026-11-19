const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const journal = require('../dist/shared/park-journal.js');

function setup({world='park',data={},blocked=false,hidden=false}={}) {
  const values = new Map(Object.entries(data)), writes=[], emitted=[], ids=new Map(), documentEvents=new Map(), windowEvents=new Map(), intervals=new Map();
  let nextInterval=0;
  const storage={getItem(key){if(blocked)throw Error('Blocked');return values.get(key)??null;},setItem(key,value){if(blocked)throw Error('Blocked');writes.push(key);values.set(key,value);},removeItem:key=>values.delete(key)};
  function node(tag='div',id='') {
    const handlers=new Map();
    const n={tagName:tag.toUpperCase(),id,children:[],hidden:false,disabled:false,attributes:{},textContent:'',
      setAttribute(key,value){this.attributes[key]=String(value);},getAttribute(key){return this.attributes[key]??null;},
      append(...children){for(const child of children){child.parent=this;this.children.push(child);}},replaceChildren(...children){this.children=[];this.append(...children);},
      insertBefore(child,before){if(child.parent)child.parent.children=child.parent.children.filter(n=>n!==child);child.parent=this;const at=this.children.indexOf(before);if(at<0)this.children.push(child);else this.children.splice(at,0,child);},
      addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},
      async fire(type,extra={}){const event={target:this,currentTarget:this,stopPropagation(){this.stopped=true;},...extra};for(const fn of handlers.get(type)||[])await fn(event);return event;},
      click(){this.clicked=true;return this.fire('click');},focus(){this.focused=true;},remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);},scrollIntoView(){this.scrolled=true;},
      contains(other){return other===this||this.children.some(child=>child.contains?.(other));},
      querySelector(selector){return this.children.find(child=>child.tagName.toLowerCase()===selector)||null;}};
    if(id)ids.set(id,n);return n;
  }
  const body=node('body');body.dataset={world};
  if(world==='park') {
    for(const id of ['park-memory-toggle','park-memory','park-memory-status','park-memory-resume','park-memory-list','park-memory-empty','park-memory-close','park-memory-heading','toggle-guide','destination','close-destination'])node('div',id);
    ids.get('park-memory').hidden=true;ids.get('destination').hidden=true;
    ids.get('park-memory-toggle').setAttribute('aria-expanded','false');ids.get('toggle-guide').setAttribute('aria-expanded','false');
    ids.get('toggle-guide').addEventListener('click',()=>{const guide=ids.get('toggle-guide');guide.setAttribute('aria-expanded',guide.getAttribute('aria-expanded')!=='true');});
    ids.get('park-memory-resume').append(node('strong'));
    ids.get('park-memory').append(...[...ids.values()].filter(n=>!['park-memory','park-memory-toggle','toggle-guide','destination','close-destination'].includes(n.id)));
    ids.get('close-destination').addEventListener('click',()=>{ids.get('destination').hidden=true;});
  }
  const document={readyState:'complete',body,baseURI:`https://spriggan.test/garden/${world==='park'?'':world+'/'}`,hidden,
    querySelector:selector=>ids.get(selector.slice(1))??null,createElement:tag=>node(tag),
    addEventListener(type,fn){if(!documentEvents.has(type))documentEvents.set(type,[]);documentEvents.get(type).push(fn);},
    dispatchEvent(event){emitted.push(event.type);for(const fn of documentEvents.get(event.type)||[])fn(event);return true;}};
  const window={localStorage:storage,SprigganJournal:journal,
    addEventListener(type,fn){if(!windowEvents.has(type))windowEvents.set(type,[]);windowEvents.get(type).push(fn);}};
  const context=vm.createContext({window,document,URL,Date,Intl,CustomEvent:class {constructor(type){this.type=type;}},
    setInterval(fn){intervals.set(++nextInterval,fn);return nextInterval;},clearInterval(id){intervals.delete(id);}});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/shared/park-memory.js'),'utf8'),context);
  async function fire(events,type,extra={}){const event={stopPropagation(){this.stopped=true;},...extra};for(const fn of events.get(type)||[])await fn(event);return event;}
  return {ids,storage,values,writes,emitted,intervals,document,window,body,meta:()=>JSON.parse(values.get(journal.KEY)),
    windowEvent:(type,event)=>fire(windowEvents,type,event),documentEvent:(type,event)=>fire(documentEvents,type,event),
    tick:()=>{for(const fn of intervals.values())fn();}};
}
const fishing = records => JSON.stringify({version:1,records});
const minnow = {count:1,bestLength:9};

test('a world visit tracks milestones without changing gameplay saves and park visits retain its resume link',async()=>{
  const h=setup({world:'fishing'});
  assert.equal(h.meta().lastWorld,'fishing');
  h.storage.setItem('spriggan.fishing.guide.v1',fishing({'willow-minnow':minnow}));
  h.writes.length=0;await h.windowEvent('pagehide');
  assert.deepEqual(h.writes,[journal.KEY]);assert.equal(h.meta().memories.length,1);assert.equal(h.intervals.size,0);
  const park=setup({data:Object.fromEntries(h.values)});
  assert.equal(park.meta().lastWorld,'fishing');
  assert.equal(park.ids.get('park-memory-resume').href,'https://spriggan.test/garden/fishing/');
  assert.match(park.ids.get('park-memory-resume').querySelector('strong').textContent,/Fishing Dock/);
  assert.equal(park.ids.get('park-memory-list').children.length,1);
});

test('an open world observes again after back-forward cache restoration without claiming a new visit during polling',async()=>{
  const h=setup({world:'pond'});const at=h.meta().lastVisitedAt;
  h.tick();assert.equal(h.meta().lastVisitedAt,at);
  await h.windowEvent('pagehide');assert.equal(h.intervals.size,0);
  await h.windowEvent('pageshow',{persisted:true});assert.equal(h.intervals.size,1);
});

test('journal changes from another tab are read without writing them back',async()=>{
  const h=setup();h.writes.length=0;
  await h.windowEvent('storage',{key:journal.KEY});
  assert.equal(h.writes.length,0);
  await h.windowEvent('storage',{key:'another-app'});assert.equal(h.writes.length,0);
});

test('notebook opens alongside the map, closes other tools, and Escape returns focus',async()=>{
  const h=setup();const toggle=h.ids.get('park-memory-toggle'),panel=h.ids.get('park-memory');
  await h.ids.get('toggle-guide').click();assert.equal(h.ids.get('toggle-guide').getAttribute('aria-expanded'),'true');
  h.ids.get('destination').hidden=false;
  await toggle.click();assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal(h.ids.get('toggle-guide').getAttribute('aria-expanded'),'false');assert.equal(h.ids.get('park-memory-close').focused,true);
  assert.equal(h.ids.get('destination').hidden,true);assert.equal(h.window.SprigganSaves,undefined);
  await h.documentEvent('keydown',{key:'Escape'});assert.equal(panel.hidden,true);assert.equal(toggle.focused,true);
  assert.equal(h.emitted.at(-1),'spriggan:park-panel-closed');
  await toggle.click();await h.ids.get('toggle-guide').click();assert.equal(panel.hidden,true);
});

test('outside focus and pointer input close the notebook and notify account controls',async()=>{
  const h=setup(),toggle=h.ids.get('park-memory-toggle'),panel=h.ids.get('park-memory');
  for(const event of ['focusin','pointerdown']) {
    await toggle.click();await h.documentEvent(event,{target:h.ids.get('park-memory-close')});
    assert.equal(panel.hidden,false);
    await h.documentEvent(event,{target:h.body});assert.equal(panel.hidden,true);
    assert.equal(toggle.getAttribute('aria-expanded'),'false');
    assert.equal(h.emitted.at(-1),'spriggan:park-panel-closed');
  }
});

test('cloud save requests capture the latest facts without changing gameplay records',async()=>{
  const h=setup();
  h.storage.setItem('spriggan.fishing.guide.v1',fishing({'willow-minnow':minnow}));h.writes.length=0;
  await h.documentEvent('spriggan:park-save-request');
  assert.deepEqual(h.writes,[journal.KEY]);assert.equal(h.meta().memories.length,1);
  assert.match(h.meta().memories[0].text,/Willow Minnow/);
  assert.equal(h.values.get('spriggan.fishing.guide.v1'),fishing({'willow-minnow':minnow}));
});

test('blocked storage leaves the notebook usable and names the recovery',async()=>{
  const h=setup({blocked:true});await h.ids.get('park-memory-toggle').click();
  assert.equal(h.ids.get('park-memory').hidden,false);assert.match(h.ids.get('park-memory-status').textContent,/Allow site storage/);
});

test('background tabs do not become the last visit until shown and reactivating a world updates the destination',async()=>{
  const h=setup({world:'fishing',hidden:true});assert.equal(h.meta().lastWorld,null);
  h.document.hidden=false;await h.documentEvent('visibilitychange');assert.equal(h.meta().lastWorld,'fishing');
  h.storage.setItem(journal.KEY,JSON.stringify({...h.meta(),lastWorld:'pond'}));h.tick();assert.equal(h.meta().lastWorld,'pond');
  await h.documentEvent('visibilitychange');assert.equal(h.meta().lastWorld,'fishing');
});

test('periodic refresh keeps the same memory link and adding a new memory preserves existing nodes',()=>{
  const old=journal.updateJournal(null,journal.readSnapshot({getItem:()=>null}),{now:1});
  const current=journal.updateJournal(old,{fishing:{records:{'willow-minnow':minnow}}},{now:2});
  const h=setup({data:{[journal.KEY]:JSON.stringify(current),'spriggan.fishing.guide.v1':fishing({'willow-minnow':minnow})}});
  const link=h.ids.get('park-memory-list').children[0].children[0];link.focus();h.tick();
  assert.equal(h.ids.get('park-memory-list').children[0].children[0],link);
  h.storage.setItem('spriggan.fishing.guide.v1',fishing({'willow-minnow':{count:2,bestLength:10}}));h.tick();
  assert.equal(h.ids.get('park-memory-list').children.length,2);
  assert.equal(h.ids.get('park-memory-list').children[1].children[0],link);
});

test('a whole-park restore cannot resurrect the previous journal when the imported copy has no journal',async()=>{
  const initial=journal.updateJournal(null,{fishing:{records:{}}},{world:'fishing',now:1});
  const populated=journal.updateJournal(initial,{fishing:{records:{'willow-minnow':minnow}}},{now:2});
  const h=setup({data:{[journal.KEY]:JSON.stringify(populated)}});assert.equal(h.meta().memories.length,1);
  h.storage.removeItem(journal.KEY);await h.documentEvent('spriggan:park-restored');
  assert.equal(h.meta().memories.length,0);assert.equal(h.meta().lastWorld,null);
});

test('a cloud-restored journal keeps its own memories and establishes a fresh gameplay baseline',async()=>{
  const old=journal.updateJournal(null,{fishing:{records:{}}},{world:'fishing',now:1});
  const populated=journal.updateJournal(old,{fishing:{records:{'willow-minnow':minnow}}},{now:2});
  const h=setup({data:{[journal.KEY]:JSON.stringify(populated)}});
  const imported={...old,lastWorld:'pond',memories:[{id:'cloud-memory',world:'pond',text:'Kin joined your pond.',at:3}]};
  h.storage.setItem(journal.KEY,JSON.stringify(imported));
  h.storage.setItem('spriggan.fishing.guide.v1',fishing({'willow-minnow':minnow}));
  await h.documentEvent('spriggan:park-restored');h.tick();
  assert.equal(h.meta().lastWorld,'pond');assert.deepEqual(h.meta().memories,imported.memories);
  assert.equal(h.ids.get('park-memory-list').children.length,1);
});
