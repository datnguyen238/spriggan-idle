/* Actual fishing handlers and pond controllers; only browser APIs are adapted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Life = require('../../dist/fishing/fishing-life.js');
const html = fs.readFileSync(require.resolve('../../dist/fishing/index.html'), 'utf8');
const source = fs.readFileSync(require.resolve('../../dist/fishing/fishing.js'), 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/import\.meta\.url/g, JSON.stringify('https://spriggan.test/fishing/fishing.js'));

function harness({saved, settings, noStorage=false, sceneFails=false, sceneUpdateFails=false,
  query='',audioMissing=false,audioPolicy='allow',rainPolicy,fetchFails=false}={}) {
  const nodes = [], ids = new Map(), listeners = new Map(), storage = new Map(), writes = [];
  const audio={policy:audioPolicy,rainPolicy,fetchFails,players:[],contexts:[],fetches:[],timers:new Map()};
  const queuedToggles=new Set();
  let timerId=0;
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
      parentElement:null,isConnected:true,hidden:false,inert:false,textContent:'',style:{setProperty(){}},
      clientWidth:240,clientHeight:140,offsetHeight:180,value:0,
      setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k]??null;},
      removeAttribute(k){delete this.attributes[k];},
      addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);},
      append(...children){for(const child of children){child.parentElement=this;child.isConnected=true;this.children.push(child);}},
      replaceChildren(...children){for(const child of this.children)child.isConnected=false;this.children=[];this.append(...children);},
      contains(other){for(let at=other;at;at=at.parentElement)if(at===this)return true;return false;},
      closest(selectors){return selectors.split(',').some(s=>matches(this,s.trim()))?this:this.parentElement?.closest(selectors)||null;},
      querySelector(selector){return nodes.find(candidate=>candidate!==this&&this.contains(candidate)&&matches(candidate,selector))||null;},
      focus(){document.activeElement=this;},setPointerCapture(){},
      getBoundingClientRect(){return {left:10,right:830,top:10,bottom:610};},
      fire(type,extra){return dispatch(this,type,extra);}
    };
    let nodeOpen=false;
    Object.defineProperty(n,'open',{get:()=>nodeOpen,set(value){if(nodeOpen===!!value)return;nodeOpen=!!value;if(tag==='details')queuedToggles.add(n);}});
    n.click=()=>n.fire('click',{detail:0});
    for(const [key,value] of Object.entries(attrs)) {
      if(key==='id'){n.id=value;ids.set(value,n);}
      else if(key==='class')n.className=value;
      else if(key.startsWith('data-'))n.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
      else if(key==='hidden')n.hidden=true;
      else if(key==='inert')n.inert=true;
      else if(key==='open')n.open=true;
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
    const attr=selector.match(/^\[([\w-]+)(?:=([^\]]+))?\]$/);
    if(attr)return Object.hasOwn(n.attributes,attr[1])&&(attr[2]===undefined||n.attributes[attr[1]]===attr[2]);
    return n.tagName.toLowerCase()===selector;
  }
  const stack=[],voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const match of html.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/g)){
    const [,closing,tag,content]=match;
    if(closing){while(stack.length&&stack.pop().tagName.toLowerCase()!==tag){}continue;}
    const attrs={};
    for(const attr of content.matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[attr[1]]=attr[2]||'';
    const n=node(tag,attrs);if(stack.length){n.parentElement=stack.at(-1);stack.at(-1).children.push(n);}
    if(!voidTags.has(tag)&&!content.endsWith('/'))stack.push(n);
  }
  const $=selector=>nodes.find(n=>matches(n,selector))||null;
  document={body:$('body'),hidden:false,activeElement:$('body'),querySelector:$,
    querySelectorAll:selector=>nodes.filter(n=>matches(n,selector)),
    createElement:tag=>node(tag),createElementNS:(_,tag)=>node(tag),
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    fire(type,extra){return dispatch(this,type,extra);}};
  class NativeAudio{
    constructor(){this.paused=true;this.ended=false;this.readyState=0;this.events={};this.calls=[];audio.players.push(this);}
    setAttribute(){}addEventListener(type,fn){(this.events[type]||=[]).push(fn);}
    emit(type){for(const fn of this.events[type]||[])fn();}
    play(){
      this.calls.push(this.src);
      if(audio.policy==='block')return Promise.reject(Object.assign(Error('Gesture required'),{name:'NotAllowedError'}));
      if(audio.policy==='error')return Promise.reject(Object.assign(Error('Missing recording'),{name:'NotSupportedError'}));
      const play=()=>{this.paused=false;this.readyState=4;this.emit('playing');};
      if(audio.policy==='wait')return new Promise(resolve=>{this.finish=()=>{play();resolve();};});
      play();return Promise.resolve();
    }
    pause(){this.paused=true;this.emit('pause');}
  }
  class AudioContext{
    constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.sources=[];audio.contexts.push(this);}
    createGain(){return {connect(){},gain:{value:0,setTargetAtTime(value){this.value=value;}}};}
    resume(){
      if((audio.rainPolicy||audio.policy)==='block')return Promise.reject(Object.assign(Error('Gesture required'),{name:'NotAllowedError'}));
      this.state='running';this.onstatechange?.();return Promise.resolve();
    }
    close(){this.state='closed';return Promise.resolve();}
    decodeAudioData(){return Promise.resolve({duration:13.8});}
    createBufferSource(){const source={connect(){},start(){this.started=true;},stop(){this.stopped=true;},disconnect(){}};this.sources.push(source);return source;}
  }
  const window={FishingLife:{...Life,createSession:()=>Life.createSession(()=>.5)},AudioContext,location:{search:query},
    listeners:new Map(),addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);},
    fire(type,extra){return dispatch(this,type,extra);}};
  if(saved!==undefined)storage.set(Life.KEY,typeof saved==='string'?saved:Life.encodeProgress(saved));
  if(settings)storage.set('spriggan.fishing.settings.v1',JSON.stringify(settings));
  const localStorage={getItem(key){if(noStorage)throw Error('storage denied');return storage.get(key)||null;},
    setItem(key,value){if(noStorage)throw Error('storage denied');storage.set(key,value);writes.push({key,value});}};
  class FishingScene{constructor(){if(sceneFails)throw Error('no WebGL');}aimAt(){}update(){if(sceneUpdateFails)throw Error('render interrupted');}dispose(){}}
  const context=vm.createContext({window,document,localStorage,performance:{now:()=>now},URL,URLSearchParams,
    Audio:NativeAudio,navigator:{audioSession:{type:'auto'}},
    setTimeout:fn=>{audio.timers.set(++timerId,fn);return timerId;},clearTimeout:id=>audio.timers.delete(id),
    fetch:async url=>{audio.fetches.push(url);return {ok:!audio.fetchFails,arrayBuffer:async()=>new ArrayBuffer(1)};},
    matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}},
    requestAnimationFrame:fn=>{nextFrame=fn;},FishingScene,
    T:{WebGLRenderer:class{constructor(){throw Error('portrait fallback');}}},devicePixelRatio:1,console});
  vm.runInContext(fs.readFileSync(require.resolve('../../dist/pond/pond-rain-loop.js'),'utf8'),context,{filename:'pond-rain-loop.js'});
  vm.runInContext(fs.readFileSync(require.resolve('../../dist/pond/pond-audio.js'),'utf8'),context,{filename:'pond-audio.js'});
  if(!audioMissing)window.PondAudio=context.PondAudio;
  vm.runInContext(source,context,{filename:'fishing.js'});
  function drainToggles(){for(const target of Array.from(queuedToggles)){queuedToggles.delete(target);target.fire('toggle');}}
  function value(expression){return vm.runInContext(expression,context);}
  function tick(seconds=.05){drainToggles();now+=seconds*1000;nextFrame(now);}
  function advance(seconds){for(let left=seconds;left>1e-8;left-=.05)tick(Math.min(.05,left));}
  function click(selector){
    const button=typeof selector==='string'?$(selector):selector;assert(button,String(selector)+' exists');
    for(let at=button;at;at=at.parentElement){
      assert(!at.hidden&&!at.inert,String(selector)+' is visible and interactive');
      if(at.tagName==='DETAILS'&&!at.open)assert(at.querySelector('summary').contains(button),String(selector)+' is not inside a closed details group');
    }
    if(button.disabled)return;
    const down=button.fire('pointerdown');if(!down.defaultPrevented)button.focus();
    button.fire('pointerup');button.fire('lostpointercapture');const result=button.fire('click',{detail:1});
    if(button.tagName==='SUMMARY'&&!result.defaultPrevented)button.parentElement.open=!button.parentElement.open;
    drainToggles();return result;
  }
  function pointerDown(){return $('#fishing-action').fire('pointerdown');}
  function pointerUp(){const button=$('#fishing-action');button.fire('pointerup');button.fire('lostpointercapture');return button.fire('click',{detail:1});}
  function key(type,extra={}){return document.fire(type,{target:document.body,code:'Space',key:' ',...extra});}
  function reel(){click('#fishing-action');for(let n=0;n<200&&value('session.phase')!=='bite';n++)tick();assert.equal(value('session.phase'),'bite');click('#fishing-action');assert.equal(value('session.phase'),'reeling');}
  function openControls(){if(!$('#river-settings').open)click('#toggle-controls');}
  function closeControls(){if($('#river-settings').open)click('#close-fishing-controls');}
  function openSectionFor(selector){
    const ancestors=[];for(let at=$(selector).parentElement;at;at=at.parentElement)if(at.tagName==='DETAILS')ancestors.unshift(at);
    for(const details of ancestors)if(!details.open)click(details.querySelector('summary'));
  }
  return {$,document,window,storage,writes,context,value,tick,advance,click,pointerDown,pointerUp,key,reel,audio,openControls,closeControls,openSectionFor,drainToggles,
    flush:async()=>{drainToggles();await new Promise(resolve=>setImmediate(resolve));drainToggles();}};
}


module.exports={harness};
