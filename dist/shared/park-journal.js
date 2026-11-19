/* Small memories from persisted world facts. Reading the journal never advances a game. */
(function (root) {
  'use strict';

  const KEY = 'spriggan.park.v1', MAX_MEMORIES = 20, MAX_DATE = 8640000000000000;
  const WORLDS = ['pond', 'pixel', 'hex', 'dumplings', 'claw', 'slots', 'fishing'];
  const SAVE_KEYS = {
    pond:'spriggan.pond.v1', pixel:'spriggan.farm.v1', hex:'spriggan.hex.totals.v1',
    dumplings:'spriggan.dumplings.v1', claw:'spriggan.claw.v1', slots:'spriggan.slots.v1',
    fishing:'spriggan.fishing.guide.v1'
  };
  const FISH = {
    'willow-minnow':['Willow Minnow',6,12], 'copper-perch':['Copper Perch',12,26],
    'pebble-loach':['Pebble Loach',9,19], 'ribbon-dace':['Ribbon Dace',10,22],
    'clover-carp':['Clover Carp',22,44], glassfin:['Glassfin',8,18],
    'moon-bream':['Moon Bream',18,34], starfin:['Starfin',14,28]
  };
  const PLUSH = {frog:'Moss',koi:'Kin',chick:'Pip',bunny:'Clover',dumpling:'Fold',cat:'Toast',moonfox:'Lune'};
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const whole = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  const time = value => Number.isFinite(value) && value >= 0 && value <= MAX_DATE;
  const safeId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(value);
  const name = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0,24) : fallback;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const copy = value => JSON.parse(JSON.stringify(value));

  function pondFacts(value) {
    if (!object(value) || value.version !== 1 || !Array.isArray(value.fish) || value.fish.length > 12) return null;
    const ids = new Set(), fish = [];
    for (const f of value.fish) {
      if (!object(f) || !safeId(f.id) || ids.has(f.id) || !Number.isFinite(f.growth) || f.growth < 0 || f.growth > .75) return null;
      ids.add(f.id); fish.push({id:f.id,name:name(f.name,'A koi'),growth:f.growth,golden:f.golden === true});
    }
    return {fish};
  }
  function farmFacts(value) {
    if (!object(value) || ![1,2].includes(value.version) || !Array.isArray(value.birds) || !Array.isArray(value.eggs) || value.birds.length + value.eggs.length > 16) return null;
    if (value.hatched !== undefined && !whole(value.hatched)) return null;
    const ids = new Set(), birds = [], cows = [];
    for (const bird of value.birds) {
      if (!object(bird) || !safeId(bird.id) || ids.has(bird.id) || !['chick','adult'].includes(bird.stage)) return null;
      ids.add(bird.id); birds.push({id:bird.id,name:name(bird.name,'A chick'),stage:bird.stage});
    }
    const savedCows = value.cows === undefined ? value.cow ? [value.cow] : [] : value.cows;
    if (!Array.isArray(savedCows) || savedCows.length > 1000) return null;
    for (const cow of savedCows) {
      if (!object(cow) || !safeId(cow.id) || ids.has(cow.id)) return null;
      ids.add(cow.id); cows.push({id:cow.id,name:name(cow.name,'Buttercup')});
    }
    return {hatched:value.hatched || 0,birds,cows};
  }
  function fishingFacts(value) {
    if (!object(value) || value.version !== 1 || !object(value.records)) return null;
    const records = {};
    for (const [id, record] of Object.entries(value.records)) {
      if (!own(FISH,id) || !object(record) || !whole(record.count,1000000) || !record.count || !Number.isFinite(record.bestLength) || record.bestLength < FISH[id][1] || record.bestLength > FISH[id][2]) return null;
      records[id] = {count:record.count,bestLength:record.bestLength};
    }
    return {records};
  }
  function clawFacts(value) {
    if (!object(value) || value.version !== 1 || !object(value.collection)) return null;
    const collection = {};
    for (const [id, count] of Object.entries(value.collection)) {
      if (!own(PLUSH,id) || !whole(count,9999)) return null;
      if (count) collection[id] = count;
    }
    return {collection};
  }
  function kitchenFacts(value) {
    if (!object(value) || value.version !== 1 || !whole(value.served)) return null;
    const shop = value.shop;
    if (shop !== undefined && (!object(shop) || !whole(shop.sales,1000000000))) return null;
    return {sales:shop ? shop.sales : 0,served:value.served,earningsId:typeof shop?.earningsId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(shop.earningsId) ? shop.earningsId : null};
  }
  function slotsFacts(value) {
    if (!object(value) || ![1,2,3].includes(value.version) || !whole(value.spins) || !whole(value.balance)) return null;
    const rewards = {};
    for (const [id, unlocked, claimedFlag] of [['pond','goldenUnlocked','goldenClaimed'],['farm','cowUnlocked','cowClaimed']]) {
      const r = value.rewards?.[id];
      if (r !== undefined && (!object(r) || !whole(r.won) || !whole(r.claimed) || r.claimed > r.won)) return null;
      const claimed = Math.max(r?.claimed || 0,value[claimedFlag] === true ? 1 : 0);
      rewards[id] = {won:Math.max(r?.won || 0,value[unlocked] === true ? 1 : 0,claimed),claimed};
    }
    return {rewards};
  }
  function hexFacts(value) {
    if (!object(value) || !whole(value.storeys) || value.storeys < 1) return null;
    return {storeys:value.storeys};
  }
  const readers = {pond:pondFacts,pixel:farmFacts,fishing:fishingFacts,claw:clawFacts,dumplings:kitchenFacts,slots:slotsFacts,hex:hexFacts};
  const empty = {
    fishing:{records:{}}, claw:{collection:{}}, dumplings:{sales:0,served:0,earningsId:null},
    slots:{rewards:{pond:{won:0,claimed:0},farm:{won:0,claimed:0}}}, hex:{storeys:1}
  };

  function readSnapshot(storage, now = Date.now()) {
    // `now` belongs to the common API; wall-clock time never invents an animal or catch.
    void now;
    const result = {};
    try {if (storage === undefined) storage = root.localStorage;} catch (_) {return result;}
    if (!storage || typeof storage.getItem !== 'function') return result;
    for (const world of WORLDS) {
      try {
        const raw = storage.getItem(SAVE_KEYS[world]);
        if (raw === null) {
          // Seed animals have identities only after their world saves for the first time.
          if (empty[world]) result[world] = copy(empty[world]);
          continue;
        }
        if (typeof raw !== 'string' || raw.length > 2000000) continue;
        const facts = readers[world](JSON.parse(raw));
        if (facts) result[world] = facts;
      } catch (_) { /* A broken or blocked world save must never become a false milestone. */ }
    }
    return result;
  }

  function cleanSnapshot(value) {
    if (!object(value)) return {};
    const result = {};
    // Facts share their relevant save fields, but never carry game settings or positions.
    for (const world of WORLDS) {
      const facts = value[world];
      if (!object(facts)) continue;
      let parsed;
      if (world === 'pond') parsed = pondFacts({version:1,...facts});
      if (world === 'pixel') parsed = farmFacts({version:2,eggs:[],...facts});
      if (world === 'fishing') parsed = fishingFacts({version:1,...facts});
      if (world === 'claw') parsed = clawFacts({version:1,...facts});
      if (world === 'dumplings') parsed = kitchenFacts({version:1,served:facts.served,shop:{sales:facts.sales,earningsId:facts.earningsId}});
      if (world === 'slots') parsed = slotsFacts({version:3,spins:0,balance:0,...facts});
      if (world === 'hex') parsed = hexFacts(facts);
      if (parsed) result[world] = parsed;
    }
    return result;
  }
  function cleanMetadata(value) {
    try {if (typeof value === 'string') value = JSON.parse(value);} catch (_) {value = null;}
    if (!object(value) || value.version !== 1) return {version:1,lastWorld:null,lastVisitedAt:0,snapshot:{},memories:[]};
    const seen = new Set(), memories = [];
    for (const memory of Array.isArray(value.memories) ? value.memories.slice(0,100) : []) {
      if (!object(memory) || typeof memory.id !== 'string' || !memory.id || memory.id.length > 200 || seen.has(memory.id) || !WORLDS.includes(memory.world) || typeof memory.text !== 'string' || !memory.text.trim() || memory.text.length > 220 || !time(memory.at)) continue;
      seen.add(memory.id); memories.push({id:memory.id,world:memory.world,text:memory.text,at:memory.at});
    }
    memories.sort((a,b) => b.at - a.at);
    return {version:1,lastWorld:WORLDS.includes(value.lastWorld) ? value.lastWorld : null,lastVisitedAt:time(value.lastVisitedAt) ? value.lastVisitedAt : 0,snapshot:cleanSnapshot(value.snapshot),memories:memories.slice(0,MAX_MEMORIES)};
  }
  function salesMilestone(sales) {
    const steps = [1,10,25,50,100,250,500,1000];
    return sales >= 1000 ? Math.floor(sales / 1000) * 1000 : steps.filter(n => n <= sales).at(-1) || 0;
  }
  function updateJournal(previousMetadata, snapshot, options = {}) {
    options = object(options) ? options : {};
    const previous = cleanMetadata(previousMetadata), current = cleanSnapshot(snapshot);
    const now = time(options.now) ? options.now : Date.now();
    const result = {...previous,snapshot:{...previous.snapshot},memories:[...previous.memories]};
    const known = new Set(result.memories.map(memory => memory.id)), additions = [];
    function remember(id, world, text) {
      if (known.has(id)) return;
      known.add(id); additions.push({id,world,text,at:now});
    }
    for (const world of WORLDS) {
      const next = current[world], old = previous.snapshot[world];
      if (!next) continue;
      result.snapshot[world] = copy(next);
      // Each world gets an honest baseline, even when a pre-existing park first enables its journal.
      if (!old) continue;
      if (world === 'pond') {
        const byId = new Map(old.fish.map(f => [f.id,f]));
        const joined = next.fish.filter(f => !byId.has(f.id));
        if (joined.length) remember('pond:joined:' + joined.map(f => f.id).sort().join(',').slice(0,160),'pond',joined.length === 1 ? `${joined[0].name} joined your pond.` : `${joined.length} new koi joined your pond.`);
        const grown = next.fish.filter(f => byId.has(f.id) && Math.floor((f.growth + 1e-8) * 10) > Math.floor((byId.get(f.id).growth + 1e-8) * 10));
        if (grown.length) remember('pond:grown:' + grown.map(f => `${f.id}:${Math.floor((f.growth + 1e-8) * 10)}`).sort().join(',').slice(0,160),'pond',grown.length === 1 ? `${grown[0].name} has grown a little.` : `${grown.length} of your koi have grown a little.`);
        // Keep growth records through a clock rollback or restored older game save.
        result.snapshot.pond.fish.forEach(f => {if (byId.has(f.id)) f.growth = Math.max(f.growth,byId.get(f.id).growth);});
      }
      if (world === 'pixel') {
        const hatched = next.hatched - old.hatched;
        if (hatched > 0) remember(`pixel:hatched:${next.hatched}`,'pixel',hatched === 1 ? 'A little peep! An egg hatched at Sunny Side Farm.' : `${hatched} eggs hatched at Sunny Side Farm.`);
        const birds = new Map(old.birds.map(b => [b.id,b]));
        const grown = next.birds.filter(b => b.stage === 'adult' && birds.get(b.id)?.stage === 'chick');
        if (grown.length) remember('pixel:grown:' + grown.map(b => b.id).sort().join(',').slice(0,160),'pixel',grown.length === 1 ? `${grown[0].name} grew up and joined the flock.` : `${grown.length} chicks grew up and joined the flock.`);
        const cowIds = new Set(old.cows.map(c => c.id)), joined = next.cows.filter(c => !cowIds.has(c.id));
        if (joined.length) remember('pixel:cow:' + joined.map(c => c.id).sort().join(',').slice(0,160),'pixel',joined.length === 1 ? `${joined[0].name} settled in at Sunny Side Farm.` : `${joined.length} cows settled in at Sunny Side Farm.`);
        result.snapshot.pixel.hatched = Math.max(next.hatched,old.hatched);
      }
      if (world === 'fishing') {
        const discoveries = Object.keys(next.records).filter(id => !old.records[id]);
        if (discoveries.length) remember('fishing:discovered:' + discoveries.sort().join(','),'fishing',discoveries.length === 1 ? `You met the ${FISH[discoveries[0]][0]}. A new page in your field guide.` : `${discoveries.length} new river fish found a place in your field guide.`);
        const records = Object.keys(next.records).filter(id => old.records[id] && next.records[id].bestLength > old.records[id].bestLength + .049);
        if (records.length) remember('fishing:record:' + records.map(id => `${id}:${next.records[id].bestLength}`).sort().join(','),'fishing',records.length === 1 ? `A new ${FISH[records[0]][0]} record: ${next.records[records[0]].bestLength.toFixed(1)} cm.` : `New length records for ${records.length} river fish.`);
        for (const [id, record] of Object.entries(old.records)) {
          const currentRecord = result.snapshot.fishing.records[id];
          result.snapshot.fishing.records[id] = currentRecord ? {count:Math.max(currentRecord.count,record.count),bestLength:Math.max(currentRecord.bestLength,record.bestLength)} : copy(record);
        }
      }
      if (world === 'claw') {
        const additions = Object.keys(next.collection).filter(id => next.collection[id] > (old.collection[id] || 0));
        if (additions.length) {
          const id = additions[0], count = next.collection[id];
          remember('claw:kept:' + additions.map(id => `${id}:${next.collection[id]}`).sort().join(','),'claw',additions.length > 1 ? `${additions.length} kinds of plush friend joined your collection.` : !old.collection[id] ? `${PLUSH[id]} found a home in your plush collection.` : `Your plush collection now has ${count} ${PLUSH[id]} friends.`);
        }
        for (const [id, count] of Object.entries(old.collection)) result.snapshot.claw.collection[id] = Math.max(count,next.collection[id] || 0);
      }
      if (world === 'dumplings' && (!old.earningsId || !next.earningsId || old.earningsId === next.earningsId)) {
        const milestone = salesMilestone(next.sales);
        if (milestone > salesMilestone(old.sales)) remember(`dumplings:${next.earningsId || 'legacy'}:sales:${milestone}`,'dumplings',milestone === 1 ? 'Your first dumpling found a hungry neighbor at Little Folds.' : `Little Folds has shared ${milestone} dumplings with hungry neighbors.`);
        result.snapshot.dumplings.sales = Math.max(old.sales,next.sales);
        result.snapshot.dumplings.served = Math.max(old.served,next.served);
      }
      if (world === 'slots') for (const id of ['pond','farm']) {
        if (next.rewards[id].won > old.rewards[id].won) remember(`slots:${id}:won:${next.rewards[id].won}`,'slots',`You won a new friend for ${id === 'pond' ? 'Stillwater Pond' : 'Sunny Side Farm'} at Golden Seed.`);
        result.snapshot.slots.rewards[id] = {won:Math.max(next.rewards[id].won,old.rewards[id].won),claimed:Math.max(next.rewards[id].claimed,old.rewards[id].claimed)};
      }
      if (world === 'hex') {
        if (next.storeys > old.storeys) remember(`hex:storeys:${next.storeys}`,'hex',`Clover Keep grew to ${next.storeys} storeys.`);
        result.snapshot.hex.storeys = Math.max(old.storeys,next.storeys);
      }
    }
    result.memories = [...additions.reverse(),...result.memories].sort((a,b) => b.at - a.at).slice(0,MAX_MEMORIES);
    if (WORLDS.includes(options.world)) {result.lastWorld = options.world; result.lastVisitedAt = now;}
    return result;
  }

  const api = {KEY,MAX_MEMORIES,WORLDS,SAVE_KEYS,readSnapshot,updateJournal};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SprigganJournal = api;
})(globalThis);
