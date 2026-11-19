const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Saves = require('../dist/shared/park-saves.js');
const Pond = require('../dist/pond/pond-life.js');
const Farm = require('../dist/pixel/farm-life.js');
const Kitchen = require('../dist/dumplings/kitchen-life.js');
const Slots = require('../dist/slots/slots-life.js');
const Claw = require('../dist/claw/claw-life.js');
const Fishing = require('../dist/fishing/fishing-life.js');
const Timer = require('../dist/pond/pond-timer.js');
const Journal = require('../dist/shared/park-journal.js');

const at = 1795100000000;
const pack = entries => JSON.stringify({format: 'spriggan-park', version: 1, exportedAt: new Date(at).toISOString(), entries});
const raw = value => JSON.stringify(value);
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data, reads: [], writes: [],
    getItem(key) { this.reads.push(key); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { this.writes.push([key, value]); data.set(key, String(value)); },
    removeItem(key) { this.writes.push([key, null]); data.delete(key); }
  };
}
function fixtures() {
  const p = Pond.create(at), f = Farm.create(at), k = Kitchen.create(), s = Slots.create(at), c = Claw.decode(null), fish = Fishing.createProgress();
  Pond.feed(p.fish[0], at); f.birds[0].meals = 23; f.cows.push(Farm.makeCow(at));
  k.shop.coins = 300; k.shop.sales = 100; Claw.collect(c, 'moonfox', 'lune-1');
  Fishing.recordCatch(fish, {id: 'catch-example', species: 'willow-minnow', length: 9.1, at});
  return {
    [Pond.KEY]: raw(p), [Farm.KEY]: raw(f), [Kitchen.KEY]: raw(k), [Slots.KEY]: raw(s), [Claw.KEY]: raw(c), [Fishing.KEY]: raw(fish),
    'spriggan.hex.totals.v1': raw({shooed: 42, snacks: 8, storeys: 3}),
    'spriggan.timer.v1': raw(Timer.create()), 'spriggan.farm.timer.v1': raw(Timer.create()),
    'spriggan.dumplings.timer.v1': raw(Timer.create()), 'spriggan.hex.timer.v1': raw(Timer.create()), 'spriggan.fishing.timer.v1': raw(Timer.create()),
    'spriggan.farm.music.v1': raw({enabled: true, volume: .2}), 'spriggan.farm.rain.v1': raw({enabled: false, volume: .4}),
    'spriggan.hex.rain.v1': raw({enabled: true, volume: .5}), 'spriggan.hex.moonlight': 'true',
    'spriggan.fishing.settings.v1': raw({evening: true, rain: true, sound: false, method: 'toggle'}),
    'spriggan.park.v1': raw({version: 1, lastWorld: 'pixel', lastVisitedAt: at, snapshot: {
      pond: {fish: p.fish.map(f => ({id: f.id, growth: f.growth, golden: f.golden}))}, pixel: {hatched: f.hatched, birds: f.birds.map(b => b.id), cows: f.cows.map(c => c.id)}
    }, memories: Array.from({length: 20}, (_, i) => ({id: 'memory-' + i, world: 'pixel', text: 'A little peep.', at: at + i}))})
  };
}

test('every supported world, preference, timer and journal save survives a byte-for-byte round trip', () => {
  const entries = fixtures(), source = storage({...entries, 'unrelated.token': 'secret', 'spriggan.map-entry': 'session-only'});
  const text = Saves.exportBackup(source), summary = Saves.inspectBackup(text), destination = storage();
  assert.equal(summary.count, Saves.SUPPORTED_KEYS.length);
  assert.deepEqual(summary.entries, entries);
  assert.deepEqual(summary.worlds, ['pond', 'pixel', 'hex', 'dumplings', 'claw', 'slots', 'fishing']);
  assert.equal(source.writes.length, 0);
  assert(!source.reads.includes('unrelated.token'));
  assert(!source.reads.includes('spriggan.map-entry'));
  assert(!text.includes('secret'));
  assert.deepEqual(Saves.restoreBackup(text, destination), summary);
  assert.deepEqual(Object.fromEntries(destination.data), entries);
});

test('partial backups replace only included saves and do not clear other worlds or unrelated keys', () => {
  const source = storage({'spriggan.hex.totals.v1': raw({shooed: 7, snacks: 2, storeys: 1}), 'spriggan.pond.v1': raw(Pond.create(at)), token: 'retain'});
  const summary = Saves.restoreBackup(pack({'spriggan.hex.moonlight': 'true'}), source);
  assert.equal(summary.count, 1);
  assert.deepEqual(summary.worlds, ['hex']);
  assert.equal(source.data.get('token'), 'retain');
  assert.equal(JSON.parse(source.data.get('spriggan.hex.totals.v1')).shooed, 7);
  assert.equal(source.data.get('spriggan.hex.moonlight'), 'true');
  assert.equal(source.writes.length, 1);
});

test('full park restore removes absent worlds and preferences while preserving auth and unrelated storage', () => {
  const preserved = {'sb-example-auth-token':'private session', 'spriggan.cloud.recovery.v1':'local recovery', 'spriggan.future-world.v1':'unknown save', 'unrelated.token':'secret'};
  const destination = storage({...fixtures(),...preserved});
  const entries = {'spriggan.hex.moonlight':'false', [Claw.KEY]:raw(Claw.decode(null))};
  const summary = Saves.restorePark(pack(entries), destination);
  assert.deepEqual(summary, Saves.inspectBackup(pack(entries)));
  assert.deepEqual(Object.fromEntries(destination.data), {...preserved,...entries});
  assert.deepEqual(destination.reads, Saves.SUPPORTED_KEYS);
  assert(destination.writes.every(([key]) => Saves.SUPPORTED_KEYS.includes(key)));
});

test('an empty full park snapshot clears only supported saves; partial imports still merge', () => {
  const destination = storage({...fixtures(), 'sb-auth-token':'retain', other:'retain'});
  Saves.restoreBackup(pack({}), destination);
  assert.equal(destination.writes.length, 0);
  const summary = Saves.restorePark(pack({}), destination);
  assert.equal(summary.count, 0);
  assert.deepEqual(Object.fromEntries(destination.data), {'sb-auth-token':'retain', other:'retain'});
});

test('full park restore validates all entries and snapshots all supported keys before mutations', () => {
  for (const entries of [{'spriggan.hex.moonlight':'true', [Pond.KEY]:'{}'}, {'sb-auth-token':'"not a save"'}]) {
    const destination = storage(fixtures());
    assert.throws(() => Saves.restorePark(pack(entries), destination));
    assert.equal(destination.reads.length, 0);assert.equal(destination.writes.length, 0);
  }
  const destination = storage(fixtures()), read = destination.getItem.bind(destination);
  destination.getItem = key => {if (key === Saves.SUPPORTED_KEYS.at(-1)) throw Error('read failure');return read(key);};
  assert.throws(() => Saves.restorePark(pack({'spriggan.hex.moonlight':'true'}), destination), error => error.code === 'STORAGE_READ');
  assert.equal(destination.writes.length, 0);
});

test('full park restore rolls back removals even if an adapter throws after deleting', () => {
  for (const afterMutation of [false,true]) {
    const initial = {[Pond.KEY]:raw(Pond.create(at)), [Farm.KEY]:raw(Farm.create(at)), 'sb-auth-token':'retain'};
    const destination = storage(initial), remove = destination.removeItem.bind(destination);let calls = 0;
    destination.removeItem = key => {const fail = ++calls === 2;if (fail && !afterMutation) throw Error('remove failed');remove(key);if (fail) throw Error('late removal failure');};
    assert.throws(() => Saves.restorePark(pack({}), destination), error => error.code === 'STORAGE_WRITE');
    assert.deepEqual(Object.fromEntries(destination.data), initial);
  }
});

test('full park restore rolls back removed worlds, replacements and introduced keys after a failed set', () => {
  for (const afterMutation of [false,true]) {
    const initial = {[Pond.KEY]:raw(Pond.create(at)), 'spriggan.hex.moonlight':'false', 'sb-auth-token':'retain'};
    const entries = {'spriggan.hex.moonlight':'true', 'spriggan.farm.music.v1':raw({enabled:true,volume:.2})};
    const destination = storage(initial), write = destination.setItem.bind(destination);let calls = 0;
    destination.setItem = (key,value) => {const fail = ++calls === 2;if (fail && !afterMutation) throw Error('quota');write(key,value);if (fail) throw Error('late write failure');};
    assert.throws(() => Saves.restorePark(pack(entries), destination), error => error.code === 'STORAGE_WRITE');
    assert.deepEqual(Object.fromEntries(destination.data), initial);
  }
});

test('full park restore verifies rollback results when rollback adapters throw after writing', () => {
  const initial = {[Pond.KEY]:raw(Pond.create(at)), 'spriggan.hex.moonlight':'false'};
  const destination = storage(initial), write = destination.setItem.bind(destination);
  destination.setItem = (key,value) => {write(key,value);throw Error('adapter throws after every write');};
  assert.throws(() => Saves.restorePark(pack({'spriggan.hex.moonlight':'true'}), destination), error => error.code === 'STORAGE_WRITE');
  assert.deepEqual(Object.fromEntries(destination.data), initial);
});

test('full park restore reports incomplete rollback and skips identical entries', () => {
  const initial = {[Pond.KEY]:raw(Pond.create(at)), 'spriggan.hex.moonlight':'false'};
  const destination = storage(initial);
  destination.setItem = () => {throw Error('storage unavailable');};
  assert.throws(() => Saves.restorePark(pack({'spriggan.hex.moonlight':'true'}), destination), error => error.code === 'ROLLBACK_FAILED' && /Keep your backup file/.test(error.message));
  const same = storage({'spriggan.hex.moonlight':'true'});
  Saves.restorePark(pack({'spriggan.hex.moonlight':'true'}), same);
  assert.equal(same.writes.length, 0);
});

test('an empty park exports and restores without altering destination progress', () => {
  const summary = Saves.inspectBackup(Saves.exportBackup(storage()));
  assert.equal(summary.count, 0);
  assert.deepEqual(summary.worlds, []);
  const destination = storage({'spriggan.hex.moonlight': 'false'});
  Saves.restoreBackup(pack({}), destination);
  assert.equal(destination.writes.length, 0);
});

test('the live journal facts and generated memories remain portable', () => {
  const source = storage(fixtures());
  let journal = Journal.updateJournal(null, Journal.readSnapshot(source), {world: 'fishing', now: at});
  const guide = JSON.parse(source.data.get(Fishing.KEY));
  Fishing.recordCatch(guide, {id: 'new-fish-2', species: 'moon-bream', length: 24, at: at + 100});
  source.data.set(Fishing.KEY, raw(guide));
  journal = Journal.updateJournal(journal, Journal.readSnapshot(source), {world: 'fishing', now: at + 100});
  assert(journal.memories.length > 0);
  source.data.set(Journal.KEY, raw(journal));
  assert.equal(Saves.inspectBackup(Saves.exportBackup(source)).entries[Journal.KEY], raw(journal));
});

test('legacy versions stay raw so each world can run its own existing migration', () => {
  const f = Farm.create(at); f.version = 1; f.eggs.push({id: 'old-egg', laid: at, hatchesAt: at + 90000, x: .5, y: .5});
  f.cow = Farm.makeCow(at); delete f.cows;
  const k = Kitchen.create(); delete k.shop;
  const s = {version: 1, balance: 170, spins: 80, goldenUnlocked: true};
  const entries = {[Farm.KEY]: raw(f), [Kitchen.KEY]: raw(k), [Slots.KEY]: raw(s), [Claw.KEY]: raw({version: 1, collection: {frog: 2}, sound: true}), 'spriggan.timer.v1': raw({...Timer.create(), version: 1, remaining: 1500000})};
  assert.deepEqual(Saves.inspectBackup(pack(entries)).entries, entries);
});

test('unsupported keys, formats and versions are rejected before any storage reads or writes', () => {
  const files = [pack({'unrelated.token': '"secret"'}), pack({'spriggan.unknown.v1': '{}'}), pack({'spriggan.map-entry': '{}'}),
    raw({format: 'another-game', version: 1, entries: {}}), raw({format: 'spriggan-park', version: 2, entries: {}})];
  for (const text of files) {
    const destination = storage();
    assert.throws(() => Saves.restoreBackup(text, destination), /unsupported|not supported|Spriggan/);
    assert.equal(destination.reads.length, 0);
    assert.equal(destination.writes.length, 0);
  }
});

test('malformed values and unsupported schemas never silently become fresh games', () => {
  const invalid = [
    [Pond.KEY, '{}'], [Farm.KEY, raw({...Farm.create(at), birds: [null]})],
    [Kitchen.KEY, raw({...Kitchen.create(), served: -1})], [Slots.KEY, raw({...Slots.create(at), balance: -1})],
    [Claw.KEY, raw({version: 1, collection: {cat: 2}, friends: []})],
    [Fishing.KEY, raw({version: 1, records: {}, total: 20})],
    ['spriggan.hex.totals.v1', raw({shooed: 0, snacks: 0, storeys: 0})],
    ['spriggan.timer.v1', raw({...Timer.create(), remaining: 0})],
    ['spriggan.hex.moonlight', '"true"'], ['spriggan.farm.rain.v1', raw({enabled: true, volume: 10})],
    ['spriggan.fishing.settings.v1', raw({evening: true, rain: false, sound: false, method: 'automatic'})],
    ['spriggan.park.v1', raw({version: 1, lastWorld: 'unknown', lastVisitedAt: at, snapshot: {}, memories: []})],
    [Pond.KEY, raw({...Pond.create(at), version: 2})], [Pond.KEY, {version: 1}], [Pond.KEY, 'not JSON']
  ];
  for (const [key, value] of invalid) {
    const destination = storage({'spriggan.hex.moonlight': 'false'});
    assert.throws(() => Saves.restoreBackup(pack({[key]: value}), destination), /saved data/);
    assert.equal(destination.reads.length, 0, key);
    assert.equal(destination.writes.length, 0, key);
  }
});

test('valid early entries cannot be applied when a later entry is malformed', () => {
  const destination = storage({'spriggan.hex.moonlight': 'false'});
  assert.throws(() => Saves.restoreBackup(pack({'spriggan.hex.moonlight': 'true', [Pond.KEY]: '{'}), destination));
  assert.equal(destination.data.get('spriggan.hex.moonlight'), 'false');
  assert.equal(destination.writes.length, 0);
});

test('prototype properties are rejected at every backup layer', () => {
  const base = JSON.parse(pack({}));
  for (const text of [
    '{"__proto__":{},"format":"spriggan-park","version":1}',
    raw({...base, entries: JSON.parse('{"__proto__":"true"}')}),
    pack({'spriggan.park.v1': '{"version":1,"lastWorld":null,"lastVisitedAt":0,"snapshot":{"constructor":{}},"memories":[]}'})
  ]) assert.throws(() => Saves.inspectBackup(text), /valid|saved data/);
  assert.equal({}.polluted, undefined);
});

test('oversize files count UTF-8 bytes and malformed dates or incomplete files are rejected', () => {
  for (const text of ['x'.repeat(Saves.MAX_BYTES + 1), '界'.repeat(Math.floor(Saves.MAX_BYTES / 3) + 1)])
    assert.throws(() => Saves.inspectBackup(text), error => error.code === 'FILE_SIZE');
  const value = JSON.parse(pack({}));
  for (const exportedAt of ['yesterday', '2026-02-30T00:00:00.000Z', '', null])
    assert.throws(() => Saves.inspectBackup(raw({...value, exportedAt})), /incomplete/);
  assert.throws(() => Saves.inspectBackup(raw({...value, entries: []})), /incomplete/);
  assert.throws(() => Saves.inspectBackup('null'), /not supported/);
});

test('storage read failure aborts before mutation and offers a retry', () => {
  const destination = storage(); destination.getItem = () => { throw Error('denied'); };
  assert.throws(() => Saves.restoreBackup(pack({'spriggan.hex.moonlight': 'true'}), destination), /Nothing has been restored/);
  assert.equal(destination.writes.length, 0);
  assert.throws(() => Saves.exportBackup(destination), /read browser storage/);
  assert.throws(() => Saves.restoreBackup(pack({}), {}), /storage is unavailable/);
});

test('a failed write rolls back replacements and removes newly introduced keys', () => {
  const initial = {'spriggan.hex.moonlight': 'false', token: 'untouched'}, destination = storage(initial);
  const write = destination.setItem.bind(destination); let calls = 0;
  destination.setItem = (key, value) => { if (++calls === 3) throw Error('quota'); write(key, value); };
  const text = pack({'spriggan.hex.moonlight': 'true', 'spriggan.farm.music.v1': raw({enabled: true, volume: .2}), 'spriggan.farm.rain.v1': raw({enabled: true, volume: .3})});
  assert.throws(() => Saves.restoreBackup(text, destination), error => error.code === 'STORAGE_WRITE' && /previous progress was restored/.test(error.message));
  assert.deepEqual(Object.fromEntries(destination.data), initial);
});

test('rollback also handles a storage adapter that throws after writing', () => {
  const initial = {'spriggan.hex.moonlight': 'false'}, destination = storage(initial);
  const write = destination.setItem.bind(destination); let calls = 0;
  destination.setItem = (key, value) => { write(key, value); if (++calls === 1) throw Error('late failure'); };
  assert.throws(() => Saves.restoreBackup(pack({'spriggan.hex.moonlight': 'true'}), destination), /previous progress was restored/);
  assert.deepEqual(Object.fromEntries(destination.data), initial);
});

test('rollback failure is surfaced honestly with recovery instructions', () => {
  const destination = storage({'spriggan.hex.moonlight': 'false'});
  const write = destination.setItem.bind(destination); let calls = 0;
  destination.setItem = (key, value) => { if (++calls > 1) throw Error('storage unavailable'); write(key, value); };
  assert.throws(() => Saves.restoreBackup(pack({'spriggan.hex.moonlight': 'true', 'spriggan.farm.music.v1': raw({enabled: true, volume: .2})}), destination),
    error => error.code === 'ROLLBACK_FAILED' && /Keep your backup file/.test(error.message));
});

test('identical saves do not perform unnecessary writes', () => {
  const destination = storage({'spriggan.hex.moonlight': 'true'});
  Saves.restoreBackup(pack({'spriggan.hex.moonlight': 'true'}), destination);
  assert.equal(destination.writes.length, 0);
});

test('browser script exposes the same API and supports default localStorage without dependencies', () => {
  const source = fs.readFileSync(require.resolve('../dist/shared/park-saves.js'), 'utf8'), localStorage = storage();
  const context = vm.createContext({localStorage}); vm.runInContext(source, context);
  assert.equal(typeof context.SprigganSaves.restoreBackup, 'function');
  assert.equal(typeof context.SprigganSaves.restorePark, 'function');
  context.SprigganSaves.restoreBackup(pack({'spriggan.hex.moonlight': 'true'}));
  assert.equal(localStorage.data.get('spriggan.hex.moonlight'), 'true');
  assert.equal(JSON.parse(context.SprigganSaves.exportBackup()).entries['spriggan.hex.moonlight'], 'true');
  context.SprigganSaves.restorePark(pack({}));
  assert.equal(localStorage.data.has('spriggan.hex.moonlight'), false);
});
