/* Shared rain controls and artwork; both maps reuse the pond's seamless audio file. */
(()=>{'use strict';
 const rainURL=new URL('../pond/rain-seamless.wav',document.currentScript.src).href;
 const fract=n=>n-Math.floor(n),random=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
 class MapRain{
  constructor(root,key,style){
   this.root=root;this.key=key;this.style=style;this.enabled=false;this.volume=.2;this.player=null;this.hidden=false;this.pending=false;this.request=0;
   this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   try{const saved=JSON.parse(localStorage.getItem(key));this.enabled=saved?.enabled===true;if(Number.isFinite(saved?.volume))this.volume=Math.max(0,Math.min(1,saved.volume))}catch{}
   this.button=root.querySelector('[data-rain-toggle]');this.slider=root.querySelector('[data-rain-volume]');this.output=root.querySelector('output');this.resume=root.querySelector('[data-rain-resume]');this.status=root.querySelector('[data-rain-status]');
   this.button.onclick=()=>this.toggle();this.resume.onclick=()=>this.play();
   this.slider.oninput=()=>{this.volume=Number(this.slider.value)/100;if(this.player)this.player.volume=this.volume;this.save();this.sync()};
   document.addEventListener('visibilitychange',()=>this.visibility(document.hidden&&SprigganRuntime.mobile));
   window.addEventListener('pagehide',()=>this.visibility(true));window.addEventListener('pageshow',()=>this.visibility(document.hidden&&SprigganRuntime.mobile));
   const recover=()=>{if(this.enabled&&!this.hidden&&!this.pending&&(!this.player||this.player.paused))this.play()};
   document.addEventListener('pointerdown',event=>{if(!root.contains(event.target))recover()},{passive:true});
   document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!root.contains(event.target))recover()});
   this.sync();
  }
  save(){try{localStorage.setItem(this.key,JSON.stringify({enabled:this.enabled,volume:this.volume}))}catch{}}
  sync(){
   this.button.setAttribute('aria-pressed',String(this.enabled));this.button.querySelector('span').textContent=this.enabled?'Remove rain':'Add rain';
   this.slider.value=String(Math.round(this.volume*100));this.output.textContent=`${Math.round(this.volume*100)}%`;
   const blocked=this.enabled&&!this.hidden&&!this.pending&&(!this.player||this.player.paused);
   this.resume.hidden=!blocked;this.status.textContent=this.pending?'Loading rain…':blocked?'Tap Resume rain to play the sound.':'';
  }
  toggle(){this.enabled=!this.enabled;this.save();if(this.enabled)this.play();else{this.request++;this.pending=false;this.player?.pause();this.sync()}}
  async play(){
   if(!this.enabled||this.hidden||this.pending)return;
   const request=++this.request;this.pending=true;this.sync();
   try{
    try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch{}
    if(!this.player){this.player=new PondRainLoop();this.player.src=rainURL;this.player.volume=this.volume;this.player.addEventListener('playing',()=>this.sync());this.player.addEventListener('pause',()=>this.sync())}
    await this.player.play();
   }catch{/* Keep visual rain; expose a user-gesture retry for blocked/unavailable audio. */}
   finally{if(request===this.request){this.pending=false;this.sync()}}
  }
  visibility(hidden){
   const wasHidden=this.hidden;this.hidden=hidden;
   if(hidden){this.request++;this.pending=false;this.player?.pause()}
   else if(wasHidden&&this.enabled&&this.player)this.play();
   this.sync();
  }
  draw(ctx,w,h,time,{top=0,bottom=h,night=false,splashes=[]}={}){
   if(!this.enabled)return;
   const pixel=this.style==='pixel';ctx.save();ctx.fillStyle=night?'#10233818':'#29495a15';ctx.fillRect(0,top,w,bottom-top);
   if(!this.reduced){
    const count=Math.min(pixel?95:180,Math.round(w*(pixel?.48:.14)+35)),height=bottom-top;
    ctx.strokeStyle=night?'#b5d3e15c':'#edf6e66b';ctx.lineWidth=.8;ctx.lineCap='round';
    for(let i=0;i<count;i++){
     const depth=.55+random(i+91)*.65,travel=time*(pixel?65:220)*depth;
     const y=top+fract(random(i+5)+travel/height)*height;
     const x=fract(random(i+61)-(y-top)/height*.07-time*.008)*w,len=(pixel?3:9)*depth;
     if(pixel){ctx.fillStyle=i%3?'#d2e5d36b':'#edf4d787';ctx.fillRect(Math.round(x),Math.round(y),1,Math.ceil(len));ctx.fillRect(Math.round(x)-1,Math.round(y+len),1,1)}
     else{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2*depth,y+len);ctx.stroke()}
    }
    for(let i=0;i<splashes.length;i++){
     const p=splashes[i],phase=fract(time*.8+random(i+210));if(phase>.65)continue;
     ctx.globalAlpha=(1-phase/.65)*.32;
     if(pixel){ctx.fillStyle='#e3ecd3';ctx.fillRect(Math.round(p.x)-2,Math.round(p.y),1,1);ctx.fillRect(Math.round(p.x)+2,Math.round(p.y),1,1)}
     else{ctx.beginPath();ctx.ellipse(p.x,p.y,1+phase*7,.5+phase*2.5,0,0,Math.PI*2);ctx.strokeStyle='#d4e9dc';ctx.stroke()}
    }
   }
   ctx.restore();
  }
 }
 globalThis.MapRain=MapRain;
})();
