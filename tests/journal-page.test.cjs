const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const Journal=require('../dist/shared/park-journal.js');
const Diary=require('../dist/journal/journal.js');

const localTime=(day,hour=12,minute=0)=>new Date(2026,10,day,hour,minute).getTime();
const key=day=>'2026-11-'+String(day).padStart(2,'0');
const memory=(id,day,extra={})=>({id,world:'fishing',text:`You met a friend on November ${day}.`,at:localTime(day),...extra});
const metadata=memories=>({version:1,lastWorld:'pond',lastVisitedAt:localTime(12),snapshot:{},memories});

// A small semantic DOM records text/structure and real event handlers, with no
// browser storage, account, network, HTML parser, or game simulation involved.
function setup({memories=[],raw=JSON.stringify(metadata(memories)),blocked=false}={}) {
  const listeners=new Map(),writes=[],values=new Map([[Journal.KEY,raw]]),ids=new Map();
  let reads=0,document;
  const matches=(node,selector)=>{
    const tag=selector.match(/^[a-z][\w-]*/i)?.[0];
    if(tag&&node.tagName!==tag.toUpperCase())return false;
    const id=selector.match(/#([\w-]+)/)?.[1];
    if(id&&node.id!==id)return false;
    for(const [,name] of selector.matchAll(/\[([\w-]+)\]/g))if(node.getAttribute(name)===null&&node[name]===undefined)return false;
    return [...selector.matchAll(/\.([\w-]+)/g)].every(([,name])=>node.classList.contains(name));
  };
  function node(tag='div') {
    const handlers=new Map(),attributes=new Map();let text='',className='';
    const n={tagName:tag.toUpperCase(),nodeType:tag==='#fragment'?11:1,children:[],parentNode:null,dataset:{},hidden:false,disabled:false,
      get className(){return className;},set className(value){className=String(value);},
      classList:{contains:name=>className.split(/\s+/).includes(name),add(...names){className=[...new Set([...className.split(/\s+/).filter(Boolean),...names])].join(' ');},remove(...names){className=className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');},toggle(name,force){const on=force===undefined?!this.contains(name):!!force;if(on)this.add(name);else this.remove(name);return on;}},
      get textContent(){return text+this.children.map(child=>child.textContent).join('');},set textContent(value){text=String(value);for(const child of this.children)child.parentNode=null;this.children=[];},
      set innerHTML(value){throw Error('Diary content must be constructed as text/DOM, not HTML: '+value);},
      get childNodes(){return this.children;},get firstChild(){return this.children[0]||null;},get firstElementChild(){return this.firstChild;},
      append(...children){for(let child of children){if(typeof child==='string'){const t=node('#text');t.textContent=child;child=t;}if(child.nodeType===11){this.append(...[...child.children]);continue;}child.remove();child.parentNode=this;this.children.push(child);}},
      appendChild(child){this.append(child);return child;},
      replaceChildren(...children){text='';for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);},
      insertBefore(child,before){child.remove();child.parentNode=this;const i=this.children.indexOf(before);if(i<0)this.children.push(child);else this.children.splice(i,0,child);return child;},
      remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;},
      setAttribute(name,value){attributes.set(name,String(value));if(name==='class')this.className=value;if(name==='id')this.id=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);},
      getAttribute(name){return name==='class'?this.className:name==='id'?this.id||null:attributes.get(name)??null;},removeAttribute(name){attributes.delete(name);},hasAttribute:name=>attributes.has(name),
      addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},
      removeEventListener(type,fn){handlers.set(type,(handlers.get(type)||[]).filter(item=>item!==fn));},
      async fire(type,extra={}){const event={type,target:this,currentTarget:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...extra};for(const fn of handlers.get(type)||[])await fn(event);return event;},
      click(){if(this.disabled)return;return this.fire('click');},
      focus(){document.activeElement=this;this.focused=true;},scrollIntoView(){this.scrolled=true;},
      contains(other){return this===other||this.children.some(child=>child.contains(other));},
      closest(selector){let current=this;while(current){if(matches(current,selector))return current;current=current.parentNode;}return null;},
      querySelectorAll(selector){const parts=selector.trim().split(/\s+/),found=[];function walk(parent){for(const child of parent.children){if(matches(child,parts.at(-1))){let at=child.parentNode,part=parts.length-2;while(part>=0&&at){if(matches(at,parts[part]))part--;at=at.parentNode;}if(part<0)found.push(child);}walk(child);}}walk(this);return found;},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    };
    return n;
  }
  const body=node('body');body.dataset.world='journal';
  for(const [id,tag] of Object.entries({'journal-dates':'nav','journal-month':'h2','journal-chapters':'div','journal-empty':'section','journal-error':'section','journal-retry':'button','journal-newer':'button','journal-older':'button','journal-range':'span','journal-notice':'p','journal-footer':'footer'})) {
    const element=node(tag);element.id=id;ids.set(id,element);body.append(element);
  }
  document={body,readyState:'complete',baseURI:'https://spriggan.test/garden/journal/',activeElement:null,
    getElementById:id=>ids.get(id)||null,createElement:node,createDocumentFragment:()=>node('#fragment'),
    querySelector:selector=>body.querySelector(selector),querySelectorAll:selector=>body.querySelectorAll(selector),
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(item=>item!==fn));},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);return !event.defaultPrevented;}
  };
  const storage={getItem(name){reads++;if(blocked)throw Error('Storage denied');return values.get(name)??null;},setItem(name,value){writes.push(name);values.set(name,String(value));},removeItem(name){writes.push(name);values.delete(name);}};
  const api=Diary.create({document,storage,journal:Journal,baseURL:document.baseURI});
  return {api,document,storage,values,writes,ids,reads:()=>reads,setBlocked:value=>{blocked=value;},setMemories:memories=>values.set(Journal.KEY,JSON.stringify(metadata(memories))),
    bookmarks:()=>ids.get('journal-dates').querySelectorAll('.bookmark'),chapters:()=>ids.get('journal-chapters').querySelectorAll('.chapter').filter(chapter=>!chapter.hidden),
    event(type,extra={}){const event={type,target:body,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};document.dispatchEvent(event);return event;}};
}
const dates=h=>h.chapters().map(chapter=>chapter.querySelector('time').dateTime.slice(0,10));
const texts=h=>h.chapters().flatMap(chapter=>chapter.querySelectorAll('.memory p').map(p=>p.textContent));

test('diary groups and sorts memories by the local calendar without mutating the saved order',()=>{
  const memories=[memory('older',18),memory('late',19,{at:localTime(19,23,59)}),memory('early',19,{at:localTime(19,0,1)})],before=JSON.stringify(memories);
  const days=Diary.groupDays(memories);
  assert.deepEqual(days.map(day=>day.key),[key(19),key(18)]);
  assert.deepEqual(days[0].memories.map(item=>item.id),['late','early']);
  assert.equal(days[0].at,localTime(19,23,59));assert.equal(JSON.stringify(memories),before);
});

test('local midnight remains a day boundary in both eastern and western time zones',()=>{
  const script=`const {groupDays}=require(${JSON.stringify(path.resolve(__dirname,'../dist/journal/journal.js'))}); const memories=[{id:'a',world:'pond',text:'A',at:new Date(2026,10,19,23,59).getTime()},{id:'b',world:'pond',text:'B',at:new Date(2026,10,20,0,1).getTime()}]; process.stdout.write(JSON.stringify(groupDays(memories).map(day=>day.key)));`;
  for(const TZ of ['Asia/Tokyo','America/Los_Angeles']) {
    const result=spawnSync(process.execPath,['-e',script],{env:{...process.env,TZ},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),[key(20),key(19)],TZ);
  }
});

test('the journal opens to two newest dates and bookmark/pager controls reach the whole saved history',async()=>{
  const h=setup({memories:[19,18,17,16,15].map(day=>memory('m'+day,day))});
  assert.deepEqual(dates(h),[key(19),key(18)]);assert.equal(h.bookmarks().length,5);
  assert.equal(h.bookmarks()[0].classList.contains('current'),true);assert.equal(h.ids.get('journal-newer').disabled,true);
  await h.ids.get('journal-older').click();assert.deepEqual(dates(h),[key(17),key(16)]);
  await h.ids.get('journal-older').click();assert.deepEqual(dates(h),[key(15)]);assert.equal(h.ids.get('journal-older').disabled,true);
  await h.ids.get('journal-newer').click();assert.deepEqual(dates(h),[key(17),key(16)]);
  await h.bookmarks()[1].click();assert.deepEqual(dates(h),[key(18),key(17)]);
  assert.equal(h.bookmarks()[1].classList.contains('current'),true);
  assert.equal(h.bookmarks()[1].getAttribute('aria-current'),'date');
  assert.equal(h.document.activeElement,h.chapters()[0].querySelector('h2'),'date changes announce the new reading heading');
  assert(h.ids.get('journal-notice').textContent.includes('2026'));
  const before=dates(h);assert.equal(h.api.selectDay('not-a-date'),false);assert.deepEqual(dates(h),before);
});

test('memories retain semantic reading structure, literal untrusted text, and allowlisted same-site world links',()=>{
  const literal='<img src=x onerror=alert(1)> found a home.';
  const h=setup({memories:[memory('literal',19,{world:'claw',text:literal}),memory('bad-world',19,{world:'https://evil.test/',text:'Do not render'})]});
  assert.deepEqual(texts(h),[literal]);assert.equal(h.chapters()[0].tagName,'SECTION');
  assert.equal(h.chapters()[0].querySelector('h2').tabIndex,-1);
  assert.equal(h.chapters()[0].querySelector('.memories').tagName,'OL');
  assert.equal(h.chapters()[0].querySelector('.memory').tagName,'LI');
  assert.equal(h.chapters()[0].querySelector('img'),null);
  const link=h.chapters()[0].querySelector('a.place');
  assert.equal(link.classList.contains('world'),true);assert.equal(new URL(link.href).href,'https://spriggan.test/garden/claw/');
  assert.match(link.textContent,/Little Arcade/);
});

test('reading, changing dates, and refreshing never write gameplay/journal data or change lastWorld',()=>{
  const h=setup({memories:[memory('m19',19),memory('m18',18),memory('m17',17)]}),before=h.values.get(Journal.KEY);
  h.api.selectDay(key(17));h.api.refresh();h.event('spriggan:journal-updated');
  assert.deepEqual(h.writes,[]);assert.equal(h.values.get(Journal.KEY),before);assert.equal(JSON.parse(before).lastWorld,'pond');
});

test('an unchanged refresh preserves existing focused memory links rather than replacing the reading DOM',()=>{
  const h=setup({memories:[memory('m19',19)]}),chapter=h.chapters()[0],link=chapter.querySelector('a.place');link.focus();
  h.api.refresh();h.event('spriggan:journal-updated');
  assert.equal(h.chapters()[0],chapter);assert.equal(h.chapters()[0].querySelector('a.place'),link);assert.equal(h.document.activeElement,link);
});

test('a newly saved day preserves the selected date while a restore that removes it opens the newest remaining day',()=>{
  const h=setup({memories:[19,18,17].map(day=>memory('m'+day,day))});h.api.selectDay(key(18));
  h.setMemories([20,19,18,17].map(day=>memory('m'+day,day)));h.event('spriggan:journal-updated');
  assert.deepEqual(dates(h),[key(18),key(17)]);
  h.setMemories([memory('restored',16,{world:'pond',text:'Kin joined your pond.'})]);h.event('spriggan:journal-updated');
  assert.deepEqual(dates(h),[key(16)]);assert.deepEqual(texts(h),['Kin joined your pond.']);
  assert.equal(h.bookmarks().length,1);assert.equal(h.bookmarks()[0].classList.contains('current'),true);
});

test('empty/restored parks clear previous account content and hide unusable paging',()=>{
  const h=setup({memories:[memory('old-account',19)]});h.values.delete(Journal.KEY);h.api.refresh();
  assert.equal(h.ids.get('journal-empty').hidden,false);assert.deepEqual(h.chapters(),[]);assert.deepEqual(h.bookmarks(),[]);
  assert.equal(h.ids.get('journal-error').hidden,true);
  for(const id of ['journal-newer','journal-older'])assert(h.ids.get(id).hidden||h.ids.get(id).disabled,id+' must not offer an empty page');
});

test('blocked storage explains the failure and Retry can recover without exposing stale entries',async()=>{
  const h=setup({memories:[memory('old',19)]});h.setBlocked(true);h.api.refresh();
  assert.equal(h.ids.get('journal-error').hidden,false);assert.deepEqual(h.chapters(),[]);
  h.setBlocked(false);h.setMemories([memory('recovered',18)]);await h.ids.get('journal-retry').click();
  assert.equal(h.ids.get('journal-error').hidden,true);assert.equal(h.ids.get('journal-empty').hidden,true);assert.deepEqual(dates(h),[key(18)]);
});

test('malformed or unsupported journal data shows a recoverable error rather than an invented blank diary',()=>{
  for(const raw of ['{damaged',JSON.stringify({version:99,memories:[]})]) {
    const h=setup({raw});assert.equal(h.ids.get('journal-error').hidden,false);assert.deepEqual(h.chapters(),[]);
    h.setMemories([]);h.api.refresh();assert.equal(h.ids.get('journal-error').hidden,true);assert.equal(h.ids.get('journal-empty').hidden,false);
  }
});

test('the existing journal retention/cleaning rules cap imported content at twenty real memories',()=>{
  const h=setup({memories:Array.from({length:25},(_,i)=>memory('m'+i,19,{at:localTime(19,12,i),text:'Memory '+i}))});
  assert.equal(h.chapters()[0].querySelectorAll('.memory').length,Journal.MAX_MEMORIES);
  assert.deepEqual(texts(h),Array.from({length:20},(_,i)=>'Memory '+(24-i)));
  assert.equal(h.writes.length,0,'the reading page must not trim the stored file itself');
});

test('disposing the page removes saved-journal subscriptions',()=>{
  const h=setup({memories:[memory('old',19)]});h.api.dispose();h.setMemories([memory('new',18)]);const reads=h.reads();
  h.event('spriggan:journal-updated');assert.equal(h.reads(),reads);assert.deepEqual(dates(h),[key(19)]);
});

test('the dedicated route keeps journal observers and UI inert until authenticated hydration completes',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../dist/journal/index.html'),'utf8');
  assert.match(html,/<html\b[^>]*data-park-auth="loading"/);assert.match(html,/<body\b[^>]*data-world="journal"/);
  const scripts=[...html.matchAll(/<script\b([^>]*)>/g)].map(([,attrs])=>({src:attrs.match(/\bsrc="([^"]+)"/)?.[1]?.split('?')[0],inert:/\btype="application\/x-spriggan"/.test(attrs)}));
  for(const src of ['../shared/park-journal.js','../shared/park-memory.js','./journal.js'])assert(scripts.some(script=>script.src===src&&script.inert),src+' must wait for account hydration');
  assert(scripts.some(script=>script.src==='../shared/park-session.js'&&!script.inert));
  assert(html.includes('id="park-gate"'));assert(html.includes('id="journal-chapters"'));assert(html.includes('href="../"'));
  assert(!/<body\b[^>]*data-map-guard/.test(html),'a direct authenticated journal visit must not be rejected by the world map gate');
});

test('the automatic progress diary exposes reading and navigation without a writing form or editor',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../dist/journal/index.html'),'utf8');
  assert(!/<(?:form|textarea|input)\b/i.test(html),'automatic memories must not ask players to write or submit an entry');
  assert(!/\bcontenteditable(?:\s|=|>)/i.test(html));
  for(const id of ['journal-editor','journal-write','journal-empty-write','journal-entry-save','journal-entry-done']) {
    assert(!html.includes('id="'+id+'"'),id+' belongs to the removed personal-writing flow');
  }
  const h=setup({memories:[memory('earned',19,{world:'pond',text:'Mochi has grown a little.'})]});
  assert.equal(h.chapters()[0].querySelector('button'),null,'earned memories are read-only');
  assert.deepEqual(texts(h),['Mochi has grown a little.']);assert.deepEqual(h.writes,[]);
});
