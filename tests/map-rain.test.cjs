const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../dist/shared/map-rain.js'),'utf8');
function setup(saved=null){
 const listeners={},elements={};let stored=saved,instances=0;
 const element=()=>({hidden:false,textContent:'',value:'',attributes:{},setAttribute(k,v){this.attributes[k]=v},querySelector(){return this}});
 const root={querySelector:s=>elements[s]||=(element()),contains:()=>false};
 class Player{
  constructor(){instances++;this.paused=true;this.events={}}
  set src(v){this.url=v}addEventListener(n,fn){this.events[n]=fn}
  async play(){this.paused=false;this.events.playing?.()}
  pause(){this.paused=true;this.events.pause?.()}
 }
 const ctx={URL,navigator:{},PondRainLoop:Player,SprigganRuntime:{mobile:true},matchMedia:()=>({matches:false}),localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},document:{currentScript:{src:'https://example.com/shared/map-rain.js'},hidden:false,addEventListener:(n,fn)=>listeners[n]=fn},addEventListener:(n,fn)=>listeners[n]=fn};ctx.window=ctx;vm.runInNewContext(code,ctx);
 const rain=new ctx.MapRain(root,'rain','pixel');return{rain,elements,listeners,ctx,instances:()=>instances,saved:()=>JSON.parse(stored)};
}
test('saved rain is visual-only until a gesture and uses the shared pond file',async()=>{
 const s=setup(JSON.stringify({enabled:true,volume:.4}));assert(s.rain.enabled);assert.equal(s.instances(),0);assert.equal(s.elements['[data-rain-resume]'].hidden,false);
 await s.rain.play();assert.equal(s.rain.player.url,'https://example.com/pond/rain-seamless.wav');assert.equal(s.rain.player.volume,.4);assert.equal(s.elements['[data-rain-resume]'].hidden,true);
});
test('rain mute stops playback and preserves the selected volume',async()=>{
 const s=setup();s.rain.toggle();await Promise.resolve();s.elements['[data-rain-volume]'].value='45';s.elements['[data-rain-volume]'].oninput();s.rain.toggle();assert(s.rain.player.paused);assert.deepEqual(s.saved(),{enabled:false,volume:.45});
});
test('blocked playback exposes a retry without disabling visual rain',async()=>{
 const s=setup(JSON.stringify({enabled:true}));s.rain.player={paused:true,play:()=>Promise.reject(Error('Blocked'))};await s.rain.play();assert(s.rain.enabled);assert.equal(s.elements['[data-rain-resume]'].hidden,false);assert.equal(s.rain.pending,false);
});
test('visibility pauses mobile audio and resumes it while desktop tab switches keep playing',async()=>{
 const s=setup();s.rain.toggle();await Promise.resolve();s.ctx.document.hidden=true;s.listeners.visibilitychange();assert(s.rain.player.paused);
 s.ctx.document.hidden=false;s.listeners.visibilitychange();await Promise.resolve();assert(!s.rain.player.paused);
 s.ctx.SprigganRuntime.mobile=false;s.ctx.document.hidden=true;s.listeners.visibilitychange();assert(!s.rain.player.paused);s.listeners.pagehide();assert(s.rain.player.paused);
});
test('turning rain off during loading leaves controls off when loading finishes',async()=>{
 const s=setup(JSON.stringify({enabled:true}));let finish;s.rain.player={paused:true,play:()=>new Promise(r=>finish=r),pause(){this.paused=true}};
 const pending=s.rain.play();s.rain.toggle();finish();await pending;assert.equal(s.rain.enabled,false);assert.equal(s.rain.pending,false);assert.equal(s.elements['[data-rain-resume]'].hidden,true);
});
