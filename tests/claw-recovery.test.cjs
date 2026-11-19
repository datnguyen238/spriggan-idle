const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),L=require('../dist/claw/claw-life.js');

// Run the real arcade handlers and shared action forwarding; only adapt browser/3D APIs.
async function harness(coins){
 const nodes=new Map(),observers=[],storage=new Map([[L.KEY,JSON.stringify({...L.decode(null),coins})]]);
 function changed(node){for(const o of observers){let at=node;while(at){if(at===o.target){o.callback();break;}at=at.parentElement;}}}
 function node(tag='div'){
  const n={tagName:tag.toUpperCase(),children:[],dataset:{},attributes:{},hidden:false,listeners:new Map(),
   append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}},
   replaceChildren(...children){this.children=[];this.append(...children);},
   setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k]??null;},hasAttribute(k){return k in this.attributes;},
   addEventListener(k,fn){this.listeners.set(k,[...(this.listeners.get(k)||[]),fn]);},
   querySelectorAll(selectors){return this.children.flatMap(c=>[...(selectors.split(',').includes(c.tagName.toLowerCase())?[c]:[]),...c.querySelectorAll(selectors)]);},
   cloneNode(deep){const copy=node(tag);copy.textContent=this.ownText;if(deep)copy.append(...this.children.map(c=>c.cloneNode(true)));return copy;},
   remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);},
   click(){if(this.disabled)return;for(const fn of this.listeners.get('click')||[])fn({target:this});this.onclick?.({target:this});},
   focus(){},classList:{toggle(){},add(){},remove(){}},ownText:'',_disabled:false};
  Object.defineProperty(n,'textContent',{get(){return this.ownText+this.children.map(c=>c.textContent).join('');},set(v){this.ownText=String(v??'');this.children=[];changed(this);}});
  Object.defineProperty(n,'disabled',{get(){return this._disabled;},set(v){this._disabled=!!v;changed(this);}});
  return n;
 }
 for(const id of ['plush-list','coin-balance','sound','save-note','status','controller-body','toggle-controls','close-controls','turn-time','turn-clock','depth-position','insert','drop','pause'])nodes.set('#'+id,node('button'));
 for(const id of ['insert','drop']){const label=node('span');label.textContent=id==='insert'?'Insert coin':'Catch';nodes.get('#'+id).append(node('svg'),label);nodes.set('#'+id+' span',label);}
 nodes.set('.scene-stage',node());nodes.set('.loading',node());
 const body=node('body');body.dataset.world='claw';
 const document={body,hidden:false,readyState:'complete',querySelector:s=>nodes.get(s)||null,getElementById:id=>nodes.get('#'+id)||null,querySelectorAll:()=>[],addEventListener(){},createElement:node,createElementNS:(_,tag)=>node(tag)};
 const window={addEventListener(){}};
 class Scene{draw(){}clearPrize(){}presentPrize(){}}
 const Physics={create:async()=>({isMoving:()=>false,step(){}})};
 class MutationObserver{constructor(callback){this.callback=callback;}observe(target){observers.push({target,callback:this.callback});}}
 const context=vm.createContext({ClawLife:L,ClawArt:{plush:()=>''},Scene,Physics,document,window,MutationObserver,ResizeObserver:class{observe(){}},matchMedia:()=>({matches:false}),performance:{now:()=>0},requestAnimationFrame(){},console,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
 const source=fs.readFileSync(require.resolve('../dist/claw/claw.js'),'utf8')
  .replace(/import\((['"])\.\/claw-scene\.js(?:\?[^'"]*)?\1\)/g,'Promise.resolve({ClawScene:Scene})')
  .replace(/import\((['"])\.\/claw-physics\.js(?:\?[^'"]*)?\1\)/g,'Promise.resolve({ClawPhysics:Physics})')
  .replace('updateCollection();if(progress.lastKept)','globalThis.hooks={s,render,claim};updateCollection();if(progress.lastKept)');
 await vm.runInContext(source,context);
 vm.runInContext(fs.readFileSync(require.resolve('../dist/shared/world-ui.js'),'utf8'),context);
 const primary=body.children.find(n=>n.className==='world-actions').children[0];
 return {$:s=>nodes.get(s),primary,session:context.hooks.s,
  saved:()=>L.decode(storage.get(L.KEY)),render:()=>context.hooks.render(),
  finish(win=false){const s=context.hooks.s;L.update(s,L.durations.coin);L.aim(s,win?s.toys[0].x:208);L.drop(s);L.update(s,10);context.hooks.claim();context.hooks.render();}};
}

test('zero-balance primary and source controls offer repeatable free turns and keep normal prizes',async()=>{
 const h=await harness(0);
 assert.equal(h.$('#insert').disabled,false);assert.equal(h.primary.disabled,false);
 assert.equal(h.primary.textContent,'Play a free turn');assert.match(h.$('#status').textContent,/free turn/);
 h.primary.click();assert.equal(h.session.phase,'coin');assert.equal(h.saved().coins,0);assert.equal(h.primary.disabled,true);
 h.finish();assert.equal(h.primary.disabled,false);assert.equal(h.primary.textContent,'Play a free turn');
 h.primary.click();h.finish(true);assert.equal(h.saved().coins,0);assert.equal(h.saved().friends.length,1);
 assert.equal(h.primary.textContent,'Play a free turn');assert.equal(h.$('#insert span').textContent,h.primary.textContent);
});

test('the last paid turn spends exactly once and the forwarded control then offers free play',async()=>{
 const h=await harness(1);assert.equal(h.primary.textContent,'Insert · 1');
 h.$('#insert').click();assert.equal(h.saved().coins,0);assert.equal(h.session.phase,'coin');
 h.primary.click();assert.equal(h.saved().coins,0);h.finish();
 assert.equal(h.primary.textContent,'Play a free turn');h.primary.click();assert.equal(h.session.phase,'coin');assert.equal(h.saved().coins,0);
});
