/* Run the shipped canvas worlds with real rules/art and a recording Canvas 2D surface. */
const fs=require('node:fs'),vm=require('node:vm');
const clone=value=>JSON.parse(JSON.stringify(value));
const identity=()=>[1,0,0,1,0,0];
function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
function surface(name,canvases){
 const canvas={name,width:300,height:150,pixels:[]},calls=[];
 let path=[],stack=[],state;
 function reset(){state={transform:identity(),fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1,lineCap:'butt',lineJoin:'miter',globalAlpha:1,filter:'none',imageSmoothingEnabled:true};path=[];stack=[];canvas.pixels=[]}
 const target={calls,reset,
  beginPath(){path=[]},
  save(){stack.push(clone(state))},restore(){if(stack.length)state=stack.pop()},
  setTransform(...args){state.transform=args},translate(x,y){state.transform=multiply(state.transform,[1,0,0,1,x,y])},scale(x,y){state.transform=multiply(state.transform,[x,0,0,y,0,0])},rotate(a){state.transform=multiply(state.transform,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0])},
  setLineDash(values){state.lineDash=values},
  clearRect(...args){calls.push({op:'clearRect',args});canvas.pixels=[]},
  drawImage(image,...args){calls.push({op:'drawImage',name:image.name,args,transform:[...state.transform]});canvas.pixels.push(...clone(image.pixels))},
  createLinearGradient(...args){return gradient('linear',args)},createRadialGradient(...args){return gradient('radial',args)},
 };
 function gradient(kind,args){return{kind,args,stops:[],addColorStop(...stop){this.stops.push(stop)}}}
 for(const op of ['moveTo','lineTo','closePath','ellipse','quadraticCurveTo','bezierCurveTo'])target[op]=(...args)=>{calls.push({op,args});path.push({op,args,transform:[...state.transform]})};
 for(const op of ['fill','stroke','fillRect','fillText'])target[op]=(...args)=>{const paint=clone({op,args,path:['fill','stroke'].includes(op)?path:undefined,state});calls.push(paint);canvas.pixels.push(paint)};
 const context=new Proxy(target,{get:(o,k)=>k in o?o[k]:state[k],set:(o,k,v)=>{state[k]=v;return true}});
 for(const key of ['width','height']){let value=canvas[key];Object.defineProperty(canvas,key,{get:()=>value,set:v=>{value=v;reset()}})}
 canvas.getContext=()=>context;reset();canvases.push(canvas);return{canvas,context};
}
function setupWorld(kind,{width=1200,height=800,dpr=1,reduced=false,source}={}){
 const canvases=[],elements=new Map(),listeners=new Map(),observers=[],frames=[],storage=new Map();let monotonic=0,wall=1800000000000,writes=0;
 const {canvas,context}=surface('scene',canvases),box={left:0,top:0,width,height};
 function element(selector){
  if(elements.has(selector))return elements.get(selector);
  const values={textContent:'',value:'',disabled:false,hidden:false},attributes={};
  const e={selector,style:{},dataset:{},attributes,children:[],inert:false,
   setAttribute(k,v){attributes[k]=String(v)},getAttribute:k=>attributes[k]??null,
   addEventListener(type,fn){listeners.set(`${selector}:${type}`,fn)},
   querySelector:s=>element(`${selector} ${s}`),querySelectorAll:()=>[],contains:()=>false,
   replaceChildren(...items){this.children=items},add(item){this.children.push(item)},focus(){},click(){this.onclick?.()},
   classList:{toggle(){},contains:()=>false},setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){},
   getBoundingClientRect:()=>({...box}),
  };
  for(const key of Object.keys(values))Object.defineProperty(e,key,{get:()=>values[key],set:v=>{writes++;values[key]=key==='textContent'||key==='value'?String(v):v}});
  elements.set(selector,e);return e;
 }
 const scene=element(kind==='hex'?'#meadow':'#farm');Object.assign(canvas,scene);elements.set(scene.selector,canvas);
 const document={hidden:false,body:element('body'),querySelector:element,querySelectorAll:()=>[],addEventListener:(type,fn)=>{const key=`document:${type}`;listeners.set(key,[...(listeners.get(key)||[]),fn])},createElement:tag=>tag==='canvas'?surface(`cache-${canvases.length}`,canvases).canvas:element(`created-${elements.size}`)};
 const Runtime={mobile:false,runBackground(step,after,paused){this.background={step,after,paused}}};
 const ctx={document,devicePixelRatio:dpr,performance:{now:()=>monotonic},Date:class extends Date{static now(){return wall}},Math:Object.create(Math),console,
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},
  requestAnimationFrame:fn=>{frames.push(fn)},ResizeObserver:class{constructor(fn){this.fn=fn;observers.push(this)}observe(){}},matchMedia:()=>({matches:reduced}),
  SprigganRuntime:Runtime,
  FarmAudio:class{constructor(notify){this.notify=()=>notify({enabled:false,volume:.2,needsResume:false,playing:false})}visibility(){}},
  MapRain:class{constructor(){this.enabled=false}draw(c,w,h,time){c.fillStyle=`rain:${time}`;c.fillRect(0,0,w,h)}},
  Option:class{constructor(text,value){this.text=text;this.value=value}},confirm:()=>true,
 };
 // Seed animation phases/IDs and life-rule randomness to make command comparisons repeatable.
 let seed=19;ctx.Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 ctx.window=ctx;ctx.addEventListener=(type,fn)=>{const key=`window:${type}`;listeners.set(key,[...(listeners.get(key)||[]),fn])};
 const exports=kind==='hex'?'render,frame,resize,ui,invite,project,vertices,tile,tiles,note,':'draw,frame,resize,ui,tick,update,scatter,inspect,';
 const inspect=`globalThis.world={${exports}get state(){return state},get paused(){return paused},set paused(value){paused=value},get rain(){return rain},get size(){return {W,H${kind==='hex'?',S,zoom,pan':',sceneTop,sceneBottom'}}},${kind==='hex'?'set view(value){zoom=value.zoom??zoom;pan=value.pan??pan},set night(value){night=value},':'set selected(value){selected=value},get clock(){return clock},'}get context(){return ctx}};`;
 const code=(source??fs.readFileSync(require.resolve(kind==='hex'?'../../dist/hex/hex.js':'../../dist/pixel/farm.js'),'utf8')).replace(/\}\)\(\);\s*$/,`${inspect}})();`);
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(require.resolve(kind==='hex'?'../../dist/hex/hex-life.js':'../../dist/pixel/farm-life.js'),'utf8'),ctx);
 if(kind==='hex')vm.runInContext(fs.readFileSync(require.resolve('../../dist/hex/hex-creatures.js'),'utf8'),ctx);
 vm.runInContext(code,ctx,{filename:`${kind}.js`});
 const world=ctx.world;
 return{world,ctx,canvas,context,canvases,box,element,Runtime,storage,
  writes:()=>writes,reset(){for(const c of canvases)c.getContext('2d').calls.length=0;canvas.pixels=[];writes=0},
  frame(ms=16.6667){monotonic+=ms;wall+=ms;frames.shift()(monotonic)},
  now(ms){monotonic=ms;wall=1800000000000+ms},
  dispatch(type,event={}){for(const fn of listeners.get(type)||[])fn(event)},
 };
}
module.exports={setupWorld};
