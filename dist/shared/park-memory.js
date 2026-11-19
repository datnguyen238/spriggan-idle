/* Observe saved facts without changing the worlds. The notebook lives only in the park. */
(() => {
  'use strict';
  function mount() {
    const journal = window.SprigganJournal;
    if (!journal) return;
    const routes = {farm:'pixel',kitchen:'dumplings'};
    const activeWorld = routes[document.body.dataset.world] || document.body.dataset.world;
    const isPark = activeWorld === 'park';
    const knownWorlds = new Set(['pond','pixel','hex','dumplings','claw','slots','fishing']);
    let metadata, storage;
    try { storage = window.localStorage; } catch {}
    let storageFailed = false;
    function refresh(rebaseline = false, markVisit = false) {
      let changed = false;
      try {
        const raw = storage?.getItem(journal.KEY);
        let previous = rebaseline ? raw : raw || metadata;
        if (rebaseline && previous) {
          try { previous = typeof previous === 'string' ? JSON.parse(previous) : previous; }
          catch { previous = null; }
          if (previous) previous = {...previous,snapshot:{}};
        }
        metadata = journal.updateJournal(previous, journal.readSnapshot(storage), {
          world: markVisit && knownWorlds.has(activeWorld) ? activeWorld : null, now: Date.now()
        });
        if (!storage) throw new Error('Storage unavailable');
        const serialized = JSON.stringify(metadata);
        storage.setItem(journal.KEY, serialized);
        changed = serialized !== raw;
        storageFailed = false;
      } catch { storageFailed = true; }
      if (isPark) render();
      if (changed) document.dispatchEvent(new CustomEvent('spriggan:journal-updated'));
    }

    const toggle = document.querySelector('#park-memory-toggle');
    const panel = document.querySelector('#park-memory');
    const status = document.querySelector('#park-memory-status');
    const resume = document.querySelector('#park-memory-resume');
    const list = document.querySelector('#park-memory-list');
    const empty = document.querySelector('#park-memory-empty');
    const memoryNodes = new Map();
    const names = {pond:'Stillwater Pond',pixel:'Sunny Side Farm',hex:'Clover Keep',dumplings:'Little Folds',claw:'Little Arcade',slots:'Golden Seed',fishing:'The Fishing Dock'};
    const homeURL = new URL(isPark ? './' : '../', document.baseURI);
    const worldURL = id => new URL(`${id}/`, homeURL).href;
    const say = message => { if (status) status.textContent = message; };
    function dateLabel(at) {
      return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(at));
    }
    function render() {
      if (!panel) return;
      const last = metadata?.lastWorld;
      resume.hidden = !knownWorlds.has(last);
      if (!resume.hidden) {
        resume.href = worldURL(last);
        resume.querySelector('strong').textContent = `Return to ${names[last]}`;
      }
      const memories = (metadata?.memories || []).slice(0,2);
      empty.hidden = memories.length > 0;
      const retained = new Set();
      let position = 0;
      for (const memory of memories) {
        if (!knownWorlds.has(memory.world)) continue;
        retained.add(memory.id);
        let row = memoryNodes.get(memory.id);
        if (!row) {
          const item = document.createElement('li'), link = document.createElement('a');
          const text = document.createElement('span'), time = document.createElement('time');
          link.className = 'world'; link.append(text,time); item.append(link);
          row = {item,link,text,time}; memoryNodes.set(memory.id,row);
        }
        const {item,link,text,time} = row;
        link.href = worldURL(memory.world); link.className = 'world';
        if (text.textContent !== memory.text) text.textContent = memory.text;
        time.dateTime = new Date(memory.at).toISOString();
        const stamp = `${names[memory.world]} · ${dateLabel(memory.at)}`;
        if (time.textContent !== stamp) time.textContent = stamp;
        // Insert only changed rows. Refreshing saved facts must not remove a focused link.
        if (list.children[position] !== item) list.insertBefore(item,list.children[position] || null);
        position++;
      }
      for (const [id,row] of memoryNodes) if (!retained.has(id)) {row.item.remove();memoryNodes.delete(id);}
      if (storageFailed) say('This browser can’t save your journal right now. Allow site storage, then try again.');
    }
    function setOpen(open, focusBack = false) {
      if (!panel) return;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded',String(open));
      if (open) {
        // Only one park tool is open at a time; the map remains usable.
        const guide = document.querySelector('#toggle-guide');
        if (guide?.getAttribute('aria-expanded') === 'true') guide.click();
        const destination = document.querySelector('#destination');
        if (destination && !destination.hidden) document.querySelector('#close-destination')?.click();
        refresh(); document.querySelector('#park-memory-close').focus({preventScroll:true});
      } else {
        if (focusBack) toggle.focus({preventScroll:true});
        document.dispatchEvent(new CustomEvent('spriggan:park-panel-closed'));
      }
    }

    if (isPark && panel) {
      toggle.addEventListener('click',() => setOpen(panel.hidden));
      document.querySelector('#park-memory-close').addEventListener('click',() => setOpen(false,true));
      document.addEventListener('keydown',event => {
        if (event.key === 'Escape' && !panel.hidden) { setOpen(false,true); event.stopPropagation(); }
      });
      document.addEventListener('pointerdown',event => {
        if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
      });
      document.addEventListener('focusin',event => {
        if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
      });
      document.querySelector('#toggle-guide')?.addEventListener('click',event => {
        if (event.currentTarget.getAttribute('aria-expanded') === 'true') setOpen(false);
      });

    }

    refresh(false,!document.hidden);
    document.addEventListener('spriggan:park-save-request',() => refresh());
    document.addEventListener('spriggan:park-restored',() => refresh(true));
    let interval;
    const observe = () => {clearInterval(interval);interval = setInterval(() => {if (!document.hidden) refresh();},15000);};
    observe();
    window.addEventListener('pagehide',() => {refresh();clearInterval(interval);});
    window.addEventListener('pageshow',event => {if (event.persisted) {refresh(false,!document.hidden);observe();}});
    document.addEventListener('visibilitychange',() => {refresh(false,!document.hidden);});
    window.addEventListener('storage',event => {
      if (event.key === journal.KEY) {
        // Reading another tab's journal must not write it back and start a storage-event loop.
        try {
          metadata = journal.updateJournal(storage.getItem(journal.KEY), {}, {world:null,now:Date.now()});
          document.dispatchEvent(new CustomEvent('spriggan:journal-updated'));
        } catch {}
        if (isPark) render();
      } else if (!event.key || event.key.startsWith('spriggan.')) refresh();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
