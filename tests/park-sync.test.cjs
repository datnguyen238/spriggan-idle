const test = require('node:test');
const assert = require('node:assert/strict');
const Sync = require('../dist/shared/park-sync.js');
const Saves = require('../dist/shared/park-saves.js');

const USER_A = {id:'user-a',email:'a@example.test'}, USER_B = {id:'user-b',email:'b@example.test'};
const WHEN = '2026-11-19T12:00:00.000Z';
const KEY = 'spriggan.hex.totals.v1';
const raw = (storeys = 1) => JSON.stringify({shooed:0,snacks:0,storeys});
const pack = (storeys,extra = {}) => JSON.stringify({format:'spriggan-park',version:1,exportedAt:WHEN,entries:{...(storeys === null ? {} : {[KEY]:raw(storeys)}),...extra}});
const remote = (storeys,revision = 1) => ({backup:pack(storeys),revision,updatedAt:WHEN});
const deferred = () => {let resolve,reject;const promise = new Promise((yes,no) => {resolve = yes;reject = no;});return {promise,resolve,reject};};
const error = code => Object.assign(new Error(code),{code});
function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {data,getItem:key => data.get(key) ?? null,setItem(key,value) {data.set(key,String(value));},removeItem(key) {data.delete(key);}};
}
function setup(options = {}) {
  const storage = options.storage || memory(options.local ? {[KEY]:raw(options.local)} : {});
  const timers = new Map(), states = [], writes = [], reads = [];
  let nextTimer = 0, current = options.remote === undefined ? remote(3) : options.remote, readError = null, writeError = null, changed = 0;
  const client = {
    async read(expectedUserId) {reads.push(expectedUserId);if (readError) throw readError;return typeof current === 'function' ? current() : current;},
    async write(backup,revision,expectedUserId) {
      writes.push({backup,revision,expectedUserId});
      if (writeError) throw writeError;
      if (options.write) return options.write(backup,revision);
      if ((current?.revision ?? null) !== revision) throw error('SAVE_CONFLICT');
      current = {backup,revision:(revision || 0) + 1,updatedAt:WHEN};
      return {revision:current.revision,updatedAt:WHEN};
    }
  };
  const engine = Sync.create({client,saves:options.saves || Saves,storage,onState:state => states.push(state),onRemoteChange:() => changed++,
    setTimeout(fn,delay) {timers.set(++nextTimer,{fn,delay});return nextTimer;},clearTimeout:id => timers.delete(id),now:() => Date.parse(WHEN)});
  return {engine,client,storage,timers,states,writes,reads,
    setRemote(value) {current = value;},getRemote:() => current,setReadError(value) {readError = value;},setWriteError(value) {writeError = value;},
    async tick() {const pending = [...timers.values()];timers.clear();for (const timer of pending) timer.fn();await engine.flush();},
    changed:() => changed};
}
const localHeight = h => JSON.parse(h.storage.getItem(KEY)).storeys;
const uploadedHeight = value => JSON.parse(JSON.parse(value).entries[KEY]).storeys;

test('a keyed save validates only its changed entry and still validates the full park before upload',async () => {
  const checks=[],reads=[],source=memory(),originalRead=source.getItem;
  source.getItem=key=>{reads.push(key);return originalRead(key);};
  let exports=0,inspections=0;
  const saves={...Saves,validateEntry(key,value){checks.push(key);return Saves.validateEntry(key,value);},
    exportBackup(storage){exports++;return Saves.exportBackup(storage);},inspectBackup(text){inspections++;return Saves.inspectBackup(text);}};
  const h=setup({storage:source,saves});await h.engine.start(USER_A);
  checks.length=0;reads.length=0;exports=0;inspections=0;
  source.setItem(KEY,raw(9));assert.equal(h.engine.changed(KEY).status,'pending');
  assert.deepEqual(checks,[KEY]);assert.deepEqual(reads,[Sync.META_KEY,KEY]);
  assert.equal(exports,0);assert.equal(inspections,0);assert.equal(h.writes.length,0);
  await h.engine.flush();assert(exports>0);assert(inspections>0);assert.equal(uploadedHeight(h.writes[0].backup),9);
});

test('an unchanged keyed write reuses validation and does not notify or schedule work',async () => {
  let validations=0;
  const h=setup({saves:{...Saves,validateEntry(key,value){validations++;return Saves.validateEntry(key,value);}}});
  await h.engine.start(USER_A);const before=validations,states=h.states.length;
  h.engine.changed(KEY);h.engine.changed(KEY);
  assert.equal(validations,before);assert.equal(h.states.length,states);assert.equal(h.timers.size,0);
});

test('undoing a keyed change to the accepted cloud value clears pending work',async () => {
  const h=setup();await h.engine.start(USER_A);
  h.storage.setItem(KEY,raw(8));h.engine.changed(KEY);assert.equal(h.engine.getState().dirty,true);
  h.storage.setItem(KEY,raw(3));h.engine.changed(KEY);
  assert.equal(h.engine.getState().dirty,false);assert.equal(h.timers.size,0);
  await h.engine.flush();assert.equal(h.writes.length,0);
});

test('keyed deletion is uploaded as an absent world, and invalid keyed data is blocked',async () => {
  const h=setup();await h.engine.start(USER_A);h.storage.removeItem(KEY);h.engine.changed(KEY);await h.engine.flush();
  assert.equal(Saves.inspectBackup(h.writes[0].backup).entries[KEY],undefined);
  const bad=setup();await bad.engine.start(USER_A);bad.storage.setItem(KEY,'not json');
  assert.equal(bad.engine.changed(KEY).canPlay,false);assert.equal(bad.writes.length,0);
});

test('full upload validation catches an unreported invalid change outside the keyed cache',async () => {
  const h=setup();await h.engine.start(USER_A);
  h.storage.setItem('spriggan.pond.v1','invalid');h.storage.setItem(KEY,raw(9));h.engine.changed(KEY);
  assert.equal(h.engine.getState().status,'pending');
  const result=await h.engine.flush();assert.equal(result.status,'error');assert.equal(h.writes.length,0);
});

test('keyed cache is invalidated on account changes and checks ownership before using cached bytes',async () => {
  const h=setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(8));h.engine.changed(KEY);h.engine.stop();
  h.setRemote(remote(20));await h.engine.start(USER_B);
  h.storage.setItem(KEY,raw(21));h.engine.changed(KEY);await h.engine.flush();
  assert.equal(h.writes.at(-1).expectedUserId,USER_B.id);assert.equal(uploadedHeight(h.writes.at(-1).backup),21);
  const meta=JSON.parse(h.storage.getItem(Sync.META_KEY));h.storage.setItem(Sync.META_KEY,JSON.stringify({...meta,userId:USER_A.id}));
  assert.equal(h.engine.changed(KEY).canPlay,false);
});

test('changes during an upload remain pending when mutation notifications use the cache',async () => {
  const pending=deferred(),h=setup({write:()=>pending.promise});await h.engine.start(USER_A);
  h.storage.setItem(KEY,raw(8));h.engine.changed(KEY);const uploading=h.engine.flush();
  h.storage.setItem(KEY,raw(9));h.engine.changed(KEY);pending.resolve({revision:2,updatedAt:WHEN});await uploading;
  assert.equal(h.engine.getState().dirty,true);assert.equal(h.engine.getState().revision,2);
  h.storage.setItem(KEY,raw(8));h.engine.changed(KEY);
  assert.equal(h.engine.getState().dirty,false,'accepted upload is the new comparison base');
});

test('older save adapters use the full validation path for keyed notifications',async () => {
  const {validateEntry,...legacy}=Saves;
  const h=setup({saves:legacy});await h.engine.start(USER_A);
  h.storage.setItem(KEY,raw(9));h.engine.changed(KEY);await h.engine.flush();
  assert.equal(uploadedHeight(h.writes[0].backup),9);
});

test('periodic full checks recover valid writes made outside the notification wrapper',async () => {
  const h=setup();await h.engine.start(USER_A);
  h.storage.setItem('spriggan.hex.moonlight','true');
  h.storage.setItem(KEY,raw(9));h.engine.changed(KEY);h.storage.setItem(KEY,raw(3));h.engine.changed(KEY);
  await h.engine.check();assert.equal(h.engine.getState().dirty,true);await h.engine.flush();
  assert.equal(Saves.inspectBackup(h.writes[0].backup).entries['spriggan.hex.moonlight'],'true');
});

test('the keyed cache defers to the full size limit near the snapshot boundary',async () => {
  let limit=Infinity;
  const saves={...Saves,get MAX_BYTES(){return limit;},exportBackup(storage){
    const value=Saves.exportBackup(storage);
    if(Buffer.byteLength(value)>limit)throw error('FILE_SIZE');
    return value;
  }};
  const h=setup({saves});await h.engine.start(USER_A);
  limit=Buffer.byteLength(Saves.exportBackup(h.storage))+5;
  h.storage.setItem('spriggan.hex.moonlight','true');
  const result=h.engine.changed('spriggan.hex.moonlight');
  assert.equal(result.status,'error');assert.equal(result.reason,'FILE_SIZE');assert.equal(h.writes.length,0);
});

test('a fresh browser loads the signed-in cloud park before permitting play',async () => {
  const h = setup();const result = await h.engine.start(USER_A);
  assert.equal(result.canPlay,true);assert.equal(result.status,'ready');assert.equal(result.dirty,false);
  assert.equal(localHeight(h),3);assert.equal(result.revision,1);assert.equal(h.writes.length,0);assert.equal(h.changed(),1);
  assert(h.states.slice(0,-1).every(state => !state.canPlay));
});

test('only preferences, timers or a journal do not create a legacy progress choice',async () => {
  const h = setup({storage:memory({'spriggan.hex.moonlight':'true'})});
  assert.equal((await h.engine.start(USER_A)).status,'ready');assert.equal(localHeight(h),3);
});

test('a fresh account with an empty browser is playable and creates its first cloud copy automatically',async () => {
  const h = setup({remote:null});const result = await h.engine.start(USER_A);
  assert.equal(result.status,'pending');assert.equal(result.canPlay,true);assert.equal(h.timers.size,1);
  await h.tick();assert.equal(h.writes.length,1);assert.equal(h.writes[0].revision,null);assert.equal(h.engine.getState().status,'ready');
});

test('unowned local progress asks for an explicit choice before either copy changes',async () => {
  const h = setup({local:7});const result = await h.engine.start(USER_A);
  assert.equal(result.status,'choice');assert.equal(result.reason,'LEGACY_PARK');assert.equal(result.canPlay,false);
  assert.equal(localHeight(h),7);assert.equal(h.writes.length,0);assert.equal(h.changed(),0);
});

test('legacy progress also requires explicit adoption when this account has no cloud save',async () => {
  const h = setup({local:7,remote:null});assert.equal((await h.engine.start(USER_A)).status,'choice');
  assert.equal(h.storage.getItem(Sync.META_KEY),null);await h.engine.keepLocal();
  assert.equal(h.engine.getState().status,'ready');assert.equal(localHeight(h),7);assert.equal(uploadedHeight(h.writes[0].backup),7);
  assert.equal(h.writes[0].revision,null);assert.equal(JSON.parse(h.storage.getItem(Sync.META_KEY)).userId,USER_A.id);
});

test('choosing the account park preserves the previous browser park as a recovery copy',async () => {
  const h = setup({local:7});await h.engine.start(USER_A);const result = await h.engine.useCloud();
  assert.equal(result.canPlay,true);assert.equal(localHeight(h),3);assert.equal(h.writes.length,0);
  const recovery = JSON.parse(h.storage.getItem(Sync.RECOVERY_KEY));assert.equal(uploadedHeight(recovery.backup),7);
});

test('choosing a fresh account instead of legacy progress clears all old supported worlds',async () => {
  const h = setup({local:7,remote:null});await h.engine.start(USER_A);await h.engine.useCloud();
  assert.equal(h.storage.getItem(KEY),null);assert.equal(h.engine.getState().canPlay,true);
  await h.engine.flush();assert.equal(Saves.inspectBackup(h.writes[0].backup).count,0);
});

test('choosing local progress stores the previous cloud park before CAS replacement',async () => {
  const h = setup({local:7});await h.engine.start(USER_A);await h.engine.keepLocal();
  assert.equal(h.writes[0].revision,1);assert.equal(uploadedHeight(h.writes[0].backup),7);
  const recovery = JSON.parse(h.storage.getItem(Sync.previousCloudKey(USER_A.id)));assert.equal(uploadedHeight(recovery.backup),3);
});

test('a subsequent account can never inherit or upload the previous account park',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(8));h.engine.changed();h.engine.stop();
  const b = setup({storage:h.storage,remote:null});const result = await b.engine.start(USER_B);
  assert.equal(result.canPlay,true);assert.equal(b.storage.getItem(KEY),null);await b.engine.flush();
  assert.equal(Saves.inspectBackup(b.writes[0].backup).count,0);
  const stash = JSON.parse(b.storage.getItem(Sync.accountKey(USER_A.id)));assert.equal(uploadedHeight(stash.backup),8);assert.equal(stash.userId,USER_A.id);
});

test('switching back to an account resumes its stashed unsent park against its known base',async () => {
  const storage = memory(), a = setup({storage});await a.engine.start(USER_A);storage.setItem(KEY,raw(8));a.engine.changed();a.engine.stop();
  const b = setup({storage,remote:remote(20)});await b.engine.start(USER_B);b.engine.stop();
  const returned = setup({storage});const result = await returned.engine.start(USER_A);
  assert.equal(result.canPlay,true);assert.equal(result.dirty,true);assert.equal(localHeight(returned),8);await returned.engine.flush();
  assert.equal(uploadedHeight(returned.writes[0].backup),8);assert.equal(returned.writes[0].revision,1);
});

test('dirty same-account progress survives navigation and uploads against its durable base revision',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(9));h.engine.changed();h.engine.stop();
  const reopened = setup({storage:h.storage});const result = await reopened.engine.start(USER_A);
  assert.equal(result.canPlay,true);assert.equal(result.dirty,true);assert.equal(localHeight(reopened),9);
  await reopened.engine.flush();assert.equal(uploadedHeight(reopened.writes[0].backup),9);assert.equal(reopened.writes[0].revision,1);
});

test('a final pagehide world save is detected on next boot even if no dirty notification ran',async () => {
  const h = setup();await h.engine.start(USER_A);h.engine.stop();h.storage.setItem(KEY,raw(9));
  assert.equal(JSON.parse(h.storage.getItem(Sync.META_KEY)).pending,false);
  const reopened = setup({storage:h.storage});const result = await reopened.engine.start(USER_A);
  assert.equal(result.canPlay,true);assert.equal(result.dirty,true);assert.equal(localHeight(reopened),9);
  await reopened.engine.flush();assert.equal(uploadedHeight(reopened.writes[0].backup),9);assert.equal(reopened.writes[0].revision,1);
});

test('a clean browser automatically loads a newer cloud revision',async () => {
  const h = setup();await h.engine.start(USER_A);h.engine.stop();
  const reopened = setup({storage:h.storage,remote:remote(10,2)});assert.equal((await reopened.engine.start(USER_A)).status,'ready');
  assert.equal(localHeight(reopened),10);assert.equal(reopened.writes.length,0);assert.equal(reopened.engine.getState().revision,2);
});

test('a dirty browser never overwrites or loads over a newer cloud revision without a choice',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(9));h.engine.changed();h.engine.stop();
  const reopened = setup({storage:h.storage,remote:remote(10,2)});const result = await reopened.engine.start(USER_A);
  assert.equal(result.status,'conflict');assert.equal(result.canPlay,false);assert.equal(localHeight(reopened),9);assert.equal(reopened.writes.length,0);
});

test('a completed request whose response was lost is recognized by content on restart',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(9));h.engine.changed();h.engine.stop();
  const reopened = setup({storage:h.storage,remote:remote(9,2)});const result = await reopened.engine.start(USER_A);
  assert.equal(result.status,'ready');assert.equal(result.dirty,false);assert.equal(result.revision,2);assert.equal(reopened.writes.length,0);
});

test('a cloud revision changing after the choice is shown requires another explicit choice',async () => {
  for (const method of ['keepLocal','useCloud']) {
    const h = setup({local:7});await h.engine.start(USER_A);h.setRemote(remote(11,2));
    const result = await h.engine[method]();assert.equal(result.status,'choice');assert.equal(result.reason,'REMOTE_CHANGED_AGAIN');
    assert.equal(result.canPlay,false);assert.equal(localHeight(h),7);assert.equal(h.writes.length,0);
    await h.engine[method]();assert.equal(h.engine.getState().canPlay,true);
    if (method === 'keepLocal') assert.equal(h.writes[0].revision,2);else assert.equal(localHeight(h),11);
  }
});

test('another tab changing local progress after a choice also requires a renewed decision',async () => {
  const h = setup({local:7});await h.engine.start(USER_A);h.storage.setItem(KEY,raw(12));
  const result = await h.engine.keepLocal();assert.equal(result.reason,'LOCAL_CHANGED_AGAIN');assert.equal(h.writes.length,0);
  await h.engine.keepLocal();assert.equal(uploadedHeight(h.writes[0].backup),12);
});

test('continuous game autosaves use one fixed upload window instead of starving a debounce',async () => {
  const h = setup();await h.engine.start(USER_A);
  for (let height = 4; height <= 20; height++) {h.storage.setItem(KEY,raw(height));h.engine.changed();}
  assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,8000);
  await h.tick();assert.equal(h.writes.length,1);assert.equal(uploadedHeight(h.writes[0].backup),20);
});

test('unchanged park data ignores newly exported backup timestamps and performs no write',async () => {
  const h = setup();await h.engine.start(USER_A);h.engine.changed();await h.engine.flush();
  assert.equal(h.timers.size,0);assert.equal(h.writes.length,0);assert.equal(h.engine.getState().dirty,false);
});

test('flushes are serialized and changes during upload remain pending for the next revision',async () => {
  const wait = deferred();let call = 0;
  const h = setup({write:async () => ++call === 1 ? wait.promise : {revision:3,updatedAt:WHEN}});
  await h.engine.start(USER_A);h.storage.setItem(KEY,raw(4));h.engine.changed();
  const first = h.engine.flush(), again = h.engine.flush();assert.equal(first,again);
  h.storage.setItem(KEY,raw(5));h.engine.changed();wait.resolve({revision:2,updatedAt:WHEN});await first;
  assert.equal(h.engine.getState().dirty,true);assert.equal(h.engine.getState().revision,2);assert.equal(h.timers.size,1);
  await h.engine.flush();assert.equal(h.writes.length,2);assert.equal(h.writes[1].revision,2);assert.equal(uploadedHeight(h.writes[1].backup),5);
});

test('server CAS conflicts pause play and expose the freshly read cloud copy',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(4));h.engine.changed();h.setRemote(remote(20,2));
  const result = await h.engine.flush();assert.equal(result.status,'conflict');assert.equal(result.canPlay,false);
  assert.equal(localHeight(h),4);assert.equal(h.writes.length,1);await h.engine.useCloud();assert.equal(localHeight(h),20);
});

test('offline reload is playable only for the same account with a durable local binding',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(4));h.engine.changed();h.engine.stop();
  const reopened = setup({storage:h.storage});reopened.setReadError(error('NETWORK'));
  const result = await reopened.engine.start(USER_A);assert.equal(result.status,'offline');assert.equal(result.canPlay,true);assert.equal(result.dirty,true);assert.equal(localHeight(reopened),4);
  const other = setup({storage:h.storage});other.setReadError(error('NETWORK'));
  assert.equal((await other.engine.start(USER_B)).canPlay,false);assert.equal(localHeight(other),4);
  const fresh = setup();fresh.setReadError(error('NETWORK'));assert.equal((await fresh.engine.start(USER_A)).canPlay,false);assert.equal(fresh.storage.getItem(KEY),null);
});

test('failed uploads retain local progress and retry safely after reconnecting',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(4));h.engine.changed();h.setWriteError(error('NETWORK'));
  const result = await h.engine.flush();assert.equal(result.status,'offline');assert.equal(result.canPlay,true);assert.equal(localHeight(h),4);assert.equal(result.dirty,true);
  h.setWriteError(null);await h.engine.flush();assert.equal(h.engine.getState().status,'ready');assert.equal(h.writes[1].revision,1);
});

test('a replaced ownership binding invalidates a stale page before any upload',async () => {
  const h = setup();await h.engine.start(USER_A);
  const binding = JSON.parse(h.storage.getItem(Sync.META_KEY));h.storage.setItem(Sync.META_KEY,JSON.stringify({...binding,binding:'new-tab'}));
  h.storage.setItem(KEY,raw(4));const result = h.engine.changed();assert.equal(result.status,'error');assert.equal(result.canPlay,false);assert.equal(result.reason,'SESSION_CHANGED');
  await h.engine.flush();assert.equal(h.writes.length,0);
});

test('a stopped in-flight upload cannot change account metadata or reactivate play',async () => {
  const wait = deferred(), h = setup({write:() => wait.promise});await h.engine.start(USER_A);
  h.storage.setItem(KEY,raw(4));h.engine.changed();const request = h.engine.flush();const before = h.storage.getItem(Sync.META_KEY);
  h.engine.stop();wait.resolve({revision:2,updatedAt:WHEN});await request;
  assert.equal(h.engine.getState().status,'stopped');assert.equal(h.storage.getItem(Sync.META_KEY),before);assert.equal(h.timers.size,0);
});

test('an invalid local snapshot never uploads and blocks play rather than resetting data',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,'damaged');
  assert.equal(h.engine.changed().status,'error');assert.equal(h.storage.getItem(KEY),'damaged');assert.equal(h.writes.length,0);
});

test('a storage failure while replacing a park restores the previous local park and owner',async () => {
  const h = setup({local:7});await h.engine.start(USER_A);
  const original = h.storage.setItem;let blocked = true;
  h.storage.setItem = (key,value) => {if (blocked && key === Sync.META_KEY) {blocked = false;throw error('STORAGE_WRITE');}original.call(h.storage,key,value);};
  const result = await h.engine.useCloud();assert.equal(result.canPlay,false);assert.equal(localHeight(h),7);assert.equal(h.storage.getItem(Sync.META_KEY),null);
});

test('blocked recovery storage prevents a destructive restore and preserves the original park',async () => {
  const h = setup({local:7});await h.engine.start(USER_A);const original = h.storage.setItem;
  h.storage.setItem = (key,value) => {if (key === Sync.RECOVERY_KEY) throw error('STORAGE_WRITE');original.call(h.storage,key,value);};
  assert.equal((await h.engine.useCloud()).canPlay,false);assert.equal(localHeight(h),7);assert.equal(h.writes.length,0);
});

test('an idle remote check pauses before changing even a clean running world',async () => {
  const h = setup();await h.engine.start(USER_A);const replacements = h.changed();h.setRemote(remote(22,2));
  const result = await h.engine.check();assert.equal(result.status,'conflict');assert.equal(result.canPlay,false);
  assert.equal(localHeight(h),3);assert.equal(h.changed(),replacements);assert.equal(h.writes.length,0);
});

test('an idle check keeps pending local progress when its cloud base is unchanged',async () => {
  const h = setup();await h.engine.start(USER_A);h.storage.setItem(KEY,raw(4));h.engine.changed();
  const result = await h.engine.check();assert.equal(result.canPlay,true);assert.equal(result.status,'pending');assert.equal(h.timers.size,1);
  assert.equal(localHeight(h),4);assert.equal(h.writes.length,0);
});

test('remote polling recovers a clean offline park without an unnecessary upload',async () => {
  const h = setup();await h.engine.start(USER_A);h.setReadError(error('NETWORK'));
  assert.equal((await h.engine.check()).status,'offline');assert.equal(h.engine.getState().canPlay,true);
  h.setReadError(null);assert.equal((await h.engine.check()).status,'ready');assert.equal(h.writes.length,0);
});

test('every read and write carries the park owner identity, including choices, polling and CAS refresh',async () => {
  const h = setup({local:7});await h.engine.start(USER_A);await h.engine.keepLocal();await h.engine.check();
  h.storage.setItem(KEY,raw(8));h.engine.changed();h.setRemote(remote(20,3));await h.engine.flush();await h.engine.useCloud();
  assert(h.reads.length >= 5);assert(h.reads.every(id => id === USER_A.id));
  assert(h.writes.length >= 2);assert(h.writes.every(call => call.expectedUserId === USER_A.id));
});

test('a requested flush during an upload drains the newer captured progress before resolving',async () => {
  const wait = deferred();let count = 0;
  const h = setup({write:async () => ++count === 1 ? wait.promise : {revision:3,updatedAt:WHEN}});
  await h.engine.start(USER_A);h.storage.setItem(KEY,raw(4));h.engine.changed();const first = h.engine.flush();
  h.storage.setItem(KEY,raw(5));h.engine.changed();const requested = h.engine.flush();
  wait.resolve({revision:2,updatedAt:WHEN});await first;const result = await requested;
  assert.equal(h.writes.length,2);assert.equal(uploadedHeight(h.writes[1].backup),5);assert.equal(h.writes[1].revision,2);
  assert.equal(result.dirty,false);assert.equal(result.revision,3);assert.equal(h.timers.size,0);
});

test('a requested flush does not repeatedly retry a failed upload or discard its newer local changes',async () => {
  const wait = deferred(), h = setup({write:() => wait.promise});
  await h.engine.start(USER_A);h.storage.setItem(KEY,raw(4));h.engine.changed();const first = h.engine.flush();
  h.storage.setItem(KEY,raw(5));h.engine.changed();const requested = h.engine.flush();wait.reject(error('NETWORK'));
  await first;const result = await requested;assert.equal(result.status,'offline');assert.equal(result.dirty,true);assert.equal(result.canPlay,true);
  assert.equal(h.writes.length,1);assert.equal(localHeight(h),5);
});
