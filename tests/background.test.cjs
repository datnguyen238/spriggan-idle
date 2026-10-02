const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/shared/background.js'),'utf8');
function setup(navigator={userAgent:'Desktop Chrome',platform:'MacIntel',maxTouchPoints:0}){
 let now=0,id=0;const callbacks=new Map(),events={};
 const on=(name,fn)=>(events[name]||=[]).push(fn);
 const sandbox={navigator,document:{hidden:false,addEventListener:on},window:{addEventListener:on},performance:{now:()=>now},setInterval:fn=>{callbacks.set(++id,fn);return id},clearInterval:id=>callbacks.delete(id)};
 vm.runInNewContext(source,sandbox);
 return{api:sandbox.SprigganRuntime,callbacks,setTime:t=>now=t,emit:name=>events[name]?.forEach(fn=>fn()),hide(hidden){sandbox.document.hidden=hidden;events.visibilitychange?.forEach(fn=>fn())},tick(){for(const fn of callbacks.values())fn()}};
}
test('desktop simulation advances hidden elapsed time in safe physics steps and catches the remainder on return',()=>{
 const app=setup(),steps=[];app.api.runBackground(dt=>steps.push(dt));app.hide(true);app.setTime(1000);app.tick();
 assert(Math.abs(steps.reduce((a,b)=>a+b,0)-1)<1e-8);assert(steps.every(dt=>dt<=.05));
 app.setTime(31000);app.tick();assert(Math.abs(steps.reduce((a,b)=>a+b,0)-31)<1e-7);
 app.setTime(31500);app.hide(false);assert(Math.abs(steps.reduce((a,b)=>a+b,0)-31.5)<1e-7);
 app.setTime(32500);app.tick();assert(Math.abs(steps.reduce((a,b)=>a+b,0)-31.5)<1e-7);
});
test('manual pause consumes background time without advancing the animals',()=>{
 const app=setup();let paused=true,total=0;app.api.runBackground(dt=>total+=dt,()=>{},()=>paused);app.hide(true);app.setTime(5000);app.tick();assert.equal(total,0);
 paused=false;app.setTime(6000);app.tick();assert(Math.abs(total-1)<1e-8);
});
test('phones and tablets do not start a background simulation, including iPad desktop user agents',()=>{
 for(const nav of [{userAgent:'Mozilla iPhone'},{userAgent:'Mozilla Android'},{userAgent:'Mozilla Macintosh',platform:'MacIntel',maxTouchPoints:5},{userAgent:'Other',userAgentData:{mobile:true}}]){
  const app=setup(nav);assert.equal(app.api.mobile,true);app.api.runBackground(()=>assert.fail('mobile background movement'));app.hide(true);app.setTime(10000);app.tick();assert.equal(app.callbacks.size,0);
 }
});
test('desktop touchscreens stay desktop and navigation stops work until pageshow',()=>{
 const app=setup({userAgent:'Windows NT',platform:'Win32',maxTouchPoints:10});assert.equal(app.api.mobile,false);let total=0;
 app.api.runBackground(dt=>total+=dt);app.hide(true);app.emit('pagehide');assert.equal(app.callbacks.size,0);app.setTime(5000);app.tick();assert.equal(total,0);
 app.emit('pageshow');app.setTime(6000);app.tick();assert(Math.abs(total-1)<1e-8);assert.equal(app.callbacks.size,1);app.emit('pageshow');assert.equal(app.callbacks.size,1);
});
test('recovery after long OS suspension is bounded instead of blocking the UI',()=>{
 const app=setup();let total=0;app.api.runBackground(dt=>total+=dt);app.hide(true);app.setTime(3600000);app.tick();assert(Math.abs(total-120)<1e-6);
});
