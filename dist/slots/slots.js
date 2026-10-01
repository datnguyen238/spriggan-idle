/* Golden Seed: a quiet reveal of an already-settled result. */
(() => {
  'use strict';
  const Life = globalThis.SlotsLife;
  const Art = globalThis.SlotsArt;
  const $ = selector => document.querySelector(selector);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const preview = new URLSearchParams(location.search).get('preview') === 'golden';
  let state = null;
  let storageAvailable = true;
  try { state = Life.decode(localStorage.getItem(Life.KEY)); }
  catch { storageAvailable = false; }
  state ||= Life.create();
  if (preview) {
    state = Life.create();
    state.spins = Life.GOLDEN_AT;
    state.goldenUnlocked = true;
    $('#preview-banner').hidden = false;
  }
  if (reducedMotion.matches) state.settings.motion = false;

  const spinButton = $('#spin');
  const refillButton = $('#refill');
  const claimButton = $('#claim');
  const garden = $('#garden');
  const pond = $('#koi-pond');
  const reels = [...document.querySelectorAll('.reel canvas')];
  const names = [...document.querySelectorAll('.symbol-name')];
  const symbolMap = new Map(Life.SYMBOLS.map(symbol => [symbol.id, symbol]));
  let shown = state.lastResult?.symbols || ['leaf', 'flower', 'egg'];
  let animation = null;
  let sceneTime = 0;
  let lastFrame = 0;
  let lastDraw = 0;
  let audio = null;
  let audioRequest = 0;
  let claimStatus = null;
  const sizes = new Map();
  const formatter = new Intl.NumberFormat('en-US');
  const number = value => formatter.format(value);
  const motion = () => state.settings.motion && !reducedMotion.matches;

  function save() {
    state.savedAt = Date.now();
    if (!preview) {
      try {
        localStorage.setItem(Life.KEY, JSON.stringify(state));
        storageAvailable = true;
      } catch { storageAvailable = false; }
    }
    $('#save-status').textContent = preview ? 'Preview · saves untouched' :
      storageAvailable ? 'Saved in this browser' : 'This visit only · storage unavailable';
  }

  function sync() {
    const visibleSpins = animation ? animation.previousSpins : state.spins;
    const visibleGolden = animation ? animation.previousGolden : state.goldenUnlocked;
    const visibleBalance = animation ? state.balance - animation.result.net - Life.COST : state.balance;
    $('#balance').textContent = number(visibleBalance);
    spinButton.disabled = Boolean(animation) || state.balance < Life.COST;
    refillButton.hidden = state.balance >= Life.COST || Boolean(animation);
    $('#spin-label').replaceChildren(document.createTextNode(animation ? 'A little anticipation…' : 'Spin the garden'));
    const small = document.createElement('small');
    small.textContent = animation ? 'your three little symbols are on their way' : '10 seeds / one gentle turn';
    $('#spin-label').append(small);
    $('#reels').setAttribute('aria-busy', String(Boolean(animation)));
    $('#reels').setAttribute('aria-label', animation ? 'Three reels are turning' :
      `Three reels: ${shown.map(id => symbolMap.get(id).label).join(', ')}`);
    $('#sound').textContent = state.settings.sound ? 'Sound on' : 'Sound off';
    $('#sound').setAttribute('aria-pressed', String(state.settings.sound));
    $('#motion').textContent = motion() ? 'Motion on' : 'Motion off';
    $('#motion').setAttribute('aria-pressed', String(motion()));
    $('#spin-count').textContent = `${number(visibleSpins)} ${visibleSpins === 1 ? 'TURN' : 'TURNS'}`;
    const growth = Math.min(Life.GOLDEN_AT, visibleSpins);
    $('#growth-fill').style.width = `${growth / Life.GOLDEN_AT * 100}%`;
    $('#growth-track').setAttribute('aria-valuenow', String(growth));
    const next = Life.UNLOCKS.find(unlock => visibleSpins < unlock.at && !(visibleGolden && unlock.id === 'golden-koi'));
    $('#growth-copy').textContent = !next ?
      'A full little garden, and a golden friend. Stay as long as you like.' :
      `${next.at - visibleSpins} turns until ${next.label.toLowerCase()}. Every result counts.`;
    for (const item of document.querySelectorAll('.milestones li')) {
      const unlocked = visibleSpins >= Number(item.dataset.at) ||
        (Number(item.dataset.at) === Life.GOLDEN_AT && visibleGolden);
      item.classList.toggle('unlocked', unlocked);
      item.querySelector('small').textContent = unlocked ? 'Grown with you' : `${item.dataset.at} turns`;
    }
    const golden = visibleGolden;
    $('#koi-badge').textContent = golden ? 'A GOLDEN FRIEND HAS ARRIVED' : 'THE FINAL LITTLE WONDER';
    $('#koi-description').textContent = golden ?
      'Kin has found your garden. Welcome this golden friend to Stillwater Pond, where they can swim, feed, and grow.' :
      'A rare visitor, a permanent friend. Find three golden seeds, or grow your garden through 60 turns.';
    claimButton.disabled = !golden || state.goldenClaimed || preview || Boolean(animation);
    claimButton.replaceChildren(document.createTextNode(preview ? 'Preview only · play to invite' :
      state.goldenClaimed ? 'At home in Stillwater Pond' : golden ? 'Welcome Kin to your pond' : 'Waiting for a golden fin'));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    claimButton.append(arrow);
    $('#visit-pond').hidden = !state.goldenClaimed && claimStatus !== 'full';
    $('#visit-pond').textContent = state.goldenClaimed ? 'Visit Kin in Stillwater Pond ↗' : 'Make room in Stillwater Pond ↗';
    $('#save-status').textContent = preview ? 'Preview · saves untouched' :
      storageAvailable ? 'Saved in this browser' : 'This visit only · storage unavailable';
  }

  function result(title, detail, kind = '') {
    $('#result-title').textContent = title;
    $('#result-detail').textContent = detail;
    $('#result').dataset.kind = kind;
    $('#result-mark').textContent = kind === 'triple' ? '✦' : '✧';
  }

  function describe(outcome, returning = false) {
    let title = outcome.kind === 'triple' ? `Three ${symbolMap.get(outcome.symbols[0]).label.toLowerCase()} symbols. A lovely find.` :
      outcome.kind === 'pair' ? 'A little match. Your seeds are returned.' : 'Three little visitors. The garden still grows.';
    if (outcome.goldenUnlocked) title = 'A golden fin. Kin has found your garden.';
    else if (outcome.newUnlocks.length) title += ` ${outcome.newUnlocks[0].label} unlocked.`;
    if (returning) title = `Last turn: ${outcome.kind === 'triple' ? 'three of a kind' : outcome.kind === 'pair' ? 'a matching pair' : 'three different symbols'}. Welcome back.`;
    const net = outcome.net > 0 ? `+${number(outcome.net)}` : number(outcome.net);
    result(title, `10 spent · ${number(outcome.payout)} returned · net ${net} seeds`, outcome.kind);
  }

  function resize(canvas) {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const density = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(box.width * density);
    canvas.height = Math.round(box.height * density);
    canvas.getContext('2d').setTransform(density, 0, 0, density, 0, 0);
    sizes.set(canvas, { w: box.width, h: box.height });
    draw();
  }

  function drawReel(index, elapsed = null) {
    const canvas = reels[index];
    const size = sizes.get(canvas);
    if (!size) return;
    const { w, h } = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const spriteSize = Math.min(w * .96, Math.max(64, Math.min(w * .85, h * .82)));
    const duration = 1450 + index * 325;
    if (animation && elapsed !== null && elapsed < duration) {
      // A visual strip only. Stops and timing are identical for every outcome.
      const progress = Math.min(1, elapsed / duration);
      const cycles = 9 + index * 2;
      const travel = cycles * (1 - (1 - progress) ** 3);
      const step = Math.floor(travel);
      const offset = (travel - step) * h;
      const symbolAt = row => row === cycles ? animation.result.symbols[index] :
        Life.SYMBOLS[(row + index * 2) % Life.SYMBOLS.length].id;
      Art.drawSymbol(ctx, symbolAt(step), w / 2, h / 2 + offset, spriteSize, sceneTime);
      Art.drawSymbol(ctx, symbolAt(step + 1), w / 2, h / 2 + offset - h, spriteSize, sceneTime);
      names[index].textContent = '· · ·';
    } else {
      const id = animation ? animation.result.symbols[index] : shown[index];
      Art.drawSymbol(ctx, id, w / 2, h / 2, spriteSize, sceneTime);
      names[index].textContent = symbolMap.get(id).label.toUpperCase();
    }
  }

  function draw() {
    const elapsed = animation ? performance.now() - animation.start : null;
    const gardenSize = sizes.get(garden);
    // Reveal permanent changes only when the reels have stopped.
    const visibleSpins = animation ? animation.previousSpins : state.spins;
    const visibleGolden = animation ? animation.previousGolden : state.goldenUnlocked;
    if (gardenSize) Art.drawGarden(garden.getContext('2d'), gardenSize.w, gardenSize.h, sceneTime, visibleSpins, visibleGolden);
    const pondSize = sizes.get(pond);
    if (pondSize) Art.drawKoiPond(pond.getContext('2d'), pondSize.w, pondSize.h, sceneTime, visibleGolden);
    reels.forEach((_, index) => drawReel(index, elapsed));
  }

  async function prepareAudio() {
    if (!state.settings.sound || document.hidden) return false;
    const request = ++audioRequest;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      audio ||= new Audio();
      if (audio.state !== 'running') await audio.resume();
      return request === audioRequest && state.settings.sound && !document.hidden && audio.state === 'running';
    } catch {
      if (request === audioRequest) {
        state.settings.sound = false;
        sync();
        save();
      }
      return false;
    }
  }

  function chime(notes, volume = .035) {
    if (!state.settings.sound || !audio || audio.state !== 'running' || document.hidden) return;
    notes.forEach((frequency, index) => {
      const start = audio.currentTime + index * .13;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .65);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + .7);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }

  function finish(quiet = false) {
    if (!animation) return;
    const outcome = animation.result;
    shown = outcome.symbols;
    animation = null;
    $('#machine').classList.remove('spinning');
    $('#reels').setAttribute('aria-label', `Three reels: ${shown.map(id => symbolMap.get(id).label).join(', ')}`);
    sync();
    describe(outcome);
    draw();
    if (!quiet && (outcome.net > 0 || outcome.goldenUnlocked || outcome.newUnlocks.length)) {
      chime(outcome.goldenUnlocked ? [392, 523.25, 659.25, 783.99] : [392, 493.88, 587.33]);
    }
  }

  function refreshSaved() {
    if (preview || !storageAvailable) return;
    try {
      const latest = Life.decode(localStorage.getItem(Life.KEY));
      if (latest && latest.savedAt >= state.savedAt) state = latest;
    } catch { storageAvailable = false; }
  }

  function startSpin() {
    if (animation) return;
    refreshSaved();
    if (state.balance < Life.COST) { sync(); return; }
    const previousSpins = state.spins;
    const previousGolden = state.goldenUnlocked;
    const outcome = Life.spin(state);
    save();
    animation = { result: outcome, previousSpins, previousGolden, start: performance.now(), stops: 0 };
    $('#machine').classList.add('spinning');
    result('A small turn of possibility.', 'Your garden is growing. Let the reels settle.');
    // Credit balance appears after the reveal; the persisted transaction is complete.
    sync();
    if (state.settings.sound) void prepareAudio();
    if (!motion()) finish();
    else draw();
  }

  spinButton.addEventListener('click', startSpin);
  spinButton.addEventListener('keydown', event => {
    if (event.repeat && (event.key === ' ' || event.key === 'Enter')) event.preventDefault();
  });
  refillButton.addEventListener('click', () => {
    if (animation) return;
    refreshSaved();
    if (Life.refill(state)) {
      save();
      result('A fresh handful of seeds.', 'Your balance is now 100 seeds. There is always room for another beginning.');
    }
    sync();
    spinButton.focus();
  });
  $('#motion').addEventListener('click', () => {
    state.settings.motion = !motion();
    if (reducedMotion.matches) state.settings.motion = false;
    if (!motion()) finish();
    sync();
    save();
    draw();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { state.settings.motion = false; finish(true); }
    sync();
    save();
    draw();
  });
  $('#sound').addEventListener('click', () => {
    state.settings.sound = !state.settings.sound;
    if (state.settings.sound) void prepareAudio().then(ready => { if (ready) chime([392], .025); });
    else {
      audioRequest++;
      if (audio) void audio.suspend().catch(() => {});
    }
    sync();
    save();
  });
  claimButton.addEventListener('click', () => {
    if (preview || animation) return;
    refreshSaved();
    let response;
    try { response = Life.claimGolden(state, localStorage, globalThis.PondLife); }
    catch { response = { status: 'storage-error' }; }
    const messages = {
      claimed: 'Kin is swimming in your pond. Go say hello.',
      existing: 'Your pond already has a golden friend. This little wonder is complete.',
      full: 'Your pond has 12 koi. Make room in Stillwater Pond, then return to welcome Kin.',
      locked: 'Keep growing your garden. Kin has yet to arrive.',
      invalid: 'Your pond save could not be read. It has been left untouched.',
      'storage-error': 'Your browser could not save the invitation. Kin stays available here; try again when storage is available.'
    };
    claimStatus = response.status;
    $('#claim-status').textContent = messages[response.status];
    if (response.status === 'storage-error') storageAvailable = false;
    sync();
    if (['claimed', 'existing'].includes(response.status)) {
      chime([392, 523.25, 659.25]);
      result('A golden friend, a place to call home.', 'Your pond keeps its fish, names, and settings. Kin belongs there now.', 'triple');
    }
  });

  // Odds and artwork come from the same rules the game actually uses.
  for (const symbol of Life.SYMBOLS) {
    const cell = document.createElement('div');
    cell.className = 'payout-cell';
    const icon = document.createElement('canvas');
    icon.width = 72; icon.height = 72;
    icon.setAttribute('aria-hidden', 'true');
    Art.drawSymbol(icon.getContext('2d'), symbol.id, 36, 36, 60);
    const text = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = symbol.label;
    const payout = document.createElement('small');
    payout.textContent = `${number(symbol.payout)} seeds`;
    const odds = document.createElement('small');
    odds.textContent = `${symbol.weight}% / reel`;
    text.append(label, payout, odds);
    cell.append(icon, text);
    $('#payout-table').append(cell);
  }
  const stats = Life.probabilityStats();
  $('#odds-note').textContent = `Per spin: ${(stats.netWinRate * 100).toFixed(3)}% net gain · ${(stats.pairRate * 100).toFixed(3)}% refund · ${((1 - stats.payoutRate) * 100).toFixed(3)}% no return. Average return: ${(stats.return * 100).toFixed(3)}% of seeds spent. Each reel is independent.`;

  function frame(time) {
    const delta = lastFrame ? Math.min(.1, (time - lastFrame) / 1000) : 0;
    lastFrame = time;
    if (!document.hidden) {
      if (motion()) sceneTime += delta;
      if (animation) {
        const elapsed = time - animation.start;
        const stopped = [1450, 1775, 2100].filter(stop => elapsed >= stop).length;
        if (stopped > animation.stops) {
          animation.stops = stopped;
          chime([240 + stopped * 45], .009);
        }
        if (elapsed >= 2100) finish();
      }
      if ((motion() || animation) && time - lastDraw >= 33) { draw(); lastDraw = time; }
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      finish(true);
      audioRequest++;
      if (audio) void audio.suspend().catch(() => {});
    } else {
      refreshSaved();
      shown = state.lastResult?.symbols || shown;
      sync(); draw();
      lastFrame = performance.now();
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== Life.KEY || preview) return;
    finish(true);
    refreshSaved();
    shown = state.lastResult?.symbols || ['leaf', 'flower', 'egg'];
    sync(); draw();
    if (state.lastResult) describe(state.lastResult, true);
  });
  const observer = new ResizeObserver(entries => entries.forEach(entry => resize(entry.target)));
  [garden, pond, ...reels].forEach(canvas => observer.observe(canvas));
  sync();
  if (preview) result('A full little garden. A familiar golden fin.', 'Final reward preview · play the garden to invite Kin to your pond.', 'triple');
  else if (state.lastResult) describe(state.lastResult, true);
  [garden, pond, ...reels].forEach(resize);
  requestAnimationFrame(frame);
})();
