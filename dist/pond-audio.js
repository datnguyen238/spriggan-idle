/* Recorded ambience uses persistent native audio players; Web Audio is only for music. */
(()=>{
  'use strict';
  const FILES={rain:'rain-crossfade.wav',ambient:'mixkit-night-crickets-near-the-swamp-1782.wav'};
  class PondAudio{
    constructor(onChange,onError,onPlayback=()=>{}){
      this.onChange=onChange;this.onError=onError;this.onPlayback=onPlayback;
      this.enabled={rain:false,ambient:false,music:false};this.volume=.2;this.hidden=false;
      this.players=new Map();this.pending=new Map();this.loading=new Set();this.blocked=new Set();
      this.ac=null;this.musicTimer=null;this.noteIndex=0;this.returnTimer=null;
    }
    configureSession(playback){
      try{const session=globalThis.navigator?.audioSession,type=playback?'playback':'auto';if(session&&session.type!==type)session.type=type}catch{}
    }
    isPlaying(name){
      if(this.hidden||!this.enabled[name])return false;
      if(name==='music')return this.ac?.state==='running';
      const player=this.players.get(name);
      return !!player&&!player.paused&&!player.ended&&player.readyState>=2&&!this.blocked.has(name);
    }
    get needsResume(){
      return !this.hidden&&Object.keys(this.enabled).some(name=>this.enabled[name]&&!this.isPlaying(name)&&!this.loading.has(name));
    }
    player(name){
      if(this.players.has(name))return this.players.get(name);
      const player=name==='rain'?new PondRainLoop():new Audio();player.preload='none';player.loop=true;player.setAttribute('playsinline','');player.src=FILES[name];
      player.volume=name==='rain'?this.volume:.18;this.players.set(name,player);
      player.addEventListener('playing',()=>{
        if(this.hidden||!this.enabled[name]){player.pause();return}
        this.loading.delete(name);this.blocked.delete(name);this.notify();
      });
      player.addEventListener('pause',()=>{if(!this.hidden&&this.enabled[name]&&!this.pending.has(name))this.blocked.add(name);this.notify()});
      player.addEventListener('waiting',()=>{if(!this.hidden&&this.enabled[name])this.loading.add(name);this.notify()});
      player.addEventListener('error',()=>{if(!this.hidden&&this.enabled[name])this.fail(name)});
      return player;
    }
    notify(){this.onPlayback(Object.keys(this.enabled).some(name=>this.isPlaying(name)))}
    fail(name){
      this.pending.delete(name);this.loading.delete(name);this.blocked.add(name);this.notify();
      this.onError(`${name==='ambient'?'Nature sounds':name==='music'?'Music':'Rain sound'} could not start. Tap its button to retry.`);
    }
    startRecording(name){
      if(this.hidden||!this.enabled[name])return Promise.resolve();
      if(this.pending.has(name))return this.pending.get(name).promise;
      const player=this.player(name),request={};
      this.pending.set(name,request);this.loading.add(name);this.blocked.delete(name);this.notify();
      // Call play() directly inside the tap handler, before any asynchronous work.
      let playback;try{playback=player.play()}catch(error){playback=Promise.reject(error)}
      request.promise=Promise.resolve(playback).then(()=>{
        if(this.pending.get(name)!==request)return;
        if(this.hidden||!this.enabled[name])player.pause();
        else this.blocked.delete(name);
      }).catch(error=>{
        if(this.pending.get(name)!==request||this.hidden||!this.enabled[name])return;
        this.blocked.add(name);
        if(error.name!=='NotAllowedError'&&error.name!=='AbortError')this.onError(`${name==='ambient'?'Nature sounds':'Rain sound'} could not load. Tap its button to retry.`);
      }).finally(()=>{
        if(this.pending.get(name)!==request)return;
        this.pending.delete(name);this.loading.delete(name);this.notify();
      });
      return request.promise;
    }
    initMusic(){
      if(this.ac&&this.ac.state!=='closed')return;
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Audio is unavailable.');
      this.ac=new AC();const gain=this.ac.createGain();gain.gain.value=0;gain.connect(this.ac.destination);this.gains={music:gain};
      this.ac.onstatechange=()=>this.syncMusic();
    }
    startMusicPlayback(){
      try{
        this.initMusic();this.ac.resume().then(()=>this.syncMusic()).catch(()=>{this.blocked.add('music');this.notify()});this.syncMusic();
      }catch{this.fail('music')}
    }
    async toggle(name,on){
      if(!(name in this.enabled))return;
      this.enabled[name]=on;this.onChange({...this.enabled});
      if(!on){this.stop(name);this.syncSession();return}
      if(this.hidden){this.notify();return}
      this.configureSession(true);
      if(name==='music')this.startMusicPlayback();else await this.startRecording(name);
    }
    stop(name){
      this.pending.delete(name);this.loading.delete(name);this.blocked.delete(name);
      if(name==='music'){this.syncMusic();if(this.ac)this.ac.suspend().catch(()=>{})}
      else this.players.get(name)?.pause();
      this.notify();
    }
    syncSession(){
      // Keep the authorized playback category over app switches; release it on mute.
      this.configureSession(Object.values(this.enabled).some(Boolean));
    }
    setVolume(percent){this.volume=percent/100*.5;const rain=this.players.get('rain');if(rain)rain.volume=this.volume}
    resume(){
      if(this.hidden)return;
      this.syncSession();
      const jobs=[];
      for(const name of Object.keys(this.enabled))if(this.enabled[name]){
        if(name==='music')this.startMusicPlayback();else jobs.push(this.startRecording(name));
      }
      return Promise.all(jobs);
    }
    syncMusic(){
      if(!this.ac)return;
      const active=!this.hidden&&this.enabled.music&&this.ac.state==='running';
      this.gains.music.gain.setTargetAtTime(active?.07:0,this.ac.currentTime,.65);
      if(active){this.blocked.delete('music');this.startMusic()}else{clearTimeout(this.musicTimer);this.musicTimer=null}
      this.notify();
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
    visibility(hidden){
      const returning=this.hidden&&!hidden;this.hidden=hidden;clearTimeout(this.returnTimer);
      if(hidden){for(const name of Object.keys(this.enabled))this.stop(name);return Promise.resolve()}
      const result=this.resume();
      // WebKit may deliver pageshow/visibilitychange before its media session is ready.
      // One bounded retry handles that transition without an endless autoplay loop.
      if(returning)this.returnTimer=setTimeout(()=>{if(!this.hidden&&this.needsResume)this.resume()},450);
      return result;
    }
  }
  globalThis.PondAudio=PondAudio;
})();
