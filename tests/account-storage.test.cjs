const {test}=require('node:test');
const assert=require('node:assert/strict');
const Store=require('../dist/shared/account-storage.js');
const Kitchen=require('../dist/dumplings/kitchen-life.js');
const Slots=require('../dist/slots/slots-life.js');

function memory(initial={}){
  const values=new Map(Object.entries(initial));
  return{values,get length(){return values.size},key:index=>[...values.keys()][index]??null,getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
function active(raw,uid,options={}){Store.setActive(raw,uid);return Store.create(raw,{uid,...options})}
function storageEvent(target,properties){const event=new Event('storage');for(const [key,value]of Object.entries(properties))Object.defineProperty(event,key,{value});target.dispatchEvent(event)}
const pond=JSON.stringify({version:1,fish:[{id:'guest-fish',name:'Kin'}]});

test('guest saves retain the original keys and never acquire an account envelope',()=>{
  const raw=memory({'spriggan.pond.v1':pond,'firebase:auth':'opaque','spriggan.farm.music.v1':'quiet'}),guest=Store.create(raw);
  assert.equal(guest.uid,null);assert.equal(guest.getItem('spriggan.pond.v1'),pond);
  guest.setItem('spriggan.hex.totals.v1',JSON.stringify({snacks:3}));
  assert.equal(raw.getItem('spriggan.pond.v1'),pond);
  assert.deepEqual(guest.snapshot(),{'spriggan.pond.v1':pond,'spriggan.hex.totals.v1':'{"snacks":3}'});
  assert.equal(raw.values.size,4);assert.equal(raw.getItem(Store.ACTIVE_KEY),null);
});

test('accounts A, B and guest have independent saves and sign-out restores the untouched guest',()=>{
  const raw=memory({'spriggan.pond.v1':pond});
  const a=active(raw,'account-a');a.replace({'spriggan.pond.v1':pond},0,{dirty:true});
  a.setItem('spriggan.pond.v1','{"fish":[{"name":"Account A"}]}');
  const b=active(raw,'account-b');assert.equal(b.getItem('spriggan.pond.v1'),null);
  b.setItem('spriggan.pond.v1','{"fish":[{"name":"Account B"}]}');
  assert.equal(a.getItem('spriggan.pond.v1'),'{"fish":[{"name":"Account A"}]}');
  assert.equal(raw.getItem('spriggan.pond.v1'),pond);
  Store.setActive(raw,null);const guest=Store.create(raw);
  assert.equal(guest.getItem('spriggan.pond.v1'),pond);
  assert.equal(raw.getItem(Store.ACTIVE_KEY),null);
});

test('a stale tab refuses writes after another account signs in',()=>{
  const raw=memory({'spriggan.pond.v1':pond}),a=active(raw,'a');a.replace({'spriggan.pond.v1':pond},2);
  const before=raw.getItem(Store.accountKey('a'));Store.setActive(raw,'b');
  for(const mutate of [()=>a.setItem('spriggan.pond.v1','{}'),()=>a.removeItem('spriggan.pond.v1'),()=>a.replace({},3),()=>a.acknowledge(3,{})]){
    assert.throws(mutate,{code:'account/changed'});
  }
  assert.equal(raw.getItem(Store.accountKey('a')),before);assert.equal(raw.getItem(Store.accountKey('b')),null);
  assert.equal(raw.getItem('spriggan.pond.v1'),pond);
});

test('rotating the same account generation invalidates old live worlds before a restore',()=>{
  const raw=memory(),old=active(raw,'a');old.replace({'spriggan.pond.v1':pond},1);
  const previousMarker=raw.getItem(Store.ACTIVE_KEY);Store.setActive(raw,'a');
  assert.equal(Store.readActive(raw),'a');assert.notEqual(raw.getItem(Store.ACTIVE_KEY),previousMarker);
  assert.throws(()=>old.assertCurrent(),{code:'account/changed'});
  const current=Store.create(raw);current.replace({'spriggan.pond.v1':'{"fish":[]}'},2);
  assert.doesNotThrow(()=>current.assertCurrent());
  assert.throws(()=>old.setItem('spriggan.pond.v1',pond),{code:'account/changed'});
  assert.equal(current.getItem('spriggan.pond.v1'),'{"fish":[]}');
});

test('the coupled kitchen and slot spending receipt round-trip together without replaying coins',()=>{
  const raw=memory(),account=active(raw,'shop-owner'),kitchen=Kitchen.create(),wallet=Slots.create();
  kitchen.shop.coins=24;account.replace({[Kitchen.KEY]:JSON.stringify(kitchen),[Slots.KEY]:JSON.stringify(wallet)},0,{dirty:true});
  assert.equal(Slots.buyKitchenSeeds(account,Kitchen,10).status,'bought');
  assert.equal(Slots.kitchenWallet(account,Kitchen).coins,14);
  const snapshot=account.snapshot();
  assert.deepEqual(Store.create(raw,{uid:'shop-owner',events:null}).snapshot(),snapshot);
  account.replace(snapshot,1);
  assert.equal(Slots.kitchenWallet(account,Kitchen).coins,14);
  assert.equal(Slots.kitchenWallet(account,Kitchen).balance,210);
  assert.equal(JSON.parse(snapshot[Slots.KEY]).kitchenCredits[kitchen.shop.earningsId],10);
  assert.equal(account.state().dirty,false);
});

test('invalid or oversized snapshots cannot replace an existing account save',()=>{
  const raw=memory(),account=active(raw,'a');account.replace({'spriggan.pond.v1':pond},4);
  const before=raw.getItem(Store.accountKey('a'));
  for(const entries of [null,[],{'firebase:auth':'{}'},{'spriggan.pond.v1':{}},{'spriggan.pond.v1':'broken'}]){
    assert.throws(()=>account.replace(entries,5),{code:'account/invalid-save'});
    assert.equal(raw.getItem(Store.accountKey('a')),before);
  }
  assert.throws(()=>account.setItem('spriggan.pond.v1',JSON.stringify({large:'界'.repeat(160000)})),{code:'account/save-too-large'});
  assert.equal(raw.getItem(Store.accountKey('a')),before);
});

test('a corrupt existing envelope is preserved instead of being silently reset',()=>{
  const raw=memory();Store.setActive(raw,'a');raw.setItem(Store.accountKey('a'),'broken');const account=Store.create(raw);
  assert.throws(()=>account.snapshot(),{code:'account/invalid-save'});
  assert.throws(()=>account.setItem('spriggan.pond.v1','{}'),{code:'account/invalid-save'});
  assert.throws(()=>account.replace({},1),{code:'account/invalid-save'});
  assert.equal(raw.getItem(Store.accountKey('a')),'broken');
});

test('cloud acknowledgement retains newer local writes and clears dirty only for the sent snapshot',()=>{
  const raw=memory(),account=active(raw,'a');account.replace({'spriggan.pond.v1':pond},3,{dirty:true});
  const sent=account.snapshot();account.setItem('spriggan.slots.v1','{"balance":210}');account.acknowledge(4,sent);
  assert.equal(account.state().revision,4);assert.equal(account.state().dirty,true);
  assert.equal(account.getItem('spriggan.slots.v1'),'{"balance":210}');
  account.acknowledge(5,account.snapshot());assert.equal(account.state().dirty,false);
  assert.throws(()=>account.acknowledge(4,sent),{code:'account/stale-acknowledgement'});
  assert.equal(account.state().revision,5);
});

test('interleaved saves from different world tabs retain both changes',()=>{
  const raw=memory(),pondTab=active(raw,'a');
  pondTab.replace({'spriggan.pond.v1':pond,'spriggan.farm.v1':'{"birds":[]}'},3);
  const farmTab=Store.create(raw,{uid:'a',events:null}),write=raw.setItem;
  let interleave=true;
  raw.setItem=(key,value)=>{
    if(interleave){interleave=false;farmTab.setItem('spriggan.farm.v1','{"birds":[{"id":"new-hen"}]}')}
    return write(key,value);
  };
  pondTab.setItem('spriggan.pond.v1','{"fish":[{"id":"new-koi"}]}');
  assert.deepEqual(pondTab.snapshot(),{
    'spriggan.pond.v1':'{"fish":[{"id":"new-koi"}]}',
    'spriggan.farm.v1':'{"birds":[{"id":"new-hen"}]}'
  });
  assert.deepEqual(farmTab.snapshot(),pondTab.snapshot());
  assert.equal(farmTab.state().dirty,true);
});

test('an upload acknowledgement cannot erase interleaved world edits or removals',()=>{
  const raw=memory(),account=active(raw,'a');
  account.replace({'spriggan.pond.v1':pond,'spriggan.farm.v1':'{"birds":[]}'},3,{dirty:true});
  const sent=account.snapshot(),other=Store.create(raw,{uid:'a',events:null}),write=raw.setItem;
  let interleave=true;
  raw.setItem=(key,value)=>{
    if(interleave){interleave=false;other.setItem('spriggan.pond.v1','{"fish":[]}');other.removeItem('spriggan.farm.v1')}
    return write(key,value);
  };
  account.acknowledge(4,sent);
  assert.deepEqual(account.snapshot(),{'spriggan.pond.v1':'{"fish":[]}'});
  assert.equal(account.state().revision,4);
  assert.equal(account.state().dirty,true);
  account.acknowledge(5,account.snapshot());
  assert.equal(account.state().dirty,false);
});

test('legacy account bundles and pending world records survive sign-out and reload',()=>{
  const raw=memory(),account=active(raw,'a');
  raw.setItem(Store.accountKey('a'),JSON.stringify({format:1,entries:{'spriggan.pond.v1':pond},revision:3,dirty:true}));
  account.setItem('spriggan.farm.v1','{"birds":[]}');
  const expected={'spriggan.pond.v1':pond,'spriggan.farm.v1':'{"birds":[]}'};
  Store.setActive(raw,null);Store.setActive(raw,'a');
  const restored=Store.create(raw,{events:null});
  assert.deepEqual(restored.snapshot(),expected);
  assert.equal(restored.state().dirty,true);
  restored.acknowledge(4,expected);
  assert.equal(restored.state().dirty,false);
  assert.deepEqual(Store.create(raw,{events:null}).snapshot(),expected);
});

test('a late write from before a restore cannot replace the restored worlds',()=>{
  const raw=memory(),old=active(raw,'a');old.replace({'spriggan.pond.v1':pond},3);
  const write=raw.setItem;let interleave=true,restored;
  raw.setItem=(key,value)=>{
    if(interleave){
      interleave=false;Store.setActive(raw,'a');restored=Store.create(raw,{events:null});
      restored.replace({'spriggan.pond.v1':'{"fish":[]}'},4);
    }
    return write(key,value);
  };
  old.setItem('spriggan.pond.v1','{"fish":[{"id":"stale"}]}');
  assert.deepEqual(restored.snapshot(),{'spriggan.pond.v1':'{"fish":[]}'});
  assert.equal(restored.state().dirty,false);
  assert.throws(()=>old.assertCurrent(),{code:'account/changed'});
  Store.removeAccount(raw,'a');
  assert.equal([...raw.values.keys()].some(key=>key.startsWith(Store.accountKey('a'))),false);
});

test('a late upload acknowledgement cannot overwrite a restored account baseline',()=>{
  const raw=memory(),old=active(raw,'a');old.replace({'spriggan.pond.v1':pond},1,{dirty:true});
  const sent=old.snapshot(),write=raw.setItem;let interleave=true,restored;
  raw.setItem=(key,value)=>{
    if(interleave){
      interleave=false;Store.setActive(raw,'a');restored=Store.create(raw,{events:null});
      restored.replace({'spriggan.pond.v1':'{"fish":[]}'},7);
    }
    return write(key,value);
  };
  old.acknowledge(2,sent);
  assert.deepEqual(restored.state(),{format:1,entries:{'spriggan.pond.v1':'{"fish":[]}'},revision:7,dirty:false});
  Store.removeAccount(raw,'a');
  assert.equal([...raw.values.keys()].some(key=>key.startsWith(Store.accountKey('a'))),false);
});

test('a restore while reading the baseline blocks stale edits, removals, and acknowledgements',async t=>{
  for(const operation of ['edit','remove','acknowledge'])await t.test(operation,()=>{
    const raw=memory(),old=active(raw,'a');old.replace({'spriggan.pond.v1':pond},1,{dirty:true});
    const sent=old.snapshot(),read=raw.getItem;let interleave=true,restored;
    raw.getItem=key=>{
      if(key===Store.accountKey('a')&&interleave){
        interleave=false;Store.setActive(raw,'a');restored=Store.create(raw,{events:null});
        restored.replace({'spriggan.pond.v1':'{"fish":[]}'},7);
      }
      return read(key);
    };
    const mutate=operation==='edit'?()=>old.setItem('spriggan.pond.v1',pond):
      operation==='remove'?()=>old.removeItem('spriggan.pond.v1'):()=>old.acknowledge(8,sent);
    assert.throws(mutate,{code:'account/changed'});
    assert.deepEqual(restored.state(),{format:1,entries:{'spriggan.pond.v1':'{"fish":[]}'},revision:7,dirty:false});
  });
});

test('a failed replacement preserves pending world records',()=>{
  const raw=memory(),account=active(raw,'a');account.replace({'spriggan.pond.v1':pond},3);
  account.setItem('spriggan.pond.v1','{"fish":[]}');
  const write=raw.setItem;
  raw.setItem=(key,value)=>{if(key===Store.accountKey('a'))throw Error('Storage full');return write(key,value)};
  assert.throws(()=>account.replace({'spriggan.pond.v1':pond},4),/Storage full/);
  assert.deepEqual(account.snapshot(),{'spriggan.pond.v1':'{"fish":[]}'});
  assert.equal(account.state().dirty,true);
  assert.equal(account.state().revision,3);
});

test('account deletion removes pending world records without touching another account or guests',()=>{
  const raw=memory({'spriggan.pond.v1':pond}),a=active(raw,'a');
  a.setItem('spriggan.pond.v1','{"fish":[]}');
  const b=active(raw,'ab');b.setItem('spriggan.farm.v1','{"birds":[]}');
  Store.removeAccount(raw,'a');
  assert.equal([...raw.values.keys()].some(key=>key===Store.accountKey('a')||key.startsWith(Store.accountKey('a')+':world:')),false);
  assert.deepEqual(b.snapshot(),{'spriggan.farm.v1':'{"birds":[]}'});
  assert.equal(raw.getItem('spriggan.pond.v1'),pond);
});

test('snapshot comparison ignores property order and callers cannot mutate stored state through returned objects',()=>{
  const raw=memory(),account=active(raw,'a');account.replace({'spriggan.pond.v1':pond,'spriggan.slots.v1':'{}'},1);
  assert.equal(Store.equalEntries(account.snapshot(),{'spriggan.slots.v1':'{}','spriggan.pond.v1':pond}),true);
  const snapshot=account.snapshot(),state=account.state();delete snapshot['spriggan.pond.v1'];state.entries['spriggan.slots.v1']='bad';
  assert.equal(account.getItem('spriggan.pond.v1'),pond);assert.equal(account.getItem('spriggan.slots.v1'),'{}');
});

test('device preferences delegate to native storage and never enter account snapshots',()=>{
  const raw=memory(),account=active(raw,'a');account.setItem('spriggan.farm.music.v1','quiet');
  assert.equal(raw.getItem('spriggan.farm.music.v1'),'quiet');assert.deepEqual(account.snapshot(),{});
  account.removeItem('spriggan.farm.music.v1');assert.equal(raw.getItem('spriggan.farm.music.v1'),null);
});

test('account envelope events become logical storage events for the current account only',()=>{
  const raw=memory(),events=new EventTarget(),changes=[],account=active(raw,'a',{events,onChange:change=>changes.push(change)});
  account.replace({'spriggan.pond.v1':pond,'spriggan.slots.v1':'{"balance":200}'},2);
  const oldValue=raw.getItem(Store.accountKey('a')),logical=[];
  events.addEventListener('storage',event=>{if(event.sprigganAccountEvent)logical.push(event)});
  const next=JSON.stringify({format:1,entries:{'spriggan.pond.v1':pond,'spriggan.slots.v1':'{"balance":210}'},revision:2,dirty:true});
  raw.setItem(Store.accountKey('a'),next);
  storageEvent(events,{key:Store.accountKey('a'),oldValue,newValue:next,storageArea:raw,url:'https://example.vercel.app/slots/'});
  assert.equal(logical.length,1);assert.equal(logical[0].key,'spriggan.slots.v1');assert.equal(logical[0].newValue,'{"balance":210}');
  assert.equal(logical[0].storageArea,raw);assert.equal(changes.at(-1).external,true);
  storageEvent(events,{key:Store.accountKey('b'),oldValue:null,newValue:next,storageArea:raw});
  assert.equal(logical.length,1);
  account.dispose();storageEvent(events,{key:Store.accountKey('a'),oldValue:next,newValue:null,storageArea:raw});
  assert.equal(logical.length,1);
});

test('independent world records emit logical events and remain visible after cloud acknowledgements',()=>{
  const raw=memory(),events=new EventTarget(),observer=active(raw,'a',{events}),writer=Store.create(raw,{events:null});
  observer.replace({'spriggan.pond.v1':pond},3);
  const logical=[];events.addEventListener('storage',event=>{if(event.sprigganAccountEvent)logical.push(event)});
  writer.setItem('spriggan.pond.v1','{"fish":[]}');
  const key=[...raw.values.keys()].find(key=>key.startsWith(Store.accountKey('a')+':world:'));
  const pending=raw.getItem(key);
  writer.acknowledge(4,writer.snapshot());
  storageEvent(events,{key,oldValue:null,newValue:pending,storageArea:raw});
  assert.equal(logical.length,1);assert.equal(logical[0].key,'spriggan.pond.v1');
  assert.equal(logical[0].newValue,'{"fish":[]}');assert.equal(observer.state().dirty,false);
  writer.removeItem('spriggan.pond.v1');
  storageEvent(events,{key,oldValue:pending,newValue:raw.getItem(key),storageArea:raw});
  assert.equal(logical.length,2);assert.equal(logical[1].oldValue,'{"fish":[]}');assert.equal(logical[1].newValue,null);
  assert.equal(observer.getItem('spriggan.pond.v1'),null);assert.equal(observer.state().dirty,true);
});

test('account changes notify the old tab, and native guest storage events are not duplicated',()=>{
  const raw=memory(),events=new EventTarget(),guest=Store.create(raw,{events}),seen=[];
  events.addEventListener('storage',event=>seen.push(event));let notice;
  events.addEventListener('spriggan:account-changed',event=>notice=event.detail);
  storageEvent(events,{key:'spriggan.pond.v1',oldValue:null,newValue:pond,storageArea:raw});
  assert.equal(seen.length,1);assert.equal(seen[0].sprigganAccountEvent,undefined);
  Store.setActive(raw,'next');storageEvent(events,{key:Store.ACTIVE_KEY,oldValue:null,newValue:raw.getItem(Store.ACTIVE_KEY),storageArea:raw});
  assert.deepEqual(notice,{uid:null,activeUid:'next'});guest.dispose();
});

test('a same-account restore sends a change notice to invalidate other live tabs',()=>{
  const raw=memory(),events=new EventTarget(),old=active(raw,'a',{events}),previousMarker=raw.getItem(Store.ACTIVE_KEY);
  let notice;events.addEventListener('spriggan:account-changed',event=>notice=event.detail);
  Store.setActive(raw,'a');
  storageEvent(events,{key:Store.ACTIVE_KEY,oldValue:previousMarker,newValue:raw.getItem(Store.ACTIVE_KEY),storageArea:raw});
  assert.deepEqual(notice,{uid:'a',activeUid:'a'});
  assert.throws(()=>old.assertCurrent(),{code:'account/changed'});old.dispose();
});
