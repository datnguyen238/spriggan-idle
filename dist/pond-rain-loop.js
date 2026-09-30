/* One decoded rain buffer loops on the audio engine, without JS/media handoffs. */
(()=>{
  class PondRainLoop{
    constructor(){
      this.listeners={};this.context=null;this.gain=null;this.source=null;this.buffer=null;this.loading=null;
      this.wanted=false;this.generation=0;this.level=.2;this.url='';
    }
    set src(value){this.url=value}
    set preload(value){}
    set loop(value){}
    setAttribute(){}
    set volume(value){this.level=value;if(this.gain)this.gain.gain.setTargetAtTime(value,this.context.currentTime,.05)}
    get volume(){return this.level}
    get paused(){return !this.wanted||!this.source||this.context?.state!=='running'}
    get ended(){return false}
    get readyState(){return this.buffer?4:0}
    get currentTime(){return this.context&&this.buffer?this.context.currentTime%this.buffer.duration:0}
    addEventListener(name,fn){(this.listeners[name]||=[]).push(fn)}
    emit(name){for(const fn of this.listeners[name]||[])fn()}
    init(){
      if(this.context&&this.context.state!=='closed')return;
      const AC=window.AudioContext||window.webkitAudioContext;
      this.context=new AC();this.gain=this.context.createGain();this.gain.gain.value=this.level;this.gain.connect(this.context.destination);
      const context=this.context;
      context.onstatechange=()=>{
        if(context!==this.context||!this.wanted)return;
        if(context.state==='running'&&this.source)this.emit('playing');
        else if(context.state!=='running')this.emit('pause');
      };
    }
    play(){
      this.wanted=true;const generation=++this.generation;
      this.init();const context=this.context;
      // Resume inside the user's gesture; do not wait on a possibly blocked promise.
      context.resume().then(()=>{if(context===this.context&&this.wanted&&this.source&&context.state==='running')this.emit('playing')}).catch(()=>{if(context===this.context&&this.wanted)this.emit('pause')});
      if(!this.loading&&!this.buffer){
        const url=this.url;
        this.loading=fetch(url).then(response=>{if(!response.ok)throw Error('Rain could not load');return response.arrayBuffer()})
          .then(bytes=>context.decodeAudioData(bytes)).then(buffer=>{this.buffer=buffer}).finally(()=>{this.loading=null});
      }
      return Promise.resolve(this.loading).then(()=>{
        if(!this.wanted||generation!==this.generation||context!==this.context)return;
        if(!this.source){
          this.source=context.createBufferSource();this.source.buffer=this.buffer;this.source.loop=true;
          this.source.loopStart=0;this.source.loopEnd=this.buffer.duration;this.source.connect(this.gain);this.source.start();
        }
        this.emit(context.state==='running'?'playing':'pause');
      });
    }
    pause(){
      this.wanted=false;this.generation++;
      if(this.source){this.source.stop();this.source.disconnect();this.source=null}
      // Retain decoded PCM, but discard Safari's interrupted playback context.
      // Reopening builds a fresh context instead of trusting a stale running state.
      const context=this.context;this.context=null;this.gain=null;
      if(context){context.onstatechange=null;context.close().catch(()=>{})}
      this.emit('pause');
    }
  }
  globalThis.PondRainLoop=PondRainLoop;
})();
