const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const timers=new Map(),players=[],errors=[],states=[],session={type:'auto'};let timer=0;
 class Player{
  constructor(){this.paused=true;this.ended=false;this.readyState=0;this.events={};this.calls=0;this.policy='allow';players.push(this)}
  setAttribute(){}
  addEventListener(name,fn){(this.events[name]||=[]).push(fn)}
  emit(name){for(const fn of this.events[name]||[])fn()}
  play(){
   this.calls++;
   if(this.policy==='block')return Promise.reject(Object.assign(Error('Gesture required'),{name:'NotAllowedError'}));
   if(this.policy==='error')return Promise.reject(Object.assign(Error('Bad file'),{name:'NotSupportedError'}));
   const start=()=>{this.paused=false;this.readyState=4;this.emit('playing')};
   if(this.policy==='wait')return new Promise(resolve=>{this.finish=()=>{start();resolve()}});
   start();return Promise.resolve();
  }
  pause(){if(!this.paused){this.paused=true;this.emit('pause')}}
 }
 const sandbox={Audio:Player,PondRainLoop:Player,navigator:{audioSession:session},window:{AudioContext:class{constructor(){assert.fail('Recordings must not create a Web Audio context')}}},setTimeout:fn=>{timers.set(++timer,fn);return timer},clearTimeout:id=>timers.delete(id)};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/pond-audio.js'),'utf8'),sandbox);
 const audio=new sandbox.PondAudio(()=>{},message=>errors.push(message),playing=>states.push(playing));
 return{audio,players,errors,states,session,timers};
}
test('recording adapters start on tap without initializing the separate music context',async()=>{
 const {audio,players}=setup();const rain=audio.toggle('rain',true);assert.equal(players[0].calls,1);await rain;await audio.toggle('ambient',true);
 assert.equal(players.length,2);assert.equal(audio.isPlaying('rain'),true);assert.equal(audio.isPlaying('ambient'),true);assert.equal(audio.needsResume,false);assert.equal(audio.ac,null);
 assert(players.every(p=>p.loop));assert(players[0].src.includes('rain'));assert(players[1].src.includes('crickets'));
});
test('repeated app switches replay the same authorized elements and preserve volume',async()=>{
 const {audio,players,session}=setup();await audio.toggle('rain',true);await audio.toggle('ambient',true);audio.setVolume(80);
 for(let i=0;i<5;i++){
  await audio.visibility(true);assert(players.every(p=>p.paused));assert.equal(session.type,'playback');
  await audio.visibility(false);assert(players.every(p=>!p.paused));assert.equal(audio.needsResume,false);
 }
 assert.equal(players.length,2);assert(players.every(p=>p.calls===6));assert.equal(players[0].volume,.4);
});
test('rejected automatic restart preserves preferences and exposes a functional tap retry',async()=>{
 const {audio,players,errors}=setup();await audio.toggle('ambient',true);await audio.visibility(true);players[0].policy='block';await audio.visibility(false);
 assert.equal(audio.enabled.ambient,true);assert.equal(audio.needsResume,true);assert.equal(audio.isPlaying('ambient'),false);assert.equal(errors.length,0);
 players[0].policy='allow';await audio.toggle('ambient',true);assert.equal(audio.needsResume,false);assert.equal(audio.isPlaying('ambient'),true);assert.equal(players.length,1);
});
test('one bounded foreground retry recovers a media session that was not ready',async()=>{
 const {audio,players,timers}=setup();await audio.toggle('rain',true);await audio.visibility(true);players[0].policy='block';await audio.visibility(false);
 const retry=timers.get(audio.returnTimer);players[0].policy='allow';retry();await Promise.resolve();await Promise.resolve();assert.equal(audio.isPlaying('rain'),true);
});
test('muted layers stay muted and no players are created just by opening or focusing the app',async()=>{
 const {audio,players,session}=setup();await audio.visibility(false);assert.equal(players.length,0);
 await audio.toggle('rain',true);await audio.toggle('rain',false);assert.equal(session.type,'auto');const count=players[0].calls;
 await audio.visibility(true);await audio.visibility(false);assert.equal(players[0].calls,count);assert.equal(audio.needsResume,false);
});
test('late playback completion after backgrounding or muting cannot leak audio',async()=>{
 for(const hide of [true,false]){
  const {audio}=setup();const player=audio.player('rain');player.policy='wait';const pending=audio.toggle('rain',true);
  if(hide)await audio.visibility(true);else await audio.toggle('rain',false);
  player.finish();await pending;assert.equal(player.paused,true);assert.equal(audio.isPlaying('rain'),false);
 }
});
test('stale completion cannot clear the next foreground playback request',async()=>{
 const {audio}=setup(),player=audio.player('rain');player.policy='wait';const old=audio.toggle('rain',true),finishOld=player.finish;
 await audio.visibility(true);const fresh=audio.visibility(false),finishFresh=player.finish;
 finishOld();await old;assert(audio.pending.has('rain'));finishFresh();await fresh;assert.equal(audio.pending.size,0);assert.equal(audio.isPlaying('rain'),true);
});
test('media errors retain the requested layer for retry and unsupported session APIs are harmless',async()=>{
 const {audio,session,errors}=setup();Object.defineProperty(session,'type',{get(){return 'auto'},set(){throw Error('Unsupported')}});
 const player=audio.player('ambient');player.policy='error';await audio.toggle('ambient',true);assert.equal(audio.needsResume,true);assert.equal(errors.length,1);
 player.policy='allow';await audio.toggle('ambient',true);assert.equal(audio.isPlaying('ambient'),true);
});
