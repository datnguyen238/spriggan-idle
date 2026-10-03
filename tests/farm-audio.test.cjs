const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../dist/pixel/farm-audio.js'),'utf8');
function setup(saved){
 let stored=saved,created=0,id=0;const timers=new Map();
 const param=()=>({value:0,setTargetAtTime(v){this.value=v}});
 const node=()=>({gain:param(),frequency:param(),Q:param(),delayTime:param(),connect(){}});
 class AudioContext{
  constructor(){created++;this.state='suspended';this.currentTime=0;this.destination={}}
  createGain(){return node()}createBiquadFilter(){return node()}createDelay(){return node()}
  async resume(){this.state='running'}async suspend(){this.state='suspended'}async close(){this.state='closed'}
 }
 const ctx={AudioContext,localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},setInterval:fn=>{timers.set(++id,fn);return id},clearInterval:n=>timers.delete(n),setTimeout:fn=>fn()};vm.runInNewContext(source,ctx);
 const audio=new ctx.FarmAudio(),bars=[];audio.phrase=(at,index)=>bars.push({at,index});
 return{audio,bars,timers,created:()=>created,saved:()=>JSON.parse(stored)};
}
test('saved music waits for a gesture and remembers volume without creating audio',()=>{
 const s=setup(JSON.stringify({enabled:true,volume:.45}));assert.equal(s.created(),0);assert.equal(s.audio.volume,.45);assert(s.audio.needsResume);
 s.audio.setVolume(.6);assert.deepEqual(s.saved(),{enabled:true,volume:.6});
});
test('music starts once and schedules continuous bars against the audio clock',async()=>{
 const s=setup();await Promise.all([s.audio.start(),s.audio.start()]);assert.equal(s.created(),1);assert.equal(s.timers.size,1);
 s.audio.context.currentTime=25;s.audio.schedule();
 assert(s.bars.at(-1).at>=52);for(let i=1;i<s.bars.length;i++)assert(Math.abs(s.bars[i].at-s.bars[i-1].at-4.8)<1e-8);
});
test('hiding suspends queued audio and resuming never duplicates scheduled bars',async()=>{
 const s=setup();await s.audio.start();const count=s.bars.length;s.audio.visibility(true);assert.equal(s.audio.context.state,'suspended');assert.equal(s.timers.size,0);
 s.audio.visibility(false);await s.audio.starting;assert.equal(s.audio.context.state,'running');assert.equal(s.bars.length,count);assert.equal(s.timers.size,1);
 s.audio.stop();assert.equal(s.audio.enabled,false);assert.equal(s.audio.context,null);assert.equal(s.timers.size,0);assert.equal(s.saved().enabled,false);
});
test('stop during an asynchronous start does not resurrect playback',async()=>{
 const s=setup(),pending=s.audio.start();s.audio.stop();assert.equal(await pending,false);assert.equal(s.audio.context,null);assert.equal(s.timers.size,0);
});
test('unavailable audio reports a recoverable state without throwing',async()=>{
 const s=setup();s.audio.createContext=()=>{throw new Error('Unavailable')};assert.equal(await s.audio.start(),false);assert(s.audio.needsResume);
});
