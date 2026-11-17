const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../dist/fishing/preview.js'),'utf8').replace(/^import[^\n]+\n/,'');

function preview({failBuild=false,failPaint=false}={}) {
  const listeners=new Map(),hostListeners=new Map(),messages=[],scenes=[],observers=[];
  const host={addEventListener(type,fn){hostListeners.set(type,fn);}};
  class FishingScene {
    constructor(node){
      if(failBuild)throw Error('WebGL unavailable');
      this.host=node;this.frames=[];this.resizes=0;this.renderer={setPixelRatio:value=>this.ratio=value,forceContextLoss:()=>this.contextReleased=true};scenes.push(this);
    }
    aimAt(point){this.target=point;}
    resize(){this.resizes++;}
    update(session,dt,options){if(failPaint)throw Error('Drawing failed');this.frames.push({session,dt,options});}
    dispose(){this.disposed=true;}
  }
  class ResizeObserver {
    constructor(fn){this.fn=fn;observers.push(this);}
    observe(node){this.host=node;}
    disconnect(){this.disconnected=true;}
  }
  const window={devicePixelRatio:3,location:{origin:'https://spriggan.test'},
    parent:{postMessage:(data,origin)=>messages.push({data,origin})},
    addEventListener(type,fn){listeners.set(type,fn);}};
  // These APIs intentionally do not exist: a preview must not run a game loop,
  // play audio, or touch browser saves.
  vm.runInNewContext(source,{window,document:{querySelector:()=>host},FishingScene,ResizeObserver});
  return {scenes,observers,messages,fire:(type,event={})=>listeners.get(type)?.(event),
    hostEvent:type=>hostListeners.get(type)?.()};
}

test('the card preview draws only the real idle scenery at a bounded retina resolution',()=>{
  const p=preview(),scene=p.scenes[0];
  assert.equal(p.scenes.length,1);assert.equal(scene.ratio,2);assert.equal(scene.frames.length,1);
  assert.equal(scene.frames[0].session.phase,'idle');assert.equal(scene.frames[0].dt,0);
  assert.equal(scene.frames[0].options.reducedMotion,true);
  assert.equal(p.messages[0].data.type,'spriggan-fishing-preview');assert.equal(p.messages[0].data.state,'ready');
  assert.equal(p.messages[0].origin,'https://spriggan.test');
});

test('resizing redraws the still preview without creating another scene or repeating readiness messages',()=>{
  const p=preview();p.observers[0].fn();p.observers[0].fn();
  assert.equal(p.scenes.length,1);assert.equal(p.scenes[0].frames.length,3);assert.equal(p.messages.length,1);
});

test('closing an ordinary preview releases the scene and resize observer',()=>{
  const p=preview();p.fire('pagehide',{persisted:false});
  assert.equal(p.scenes[0].disposed,true);assert.equal(p.observers[0].disconnected,true);
  assert.equal(p.scenes[0].contextReleased,true);
  p.observers[0].fn();assert.equal(p.scenes[0].frames.length,1);
});

test('a cached back navigation releases the old graphics context and recreates the preview on return',()=>{
  const p=preview();p.fire('pagehide',{persisted:true});
  assert.equal(p.scenes[0].disposed,true);assert.equal(p.scenes[0].contextReleased,true);
  p.fire('pageshow',{persisted:true});
  assert.equal(p.scenes.length,2);assert.equal(p.scenes[1].frames.length,1);
  assert.equal(p.messages.at(-1).data.state,'ready');
});

test('WebGL construction or drawing failure reports a usable fallback state',()=>{
  for(const options of [{failBuild:true},{failPaint:true}]){
    const p=preview(options);assert.equal(p.messages.at(-1).data.state,'unavailable');
    assert(!p.messages.some(message=>message.data.state==='ready'));
  }
});

test('a lost graphics context reports failure and redraws after restoration',()=>{
  const p=preview();p.scenes[0].contextLost=true;p.hostEvent('fishing-scene-lost');
  assert.equal(p.messages.at(-1).data.state,'unavailable');p.observers[0].fn();
  assert.equal(p.scenes[0].frames.length,1);
  p.scenes[0].contextLost=false;p.hostEvent('fishing-scene-restored');
  assert.equal(p.messages.at(-1).data.state,'ready');assert.equal(p.scenes[0].frames.length,2);
});
