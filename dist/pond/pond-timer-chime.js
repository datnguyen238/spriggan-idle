/* A quiet, three-note bell. Audio is unlocked only by a user gesture. */
(()=>{
 'use strict';
 class PondTimerChime{
  constructor(){this.context=null;this.voices=new Set();this.hidden=false}
  unlock(){
   if(this.hidden)return;
   try{
    const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return;
    if(!this.context||this.context.state==='closed')this.context=new AC();
    this.context.resume().catch(()=>{});
   }catch{}
  }
  play(){
   const ac=this.context;if(this.hidden||ac?.state!=='running')return;
   this.stop();
   [523.25,659.25,783.99].forEach((frequency,i)=>{
    const start=ac.currentTime+i*.24,o=ac.createOscillator(),gain=ac.createGain(),voice={o,gain};
    o.type='sine';o.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+.04);gain.gain.exponentialRampToValueAtTime(.0001,start+1.65);
    o.connect(gain);gain.connect(ac.destination);this.voices.add(voice);
    o.onended=()=>{o.disconnect();gain.disconnect();this.voices.delete(voice)};
    o.start(start);o.stop(start+1.8);
   });
  }
  stop(){for(const voice of this.voices){try{voice.gain.gain.cancelScheduledValues(0);voice.gain.gain.setValueAtTime(0,this.context.currentTime);voice.o.stop()}catch{}voice.o.disconnect();voice.gain.disconnect()}this.voices.clear()}
  visibility(hidden){
   this.hidden=hidden;
   if(hidden){this.stop();this.context?.suspend().catch(()=>{})}
   else if(this.context)this.context.resume().catch(()=>{});
  }
 }
 globalThis.PondTimerChime=PondTimerChime;
})();
