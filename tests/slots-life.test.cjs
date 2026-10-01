const test = require('node:test');
const assert = require('node:assert/strict');
const Life = require('../dist/slots/slots-life.js');
const PondLife = require('../dist/pond/pond-life.js');
const now = 1800000000000;

function sequence(...values) {
  let index = 0;
  return () => values[index++];
}

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value)
  };
}

function unlockedState() {
  const state = Life.create(now);
  state.spins = Life.GOLDEN_AT;
  state.goldenUnlocked = true;
  return state;
}

test('a new garden starts with 200 seeds and accessible quiet defaults', () => {
  assert.deepEqual(Life.create(now), {
    version: 1, balance: 200, spins: 0, lastResult: null,
    goldenUnlocked: false, goldenClaimed: false,
    settings: { sound: false, motion: true }, savedAt: now
  });
  assert.deepEqual(Life.decode(JSON.stringify(Life.create(now)), now), Life.create(now));
});

test('weighted draws honor exact cumulative boundaries and all six symbols', () => {
  const cases = [
    [0, 'leaf'], [.299999, 'leaf'], [.3, 'flower'], [.549999, 'flower'],
    [.55, 'egg'], [.749999, 'egg'], [.75, 'chicken'], [.869999, 'chicken'],
    [.87, 'koi'], [.949999, 'koi'], [.95, 'seed'], [1, 'seed']
  ];
  for (const [value, id] of cases) {
    const state = Life.create(now);
    assert.deepEqual(Life.spin(state, () => value, now).symbols, [id, id, id]);
  }
});

test('each triple pays its documented award and every pair returns only the cost', () => {
  const draws = [.1, .4, .6, .8, .9, .98];
  Life.SYMBOLS.forEach((symbol, index) => {
    const result = Life.spin(Life.create(now), () => draws[index], now);
    assert.equal(result.kind, 'triple');
    assert.equal(result.payout, symbol.payout);
    assert.equal(result.net, symbol.payout - Life.COST);
  });
  for (const values of [[.1, .1, .4], [.1, .4, .1], [.4, .1, .1]]) {
    const state = Life.create(now);
    const result = Life.spin(state, sequence(...values), now);
    assert.equal(result.kind, 'pair');
    assert.equal(result.payout, 10);
    assert.equal(result.net, 0);
    assert.equal(state.balance, 200);
  }
  const state = Life.create(now);
  const miss = Life.spin(state, sequence(.1, .4, .6), now);
  assert.equal(miss.kind, 'miss');
  assert.equal(miss.payout, 0);
  assert.equal(miss.net, -10);
  assert.equal(state.balance, 190);
});

test('exhaustive probability totals distinguish a refunded pair from a net win', () => {
  const stats = Life.probabilityStats();
  assert.equal(stats.expectedPayout, 8.3772);
  assert(Math.abs(stats.return - .83772) < 1e-12);
  assert.equal(stats.pairRate, .48843);
  assert.equal(stats.tripleRate, .05299);
  assert.equal(stats.payoutRate, .54142);
  assert.equal(stats.netWinRate, .05299);
  assert.equal(stats.goldenRate, .000125);
  assert(Math.abs(stats.pairRate + stats.tripleRate - stats.payoutRate) < 1e-12);
});

test('spins settle balance, count, and result before a reload without applying them again', () => {
  const state = Life.create(now);
  const result = Life.spin(state, sequence(.98, .98, .98), now + 1000);
  assert.equal(state.balance, 1190);
  assert.equal(state.spins, 1);
  assert.equal(state.lastResult, result);
  assert.equal(state.savedAt, now + 1000);
  const reloaded = Life.decode(JSON.stringify(state), now + 1000);
  assert.deepEqual(reloaded, state);
  assert.deepEqual(Life.decode(JSON.stringify(reloaded), now + 1000), state);
});

test('insufficient seeds refuse a spin without drawing or changing the state', () => {
  const state = Life.create(now);
  state.balance = 9;
  const original = JSON.stringify(state);
  assert.equal(Life.spin(state, () => { throw Error('must not draw'); }, now + 1000), null);
  assert.equal(JSON.stringify(state), original);
  state.balance = 10;
  Life.spin(state, sequence(.1, .4, .6), now);
  assert.equal(state.balance, 0);
});

test('invalid random values cannot partly charge or settle a spin', () => {
  for (const invalid of [-1, 1.1, NaN, Infinity, '0.5']) {
    const state = Life.create(now);
    const original = JSON.stringify(state);
    assert.throws(() => Life.spin(state, sequence(.1, invalid, .4), now), RangeError);
    assert.equal(JSON.stringify(state), original);
  }
});

test('save validation rejects corrupt core data and normalizes optional fields', () => {
  for (const raw of ['not json', 'null', '{}', '[]', JSON.stringify({ ...Life.create(now), version: 2 })]) {
    assert.equal(Life.decode(raw, now), null);
  }
  for (const field of ['balance', 'spins']) {
    for (const invalid of [-1, .5, null, '100', Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(Life.decode(JSON.stringify({ ...Life.create(now), [field]: invalid }), now), null);
    }
  }
  const saved = Life.create(now);
  saved.spins = 1;
  saved.settings = { sound: 'true', motion: false };
  saved.savedAt = now + 99999;
  saved.lastResult = { symbols: ['leaf', 'leaf', 'egg'], payout: 50000, net: 49990, kind: 'triple' };
  let decoded = Life.decode(JSON.stringify(saved), now);
  assert.deepEqual(decoded.settings, { sound: false, motion: false });
  assert.equal(decoded.savedAt, now);
  assert.equal(decoded.lastResult.payout, 10);
  assert.equal(decoded.lastResult.kind, 'pair');
  saved.lastResult.symbols[0] = 'unknown';
  decoded = Life.decode(JSON.stringify(saved), now);
  assert.equal(decoded.lastResult, null);
  saved.goldenClaimed = true;
  assert.equal(Life.decode(JSON.stringify(saved), now).goldenClaimed, false);
});

test('seed gathering is immediate only below the spin cost and preserves progression', () => {
  const state = unlockedState();
  state.balance = 10;
  assert.equal(Life.refill(state, now + 1000), false);
  assert.equal(state.savedAt, now);
  state.balance = 9;
  assert.equal(Life.refill(state, now + 1000), true);
  assert.equal(state.balance, 100);
  assert.equal(state.spins, Life.GOLDEN_AT);
  assert.equal(state.goldenUnlocked, true);
  assert.equal(state.savedAt, now + 1000);
  assert.equal(Life.refill(state, now + 2000), false);
});

test('garden decorations unlock exactly once at their milestones', () => {
  for (const unlock of Life.UNLOCKS) {
    const state = Life.create(now);
    state.spins = unlock.at - 2;
    assert.deepEqual(Life.spin(state, sequence(.1, .4, .6), now).newUnlocks, []);
    assert.deepEqual(Life.spin(state, sequence(.1, .4, .6), now).newUnlocks, [unlock]);
    assert.deepEqual(Life.spin(state, sequence(.1, .4, .6), now).newUnlocks, []);
  }
});

test('golden koi unlocks by rare golden triple or guaranteed sixty-spin progress', () => {
  const lucky = Life.create(now);
  const luckyResult = Life.spin(lucky, () => .99, now);
  assert.equal(luckyResult.goldenUnlocked, true);
  assert.equal(lucky.goldenUnlocked, true);
  assert.equal(Life.spin(lucky, () => .99, now).goldenUnlocked, false);
  const steady = Life.create(now);
  steady.spins = 58;
  assert.equal(Life.spin(steady, sequence(.1, .4, .6), now).goldenUnlocked, false);
  assert.equal(Life.spin(steady, sequence(.1, .4, .6), now).goldenUnlocked, true);
  assert.equal(steady.goldenUnlocked, true);
  const oldFlags = { ...steady, goldenUnlocked: false };
  assert.equal(Life.decode(JSON.stringify(oldFlags), now).goldenUnlocked, true);
});

test('claim creates a missing pond and saves one stable golden Kin before the claim receipt', () => {
  const storage = memoryStorage();
  const state = unlockedState();
  const writes = [];
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { writes.push(key); setItem(key, value); };
  const result = Life.claimGolden(state, storage, PondLife, now);
  assert.equal(result.status, 'claimed');
  assert.equal(result.fish.id, Life.GOLDEN_FISH_ID);
  assert.equal(result.fish.name, 'Kin');
  assert.equal(result.fish.golden, true);
  assert.deepEqual(writes, [PondLife.KEY, Life.KEY]);
  const pond = PondLife.decode(storage.getItem(PondLife.KEY), now);
  assert.equal(pond.fish.length, 6);
  assert.equal(pond.fish.filter(fish => fish.golden).length, 1);
  assert.equal(state.goldenClaimed, true);
  assert.equal(Life.decode(storage.getItem(Life.KEY), now).goldenClaimed, true);
  assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'existing');
  assert.equal(PondLife.decode(storage.getItem(PondLife.KEY), now).fish.length, 6);
});

test('claim freshly reads the pond and preserves fish identities, care, and settings', () => {
  const pond = PondLife.create(now);
  pond.settings.night = true;
  pond.settings.rainVolume = 21;
  pond.settings.audio.ambient = true;
  pond.fish[0].name = 'Favorite koi';
  PondLife.feed(pond.fish[0], now);
  const storage = memoryStorage([[PondLife.KEY, JSON.stringify(pond)]]);
  const before = PondLife.decode(storage.getItem(PondLife.KEY), now);
  const state = unlockedState();
  assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'claimed');
  const after = PondLife.decode(storage.getItem(PondLife.KEY), now);
  assert.deepEqual(after.fish.slice(0, before.fish.length), before.fish);
  assert.deepEqual(after.settings, before.settings);
});

test('an existing golden koi satisfies the reward even in a full pond', () => {
  const pond = PondLife.create(now);
  while (pond.fish.length < PondLife.MAX_KOI) pond.fish.push(PondLife.makeFish(pond.fish.length, now));
  pond.fish[3].golden = true;
  pond.fish[3].name = 'My golden koi';
  const storage = memoryStorage([[PondLife.KEY, JSON.stringify(pond)]]);
  const state = unlockedState();
  const result = Life.claimGolden(state, storage, PondLife, now);
  assert.equal(result.status, 'existing');
  assert.equal(result.fish.id, pond.fish[3].id);
  assert.equal(result.fish.name, 'My golden koi');
  assert.equal(PondLife.decode(storage.getItem(PondLife.KEY), now).fish.length, 12);
  assert.equal(state.goldenClaimed, true);
});

test('locked, full, and invalid ponds are never overwritten or marked claimed', () => {
  const locked = Life.create(now);
  assert.equal(Life.claimGolden(locked, { getItem() { throw Error('must not read'); } }, PondLife, now).status, 'locked');
  const pond = PondLife.create(now);
  while (pond.fish.length < 12) pond.fish.push(PondLife.makeFish(pond.fish.length, now));
  for (const [raw, status] of [[JSON.stringify(pond), 'full'], ['not json', 'invalid'], ['null', 'invalid']]) {
    const state = unlockedState();
    const storage = memoryStorage([[PondLife.KEY, raw]]);
    assert.equal(Life.claimGolden(state, storage, PondLife, now).status, status);
    assert.equal(storage.getItem(PondLife.KEY), raw);
    assert.equal(storage.getItem(Life.KEY), null);
    assert.equal(state.goldenClaimed, false);
  }
});

test('storage read and pond-write failures leave the claim honest and retryable', () => {
  for (const failingMethod of ['getItem', 'setItem']) {
    const state = unlockedState();
    const storage = memoryStorage();
    const original = storage[failingMethod];
    storage[failingMethod] = () => { throw Error('Storage unavailable'); };
    assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'storage-error');
    assert.equal(state.goldenClaimed, false);
    storage[failingMethod] = original;
    assert.equal(storage.getItem(PondLife.KEY), null);
    assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'claimed');
  }
});

test('a failed slot receipt retries against the already saved fish without duplicating it', () => {
  const state = unlockedState();
  const storage = memoryStorage();
  const setItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === Life.KEY) throw Error('Slot receipt failed');
    setItem(key, value);
  };
  assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'storage-error');
  assert.equal(state.goldenClaimed, false);
  const firstPond = PondLife.decode(storage.getItem(PondLife.KEY), now);
  assert.equal(firstPond.fish.length, 6);
  assert.equal(firstPond.fish.find(fish => fish.golden).id, Life.GOLDEN_FISH_ID);
  storage.setItem = setItem;
  assert.equal(Life.claimGolden(state, storage, PondLife, now).status, 'existing');
  assert.equal(PondLife.decode(storage.getItem(PondLife.KEY), now).fish.length, 6);
  assert.equal(state.goldenClaimed, true);
});
