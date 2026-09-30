/* Two authorized native players overlap the baked 1.2-second rain fades.
   Baked fades also work on iOS, where script volume changes may be ignored. */
(()=>{
  class PondRainLoop{
    constructor(){
      this.tracks=[new Audio(),new Audio()];this.active=0;this.listeners={};this.timer=null;this.generation=0;this.stopped=true;this.primed=false;this.switching=false;this.overlap=1.2;
      for(const [index,track] of this.tracks.entries()){
        track.loop=false;
        track.addEventListener('playing',()=>{if(this.stopped){track.pause();return}if(index===this.active)this.emit('playing')});
        track.addEventListener('waiting',()=>{if(index===this.active&&!this.stopped)this.emit('waiting')});
        track.addEventListener('pause',()=>{if(index===this.active&&!this.stopped&&!this.switching){this.stopped=true;this.stopClock();this.emit('pause')}});
        track.addEventListener('error',()=>{if(!this.stopped)this.emit('error')});
        track.addEventListener('timeupdate',()=>this.tick());track.addEventListener('ended',()=>this.tick());
      }
    }
    set src(value){for(const t of this.tracks)t.src=value}
    set preload(value){for(const t of this.tracks)t.preload=value}
    set volume(value){for(const t of this.tracks)t.volume=value}
    get volume(){return this.tracks[0].volume}
    set loop(value){} // The overlap scheduler replaces native end-of-file looping.
    get paused(){return this.stopped||this.tracks[this.active].paused}
    get ended(){return this.stopped&&this.tracks[this.active].ended}
    get readyState(){return this.tracks[this.active].readyState}
    get currentTime(){return this.tracks[this.active].currentTime}
    setAttribute(name,value){for(const t of this.tracks)t.setAttribute(name,value)}
    addEventListener(name,fn){(this.listeners[name]||=[]).push(fn)}
    emit(name){for(const fn of this.listeners[name]||[])fn()}
    stopClock(){clearInterval(this.timer);this.timer=null}
    play(){
      if(!this.paused)return Promise.resolve();
      const generation=++this.generation;this.stopped=false;
      const current=this.tracks[this.active],standby=this.tracks[1-this.active];
      // Resume from the beginning if the app left during the outgoing fade.
      if(current.ended||current.currentTime>=current.duration-this.overlap)current.currentTime=0;
      let priming=Promise.resolve();
      // Both play calls occur in the original tap, authorizing both native players.
      if(!this.primed){
        standby.muted=true;
        priming=Promise.resolve(standby.play()).then(()=>{if(generation!==this.generation)return;standby.pause();standby.currentTime=0;standby.muted=false;this.primed=true});
      }
      const playing=current.play();
      return Promise.all([playing,priming]).then(()=>{
        if(this.stopped||generation!==this.generation)return;
        this.stopClock();this.timer=setInterval(()=>this.tick(),40);this.emit('playing');
      }).catch(error=>{if(generation===this.generation)this.pause();throw error});
    }
    tick(){
      if(this.stopped||this.switching||!this.primed)return;
      const outgoing=this.tracks[this.active],start=outgoing.duration-this.overlap;
      if(!Number.isFinite(start)||start<=0||outgoing.currentTime<start)return;
      const next=1-this.active,incoming=this.tracks[next],generation=this.generation;
      this.switching=true;incoming.currentTime=Math.max(0,outgoing.currentTime-start);incoming.muted=false;
      Promise.resolve(incoming.play()).then(()=>{
        if(this.stopped||generation!==this.generation)return;
        this.active=next;this.emit('playing');
      }).catch(()=>{if(generation===this.generation){this.pause();this.emit('error')}}).finally(()=>{if(generation===this.generation)this.switching=false});
    }
    pause(){
      this.stopped=true;this.generation++;this.switching=false;this.stopClock();
      for(const track of this.tracks)track.pause();this.emit('pause');
    }
  }
  globalThis.PondRainLoop=PondRainLoop;
})();
