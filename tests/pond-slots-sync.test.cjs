const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PondLife = require('../dist/pond/pond-life.js');
const SlotsLife = require('../dist/slots/slots-life.js');
const PondPlants = require('../dist/pond/pond-plants.js');
const now = Date.now();

// Execute the complete app with a small browser surface; exercise its real event and save paths.
function openPond(initial = PondLife.create(now)) {
  const elements = new Map();
  const listeners = new Map();
  const tools = new Map();
  const values = new Map([[PondLife.KEY, JSON.stringify(initial)]]);
  const gradient = { addColorStop() {} };
  const drawing = new Proxy({}, {
    get(target, property) {
      if (property === 'createRadialGradient' || property === 'createLinearGradient') return () => gradient;
      return target[property] || (() => {});
    }
  });
  class Element {
    constructor() {
      this.value = '';
      this.hidden = true;
      this.style = {};
      this.dataset = {};
      this.textContent = '';
      this.attributes = new Map();
      this.children = [];
      this.parts = new Map();
      const classes = new Set();
      this.classList = {
        contains: value => classes.has(value),
        add: value => classes.add(value),
        remove: value => classes.delete(value),
        toggle(value, enabled) {
          if (enabled === undefined) enabled = !classes.has(value);
          if (enabled) classes.add(value); else classes.delete(value);
        }
      };
    }
    querySelector(selector) {
      if (!this.parts.has(selector)) this.parts.set(selector, new Element());
      return this.parts.get(selector);
    }
    closest() { return this.querySelector('parent'); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) || null; }
    removeAttribute(key) { this.attributes.delete(key); }
    replaceChildren(...children) { this.children = children; }
    add(child) { this.children.push(child); }
    addEventListener() {}
    getContext() { return drawing; }
    getBoundingClientRect() { return { width: 900, height: 600, left: 0, top: 0 }; }
    click() { this.onclick?.(); }
    focus() {}
    select() {}
    setCustomValidity() {}
  }
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const on = (key, callback) => {
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(callback);
  };
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  class Audio {
    constructor() { this.enabled = {}; this.loading = new Set(); }
    setVolume() {}
    visibility() {}
  }
  const sandbox = {
    PondLife, PondPlants, PondAudio: Audio,
    localStorage: storage,
    devicePixelRatio: 1,
    ResizeObserver: class { observe() {} },
    Option: class { constructor(label, value) { this.label = label; this.value = value; } },
    document: {
      hidden: false,
      querySelector: element,
      createElement: () => new Element(),
      addEventListener: on,
      modelContext: { registerTool: tool => tools.set(tool.name, tool) }
    },
    window: { matchMedia: () => ({ matches: false }), addEventListener: on },
    setTimeout: () => 1, clearTimeout() {}, setInterval() {},
    requestAnimationFrame() {}, cancelAnimationFrame() {}, performance: { now: () => 0 }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/pond/app.js'), 'utf8'), sandbox);
  return {
    storage, element,
    emit: (key, event = {}) => listeners.get(key)?.forEach(callback => callback(event)),
    invoke: (name, input = {}) => tools.get(name).execute(input),
    read: () => PondLife.decode(storage.getItem(PondLife.KEY)),
    claim() {
      const slots = SlotsLife.create();
      slots.goldenUnlocked = true;
      return SlotsLife.claimGolden(slots, storage, PondLife);
    }
  };
}

test('an already-open pond welcomes external Kin and preserves its unsaved local fish and settings', () => {
  const app = openPond();
  app.invoke('add_koi');
  app.element('#night').onclick();
  const result = app.claim();
  assert.equal(result.status, 'claimed');
  const event = { key: PondLife.KEY, newValue: app.storage.getItem(PondLife.KEY), storageArea: app.storage };
  app.emit('storage', event);
  const choices = app.element('#koi-picker').children;
  assert.equal(choices.filter(choice => choice.value === SlotsLife.GOLDEN_FISH_ID).length, 1);
  assert.match(app.element('#pond-moment').textContent, /Kin has arrived/);
  app.emit('storage', event);
  app.emit('pagehide');
  const saved = app.read();
  assert.equal(saved.fish.length, 7);
  assert.equal(saved.fish.filter(fish => fish.golden).length, 1);
  assert.equal(saved.settings.night, true);
  assert.equal(saved.fish.find(fish => fish.golden).id, SlotsLife.GOLDEN_FISH_ID);

  const number = saved.fish.findIndex(fish => fish.id === SlotsLife.GOLDEN_FISH_ID) + 1;
  app.invoke('remove_koi', { number });
  app.emit('pagehide');
  assert.equal(app.read().fish.length, 6);
  assert.equal(app.read().fish.some(fish => fish.golden), false);
});

test('a save catches the external reward even before a queued storage event arrives', () => {
  const app = openPond();
  app.invoke('add_koi');
  assert.equal(app.claim().status, 'claimed');
  app.emit('pagehide');
  const saved = app.read();
  assert.equal(saved.fish.length, 7);
  assert.equal(saved.fish.find(fish => fish.golden).id, SlotsLife.GOLDEN_FISH_ID);
});

test('a full unsaved pond holds saving until a koi leaves, preserving all fish and the waiting reward', () => {
  const app = openPond();
  for (let i = 0; i < 7; i++) app.invoke('add_koi');
  assert.equal(app.claim().status, 'claimed');
  const remote = app.storage.getItem(PondLife.KEY);
  app.emit('storage', { key: PondLife.KEY, newValue: remote, storageArea: app.storage });
  app.emit('pagehide');
  assert.equal(app.storage.getItem(PondLife.KEY), remote);
  assert.match(app.element('#pond-memory').textContent, /Kin is waiting/);
  app.invoke('remove_koi', { number: 1 });
  app.emit('pagehide');
  const saved = app.read();
  assert.equal(saved.fish.length, 12);
  assert.equal(saved.fish.filter(fish => fish.golden).length, 1);
  assert.equal(saved.fish.find(fish => fish.golden).id, SlotsLife.GOLDEN_FISH_ID);
});

test('an existing local golden koi is kept without importing a second golden fish', () => {
  const initial = PondLife.create(now);
  initial.fish[0].golden = true;
  initial.fish[0].name = 'Local golden';
  const app = openPond(initial);
  const remote = PondLife.decode(app.storage.getItem(PondLife.KEY));
  remote.fish[0].golden = false;
  app.storage.setItem(PondLife.KEY, JSON.stringify(remote));
  assert.equal(app.claim().status, 'claimed');
  app.emit('storage', { key: PondLife.KEY, newValue: app.storage.getItem(PondLife.KEY), storageArea: app.storage });
  app.emit('pagehide');
  const saved = app.read();
  assert.equal(saved.fish.length, 5);
  assert.equal(saved.fish.filter(fish => fish.golden).length, 1);
  assert.equal(saved.fish.find(fish => fish.golden).id, initial.fish[0].id);
});
