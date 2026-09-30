const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const contexts=[];let fetches=0,blocked=false;
 class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.sources=[];contexts.push(this)}
  createGain(){return{connect(){},gain:{value:0,setTargetAtTime(v){this.value=v}}}}
  resume(){if(blocked)return new Promise(()=>{});this.state='running';this.onstatechange?.();return Promise.resolve()}
  close(){this.state='closed';return Promise.resolve()}
  decodeAudioData(){return Promise.resolve({duration:13.8})}
  createBufferSource(){const source={connect(){},start(){this.started=true},stop(){this.stopped=true},disconnect(){}};this.sources.push(source);return source}
 }
 const sandbox={window:{AudioContext:Context},fetch:async()=>{fetches++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/pond-rain-loop.js'),'utf8'),sandbox);
 return{loop:new sandbox.PondRainLoop(),contexts,fetches:()=>fetches,block:value=>{blocked=value}};
}
test('one buffer source loops continuously without timers, seeking, or second-player starts',async()=>{
 const {loop,contexts,fetches}=setup();await loop.play();const source=loop.source;
 assert.equal(source.loop,true);assert.equal(source.loopStart,0);assert.equal(source.loopEnd,13.8);assert.equal(loop.paused,false);
 for(let cycle=1;cycle<10;cycle++){contexts[0].currentTime=cycle*13.8;assert.equal(loop.source,source);assert.equal(loop.paused,false)}
 await loop.play();assert.equal(contexts[0].sources.length,1);assert.equal(fetches(),1);
});
test('return from background uses a fresh playback context but keeps decoded rain',async()=>{
 const {loop,contexts,fetches}=setup();await loop.play();const buffer=loop.buffer,source=loop.source;loop.pause();
 assert.equal(contexts[0].state,'closed');assert(source.stopped);assert.equal(loop.paused,true);
 await loop.play();assert.equal(contexts.length,2);assert.equal(loop.buffer,buffer);assert.equal(fetches(),1);assert.equal(loop.paused,false);
});
test('blocked resume stays visibly paused and a later user gesture can recover',async()=>{
 const {loop,block}=setup();block(true);await loop.play();assert.equal(loop.paused,true);assert.equal(loop.readyState,4);
 block(false);await loop.play();assert.equal(loop.paused,false);
});
test('muting while rain loads cannot start a late audio source',async()=>{
 const {loop,contexts}=setup();const pending=loop.play();loop.pause();await pending;
 assert.equal(loop.source,null);assert.equal(contexts[0].sources.length,0);assert.equal(loop.paused,true);
});
test('volume is applied to the looping source without restarting it',async()=>{
 const {loop,contexts}=setup();loop.volume=.1;await loop.play();const source=loop.source;assert.equal(loop.gain.gain.value,.1);
 loop.volume=.4;assert.equal(loop.gain.gain.value,.4);assert.equal(loop.source,source);assert.equal(contexts[0].sources.length,1);
});
