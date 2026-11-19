/* Read the account's saved milestones without advancing a world. */
(function (root) {
  'use strict';
  const places = {pond:'Stillwater Pond',pixel:'Sunny Side Farm',hex:'Clover Keep',dumplings:'Little Folds',claw:'Little Arcade',slots:'Golden Seed',fishing:'The Fishing Dock'};
  const pad = value => String(value).padStart(2,'0');
  function groupDays(memories) {
    const days = new Map();
    const valid = (Array.isArray(memories) ? memories : []).filter(memory => memory && Object.hasOwn(places,memory.world) && Number.isFinite(memory.at) && memory.at >= 0 && memory.at <= 8640000000000000);
    for (const memory of [...valid].sort((a,b) => b.at-a.at)) {
      const date = new Date(memory.at), key = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
      if (!days.has(key)) days.set(key,{key,at:memory.at,memories:[]});
      days.get(key).memories.push(memory);
    }
    return [...days.values()];
  }
  function create({document,storage,journal,baseURL}) {
    const $ = id => document.getElementById('journal-'+id);
    const dates = $('dates'), chapters = $('chapters'), empty = $('empty'), error = $('error');
    const newer = $('newer'), older = $('older'), notice = $('notice');
    const home = new URL('../',baseURL || document.baseURI);
    const format = options => new Intl.DateTimeFormat(undefined,options);
    const weekday = format({weekday:'long'}), fullDate = format({day:'numeric',month:'long',year:'numeric'});
    const month = format({month:'long',year:'numeric'}), accessibleDate = format({weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const bookmarks = new Map(), pages = new Map(), rows = new Map();
    let days = [], selectedKey = null, previousRaw, successful = false;
    function children(parent,nodes) {
      nodes.forEach((node,index) => {if (parent.children[index] !== node) parent.insertBefore(node,parent.children[index] || null);});
      for (const child of Array.from(parent.children).slice(nodes.length)) child.remove();
    }
    function node(tag,className,text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function render(moveFocus = false) {
      const start = Math.max(0,days.findIndex(day => day.key === selectedKey));
      const shown = days.slice(start,start+2);selectedKey = shown[0]?.key || null;
      error.hidden = true;empty.hidden = days.length > 0;chapters.hidden = !days.length;
      chapters.classList.toggle('single',shown.length === 1);
      if ($('footer')) $('footer').hidden = !days.length;
      $('month').textContent = [...new Set(shown.map(day => month.format(day.at)))].join(' / ') || 'Your memories';
      children(dates,days.map(day => {
        let button = bookmarks.get(day.key);
        if (!button) {
          button = node('button','bookmark');button.type = 'button';button.dataset.dateKey = day.key;
          button.append(node('strong','',new Date(day.at).getDate()),node('span','',weekday.format(day.at)));
          button.addEventListener('click',() => selectDay(day.key));bookmarks.set(day.key,button);
        }
        button.setAttribute('aria-label',accessibleDate.format(day.at));button.setAttribute('aria-controls','journal-chapters');
        button.classList.toggle('current',day.key === selectedKey);button.classList.toggle('visible',shown[1]?.key === day.key);
        if (day.key === selectedKey) button.setAttribute('aria-current','date');else button.removeAttribute('aria-current');
        return button;
      }));
      children(chapters,shown.map(day => {
        let page = pages.get(day.key);
        if (!page) {
          const section = node('section','chapter'), header = node('header','chapter-head');
          const heading = node('h2','',weekday.format(day.at)), time = node('time','',fullDate.format(day.at));
          heading.id = 'day-'+day.key;heading.tabIndex = -1;time.dateTime = new Date(day.at).toISOString();
          section.setAttribute('aria-labelledby',heading.id);header.append(heading,time);
          const list = node('ol','memories');list.setAttribute('role','list');section.append(header,list);
          page = {section,heading,list};pages.set(day.key,page);
        }
        children(page.list,day.memories.map(memory => {
          let row = rows.get(memory.id);
          if (!row) {
            const item = node('li','memory'), text = node('p'), link = node('a','place world');
            item.append(text,link);row = {item,text,link};rows.set(memory.id,row);
          }
          row.text.textContent = memory.text;row.link.textContent = places[memory.world];row.link.dataset.world = memory.world;
          row.link.href = new URL(memory.world+'/',home).href;return row.item;
        }));
        return page.section;
      }));
      newer.hidden = older.hidden = days.length <= 2;newer.disabled = start === 0;older.disabled = start+2 >= days.length;
      $('range').textContent = days.length ? 'The latest 20 little moments from your park.' : '';
      if (moveFocus && shown.length) {
        notice.textContent = shown.map(day => fullDate.format(day.at)).join(' and ');
        pages.get(shown[0].key).heading.focus({preventScroll:true});chapters.scrollIntoView({block:'start',behavior:'auto'});
      }
    }
    function refresh() {
      try {
        if (!storage || !journal) throw Error('Journal unavailable');
        const raw = storage.getItem(journal.KEY);if (successful && raw === previousRaw) return;
        let metadata = raw === null ? null : JSON.parse(raw);
        if (raw !== null && (!metadata || metadata.version !== 1)) throw Error('Invalid journal');
        metadata = journal.updateJournal(metadata,{}, {world:null,now:Date.now()});days = groupDays(metadata.memories);
        const retainedDays = new Set(days.map(day => day.key)), retainedMemories = new Set(metadata.memories.map(memory => memory.id));
        for (const [key] of bookmarks) if (!retainedDays.has(key)) bookmarks.delete(key);
        for (const [key] of pages) if (!retainedDays.has(key)) pages.delete(key);
        for (const [id] of rows) if (!retainedMemories.has(id)) rows.delete(id);
        previousRaw = raw;successful = true;notice.textContent = '';render();
      } catch (_) {
        successful = false;days = [];selectedKey = null;bookmarks.clear();pages.clear();rows.clear();
        children(dates,[]);children(chapters,[]);error.hidden = false;empty.hidden = true;chapters.hidden = true;
        if ($('footer')) $('footer').hidden = true;
        $('month').textContent = 'Your memories';notice.textContent = 'Your journal could not open. Allow site storage, then try again.';
      }
    }
    function selectDay(key) {
      if (!days.some(day => day.key === key)) return false;
      selectedKey = key;render(true);return true;
    }
    function step(amount) {
      const index = Math.max(0,days.findIndex(day => day.key === selectedKey));
      selectDay(days[Math.max(0,Math.min(days.length-1,index+amount))]?.key);
    }
    const goNewer = () => step(-2), goOlder = () => step(2);
    newer.addEventListener('click',goNewer);older.addEventListener('click',goOlder);$('retry').addEventListener('click',refresh);
    document.addEventListener('spriggan:journal-updated',refresh);refresh();
    return {refresh,selectDay,dispose() {
      document.removeEventListener('spriggan:journal-updated',refresh);newer.removeEventListener('click',goNewer);
      older.removeEventListener('click',goOlder);$('retry').removeEventListener('click',refresh);
    }};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {groupDays,create};
  else if (root.document?.body?.dataset.world === 'journal') {
    let storage;try {storage = root.localStorage;} catch (_) {}
    create({document:root.document,storage,journal:root.SprigganJournal,baseURL:root.document.baseURI});
  }
})(globalThis);
