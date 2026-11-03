const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Loading=require('../dist/shared/world-loading.js');

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
async function settle(){for(let i=0;i<8;i++)await Promise.resolve()}
function account(initial={}){
  const gate=deferred(),listeners=new Set();
  const api={state:{loading:true,worldsReady:false,status:'loading',...initial},ready:gate.promise,
    subscribe(fn){listeners.add(fn);fn(api.state);return()=>listeners.delete(fn)},
    publish(patch){Object.assign(api.state,patch);for(const fn of listeners)fn(api.state)},
    resolve(){gate.resolve()},sync:async()=>{}};
  return api;
}
function view(){return {states:[],show(mode,message){this.states.push({mode,message})},dispose(){this.disposed=true},get mode(){return this.states.at(-1)?.mode}}}

test('worlds wait for account initialization even when a cached world is available',async()=>{
  const accounts=account({worldsReady:true}),screen=view(),events=new EventTarget();let boots=0,opened=0;
  events.addEventListener('spriggan:world-ready',()=>opened++);
  Loading.start(()=>boots++,{accounts,view:screen,events});
  accounts.publish({loading:false});await settle();
  assert.equal(boots,0);assert.equal(screen.mode,'loading');
  accounts.resolve();await settle();
  assert.equal(boots,1);assert.equal(opened,1);assert.equal(screen.mode,'ready');
  accounts.publish({status:'offline'});accounts.publish({status:'synced'});
  assert.equal(boots,1,'account updates never initialize a second world');
});

test('a failed first cloud read blocks defaults and a retry opens the loaded world exactly once',async()=>{
  const accounts=account(),screen=view(),upload=deferred();let boots=0,retries=0;
  accounts.sync=async()=>{retries++;accounts.publish({loading:true});await upload.promise;accounts.publish({loading:false,worldsReady:true,status:'synced'})};
  const gate=Loading.start(()=>boots++,{accounts,view:screen});
  accounts.publish({loading:false,status:'offline',message:'Your saved world has not loaded yet.'});accounts.resolve();await settle();
  assert.equal(boots,0);assert.equal(screen.mode,'blocked');assert.match(screen.states.at(-1).message,/not loaded/);
  const retry=gate.retry(),duplicate=gate.retry();await settle();
  assert.equal(retries,1);assert.equal(boots,0);assert.equal(screen.mode,'loading');
  upload.resolve();await Promise.all([retry,duplicate]);
  assert.equal(boots,1);assert.equal(screen.mode,'ready');
});

test('a failed retry leaves the saved world blocked without booting or creating defaults',async()=>{
  const accounts=account({loading:false,status:'offline'}),screen=view();let boots=0;
  accounts.sync=async()=>{throw new Error('offline')};
  const gate=Loading.start(()=>boots++,{accounts,view:screen});accounts.resolve();await settle();
  await gate.retry();assert.equal(boots,0);assert.equal(screen.mode,'blocked');
});

test('cached account worlds remain playable when the account controller reports an offline connection',async()=>{
  const accounts=account({loading:false,worldsReady:true,status:'offline'}),screen=view();let boots=0;
  Loading.start(()=>boots++,{accounts,view:screen});accounts.resolve();await settle();
  assert.equal(boots,1);assert.equal(screen.mode,'ready');
});

test('an account change keeps the tab blocked permanently, including after later updates',async()=>{
  const accounts=account({loading:false,worldsReady:true,status:'changed'}),screen=view();let boots=0,retries=0;
  accounts.sync=async()=>{retries++};
  const gate=Loading.start(()=>boots++,{accounts,view:screen});accounts.resolve();await settle();
  accounts.publish({status:'synced'});await gate.retry();
  assert.equal(boots,0);assert.equal(retries,0);assert.equal(screen.mode,'changed');
});

test('a world that throws during startup shows a reload state and is not initialized twice',async()=>{
  const accounts=account({loading:false,worldsReady:true}),screen=view();let boots=0,caught;
  Loading.start(()=>{boots++;throw new Error('drawing failed')},{accounts,view:screen,onError:error=>{caught=error}});
  accounts.resolve();await settle();accounts.publish({status:'synced'});
  assert.equal(boots,1);assert.equal(screen.mode,'error');assert.match(caught.message,/drawing failed/);
});

test('guest pages without an account controller open immediately and emit world-ready',()=>{
  let boots=0,opened=0;const events=new EventTarget(),screen=view();events.addEventListener('spriggan:world-ready',()=>opened++);
  Loading.start(()=>boots++,{accounts:null,events,view:screen});
  assert.equal(boots,1);assert.equal(opened,1);assert.equal(screen.mode,'ready');
});

test('the loading screen blocks the game, offers account access and retry, and restores it only when safe',async()=>{
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.hidden=false;this.inert=false;this.attributes={}}
    append(...children){this.children.push(...children)}setAttribute(key,value){this.attributes[key]=value}remove(){this.removed=true}
  }
  const body=new Element('body'),main=new Element('main'),document={body,querySelectorAll:()=>[main],createElement:tag=>new Element(tag)};
  const accounts=account(),gate=Loading.start(()=>assert.equal(main.inert,false),{accounts,document});
  const overlay=body.children[0],controls=overlay.children[0].children[3],[retry,reload,link]=controls.children;
  assert.equal(main.inert,true);assert.equal(overlay.hidden,false);assert.equal(controls.hidden,true);
  accounts.publish({loading:false,status:'offline'});accounts.resolve();await settle();
  assert.equal(main.inert,true);assert.equal(retry.hidden,false);assert.equal(reload.hidden,true);assert.equal(link.href,'../account/');
  accounts.sync=async()=>accounts.publish({worldsReady:true,status:'synced'});await retry.onclick();await settle();
  assert.equal(main.inert,false);assert.equal(overlay.hidden,true);
  accounts.publish({status:'changed'});assert.equal(main.inert,true);assert.equal(overlay.hidden,false);assert.equal(reload.hidden,false);
  gate.dispose();assert.equal(main.inert,true,'a changed account must remain blocked');
});

for(const [folder,name] of [['pixel','farm'],['hex','hex'],['dumplings','kitchen'],['slots','slots']]){
  test(`${folder} delegates startup to the shared gate before accessing world data`,()=>{
    let starts=0;const sandbox={SprigganWorldLoading:{start(boot){starts++;assert.equal(typeof boot,'function')}}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,`../dist/${folder}/${name}.js`),'utf8'),sandbox);
    assert.equal(starts,1);
  });
  test(`${folder} remains blocked if the loading helper is unavailable and the first cloud read failed`,async()=>{
    const accounts=account({loading:false,worldsReady:false,status:'offline'});
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,`../dist/${folder}/${name}.js`),'utf8'),{SprigganAccounts:accounts});
    accounts.resolve();await settle();
    assert.equal(accounts.state.worldsReady,false);
  });
}
