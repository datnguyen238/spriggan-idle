const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Saves = require('../dist/shared/park-saves.js');
const Cloud = require('../dist/shared/park-cloud.js');

const CONFIG={url:'https://garden.supabase.co',publishableKey:'sb_publishable_1234567890abcdefghijklmnop'};
const A={id:'user-a',email:'a@example.test',name:'Lin'},B={id:'user-b',email:'b@example.test',name:'Robin'};
const WHEN='2026-11-19T12:00:00.000Z',RECOVERY='spriggan.cloud.recovery.v1';
const pack=entries=>JSON.stringify({format:'spriggan-park',version:1,exportedAt:WHEN,entries});
const remote=(revision=4,entries={'spriggan.hex.moonlight':'false'})=>({backup:pack(entries),revision,updatedAt:WHEN});
const local=()=>({'spriggan.hex.moonlight':'true','spriggan.hex.totals.v1':JSON.stringify({shooed:10,snacks:2,storeys:3}),'unrelated.keep':'keep-me'});
const failure=(code,message)=>Object.assign(new Error(message),{code});
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function setup(options={}) {
  const ids=new Map(),documentEvents=new Map(),windowEvents=new Map(),emitted=[],writes=[];
  let document;
  const isHidden = value => {for(let at=value;at;at=at.parentElement)if(at.hidden)return true;return false;};
  const values=new Map(Object.entries(options.data||local()));
  const state={user:options.user||null,cloud:options.cloud===undefined?null:options.cloud,read:null,write:null,rejectRecovery:false,googleReady:options.googleReady!==false,settings:options.settings||null,afterSet:null};
  const calls={initialize:0,read:0,write:[],signIn:0,signOut:0,create:[],history:[],settings:[]};
  const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(state.rejectRecovery&&key===RECOVERY)throw Error('quota');writes.push([key,String(value)]);values.set(key,String(value));state.afterSet?.(key,String(value));},removeItem(key){writes.push([key,null]);values.delete(key);}};
  function node(tag,id,attributes='') {
    const handlers=new Map();
    const value={id,tagName:tag.toUpperCase(),textContent:'',hidden:/\bhidden\b/.test(attributes),disabled:/\bdisabled\b/.test(attributes),attributes:{},children:[],parentElement:null,
      setAttribute(name,val){this.attributes[name]=String(val);},getAttribute(name){return this.attributes[name]??null;},
      addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},
      async fire(type,extra={}){for(const fn of handlers.get(type)||[])await fn({target:this,currentTarget:this,...extra});},
      async click(){if(!this.disabled&&!isHidden(this)){this.focus();await this.fire('click');}},
      focus(){if(!this.disabled&&!isHidden(this)){this.focused=true;document.activeElement=this;}},blur(){if(document.activeElement===this)document.activeElement=document.body;},
      contains(other){for(let at=other;at;at=at.parentElement)if(at===this)return true;return false;},
      scrollIntoView(){this.scrolled=true;},append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}},remove(){this.removed=true;}};
    ids.set(id,value);return value;
  }
  const html=fs.readFileSync(require.resolve('../dist/index.html'),'utf8');
  for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi))node(match[1],match[3],match[2]);
  const body=node('body','test-body');
  const children=(parent,names)=>ids.get(parent).append(...names.map(name=>ids.get(name)));
  children('park-account-guest',['park-account-google']);
  children('park-account-member',['park-account-name','park-account-cloud-date','park-account-save','park-account-load','park-account-signout']);
  children('park-account-confirmation',['park-account-confirm-title','park-account-confirm-summary','park-account-close-tabs','park-account-confirm','park-account-cancel']);
  children('park-account',['park-account-title','park-account-copy','park-account-guest','park-account-member','park-account-retry','park-account-confirmation','park-account-status','park-account-recovery']);
  children('park-memory',['park-account']);body.append(ids.get('park-memory'),ids.get('park-memory-toggle'));
  ids.get('park-memory').hidden=options.panelHidden===true;
  const add=(events,type,fn)=>{if(!events.has(type))events.set(type,[]);events.get(type).push(fn);};
  const fire=(events,event)=>{for(const listener of events.get(event.type)||[])listener(event);};
  document={readyState:'complete',body,activeElement:body,baseURI:'https://spriggan.test/',currentScript:{src:'https://spriggan.test/shared/park-account.js'},
    querySelector:selector=>ids.get(selector.slice(1))||null,getElementById:id=>ids.get(id)||null,head:{append(){}},
    createElement:tag=>node(tag,'new-'+ids.size),addEventListener:(type,fn)=>add(documentEvents,type,fn),
    dispatchEvent(event){emitted.push(event.type);fire(documentEvents,event);return true;}};
  let authListener=()=>{};
  const client={
    async initialize(){calls.initialize++;return state.user;},onAuthChange(listener){authListener=listener;return ()=>{};},
    async read(){calls.read++;if(state.read)return state.read();return state.cloud;},
    async write(backup,expectedRevision){calls.write.push({backup,expectedRevision});if(state.write)return state.write(backup,expectedRevision);const result={revision:(expectedRevision||0)+1,updatedAt:WHEN};state.cloud={backup,...result};return result;},
    async signIn(){calls.signIn++;},async signOut(){calls.signOut++;state.user=null;authListener(null);}
  };
  const window={location:{href:options.href||'https://spriggan.test/'},localStorage:storage,SPRIGGAN_CLOUD_CONFIG:options.config===undefined?CONFIG:options.config,
    async fetch(url,settings){calls.settings.push({url,settings});if(state.settings)return state.settings();return {ok:true,json:async()=>({external:{google:state.googleReady}})};},
    supabase:{createClient(){}},SprigganSaves:Saves,SprigganCloud:{validateConfig:Cloud.validateConfig,create(config,dependencies){calls.create.push({config,dependencies});return client;}},
    history:{replaceState(a,b,url){calls.history.push(url);window.location.href=url;}},addEventListener:(type,fn)=>add(windowEvents,type,fn)};
  if(options.storageBlocked)Object.defineProperty(window,'localStorage',{get(){throw Error('storage blocked private details');}});
  ids.get('park-memory-toggle').addEventListener('click',()=>{ids.get('park-memory').hidden=!ids.get('park-memory').hidden;});
  class CustomEvent {constructor(type){this.type=type;}}
  vm.runInContext(fs.readFileSync(require.resolve('../dist/shared/park-account.js'),'utf8'),vm.createContext({window,document,URL,URLSearchParams,Date,Intl,CustomEvent,AbortController,setTimeout,clearTimeout}));
  return {ids,state,calls,values,writes,storage,emitted,window,document,isHidden,
    get:id=>ids.get('park-account-'+id),click:id=>ids.get('park-account-'+id).click(),
    auth(user,cloud=state.cloud){state.user=user;state.cloud=cloud;authListener(user);},
    documentEvent:type=>document.dispatchEvent(new CustomEvent(type)),windowEvent:(type,event={})=>fire(windowEvents,{type,...event})};
}

test('a guest can sign in with Google without uploading or changing any local game records',async()=>{
  const h=setup();await settle();
  assert.equal(h.get('guest').hidden,false);assert.equal(h.get('member').hidden,true);assert.equal(h.get('google').disabled,false);
  assert.equal(h.calls.read,0);assert.equal(h.calls.write.length,0);assert.equal(h.writes.length,0);
  await h.click('google');assert.equal(h.calls.signIn,1);assert.equal(h.writes.length,0);assert.equal(h.calls.write.length,0);
  h.auth(A,remote());await settle();assert.equal(h.calls.read,1);assert.equal(h.calls.write.length,0);assert.deepEqual(Object.fromEntries(h.values),local());
});

test('unconfigured cloud stays optional and does not initialize an SDK or touch browser progress',async()=>{
  const h=setup({config:{url:'',publishableKey:''}});await settle();
  assert.equal(h.calls.create.length,0);assert.equal(h.get('google').disabled,true);assert.match(h.get('copy').textContent,/saving in this browser/);
  assert.equal(h.writes.length,0);assert.equal(h.get('member').hidden,true);
});

test('signed-in initialization reads the cloud but never restores or replaces it automatically',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();
  assert.equal(h.get('guest').hidden,true);assert.equal(h.get('member').hidden,false);assert.equal(h.get('name').textContent,A.email);
  assert.equal(h.get('save').disabled,false);assert.equal(h.get('load').disabled,false);assert.equal(h.get('confirmation').hidden,true);
  assert.equal(h.calls.write.length,0);assert.equal(h.writes.length,0);assert.deepEqual(Object.fromEntries(h.values),local());
  assert.equal(h.calls.create[0].dependencies.redirectTo,'https://spriggan.test/');
});

test('an account with no cloud copy can create one without overwriting local progress',async()=>{
  const h=setup({user:A});await settle();assert.equal(h.get('save').disabled,false);assert.equal(h.get('load').disabled,true);
  await h.click('save');assert.equal(h.calls.write.length,1);assert.equal(h.calls.write[0].expectedRevision,null);
  assert.deepEqual(Saves.inspectBackup(h.calls.write[0].backup).entries,{'spriggan.hex.moonlight':'true','spriggan.hex.totals.v1':local()['spriggan.hex.totals.v1']});
  assert.equal(h.writes.length,0);assert.match(h.get('status').textContent,/Saved to your account/);
});

test('loading requires inline review and keeps a full recovery copy before whole-park replacement',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();await h.click('load');
  assert.equal(h.get('confirmation').hidden,false);assert.equal(h.get('confirm').focused,true);assert.match(h.get('confirm-summary').textContent,/whole park/);
  assert.equal(h.writes.length,0);await h.click('confirm');
  const recovery=JSON.parse(h.values.get(RECOVERY));assert.equal(recovery.version,1);
  assert.deepEqual(Saves.inspectBackup(recovery.backup).entries,{'spriggan.hex.moonlight':'true','spriggan.hex.totals.v1':local()['spriggan.hex.totals.v1']});
  assert.equal(h.writes[0][0],RECOVERY);assert.equal(h.values.get('spriggan.hex.moonlight'),'false');
  assert.equal(h.values.has('spriggan.hex.totals.v1'),false);assert.equal(h.values.get('unrelated.keep'),'keep-me');
  assert.equal(h.get('recovery').hidden,false);assert.equal(h.get('confirmation').hidden,true);assert(h.emitted.includes('spriggan:park-restored'));
});

test('canceling either a cloud load or overwrite preserves both parks',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();
  for(const action of ['load','save']){await h.click(action);assert.equal(h.get('confirmation').hidden,false);await h.click('cancel');await h.click('confirm');}
  assert.equal(h.writes.length,0);assert.equal(h.calls.write.length,0);assert.deepEqual(Object.fromEntries(h.values),local());
});

test('replacing an existing cloud copy requires confirmation and sends its expected revision',async()=>{
  const h=setup({user:A,cloud:remote(7)});await settle();await h.click('save');
  assert.equal(h.calls.write.length,0);assert.equal(h.get('close-tabs').hidden,true);assert.match(h.get('confirm-title').textContent,/Replace your cloud/);
  await h.click('confirm');assert.equal(h.calls.write.length,1);assert.equal(h.calls.write[0].expectedRevision,7);
  assert.equal(h.writes.length,0);assert.equal(h.get('confirmation').hidden,true);
});

test('a failed revision check refreshes cloud metadata and requires fresh confirmation',async()=>{
  const h=setup({user:A,cloud:remote(7)});await settle();await h.click('save');
  h.state.write=()=>{h.state.cloud=remote(9);throw failure('SAVE_CONFLICT','Cloud changed.');};await h.click('confirm');
  assert.match(h.get('status').textContent,/another device/);assert.equal(h.get('confirmation').hidden,true);assert.equal(h.calls.read,2);
  h.state.write=null;await h.click('save');assert.equal(h.calls.write.length,1);await h.click('confirm');
  assert.equal(h.calls.write[1].expectedRevision,9);assert.equal(h.writes.length,0);
});

test('a changed cloud revision blocks loading the old preview and keeps all local records',async()=>{
  const h=setup({user:A,cloud:remote(7)});await settle();await h.click('load');h.state.cloud=remote(8);
  await h.click('confirm');assert.equal(h.writes.length,0);assert.match(h.get('status').textContent,/cloud copy changed/);
  assert.equal(h.get('confirmation').hidden,true);assert.deepEqual(Object.fromEntries(h.values),local());
});

test('a same-tab local change invalidates both destructive previews before any recovery or upload',async()=>{
  for(const action of ['load','save']) {
    const h=setup({user:A,cloud:remote()});await settle();await h.click(action);
    h.storage.setItem('spriggan.hex.moonlight','false');h.writes.length=0;await h.click('confirm');
    assert.equal(h.writes.length,0);assert.equal(h.calls.write.length,0);assert.match(h.get('status').textContent,/browser park changed/);
    assert.equal(h.get('confirmation').hidden,true);assert.equal(h.values.has(RECOVERY),false);
  }
});

test('other-tab changes and closing the park panel cancel a pending preview',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();await h.click('load');
  h.windowEvent('storage',{key:'spriggan.hex.moonlight'});assert.equal(h.get('confirmation').hidden,true);await h.click('confirm');
  await h.click('save');h.documentEvent('spriggan:park-panel-closed');assert.equal(h.get('confirmation').hidden,true);await h.click('confirm');
  assert.equal(h.writes.length,0);assert.equal(h.calls.write.length,0);
});

test('a Google account switch invalidates a pending preview and a late cloud-load result',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();await h.click('load');
  const wait=deferred();h.state.read=()=>wait.promise;const restoring=h.click('confirm');
  await settle();h.state.read=null;h.auth(B,remote(12));await settle();
  wait.resolve(remote());await restoring;assert.equal(h.writes.length,0);assert.equal(h.get('name').textContent,B.email);
  assert.equal(h.get('confirmation').hidden,true);assert.deepEqual(Object.fromEntries(h.values),local());
});

test('local progress made while the final cloud check is pending cannot be overwritten',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();await h.click('load');
  const wait=deferred();h.state.read=()=>wait.promise;const restoring=h.click('confirm');await settle();
  const fresh=JSON.stringify({shooed:11,snacks:3,storeys:4});h.storage.setItem('spriggan.hex.totals.v1',fresh);h.writes.length=0;
  wait.resolve(remote());await restoring;
  assert.equal(h.values.get('spriggan.hex.totals.v1'),fresh);assert.equal(h.writes.length,0);assert.equal(h.values.has(RECOVERY),false);
  assert.match(h.get('status').textContent,/browser park changed/);assert.equal(h.get('confirmation').hidden,true);
});

test('a previous local park can be restored from recovery without writing to the cloud',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();await h.click('load');await h.click('confirm');
  await h.click('recovery');assert.match(h.get('confirm-title').textContent,/previous browser park/);await h.click('confirm');
  assert.equal(h.values.get('spriggan.hex.moonlight'),'true');assert.equal(h.values.get('spriggan.hex.totals.v1'),local()['spriggan.hex.totals.v1']);
  assert.equal(h.calls.write.length,0);assert.match(h.get('status').textContent,/cloud copy is unchanged/);
  assert.deepEqual(Saves.inspectBackup(JSON.parse(h.values.get(RECOVERY)).backup).entries,{'spriggan.hex.moonlight':'false'});
});

test('a cloud load cannot replace progress if the required recovery copy cannot be saved',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();await h.click('load');h.state.rejectRecovery=true;
  await h.click('confirm');assert.equal(h.writes.length,0);assert.deepEqual(Object.fromEntries(h.values),local());
  assert.match(h.get('status').textContent,/recovery copy/);assert.equal(h.get('retry').hidden,false);
});

test('signing out preserves local gameplay and prevents an old preview from being applied',async()=>{
  const h=setup({user:A,cloud:remote()});await settle();await h.click('load');await h.click('signout');await h.click('confirm');
  assert.equal(h.calls.signOut,1);assert.equal(h.get('guest').hidden,false);assert.equal(h.get('member').hidden,true);
  assert.equal(h.writes.length,0);assert.deepEqual(Object.fromEntries(h.values),local());assert.match(h.get('status').textContent,/park stays/);
});

test('a network failure offers retry and successful retry clears the stale error',async()=>{
  const h=setup({user:A,cloud:remote()});h.state.read=()=>{throw failure('NETWORK','Cloud saves could not be reached. Check your connection and try again.');};
  await settle();assert.match(h.get('status').textContent,/could not be reached/);assert.equal(h.get('retry').hidden,false);assert.equal(h.get('save').disabled,true);
  h.state.read=null;await h.click('retry');assert.equal(h.get('retry').hidden,true);assert.equal(h.get('save').disabled,false);
  assert(!/could not be reached/.test(h.get('status').textContent));assert.equal(h.writes.length,0);
});

test('retrying an uncertain upload refreshes cloud state and never uploads again without another choice',async()=>{
  const h=setup({user:A});await settle();h.state.write=(backup,revision)=>{
    h.state.cloud={backup,revision:1,updatedAt:WHEN};throw failure('NETWORK','The response was interrupted. Try again.');
  };
  await h.click('save');assert.equal(h.calls.write.length,1);assert.equal(h.get('retry').hidden,false);
  await h.click('retry');assert.equal(h.calls.write.length,1);assert.equal(h.get('load').disabled,false);
  await h.click('save');assert.equal(h.get('confirmation').hidden,false);assert.equal(h.calls.write.length,1);
  assert.equal(h.writes.length,0);
});

test('an OAuth denial opens the account controls without exposing callback details',async()=>{
  const h=setup({panelHidden:true,href:'https://spriggan.test/?error=access_denied&error_description=private-provider-detail'});await settle();
  assert.equal(h.ids.get('park-memory').hidden,false);assert.equal(h.ids.get('park-account').scrolled,true);
  assert.equal(new URL(h.window.location.href).search,'');assert(!h.get('status').textContent.includes('private-provider-detail'));
  assert.match(h.get('status').textContent,/wasn’t completed/);assert.equal(h.writes.length,0);
});

test('OAuth errors in a URL hash open and focus account controls and remove only auth-error parameters',async()=>{
  const h=setup({panelHidden:true,href:'https://spriggan.test/?theme=evening#view=journal&error=access_denied&error_description=private-provider-detail&error_code=403'});await settle();
  assert.equal(h.ids.get('park-memory').hidden,false);assert.equal(h.document.activeElement,h.get('title'));
  assert.match(h.get('status').textContent,/wasn’t completed/);assert(!h.get('status').textContent.includes('private-provider-detail'));
  const address=new URL(h.window.location.href),hash=new URLSearchParams(address.hash.slice(1));
  assert.equal(address.searchParams.get('theme'),'evening');assert.equal(hash.get('view'),'journal');
  for(const key of ['error','error_code','error_description'])assert.equal(hash.has(key),false);
  assert(!address.href.includes('private-provider-detail'));assert.equal(h.writes.length,0);
});

test('a failed recovery restore keeps both the current park and the original recovery target',async()=>{
  const previousTotals=JSON.stringify({shooed:1,snacks:0,storeys:1});
  const previous=pack({'spriggan.hex.moonlight':'false','spriggan.hex.totals.v1':previousTotals});
  const recoveryRaw=JSON.stringify({version:1,backup:previous}),current={...local(),[RECOVERY]:recoveryRaw};
  const h=setup({data:current});await settle();await h.click('recovery');assert.equal(h.get('confirmation').hidden,false);
  let failed=false;
  h.state.afterSet=(key,value)=>{if(!failed&&key==='spriggan.hex.totals.v1'&&value===previousTotals){failed=true;throw Error('interrupted restore write');}};
  await h.click('confirm');assert.equal(failed,true);assert.equal(h.writes[0][0],RECOVERY);assert.notEqual(h.writes[0][1],recoveryRaw);
  assert.deepEqual(Object.fromEntries(h.values),current);assert.equal(h.values.get(RECOVERY),recoveryRaw);
  await h.click('cancel');assert.deepEqual(Object.fromEntries(h.values),current);assert.equal(h.get('recovery').hidden,false);
});

test('blocked localStorage gives explicit storage guidance and never claims progress was saved',async()=>{
  const h=setup({storageBlocked:true});await settle();
  assert.equal(h.get('google').disabled,true);assert.equal(h.get('save').disabled,true);assert.equal(h.get('load').disabled,true);
  assert.match(h.get('copy').textContent,/storage/i);assert.match(h.get('copy').textContent,/allow|reload/i);
  assert(!/stays saved|is saved|saved here|saved in this browser/i.test(h.get('copy').textContent));
  assert.equal(h.calls.create.length,0);assert.equal(h.calls.settings.length,0);assert.equal(h.writes.length,0);
});

test('cancel, success, conflict and sign-out move keyboard focus out of hidden controls',async()=>{
  for(const action of ['cancel','save','load','conflict','signout']) {
    const h=setup({user:A,cloud:remote()});await settle();
    if(action==='signout')await h.click('signout');
    else {
      await h.click(action==='load'?'load':'save');assert.equal(h.document.activeElement,h.get('confirm'));
      if(action==='cancel')await h.click('cancel');
      else {
        if(action==='conflict')h.state.write=()=>{h.state.cloud=remote(9);throw failure('SAVE_CONFLICT','Changed elsewhere.');};
        await h.click('confirm');
      }
    }
    await settle();const active=h.document.activeElement;
    assert.notEqual(active,h.document.body,action+' should retain meaningful focus');
    assert.equal(h.isHidden(active),false,action+' must not leave focus under a hidden container');
    assert.equal(active.disabled,false,action+' must not leave focus on a disabled control');
    assert.equal(h.get('confirmation').contains(active),false,action+' must leave the closed confirmation');
    if(action==='signout')assert.equal(h.get('member').contains(active),false);
  }
});

test('Google readiness is checked with the public key before a guest can start OAuth',async()=>{
  const wait=deferred(),h=setup({settings:()=>wait.promise});
  await settle();assert.equal(h.get('google').disabled,true);await h.click('google');assert.equal(h.calls.signIn,0);
  assert.equal(h.calls.settings.length,1);assert.equal(h.calls.settings[0].url,CONFIG.url+'/auth/v1/settings');
  assert.equal(h.calls.settings[0].settings.headers.apikey,CONFIG.publishableKey);
  assert(h.calls.settings[0].settings.signal instanceof AbortSignal);
  wait.resolve({ok:true,json:async()=>({external:{google:true}})});await settle();
  assert.equal(h.get('google').disabled,false);await h.click('google');assert.equal(h.calls.signIn,1);assert.equal(h.writes.length,0);
});

test('a disabled Google provider keeps guest play safe and retry can enable sign-in after setup',async()=>{
  const h=setup({googleReady:false});await settle();
  assert.equal(h.get('guest').hidden,false);assert.equal(h.get('member').hidden,true);assert.equal(h.get('google').disabled,true);
  assert.equal(h.get('retry').hidden,false);assert.match(h.get('copy').textContent,/Google|sign.in|cloud/i);
  assert.match(h.get('copy').textContent,/available|prepared|ready|enabled|set.up/i);
  await h.click('google');assert.equal(h.calls.signIn,0);assert.equal(h.writes.length,0);
  h.state.googleReady=true;await h.click('retry');assert.equal(h.calls.settings.length,2);assert.equal(h.get('google').disabled,false);
  assert.equal(h.get('retry').hidden,true);assert.deepEqual(Object.fromEntries(h.values),local());
});

test('an unavailable provider check leaves local play untouched and offers a retry instead of broken OAuth',async()=>{
  const h=setup({settings:()=>{throw new Error('private network trace');}});await settle();
  assert.equal(h.get('google').disabled,true);assert.equal(h.get('retry').hidden,false);assert.equal(h.get('guest').hidden,false);
  assert.equal(h.get('save').disabled,true);assert.equal(h.get('load').disabled,true);assert.equal(h.calls.signIn,0);
  assert.match(h.get('status').textContent,/check|connect|available|try again/i);assert(!h.get('status').textContent.includes('private network trace'));
  assert.equal(h.writes.length,0);assert.deepEqual(Object.fromEntries(h.values),local());
  h.state.settings=null;await h.click('retry');assert.equal(h.get('google').disabled,false);assert.equal(h.get('retry').hidden,true);
});

test('an existing authenticated account can still use cloud saves when new Google sign-ins are disabled',async()=>{
  const h=setup({user:A,cloud:remote(),googleReady:false});await settle();
  assert.equal(h.get('member').hidden,false);assert.equal(h.get('guest').hidden,true);assert.equal(h.get('save').disabled,false);assert.equal(h.get('load').disabled,false);
  await h.click('save');await h.click('confirm');assert.equal(h.calls.write.length,1);assert.equal(h.calls.write[0].expectedRevision,4);
  assert.equal(h.writes.length,0);
});
