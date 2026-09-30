const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(navigator){
 const states=[],timers=new Map();let timer=0,requests=0;
 class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.blocked=false;this.resumeCalls=0;this.createdSources=0}
  change(state){this.state=state;this.onstatechange?.()}
  createGain(){return {connect(){},gain:{value:0,setTargetAtTime(v){this.value=v}}}}
  createBufferSource(){this.createdSources++;return {connect(){},start(){}}}
  decodeAudioData(){return Promise.resolve({})}
  resume(){this.resumeCalls++;if(this.blocked)return new Promise(()=>{});this.change('running');return Promise.resolve()}
  suspend(){this.change('suspended');return Promise.resolve()}
 }
 const sandbox={navigator,window:{AudioContext:Context},fetch:async()=>{requests++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}},setTimeout:fn=>{timers.set(++timer,fn);return timer},clearTimeout:id=>timers.delete(id)};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/pond-audio.js'),'utf8'),sandbox);
 const audio=new sandbox.PondAudio(()=>{},message=>assert.fail(message),playing=>states.push(playing));
 return{audio,states,requests:()=>requests};
}
test('background and return restore enabled cricket audio without duplicate loops',async()=>{
 const {audio,states,requests}=setup();await audio.toggle('ambient',true);assert.equal(audio.ac.state,'running');assert.equal(audio.gains.crickets.gain.value,.18);
 await audio.visibility(true);assert.equal(audio.ac.state,'suspended');assert.equal(audio.gains.crickets.gain.value,0);
 await audio.visibility(false);assert.equal(audio.ac.state,'running');assert.equal(audio.gains.crickets.gain.value,.18);assert.equal(states.at(-1),true);assert.equal(requests(),1);assert.equal(audio.ac.createdSources,1);
});
test('blocked resume does not block loading; next gesture restores interrupted sound',async()=>{
 const {audio,states,requests}=setup();audio.init();audio.ac.blocked=true;
 await audio.toggle('ambient',true);assert.equal(requests(),1);assert.equal(audio.enabled.ambient,true);assert.equal(states.at(-1),false);
 audio.ac.change('interrupted');audio.ac.blocked=false;await audio.toggle('ambient',true);
 assert.equal(audio.ac.state,'running');assert.equal(states.at(-1),true);assert.equal(audio.gains.crickets.gain.value,.18);assert.equal(requests(),1);assert.equal(audio.ac.createdSources,1);
});
test('muted preferences stay muted after returning',async()=>{
 const {audio}=setup();await audio.toggle('ambient',true);await audio.toggle('ambient',false);await audio.visibility(true);const calls=audio.ac.resumeCalls;await audio.visibility(false);
 assert.equal(audio.ac.resumeCalls,calls);assert.equal(audio.enabled.ambient,false);assert.equal(audio.gains.crickets.gain.value,0);
});
test('closed context can recreate enabled audio after a gesture',async()=>{
 const {audio,requests}=setup();await audio.toggle('ambient',true);const old=audio.ac;old.change('closed');await audio.toggle('ambient',true);
 assert.notEqual(audio.ac,old);assert.equal(audio.ac.state,'running');assert.equal(requests(),2);assert.equal(audio.ac.createdSources,1);
});
test('resume completion after returning to background cannot unmute audio',async()=>{
 const {audio}=setup();await audio.toggle('ambient',true);await audio.visibility(true);audio.ac.change('running');
 assert.equal(audio.gains.crickets.gain.value,0);
});

test('Safari uses playback category for sound and releases it on mute/background',async()=>{
 const session={type:'auto'},navigator={audioSession:session};const {audio}=setup(navigator);
 await audio.toggle('ambient',true);assert.equal(session.type,'playback');
 await audio.visibility(true);assert.equal(session.type,'auto');
 await audio.visibility(false);assert.equal(session.type,'playback');
 await audio.toggle('ambient',false);assert.equal(session.type,'auto');
 await audio.toggle('rain',true);assert.equal(session.type,'playback');assert(audio.gains.rain.gain.value>0);
});
test('browsers that reject the session API can still play sounds',async()=>{
 const session={get type(){return 'auto'},set type(value){throw Error('Unsupported')}};
 const {audio}=setup({audioSession:session});await audio.toggle('ambient',true);assert.equal(audio.ac.state,'running');assert.equal(audio.loading.size,0);
});
