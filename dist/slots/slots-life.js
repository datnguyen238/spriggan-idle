/* Golden Seed rules and saves, independent of drawing and reel animation. */
(() => {
  'use strict';

  const KEY = 'spriggan.slots.v1';
  const COST = 10;
  const GOLDEN_AT = 60;
  const GOLDEN_FISH_ID = 'spriggan-golden-seed-koi';
  const SYMBOLS = Object.freeze([
    { id: 'leaf', label: 'Leaf', weight: 30, payout: 40 },
    { id: 'flower', label: 'Flower', weight: 25, payout: 60 },
    { id: 'egg', label: 'Egg', weight: 20, payout: 100 },
    { id: 'chicken', label: 'Chicken', weight: 12, payout: 200 },
    { id: 'koi', label: 'Koi', weight: 8, payout: 400 },
    { id: 'seed', label: 'Golden seed', weight: 5, payout: 1000 }
  ].map(Object.freeze));
  const UNLOCKS = Object.freeze([
    { at: 8, id: 'flowers', label: 'Flower bed' },
    { at: 20, id: 'lanterns', label: 'Garden lanterns' },
    { at: 35, id: 'lotus', label: 'Lotus pond' },
    { at: GOLDEN_AT, id: 'golden-koi', label: 'Golden koi' }
  ].map(Object.freeze));
  const symbolsById = new Map(SYMBOLS.map(symbol => [symbol.id, symbol]));
  const totalWeight = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
  const isWhole = value => Number.isSafeInteger(value) && value >= 0;
  const timestamp = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : Date.now();

  function create(now = Date.now()) {
    return {
      version: 1,
      balance: 200,
      spins: 0,
      lastResult: null,
      goldenUnlocked: false,
      goldenClaimed: false,
      settings: { sound: false, motion: true },
      savedAt: timestamp(now)
    };
  }

  function evaluate(symbols) {
    const [first, second, third] = symbols;
    if (first === second && second === third) {
      return { payout: symbolsById.get(first).payout, kind: 'triple' };
    }
    if (first === second || first === third || second === third) {
      return { payout: COST, kind: 'pair' };
    }
    return { payout: 0, kind: 'miss' };
  }

  function decode(raw, now = Date.now()) {
    try {
      const saved = JSON.parse(raw);
      if (!saved || Array.isArray(saved) || saved.version !== 1 ||
          !isWhole(saved.balance) || !isWhole(saved.spins)) return null;
      const time = timestamp(now);
      let lastResult = null;
      if (saved.spins > 0 && Array.isArray(saved.lastResult?.symbols) &&
          saved.lastResult.symbols.length === 3 &&
          saved.lastResult.symbols.every(id => symbolsById.has(id))) {
        const symbols = [...saved.lastResult.symbols];
        const outcome = evaluate(symbols);
        lastResult = {
          symbols,
          ...outcome,
          net: outcome.payout - COST,
          newUnlocks: UNLOCKS.filter(unlock => unlock.at === saved.spins),
          goldenUnlocked: saved.lastResult.goldenUnlocked === true
        };
      }
      const goldenUnlocked = saved.goldenUnlocked === true || saved.spins >= GOLDEN_AT ||
        (lastResult !== null && lastResult.symbols.every(id => id === 'seed'));
      const settings = saved.settings || {};
      return {
        version: 1,
        balance: saved.balance,
        spins: saved.spins,
        lastResult,
        goldenUnlocked,
        goldenClaimed: goldenUnlocked && saved.goldenClaimed === true,
        settings: { sound: settings.sound === true, motion: settings.motion !== false },
        savedAt: Number.isFinite(saved.savedAt) ? Math.max(0, Math.min(time, saved.savedAt)) : time
      };
    } catch {
      return null;
    }
  }

  function draw(random) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError('The random source must return a number between zero and one.');
    }
    const target = value * totalWeight;
    let cumulative = 0;
    for (const symbol of SYMBOLS) {
      cumulative += symbol.weight;
      if (target < cumulative) return symbol.id;
    }
    // A supplied deterministic source may return exactly 1.
    return SYMBOLS[SYMBOLS.length - 1].id;
  }

  function spin(state, random = Math.random, now = Date.now()) {
    if (state.balance < COST) return null;
    const symbols = Array.from({ length: 3 }, () => draw(random));
    const outcome = evaluate(symbols);
    const previousSpins = state.spins;
    const nextSpins = previousSpins + 1;
    const unlocked = nextSpins >= GOLDEN_AT || symbols.every(id => id === 'seed');
    const result = {
      symbols,
      ...outcome,
      net: outcome.payout - COST,
      newUnlocks: UNLOCKS.filter(unlock => unlock.at > previousSpins && unlock.at <= nextSpins),
      goldenUnlocked: !state.goldenUnlocked && unlocked
    };

    // Settle once before animation. A reload can only reveal this completed result.
    state.balance += result.net;
    state.spins = nextSpins;
    state.goldenUnlocked = state.goldenUnlocked || unlocked;
    state.lastResult = result;
    state.savedAt = timestamp(now);
    return result;
  }

  function refill(state, now = Date.now()) {
    if (state.balance >= COST) return false;
    state.balance = 100;
    state.savedAt = timestamp(now);
    return true;
  }

  function probabilityStats() {
    let paidWeight = 0;
    let payoutWeight = 0;
    let netWinWeight = 0;
    let pairWeight = 0;
    let tripleWeight = 0;
    let goldenWeight = 0;
    for (const first of SYMBOLS) {
      for (const second of SYMBOLS) {
        for (const third of SYMBOLS) {
          const symbols = [first.id, second.id, third.id];
          const weight = first.weight * second.weight * third.weight;
          const outcome = evaluate(symbols);
          payoutWeight += outcome.payout * weight;
          if (outcome.payout > 0) paidWeight += weight;
          if (outcome.payout > COST) netWinWeight += weight;
          if (outcome.kind === 'pair') pairWeight += weight;
          if (outcome.kind === 'triple') tripleWeight += weight;
          if (symbols.every(id => id === 'seed')) goldenWeight += weight;
        }
      }
    }
    const denominator = totalWeight ** 3;
    const expectedPayout = payoutWeight / denominator;
    return {
      return: expectedPayout / COST,
      expectedPayout,
      payoutRate: paidWeight / denominator,
      netWinRate: netWinWeight / denominator,
      pairRate: pairWeight / denominator,
      tripleRate: tripleWeight / denominator,
      goldenRate: goldenWeight / denominator
    };
  }

  function claimGolden(state, storage, PondLife, now = Date.now()) {
    if (!state.goldenUnlocked) return { status: 'locked' };
    if (!PondLife || typeof PondLife.decode !== 'function' ||
        typeof PondLife.create !== 'function' || typeof PondLife.makeFish !== 'function') {
      return { status: 'invalid' };
    }
    const time = timestamp(now);
    try {
      // Read again at the moment of claiming so we never replace a stale pond snapshot.
      const raw = storage.getItem(PondLife.KEY);
      const pond = raw === null || raw === undefined ? PondLife.create(time) : PondLife.decode(raw, time);
      if (!pond || !Array.isArray(pond.fish)) return { status: 'invalid' };
      let fish = pond.fish.find(item => item.golden);
      if (!fish) fish = pond.fish.find(item => item.id === GOLDEN_FISH_ID);
      const existing = Boolean(fish);
      if (!fish) {
        if (pond.fish.length >= Math.min(12, PondLife.MAX_KOI || 12)) return { status: 'full' };
        fish = PondLife.makeFish(pond.fish.length, time, true);
        fish.id = GOLDEN_FISH_ID;
        fish.name = 'Kin';
        pond.fish.push(fish);
      }
      fish.golden = true;
      pond.savedAt = time;

      // Pond first, then claim receipt. The stable ID makes a partial-write retry safe.
      storage.setItem(PondLife.KEY, JSON.stringify(pond));
      const claimed = { ...state, goldenClaimed: true, savedAt: time };
      storage.setItem(KEY, JSON.stringify(claimed));
      state.goldenClaimed = true;
      state.savedAt = time;
      return { status: existing ? 'existing' : 'claimed', fish };
    } catch {
      return { status: 'storage-error' };
    }
  }

  const api = {
    KEY, COST, GOLDEN_AT, GOLDEN_FISH_ID, SYMBOLS, UNLOCKS,
    create, decode, spin, refill, probabilityStats, claimGolden
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.SlotsLife = api;
})();
