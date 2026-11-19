/* Real Three.js geometry, raycasting, and scene code; only GPU/browser APIs are adapted. */
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const Life=require('../../dist/claw/claw-life.js');
const root=path.resolve(__dirname,'../..');
const threeURL=pathToFileURL(path.join(root,'dist/claw/vendor/three.module.min.js')).href;
const dataURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
globalThis.ClawLife=Life;
const physicsURL=dataURL(fs.readFileSync(path.join(root,'dist/claw/claw-physics.js'),'utf8')
  .replace(/(['"])\.\/vendor\/rapier\.mjs(?:\?[^'"]*)?\1/g,JSON.stringify(pathToFileURL(path.join(root,'dist/claw/vendor/rapier.mjs')).href)));
const rendererURL=dataURL(`
  export * from ${JSON.stringify(threeURL)};
  export class WebGLRenderer {
    constructor(){
      this.shadowMap={autoUpdate:true,needsUpdate:false};this.renderCalls=0;this.shadowUpdates=0;
      this.width=1;this.height=1;this.listeners=new Map();
      this.domElement={style:{},setAttribute(){},setPointerCapture(){},hasPointerCapture(){return false;},
        addEventListener:(type,callback)=>this.listeners.set(type,callback),
        getBoundingClientRect:()=>({left:0,top:0,width:this.width,height:this.height})};
    }
    setPixelRatio(value){this.pixelRatio=value;}
    setSize(width,height){this.width=width;this.height=height;}
    render(scene,camera){
      scene.updateMatrixWorld();camera.updateMatrixWorld();this.renderCalls++;
      if(this.shadowMap.autoUpdate||this.shadowMap.needsUpdate)this.shadowUpdates++;
      this.shadowMap.needsUpdate=false;
    }
  }
  export class PMREMGenerator {
    fromScene(){return {texture:{},dispose(){}};}
    dispose(){}
  }
`);
const modules=new Map();

async function setupScene({mobile=false,unbatched=false}={}){
  const key=JSON.stringify({mobile,unbatched});
  if(!modules.has(key)){
    const browser=`
      export const testClock={now:0};
      const performance={now:()=>testClock.now},devicePixelRatio=1;
      const ClawLife=${JSON.stringify({durations:Life.durations})};
      const matchMedia=()=>({matches:${mobile}});
      const ResizeObserver=class{observe(){}};
      const CustomEvent=class{constructor(type,options={}){this.type=type;this.detail=options.detail;}};
      const document={body:{classList:{contains:()=>false}},createElement:()=>{
        const canvas={width:0,height:0};
        canvas.getContext=()=>({fillRect(){},fillText(text){canvas.text=text;},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},
          createRadialGradient:()=>({addColorStop(){}})});return canvas;
      }};
    `;
    let source=fs.readFileSync(path.join(root,'dist/claw/claw-scene.js'),'utf8')
      .replace(/(['"])\.\/vendor\/three\.module\.min\.js(?:\?[^'"]*)?\1/g,JSON.stringify(rendererURL))
      .replace(/(['"])\.\/claw-physics\.js(?:\?[^'"]*)?\1/g,JSON.stringify(physicsURL));
    // A control builds identical authored geometry while bypassing only the batch pass.
    if(unbatched)source=source.replace('function batchOpaque(root,exclude=new Set()){','function batchOpaque(root,exclude=new Set()){return;');
    modules.set(key,import(dataURL(browser+source+'\nexport {batchOpaque,plush};')));
  }
  const [{ClawScene,testClock,batchOpaque,plush},THREE]=await Promise.all([modules.get(key),import(threeURL)]);
  const host={clientWidth:1440,clientHeight:900,children:[],dataset:{},listeners:new Map(),events:[],
    appendChild(child){this.children.push(child);},addEventListener(type,callback){this.listeners.set(type,callback);},
    dispatchEvent(event){this.events.push(event);}};
  const scene=new ClawScene(host);
  const draw=(state,options={},dt=1000/60)=>{testClock.now+=dt;scene.draw(state,{clock:testClock.now/1000,...options});};
  return {scene,host,THREE,draw,batchOpaque,plush,clock:testClock,contextRestored:()=>scene.renderer.listeners.get('webglcontextrestored')()};
}

function stats(root){
  const result={meshes:0,triangles:0,vertices:0,transparent:0,bufferBytes:0},geometries=new Set();
  root.traverse(n=>{if(!n.isMesh)return;const count=n.isInstancedMesh?n.count:1;result.meshes++;
    result.triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3*count;
    result.vertices+=n.geometry.attributes.position.count*count;if(n.material.transparent)result.transparent++;
    geometries.add(n.geometry);if(n.isInstancedMesh)result.bufferBytes+=n.instanceMatrix.array.byteLength;
  });
  for(const g of geometries){for(const attribute of Object.values(g.attributes))result.bufferBytes+=attribute.array.byteLength;result.bufferBytes+=g.index?.array.byteLength??0;}
  return result;
}

module.exports={setupScene,stats,Life};
