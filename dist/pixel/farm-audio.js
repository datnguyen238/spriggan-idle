/* A slow, generated farm lullaby. Playback always starts with a user gesture. */
(()=>{'use strict';
 const KEY='spriggan.farm.music.v1',BAR=4.8,OUTPUT=1.6;
 const chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,59],[48,55,60,64],[45,52,59,64],[41,48,55,60],[43,50,57,62]];
 const melodies=[[76,79,74],[72,76,71],[69,72,76],[71,74,67],[79,76,72],[76,71,69],[72,69,67],[74,71,72]];
 const hz=midi=>440*Math.pow(2,(midi-69)/12);
 class FarmAudio{
  constructor(onStateChange=()=>{}){
   this.onStateChange=onStateChange;this.context=null;this.gain=null;this.timer=null;this.enabled=false;this.volume=.25;this.needsResume=false;this.hidden=false;this.starting=null;this.bar=0;this.nextBar=0;
   try{const s=JSON.parse(localStorage.getItem(KEY));if(s){this.enabled=s.enabled===true;if(Number.isFinite(s.volume))this.volume=Math.max(0,Math.min(1,s.volume));this.needsResume=this.enabled}}catch{}
  }
  isPlaying(){return this.enabled&&this.context?.state==='running'&&!this.hidden}
  save(){try{localStorage.setItem(KEY,JSON.stringify({enabled:this.enabled,volume:this.volume}))}catch{}}
  notify(){this.onStateChange({enabled:this.enabled,playing:this.isPlaying(),needsResume:this.needsResume,volume:this.volume})}
  setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));if(this.gain)this.gain.gain.setTargetAtTime(this.enabled?this.volume*OUTPUT:0,this.context.currentTime,.08);this.save();this.notify()}
  createContext(){
   if(this.context&&this.context.state!=='closed')return;
   const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)throw new Error('Web Audio unavailable');
   const ac=this.context=new AC();this.gain=ac.createGain();this.gain.gain.value=0;this.gain.connect(ac.destination);
   this.filter=ac.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=2400;this.filter.Q.value=.5;this.filter.connect(this.gain);
   // A quiet echo gives the bells a little space; feedback stays below unity.
   const delay=ac.createDelay(1),wet=ac.createGain(),feedback=ac.createGain();delay.delayTime.value=.36;wet.gain.value=.16;feedback.gain.value=.2;
   this.filter.connect(delay);delay.connect(wet);wet.connect(this.gain);delay.connect(feedback);feedback.connect(delay);
   this.bar=0;this.nextBar=ac.currentTime+.08;
   ac.onstatechange=()=>{if(this.context!==ac)return;this.needsResume=this.enabled&&ac.state!=='running';this.notify()};
  }
  async start(){
   this.enabled=true;this.save();if(this.hidden){this.needsResume=true;this.notify();return false}
   if(this.starting)return this.starting;
   this.starting=this.begin();try{return await this.starting}finally{this.starting=null}
  }
  async begin(){
   try{
    this.createContext();const ac=this.context;await ac.resume();
    if(!this.enabled||this.hidden||this.context!==ac)return false;
    if(ac.state!=='running')throw new Error('Audio paused');
    this.gain.gain.setTargetAtTime(this.volume*OUTPUT,ac.currentTime,.3);
    if(!this.timer){this.schedule();this.timer=setInterval(()=>this.schedule(),500)}
    this.needsResume=false;this.notify();return true;
   }catch{this.needsResume=this.enabled;this.notify();return false}
  }
  stop(){
   this.enabled=false;this.needsResume=false;this.save();clearInterval(this.timer);this.timer=null;
   const ac=this.context,gain=this.gain;this.context=null;this.gain=null;
   if(ac){ac.onstatechange=null;if(ac.state==='running'){gain.gain.setTargetAtTime(0,ac.currentTime,.025);setTimeout(()=>ac.close().catch(()=>{}),150)}else ac.close().catch(()=>{})}
   this.notify();
  }
  visibility(hidden){
   this.hidden=hidden;
   if(hidden){clearInterval(this.timer);this.timer=null;if(this.context)this.context.suspend().catch(()=>{});this.needsResume=this.enabled;this.notify()}
   else if(this.enabled&&this.context)this.start();
  }
  schedule(){
   const ac=this.context;if(!ac||!this.enabled||this.hidden||ac.state!=='running')return;
   // Audio-clock scheduling preserves phrase spacing when background callbacks are delayed.
   if(this.nextBar<ac.currentTime){const skipped=Math.ceil((ac.currentTime-this.nextBar)/BAR);this.bar+=skipped;this.nextBar+=skipped*BAR}
   while(this.nextBar<ac.currentTime+32){this.phrase(this.nextBar,this.bar++);this.nextBar+=BAR}
  }
  phrase(start,index){
   const chord=chords[index%chords.length],melody=melodies[index%melodies.length];
   chord.forEach((note,i)=>this.tone(start+i*.035,hz(note),BAR+1,.027,'triangle',.55));
   this.tone(start,hz(chord[0]-12),BAR,.035,'sine',.35);
   // Alternate the upper melody on each pass so the lullaby breathes instead of repeating abruptly.
   melody.forEach((note,i)=>{const t=start+.65+i*1.25+(index%2)*.15,f=hz(note+(Math.floor(index/8)%2&&i===1?-12:0));this.tone(t,f,2.5,.085-i*.012,'sine',.018);this.tone(t+.008,f*2,1.2,.009,'sine',.012)});
  }
  tone(start,frequency,duration,volume,type,attack){
   const ac=this.context,o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=frequency;
   g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(volume,start+attack);g.gain.exponentialRampToValueAtTime(.0001,start+duration);g.gain.linearRampToValueAtTime(0,start+duration+.03);
   o.connect(g);g.connect(this.filter);o.start(start);o.stop(start+duration+.05);o.onended=()=>{o.disconnect();g.disconnect()};
  }
 }
 globalThis.FarmAudio=FarmAudio;
})();
