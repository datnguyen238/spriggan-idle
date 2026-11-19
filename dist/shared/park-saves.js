/* Portable park saves. Validate the complete file before touching browser storage. */
(function (root) {
  'use strict';

  const FORMAT = 'spriggan-park', VERSION = 1, MAX_BYTES = 2 * 1024 * 1024;
  const MAX_DATE = 8640000000000000;
  const ROUTES = ['pond', 'pixel', 'hex', 'dumplings', 'claw', 'slots', 'fishing'];
  const FILLINGS = ['mushroom', 'greens', 'ginger', 'meat'];
  const PLUSHIES = ['frog', 'koi', 'chick', 'bunny', 'dumpling', 'cat', 'moonfox'];
  const FISH = {
    'willow-minnow': [6, 12], 'copper-perch': [12, 26], 'pebble-loach': [9, 19],
    'ribbon-dace': [10, 22], 'clover-carp': [22, 44], 'glassfin': [8, 18],
    'moon-bream': [18, 34], starfin: [14, 28]
  };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const number = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(value) && value >= min && value <= max;
  const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
  const string = (value, max = 128) => typeof value === 'string' && value.length > 0 && value.length <= max;
  const bool = value => typeof value === 'boolean';
  const time = value => number(value, 0, MAX_DATE);
  const optional = (value, key, validate) => !own(value, key) || validate(value[key]);
  const list = (value, max, validate) => Array.isArray(value) && value.length <= max && value.every(item => validate(item));
  const audio = value => object(value) && ['rain', 'ambient', 'music'].every(key => optional(value, key, bool));
  const uniqueIds = values => values.every(v => string(v.id, 128)) && new Set(values.map(v => v.id)).size === values.length;
  const validVersion = (value, versions) => object(value) && versions.includes(value.version);

  function safeJSON(text) {
    return JSON.parse(text, (key, value) => {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw Error('Unsafe property');
      return value;
    });
  }
  function bounded(value, depth = 0) {
    if (depth > 8) return false;
    if (value === null || bool(value)) return true;
    if (typeof value === 'string') return value.length <= 1000;
    if (typeof value === 'number') return number(value, -Number.MAX_SAFE_INTEGER);
    if (Array.isArray(value)) return value.length <= 1000 && value.every(v => bounded(v, depth + 1));
    return object(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([key, v]) => key.length <= 128 && bounded(v, depth + 1));
  }
  function pond(value) {
    if (!validVersion(value, [1]) || !list(value.fish, 12, f => object(f) &&
      string(f.id, 99) && string(f.name, 24) && number(f.baseSize, 49, 70) && integer(f.pattern, 0, 5) &&
      time(f.createdAt) && time(f.lastGrowthAt) && number(f.growth, 0, .75) && number(f.nutrition, 0, 3) &&
      integer(f.meals, 0, 1000000) && number(f.x, 0, 1) && number(f.y, 0, 1) && optional(f, 'golden', bool)) || !uniqueIds(value.fish)) return false;
    const s = value.settings;
    return time(value.savedAt) && optional(value, 'nextGoldenAt', time) && object(s) &&
      ['night', 'raining', 'collapsed'].every(key => optional(s, key, bool)) &&
      optional(s, 'pace', v => number(v, .4, 2)) && optional(s, 'rainVolume', v => number(v, 0, 100)) && optional(s, 'audio', audio);
  }
  function farm(value) {
    if (!validVersion(value, [1, 2]) || !list(value.birds, 16, b => object(b) &&
      string(b.id) && optional(b, 'name', v => string(v, 24)) && ['hen', 'rooster'].includes(b.sex) &&
      ['adult', 'chick'].includes(b.stage) && time(b.born) && integer(b.meals, 0, 1000000) &&
      integer(b.layFood, 0, 100) && number(b.x, 0, 1) && number(b.y, 0, 1)) ||
      !list(value.eggs, 16, e => object(e) && string(e.id) && number(e.x, 0, 1) && number(e.y, 0, 1) &&
        time(e.laid) && time(e.hatchesAt) && e.hatchesAt >= e.laid) || value.birds.length + value.eggs.length > 16) return false;
    const cows = value.cows === undefined ? (value.cow ? [value.cow] : []) : value.cows;
    return list(cows, 10000, c => object(c) && typeof c.id === 'string' && /^spriggan-golden-seed-cow(?:-\d+)?$/.test(c.id) &&
      optional(c, 'name', v => string(v, 24)) && time(c.born) && integer(c.meals, 0, 1000000) && number(c.x, 0, 1) && number(c.y, 0, 1)) &&
      uniqueIds([...value.birds, ...value.eggs, ...cows]) && time(value.savedAt) && optional(value, 'hatched', integer) &&
      optional(value, 'foxWait', v => number(v, 0, 120));
  }
  function kitchen(value) {
    if (!validVersion(value, [1]) || !['empty', 'wrapper', 'filled'].includes(value.stage) ||
      !integer(value.folds, 0, 2) || !FILLINGS.includes(value.filling) ||
      !list(value.basket, 6, v => FILLINGS.includes(v)) || !list(value.cooking, 6, v => FILLINGS.includes(v)) ||
      !list(value.plate, 24, v => FILLINGS.includes(v)) || !number(value.remaining, 0, 35) ||
      !integer(value.served) || !bool(value.ready) || !bool(value.paused)) return false;
    const s = value.settings, shop = value.shop;
    if (!object(s) || !optional(s, 'night', bool) || !optional(s, 'rainVolume', v => number(v, 0, 100)) || !optional(s, 'audio', audio)) return false;
    // Old kitchens predate guests and earnings; preserve those saves without inventing a shop.
    if (shop === undefined) return true;
    return object(shop) && optional(shop, 'earningsId', v => typeof v === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(v)) &&
      ['coins', 'sales', 'nextId'].every(key => integer(shop[key], 0, 1000000000)) && number(shop.nextArrival, 0, 45) &&
      list(shop.guests, 4, c => object(c) && integer(c.id, 0, 1000000000) && integer(c.seat, 0, 3) &&
        ['arriving', 'waiting', 'paying', 'seating', 'eating', 'leaving'].includes(c.phase) && number(c.age, 0, 1000000000) &&
        (c.meal === null || FILLINGS.includes(c.meal)) && optional(c, 'takeaway', bool) && optional(c, 'order', v => list(v, 6, f => FILLINGS.includes(f)))) &&
      new Set(shop.guests.map(c => c.id)).size === shop.guests.length && new Set(shop.guests.map(c => c.seat)).size === shop.guests.length;
  }
  function slots(value) {
    if (!validVersion(value, [1, 2, 3]) || !integer(value.balance) || !integer(value.spins)) return false;
    if (!optional(value, 'selectedMap', v => ['pond', 'farm'].includes(v)) || !optional(value, 'savedAt', time) ||
      !optional(value, 'refillAt', v => v === null || time(v)) ||
      !optional(value, 'lastRefillDay', v => v === null || typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ||
      !optional(value, 'settings', s => object(s) && optional(s, 'sound', bool) && optional(s, 'motion', bool)) ||
      !['goldenUnlocked', 'goldenClaimed', 'cowUnlocked', 'cowClaimed'].every(key => optional(value, key, bool))) return false;
    if (!optional(value, 'kitchenCredits', v => object(v) && Object.entries(v).every(([id, n]) => /^[A-Za-z0-9-]{1,80}$/.test(id) && integer(n)))) return false;
    if (!optional(value, 'rewards', v => object(v) && Object.entries(v).every(([key, r]) => ['pond', 'farm'].includes(key) && object(r) && integer(r.won) && integer(r.claimed, 0, r.won)))) return false;
    return optional(value, 'lastResult', r => r === null || object(r) &&
      list(r.symbols, 3, s => ['leaf', 'flower', 'moon', 'star', 'seed', 'friend'].includes(s)) && r.symbols.length === 3 &&
      optional(r, 'map', m => ['pond', 'farm'].includes(m)) && optional(r, 'kind', k => ['miss', 'pair', 'triple'].includes(k)) &&
      optional(r, 'payout', integer) && optional(r, 'net', n => number(n, -10)) && optional(r, 'newReward', bool));
  }
  function claw(value) {
    if (!validVersion(value, [1]) || !object(value.collection) ||
      !Object.entries(value.collection).every(([type, n]) => PLUSHIES.includes(type) && integer(n, 1, 9999)) ||
      !optional(value, 'coins', v => integer(v, 0, 999999)) || !optional(value, 'sound', bool) ||
      !optional(value, 'lastKept', v => v === null || PLUSHIES.includes(v) && value.collection[v] > 0)) return false;
    if (value.friends === undefined) return true;
    if (!list(value.friends, 69993, f => object(f) && string(f.id, 100) && PLUSHIES.includes(f.type) && string(f.name, 24) &&
      ['shelf', 'cushion', 'window'].includes(f.spot)) || !uniqueIds(value.friends)) return false;
    return PLUSHIES.every(type => value.friends.filter(f => f.type === type).length === (value.collection[type] || 0));
  }
  function fishing(value) {
    if (!validVersion(value, [1]) || !object(value.records) || !integer(value.total, 0, 8000000)) return false;
    let total = 0;
    for (const [id, record] of Object.entries(value.records)) {
      if (!own(FISH, id) || !object(record) || !integer(record.count, 1, 1000000) ||
        !number(record.bestLength, ...FISH[id]) || !time(record.firstAt) || !time(record.lastAt) || record.lastAt < record.firstAt) return false;
      total += record.count;
    }
    if (total !== value.total || !optional(value, 'recordedIds', v => list(v, 512, id => string(id) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) && new Set(v).size === v.length)) return false;
    return optional(value, 'lastCatch', c => c === null || object(c) && string(c.id) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(c.id) &&
      own(FISH, c.species) && number(c.length, ...FISH[c.species]) && time(c.at) && own(value.records, c.species) && c.length <= value.records[c.species].bestLength);
  }
  function timer(value) {
    const duration = {focus: 3000000, short: 300000, long: 900000};
    return validVersion(value, [1, 2]) && own(duration, value.mode) && number(value.remaining, 0, duration[value.mode]) && value.remaining > 0 &&
      (value.endsAt === null || time(value.endsAt)) && integer(value.completed, 0, 1000000) &&
      optional(value, 'collapsed', bool) && optional(value, 'chime', bool);
  }
  const settings = value => object(value) && bool(value.enabled) && number(value.volume, 0, 1);
  const schema = {
    'spriggan.pond.v1': [pond, 'pond'],
    'spriggan.farm.v1': [farm, 'pixel'],
    'spriggan.dumplings.v1': [kitchen, 'dumplings'],
    'spriggan.slots.v1': [slots, 'slots'],
    'spriggan.claw.v1': [claw, 'claw'],
    'spriggan.fishing.guide.v1': [fishing, 'fishing'],
    'spriggan.hex.totals.v1': [v => object(v) && integer(v.shooed) && integer(v.snacks) && integer(v.storeys, 1), 'hex'],
    'spriggan.timer.v1': [timer, null],
    'spriggan.farm.timer.v1': [timer, 'pixel'],
    'spriggan.dumplings.timer.v1': [timer, 'dumplings'],
    'spriggan.hex.timer.v1': [timer, 'hex'],
    'spriggan.fishing.timer.v1': [timer, 'fishing'],
    'spriggan.farm.music.v1': [settings, 'pixel'],
    'spriggan.farm.rain.v1': [settings, 'pixel'],
    'spriggan.hex.rain.v1': [settings, 'hex'],
    'spriggan.hex.moonlight': [bool, 'hex'],
    'spriggan.fishing.settings.v1': [v => object(v) && ['evening', 'rain', 'sound'].every(k => bool(v[k])) && ['hold', 'toggle'].includes(v.method), 'fishing'],
    'spriggan.park.v1': [v => validVersion(v, [1]) && (v.lastWorld === null || ROUTES.includes(v.lastWorld)) &&
      time(v.lastVisitedAt) && object(v.snapshot) && bounded(v.snapshot) && list(v.memories, 100, m => object(m) &&
        string(m.id, 200) && ROUTES.includes(m.world) && string(m.text, 220) && m.text.trim().length > 0 && time(m.at)) &&
      new Set(v.memories.map(m => m.id)).size === v.memories.length, null]
  };
  const SUPPORTED_KEYS = Object.freeze(Object.keys(schema));

  function bytes(text) {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 128) count++;
      else if (code < 2048) count += 2;
      else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { count += 4; i++; }
      else count += 3;
      if (count > MAX_BYTES) break;
    }
    return count;
  }
  function fail(message, code) {
    const error = new Error(message); error.code = code; return error;
  }
  function saveLabel(key) {
    const world = schema[key]?.[1];
    return {pond:'Stillwater Pond',pixel:'Sunny Side Farm',hex:'Clover Keep',dumplings:'Little Folds',claw:'Little Arcade',slots:'Golden Seed',fishing:'The Fishing Dock'}[world] || (key === 'spriggan.park.v1' ? 'your park journal' : 'your focus timer');
  }
  function checkEntry(key, raw) {
    if (!own(schema, key)) throw fail('This backup contains an unsupported world or preference. Choose a Spriggan park backup.', 'UNSUPPORTED_KEY');
    let value;
    try { if (typeof raw !== 'string') throw Error(); value = safeJSON(raw); }
    catch (_) { throw fail('The saved data for ' + saveLabel(key) + ' is not valid. Your current progress has not changed.', 'INVALID_SAVE'); }
    let valid = false;
    try { valid = schema[key][0](value); } catch (_) {}
    if (!valid) throw fail('The saved data for ' + saveLabel(key) + ' is damaged or uses an unsupported version. Your current progress has not changed.', 'INVALID_SAVE');
  }
  function inspectBackup(text) {
    if (typeof text !== 'string' || bytes(text) > MAX_BYTES) throw fail('Choose a Spriggan backup smaller than 2 MB.', 'FILE_SIZE');
    let backup;
    try { backup = safeJSON(text); } catch (_) { throw fail('This file is not a valid Spriggan backup. Choose the original JSON backup file.', 'INVALID_FILE'); }
    if (!object(backup) || backup.format !== FORMAT || backup.version !== VERSION ||
      Object.keys(backup).some(k => !['format', 'version', 'exportedAt', 'entries'].includes(k))) {
      throw fail('This backup format or version is not supported. Choose a Spriggan park backup.', 'UNSUPPORTED_FORMAT');
    }
    if (typeof backup.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(backup.exportedAt) ||
      !Number.isFinite(Date.parse(backup.exportedAt)) || new Date(backup.exportedAt).toISOString() !== backup.exportedAt || !object(backup.entries)) {
      throw fail('This backup is incomplete. Choose the original JSON backup file.', 'INVALID_FILE');
    }
    const entries = {}, worlds = new Set();
    for (const [key, raw] of Object.entries(backup.entries)) {
      checkEntry(key, raw); entries[key] = raw;
      if (schema[key][1]) worlds.add(schema[key][1]);
    }
    return {entries, count: Object.keys(entries).length, worlds: ROUTES.filter(route => worlds.has(route)), exportedAt: backup.exportedAt};
  }
  function getStorage(storage, write = false) {
    try {
      const target = storage === undefined ? root.localStorage : storage;
      if (!target || typeof target.getItem !== 'function' || write && (typeof target.setItem !== 'function' || typeof target.removeItem !== 'function')) throw Error();
      return target;
    } catch (_) { throw fail('Browser storage is unavailable. Allow site storage and try again.', 'STORAGE_UNAVAILABLE'); }
  }
  function exportBackup(storage) {
    const target = getStorage(storage), entries = {};
    for (const key of SUPPORTED_KEYS) {
      let raw;
      try { raw = target.getItem(key); } catch (_) { throw fail('The park could not read browser storage. Allow site storage and try again.', 'STORAGE_READ'); }
      if (raw !== null) { checkEntry(key, raw); entries[key] = raw; }
    }
    const text = JSON.stringify({format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), entries}, null, 2);
    if (bytes(text) > MAX_BYTES) throw fail('This park is larger than the 2 MB backup limit. Your saved progress has not changed.', 'FILE_SIZE');
    return text;
  }
  function restoreBackup(text, storage) {
    const summary = inspectBackup(text), target = getStorage(storage, true), previous = new Map();
    for (const key of Object.keys(summary.entries)) {
      try { previous.set(key, target.getItem(key)); }
      catch (_) { throw fail('The park could not read your current saves. Nothing has been restored. Allow site storage and try again.', 'STORAGE_READ'); }
    }
    const written = [];
    let current = null;
    try {
      for (const [key, raw] of Object.entries(summary.entries)) {
        if (previous.get(key) === raw) continue;
        current = key; target.setItem(key, raw); written.push(key); current = null;
      }
    } catch (_) {
      // Storage writes are atomic, but also account for adapters that throw after writing.
      if (current !== null) try { if (target.getItem(current) !== previous.get(current)) written.push(current); } catch (_) { written.push(current); }
      let recovered = true;
      // Free imported values first, so even quota failures can restore the original sizes.
      for (const key of written) try { target.removeItem(key); } catch (_) { recovered = false; }
      for (const key of written) if (previous.get(key) !== null) try { target.setItem(key, previous.get(key)); } catch (_) { recovered = false; }
      if (!recovered) throw fail('Restore stopped because browser storage failed, and some previous saves could not be recovered. Keep your backup file, allow site storage, and try restoring again.', 'ROLLBACK_FAILED');
      throw fail('The backup could not be saved. Your previous progress was restored. Free some browser storage or allow site storage, then try again.', 'STORAGE_WRITE');
    }
    return summary;
  }

  // Cloud snapshots describe the entire park, including worlds absent from the file.
  // Keep restoreBackup's partial import semantics separate from this replacement.
  function restorePark(text, storage) {
    const summary = inspectBackup(text), target = getStorage(storage, true), previous = new Map();
    for (const key of SUPPORTED_KEYS) {
      try { previous.set(key, target.getItem(key)); }
      catch (_) { throw fail('The park could not read your current saves. Nothing has been restored. Allow site storage and try again.', 'STORAGE_READ'); }
    }
    const touched = new Set();
    try {
      // Removing absent worlds first leaves room for the incoming snapshot.
      for (const key of SUPPORTED_KEYS) if (!own(summary.entries, key) && previous.get(key) !== null) {
        touched.add(key); target.removeItem(key);
      }
      for (const [key, value] of Object.entries(summary.entries)) if (previous.get(key) !== value) {
        touched.add(key); target.setItem(key, value);
      }
    } catch (_) {
      // Include the attempted operation: an adapter may throw after changing storage.
      for (const key of touched) try { target.removeItem(key); } catch (_) {}
      for (const key of touched) if (previous.get(key) !== null) try { target.setItem(key, previous.get(key)); } catch (_) {}
      let recovered = true;
      for (const key of touched) {
        try { if (target.getItem(key) !== previous.get(key)) recovered = false; }
        catch (_) { recovered = false; }
      }
      if (!recovered) throw fail('Restore stopped because browser storage failed, and some previous saves could not be recovered. Keep your backup file, allow site storage, and try restoring again.', 'ROLLBACK_FAILED');
      throw fail('The park could not be restored. Your previous progress was restored. Free some browser storage or allow site storage, then try again.', 'STORAGE_WRITE');
    }
    return summary;
  }

  const api = Object.freeze({FORMAT, VERSION, MAX_BYTES, SUPPORTED_KEYS, exportBackup, inspectBackup, restoreBackup, restorePark});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SprigganSaves = api;
})(globalThis);
