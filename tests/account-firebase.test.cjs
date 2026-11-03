const test = require('node:test');
const assert = require('node:assert/strict');
const { createProvider, connect, validateSave } = require('../dist/shared/account-firebase.js');

function fixture(initial = null) {
  const auth = { currentUser: { uid: 'alice', email: 'alice@example.test', emailVerified: true } };
  let record = initial;
  const calls = [];
  const sdk = {
    doc: (_db, ...path) => path.join('/'),
    serverTimestamp: () => 'server-time',
    getDocFromServer: async ref => { calls.push(['read', ref]); return snap(); },
    runTransaction: async (_db, callback) => callback({
      get: async () => snap(),
      set: (ref, value) => { calls.push(['write', ref]); record = value; }
    }),
    deleteDoc: async ref => { calls.push(['delete', ref]); record = null; },
    onAuthStateChanged: (_auth, next) => { queueMicrotask(() => next(auth.currentUser)); return () => calls.push(['unsubscribe']); },
    createUserWithEmailAndPassword: async (_auth, email) => { calls.push(['register', email]); auth.currentUser.emailVerified = false; return { user: auth.currentUser }; },
    signInWithEmailAndPassword: async (_auth, email) => { calls.push(['signin', email]); return { user: auth.currentUser }; },
    signOut: async () => { auth.currentUser = null; },
    sendEmailVerification: async (user, settings) => calls.push(['verify', user.uid, settings]),
    sendPasswordResetEmail: async (_auth, email, settings) => calls.push(['reset', email, settings]),
    reload: async () => { calls.push(['reload']); auth.currentUser.emailVerified = true; },
    getIdToken: async (_user, force) => { calls.push(['token', force]); return 'token'; },
    EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
    reauthenticateWithCredential: async (user, credential) => { calls.push(['reauth', credential.email]); return { user }; },
    deleteUser: async () => { calls.push(['delete-user']); auth.currentUser = null; }
  };
  function snap() { return { exists: () => record !== null, data: () => record }; }
  const provider = createProvider(sdk, { auth, db: {}, continueURL: 'https://existing.vercel.app/account/' });
  return { provider, auth, sdk, calls, get record() { return record; } };
}

const entries = {
  'spriggan.dumplings.v1': JSON.stringify({ shop: { coins: 30, earningsId: 'kitchen-1' } }),
  'spriggan.slots.v1': JSON.stringify({ balance: 220, kitchenCredits: { 'kitchen-1': 20 } })
};

test('unconfigured provider refuses setup without loading a Firebase module', async () => {
  await assert.rejects(connect(null), { code: 'account/not-configured' });
});

test('first write creates one revisioned snapshot containing coupled kitchen and wallet records', async () => {
  const f = fixture();
  assert.equal(await f.provider.writeSave('alice', entries, 0), 1);
  assert.deepEqual(f.record, { format: 1, entries, revision: 1, updatedAt: 'server-time' });
  assert.deepEqual(f.calls, [['write', 'users/alice/saves/current']]);
});

test('stale expected revision cannot overwrite newer cloud progress', async () => {
  const old = { format: 1, revision: 4, entries, updatedAt: 'earlier' };
  const f = fixture(old);
  await assert.rejects(f.provider.writeSave('alice', { 'spriggan.slots.v1': '{"balance":0}' }, 3), { code: 'account/conflict' });
  assert.deepEqual(f.record, old);
  assert.equal(f.calls.length, 0);
});

test('deleted cloud snapshots also conflict with a device carrying an old revision', async () => {
  const f = fixture();
  await assert.rejects(f.provider.writeSave('alice', entries, 2), { code: 'account/conflict' });
  assert.equal(f.record, null);
});

test('owner and verified-email checks protect reads, writes and deletion', async () => {
  const f = fixture();
  await assert.rejects(f.provider.readSave('bob'), { code: 'account/wrong-user' });
  await assert.rejects(f.provider.writeSave('bob', entries, 0), { code: 'account/wrong-user' });
  await assert.rejects(f.provider.deleteSave('bob'), { code: 'account/wrong-user' });
  f.auth.currentUser.emailVerified = false;
  await assert.rejects(f.provider.readSave('alice'), { code: 'account/verification-required' });
  await assert.rejects(f.provider.writeSave('alice', entries, 0), { code: 'account/verification-required' });
  assert.equal(f.calls.length, 0);
});

test('switching users while reading a snapshot cannot return another account data', async () => {
  const f = fixture({ format: 1, revision: 1, entries, updatedAt: 'earlier' });
  f.sdk.getDocFromServer = async () => {
    f.auth.currentUser = { uid: 'bob', emailVerified: true };
    return { exists: () => true, data: () => f.record };
  };
  await assert.rejects(f.provider.readSave('alice'), { code: 'account/wrong-user' });
});

test('switching users inside a transaction does not stage a write', async () => {
  const f = fixture();
  f.sdk.runTransaction = async (_db, callback) => callback({
    get: async () => { f.auth.currentUser = { uid: 'bob', emailVerified: true }; return { exists: () => false }; },
    set: () => assert.fail('must not write after switching users')
  });
  await assert.rejects(f.provider.writeSave('alice', entries, 0), { code: 'account/wrong-user' });
});

test('unrelated storage, malformed JSON and oversized UTF-8 content never reach the database', async () => {
  const f = fixture();
  for (const payload of [
    { firebaseToken: '"secret"' },
    { 'spriggan.slots.v1': 'broken' },
    { 'spriggan.slots.v1': JSON.stringify('🐟'.repeat(120000)) }
  ]) await assert.rejects(f.provider.writeSave('alice', payload, 0));
  assert.equal(f.calls.length, 0);
  assert.throws(() => validateSave({ format: 2, revision: 1, entries }), { code: 'account/invalid-save' });
});

test('registration and verification are separate operations with current-site continuation', async () => {
  const f = fixture();
  assert.equal((await f.provider.register('  alice@example.test  ', 'some-password')).emailVerified, false);
  assert.deepEqual(f.calls, [['register', 'alice@example.test']]);
  await f.provider.sendVerification();
  await f.provider.resetPassword(' alice@example.test ');
  const settings = { url: 'https://existing.vercel.app/account/', handleCodeInApp: false };
  assert.deepEqual(f.calls[1], ['verify', 'alice', settings]);
  assert.deepEqual(f.calls[2], ['reset', 'alice@example.test', settings]);
});

test('verification refresh forces a new auth token before verified cloud access', async () => {
  const f = fixture();
  f.auth.currentUser.emailVerified = false;
  assert.equal((await f.provider.refreshUser()).emailVerified, true);
  assert.deepEqual(f.calls, [['reload'], ['token', true]]);
});

test('restored session exposes only public identity and unsubscribes the initial observer', async () => {
  const f = fixture();
  assert.deepEqual(await f.provider.authReady(), { uid: 'alice', email: 'alice@example.test', emailVerified: true });
  await Promise.resolve();
  assert.deepEqual(f.calls, [['unsubscribe']]);
});

test('a delayed deletion or sign-out cannot affect a newly selected account', async () => {
  const f = fixture();
  f.auth.currentUser = { uid: 'bob', email: 'bob@example.test', emailVerified: true };
  assert.throws(() => f.provider.deleteUser('alice'), { code: 'account/wrong-user' });
  assert.throws(() => f.provider.signOut('alice'), { code: 'account/wrong-user' });
  assert.equal(f.auth.currentUser.uid, 'bob');
  assert.equal(f.calls.length, 0);
});

test('verification refresh cannot return a different user selected during reload', async () => {
  const f = fixture();
  f.sdk.reload = async () => { f.auth.currentUser = { uid: 'bob', emailVerified: true }; };
  await assert.rejects(f.provider.refreshUser(), { code: 'account/wrong-user' });
  assert.equal(f.calls.length, 0);
});

test('an owner can remove an older cloud save even after their email becomes unverified', async () => {
  const f = fixture({ format: 1, revision: 1, entries, updatedAt: 'earlier' });
  f.auth.currentUser.emailVerified = false;
  await f.provider.deleteSave('alice');
  assert.equal(f.record, null);
  assert.deepEqual(f.calls, [['delete', 'users/alice/saves/current']]);
});
