const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Saves = require('../dist/shared/park-saves.js');

const SOURCE = fs.readFileSync(require.resolve('../dist/shared/park-session.js'),'utf8');
const CONFIG = {url:'https://garden.supabase.co',publishableKey:'sb_publishable_1234567890abcdefghijklmnop'};
const A = {id:'account-a',email:'lin@example.test'};
const B = {id:'account-b',email:'robin@example.test'};
const READY = {status:'ready',canPlay:true,dirty:false,user:A,revision:3};
const NEXT = 'spriggan.login.next.v1';
const deferred = () => {let resolve,reject;const promise = new Promise((ok,no) => {resolve=ok;reject=no;});return {promise,resolve,reject};};
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup(options={}) {
  const events = {document:new Map(),window:new Map()};
  const ids = new Map(), activated = [], emitted = [], pendingScripts = [], timers = new Map(), intervals = new Map();
  const calls = {create:[],initialize:0,signIn:0,signOut:0,start:[],changed:0,flush:0,check:0,stop:0,useCloud:0,keepLocal:0,fetch:[],replace:[],assign:[],reload:0,history:[],locks:[],released:0};
  const state = {user:options.user === undefined ? A : options.user,syncState:options.syncState||READY,provider:options.provider !== false,start:options.start,flush:options.flush,check:options.check,fetch:options.fetch,signIn:options.signIn,signOut:options.signOut};
  let document, syncOptions, authListener = () => {}, nextTimer=0;
  class Storage {
    constructor(initial={}) {this.values=new Map(Object.entries(initial));}
    getItem(key) {return this.values.get(String(key))??null;}
    setItem(key,value) {this.values.set(String(key),String(value));}
    removeItem(key) {this.values.delete(String(key));}
    clear() {this.values.clear();}
    key(index) {return [...this.values.keys()][index]??null;}
    get length() {return this.values.size;}
  }
  const storage = new Storage(options.data), sessionStorage = new Storage(options.session);
  function addEvent(map,type,listener) {if(!map.has(type))map.set(type,[]);map.get(type).push(listener);}
  function fire(map,event) {for(const listener of [...(map.get(event.type)||[])])listener(event);}
  function node(tag,attributes={}) {
    const attrs = new Map(Object.entries(attributes).map(([key,value]) => [key,String(value)]));
    const listeners = new Map();
    const result = {tagName:tag.toUpperCase(),hidden:attrs.has('hidden'),disabled:attrs.has('disabled'),textContent:'',innerHTML:'',children:[],dataset:{},inert:false,
      get attributes(){return [...attrs].map(([name,value]) => ({name,value}));},
      getAttribute:name=>attrs.get(name)??null,hasAttribute:name=>attrs.has(name),setAttribute(name,value){attrs.set(name,String(value));},
      addEventListener:(type,listener)=>addEvent(listeners,type,listener),
      append(...children){this.children.push(...children);},
      focus(){document.activeElement=this;this.focused=true;},
      async click(){if(this.disabled||this.hidden)return;for(const listener of listeners.get('click')||[])await listener({type:'click',target:this,currentTarget:this});},
      replaceWith(script) {
        activated.push(script);
        const index=activated.length-1;
        options.activate?.(script,index,{storage,document});
        if (script.getAttribute('src') || script.type==='module') {
          if (options.holdScripts?.includes(index)) pendingScripts.push(script);
          else queueMicrotask(()=>options.failScript===index ? script.onerror?.() : script.onload?.());
        }
      }};
    Object.defineProperty(result,'src',{get(){return attrs.get('src')||'';},set(value){attrs.set('src',value);}});
    if(attrs.has('id'))ids.set(attrs.get('id'),result);
    return result;
  }
  const login = options.login===true;
  const html = fs.readFileSync(require.resolve(login?'../dist/login/index.html':'../dist/index.html'),'utf8');
  for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    node(match[1],{id:match[3],...(/\bhidden\b/.test(match[2])?{hidden:''}:{}),...(/\bdisabled\b/.test(match[2])?{disabled:''}:{})});
  }
  const body=node('body');body.dataset.world=login?'login':options.world||'park';
  const sources=(options.scripts||[{src:'./world.js',nonce:'test-nonce'}]).map(spec=>{
    const {text='',...attributes}=spec;
    const result=node('script',{type:'application/x-spriggan',...attributes});result.textContent=text;return result;
  });
  let href=options.href||`https://spriggan.test/${login?'login/':''}`;
  const location = {get href(){return href;},get pathname(){return new URL(href).pathname;},get origin(){return new URL(href).origin;},
    replace(url){calls.replace.push(url);},assign(url){calls.assign.push(url);},reload(){calls.reload++;}};
  const history={replaceState(first,second,url){calls.history.push(url);href=url;}};
  document={readyState:options.loading?'loading':'complete',body,activeElement:body,hidden:false,
    documentElement:{dataset:{parkAuth:'loading'}},currentScript:{src:options.scriptURL||'https://spriggan.test/shared/park-session.js'},
    getElementById:id=>ids.get(id)||null,createElement:tag=>node(tag),querySelector:()=>null,
    querySelectorAll:selector=>selector==='script[type="application/x-spriggan"]'?sources:[],
    addEventListener:(type,listener)=>addEvent(events.document,type,listener),
    dispatchEvent(event){emitted.push(event);fire(events.document,event);return true;}};
  const sync = {
    async start(user){calls.start.push(user);return state.start?state.start(user,{storage,onState:syncOptions.onState}):state.syncState;},
    changed(){calls.changed++;},async flush(){calls.flush++;return state.flush?state.flush():state.syncState;},stop(){calls.stop++;},
    async check(){calls.check++;return state.check?state.check():state.syncState;},
    async useCloud(){calls.useCloud++;return READY;},async keepLocal(){calls.keepLocal++;return READY;}
  };
  const client={
    async initialize(){calls.initialize++;return state.user;},onAuthChange(listener){authListener=listener;return ()=>{};},
    getUser(){return state.user;},
    async signIn(){calls.signIn++;return state.signIn?.();},async signOut(){calls.signOut++;return state.signOut?.();}
  };
  const fetch=async(url,settings)=>{calls.fetch.push({url,settings});return state.fetch?state.fetch():{ok:true,json:async()=>({external:{google:state.provider}})};};
  const locks=options.locksMissing?undefined:{request(name,settings,callback){calls.locks.push({name,settings});return Promise.resolve().then(()=>callback(options.lockBusy?null:{name})).then(()=>{calls.released++;});}};
  const navigator={locks};
  const window={location,history,localStorage:storage,sessionStorage,navigator,fetch,
    SPRIGGAN_CLOUD_CONFIG:CONFIG,SprigganSaves:Saves,
    SprigganCloud:{validateConfig:config=>config,create(config,dependencies){calls.create.push({config,dependencies});return client;}},
    SprigganSync:{create(settings){syncOptions=settings;return sync;}},
    addEventListener:(type,listener)=>addEvent(events.window,type,listener)};
  if(options.storageBlocked)Object.defineProperty(window,'localStorage',{get(){throw Error('Blocked');}});
  class CustomEvent {constructor(type,settings={}){this.type=type;this.detail=settings.detail;}}
  const context=vm.createContext({window,document,location,history,navigator,sessionStorage,Storage,URL,URLSearchParams,Date,Set,Error,CustomEvent,AbortController,fetch,queueMicrotask,
    setTimeout(callback,delay){timers.set(++nextTimer,{callback,delay});return nextTimer;},clearTimeout(id){timers.delete(id);},
    setInterval(callback,delay){intervals.set(++nextTimer,{callback,delay});return nextTimer;},clearInterval(id){intervals.delete(id);}});
  vm.runInContext(SOURCE,context);
  return {calls,state,storage,sessionStorage,window,document,ids,activated,emitted,pendingScripts,sources,timers,intervals,
    get:id=>ids.get(id),click:id=>ids.get(id).click(),
    documentEvent(type,extra={}){fire(events.document,{type,...extra});},windowEvent(type,extra={}){fire(events.window,{type,...extra});},
    auth(user){state.user=user;authListener(user);},publish(value){state.syncState=value;syncOptions.onState(value);},remoteChange(){syncOptions.onRemoteChange();}};
}

test('an unauthenticated protected route redirects without hydrating or executing world scripts',async()=>{
  const h=setup({user:null,href:'https://spriggan.test/pond/'});await settle();
  assert.deepEqual(h.calls.replace,['https://spriggan.test/login/']);
  assert.equal(h.sessionStorage.getItem(NEXT),'/pond/');
  assert.equal(h.calls.start.length,0);assert.equal(h.activated.length,0);assert.equal(h.calls.fetch.length,0);
});

test('world activation waits for authenticated park hydration, including its local writes',async()=>{
  const hydration=deferred();
  const h=setup({start:async(user,{storage})=>{await hydration.promise;storage.setItem('spriggan.hex.moonlight','false');return READY;},
    activate(script,index,{storage}){assert.equal(storage.getItem('spriggan.hex.moonlight'),'false');}});
  await settle();assert.equal(h.calls.start.length,1);assert.equal(h.activated.length,0);assert.equal(h.calls.changed,0);
  hydration.resolve();await settle();
  assert.equal(h.activated.length,1);assert.equal(h.get('park-gate').hidden,true);assert.equal(h.document.documentElement.dataset.parkAuth,undefined);
  assert.equal(h.calls.changed,1,'only the post-activation capture marks a change');
});

test('identity changing during hydration cannot activate a park for the previous account',async()=>{
  const hydration=deferred();const h=setup({start:()=>hydration.promise});await settle();
  h.auth(B);hydration.resolve(READY);await settle();
  assert.equal(h.activated.length,0);assert.equal(h.get('park-gate').hidden,false);
  assert(h.calls.stop>=1);assert(h.calls.replace.includes('https://spriggan.test/login/'));
});

test('mount waits for DOM content before accessing route controls',async()=>{
  const h=setup({loading:true});await settle();assert.equal(h.calls.initialize,0);
  h.documentEvent('DOMContentLoaded');await settle();assert.equal(h.calls.initialize,1);assert.equal(h.activated.length,1);
});

test('Google sign-in is enabled only after a successful provider readiness response',async()=>{
  const settings=deferred();const h=setup({login:true,user:null,fetch:()=>settings.promise});await settle();
  assert.equal(h.get('login-google').disabled,true);assert.equal(h.activated.length,0);
  assert.equal(h.get('login-account').dataset.stage,'checking');
  assert.equal(h.get('login-account').getAttribute('aria-busy'),'true');
  settings.resolve({ok:true,json:async()=>({external:{google:true}})});await settle();
  assert.equal(h.get('login-google').disabled,false);assert.equal(h.get('login-account').getAttribute('aria-busy'),'false');
  assert.equal(h.get('login-account').dataset.stage,'ready');
  assert.equal(h.calls.fetch[0].settings.cache,'no-store');
  await h.click('login-google');assert.equal(h.calls.signIn,1);assert.equal(h.get('login-google').disabled,true);
});

test('verified login shows park loading instead of Google sign-in until hydration finishes',async()=>{
  const hydration=deferred();const h=setup({login:true,start:()=>hydration.promise});await settle();
  assert.equal(h.calls.start.length,1);assert.equal(h.get('login-google').hidden,true);
  assert.equal(h.get('login-account').dataset.stage,'opening');
  assert.equal(h.get('login-account').getAttribute('aria-busy'),'true');
  assert.match(h.get('login-status').textContent,/Opening your park/);
  assert.equal(h.calls.replace.length,0);assert.equal(h.activated.length,0);
  hydration.resolve(READY);await settle();assert.deepEqual(h.calls.replace,['https://spriggan.test/']);
});

test('a hydrated save choice ends loading and exposes the compact choice stage',async()=>{
  const hydration=deferred();const h=setup({login:true,start:()=>hydration.promise});await settle();
  assert.equal(h.get('login-account').getAttribute('aria-busy'),'true');
  hydration.resolve({status:'choice',canPlay:false,hasCloud:true});await settle();
  assert.equal(h.get('login-account').dataset.stage,'choice');
  assert.equal(h.get('login-account').getAttribute('aria-busy'),'false');
  assert.equal(h.get('login-choice').hidden,false);assert.equal(h.get('login-switch').hidden,false);
  assert.equal(h.get('login-google').hidden,true);assert.equal(h.calls.replace.length,0);
});

test('a failed initial park load leaves the error stage ready for retry or account switching',async()=>{
  for(const start of [
    async()=>{throw Object.assign(Error('Offline private details'),{code:'NETWORK'});},
    async()=>({status:'error',canPlay:false,error:{code:'NETWORK'}})
  ]) {
    const h=setup({login:true,start});await settle();
    assert.equal(h.get('login-account').dataset.stage,'error');
    assert.equal(h.get('login-account').getAttribute('aria-busy'),'false');
    assert.equal(h.get('login-google').hidden,true);assert.equal(h.get('login-retry').hidden,false);
    assert.equal(h.get('login-switch').hidden,false);assert.equal(h.get('login-switch').disabled,false);
    assert.doesNotMatch(h.get('login-status').textContent,/private details/);assert.equal(h.activated.length,0);
  }
});

test('a disabled provider offers retry while keeping sign-in and gameplay unavailable',async()=>{
  const h=setup({login:true,user:null,provider:false});await settle();
  assert.equal(h.get('login-google').disabled,true);assert.equal(h.get('login-retry').hidden,false);assert.equal(h.activated.length,0);
  h.state.provider=true;await h.click('login-retry');await settle();assert.equal(h.get('login-google').disabled,false);
});

test('provider connection failures keep sign-in disabled and reveal actionable retry',async()=>{
  const h=setup({login:true,user:null,fetch:async()=>{throw Error('Offline');}});await settle();
  assert.equal(h.get('login-google').disabled,true);assert.equal(h.get('login-retry').hidden,false);
  assert.match(h.get('login-status').textContent,/connection.*try again/i);assert.equal(h.activated.length,0);
});

test('OAuth denial clears callback errors and leaves a retryable Google sign-in screen',async()=>{
  const h=setup({login:true,user:null,href:'https://spriggan.test/login/?error=access_denied&error_description=Private#state=private'});await settle();
  assert.match(h.get('login-status').textContent,/cancelled/);
  assert.deepEqual(h.calls.history,['https://spriggan.test/login/']);assert.equal(h.get('login-google').disabled,false);
});

test('a park-choice state is shown on the login route and uses the selected sync operation',async()=>{
  for(const [button,method] of [['login-use-cloud','useCloud'],['login-use-local','keepLocal']]) {
    const h=setup({login:true,syncState:{status:'choice',canPlay:false}});await settle();
    assert.equal(h.get('login-choice').hidden,false);assert.equal(h.get('login-google').hidden,true);
    assert.equal(h.get('login-choice-title').focused,true);assert.equal(h.activated.length,0);
    await h.click(button);await settle();assert.equal(h.calls[method],1);
    assert.deepEqual(h.calls.replace,['https://spriggan.test/']);assert.equal(h.activated.length,0);
  }
});

test('the account-switch escape appears only after a verified login, including park-load failures',async()=>{
  const guest=setup({login:true,user:null});await settle();assert.equal(guest.get('login-switch').hidden,true);
  const choosing=setup({login:true,syncState:{status:'choice',canPlay:false}});await settle();assert.equal(choosing.get('login-switch').hidden,false);
  const failed=setup({login:true,start:async()=>{throw Object.assign(Error('Offline'),{code:'NETWORK'});}});await settle();
  assert.equal(failed.get('login-switch').hidden,false);assert.equal(failed.get('login-retry').hidden,false);assert.equal(failed.activated.length,0);
});

test('switching Google accounts signs out before returning to login and preserves browser progress',async()=>{
  const signedOut=deferred();const data={'spriggan.hex.moonlight':'true','unrelated.preferences':'kept'};
  const h=setup({login:true,data,syncState:{status:'choice',canPlay:false},signOut:()=>signedOut.promise});await settle();
  const switching=h.click('login-switch');await settle();
  assert.equal(h.get('login-switch').disabled,true);assert.equal(h.get('login-use-cloud').disabled,true);assert.equal(h.get('login-use-local').disabled,true);
  assert.equal(h.calls.signOut,1);assert.equal(h.calls.stop,1);assert.equal(h.calls.replace.length,0);
  assert.deepEqual(Object.fromEntries(h.storage.values),data);assert.equal(h.calls.useCloud+h.calls.keepLocal,0);
  signedOut.resolve();await switching;assert.deepEqual(h.calls.replace,['https://spriggan.test/login/']);
  assert.deepEqual(Object.fromEntries(h.storage.values),data);
});

test('a failed account switch exposes a recovery action without enabling stopped park choices',async()=>{
  const h=setup({login:true,syncState:{status:'choice',canPlay:false},signOut:async()=>{throw Error('Offline');}});await settle();
  await h.click('login-switch');assert.equal(h.get('login-switch').disabled,false);
  assert.equal(h.get('login-use-cloud').disabled,true);assert.equal(h.get('login-use-local').disabled,true);assert.equal(h.get('login-retry').hidden,false);
  assert.match(h.get('login-status').textContent,/Sign-out could not finish/);assert.equal(h.calls.replace.length,0);
  await h.click('login-retry');assert.equal(h.calls.reload,1);
});

test('a new account choice describes starting a park instead of implying a saved account park exists',async()=>{
  const h=setup({login:true,syncState:{status:'choice',canPlay:false,hasCloud:false}});await settle();
  assert.equal(h.get('login-use-cloud').textContent,'Start a new park');assert.match(h.get('login-choice-copy').textContent,/start a new park/);
  assert.doesNotMatch(h.get('login-choice-copy').textContent,/park already saved/);
});

test('a changed choice asks for fresh review and includes a valid account-save date when available',async()=>{
  for(const reason of ['REMOTE_CHANGED_AGAIN','LOCAL_CHANGED_AGAIN']) {
    const h=setup({login:true,syncState:{status:'conflict',canPlay:false,hasCloud:true,reason,cloudUpdatedAt:'2026-11-19T12:00:00.000Z'}});await settle();
    assert.match(h.get('login-choice-copy').textContent,/changed while you were choosing/);
    assert.match(h.get('login-choice-copy').textContent,/account’s park was saved/);assert.doesNotMatch(h.get('login-choice-copy').textContent,/Invalid Date|undefined/);
    assert.equal(h.get('login-use-cloud').textContent,'Open my account’s park');
  }
});

test('a protected route sends initial park choices to login before executing any world script',async()=>{
  const h=setup({syncState:{status:'conflict',canPlay:false},href:'https://spriggan.test/fishing/'});await settle();
  assert.deepEqual(h.calls.replace,['https://spriggan.test/login/']);assert.equal(h.activated.length,0);
  assert.equal(h.sessionStorage.getItem(NEXT),'/fishing/');
});

test('activation preserves source attributes and executes external, inline and module scripts in order',async()=>{
  const h=setup({scripts:[
    {src:'./one.js',nonce:'nonce-1',integrity:'sha384-asset',crossorigin:'anonymous','data-world':'pond'},
    {text:'window.inlineStarted = true;','data-inline':'yes'},
    {text:'export const ready = true;','data-park-type':'module'},
    {src:'./four.js','data-park-type':'module'}
  ],holdScripts:[0,2]});
  await settle();assert.equal(h.activated.length,1,'the first dependency must finish before any later script');
  const first=h.activated[0];assert.equal(first.async,false);assert.equal(first.getAttribute('nonce'),'nonce-1');
  assert.equal(first.getAttribute('integrity'),'sha384-asset');assert.equal(first.getAttribute('crossorigin'),'anonymous');assert.equal(first.getAttribute('data-world'),'pond');
  assert.equal(first.getAttribute('type'),null);assert.equal(first.getAttribute('data-park-type'),null);
  first.onload();await settle();assert.equal(h.activated.length,3);
  assert.equal(h.activated[1].textContent,'window.inlineStarted = true;');assert.equal(h.activated[1].getAttribute('data-inline'),'yes');
  assert.equal(h.activated[2].type,'module');assert.equal(h.get('park-gate').hidden,false);
  h.activated[2].onload();await settle();assert.equal(h.activated.length,4);assert.equal(h.activated[3].type,'module');assert.equal(h.get('park-gate').hidden,true);
});

test('a failed world dependency keeps the gate visible and freezes partially started gameplay',async()=>{
  const h=setup({scripts:[{src:'./one.js'},{src:'./broken.js'},{src:'./must-not-run.js'}],failScript:1});await settle();
  assert.equal(h.activated.length,2);assert.equal(h.get('park-gate').hidden,false);assert.equal(h.get('park-gate-retry').hidden,false);
  assert.equal(h.document.documentElement.dataset.parkAuth,'loading');assert(h.calls.stop>=1);
  assert.throws(()=>h.storage.setItem('spriggan.hex.moonlight','true'),/paused/);
});

test('missing Web Locks fails closed without initializing identity or gameplay',async()=>{
  const h=setup({locksMissing:true});await settle();assert.equal(h.calls.initialize,0);assert.equal(h.activated.length,0);
  assert.match(h.get('park-gate-copy').textContent,/up-to-date browser/);
});

test('another active tab prevents identity and world initialization until retry',async()=>{
  const h=setup({lockBusy:true});await settle();assert.equal(h.calls.initialize,0);assert.equal(h.activated.length,0);
  assert.equal(h.calls.locks[0].settings.ifAvailable,true);assert.match(h.get('park-gate-copy').textContent,/another tab/);
  await h.click('park-gate-retry');assert.equal(h.calls.reload,1);
});

test('a blocked storage probe never initializes auth, sync or gameplay',async()=>{
  const h=setup({storageBlocked:true});await settle();assert.equal(h.calls.create.length,0);assert.equal(h.calls.start.length,0);assert.equal(h.activated.length,0);
  assert.equal(h.get('park-gate-retry').hidden,false);
});

test('return navigation accepts only recognized same-origin park routes and strips query or hash values',async()=>{
  const cases=[
    ['/pond/','/pond/'],['/fishing/index.html','/fishing/index.html'],['/','/'],
    ['/claw/?code=private#extra','/claw/'],['https://other.test/pond/','/'],['//other.test/fishing/','/'],
    ['/login/','/'],['/private/','/'],['javascript:alert(1)','/'],['/pond/%2fother/','/']
  ];
  for(const [input,expected] of cases) {
    const h=setup({login:true,session:{[NEXT]:input}});await settle();assert.deepEqual(h.calls.replace,['https://spriggan.test'+expected],input);
    assert.equal(h.sessionStorage.getItem(NEXT),null);assert.equal(h.activated.length,0);
  }
});

test('subdirectory deployments keep login and whitelisted return paths inside their app root',async()=>{
  const h=setup({login:true,href:'https://spriggan.test/garden/login/',scriptURL:'https://spriggan.test/garden/shared/park-session.js',session:{[NEXT]:'/pond/'}});await settle();
  assert.deepEqual(h.calls.replace,['https://spriggan.test/garden/']);
  assert.equal(h.calls.create[0].dependencies.redirectTo,'https://spriggan.test/garden/');
});

test('only supported game writes after activation mark progress dirty',async()=>{
  const h=setup();await settle();const baseline=h.calls.changed;
  h.storage.setItem('spriggan.hex.moonlight','true');assert.equal(h.calls.changed,baseline+1);
  h.storage.removeItem('spriggan.hex.moonlight');assert.equal(h.calls.changed,baseline+2);
  for(const key of ['spriggan.cloud.garden.supabase.co.auth.v1','spriggan.sync.v1','spriggan.sync.park.account-a.v1','unrelated.preferences'])h.storage.setItem(key,'metadata');
  h.sessionStorage.setItem('spriggan.hex.moonlight','true');assert.equal(h.calls.changed,baseline+2);
  h.storage.clear();assert.equal(h.calls.changed,baseline+3);
});

test('an account change pauses and redirects active gameplay instead of restoring into its running world',async()=>{
  const h=setup();await settle();const started=h.calls.start.length;
  h.auth(B);await settle();assert.equal(h.calls.start.length,started);assert(h.calls.stop>=1);assert.equal(h.document.body.inert,true);
  assert.deepEqual(h.calls.replace,['https://spriggan.test/login/']);
  assert.throws(()=>h.storage.setItem('spriggan.hex.moonlight','true'),/paused/);
});

test('refreshing the same account identity does not interrupt gameplay or restart hydration',async()=>{
  const h=setup();await settle();h.auth({...A,name:'Updated name'});await settle();
  assert.equal(h.calls.start.length,1);assert.equal(h.calls.stop,0);assert.equal(h.calls.replace.length,0);
  h.storage.setItem('spriggan.hex.moonlight','true');assert.equal(h.storage.getItem('spriggan.hex.moonlight'),'true');
});

test('an account change during script loading aborts remaining activation and never uncovers the park',async()=>{
  const h=setup({scripts:[{src:'./slow-world.js'},{src:'./must-not-run.js'}],holdScripts:[0]});await settle();
  assert.equal(h.activated.length,1);h.auth(B);h.activated[0].onload();await settle();
  assert.equal(h.activated.length,1);assert.equal(h.get('park-gate').hidden,false);assert.equal(h.document.documentElement.dataset.parkAuth,'loading');
  assert.deepEqual(h.calls.replace,['https://spriggan.test/login/']);
});

test('a runtime remote replacement freezes current game state and reloads before any reactivation',async()=>{
  const h=setup();await settle();h.remoteChange();
  assert.equal(h.calls.reload,1);assert.equal(h.calls.start.length,1);assert(h.calls.stop>=1);assert.equal(h.document.body.inert,true);
  assert.throws(()=>h.storage.removeItem('spriggan.hex.moonlight'),/paused/);
});

test('a runtime conflict pauses play and routes the decision through login',async()=>{
  const h=setup();await settle();h.publish({status:'conflict',canPlay:false});
  assert(h.calls.stop>=1);assert.equal(h.document.body.inert,true);assert.deepEqual(h.calls.replace,['https://spriggan.test/login/']);
});

test('fatal runtime sync errors retain the retry gate and block game writes',async()=>{
  const h=setup();await settle();h.publish({status:'error',canPlay:false,error:{code:'STORAGE_WRITE'}});
  assert.equal(h.get('park-gate').hidden,false);assert.equal(h.get('park-gate-retry').hidden,false);assert(h.calls.stop>=1);
  assert.match(h.get('park-gate-copy').textContent,/browser cannot save/);
  assert.throws(()=>h.storage.setItem('spriggan.hex.moonlight','true'),/paused/);
});

test('pagehide captures final progress, releases the exclusive lock and freezes further game writes',async()=>{
  const h=setup();await settle();const captures=h.emitted.filter(event=>event.type==='spriggan:park-save-request').length;
  h.windowEvent('pagehide');await settle();
  assert(h.emitted.filter(event=>event.type==='spriggan:park-save-request').length>captures);assert(h.calls.stop>=1);assert.equal(h.calls.released,1);
  assert.throws(()=>h.storage.setItem('spriggan.hex.moonlight','true'),/paused/);
  h.windowEvent('pageshow',{persisted:true});assert.equal(h.calls.reload,1);
});

test('in-app world navigation waits for a final flush before leaving',async()=>{
  const saved=deferred();const h=setup({flush:()=>saved.promise});await settle();
  let prevented=false;
  const anchor={href:'https://spriggan.test/pond/',target:'',hasAttribute:()=>false};
  h.documentEvent('click',{target:{closest:()=>anchor},button:0,preventDefault(){prevented=true;}});
  await settle();assert.equal(prevented,true);assert.equal(h.calls.flush,1);assert.equal(h.calls.assign.length,0);
  saved.resolve(READY);await settle();assert.deepEqual(h.calls.assign,['https://spriggan.test/pond/']);
});

test('slow-cloud navigation continues after 1500ms while preserving pending device progress',async()=>{
  const saved=deferred();
  const data={
    'spriggan.hex.moonlight':'true',
    'spriggan.sync.v1':JSON.stringify({version:1,userId:A.id,revision:3,baseFingerprint:'saved-park',binding:'this-device',pending:true})
  };
  const h=setup({data,syncState:{...READY,status:'pending',dirty:true},flush:()=>saved.promise});await settle();
  const anchor={href:'https://spriggan.test/fishing/',target:'',hasAttribute:()=>false};
  h.documentEvent('click',{target:{closest:()=>anchor},button:0,preventDefault(){}});await settle();
  assert.equal(h.calls.flush,1);assert.equal(h.calls.assign.length,0);
  const deadline=[...h.timers].find(([,timer])=>timer.delay===1500);assert(deadline,'navigation must have a bounded wait');
  deadline[1].callback();await settle();
  assert.deepEqual(h.calls.assign,['https://spriggan.test/fishing/']);assert.equal(h.timers.has(deadline[0]),false);
  assert.deepEqual(Object.fromEntries(h.storage.values),data,'pending park and owner/revision metadata remain available to the next world');
  saved.resolve(READY);await settle();assert.equal(h.calls.assign.length,1,'a late cloud response must not navigate twice');
});

test('retry captures local progress and checks the account revision before attempting an upload',async()=>{
  const checked=deferred();const h=setup({check:()=>checked.promise});await settle();const baseline=h.calls.changed;
  const retry=h.window.SprigganAccount.retry();await settle();
  assert.equal(h.calls.changed,baseline+1);assert.equal(h.calls.check,1);assert.equal(h.calls.flush,0);
  checked.resolve({...READY,status:'pending',dirty:true});await retry;assert.equal(h.calls.flush,1);
});

test('retry never uploads after a revision check returns conflict or a clean account park',async()=>{
  for(const checked of [READY,{status:'conflict',canPlay:false,dirty:true}]) {
    const h=setup({check:async()=>checked});await settle();await h.window.SprigganAccount.retry();
    assert.equal(h.calls.check,1);assert.equal(h.calls.flush,0);
  }
});

test('sign-out waits for final progress capture and flush before clearing the session',async()=>{
  const saved=deferred();const h=setup({flush:()=>saved.promise});await settle();
  const result=h.window.SprigganAccount.signOut();await settle();assert.equal(h.calls.signOut,0);assert.equal(h.calls.flush,1);
  saved.resolve(READY);await result;assert.equal(h.calls.signOut,1);assert(h.calls.stop>=1);assert.deepEqual(h.calls.replace,['https://spriggan.test/login/']);
});
