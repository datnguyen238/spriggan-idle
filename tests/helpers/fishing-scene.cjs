/* Real Three.js geometry and scene code; a CPU renderer replaces the browser GPU. */
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const Life=require('../../dist/fishing/fishing-life.js');
const root=path.resolve(__dirname,'../..');
const threeURL=pathToFileURL(path.join(root,'dist/claw/vendor/three.module.min.js')).href;
const dataURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const modelURL=dataURL(fs.readFileSync(path.join(root,'dist/fishing/fish-model.js'),'utf8')
  .replace(/(['"])\.\.\/claw\/vendor\/three\.module\.min\.js(?:\?v=perf-[a-f0-9]{16})?\1/,JSON.stringify(threeURL)));
const source=fs.readFileSync(path.join(root,'dist/fishing/fishing-scene.js'),'utf8');
const modules=new Map();
const rendererURL=dataURL(`
  export * from ${JSON.stringify(threeURL)};
  export class WebGLRenderer {
    constructor(){
      this.shadowMap={};this.renderCalls=0;this.width=1;this.height=1;
      this.domElement={style:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){},
        getBoundingClientRect:()=>({left:0,top:0,width:this.width,height:this.height})};
    }
    setPixelRatio(value){this.pixelRatio=value;}
    setSize(width,height){this.width=width;this.height=height;}
    render(scene,camera){scene.updateMatrixWorld();camera.updateMatrixWorld();this.renderCalls++;}
    dispose(){this.disposed=true;}
  }
`);

async function setupScene(width=1440,height=900){
  if(!modules.has(width)){
    // The lexical adapters keep browser globals isolated from other Node tests.
    const browser=`
      const innerWidth=${width};
      const window={devicePixelRatio:1,FishingLife:{SPECIES:${JSON.stringify(Life.SPECIES)}}};
      const ResizeObserver=class{observe(){}disconnect(){}};
      const CustomEvent=class{constructor(type,options={}){this.type=type;this.detail=options.detail;}};
    `;
    const code=browser+source.replace(/(['"])\.\.\/claw\/vendor\/three\.module\.min\.js(?:\?v=perf-[a-f0-9]{16})?\1/,JSON.stringify(rendererURL))
      .replace(/(['"])\.\/fish-model\.js(?:\?v=perf-[a-f0-9]{16})?\1/,JSON.stringify(modelURL));
    modules.set(width,import(dataURL(code)));
  }
  const [{FishingScene},THREE]=await Promise.all([modules.get(width),import(threeURL)]);
  const host={clientWidth:width,clientHeight:height,children:[],events:[],
    appendChild(child){this.children.push(child);},dispatchEvent(event){this.events.push(event);}};
  const scene=new FishingScene(host);
  return {scene,THREE,host,dispose:()=>scene.dispose()};
}

function pose(group){
  return {position:group.position.clone(),quaternion:group.quaternion.clone(),scale:group.scale.clone(),visible:group.visible};
}
function residents(scene){return scene.fishes.map(f=>f.group);}
function residentFor(scene,id){return residents(scene).find(group=>group.userData.species===id);}
function sessionFor(fish,overrides={}){
  return {phase:'idle',phaseTime:0,elapsed:0,progress:0,tension:0,nibble:0,struggling:false,fish,...overrides};
}
function tick(scene,session,dt=1/60,options={}){
  session.phaseTime+=dt;session.elapsed+=dt;scene.update(session,dt,options);
}
function advance(scene,session,seconds,options={},inspect){
  for(let elapsed=0;elapsed<seconds-1e-8;elapsed+=1/60){tick(scene,session,1/60,options);if(inspect)inspect();}
}

module.exports={setupScene,pose,residents,residentFor,sessionFor,tick,advance};
