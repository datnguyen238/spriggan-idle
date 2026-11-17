/* Fishing rules and field-guide saves, independent of the dock renderer. */
(function (root) {
  'use strict';

  const KEY = 'spriggan.fishing.guide.v1';
  // A suspended tab never spends its wall-clock absence playing a cast.
  const MAX_STEP = .1, CAST_TIME = 1, BITE_WINDOW = 2.6, LINE_GRACE = 1.2;
  const MAX_RECEIPTS = 512, MAX_COUNT = 1000000, MAX_DATE = 8640000000000000;
  const SPECIES = [
    {id:'willow-minnow', name:'Willow Minnow', color:'#9eaf91', accent:'#e9d5a3', minLength:6, maxLength:12, habitat:'reeds', rarity:'Common', hint:'A small silver-green neighbor, often sheltering beneath the reeds.', behavior:{reelRate:.147, tensionRate:.19, relaxRate:.46, strugglePeriod:5.8, struggleDuration:1.1, strugglePhase:2.2, struggleTension:.15}},
    {id:'copper-perch', name:'Copper Perch', color:'#bd8865', accent:'#f0c78e', minLength:12, maxLength:26, habitat:'open', rarity:'Common', hint:'Its copper stripes flash where warm sunlight reaches open water.', behavior:{reelRate:.14, tensionRate:.205, relaxRate:.46, strugglePeriod:5.5, struggleDuration:1.2, strugglePhase:2.1, struggleTension:.16}},
    {id:'pebble-loach', name:'Pebble Loach', color:'#96917d', accent:'#d9caab', minLength:9, maxLength:19, habitat:'deep', rarity:'Common', hint:'A quiet bottom-dweller that noses between the smooth river stones.', behavior:{reelRate:.142, tensionRate:.19, relaxRate:.45, strugglePeriod:6, struggleDuration:1.3, strugglePhase:2.4, struggleTension:.16}},
    {id:'ribbon-dace', name:'Ribbon Dace', color:'#96afb4', accent:'#eed9b1', minLength:10, maxLength:22, habitat:'open', rarity:'Uncommon', hint:'A pale ribbon of blue follows its quick turns across open water.', behavior:{reelRate:.137, tensionRate:.21, relaxRate:.47, strugglePeriod:5.3, struggleDuration:1.25, strugglePhase:2.1, struggleTension:.17}},
    {id:'clover-carp', name:'Clover Carp', color:'#a9b18a', accent:'#edcf98', minLength:22, maxLength:44, habitat:'reeds', rarity:'Uncommon', hint:'Round golden fins brush the reeds; it enjoys the hush of rainfall.', behavior:{reelRate:.133, tensionRate:.215, relaxRate:.47, strugglePeriod:5.7, struggleDuration:1.4, strugglePhase:2.3, struggleTension:.17}},
    {id:'glassfin', name:'Glassfin', color:'#afd1cd', accent:'#e6eee0', minLength:8, maxLength:18, habitat:'open', rarity:'Elusive', hint:'Nearly transparent fins catch the light, especially after rain.', behavior:{reelRate:.135, tensionRate:.21, relaxRate:.48, strugglePeriod:5.2, struggleDuration:1.3, strugglePhase:2.1, struggleTension:.18}},
    {id:'moon-bream', name:'Moon Bream', color:'#a8b1cd', accent:'#e8d6ac', minLength:18, maxLength:34, habitat:'deep', rarity:'Rare', hint:'A soft moon-shaped shimmer rises from deep water toward evening.', behavior:{reelRate:.131, tensionRate:.22, relaxRate:.48, strugglePeriod:5.6, struggleDuration:1.45, strugglePhase:2.2, struggleTension:.18}},
    {id:'starfin', name:'Starfin', color:'#bdc9ac', accent:'#fff0bf', minLength:14, maxLength:28, habitat:'deep', rarity:'Rare', hint:'Tiny warm flecks glimmer on its fins; dusk and rain draw it closer.', behavior:{reelRate:.129, tensionRate:.225, relaxRate:.49, strugglePeriod:5.4, struggleDuration:1.45, strugglePhase:2.2, struggleTension:.18}}
  ];
  SPECIES.forEach(f => {Object.freeze(f.behavior); Object.freeze(f);});
  Object.freeze(SPECIES);
  const BY_ID = new Map(SPECIES.map(f => [f.id, f]));
  const BASE_WEIGHTS = [28, 23, 19, 14, 11, 5, 2.6, 1.3];
  const RAIN_BONUS = [1, 1, 1.4, 1, 1.5, 2.6, 1.2, 1.8];
  const EVENING_BONUS = [1, 1, 1, 1.2, 1, 1.5, 4, 3];
  const SPOTS = ['reeds', 'open', 'deep'];
  let serial = 0;
  const instanceSalt = Math.random().toString(36).slice(2, 12);

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const safeId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id);
  const validTime = at => Number.isFinite(at) && at >= 0 && at <= MAX_DATE;
  function roll(rng) {
    try {const n = rng(); return Number.isFinite(n) ? clamp(n, 0, 1 - Number.EPSILON) : .5;}
    catch (_) {return .5;}
  }
  function catchId() {
    try {if (root.crypto && typeof root.crypto.randomUUID === 'function') return 'catch-' + root.crypto.randomUUID();}
    catch (_) {}
    return 'catch-' + Date.now().toString(36) + '-' + instanceSalt + '-' + (++serial).toString(36);
  }
  function cleanCatch(value) {
    if (!isObject(value) || !safeId(value.id)) return null;
    const fish = BY_ID.get(value.species);
    if (!fish || !Number.isFinite(value.length) || value.length < fish.minLength || value.length > fish.maxLength || !validTime(value.at)) return null;
    return {id:value.id, species:fish.id, length:Math.round(value.length * 10) / 10, at:value.at};
  }

  function createProgress() {
    return {version:1, records:{}, total:0, lastCatch:null, recordedIds:[]};
  }
  function cleanProgress(source) {
    const p = createProgress();
    if (!isObject(source) || source.version !== 1) return p;
    if (isObject(source.records)) for (const fish of SPECIES) {
      const r = source.records[fish.id];
      if (!isObject(r) || !Number.isSafeInteger(r.count) || r.count <= 0 ||
          !Number.isFinite(r.bestLength) || r.bestLength < fish.minLength || r.bestLength > fish.maxLength) continue;
      const first = validTime(r.firstAt) ? r.firstAt : validTime(r.lastAt) ? r.lastAt : 0;
      const last = validTime(r.lastAt) ? r.lastAt : first;
      p.records[fish.id] = {count:Math.min(r.count, MAX_COUNT), bestLength:Math.round(r.bestLength * 10) / 10, firstAt:Math.min(first, last), lastAt:Math.max(first, last)};
      p.total += p.records[fish.id].count;
    }
    const seen = new Set();
    if (Array.isArray(source.recordedIds)) for (const id of source.recordedIds) {
      if (safeId(id)) {seen.delete(id); seen.add(id);}
    }
    const last = cleanCatch(source.lastCatch);
    if (last && p.records[last.species] && last.length <= p.records[last.species].bestLength) {
      p.lastCatch = last;
      seen.delete(last.id); seen.add(last.id);
    }
    p.recordedIds = Array.from(seen).slice(-MAX_RECEIPTS);
    return p;
  }
  function decodeProgress(raw) {
    try {return cleanProgress(typeof raw === 'string' ? JSON.parse(raw) : raw);}
    catch (_) {return createProgress();}
  }
  function encodeProgress(p) {
    // Project onto known scalar fields so cyclic or extraneous data cannot leak into a save.
    try {return JSON.stringify(cleanProgress(p));}
    catch (_) {return JSON.stringify(createProgress());}
  }
  function recordCatch(progress, catchRecord) {
    if (!isObject(progress)) return false;
    let receipt, p;
    try {receipt = cleanCatch(catchRecord); p = cleanProgress(progress);}
    catch (_) {return false;}
    if (!receipt || p.recordedIds.includes(receipt.id)) return false;
    const old = p.records[receipt.species];
    if (old && old.count >= MAX_COUNT) return false;
    p.records[receipt.species] = old ? {
      count:old.count + 1,
      bestLength:Math.max(old.bestLength, receipt.length),
      firstAt:Math.min(old.firstAt, receipt.at),
      lastAt:Math.max(old.lastAt, receipt.at)
    } : {count:1, bestLength:receipt.length, firstAt:receipt.at, lastAt:receipt.at};
    p.total++;
    p.lastCatch = receipt;
    p.recordedIds.push(receipt.id);
    p.recordedIds = p.recordedIds.slice(-MAX_RECEIPTS);
    Object.assign(progress, p);
    return true;
  }

  function createSession(rng = Math.random) {
    return {phase:'idle', phaseTime:0, elapsed:0, tension:0, progress:0, reelTime:0,
      struggling:false, nibble:0, fish:null, catch:null, escapeReason:'', spot:'reeds',
      _rng:typeof rng === 'function' ? rng : Math.random, _waitDuration:0, _length:0, _struggleOffset:0, _overload:0};
  }
  function chooseFish(spot, rain, evening, rng) {
    // Habitat and weather affect odds; every weight remains positive in every spot.
    const weights = SPECIES.map((fish, i) => BASE_WEIGHTS[i] * (fish.habitat === spot ? 2.4 : .7) * (rain ? RAIN_BONUS[i] : 1) * (evening ? EVENING_BONUS[i] : 1));
    let choice = roll(rng) * weights.reduce((sum, n) => sum + n, 0);
    for (let i = 0; i < weights.length; i++) {choice -= weights[i]; if (choice < 0) return SPECIES[i];}
    return SPECIES[SPECIES.length - 1];
  }
  function cast(s, options = {}, rng) {
    if (!s || s.phase !== 'idle') return false;
    options = isObject(options) ? options : {};
    rng = typeof rng === 'function' ? rng : s._rng || Math.random;
    s.spot = SPOTS.includes(options.spot) ? options.spot : 'reeds';
    s.fish = chooseFish(s.spot, options.rain === true, options.evening === true, rng);
    s._waitDuration = 3 + roll(rng) * 4;
    s._length = Math.round((s.fish.minLength + roll(rng) * (s.fish.maxLength - s.fish.minLength)) * 10) / 10;
    s._struggleOffset = roll(rng) * .8;
    s.phase = 'casting'; s.phaseTime = 0; s.elapsed = 0;
    s.tension = 0; s.progress = 0; s.reelTime = 0; s.nibble = 0;
    s.struggling = false; s.catch = null; s.escapeReason = ''; s._overload = 0;
    return true;
  }
  function hook(s) {
    if (!s || s.phase !== 'bite') return false;
    s.phase = 'reeling'; s.phaseTime = 0; s.reelTime = 0;
    s.tension = .22; s.progress = 0; s.nibble = 0; s._overload = 0;
    s.struggling = false;
    return true;
  }
  function escaped(s, reason) {
    s.phase = 'escaped'; s.phaseTime = 0; s.nibble = 0; s.struggling = false;
    s.catch = null; s.escapeReason = reason;
  }
  function reel(s, dt, holding) {
    const b = s.fish.behavior;
    s.reelTime += dt;
    s.struggling = (s.reelTime + b.strugglePhase + s._struggleOffset) % b.strugglePeriod < b.struggleDuration;
    if (holding) {
      s.progress = clamp(s.progress + b.reelRate * (s.struggling ? .72 : 1) * dt, 0, 1);
      s.tension = clamp(s.tension + (b.tensionRate + (s.struggling ? b.struggleTension : 0)) * dt, 0, 1);
    } else {
      s.progress = clamp(s.progress - .012 * dt, 0, 1);
      s.tension = clamp(s.tension - b.relaxRate * dt, 0, 1);
    }
    // A brief full meter is recoverable. Slack is always safe, even at zero tension.
    s._overload = s.tension >= 1 - 1e-8 ? s._overload + dt : 0;
    if (s._overload >= LINE_GRACE - 1e-8) {
      escaped(s, 'The line grew too tight. Give it a little slack next time.');
    } else if (s.progress >= 1 - 1e-8) {
      s.progress = 1; s.phase = 'caught'; s.phaseTime = 0; s.struggling = false;
      s.catch = {id:catchId(), species:s.fish.id, length:s._length, at:Date.now()};
    }
  }
  function step(s, dt, holding = false) {
    if (!s || !Number.isFinite(dt) || dt <= 0) return s && s.phase;
    let remaining = Math.min(dt, MAX_STEP);
    while (remaining > 1e-8 && ['casting','waiting','bite','reeling'].includes(s.phase)) {
      let part = Math.min(remaining, .01);
      const duration = s.phase === 'casting' ? CAST_TIME : s.phase === 'waiting' ? s._waitDuration : s.phase === 'bite' ? BITE_WINDOW : Infinity;
      part = Math.min(part, Math.max(0, duration - s.phaseTime));
      s.phaseTime += part; s.elapsed += part; remaining -= part;
      if (s.phase === 'reeling') {
        reel(s, part, holding === true);
      } else if (s.phase === 'waiting') {
        const t = s.phaseTime / s._waitDuration;
        s.nibble = Math.max(0, 1 - Math.abs(t - .28) / .045, 1 - Math.abs(t - .64) / .055) * .55;
      }
      if (s.phaseTime >= duration - 1e-8) {
        if (s.phase === 'casting') {s.phase = 'waiting'; s.phaseTime = 0;}
        else if (s.phase === 'waiting') {s.phase = 'bite'; s.phaseTime = 0; s.nibble = 1;}
        else if (s.phase === 'bite') escaped(s, 'The fish slipped away before you set the hook.');
      }
    }
    return s.phase;
  }
  function release(s) {
    if (!s) return 'idle';
    s.phase = 'idle'; s.phaseTime = 0; s.elapsed = 0; s.tension = 0; s.progress = 0;
    s.reelTime = 0; s.struggling = false; s.nibble = 0; s.fish = null;
    s.catch = null; s.escapeReason = ''; s._overload = 0;
    return s.phase;
  }

  const api = {KEY, SPECIES, MAX_STEP, CAST_TIME, BITE_WINDOW, LINE_GRACE, MAX_RECEIPTS,
    createProgress, decodeProgress, encodeProgress, createSession, cast, hook, step, release, recordCatch};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FishingLife = api;
})(globalThis);
