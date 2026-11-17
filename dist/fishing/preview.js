import { FishingScene } from './fishing-scene.js?v=fish-approach-1';

// Render the game scenery without loading its controls, audio, timer, or saves.
const host=document.querySelector('#map-preview');
const idle={phase:'idle',phaseTime:0,elapsed:0,progress:0,tension:0,nibble:0};
let scene=null,observer=null,state='';

function report(next) {
  if(state===next)return;
  state=next;
  if(window.parent!==window)window.parent.postMessage({type:'spriggan-fishing-preview',state},window.location.origin);
}

function paint() {
  if(!scene||scene.contextLost)return;
  try {
    scene.resize();
    scene.update(idle,0,{reducedMotion:true});
    report('ready');
  } catch {
    report('unavailable');
  }
}

function dispose() {
  observer?.disconnect();observer=null;
  const renderer=scene?.renderer;
  scene?.dispose();scene=null;
  renderer?.forceContextLoss?.();
  state='';
}

function open() {
  if(scene){paint();return;}
  try {
    scene=new FishingScene(host);
    // A still image can use retina resolution without a continuous render loop.
    scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    scene.aimAt({x:1,z:.3});
    paint();
    observer=new ResizeObserver(paint);observer.observe(host);
  } catch {
    dispose();report('unavailable');
  }
}

host.addEventListener('fishing-scene-lost',()=>report('unavailable'));
host.addEventListener('fishing-scene-restored',paint);
window.addEventListener('pagehide',dispose);
window.addEventListener('pageshow',event=>{if(event.persisted)open();});
open();
