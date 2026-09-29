/* Quiet, opt-in audio layers. No audio context or downloads before a gesture. */
(()=>{
  'use strict';
  class PondAudio{
    constructor(onChange,onError){
      this.onChange=onChange;this.onError=onError;this.enabled={rain:false,ambient:false,music:false};this.night=false;this.volume=.2;
      this.ac=null;this.loads=new Map();this.sources=new Map();this.musicTimer=null;this.suspendTimer=null;this.noteIndex=0;this.hidden=false;
    }
    init(){
      if(this.ac)return;
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Audio is unavailable in this browser.');
      this.ac=new AC();this.gains={};
      for(const name of ['rain','wind','crickets','music']){const gain=this.ac.createGain();gain.gain.value=0;gain.connect(this.ac.destination);this.gains[name]=gain}
    }
    async load(name,file){
      if(this.loads.has(name))return this.loads.get(name);
      const job=(async()=>{
        const response=await fetch(file);if(!response.ok)throw Error(`Unable to load ${name}`);
        const buffer=await this.ac.decodeAudioData(await response.arrayBuffer());
        const source=this.ac.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(this.gains[name]);source.start();this.sources.set(name,source);
      })();
      this.loads.set(name,job);
      try{await job}catch(error){this.loads.delete(name);throw error}
    }
    wind(){
      if(this.sources.has('wind'))return;
      const buffer=this.ac.createBuffer(1,this.ac.sampleRate*8,this.ac.sampleRate),data=buffer.getChannelData(0);
      let smooth=0;for(let i=0;i<data.length;i++){smooth=(smooth+.025*(Math.random()*2-1))/1.025;data[i]=smooth*3}
      const source=this.ac.createBufferSource(),filter=this.ac.createBiquadFilter();source.buffer=buffer;source.loop=true;
      filter.type='lowpass';filter.frequency.value=450;source.connect(filter);filter.connect(this.gains.wind);source.start();this.sources.set('wind',source);
    }
    async toggle(name,on){
      if(!(name in this.enabled))return;
      this.enabled[name]=on;this.onChange({...this.enabled});
      if(!on){this.sync();return}
      try{
        this.init();await this.ac.resume();
        if(name==='rain')await this.load('rain','mixkit-light-rain-loop-2393.wav');
        if(name==='ambient'){this.wind();await this.load('crickets','mixkit-night-crickets-near-the-swamp-1782.wav')}
        this.sync();
      }catch{
        this.enabled[name]=false;this.sync();this.onChange({...this.enabled});this.onError(`${name==='ambient'?'Nature sounds':name==='music'?'Music':'Rain sound'} could not start. Tap to retry.`);
      }
    }
    setNight(night){this.night=night;this.sync()}
    setVolume(percent){this.volume=percent/100*.5;this.sync()}
    sync(){
      if(!this.ac)return;
      clearTimeout(this.suspendTimer);
      const active=!this.hidden,target={rain:active&&this.enabled.rain?this.volume:0,wind:active&&this.enabled.ambient&&!this.night?.10:0,
        crickets:active&&this.enabled.ambient&&this.night?.055:0,music:active&&this.enabled.music?.07:0};
      for(const [key,value] of Object.entries(target))this.gains[key].gain.setTargetAtTime(value,this.ac.currentTime,.65);
      if(active&&this.enabled.music)this.startMusic();else{clearTimeout(this.musicTimer);this.musicTimer=null}
      if(!Object.values(this.enabled).some(Boolean))this.suspendTimer=setTimeout(()=>{if(!Object.values(this.enabled).some(Boolean))this.ac.suspend().catch(()=>{})},2500);
    }
    startMusic(){
      if(this.musicTimer!==null)return;
      const play=()=>{
        if(!this.enabled.music||this.hidden){this.musicTimer=null;return}
        const notes=[261.63,329.63,392,293.66,440,329.63,293.66,392],base=notes[this.noteIndex++%notes.length],now=this.ac.currentTime;
        for(const [i,freq] of [base/2,base,base*1.5].entries()){
          const oscillator=this.ac.createOscillator(),gain=this.ac.createGain();oscillator.type='sine';oscillator.frequency.value=freq;
          gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(i===0?.11:.065,now+1.4);gain.gain.exponentialRampToValueAtTime(.0001,now+6.5);
          oscillator.connect(gain);gain.connect(this.gains.music);oscillator.start(now);oscillator.stop(now+7);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
        }
        this.musicTimer=setTimeout(play,6500);
      };play();
    }
    async visibility(hidden){
      this.hidden=hidden;this.sync();if(!this.ac)return;
      try{if(hidden)await this.ac.suspend();else if(Object.values(this.enabled).some(Boolean))await this.ac.resume()}catch{this.onError('Tap a sound button to resume audio.')}
    }
  }
  globalThis.PondAudio=PondAudio;
})();
