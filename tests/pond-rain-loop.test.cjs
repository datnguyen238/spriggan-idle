const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const tracks=[];let timer;
 class Audio{
  constructor(){this.paused=true;this.ended=false;this.currentTime=0;this.duration=15;this.readyState=4;this.events={};this.calls=0;tracks.push(this)}
  setAttribute(){}
  addEventListener(name,fn){(this.events[name]||=[]).push(fn)}
  emit(name){for(const fn of this.events[name]||[])fn()}
  play(){this.calls++;this.paused=false;this.ended=false;this.emit('playing');return this.reject?Promise.reject(Error('Blocked')):Promise.resolve()}
  pause(){if(!this.paused){this.paused=true;this.emit('pause')}}
 }
 const sandbox={Audio,setInterval:fn=>{timer=fn;return 1},clearInterval:()=>{timer=null}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/pond-rain-loop.js'),'utf8'),sandbox);
 return{loop:new sandbox.PondRainLoop(),tracks,tick:()=>timer?.()};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('both players are authorized in the first tap and a second rain copy starts before the first ends',async()=>{
 const {loop,tracks,tick}=setup();const job=loop.play();assert(tracks.every(t=>t.calls===1));await job;
 assert.equal(tracks[0].paused,false);assert.equal(tracks[1].paused,true);
 tracks[0].currentTime=13.9;tick();await flush();assert.equal(loop.active,1);assert(tracks.every(t=>!t.paused));assert(Math.abs(tracks[1].currentTime-.1)<1e-9);
 tracks[0].paused=true;tracks[0].ended=true;tracks[0].emit('ended');assert.equal(loop.paused,false);
 tracks[1].currentTime=13.85;tick();await flush();assert.equal(loop.active,0);assert(tracks.every(t=>!t.paused));
});
test('leaving during a crossfade stops both copies, and return uses an authorized player',async()=>{
 const {loop,tracks,tick}=setup();await loop.play();tracks[0].currentTime=13.9;tick();await flush();loop.pause();assert(tracks.every(t=>t.paused));assert.equal(loop.paused,true);
 await loop.play();assert.equal(loop.paused,false);assert.equal(tracks.length,2);
});
test('late playing events cannot leak sound after pause',async()=>{
 const {loop,tracks}=setup();await loop.play();loop.pause();tracks[0].paused=false;tracks[0].emit('playing');assert.equal(tracks[0].paused,true);
});
test('handoff failures expose an error instead of claiming to play silently',async()=>{
 const {loop,tracks,tick}=setup();let errors=0;loop.addEventListener('error',()=>errors++);await loop.play();tracks[1].reject=true;tracks[0].currentTime=13.9;tick();await flush();assert.equal(loop.paused,true);assert.equal(errors,1);
});
