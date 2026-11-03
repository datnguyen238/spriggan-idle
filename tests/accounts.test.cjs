const test = require('node:test');
const assert = require('node:assert/strict');
const Saves = require('../dist/shared/account-storage.js');
const { createAccounts, AUTOSAVE_MS } = require('../dist/shared/accounts.js');
const Slots = require('../dist/slots/slots-life.js');
const Pond = require('../dist/pond/pond-life.js');

const SLOT = 'spriggan.slots.v1';
const KITCHEN = 'spriggan.dumplings.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const user = (uid, emailVerified = true) => ({ uid, email: uid + '@example.test', emailVerified });
const wallet = balance => ({ [SLOT]: JSON.stringify({ version: 3, balance, spins: 0 }) });
const guest = {
  [KITCHEN]: JSON.stringify({ shop: { coins: 30, earningsId: 'guest-kitchen' } }),
  [SLOT]: JSON.stringify({ balance: 220, kitchenCredits: { 'guest-kitchen': 20 } })
};
const cloud = (entries, revision = 1) => ({ entries: clone(entries), revision });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key))
  };
}
function clock() {
  let now = 0, serial = 0;
  const jobs = new Map();
  return {
    schedule(fn, delay) { const id = ++serial; jobs.set(id, { at: now + delay, fn }); return id; },
    cancel(id) { jobs.delete(id); },
    async tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...jobs.entries()].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; jobs.delete(next[0]); next[1].fn(); await settle();
      }
      now = end; await settle();
    },
    get pending() { return jobs.size; }
  };
}
function emit(events, type, detail) {
  const event = new Event(type);
  if (detail !== undefined) Object.defineProperty(event, 'detail', { value: detail });
  events.dispatchEvent(event);
}

function fixture(options = {}) {
  const raw = options.raw || memory(options.guest || guest);
  if (options.active) Saves.setActive(raw, options.active);
  const events = new EventTarget(), timers = clock(), calls = [], observers = new Set();
  const remotes = new Map(Object.entries(options.remotes || {}));
  let current = options.user || null;
  let readError = options.readError || null, writeError = null, verifyError = null, writeGate = null, readGate = null, deleteGate = null;
  const provider = {
    get currentUser() { return current && clone(current); },
    async authReady() { return current && clone(current); },
    subscribe(fn) { observers.add(fn); queueMicrotask(() => fn(current && clone(current))); return () => observers.delete(fn); },
    async register(email) { calls.push(['register', email]); current = user('new-player', false); notify(); return clone(current); },
    async signIn(email) { current = user(email.split('@')[0]); calls.push(['signin', current.uid]); notify(); return clone(current); },
    async signOut(expectedUid) {
      if (expectedUid !== undefined && current?.uid !== expectedUid) throw Object.assign(Error('wrong-user'), { code: 'account/wrong-user' });
      calls.push(['signout']); current = null; notify();
    },
    async sendVerification() { calls.push(['verify']); if (verifyError) throw verifyError; },
    async refreshUser() { current.emailVerified = true; calls.push(['refresh']); return clone(current); },
    async resetPassword(email) { calls.push(['reset', email]); },
    async reauthenticate() { calls.push(['reauth']); },
    async deleteUser(expectedUid) {
      if (expectedUid !== undefined && current?.uid !== expectedUid) throw Object.assign(Error('wrong-user'), { code: 'account/wrong-user' });
      calls.push(['delete-user', current?.uid]); current = null; notify();
    },
    async readSave(uid) {
      calls.push(['read', uid]);
      if (readGate) await readGate.promise;
      if (readError) throw readError;
      return remotes.has(uid) ? clone(remotes.get(uid)) : null;
    },
    async writeSave(uid, entries, revision) {
      calls.push(['write', uid, revision, clone(entries)]);
      if (writeGate) await writeGate.promise;
      if (writeError) throw writeError;
      const actual = remotes.get(uid)?.revision || 0;
      if (actual !== revision) throw Object.assign(Error('conflict'), { code: 'account/conflict' });
      remotes.set(uid, cloud(entries, revision + 1)); return revision + 1;
    },
    async deleteSave(uid) { calls.push(['delete-save', uid]); if (deleteGate) await deleteGate.promise; remotes.delete(uid); }
  };
  function notify() { queueMicrotask(() => { for (const fn of observers) fn(current && clone(current)); }); }
  const api = createAccounts({
    saves: Saves, store: Saves.create(raw, { events }), events, document: options.document,
    providerFactory: { async connect() { calls.push(['connect']); if (options.connectError) throw options.connectError; return provider; } },
    config: options.configured === false ? null : { projectId: 'test-only' },
    accountPage: options.accountPage !== false,
    schedule: timers.schedule, cancel: timers.cancel,
    withLock: fn => fn()
  });
  return {
    api, raw, events, timers, calls, remotes, provider,
    setReadError(error) { readError = error; },
    setWriteError(error) { writeError = error; },
    setVerifyError(error) { verifyError = error; },
    holdWrites() { return writeGate = deferred(); },
    holdReads() { return readGate = deferred(); },
    holdDeletion() { return deleteGate = deferred(); },
    selectUser(uid) { current = user(uid); notify(); }
  };
}
function seedAccount(raw, uid, entries, revision, dirty) {
  Saves.setActive(raw, uid);
  Saves.create(raw, { uid, events: null }).replace(entries, revision, { dirty });
}
function assertGuestUnchanged(raw) { for (const [key, value] of Object.entries(guest)) assert.equal(raw.getItem(key), value); }
function winKoi(f) {
  const state = Slots.decode(f.api.storage.getItem(SLOT)) || Slots.create();
  const result = Slots.spin(state, () => 0);
  assert.equal(result.kind, 'triple');
  f.api.storage.setItem(SLOT, JSON.stringify(state));
  return state;
}
function claimKoi(f, state) {
  assert.equal(Slots.claimGolden(state, f.api.storage, Pond).status, 'claimed');
  return f.api.storage.snapshot();
}
function assertClaimedKoi(entries) {
  const pond = Pond.decode(entries[Pond.KEY]);
  const slots = Slots.decode(entries[SLOT]);
  assert.ok(pond, 'pond must travel with its prize receipt');
  assert.equal(pond.fish.filter(fish => fish.id === Slots.GOLDEN_FISH_ID && fish.golden).length, 1);
  assert.deepEqual(Slots.reward(slots, 'pond'), { won: 1, claimed: 1 });
}

test('significant events in the same turn coalesce into one immediate account upload', async()=>{
 const f=fixture({user:user('events'),remotes:{events:cloud(wallet(200),1)}});await f.api.ready;
 f.api.storage.setItem(SLOT,wallet(210)[SLOT]);const first=f.api.saveProgress();
 f.api.storage.setItem(SLOT,wallet(220)[SLOT]);const second=f.api.saveProgress();
 await Promise.all([first,second]);
 assert.equal(f.calls.filter(call=>call[0]==='write').length,1);
 assert.equal(JSON.parse(f.remotes.get('events').entries[SLOT]).balance,220);
 assert.equal(f.api.storage.state().dirty,false);
});

test('a significant event during an upload gets a trailing checkpoint before that event resolves',async()=>{
 const f=fixture({user:user('events'),remotes:{events:cloud(wallet(200),1)}});await f.api.ready;
 const gate=f.holdWrites();f.api.storage.setItem(SLOT,wallet(210)[SLOT]);const first=f.api.saveProgress();await settle();
 f.api.storage.setItem(SLOT,wallet(230)[SLOT]);let finished=false;const second=f.api.saveProgress().then(()=>{finished=true});await settle();
 assert.equal(finished,false);assert.equal(f.calls.filter(call=>call[0]==='write').length,1);
 gate.resolve();await Promise.all([first,second]);
 assert.equal(f.calls.filter(call=>call[0]==='write').length,2);
 assert.equal(JSON.parse(f.remotes.get('events').entries[SLOT]).balance,230);
});

test('ordinary ticks during an event upload stay queued without extending its completion',async()=>{
 const f=fixture({user:user('events'),remotes:{events:cloud(wallet(200),1)}});await f.api.ready;
 const gate=f.holdWrites();f.api.storage.setItem(SLOT,wallet(210)[SLOT]);const saving=f.api.saveProgress();await settle();
 f.api.storage.setItem(SLOT,wallet(211)[SLOT]);gate.resolve();await saving;
 assert.equal(f.calls.filter(call=>call[0]==='write').length,1);
 assert.equal(JSON.parse(f.remotes.get('events').entries[SLOT]).balance,210);
 assert.equal(f.api.storage.state().dirty,true);
});

test('an event upload failure preserves local progress and the next event retries it',async()=>{
 const f=fixture({user:user('events'),remotes:{events:cloud(wallet(200),1)}});await f.api.ready;
 f.setWriteError(Object.assign(Error('offline'),{code:'unavailable'}));f.api.storage.setItem(SLOT,wallet(210)[SLOT]);
 await assert.rejects(f.api.saveProgress(),{code:'unavailable'});
 assert.equal(f.api.storage.state().dirty,true);assert.equal(f.api.state.status,'offline');
 assert.equal(JSON.parse(f.remotes.get('events').entries[SLOT]).balance,200);
 f.setWriteError(null);await f.api.saveProgress();
 assert.equal(JSON.parse(f.remotes.get('events').entries[SLOT]).balance,210);
});

test('significant-event saving keeps guest and unverified play local',async()=>{
 for(const who of [null,user('unverified',false)]){
  const f=fixture({user:who});await f.api.ready;
  f.api.storage.setItem(SLOT,wallet(210)[SLOT]);await f.api.saveProgress();
  assert.equal(f.calls.filter(call=>call[0]==='write').length,0);
 }
});

test('significant events cannot upload defaults before a fresh cloud save has loaded',async()=>{
 const f=fixture({user:user('events'),readError:Object.assign(Error('offline'),{code:'unavailable'})});await f.api.ready;
 await assert.rejects(f.api.saveProgress(),{code:'account/save-not-loaded'});
 assert.equal(f.calls.filter(call=>call[0]==='write').length,0);assert.deepEqual(f.api.storage.snapshot(),{});
});

test('changing accounts during an event upload rejects the event and preserves the newly selected cache',async()=>{
 const f=fixture({user:user('events'),remotes:{events:cloud(wallet(200),1)}});await f.api.ready;
 const gate=f.holdWrites();f.api.storage.setItem(SLOT,wallet(210)[SLOT]);
 const rejected=assert.rejects(f.api.saveProgress(),{code:'account/changed'});await settle();
 seedAccount(f.raw,'other',wallet(900),8,false);gate.resolve();await rejected;
 assert.equal(JSON.parse(Saves.create(f.raw,{events:null}).getItem(SLOT)).balance,900);
 assert.equal(f.api.state.status,'changed');
});

test('unconfigured accounts make no provider request and preserve every guest byte', async () => {
  const f = fixture({ configured: false });
  await f.api.ready;
  assert.equal(f.api.state.status, 'setup');
  assert.equal(f.api.state.loading, false);
  assert.equal(f.api.storage.uid, null);
  assert.deepEqual(f.calls, []);
  assertGuestUnchanged(f.raw);
  await assert.rejects(f.api.signIn('alice@example.test', 'password'), { code: 'account/not-configured' });
  assertGuestUnchanged(f.raw);
  f.api.dispose();
});

test('sign-in loads each account independently without silently importing guest worlds', async () => {
  const f = fixture({ remotes: { alice: cloud(wallet(80)), bob: cloud(wallet(150)) } });
  await f.api.ready;
  await f.api.signIn('alice@example.test', 'password');
  assert.equal(f.api.storage.uid, 'alice');
  assert.deepEqual(f.api.storage.snapshot(), wallet(80));
  assert.equal(f.api.storage.getItem(KITCHEN), null);
  await f.api.signOut();
  assert.deepEqual(f.api.storage.snapshot(), guest);
  await f.api.signIn('bob@example.test', 'password');
  assert.deepEqual(f.api.storage.snapshot(), wallet(150));
  assertGuestUnchanged(f.raw);
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 0);
  f.api.dispose();
});

test('signup explicitly imports the complete coupled guest bundle but waits for email verification', async () => {
  const f = fixture();
  await f.api.ready;
  await f.api.register('new@example.test', 'long-enough-password', { importGuest: true });
  assert.equal(f.api.state.status, 'unverified');
  assert.deepEqual(f.api.storage.snapshot(), guest);
  assert.equal(f.api.storage.state().dirty, true);
  assertGuestUnchanged(f.raw);
  await f.timers.tick(AUTOSAVE_MS * 2);
  assert.equal(f.remotes.size, 0);
  await assert.rejects(f.api.sync(), { code: 'account/verification-required' });
  await f.api.checkVerification();
  await f.api.sync();
  assert.deepEqual(f.remotes.get('new-player'), cloud(guest));
  assert.equal(f.api.storage.state().dirty, false);
  f.api.dispose();
});

test('a verification-mail failure preserves the newly created account and imported worlds', async () => {
  const f = fixture();
  await f.api.ready;
  f.setVerifyError(Object.assign(Error('offline'), { code: 'auth/network-request-failed' }));
  await f.api.register('new@example.test', 'long-enough-password', { importGuest: true });
  assert.equal(f.api.state.user.uid, 'new-player');
  assert.equal(f.api.state.status, 'unverified');
  assert.match(f.api.state.message, /account was created.*verification email could not be sent/i);
  assert.deepEqual(f.api.storage.snapshot(), guest);
  assert.equal(f.calls.filter(call => call[0] === 'register').length, 1);
  f.setVerifyError(null);
  await f.api.sendVerification();
  assert.equal(f.calls.filter(call => call[0] === 'register').length, 1);
  f.api.dispose();
});

test('signup without import starts an independent empty account', async () => {
  const f = fixture();
  await f.api.ready;
  await f.api.register('new@example.test', 'long-enough-password');
  assert.deepEqual(f.api.storage.snapshot(), {});
  assertGuestUnchanged(f.raw);
  f.api.dispose();
});

test('dirty device progress conflicts with a newer cloud revision without changing either save', async () => {
  const raw = memory(guest);
  seedAccount(raw, 'alice', wallet(70), 1, true);
  const f = fixture({ raw, user: user('alice'), remotes: { alice: cloud(wallet(90), 2) } });
  await f.api.ready;
  assert.equal(f.api.state.status, 'conflict');
  assert.deepEqual(f.api.storage.snapshot(), wallet(70));
  assert.deepEqual(f.remotes.get('alice'), cloud(wallet(90), 2));
  await assert.rejects(f.api.sync(), { code: 'account/conflict' });
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 0);
  f.api.dispose();
});

test('choosing device progress uses the latest cloud revision before writing', async () => {
  const raw = memory(guest);
  seedAccount(raw, 'alice', wallet(70), 1, true);
  const f = fixture({ raw, user: user('alice'), remotes: { alice: cloud(wallet(90), 2) } });
  await f.api.ready;
  f.remotes.set('alice', cloud(wallet(95), 3));
  await f.api.resolveConflict('device');
  assert.deepEqual(f.remotes.get('alice'), cloud(wallet(70), 4));
  assert.equal(f.api.storage.state().dirty, false);
  assertGuestUnchanged(raw);
  f.api.dispose();
});

test('choosing cloud progress retains a backup and invalidates stale same-account world tabs', async () => {
  const raw = memory(guest);
  seedAccount(raw, 'alice', wallet(70), 1, true);
  const f = fixture({ raw, user: user('alice'), remotes: { alice: cloud(wallet(90), 2) } });
  await f.api.ready;
  const staleWorld = Saves.create(raw, { events: null });
  await f.api.resolveConflict('cloud');
  assert.deepEqual(f.api.storage.snapshot(), wallet(90));
  assert.equal(f.api.storage.state().dirty, false);
  const backup = JSON.parse(raw.getItem('spriggan.account.backup.v1:alice'));
  assert.deepEqual(backup.entries, wallet(70));
  assert.throws(() => staleWorld.setItem(SLOT, wallet(0)[SLOT]), { code: 'account/changed' });
  assertGuestUnchanged(raw);
  f.api.dispose();
});

test('changes made during an upload remain dirty and are sent in a later revision', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(100)) } });
  await f.api.ready;
  f.api.storage.setItem(SLOT, wallet(110)[SLOT]);
  const gate = f.holdWrites(), sending = f.api.sync();
  await settle();
  f.api.storage.setItem(SLOT, wallet(120)[SLOT]);
  gate.resolve(); await sending;
  assert.deepEqual(f.remotes.get('alice'), cloud(wallet(110), 2));
  assert.deepEqual(f.api.storage.snapshot(), wallet(120));
  assert.equal(f.api.storage.state().dirty, true);
  assert.equal(f.api.storage.state().revision, 2);
  await f.timers.tick(AUTOSAVE_MS);
  assert.deepEqual(f.remotes.get('alice'), cloud(wallet(120), 3));
  assert.equal(f.api.storage.state().dirty, false);
  f.api.dispose();
});

test('continuous local farm-like writes cannot postpone the bounded autosave indefinitely', async () => {
  const f = fixture({ user: user('alice'), active: 'alice' });
  await f.api.ready;
  for (let i = 0; i < 60; i++) {
    f.api.storage.setItem(SLOT, wallet(i)[SLOT]);
    await f.timers.tick(1000);
  }
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 1);
  assert.deepEqual(f.remotes.get('alice'), cloud(wallet(59)));
  f.api.dispose();
});

test('offline dirty worlds survive controller recreation and sync after reconnect', async () => {
  const raw = memory(guest);
  seedAccount(raw, 'alice', wallet(77), 1, true);
  const offline = Object.assign(Error('offline'), { code: 'unavailable' });
  const first = fixture({ raw, user: user('alice'), readError: offline });
  await first.api.ready;
  assert.equal(first.api.state.status, 'offline');
  assert.equal(first.api.storage.state().dirty, true);
  first.api.dispose();
  const second = fixture({ raw, user: user('alice'), readError: offline, remotes: { alice: cloud(wallet(60)) } });
  await second.api.ready;
  assert.deepEqual(second.api.storage.snapshot(), wallet(77));
  second.setReadError(null);
  emit(second.events, 'online'); await settle();
  assert.deepEqual(second.remotes.get('alice'), cloud(wallet(77), 2));
  assert.equal(second.api.storage.state().dirty, false);
  assertGuestUnchanged(raw);
  second.api.dispose();
});

test('explicit guest import preserves kitchen spending receipts alongside earnings', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(90), 4) } });
  await f.api.ready;
  const staleWorld = Saves.create(f.raw, { events: null });
  await f.api.importGuest();
  assert.deepEqual(f.api.storage.snapshot(), guest);
  assert.deepEqual(f.remotes.get('alice'), cloud(guest, 5));
  assert.throws(() => staleWorld.setItem(SLOT, wallet(0)[SLOT]), { code: 'account/changed' });
  assertGuestUnchanged(f.raw);
  f.api.dispose();
});

test('guest import waits for an active upload and uses its resulting revision', async () => {
  const f = fixture({ user: user('alice'), remotes: { alice: cloud(wallet(90), 4) } });
  await f.api.ready;
  f.api.storage.setItem(SLOT, wallet(100)[SLOT]);
  const gate = f.holdWrites(), sending = f.api.sync();
  await settle();
  const reads = f.calls.filter(call => call[0] === 'read').length;
  const importing = f.api.importGuest();
  await settle();
  assert.equal(f.calls.filter(call => call[0] === 'read').length, reads);
  assert.deepEqual(f.api.storage.snapshot(), wallet(100));
  gate.resolve(); await Promise.all([sending, importing]);
  assert.deepEqual(f.remotes.get('alice'), cloud(guest, 6));
  assert.deepEqual(f.api.storage.snapshot(), guest);
  assert.equal(f.api.storage.state().dirty, false);
  assert.equal(f.api.state.status, 'synced');
  assertGuestUnchanged(f.raw);
  f.api.dispose();
});

test('manual and automatic sync wait while guest import reads the cloud revision', async () => {
  const f = fixture({ user: user('alice'), remotes: { alice: cloud(wallet(90), 4) } });
  await f.api.ready;
  f.api.storage.setItem(SLOT, wallet(100)[SLOT]);
  const gate = f.holdReads(), importing = f.api.importGuest();
  await settle();
  let finished = false;
  const sending = f.api.sync().then(() => { finished = true; });
  emit(f.events, 'online');
  await settle();
  assert.equal(finished, false);
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 0);
  gate.resolve(); await Promise.all([importing, sending]);
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 1);
  assert.deepEqual(f.remotes.get('alice'), cloud(guest, 5));
  assert.equal(f.api.state.status, 'synced');
  f.api.dispose();
});

test('a failed guest import releases waiting syncs and preserves the account worlds', async () => {
  const f = fixture({ user: user('alice'), remotes: { alice: cloud(wallet(90), 4) } });
  await f.api.ready;
  f.api.storage.setItem(SLOT, wallet(100)[SLOT]);
  const gate = f.holdReads(), importing = assert.rejects(f.api.importGuest(), { code: 'unavailable' });
  await settle();
  const sending = f.api.sync();
  f.setReadError(Object.assign(Error('offline'), { code: 'unavailable' }));
  gate.resolve(); await importing; await sending;
  assert.deepEqual(f.api.storage.snapshot(), wallet(100));
  assert.deepEqual(f.remotes.get('alice'), cloud(wallet(100), 5));
  assert.equal(f.api.storage.state().dirty, false);
  assertGuestUnchanged(f.raw);
  f.api.dispose();
});

test('guest import cannot replace a different account selected while it waits', async t => {
  for (const phase of ['upload', 'read']) await t.test(phase, async () => {
    const f = fixture({ user: user('alice'), remotes: { alice: cloud(wallet(90), 4) } });
    await f.api.ready;
    let gate, sending;
    if (phase === 'upload') {
      f.api.storage.setItem(SLOT, wallet(100)[SLOT]);
      gate = f.holdWrites(); sending = f.api.sync();
      await settle();
    } else gate = f.holdReads();
    const importing = assert.rejects(f.api.importGuest(), { code: 'account/changed' });
    if (sending) sending = assert.rejects(sending, { code: 'account/changed' });
    await settle();
    seedAccount(f.raw, 'bob', wallet(150), 1, false);
    gate.resolve(); await importing; if (sending) await sending;
    assert.deepEqual(Saves.create(f.raw, { events: null }).snapshot(), wallet(150));
    assert.equal(f.calls.filter(call => call[0] === 'write').length, phase === 'upload' ? 1 : 0);
    assert.equal(f.api.state.status, 'changed');
    assertGuestUnchanged(f.raw);
    f.api.dispose();
  });
});

test('sign-out retains the account cache and deletion removes only that account data', async () => {
  const f = fixture({ remotes: { alice: cloud(wallet(90)), bob: cloud(wallet(150)) } });
  await f.api.ready;
  await f.api.signIn('alice@example.test', 'password');
  f.api.storage.setItem(SLOT, wallet(95)[SLOT]);
  await f.api.signOut();
  assert.deepEqual(f.api.storage.snapshot(), guest);
  assert.equal(Saves.create(f.raw, { uid: 'alice', events: null }).getItem(SLOT), wallet(95)[SLOT]);
  await f.api.signIn('alice@example.test', 'password');
  await f.api.deleteAccount('password');
  assert.equal(f.raw.getItem(Saves.accountKey('alice')), null);
  assert.equal(f.remotes.has('alice'), false);
  assert.deepEqual(f.remotes.get('bob'), cloud(wallet(150)));
  assert.deepEqual(f.api.storage.snapshot(), guest);
  assertGuestUnchanged(f.raw);
  assert.ok(f.calls.findIndex(call => call[0] === 'reauth') < f.calls.findIndex(call => call[0] === 'delete-save'));
  assert.ok(f.calls.findIndex(call => call[0] === 'delete-save') < f.calls.findIndex(call => call[0] === 'delete-user'));
  f.api.dispose();
});

test('manual sync of a clean account loads newer cloud worlds and invalidates stale tabs', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(90)) } });
  await f.api.ready;
  const staleWorld = Saves.create(f.raw, { events: null });
  f.remotes.set('alice', cloud(wallet(100), 2));
  await f.api.sync();
  assert.equal(f.api.state.status, 'synced');
  assert.deepEqual(f.api.storage.snapshot(), wallet(100));
  assert.throws(() => staleWorld.setItem(SLOT, wallet(0)[SLOT]), { code: 'account/changed' });
  f.api.dispose();
});

test('clean-account offline recovery checks the server instead of remaining stuck offline', async () => {
  const raw = memory(guest);
  seedAccount(raw, 'alice', wallet(90), 1, false);
  const f = fixture({ raw, user: user('alice'), readError: Object.assign(Error('offline'), { code: 'unavailable' }), remotes: { alice: cloud(wallet(90)) } });
  await f.api.ready;
  assert.equal(f.api.state.status, 'offline');
  f.setReadError(null);
  await f.api.sync();
  assert.equal(f.api.state.status, 'synced');
  assert.deepEqual(f.api.storage.snapshot(), wallet(90));
  f.api.dispose();
});

test('offline sign-out preserves pending account progress and tells the player it remains on this device', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(90)) } });
  await f.api.ready;
  f.api.storage.setItem(SLOT, wallet(100)[SLOT]);
  f.setWriteError(Object.assign(Error('offline'), { code: 'unavailable' }));
  await f.api.signOut();
  assert.equal(f.api.state.status, 'guest');
  assert.match(f.api.state.message, /only on this device/i);
  const cached = Saves.create(f.raw, { uid: 'alice', events: null }).state();
  assert.equal(cached.dirty, true);
  assert.deepEqual(cached.entries, wallet(100));
  assertGuestUnchanged(f.raw);
  f.api.dispose();
});

test('a new account with only pending local world records remains playable after an offline reload', async () => {
  const first = fixture({ user: user('alice') });
  await first.api.ready;
  first.api.storage.setItem(Pond.KEY, '{"fish":[]}');
  assert.equal(first.raw.getItem(Saves.accountKey('alice')), null);
  first.api.dispose();
  const second = fixture({ raw: first.raw, user: user('alice'), readError: Object.assign(Error('offline'), { code: 'unavailable' }) });
  await second.api.ready;
  assert.equal(second.api.state.worldsReady, true);
  assert.equal(second.api.canPlay, true);
  assert.equal(second.api.state.status, 'offline');
  assert.equal(second.api.storage.getItem(Pond.KEY), '{"fish":[]}');
  assert.equal(second.api.storage.state().dirty, true);
  assert.equal(second.calls.filter(call => call[0] === 'write').length, 0);
  second.api.dispose();
});

test('changing the active account during a pending cloud read cannot install old account worlds', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(90)) } });
  const gate = f.holdReads();
  await settle();
  seedAccount(f.raw, 'bob', wallet(150), 1, false);
  gate.resolve(); await f.api.ready;
  assert.equal(f.api.state.status, 'changed');
  assert.equal(f.raw.getItem(Saves.accountKey('alice')), null);
  assert.deepEqual(JSON.parse(f.raw.getItem(Saves.accountKey('bob'))).entries, wallet(150));
  f.api.dispose();
});

test('a user selected in another tab during cloud deletion is never deleted by the old action', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(90)), bob: cloud(wallet(150)) } });
  await f.api.ready;
  const gate = f.holdDeletion(), deletion = f.api.deleteAccount('password');
  await settle();
  seedAccount(f.raw, 'bob', wallet(150), 1, false);
  f.selectUser('bob');
  gate.resolve();
  await assert.rejects(deletion);
  assert.equal(f.provider.currentUser.uid, 'bob');
  assert.deepEqual(f.remotes.get('bob'), cloud(wallet(150)));
  assert.equal(f.calls.filter(call => call[0] === 'delete-user').length, 0);
  assertGuestUnchanged(f.raw);
  f.api.dispose();
});

test('a connection failure while inspecting a conflict keeps progress dirty and leaves the saving state', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(90)) } });
  await f.api.ready;
  f.api.storage.setItem(SLOT, wallet(100)[SLOT]);
  f.remotes.set('alice', cloud(wallet(110), 2));
  f.setReadError(Object.assign(Error('offline'), { code: 'unavailable' }));
  await assert.rejects(f.api.sync(), { code: 'unavailable' });
  assert.equal(f.api.state.status, 'offline');
  assert.equal(f.api.storage.state().dirty, true);
  assert.deepEqual(f.api.storage.snapshot(), wallet(100));
  f.api.dispose();
});

test('a late cloud failure cannot clear the changed-account state or alter the newly selected account', async t => {
  for (const operation of ['read', 'write']) await t.test(operation, async () => {
    const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(90)) } });
    await f.api.ready;
    if (operation === 'write') f.api.storage.setItem(SLOT, wallet(100)[SLOT]);
    const gate = operation === 'write' ? f.holdWrites() : f.holdReads();
    const request = f.api.sync();
    // Attach the rejection handler before releasing the pending request.
    const rejected = assert.rejects(request);
    await settle();
    seedAccount(f.raw, 'bob', wallet(150), 3, false);
    const bobBefore = f.raw.getItem(Saves.accountKey('bob'));
    emit(f.events, 'spriggan:account-changed', { uid: 'alice', activeUid: 'bob' });
    assert.equal(f.api.state.status, 'changed');
    const offline = Object.assign(Error('late network failure'), { code: 'unavailable' });
    if (operation === 'write') f.setWriteError(offline);
    else f.setReadError(offline);
    gate.resolve(); await rejected;
    assert.equal(f.api.state.status, 'changed');
    assert.equal(f.raw.getItem(Saves.accountKey('bob')), bobBefore);
    assert.equal(Saves.readActive(f.raw), 'bob');
    assertGuestUnchanged(f.raw);
    f.api.dispose();
  });
});

test('a golden koi checkpoint survives immediate navigation into a fresh browser session', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', accountPage: false });
  await f.api.ready;
  const state = winKoi(f);
  claimKoi(f, state);
  await f.api.checkpoint();
  assert.equal(f.api.storage.state().dirty, false);
  assertClaimedKoi(f.remotes.get('alice').entries);
  f.api.dispose();
  const fresh = fixture({ user: user('alice'), active: 'alice', accountPage: false, remotes: Object.fromEntries(f.remotes) });
  await fresh.api.ready;
  assertClaimedKoi(fresh.api.storage.snapshot());
  assertGuestUnchanged(f.raw);
  assertGuestUnchanged(fresh.raw);
  fresh.api.dispose();
});

test('a claim checkpoint waits for a post-claim upload when the earlier win upload is still pending', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', accountPage: false });
  await f.api.ready;
  const state = winKoi(f);
  const first = f.holdWrites(), uploadingWin = f.api.sync();
  await settle();
  claimKoi(f, state);
  let finished = false;
  const checkpoint = f.api.checkpoint().then(() => { finished = true; });
  const second = f.holdWrites();
  first.resolve();
  await uploadingWin; await settle();
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 2);
  assert.equal(finished, false, 'navigation must not proceed after only the older win snapshot');
  const firstCloud = f.remotes.get('alice').entries;
  assert.equal(firstCloud[Pond.KEY], undefined);
  assert.deepEqual(Slots.reward(Slots.decode(firstCloud[SLOT]), 'pond'), { won: 1, claimed: 0 });
  second.resolve(); await checkpoint;
  assertClaimedKoi(f.remotes.get('alice').entries);
  assert.equal(f.api.storage.state().dirty, false);
  f.api.dispose();
});

test('an offline prize checkpoint retains both koi and claim receipt for a later retry', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', accountPage: false });
  await f.api.ready;
  claimKoi(f, winKoi(f));
  f.setWriteError(Object.assign(Error('offline'), { code: 'unavailable' }));
  await assert.rejects(f.api.checkpoint(), { code: 'unavailable' });
  assert.equal(f.api.state.status, 'offline');
  assert.equal(f.api.storage.state().dirty, true);
  assertClaimedKoi(f.api.storage.snapshot());
  assert.equal(f.remotes.has('alice'), false);
  f.setWriteError(null);
  emit(f.events, 'online'); await settle();
  assertClaimedKoi(f.remotes.get('alice').entries);
  assert.equal(f.api.storage.state().dirty, false);
  f.api.dispose();
});

test('a prize checkpoint finishes without waiting for unrelated future farm-like edits to stop', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', accountPage: false });
  await f.api.ready;
  claimKoi(f, winKoi(f));
  const gate = f.holdWrites(), checkpoint = f.api.checkpoint();
  await settle();
  for (let i = 0; i < 20; i++) {
    f.api.storage.setItem('spriggan.hex.totals.v1', JSON.stringify({ shooed: i, snacks: 0, storeys: 1 }));
    await settle();
  }
  gate.resolve(); await checkpoint;
  assertClaimedKoi(f.remotes.get('alice').entries);
  assert.equal(f.remotes.get('alice').entries['spriggan.hex.totals.v1'], undefined);
  assert.equal(f.api.storage.state().dirty, true, 'future edits remain queued rather than extending the checkpoint');
  assert.equal(f.api.state.status, 'local', 'newer unsynced edits must not be labelled cloud-saved');
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 1);
  f.api.dispose();
});

test('unverified players keep a local koi while their checkpoint rejects cloud synchronization', async () => {
  const f = fixture({ user: user('alice', false), active: 'alice', accountPage: false });
  await f.api.ready;
  claimKoi(f, winKoi(f));
  await assert.rejects(f.api.checkpoint(), { code: 'account/verification-required' });
  assert.equal(f.api.state.status, 'unverified');
  assertClaimedKoi(f.api.storage.snapshot());
  assert.equal(f.api.storage.state().dirty, true);
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 0);
  f.api.dispose();
});

test('reopening the original browser retries a pending koi save without another minute of waiting', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', accountPage: false });
  await f.api.ready;
  claimKoi(f, winKoi(f));
  f.api.dispose();
  assert.equal(f.remotes.has('alice'), false);
  const reopened = fixture({ raw: f.raw, user: user('alice'), accountPage: false });
  await reopened.api.ready;
  await reopened.timers.tick(0);
  assertClaimedKoi(reopened.remotes.get('alice').entries);
  assert.equal(reopened.api.storage.state().dirty, false);
  assert.equal(reopened.calls.filter(call => call[0] === 'write').length, 1);
  reopened.api.dispose();
});

test('leaving or hiding a page flushes the current worlds and attempts their checkpoint', async t => {
  for (const type of ['pagehide', 'visibilitychange']) await t.test(type, async () => {
    const document = new EventTarget(); document.hidden = false;
    const f = fixture({ user: user('alice'), active: 'alice', accountPage: false, document });
    await f.api.ready;
    claimKoi(f, winKoi(f));
    let flushed = false;
    f.events.addEventListener('spriggan:flush', () => {
      flushed = true;
      f.api.storage.setItem('spriggan.hex.totals.v1', JSON.stringify({ shooed: 7, snacks: 0, storeys: 1 }));
    });
    if (type === 'visibilitychange') { document.hidden = true; emit(document, type); }
    else emit(f.events, type);
    await settle();
    assert.equal(flushed, true);
    assertClaimedKoi(f.remotes.get('alice').entries);
    assert.equal(JSON.parse(f.remotes.get('alice').entries['spriggan.hex.totals.v1']).shooed, 7);
    f.api.dispose();
  });
});

test('a fresh account blocks game readiness and checkpoints until its saved worlds have loaded', async () => {
  const pond = Pond.create(); pond.fish.push(Pond.makeFish(5, Date.now(), true));
  const entries = { [Pond.KEY]: JSON.stringify(pond) }, offline = Object.assign(Error('offline'), { code: 'unavailable' });
  const f = fixture({ user: user('alice'), active: 'alice', readError: offline, accountPage: false, remotes: { alice: cloud(entries, 7) } });
  await f.api.ready;
  assert.equal(f.api.state.worldsReady, false);
  assert.equal(f.api.canPlay, false);
  assert.equal(f.raw.getItem(Saves.accountKey('alice')), null, 'failed first load must not create an empty account snapshot');
  await assert.rejects(f.api.checkpoint(), { code: 'account/save-not-loaded' });
  let flushed = false; f.events.addEventListener('spriggan:flush', () => { flushed = true; });
  emit(f.events, 'pagehide'); await f.timers.tick(AUTOSAVE_MS);
  assert.equal(flushed, false, 'no game save should be requested before account hydration');
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 0);
  assert.deepEqual(f.remotes.get('alice'), cloud(entries, 7));
  await assert.rejects(f.api.sync(), { code: 'unavailable' });
  assert.equal(f.api.state.worldsReady, false);
  f.setReadError(null); await f.api.sync();
  assert.equal(f.api.state.worldsReady, true);
  assert.equal(f.api.canPlay, true);
  assert.equal(Pond.decode(f.api.storage.getItem(Pond.KEY)).fish.length, 6);
  assert.equal(f.api.storage.state().revision, 7);
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 0, 'retry loads server progress without writing starter worlds');
  f.api.dispose();
});

test('valid cached account worlds remain playable offline, including an intentionally empty pond', async t => {
  for (const count of [0, 5]) await t.test(`${count} saved fish`, async () => {
    const raw = memory(guest), pond = Pond.create(); pond.fish = pond.fish.slice(0, count);
    const entries = { [Pond.KEY]: JSON.stringify(pond) }; seedAccount(raw, 'alice', entries, 4, false);
    const before = raw.getItem(Saves.accountKey('alice'));
    const f = fixture({ raw, user: user('alice'), readError: Object.assign(Error('offline'), { code: 'unavailable' }) });
    await f.api.ready;
    assert.equal(f.api.state.worldsReady, true);
    assert.equal(f.api.canPlay, true);
    assert.equal(Pond.decode(f.api.storage.getItem(Pond.KEY)).fish.length, count);
    assert.equal(raw.getItem(Saves.accountKey('alice')), before);
    assert.equal(f.calls.filter(call => call[0] === 'write').length, 0);
    f.api.dispose();
  });
});

test('an authoritative no-save result allows a new account world to start', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', accountPage: false });
  await f.api.ready;
  assert.equal(f.api.state.worldsReady, true);
  assert.equal(f.api.canPlay, true);
  assert.deepEqual(f.api.storage.snapshot(), {});
  assert.equal(f.calls.filter(call => call[0] === 'read').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 0);
  f.api.dispose();
});

test('switching accounts resets world readiness while the newly selected save is pending', async () => {
  const f = fixture({ user: user('alice'), active: 'alice', remotes: { alice: cloud(wallet(90)), bob: cloud(wallet(110), 3) } });
  await f.api.ready;
  assert.equal(f.api.canPlay, true);
  const aliceBefore = f.raw.getItem(Saves.accountKey('alice'));
  const gate = f.holdReads(), signingIn = f.api.signIn('bob@example.test', 'password');
  await settle();
  assert.equal(f.api.state.user.uid, 'bob');
  assert.equal(f.api.state.worldsReady, false);
  assert.equal(f.api.canPlay, false);
  gate.resolve(); await signingIn;
  assert.equal(f.api.state.worldsReady, true);
  assert.equal(f.api.canPlay, true);
  assert.deepEqual(f.api.storage.snapshot(), wallet(110));
  assert.equal(f.raw.getItem(Saves.accountKey('alice')), aliceBefore);
  f.api.dispose();
});

test('guest play remains ready when authentication cannot connect and no account namespace is selected', async () => {
  const f = fixture({ connectError: Object.assign(Error('offline'), { code: 'unavailable' }) });
  await f.api.ready;
  assert.equal(f.api.state.worldsReady, true);
  assert.equal(f.api.canPlay, true);
  assert.equal(f.api.storage.uid, null);
  assertGuestUnchanged(f.raw);
  f.api.dispose();
});
