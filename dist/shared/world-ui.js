/* Presentation-only shortcuts forward to the existing game controls. */
(() => {
  'use strict';
  function mount() {
    const world = document.body.dataset.world;
    const worlds = [
      ['pond','pond','Stillwater Pond','M3 13c3-7 15-7 18 0-3 7-15 7-18 0Zm3-1 4 2m7-4-3 3m-4 5-1 3'],
      ['farm','pixel','Sunny Side Farm','M5 13a6 6 0 0 0 12 0V8a3 3 0 0 0-6 0m6 0 4 2-4 2M6 12 3 8v6m5 4v3m6-3v3'],
      ['hex','hex','Clover Keep','M4 20V9h4V4h3v5h2V4h3v5h4v11ZM8 20v-5h8v5M3 9h18'],
      ['kitchen','dumplings','Little Folds','M3 14c1-9 17-9 18 0-3 7-15 7-18 0Zm3-3 2 3m2-5 1 4m3-4-1 4m4-3-2 4M9 3v2m6-2v2'],
      ['claw','claw','Little Arcade','M5 21V3h14v18ZM5 15h14M12 3v5m-3 3 3-3 3 3m-6 0 1 2m5-2-1 2M9 18h6'],
      ['slots','slots','Golden Seed','M5 21V4h14v17ZM5 15h14M9 7v5m6-5v5m-7 6h8M12 3V1'],
      ['fishing','fishing','The Fishing Dock','M3 17h13m-11 0v4m9-4v4M7 17V5c7 0 11 4 12 9m0 0v3a2 2 0 0 1-4 0m4-3h2M3 12l4-7']
    ];
    const svg = path => {
      const node = document.createElementNS('http://www.w3.org/2000/svg','svg');
      node.setAttribute('viewBox','0 0 24 24'); node.setAttribute('fill','none');
      node.setAttribute('stroke','currentColor');node.setAttribute('stroke-width','1.5');
      node.setAttribute('stroke-linecap','round');node.setAttribute('stroke-linejoin','round');
      node.setAttribute('aria-hidden','true');
      const line = document.createElementNS(node.namespaceURI,'path');line.setAttribute('d',path);node.append(line);return node;
    };
    const current = worlds.find(item => item[0] === world);
    if (current) {
      const header = document.querySelector('body > header, main > header');
      const brand = header?.querySelector('.brand');
      if (brand?.tagName === 'DIV') {
        const home = document.createElement('a');home.className='brand';home.href='../';
        home.setAttribute('aria-label','Spriggan home');home.append(...brand.childNodes);brand.replaceWith(home);
      }
      const original = header?.querySelector('.worlds,.worlds-link,.back');
      if (original) {
        const nav=document.createElement('details');nav.className='world-nav';
        const summary=document.createElement('summary');
        summary.append(svg('M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z'),'Worlds');
        const menu=document.createElement('nav');menu.className='world-nav-menu';menu.setAttribute('aria-label','World navigation');
        for(const [id,path,name,icon] of worlds){
          const link=document.createElement('a');link.href=`../${path}/`;link.className='world';
          if(id===world)link.setAttribute('aria-current','page');
          link.append(svg(icon),name);menu.append(link);
        }
        const back=document.createElement('a');back.href='../';back.append(svg('M3 5 9 3l6 3 6-2v15l-6 2-6-3-6 2ZM9 3v15m6-12v15'),'Back to the park');menu.append(back);
        nav.append(summary,menu);original.replaceWith(nav);
        document.addEventListener('pointerdown',e=>{if(!nav.contains(e.target))nav.open=false;});
        document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.open){nav.open=false;summary.focus();}});
      }
    }
    const timer = document.querySelector('#pomodoro');
    if (timer) {
      const measure = () => document.body.style.setProperty('--sg-timer-height', `${timer.offsetHeight}px`);
      measure();
      new ResizeObserver(measure).observe(timer);
    }
    const actions = {
      pond: [['feed', 'Feed the koi']],
      farm: [['feed', 'Scatter grain']],
      hex: [['crowd', 'Invite three']],
      kitchen: [['make'], ['steamer']],
      claw: [['insert'], ['drop']]
    }[world];
    if (!actions) return;
    const tray = document.createElement('div');
    tray.className = 'world-actions';
    tray.setAttribute('role', 'group');
    tray.setAttribute('aria-label', 'Play actions');
    for (const [id, label] of actions) {
      const source = document.getElementById(id);
      if (!source) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.forward = id;
      const sync = () => {
        const copy = source.cloneNode(true);
        copy.querySelectorAll('svg,small').forEach(node => node.remove());
        const text = label || copy.textContent.trim().replace(/\s+/g, ' ').replace('＋', '+');
        if (button.dataset.label !== text) {
          button.dataset.label = text;
          const icon = current?.[3] || 'M12 5v14M5 12h14';
          const caption = document.createElement('span');caption.textContent=text;
          button.replaceChildren(svg(icon),caption);
        }
        button.disabled = source.disabled;
        if (source.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', source.getAttribute('aria-pressed'));
      };
      button.addEventListener('click', () => { if (!source.disabled) source.click(); });
      new MutationObserver(sync).observe(source, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed']});
      sync();
      tray.append(button);
    }
    document.body.append(tray);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
