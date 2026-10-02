/* Desktop background simulation; phones/tablets retain their pause-on-hide behavior. */
(()=>{
 'use strict';
 const nav=globalThis.navigator||{};
 const mobile=nav.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent||'')||(/Mac/i.test(nav.platform||nav.userAgent||'')&&nav.maxTouchPoints>1);
 function runBackground(step,afterTick=()=>{},isPaused=()=>false){
  if(mobile)return;
  let hiddenAt=document.hidden?performance.now():null,timer=null,active=true;
  function advance(now){
   if(hiddenAt===null)return;
   // Small physics steps handle throttled timers. Bound recovery after OS sleep/discard.
   let seconds=Math.min(120,Math.max(0,(now-hiddenAt)/1000));hiddenAt=now;
   if(step&&!isPaused())while(seconds>0){const dt=Math.min(.05,seconds);step(dt);seconds-=dt}
   afterTick();
  }
  function start(){if(timer===null)timer=setInterval(()=>{if(active&&document.hidden)advance(performance.now())},250)}
  document.addEventListener('visibilitychange',()=>{
   if(!active)return;
   const now=performance.now();
   if(document.hidden){if(hiddenAt===null)hiddenAt=now}
   else{advance(now);hiddenAt=null}
  });
  window.addEventListener('pagehide',()=>{active=false;hiddenAt=null;clearInterval(timer);timer=null});
  window.addEventListener('pageshow',()=>{active=true;hiddenAt=document.hidden?performance.now():null;start()});
  start();
 }
 globalThis.SprigganRuntime={mobile,runBackground};
})();
