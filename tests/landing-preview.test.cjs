const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const paths=require('../dist/landing-paths.js');

function setup(){
  const created=[],ids=new Map(),markers=new Map(),timers=new Map(),windowEvents=new Map(),documentEvents=new Map();
  let timerId=0;
  function node(tag='div',id='',className=''){
    const events=new Map(),classes=new Set(className.split(' ').filter(Boolean));
    const result={tagName:tag.toUpperCase(),id,className,dataset:{},attributes:{},children:[],parentElement:null,hidden:false,style:{setProperty(){}},
      textContent:'',classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
      setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k]??null;},removeAttribute(k){delete this.attributes[k];if(k==='src')this.src='';},
      addEventListener(type,fn){if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},
      fire(type,extra={}){const e={type,target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};for(const fn of events.get(type)||[])fn(e);return e;},
      append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}},
      prepend(child){child.parentElement=this;this.children.unshift(child);},
      insertBefore(child,before){child.parentElement=this;const index=this.children.indexOf(before);if(index<0)this.children.push(child);else this.children.splice(index,0,child);},
      replaceChildren(...children){this.children=[];this.append(...children);},
      remove(){this.removed=true;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;},
      contains(other){for(let at=other;at;at=at.parentElement)if(at===this)return true;return false;},
      querySelector(selector){for(const child of this.children){if(selector==='.'+child.className)return child;const descendant=child.querySelector(selector);if(descendant)return descendant;}return null;},
      cloneNode(){return node(tag,'',className);},focus(){this.focused=true;},
      getBoundingClientRect(){return {left:0,top:0,right:1440,bottom:900,width:1440,height:900};},
      getTotalLength(){return 0;},getPointAtLength(){return {x:825,y:570};},setPointerCapture(){}};
    if(tag==='iframe'){result.contentWindow={};result.navigations=[];Object.defineProperty(result,'src',{get(){return this.navigations.at(-1)||'';},set(value){this.navigations.push(value);}});}
    if(id)ids.set(id,result);created.push(result);return result;
  }
  for(const id of ['park-guide','toggle-guide','map-stage','map-world','destination','travel-route','traveler','map-status','destination-image','destination-name','destination-kind','destination-description','enter-world','coming-soon','close-destination','zoom-in','zoom-out','reset-view'])node(id==='destination-image'?'img':id==='enter-world'?'a':'div',id);
  ids.get('destination').hidden=true;ids.get('destination').append(ids.get('close-destination'),ids.get('destination-image'));
  ids.get('map-stage').clientWidth=1440;ids.get('map-stage').clientHeight=900;
  const directory=node('nav','','place-directory'),intro=node('div','','map-intro'),terrain=node('svg','','terrain');
  const document={baseURI:'https://spriggan.test/park/index.html',body:{dataset:{}},hidden:false,
    createElement:tag=>node(tag),
    querySelector(selector){
      if(selector[0]==='#')return ids.get(selector.slice(1));
      if(selector==='.place-directory')return directory;if(selector==='.map-intro')return intro;if(selector==='.terrain')return terrain;
      const shop=selector.match(/^\.map-shop\[data-place="([^"]+)"\](.*)$/);if(shop)return shop[2]?markers.get(shop[1]).children[0]:markers.get(shop[1]);
      return null;
    },
    querySelectorAll(selector){if(selector==='[data-place]')return [...markers.values()];return [];},
    addEventListener(type,fn){if(!documentEvents.has(type))documentEvents.set(type,[]);documentEvents.get(type).push(fn);}};
  const window={location:{origin:'https://spriggan.test'},VillagePaths:paths,
    addEventListener(type,fn){if(!windowEvents.has(type))windowEvents.set(type,[]);windowEvents.get(type).push(fn);}};
  const context=vm.createContext({window,document,URL,performance:{now:()=>1},
    matchMedia:query=>({matches:query.includes('prefers-reduced-motion'),addEventListener(){}}),
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/landing-places.js'),'utf8'),context);
  for(const place of window.SPRIGGAN_PLACES){const marker=node('button','','map-shop');marker.dataset.place=place.id;marker.append(node('svg','','shop-art'));markers.set(place.id,marker);}
  vm.runInContext(fs.readFileSync(require.resolve('../dist/landing.js'),'utf8'),context);
  const fire=(type,event={})=>{for(const fn of windowEvents.get(type)||[])fn(event);};
  return {created,ids,timers,window,select:id=>markers.get(id).fire('click'),close:()=>ids.get('close-destination').fire('click'),
    frame:()=>created.findLast(n=>n.tagName==='IFRAME'&&!n.removed),host:()=>ids.get('destination').querySelector('.destination-preview'),fire,
    message(frame,state,extra={}){fire('message',{source:frame.contentWindow,origin:'https://spriggan.test',data:{type:'spriggan-fishing-preview',state},...extra});},
    escape(){for(const fn of documentEvents.get('keydown')||[])fn({key:'Escape'});}};
}

test('Fishing alone registers an actual map preview and opening the park does not create a frame',()=>{
  const h=setup(),fish=h.window.SPRIGGAN_PLACES.find(place=>place.id==='fishing');
  assert.equal(fish.image,null);assert.equal(fish.preview,'./fishing/preview.html?v=river-preview-1');
  assert.equal(h.created.filter(node=>node.tagName==='IFRAME').length,0);
  h.select('pond');assert.equal(h.created.filter(node=>node.tagName==='IFRAME').length,0);
  assert.equal(h.ids.get('destination-image').hidden,false);assert.equal(h.ids.get('destination-image').src,'./previews/pond.png');
});

test('selecting Fishing lazily embeds a decorative actual map and preserves its visit link',()=>{
  const h=setup();h.select('fishing');const frame=h.frame(),host=h.host();
  assert.equal(frame.src,'https://spriggan.test/park/fishing/preview.html?v=river-preview-1');
  assert.equal(frame.loading,'lazy');assert.equal(frame.title,'The Fishing Dock map preview');
  assert.equal(frame.tabIndex,-1);assert.equal(frame.getAttribute('aria-hidden'),'true');assert.equal(frame.inert,true);
  assert.equal(h.ids.get('destination-image').hidden,true);assert.equal(h.ids.get('destination-image').src,'');
  assert.equal(host.dataset.state,'loading');assert.equal(host.getAttribute('aria-busy'),'true');
  assert.equal(h.ids.get('enter-world').href,'./fishing/');assert.equal(h.ids.get('enter-world').hidden,false);
  assert.equal([...h.timers.values()][0].delay,15000);
  h.message(frame,'ready');assert.equal(host.dataset.state,'ready');assert.equal(host.getAttribute('aria-busy'),'false');
  assert.equal(host.querySelector('.destination-preview-status').hidden,true);assert.equal(h.timers.size,0);
});

test('preview messages require the current frame, exact same origin, and the expected protocol',()=>{
  const h=setup();h.select('fishing');const frame=h.frame(),host=h.host();
  for(const extra of [{origin:'https://other.test'},{source:{}},{data:{type:'other',state:'ready'}},{data:{type:'spriggan-fishing-preview',state:'unknown'}}])h.message(frame,'ready',extra);
  assert.equal(host.dataset.state,'loading');assert.equal(h.timers.size,1);
  h.message(frame,'ready');assert.equal(host.dataset.state,'ready');
});

test('reselecting an already open Fishing card reuses its scene while closing and reopening starts a fresh preview',()=>{
  const h=setup();h.select('fishing');const frame=h.frame(),host=h.host();
  h.select('fishing');assert.equal(h.frame(),frame);assert.equal(h.host(),host);
  assert.equal(h.created.filter(node=>node.tagName==='IFRAME').length,1);
  h.close();h.select('fishing');assert.notEqual(h.frame(),frame);
  assert.equal(h.created.filter(node=>node.tagName==='IFRAME').length,2);
});

test('close, Escape, and switching worlds unload the embedded scene and preserve other previews',()=>{
  for(const action of ['close','escape','switch']){
    const h=setup();h.select('fishing');const frame=h.frame(),host=h.host();
    if(action==='close')h.close();else if(action==='escape')h.escape();else h.select('claw');
    assert.equal(frame.src,'about:blank');assert.equal(frame.removed,true);assert.equal(host.removed,true);
    assert.equal(h.frame(),undefined);assert.equal(h.timers.size,0);assert.equal(h.ids.get('destination').dataset.preview,undefined);
    h.message(frame,'ready');assert.equal(h.host(),null);
    if(action==='switch'){assert.equal(h.ids.get('destination-image').hidden,false);assert.equal(h.ids.get('destination-image').src,'./previews/claw.png?v=little-places-1');assert.equal(h.ids.get('enter-world').href,'./claw/');}
  }
});

test('late readiness, error, and timeout callbacks cannot replace a newly opened preview',()=>{
  const h=setup();h.select('fishing');const old=h.frame(),timeout=[...h.timers.values()][0].fn;
  h.close();h.select('fishing');const current=h.frame(),host=h.host();
  assert.notEqual(current,old);h.message(old,'ready');old.fire('error');timeout();
  assert.equal(host.dataset.state,'loading');assert.equal(current.removed,undefined);assert.equal(h.timers.size,1);
  h.message(current,'ready');assert.equal(host.dataset.state,'ready');
});

test('unavailable, failed, and timed-out previews give a clear fallback and retain navigation',()=>{
  for(const error of ['message','error','timeout']){
    const h=setup();h.select('fishing');const frame=h.frame(),host=h.host();
    if(error==='message')h.message(frame,'unavailable');else if(error==='error')frame.fire('error');else [...h.timers.values()][0].fn();
    assert.equal(host.dataset.state,'unavailable');assert.equal(host.getAttribute('aria-busy'),'false');
    assert.match(host.querySelector('.destination-preview-status').textContent,/Map preview unavailable/);
    assert.equal(frame.src,'about:blank');assert.equal(frame.removed,true);assert.equal(h.timers.size,0);
    assert.equal(h.ids.get('destination-image').hidden,true);assert.equal(h.ids.get('enter-world').href,'./fishing/');
  }
});

test('pagehide unloads a selected preview and pageshow recreates it only while that card remains open',()=>{
  const h=setup();h.fire('pageshow');assert.equal(h.frame(),undefined);
  h.select('fishing');const first=h.frame();h.fire('pagehide');assert.equal(first.src,'about:blank');assert.equal(h.frame(),undefined);
  h.fire('pageshow');assert(h.frame());assert.notEqual(h.frame(),first);
  h.close();h.fire('pageshow');assert.equal(h.frame(),undefined);
});
