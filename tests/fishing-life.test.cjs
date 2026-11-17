const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const L = require('../dist/fishing/fishing-life.js');

function advance(s, seconds, holding = false, dt = .05) {
  for (let left = seconds; left > 1e-8; left -= dt) L.step(s, Math.min(dt, left), holding);
  return s.phase;
}
function castWith(roll = .5, options = {spot:'reeds'}, api = L) {
  const s = api.createSession(() => roll);
  assert.equal(api.cast(s, options), true);
  return s;
}
function reachBite(s) {
  for (let i = 0; i < 200 && s.phase !== 'bite'; i++) L.step(s, .05);
  assert.equal(s.phase, 'bite');
  return s;
}
function startReeling(roll = .5) {
  const s = reachBite(castWith(roll));
  assert.equal(L.hook(s), true);
  return s;
}
function land(s) {
  let holding = true;
  for (let i = 0; i < 1000 && s.phase === 'reeling'; i++) {
    if (s.tension > .7 || s.struggling) holding = false;
    else if (s.tension < .32 && !s.struggling) holding = true;
    L.step(s, .025, holding);
  }
  assert.equal(s.phase, 'caught', s.fish.name + ' should be landable');
  return s.catch;
}
function receipt(fish = L.SPECIES[0], id = 'test-catch-1', length = fish.minLength, at = 1000) {
  return {id, species:fish.id, length, at};
}
function rollsForSpecies(spot = 'reeds') {
  const found = new Map();
  for (let i = 0; i <= 10000 && found.size < L.SPECIES.length; i++) {
    const roll = i / 10001;
    const s = castWith(roll, {spot});
    if (!found.has(s.fish.id)) found.set(s.fish.id, roll);
  }
  return found;
}

test('the module exports the same browser rules without CommonJS', () => {
  const context = vm.createContext({Math, Date, Map, Set});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/fishing/fishing-life.js'), 'utf8'), context);
  assert.equal(typeof context.FishingLife.step, 'function');
  assert.equal(context.FishingLife.KEY, 'spriggan.fishing.guide.v1');
  assert.equal(context.FishingLife.SPECIES.length, 8);
});

test('the field guide has eight unique, coherent species and no price or reward fields', () => {
  assert.equal(new Set(L.SPECIES.map(f => f.id)).size, 8);
  for (const f of L.SPECIES) {
    assert.match(f.color, /^#[0-9a-f]{6}$/i);
    assert.match(f.accent, /^#[0-9a-f]{6}$/i);
    assert(f.minLength > 0 && f.maxLength > f.minLength);
    assert(['reeds','open','deep'].includes(f.habitat));
    assert(f.hint.length > 20 && f.rarity.length > 0);
    assert.equal('price' in f, false);
  }
  const p = L.createProgress();
  assert.deepEqual(p, {version:1, records:{}, total:0, lastCatch:null, recordedIds:[]});
});

test('a cast takes one second, waits three to seven seconds, then gives a forgiving bite window', () => {
  for (const roll of [0, .5, 1]) {
    const s = castWith(roll);
    assert.equal(L.cast(s), false);
    assert.equal(L.hook(s), false);
    advance(s, .99);
    assert.equal(s.phase, 'casting');
    advance(s, .01);
    assert.equal(s.phase, 'waiting');
    const start = s.elapsed;
    let sawNibble = false;
    while (s.phase === 'waiting') {
      assert.equal(L.hook(s), false);
      L.step(s, .01);
      sawNibble ||= s.nibble > 0 && s.nibble < 1;
    }
    assert(sawNibble);
    assert(s.elapsed - start >= 3 - 1e-7 && s.elapsed - start <= 7.01);
    assert.equal(s.phase, 'bite');
    assert.equal(s.nibble, 1);
    advance(s, 2.3);
    assert.equal(s.phase, 'bite');
    assert.equal(L.hook(s), true);
    assert.equal(s.phase, 'reeling');
    assert.equal(L.hook(s), false);
  }
});

test('holding through nibbles and the bite never hooks automatically or awards a fish', () => {
  const s = castWith(0);
  advance(s, 15, true);
  assert.equal(s.phase, 'escaped');
  assert.match(s.escapeReason, /hook/);
  assert.equal(s.catch, null);
  assert.equal(s.progress, 0);
  assert.equal(L.hook(s), false);
  assert.equal(L.cast(s), false);
  assert.equal(L.release(s), 'idle');
  assert.equal(L.cast(s), true);
});

test('slack lowers tension, loses progress slowly, and remains safe at zero tension', () => {
  const s = startReeling();
  advance(s, 1.8, true);
  const tension = s.tension, progress = s.progress;
  advance(s, .5, false);
  assert(s.tension < tension);
  assert(s.progress < progress && s.progress > progress - .01);
  advance(s, 60, false);
  assert.equal(s.phase, 'reeling');
  assert.equal(s.tension, 0);
  assert.equal(s.progress, 0);
  land(s);
});

test('a full tension meter has a recoverable grace interval before the line escapes', () => {
  const s = startReeling();
  while (s.tension < 1 && s.phase === 'reeling') L.step(s, .01, true);
  assert.equal(s.phase, 'reeling');
  advance(s, .8, true);
  assert.equal(s.phase, 'reeling');
  advance(s, .1, false);
  assert(s.tension < 1);
  advance(s, .7, true);
  assert.equal(s.phase, 'reeling', 'slack resets the grace period');
  advance(s, 1.3, true);
  assert.equal(s.phase, 'escaped');
  assert.match(s.escapeReason, /slack/);
  assert.equal(s.catch, null);
});

test('all eight fish are reachable in ordinary daylight in each water spot', () => {
  for (const spot of ['reeds','open','deep']) assert.equal(rollsForSpecies(spot).size, 8, spot);
});

test('every species can be caught with gentle timing in roughly ten to eighteen seconds', () => {
  const ids = new Set();
  for (const [id, roll] of rollsForSpecies()) {
    const s = startReeling(roll);
    assert.equal(s.fish.id, id);
    const c = land(s);
    assert.equal(c.species, id);
    assert(c.length >= s.fish.minLength && c.length <= s.fish.maxLength);
    assert(Number.isFinite(c.at));
    assert.match(c.id, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    assert(s.reelTime >= 10 && s.reelTime <= 18.5, s.fish.name + ': ' + s.reelTime);
    assert.equal(s.progress, 1);
    ids.add(c.id);
    const before = structuredClone(c);
    advance(s, 20, true);
    assert.deepEqual(s.catch, before, 'landing produces one stable receipt');
    assert.equal(L.cast(s), false, 'a landing is released before the next cast');
    L.release(s);
    assert.equal(s.fish, null);
    assert.equal(s.catch, null);
    assert.equal(s.phase, 'idle');
  }
  assert.equal(ids.size, 8);
});

test('constant holding escapes for every species before it can complete a catch', () => {
  for (const roll of rollsForSpecies().values()) {
    const s = startReeling(roll);
    advance(s, 25, true);
    assert.equal(s.phase, 'escaped', s.fish.name);
    assert.equal(s.catch, null);
  }
});

test('spot, rain, and evening change the distribution without gating species', () => {
  function sample(options) {
    const counts = {};
    for (let i = 0; i < 4000; i++) {
      const s = castWith((i + .5) / 4000, options);
      counts[s.fish.id] = (counts[s.fish.id] || 0) + 1;
    }
    return counts;
  }
  const day = sample({spot:'open'}), rain = sample({spot:'open', rain:true});
  const evening = sample({spot:'open', evening:true}), reeds = sample({spot:'reeds'});
  assert(rain.glassfin > day.glassfin * 1.6);
  assert(evening['moon-bream'] > day['moon-bream'] * 2);
  assert(reeds['willow-minnow'] > day['willow-minnow']);
  assert(Object.keys(day).length === 8 && Object.keys(rain).length === 8);
});

test('long or invalid frame gaps cannot advance a suspended cast or consume a bite window', () => {
  const a = castWith(.5), b = castWith(.5);
  L.step(a, 3600, true);
  L.step(b, L.MAX_STEP, true);
  assert.equal(a.elapsed, b.elapsed);
  assert.equal(a.phase, 'casting');
  assert(a.elapsed <= L.MAX_STEP + 1e-7);
  const snapshot = L.encodeProgress(L.createProgress());
  for (const dt of [0, -1, NaN, Infinity, undefined, '1']) {
    const before = a.elapsed;
    L.step(a, dt, true);
    assert.equal(a.elapsed, before);
  }
  reachBite(a);
  L.step(a, 100000, true);
  assert.equal(a.phase, 'bite');
  assert.equal(L.encodeProgress(L.createProgress()), snapshot);
});

test('the same timed inputs give the same reeling result across ordinary frame sizes', () => {
  const a = startReeling(.3), b = startReeling(.3);
  for (const [seconds, holding] of [[1.2,true],[.4,false],[1.1,true],[.6,false],[.8,true]]) {
    advance(a, seconds, holding, .1);
    advance(b, seconds, holding, .01);
  }
  assert.equal(a.phase, b.phase);
  assert(Math.abs(a.tension - b.tension) < 1e-8);
  assert(Math.abs(a.progress - b.progress) < 1e-8);
  assert(Math.abs(a.reelTime - b.reelTime) < 1e-8);
});

test('a catch is recorded once, survives reload, and tracks the best length independently of latest length', () => {
  const fish = L.SPECIES[0], p = L.createProgress();
  const first = receipt(fish, 'one', fish.maxLength, 2000);
  assert.equal(L.recordCatch(p, first), true);
  assert.equal(L.recordCatch(p, first), false);
  const restored = L.decodeProgress(L.encodeProgress(p));
  assert.equal(L.recordCatch(restored, first), false);
  assert.equal(L.recordCatch(restored, receipt(fish, 'two', fish.minLength, 3000)), true);
  assert.deepEqual(restored.records[fish.id], {count:2, bestLength:fish.maxLength, firstAt:2000, lastAt:3000});
  assert.equal(restored.total, 2);
  assert.equal(restored.lastCatch.id, 'two');
  first.length = fish.minLength;
  assert.equal(p.lastCatch.length, fish.maxLength, 'saved receipts do not alias caller data');
  assert.deepEqual(L.decodeProgress(L.encodeProgress(restored)), restored);
});

test('every species keeps an independent guide record and can be caught repeatedly without currency', () => {
  const p = L.createProgress();
  for (const fish of L.SPECIES) for (let n = 0; n < 2; n++) {
    assert(L.recordCatch(p, receipt(fish, fish.id + '-' + n, fish.minLength + n, n + 1000)));
  }
  assert.equal(p.total, 16);
  assert.equal(Object.keys(p.records).length, 8);
  assert.equal('coins' in p, false);
  assert.equal('currency' in p, false);
  assert.deepEqual(L.decodeProgress(L.encodeProgress(p)), p);
});

test('malformed saves reset safely and individual corrupt records leave valid catches intact', () => {
  for (const raw of [null, undefined, '', 'no', 'null', '[]', '{}', '{', JSON.stringify({version:2})]) {
    assert.deepEqual(L.decodeProgress(raw), L.createProgress());
  }
  const a = L.SPECIES[0], b = L.SPECIES[1], c = L.SPECIES[2];
  const p = L.decodeProgress(JSON.stringify({version:1, total:999999, records:{
    [a.id]:{count:3, bestLength:a.maxLength, firstAt:3000, lastAt:1000},
    [b.id]:{count:2, bestLength:b.maxLength + 1, firstAt:1, lastAt:2},
    [c.id]:{count:-2, bestLength:c.minLength},
    unknown:{count:100, bestLength:12}
  }, recordedIds:['valid-1', 'valid-1', '__proto__', '', null, 'bad id'], lastCatch:receipt(b)}));
  assert.deepEqual(p.records, {[a.id]:{count:3, bestLength:a.maxLength, firstAt:1000, lastAt:3000}});
  assert.equal(p.total, 3);
  assert.deepEqual(p.recordedIds, ['valid-1']);
  assert.equal(p.lastCatch, null);
  assert.equal(L.recordCatch(p, receipt(a, 'later', a.minLength, 4000)), true);
});

test('invalid catch receipts never alter the guide', () => {
  const p = L.createProgress(), valid = receipt();
  for (const bad of [null, {}, {...valid, id:''}, {...valid, id:'bad id'}, {...valid, id:'a'.repeat(129)},
    {...valid, species:'unknown'}, {...valid, species:{}}, {...valid, length:Infinity},
    {...valid, length:L.SPECIES[0].maxLength + .1}, {...valid, length:0}, {...valid, at:-1}, {...valid, at:NaN}]) {
    assert.equal(L.recordCatch(p, bad), false);
  }
  assert.deepEqual(p, L.createProgress());
  assert.equal(L.recordCatch(null, valid), false);
});

test('save projection handles cyclic extras and reconstructs totals and missing timestamps', () => {
  const fish = L.SPECIES[0];
  const p = {version:1, records:{[fish.id]:{count:4, bestLength:fish.minLength, lastAt:1200}}, total:-10};
  p.extra = p;
  const clean = L.decodeProgress(L.encodeProgress(p));
  assert.equal(clean.total, 4);
  assert.deepEqual(clean.records[fish.id], {count:4, bestLength:fish.minLength, firstAt:1200, lastAt:1200});
  assert.equal('extra' in clean, false);
});

test('receipt history is bounded, deduplicated, and preserves the latest receipt across reloads', () => {
  const p = L.createProgress(), fish = L.SPECIES[0];
  for (let n = 0; n < L.MAX_RECEIPTS + 20; n++) assert(L.recordCatch(p, receipt(fish, 'receipt-' + n, fish.minLength, n)));
  assert.equal(p.recordedIds.length, L.MAX_RECEIPTS);
  const restored = L.decodeProgress(L.encodeProgress(p));
  assert.equal(restored.total, L.MAX_RECEIPTS + 20);
  assert.equal(L.recordCatch(restored, restored.lastCatch), false);
  const raw = {...restored, recordedIds:[]};
  const partial = L.decodeProgress(JSON.stringify(raw));
  assert.equal(L.recordCatch(partial, restored.lastCatch), false, 'lastCatch repairs a missing recent receipt');
});

test('fallback catch IDs stay unique when the clock and randomness are identical', () => {
  const fixedMath = Object.create(Math);
  fixedMath.random = () => .5;
  const context = vm.createContext({Math:fixedMath, Date:{now:() => 12345}, Map, Set});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/fishing/fishing-life.js'), 'utf8'), context);
  const api = context.FishingLife, ids = [];
  for (let n = 0; n < 3; n++) {
    const s = castWith(.5, {spot:'reeds'}, api);
    for (let i = 0; i < 200 && s.phase !== 'bite'; i++) api.step(s, .05);
    assert(api.hook(s));
    let holding = true;
    for (let i = 0; i < 1000 && s.phase === 'reeling'; i++) {
      if (s.tension > .7 || s.struggling) holding = false;
      else if (s.tension < .32 && !s.struggling) holding = true;
      api.step(s, .025, holding);
    }
    assert.equal(s.phase, 'caught');
    ids.push(s.catch.id);
  }
  assert.equal(new Set(ids).size, 3);
});
