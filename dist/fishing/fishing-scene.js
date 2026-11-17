import * as THREE from '../claw/vendor/three.module.min.js';
import { createRiverFish } from './fish-model.js';

// A continuous woodland river. Y is up; the old timber dock sits on its west bank.
const PI = Math.PI;
const WATER_Y = 0.12;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FISH_CAST_PHASES=new Set(['casting','waiting','bite','reeling']);
const FISH_PATH_MODES=new Set(['approach','dive','return','lift']);
const FISH_ENGAGED_MODES=new Set(['approach','dive','attend','attached']);
const FISH_RELEASE_MODES=new Set(['approach','dive','attend','attached','lift','held']);
const FISH_DISPLAY_MODES=new Set(['lift','held']);

function rng(seed = 1803) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function roundedShape(points) {
  const shape = new THREE.Shape();
  const last = points[points.length - 1];
  shape.moveTo((last[0] + points[0][0]) / 2, -(last[1] + points[0][1]) / 2);
  points.forEach((p, i) => {
    const n = points[(i + 1) % points.length];
    shape.quadraticCurveTo(p[0], -p[1], (p[0] + n[0]) / 2, -(p[1] + n[1]) / 2);
  });
  shape.closePath();
  return shape;
}

function organicGeometry(points, depth, bevel = 0.12) {
  const geometry = new THREE.ExtrudeGeometry(roundedShape(points), {
    depth, bevelEnabled: bevel > 0, bevelSegments: 2,
    steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 4,
  });
  geometry.rotateX(-PI / 2);
  return geometry;
}

function leafGeometry(length = 0.6, width = 0.22, curl = 0.1) {
  const vertices = [], indices = [];
  const count = 9;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const w = Math.pow(Math.sin(t * PI), 0.8) * width;
    const y = t * length;
    const z = Math.sin(t * PI) * curl;
    vertices.push(-w, y, z, 0, y, z + Math.sin(t * PI) * width * 0.3, w, y, z);
    if (i < count) {
      const a = i * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4,
        a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Cross sections share their vertices along the entire river, so the terrain
// continues through the frame instead of ending at the edge of a little model.
function riverRibbon(section, steps = 220, start = -64, end = 64, colorAt) {
  const first = section(start), width = first.length;
  const positions = [], colors = [], indices = [];
  for (let i = 0; i <= steps; i++) {
    const z = mix(start, end, i / steps), row = section(z);
    row.forEach(([x,y], j) => {
      positions.push(x, y, z);
      if (colorAt) {
        const color = new THREE.Color(colorAt(j / (width - 1), z, x));
        colors.push(color.r, color.g, color.b);
      }
    });
    if (i < steps) for (let j = 0; j < width - 1; j++) {
      const a = i * width + j;
      if (first[1][0] > first[0][0]) indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
      else indices.push(a, a + 1, a + width, a + 1, a + width + 1, a + width);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colorAt) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class FishingScene {
  constructor(host) {
    this.host = host;
    this.rand = rng();
    this.time = 0;
    this.target = V(1.25, WATER_Y, 0.4);
    this.previousPhase = 'idle';
    this.materials = new Map();
    this.fishes = [];
    this.plants = [];
    this.ripples = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b8c9b3');
    this.scene.fog = new THREE.Fog('#b8c9b3', 37, 78);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, innerWidth < 720 ? 1.2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:manipulation;';
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 160);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.setupLights();
    this.buildRiver();
    this.buildBanks();
    this.buildDock();
    this.buildCharacter();
    this.buildFishingGear();
    this.buildFish();
    this.buildWaterDetails();
    this.buildOtter();
    this.buildRain();
    this.buildWaterOcclusion();
    this.batchStaticGeometry();
    this.bindEvents();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.update({ phase: 'idle', phaseTime: 0, elapsed: 0, progress: 0, tension: 0, nibble: 0 }, 0);
  }

  material(color, roughness = 0.85, extras = {}) {
    const key = `${color}-${roughness}-${JSON.stringify(extras)}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, ...extras }));
    return this.materials.get(key);
  }

  mesh(geometry, material, parent = this.world, shadow = true) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  ball(x, y, z, sx, sy, sz, color, parent = this.world, detail = 16) {
    const m = this.mesh(new THREE.SphereGeometry(1, detail, Math.max(4, Math.ceil(detail / 2))), typeof color === 'string' ? this.material(color) : color, parent);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  }

  box(x, y, z, sx, sy, sz, color, parent = this.world, bevel = 0.025) {
    const g = bevel ? organicGeometry([[-sx/2,-sz/2],[sx/2,-sz/2],[sx/2,sz/2],[-sx/2,sz/2]], sy - bevel * 2, bevel) : new THREE.BoxGeometry(sx, sy, sz);
    const m = this.mesh(g, typeof color === 'string' ? this.material(color) : color, parent);
    m.position.set(x, y - (bevel ? sy / 2 - bevel : 0), z);
    return m;
  }

  stick(a, b, radius, color, parent = this.world, radius2 = radius) {
    const start = Array.isArray(a) ? V(...a) : a;
    const end = Array.isArray(b) ? V(...b) : b;
    const delta = end.clone().sub(start);
    const m = this.mesh(new THREE.CylinderGeometry(radius2, radius, delta.length(), 8), typeof color === 'string' ? this.material(color) : color, parent);
    m.position.copy(start).add(end).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize());
    return m;
  }

  tube(points, radius, color, parent = this.world, segments = 24) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => Array.isArray(p) ? V(...p) : p));
    return this.mesh(new THREE.TubeGeometry(curve, segments, radius, 5, false), typeof color === 'string' ? this.material(color) : color, parent);
  }

  ring(x, y, z, radius, color, parent = this.world, opacity = 0.6) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const m = this.mesh(new THREE.RingGeometry(radius * 0.96, radius, 48), mat, parent, false);
    m.rotation.x = -PI / 2;
    m.position.set(x, y, z);
    return m;
  }

  setupLights() {
    this.hemisphere = new THREE.HemisphereLight('#f9f3d9', '#6a8272', 2.15);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight('#fff0ca', 3.1);
    this.sun.position.set(-5, 11, 8);
    this.sun.castShadow = true;
    const shadowSize=typeof innerWidth!=='undefined'&&innerWidth<720?512:1536;
    this.sun.shadow.mapSize.set(shadowSize,shadowSize);
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 8, bottom: -8, near: 1, far: 30 });
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.0001;
    this.sun.shadow.radius = 5;
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight('#c6e6dc', 0.7);
    fill.position.set(8, 6, -9);
    this.scene.add(fill);
    this.floorMat = this.material('#b8c9b3');
  }

  riverEdges(z) {
    const bend=.65+1.25*Math.sin(z*.105)+.6*Math.sin(z*.21);
    const left=bend-4.3-.45*Math.sin(z*.17+.6)-.13*Math.sin(z*.92);
    const right=bend+4.7+.7*Math.sin(z*.14-1)+.18*Math.sin(z*.68+.5);
    return {left,right};
  }

  shoreWidth(z,side) {
    return side<0?.72+.16*Math.sin(z*.7):.85+1.1*Math.exp(-Math.pow((z-4)/4,2))+.18*Math.sin(z*.6);
  }

  riverBedSection(z) {
    const {left,right}=this.riverEdges(z),w=right-left;
    return [[left-.3,-.08],[left+w*.06,-.82],[left+w*.28,-.96],
      [left+w*.62,-.98],[right-w*.06,-.82],[right+.3,-.08]];
  }

  riverBedHeight(x,z) {
    const row=this.riverBedSection(z);
    for(let i=1;i<row.length;i++)if(x<=row[i][0])return mix(row[i-1][1],row[i][1],
      clamp((x-row[i-1][0])/(row[i][0]-row[i-1][0]),0,1));
    return row[row.length-1][1];
  }

  buildRiver() {
    const bed=this.mesh(riverRibbon(z=>this.riverBedSection(z),240,-64,64,(t,z)=>{
      if(t<.12||t>.9)return '#b3b68f';
      if(t<.3||t>.75)return z>1?'#91ac96':'#7d9f8d';
      return z<0?'#587f78':'#659487';
    }),this.material('#ffffff',.94,{vertexColors:true}));
    bed.castShadow=false;
    this.waterMat=this.material('#ffffff',.2,{vertexColors:true,transparent:true,opacity:.36,
      depthWrite:false,metalness:.07,side:THREE.DoubleSide});
    this.water=this.mesh(riverRibbon(z=>{
      const {left,right}=this.riverEdges(z);
      return [[left-.08,WATER_Y],[mix(left,right,.17),WATER_Y],
        [mix(left,right,.5),WATER_Y],[mix(left,right,.85),WATER_Y],[right+.08,WATER_Y]];
    },240,-64,64,(t,z)=>t===0||t===1?'#b7cfab':t<.3?'#90beaa':z<0?'#75ad9f':'#88baab'),this.waterMat,this.world,false);
    this.water.renderOrder=3;
    // The gravel belongs to the shallows. The clear, deeper channel stays open.
    const colors=['#aab49b','#c8c6a4','#9baa94','#c5b797','#8f9f90'];
    for(let i=0;i<260;i++) {
      const z=-22+this.rand()*47,side=i%2?-1:1,{left,right}=this.riverEdges(z);
      const distance=.06+Math.pow(this.rand(),1.8)*1.0;
      const x=(side<0?left:right)-side*distance;
      const size=.035+this.rand()*.09;
      const stone=this.ball(x,this.riverBedHeight(x,z)+size*.32,z,size*1.7,size*.5,size,colors[i%colors.length],this.world,7);
      stone.rotation.y=this.rand()*PI;stone.castShadow=false;
    }
  }

  stone(x,y,z,s=1,color='#b2b7a0',parent=this.world) {
    const m=this.ball(x,y,z,.34*s,.22*s,.28*s,color,parent,s>.8?10:7);
    m.rotation.set(this.rand()*.22,this.rand()*PI,this.rand()*.15);
    return m;
  }

  blade(x,y,z,length,angle,color='#758e55',parent=this.world,width=.065) {
    const m=this.mesh(leafGeometry(length,width,.08),this.material(color,.86,{side:THREE.DoubleSide}),parent);
    m.position.set(x,y,z);
    m.rotation.set(.1+this.rand()*.2,angle,(this.rand()-.5)*.5);
    return m;
  }

  grass(x,z,s=1,parent=this.world,y=.42,animate=false) {
    const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);
    for(let j=0;j<5;j++) this.blade((this.rand()-.5)*.12,0,(this.rand()-.5)*.12,(.25+this.rand()*.3)*s,j*1.8,['#6e8754','#90a56b','#a7b67e'][j%3],g,.035*s);
    if(animate)this.plants.push({group:g,phase:this.rand()*6,tilt:g.rotation.z});
    return g;
  }

  fern(x,y,z,s=1,rotation=0) {
    const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rotation;g.scale.setScalar(s);this.world.add(g);
    for(let f=0;f<5;f++) {
      const angle=(f-2)*.55;
      const tip=V(Math.sin(angle)*.62,.5+Math.cos(angle)*.18,Math.cos(angle)*.42);
      this.tube([[0,0,0],[tip.x*.5,.42,tip.z*.5],tip],.009,'#617b4e',g,12);
      for(let j=1;j<7;j++) {
        const t=j/7;
        const base=V(tip.x*t,Math.sin(t*PI/2)*tip.y,tip.z*t);
        for(const side of [-1,1]) {
          const l=this.blade(base.x,base.y,base.z,(.2*(1-t)+.05),angle+side*1.1,j%2?'#6e8b56':'#819b60',g,.048*(1-t)+.012);
          l.rotation.z=side*.9;
        }
      }
    }
    return g;
  }

  flower(x,y,z,s=1,color='#e7cf9a') {
    const g=new THREE.Group();g.position.set(x,y,z);this.world.add(g);
    this.stick([0,0,0],[.03,.32*s,0],.009*s,'#6d8759',g);
    for(let p=0;p<5;p++) {
      const a=p*PI*2/5;
      this.ball(Math.cos(a)*.055*s,.33*s+Math.sin(a)*.055*s,.01,.052*s,.04*s,.025*s,color,g,8);
    }
    this.ball(0,.33*s,.04,.03*s,.03*s,.023*s,'#c19a54',g,8);
  }

  buildBanks() {
    this.terrainMeshes=[];
    this.bankMat=this.material('#91a66d');
    for(const side of [-1,1]) {
      const wet=this.mesh(riverRibbon(z=>{
        const edge=this.riverEdges(z)[side<0?'left':'right'],w=this.shoreWidth(z,side);
        return [[edge-side*.12,-.09],[edge+side*.16,.16],[edge+side*w*.63,.3],[edge+side*w,.4]];
      },240,-64,64,(t,z)=>t<.4?'#a3b09a':z>0?'#c9c1a0':'#b8ba96'),this.material('#ffffff',.96,{vertexColors:true}));
      const land=this.mesh(riverRibbon(z=>{
        const edge=this.riverEdges(z)[side<0?'left':'right'],w=this.shoreWidth(z,side);
        return [[edge+side*w,.39],[edge+side*(w+.34),.49],
          [edge+side*(w+2),.57+.05*Math.sin(z*.8)],
          [edge+side*(w+6),.68+.16*Math.sin(z*.17)],
          [side*68,.7+.18*Math.sin(z*.14)]];
      },240,-64,64,(t,z)=>t<.1?'#a7b47c':t<.4?'#91a36d':z%8>2?'#879d68':'#819865'),this.material('#ffffff',.96,{vertexColors:true}));
      this.terrainMeshes.push(wet,land);
    }
    // A narrow, worn path follows the west bank and leads directly onto the dock.
    const path=this.mesh(riverRibbon(z=>{
      const edge=this.riverEdges(z).left;
      const center=edge-1.64-.26*Math.sin(z*.37);
      const width=.52+.07*Math.sin(z*.55);
      return [[center-width,.565],[center,.573],[center+width,.554]];
    },160,-42,42,(t,z)=>t===.5?'#c5b58b':'#b5aa80'),this.material('#ffffff',1,{vertexColors:true}));
    path.castShadow=false;
    this.terrainMeshes.push(path);
    // Irregular gravel shelves, small roots and sparse stones soften the waterline.
    const colors=['#a4ae98','#bcc0a5','#c8c0a1','#97a38c'];
    for(let i=0;i<135;i++) {
      const z=-15+this.rand()*31,side=i%2?-1:1,{left,right}=this.riverEdges(z);
      if(side<0&&z>-.25&&z<2)continue;
      const edge=side<0?left:right,w=this.shoreWidth(z,side);
      const distance=this.rand()*w;
      const scale=.16+Math.pow(this.rand(),2)*.66;
      this.stone(edge+side*distance,.14+distance/w*.25,z,scale,colors[i%4]);
    }
    // Shore grasses grow in drifts, leaving the path, dock and open play water clear.
    for(let i=0;i<72;i++) {
      const z=-14+this.rand()*30,side=i%3===0?1:-1,{left,right}=this.riverEdges(z);
      if(side<0&&z>-.4&&z<2.3)continue;
      const x=(side<0?left:right)+side*(this.shoreWidth(z,side)+.24+this.rand()*.65);
      this.grass(x,z,.6+this.rand()*.85,this.world,.5,i%11===0);
      if(i%9===0)this.flower(x+.15,.5,z,.65+this.rand()*.3,i%2?'#e4cc94':'#d5c2aa');
    }
    this.fern(-4.9,.5,-1.7,1.05,-.6);
    this.fern(-5.4,.5,3.5,1.2,.9);
    this.fern(6.2,.5,1.8,.95,-.8);
    this.fern(5.2,.5,-4.1,1.1,1.4);
    // Mature woodland frames the reach. The uneven crowns are branch-led leaf fans.
    [[-6.7,-5.9,1.65],[-6.8,-1.8,1.25],[-7.4,3.8,1.6],[-8.3,8.4,1.75],
      [-8.5,-11.5,1.55],[-8,-17,1.5],[6.2,-6.4,1.55],[7.8,-1.7,1.35],
      [8.3,4.4,1.8],[9.5,10.5,1.7],[4.9,-12,1.5],[5.5,-18,1.3],
      [-10.4,13.7,1.8],[11.4,17.5,2]].forEach(([x,z,scale],i)=>this.tree(x,z,scale,i));
    this.buildReeds(4.0,-2.3,.76);
    this.buildReeds(4.4,-1.1,.8);
    this.buildReeds(-3.05,3.4,.7);
    this.buildReeds(6.0,5.7,.9);
    // A fallen alder and exposed roots give the west bank a particular history.
    this.tube([[-5.1,.6,-3.8],[-4.77,.56,-3.25],[-4.34,.45,-2.74],[-3.97,.31,-2.2]],.16,'#887b5c',this.world,14);
    this.stick([-4.67,.56,-3.13],[-4.3,.76,-3.45],.065,'#8e805d',this.world,.025);
    this.stick([-4.34,.45,-2.74],[-4.68,.4,-2.45],.052,'#8e805d',this.world,.018);
    this.stone(-4.8,.45,2.65,.85,'#a8b29a');
    for(let i=0;i<3;i++) {
      const x=-5.02+i*.14,z=2.97+(i%2)*.13;
      this.stick([x,.51,z],[x,.63+i*.025,z],.019,'#e5d6b5');
      this.ball(x,.65+i*.025,z,.1,.055,.09,i===1?'#b47e5b':'#c29a6a',this.world,10);
    }
  }

  tree(x,z,s,index=0) {
    const g=new THREE.Group();g.name='pine-tree';g.position.set(x,.52,z);g.scale.setScalar(s);this.world.add(g);
    const height=2.9+Math.sin(index*1.7)*.12,lean=(index%3-1)*.075;
    const wood=index%2?'#756a50':'#817355';
    const trunk=[V(0,0,0),V(lean*.3,.85,.015),V(lean*.65,1.8,-.025),V(lean,height,-.04)];
    for(let i=0;i<3;i++)this.stick(trunk[i],trunk[i+1],[.115,.083,.048][i],wood,g,[.083,.048,.01][i]);
    // The roots stay close to the bank; short bark fissures follow the trunk's lean.
    for(let i=0;i<5;i++) {
      const a=i*2.35+index*.8,length=.28+this.rand()*.15;
      this.tube([[0,.14,0],[Math.cos(a)*length*.55,.045,Math.sin(a)*length*.55],
        [Math.cos(a)*length,.008,Math.sin(a)*length]],.027,wood,g,4);
      const angle=a+.3;
      this.tube([[Math.cos(angle)*.108,.15,Math.sin(angle)*.108],
        [Math.cos(angle)*.086+lean*.2,.53,Math.sin(angle)*.086],
        [Math.cos(angle)*.069+lean*.4,.95,Math.sin(angle)*.069]],.0045,'#615f47',g,4);
    }
    const foliage=['#496d56','#55785a','#668662','#7c976c','#90a078'];
    // Each bough is one notched silhouette with a raised spine. Needle detail
    // stays at its tips instead of tessellating every needle in the forest.
    const spray=(start,end,width,color)=>{
      const direction=end.clone().sub(start),length=direction.length();
      const vertices=[],colors=[],indices=[],rows=6;
      const shade=new THREE.Color(color);
      for(let i=0;i<=rows;i++) {
        const t=i/rows;
        const envelope=Math.pow(Math.sin(t*PI),.48)*(1-t*.3);
        const edge=width*envelope*(i%2?.98:.54);
        const curl=Math.sin(t*PI)*.025-t*t*.018;
        vertices.push(-edge,t*length,curl,0,t*length,curl+.025*envelope,edge,t*length,curl);
        for(const facet of [.88,1.04,.96])colors.push(shade.r*facet,shade.g*facet,shade.b*facet);
        if(i<rows) {
          const a=i*3;
          indices.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4);
        }
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      const m=this.mesh(geometry,this.material('#ffffff',.94,{side:THREE.DoubleSide,vertexColors:true}),g);
      const axis=direction.normalize(),side=V(-axis.z,0,axis.x).normalize();
      const normal=side.clone().cross(axis).normalize();
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,axis,normal));
      m.position.copy(start);
    };
    for(let tier=0;tier<6;tier++) {
      const t=tier/5,branches=tier===5?4:5+(index+tier)%2;
      const level=.72+t*1.8;
      for(let branch=0;branch<branches;branch++) {
        const angle=branch*PI*2/branches+tier*1.13+index*.71+(this.rand()-.5)*.2;
        const reach=(.98-t*.79)*(.83+this.rand()*.27);
        const base=V(lean*level/height,level+(this.rand()-.5)*.12,-.02);
        const middle=base.clone().add(V(Math.cos(angle)*reach*.55,-.055-t*.015,Math.sin(angle)*reach*.55));
        const tip=base.clone().add(V(Math.cos(angle)*reach,-.045+this.rand()*.07,Math.sin(angle)*reach));
        this.stick(base,middle,.023-t*.013,wood,g,.013-t*.007);
        this.stick(middle,tip,.013-t*.007,wood,g,.004);
        spray(base.clone().lerp(tip,.1),tip,reach*.27+.035,foliage[(tier+branch)%4]);
        for(const side of [-1,1]) {
          const along=.62;
          const origin=base.clone().lerp(tip,along);
          const a=angle+side*.66;
          const length=reach*.25+.07;
          const end=origin.clone().add(V(Math.cos(a)*length,.018+this.rand()*.035,Math.sin(a)*length));
          spray(origin,end,.052-t*.014,foliage[(branch+tier+2)%5]);
        }
      }
    }
    // The leader and a few short new shoots complete a broken, tapering silhouette.
    const leader=V(lean,height+.18,-.04);
    this.stick(trunk[3],leader,.012,wood,g,.004);
    for(let i=0;i<5;i++) {
      const a=i*2.4+index;
      const base=V(lean,height-.2+i*.04,-.04);
      spray(base,leader.clone().add(V(Math.cos(a)*.065,0,Math.sin(a)*.065)),.043,
        foliage[(i+index)%3+2]);
    }
  }

  buildReeds(x,z,s) {
    const g=new THREE.Group();g.position.set(x,.03,z);g.scale.setScalar(s);this.world.add(g);
    for(let i=0;i<9;i++) {
      const rx=(this.rand()-.5)*.55,rz=(this.rand()-.5)*.55,h=.65+this.rand()*.75;
      this.tube([[rx,0,rz],[rx-.04,h*.5,rz],[rx+.06,h,rz+.04]],.012,'#7c9154',g,10);
      if(i%2===0) {
        const top=this.ball(rx+.06,h-.02,rz+.04,.045,.17,.045,'#8c7350',g,10);
        top.rotation.z=-.06;
        this.stick([rx+.06,h+.1,rz+.04],[rx+.06,h+.23,rz+.04],.008,'#b5a572',g);
      }
      const leaf=this.blade(rx,.08,rz,h*.8,i*1.8,'#8a9b5e',g,.045);
      leaf.rotation.z=(i%2?1:-1)*.38;
    }
    this.plants.push({group:g,phase:x,tilt:0});
    this.ring(x,.135,z,.42*s,'#c1debd',this.world,.23);
  }

  buildDock() {
    this.dock=new THREE.Group();this.world.add(this.dock);
    // Thick end grain, slightly bowed boards, two beams, and nail heads.
    this.box(-2.72,.45,.92,3.28,.2,1.8,'#8b7251',this.dock,.04);
    for(let i=0;i<9;i++) {
      const x=-4.16+i*.36;
      const z=.92+(this.rand()-.5)*.025;
      const wood=['#b3946d','#bc9d74','#c6a57a','#bca07b'][i%4];
      const plank=this.box(x,.63,z,.338,.16,1.9+(this.rand()-.5)*.06,wood,this.dock,.035);
      plank.rotation.z=(this.rand()-.5)*.01;
      for(const edge of [-.73,.73]) {
        this.ball(x,.722,z+edge,.026,.009,.026,'#6f6e55',this.dock,8);
        this.stick([x-.009,.732,z+edge],[x+.008,.732,z+edge],.0025,'#aaa488',this.dock);
      }
      for(let g=0;g<2;g++) {
        const px=x+(g-.5)*.12;
        this.tube([[px,.716,z-.63],[px+.018,.72,z-.28],[px-.012,.72,z+.1],[px+.015,.718,z+.53]],.0035,'#977d5b',this.dock,12);
      }
      if(i===3||i===7) {
        const knot=this.ring(x,.725,z-.15,.065,'#8c7151',this.dock,.65);
        knot.scale.z=.45;
      }
    }
    for(const x of [-4.05,-1.3]) for(const z of [.15,1.7]) {
      this.stick([x,-.15,z],[x,.92,z],.104,'#8e7957',this.dock,.09);
      this.ball(x,.93,z,.11,.035,.11,'#c3a77b',this.dock,12);
      for(let r=0;r<3;r++) {
        const rope=this.mesh(new THREE.TorusGeometry(.108,.013,5,20),this.material('#d1bd89'),this.dock);
        rope.rotation.x=PI/2;rope.position.set(x,.77+r*.035,z);
      }
    }
    // A sagging hand-knotted rope along the bank-facing side.
    this.tube([[-4.05,.85,.15],[-2.7,.64,.15],[-1.3,.85,.15]],.018,'#cbb786',this.dock);
    const coil=new THREE.Group();coil.position.set(-3.45,.735,1.34);this.dock.add(coil);
    for(let i=0;i<4;i++) {
      const r=this.mesh(new THREE.TorusGeometry(.13+i*.024,.015,5,30),this.material('#dac694'),coil);
      r.rotation.x=-PI/2;r.position.y=i*.007;
    }
    this.tube([[-3.25,.75,1.36],[-3.08,.75,1.32],[-3.03,.75,1.53]],.015,'#dac694',this.dock);
    this.buildLantern(-3.9,.75,.27);
    // A wicker creel with crossing fibres, leather lid, and a little clasp.
    const basket=new THREE.Group();basket.position.set(-2.95,.73,1.4);basket.rotation.y=-.14;this.dock.add(basket);
    this.box(0,.21,0,.57,.4,.39,'#b79863',basket,.08);
    for(let i=0;i<8;i++)this.box(-.24+i*.068,.21,.204,.014,.29,.014,'#d0b77c',basket,.004);
    for(let j=0;j<5;j++)this.box(0,.1+j*.055,.211,.49,.012,.012,'#947e50',basket,.003);
    this.box(0,.43,0,.59,.07,.42,'#a68a5c',basket,.035);
    this.tube([[-.2,.4,0],[-.14,.67,0],[.14,.67,0],[.2,.4,0]],.025,'#765d44',basket,20);
    this.box(0,.32,.226,.06,.15,.035,'#806343',basket,.012);
    this.ball(0,.29,.25,.025,.025,.012,'#d2b879',basket,8);
  }

  buildLantern(x,y,z) {
    const g=new THREE.Group();g.position.set(x,y,z);this.dock.add(g);
    const metal=this.material('#526b5c',.56);
    this.box(0,.035,0,.31,.07,.27,metal,g,.025);
    this.lanternGlass=this.material('#f3d896',.28,{transparent:true,opacity:.82,emissive:'#ffc46f',emissiveIntensity:.32});
    this.box(0,.24,0,.23,.34,.2,this.lanternGlass,g,.018);
    for(const px of [-.13,.13])for(const pz of[-.115,.115])this.stick([px,.06,pz],[px,.43,pz],.018,metal,g);
    this.box(0,.44,0,.32,.07,.29,metal,g,.025);
    const cap=this.mesh(new THREE.ConeGeometry(.23,.14,4),metal,g);cap.rotation.y=PI/4;cap.position.y=.54;cap.scale.z=.9;
    this.tube([[-.08,.57,0],[-.08,.74,0],[.08,.74,0],[.08,.57,0]],.013,metal,g,16);
    this.lanternLight=new THREE.PointLight('#ffc879',.4,4,2);this.lanternLight.castShadow=false;this.lanternLight.position.set(x,y+.3,z);this.world.add(this.lanternLight);
  }

  buildCharacter() {
    this.character=new THREE.Group();this.character.position.set(-1.82,.73,.9);this.character.rotation.y=1.2;this.world.add(this.character);
    const g=this.character;
    const tunic='#6d8c68',seam='#9cac77',skin='#dfbd8d',hood='#819d66';
    // Rounded clay boots dangle beyond the dock's edge.
    this.stick([-.19,.26,.05],[-.23,.06,.45],.10,'#b49a70',g);
    this.stick([.16,.26,.05],[.2,.04,.47],.10,'#b49a70',g);
    this.ball(-.23,.025,.5,.13,.1,.2,'#795f47',g);
    this.ball(.2,.01,.52,.13,.1,.2,'#795f47',g);
    this.ball(0,.43,0,.34,.39,.27,tunic,g);
    // Split tunic hem and stitched neck scarf make the pose readable at distance.
    this.ball(-.16,.24,.08,.23,.12,.28,tunic,g);
    this.ball(.16,.24,.08,.23,.12,.28,tunic,g);
    this.tube([[-.29,.22,.2],[0,.19,.29],[.29,.22,.2]],.016,seam,g,18);
    this.ball(0,.77,.02,.19,.09,.2,'#d1b574',g);
    const scarf=this.mesh(leafGeometry(.32,.07,.035),this.material('#c3aa6a',.9,{side:THREE.DoubleSide}),g);
    scarf.position.set(.02,.7,.25);scarf.rotation.z=PI-.2;
    this.head=new THREE.Group();this.head.position.set(0,1.01,.015);g.add(this.head);
    this.ball(0,.04,-.04,.42,.43,.37,hood,this.head,24);
    // A separate inset face keeps the hood's edge thick and sculptural.
    this.ball(0,.005,.24,.315,.31,.22,skin,this.head,24);
    this.ball(-.29,.025,.2,.07,.095,.07,'#d5b185',this.head);
    this.ball(.29,.025,.2,.07,.095,.07,'#d5b185',this.head);
    this.ball(-.115,.05,.435,.027,.037,.015,'#35483a',this.head,12);
    this.ball(.115,.05,.435,.027,.037,.015,'#35483a',this.head,12);
    this.ball(-.12,.065,.448,.008,.009,.004,'#f5ebcb',this.head,8);
    this.ball(.11,.065,.448,.008,.009,.004,'#f5ebcb',this.head,8);
    this.ball(0,-.018,.462,.04,.035,.037,'#d5ad7f',this.head,12);
    this.ball(-.19,-.055,.418,.055,.026,.012,'#cf9b7f',this.head,12);
    this.ball(.19,-.055,.418,.055,.026,.012,'#cf9b7f',this.head,12);
    this.tube([[-.045,-.1,.435],[0,-.115,.448],[.045,-.1,.435]],.007,'#795e47',this.head,10);
    // Leaf hood: raised veins, overlapping pointed leaves and a curled stalk.
    for(const side of[-1,1]) {
      const leaf=this.mesh(leafGeometry(.65,.19,.09),this.material(side<0?'#90a970':'#78965e',.88,{side:THREE.DoubleSide}),this.head);
      leaf.position.set(side*.25,-.13,.22);leaf.rotation.z=side*-.65;leaf.rotation.x=-.25;
      this.tube([[side*.25,-.12,.25],[side*.31,.16,.3],[side*.12,.45,.13]],.009,'#b2bc80',this.head,16);
    }
    const top=this.mesh(leafGeometry(.62,.24,.12),this.material('#91a96f',.88,{side:THREE.DoubleSide}),this.head);
    top.position.set(-.02,.22,-.23);top.rotation.x=.8;top.rotation.z=-.25;
    this.tube([[0,.35,-.08],[.07,.56,-.1],[.2,.58,-.08]],.026,'#647f4d',this.head,18);
    this.tube([[0,.25,.16],[.05,.43,.13],[.12,.52,.06]],.01,'#bdc58b',this.head,14);
    // Sleeves and hands hold a real rod rather than intersecting the body.
    this.stick([-.27,.65,.06],[-.32,.5,.39],.125,tunic,g,.1);
    this.stick([.27,.65,.06],[.24,.52,.42],.125,tunic,g,.1);
    this.stick([-.32,.5,.39],[-.12,.56,.64],.075,skin,g,.065);
    this.stick([.24,.52,.42],[.13,.62,.67],.075,skin,g,.065);
    this.leftHand=this.ball(-.11,.56,.64,.082,.08,.09,skin,g);
    this.rightHand=this.ball(.12,.62,.67,.082,.08,.09,skin,g);
    for(let i=0;i<3;i++)this.ball(.065+i*.038,.64,.718,.021,.033,.02,'#d2aa7d',g,8);
    this.rodGrip=new THREE.Object3D();this.rodGrip.position.set(.07,.61,.69);g.add(this.rodGrip);
    // A linen shoulder patch and three miniature running stitches.
    this.ball(-.31,.62,.14,.065,.1,.1,'#92a279',g,12);
    for(let i=0;i<3;i++)this.stick([-.345,.57+i*.04,.205],[-.31,.58+i*.04,.215],.005,'#d0c799',g);
  }

  buildFishingGear() {
    this.rodMaterial=this.material('#745b3c',.57);
    const rodSegments=20,rodSides=5,rodGeometry=new THREE.BufferGeometry(),rodIndices=[];
    const rodVertices=(rodSegments+1)*(rodSides+1);
    rodGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rodVertices*3),3).setUsage(THREE.DynamicDrawUsage));
    rodGeometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(rodVertices*3),3).setUsage(THREE.DynamicDrawUsage));
    for(let i=0;i<rodSegments;i++)for(let j=0;j<rodSides;j++) {
      const a=i*(rodSides+1)+j,b=a+rodSides+1;
      rodIndices.push(a,a+1,b,a+1,b+1,b);
    }
    rodGeometry.setIndex(rodIndices);
    this.rod=this.mesh(rodGeometry,this.rodMaterial,this.world,false);this.rod.frustumCulled=false;
    this.rodSegments=rodSegments;this.rodSides=rodSides;
    this.rodRadials=new Float32Array((rodSides+1)*2);
    for(let j=0;j<=rodSides;j++) {
      this.rodRadials[j*2]=Math.cos(j/rodSides*PI*2);this.rodRadials[j*2+1]=Math.sin(j/rodSides*PI*2);
    }
    this.rodPositions=rodGeometry.attributes.position;this.rodNormals=rodGeometry.attributes.normal;
    this.rodTip=V();this.rodBase=V();this.rodDirection=V(.12,.62,-.04).normalize();
    this.bobberPosition=V();this.reelTarget=V(-.74,WATER_Y,.95);
    this.rodHandle=this.stick([0,0,0],[0,.35,0],.045,'#b49a64');
    this.rodHandle.quaternion.setFromUnitVectors(V(0,1,0),this.rodDirection);
    this.reel=this.mesh(new THREE.TorusGeometry(.1,.03,8,16),this.material('#7b8d77',.38));this.reel.rotation.y=.2;
    this.lineMaterial=new THREE.LineBasicMaterial({color:'#f2e7c6',transparent:true,opacity:.88});
    const lineGeometry=new THREE.BufferGeometry();
    lineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(33*3),3));
    lineGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.line=new THREE.Line(lineGeometry,this.lineMaterial);this.line.frustumCulled=false;this.world.add(this.line);
    this.bobber=new THREE.Group();this.bobber.position.copy(this.target);this.world.add(this.bobber);
    this.ball(0,.052,0,.067,.09,.067,'#e6dab5',this.bobber,16);
    this.ball(0,.107,0,.061,.05,.061,'#bd7058',this.bobber,16);
    this.stick([0,.12,0],[0,.23,0],.012,'#7b6650',this.bobber);
    this.ball(0,.23,0,.022,.025,.022,'#b86d54',this.bobber,8);
    this.bobberRipple=this.ring(this.target.x,.138,this.target.z,.24,'#e6efd2',this.world,.65);
    this.castMarker=new THREE.Group();this.world.add(this.castMarker);
    for(let i=0;i<3;i++) {
      const r=this.ring(0,.14+i*.001,0,.29+i*.1,'#f2e6bc',this.castMarker,.38-i*.08);
      this.ripples.push(r);
    }
    this.castMarker.position.set(this.target.x,0,this.target.z);
    this.catchDisplay=new THREE.Group();this.world.add(this.catchDisplay);this.catchDisplay.visible=false;
    this.hookPoint=V(1.25,-.38,.4);this.fishMouthScratch=V();
    const leaderGeometry=new THREE.BufferGeometry();
    leaderGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3).setUsage(THREE.DynamicDrawUsage));
    this.hookLeader=new THREE.Line(leaderGeometry,this.lineMaterial);this.hookLeader.frustumCulled=false;
    this.hookLeader.visible=false;this.world.add(this.hookLeader);
  }

  makeFish(color,accent,scale=1,parent=this.world,id='') {
    const fish=createRiverFish({id:id||'clover-carp',color,accent},scale);
    fish.traverse(o=>{if(o.isMesh)o.castShadow=false;});
    this.combineGeometry(fish,new Set([fish.userData.body,fish.userData.tail]));
    parent.add(fish);
    return fish;
  }

  fitSwimmingFish(group) {
    // Keep the fish's actual anatomy. The deeper riverbed gives its fins room.
    group.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(group);
    const center=(box.min.y+box.max.y)*.5;
    group.userData.swimOffsetY=-.36-center;
    return group;
  }

  buildFish() {
    // Every possible catch already lives in the river, with the guide's palette.
    const residents=[
      ['willow-minnow','#9eaf91','#e9d5a3',.56712,-.01925,-.4,-2.8,.64],
      ['copper-perch','#bd8865','#f0c78e',.53376,-.02675,1.5,-2,.68],
      ['pebble-loach','#96917d','#d9caab',.6394,-.017,2.25,-.65,.65],
      ['ribbon-dace','#96afb4','#eed9b1',.61716,-.0195,-.5,.8,.65],
      ['clover-carp','#a9b18a','#edcf98',.56156,-.02625,1.5,1.5,.72],
      ['glassfin','#afd1cd','#e6eee0',.53932,-.02125,2.5,2.6,.65],
      ['moon-bream','#a8b1cd','#e8d6ac',.48928,-.02925,.2,3.4,.7],
      ['starfin','#bdc9ac','#fff0bf',.556,-.024,-1,-1.2,.68],
    ];
    const species=globalThis.FishingLife?.SPECIES||globalThis.window?.FishingLife?.SPECIES||[];
    this.fishById=new Map();this.fishTravelLimit=7.2;this.activeFish=null;
    residents.forEach(([id,color,accent,mouthX,mouthY,x,z,scale],i)=>{
      const entry=species.find(f=>f.id===id);
      const group=this.fitSwimmingFish(this.makeFish(entry?.color||color,entry?.accent||accent,scale,this.world,id));
      const bounds=new THREE.Box3().setFromObject(group);
      const bodyRadius=Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))+.08;
      const f={id,group,x,z,homeX:x,homeZ:z,phase:i*1.7,speed:.18+this.rand()*.08,radius:.35+this.rand()*.35,
        bodyRadius,margin:Math.max(.85,bodyRadius+.18),swimY:group.userData.swimOffsetY,
        mouthLocal:V(mouthX,mouthY,0),mouthOffset:mouthX*scale,mouthY:mouthY*scale,
        mode:'roam',vx:0,vy:0,vz:0,heading:0,nearHook:false,pathTime:0,pathDuration:0};
      group.userData.mouthLocal=f.mouthLocal;group.userData.residentId=id;
      const edges=this.riverEdges(z);
      group.position.set(clamp(x+Math.cos(f.phase)*f.radius,edges.left+f.margin,edges.right-f.margin),f.swimY,z+Math.sin(f.phase)*f.radius*.55);
      f.vx=-Math.sin(f.phase)*f.radius*f.speed;f.vz=Math.cos(f.phase)*f.radius*.55*f.speed;
      f.heading=Math.atan2(-f.vz,f.vx);group.rotation.y=f.heading;
      this.fishes.push(f);this.fishById.set(id,f);
    });
    // Compatibility aliases refer to residents; neither alias creates a model.
    this.hookedFish=this.fishes[0].group;this.catchFish=this.hookedFish;
  }

  fishMouth(f,out=V()) {
    return out.copy(f.mouthLocal).multiply(f.group.scale).applyEuler(f.group.rotation).add(f.group.position);
  }

  turnFish(f,heading,step) {
    const delta=Math.atan2(Math.sin(heading-f.heading),Math.cos(heading-f.heading));
    f.heading+=clamp(delta,-8*step,8*step);f.group.rotation.y=f.heading;
  }

  startFishPath(f,x,y,z,duration,mode,endHeading=f.heading) {
    const position=f.group.position,start=this.riverEdges(position.z),end=this.riverEdges(z);
    x=clamp(x,end.left+f.margin,end.right-f.margin);
    f.pathStartX=position.x;f.pathStartY=position.y;f.pathStartZ=position.z;
    f.pathStartF=(position.x-start.left)/(start.right-start.left);
    f.pathEndF=(x-end.left)/(end.right-end.left);
    f.pathEndX=x;f.pathEndY=y;f.pathEndZ=z;
    f.pathStartVZ=clamp(f.vz*duration,-1.5,1.5);
    f.pathStartVF=clamp(f.vx*duration/(start.right-start.left),-.16,.16);
    f.pathEndVZ=-Math.sin(endHeading)*.045*duration;
    f.pathEndVF=Math.cos(endHeading)*.045*duration/(end.right-end.left);
    f.pathEndHeading=endHeading;f.pathTime=0;f.pathDuration=Math.max(.15,duration);f.mode=mode;
  }

  beginFishApproach(f,duration) {
    const position=f.group.position,dx=this.hookPoint.x-position.x,dz=this.hookPoint.z-position.z;
    const heading=Math.hypot(dx,dz)>.03?Math.atan2(-dz,dx):f.heading;
    f.approachHeading=heading;
    this.startFishPath(f,this.hookPoint.x-Math.cos(heading)*f.mouthOffset,f.swimY,
      this.hookPoint.z+Math.sin(heading)*f.mouthOffset,duration,'approach',heading);
  }

  releaseResident(f) {
    const position=f.group.position;
    const direction=f.heading+PI*.7;
    const z=clamp(position.z-Math.sin(direction)*1.7,-40,40),edges=this.riverEdges(z);
    const x=clamp(position.x+Math.cos(direction)*1.7,edges.left+f.margin,edges.right-f.margin);
    f.pendingApproach=false;f.nearHook=false;
    this.startFishPath(f,x,f.swimY,z,position.y>f.swimY+.15?1.25:1.9,'return',direction);
  }

  advanceFishPath(f,step) {
    if(step<=0)return false;
    f.pathTime=Math.min(f.pathDuration,f.pathTime+step);
    const u=f.pathTime/f.pathDuration,u2=u*u,u3=u2*u;
    const a=2*u3-3*u2+1,b=u3-2*u2+u,c=-2*u3+3*u2,d=u3-u2;
    const z=a*f.pathStartZ+b*f.pathStartVZ+c*f.pathEndZ+d*f.pathEndVZ;
    const fraction=a*f.pathStartF+b*f.pathStartVF+c*f.pathEndF+d*f.pathEndVF;
    const edges=this.riverEdges(z),x=clamp(mix(edges.left,edges.right,fraction),edges.left+f.margin,edges.right-f.margin);
    const y=mix(f.pathStartY,f.pathEndY,u2*(3-2*u));
    const position=f.group.position,dx=x-position.x,dy=y-position.y,dz=z-position.z;
    const distance=Math.hypot(dx,dy,dz),amount=distance>0?Math.min(1,this.fishTravelLimit*step/distance):1;
    f.vx=dx*amount/step;f.vy=dy*amount/step;f.vz=dz*amount/step;
    position.x+=dx*amount;position.y+=dy*amount;position.z+=dz*amount;
    if(Math.hypot(f.vx,f.vz)>.008)this.turnFish(f,Math.atan2(-f.vz,f.vx),step);
    else this.turnFish(f,f.pathEndHeading,step);
    const roll=f.mode==='lift'?.42:0;
    f.group.rotation.z+=clamp(roll-f.group.rotation.z,-step,step);
    const ex=position.x-f.pathEndX,ey=position.y-f.pathEndY,ez=position.z-f.pathEndZ;
    return u===1&&ex*ex+ey*ey+ez*ez<.0025;
  }

  updateResidentFish(session,step,bobberPosition,reducedMotion) {
    const phase=session.phase||'idle',active=FISH_CAST_PHASES.has(phase);
    const id=session.fish?.id,previous=this.previousPhase,phaseTime=session.phaseTime||0;
    const newCast=active&&id&&(!this.activeFish||this.activeFish.id!==id||
      (phase==='casting'&&(previous!=='casting'||phaseTime<(this.lastFishPhaseTime||0)-.001))||
      !FISH_ENGAGED_MODES.has(this.activeFish.mode));
    const selected=id?this.fishById.get(id):null;
    const candidate=newCast?selected:this.activeFish;
    if(candidate) {
      const point=phase==='casting'?this.target:bobberPosition,edges=this.riverEdges(point.z);
      const margin=candidate.margin+candidate.mouthOffset;
      this.hookPoint.set(clamp(point.x,edges.left+margin,edges.right-margin),candidate.swimY+candidate.mouthY,point.z);
    }
    if(newCast&&selected) {
      if(this.activeFish&&this.activeFish!==selected)this.releaseResident(this.activeFish);
      this.activeFish=selected;this.hookedFish=selected.group;this.catchFish=selected.group;
      const wait=Number.isFinite(session._waitDuration)&&session._waitDuration>0?session._waitDuration:3;
      const remaining=phase==='casting'?Math.max(0,1-phaseTime)+wait:phase==='waiting'?Math.max(.2,wait-phaseTime):.5;
      selected.castBudget=Math.max(.2,remaining-.25);selected.castClock=0;selected.nearHook=false;
      if(selected.group.position.y>selected.swimY+.1) {
        const p=selected.group.position;
        selected.pendingApproach=true;
        this.startFishPath(selected,p.x,selected.swimY,p.z,Math.min(.65,selected.castBudget*.25),'dive',selected.heading);
      } else this.beginFishApproach(selected,selected.castBudget);
    }
    const f=this.activeFish;
    if(f&&phase==='caught'&&!FISH_DISPLAY_MODES.has(f.mode)) {
      f.pendingApproach=false;f.nearHook=false;
      this.startFishPath(f,-.7,1.65,1.07,1.05,'lift',-.3);
    } else if(f&&!active&&phase!=='caught'&&FISH_RELEASE_MODES.has(f.mode))this.releaseResident(f);
    if(f&&phase==='reeling'&&f.mode!=='attached'&&f.mode!=='dive')f.mode='attached';
    for(let i=0;i<this.fishes.length;i++) {
      const fish=this.fishes[i],g=fish.group;
      g.visible=true;
      if(fish===f&&active)fish.castClock+=step;
      if(FISH_PATH_MODES.has(fish.mode)) {
        if(this.advanceFishPath(fish,step)) {
          if(fish.mode==='dive'&&fish.pendingApproach) {
            fish.pendingApproach=false;this.beginFishApproach(fish,Math.max(.2,fish.castBudget-fish.castClock));
          } else if(fish.mode==='approach')fish.mode='attend';
          else if(fish.mode==='lift')fish.mode='held';
          else {
            fish.mode='roam';fish.homeX=g.position.x-Math.cos(fish.phase)*fish.radius;
            fish.homeZ=g.position.z-Math.sin(fish.phase)*fish.radius*.55;
          }
        }
      } else if((fish.mode==='attend'||fish.mode==='attached')&&step>0) {
        let heading=fish.approachHeading;
        if(fish.mode==='attached') {
          const dx=this.hookPoint.x-(fish.lastHookX??this.hookPoint.x),dz=this.hookPoint.z-(fish.lastHookZ??this.hookPoint.z);
          if(Math.hypot(dx,dz)>.0001)heading=Math.atan2(-dz,dx);
          else heading=fish.heading;
        }
        this.turnFish(fish,heading,step);
        const x=this.hookPoint.x-Math.cos(fish.heading)*fish.mouthOffset,z=this.hookPoint.z+Math.sin(fish.heading)*fish.mouthOffset;
        const edges=this.riverEdges(z),goalX=clamp(x,edges.left+fish.margin,edges.right-fish.margin);
        const dx=goalX-g.position.x,dy=fish.swimY-g.position.y,dz=z-g.position.z;
        const distance=Math.hypot(dx,dy,dz),amount=distance>0?Math.min(1-Math.exp(-18*step),this.fishTravelLimit*step/distance):1;
        fish.vx=dx*amount/step;fish.vy=dy*amount/step;fish.vz=dz*amount/step;
        g.position.x+=dx*amount;g.position.y+=dy*amount;g.position.z+=dz*amount;
        g.rotation.z+=clamp(-g.rotation.z,-step,step);
      } else if(fish.mode==='roam'&&step>0&&!reducedMotion) {
        const oldX=g.position.x,oldZ=g.position.z;fish.phase+=step*fish.speed;
        const z=fish.homeZ+Math.sin(fish.phase)*fish.radius*.55,edges=this.riverEdges(z);
        g.position.set(clamp(fish.homeX+Math.cos(fish.phase)*fish.radius,edges.left+fish.margin,edges.right-fish.margin),fish.swimY,z);
        fish.vx=(g.position.x-oldX)/step;fish.vy=0;fish.vz=(g.position.z-oldZ)/step;
        if(Math.hypot(fish.vx,fish.vz)>.001)this.turnFish(fish,Math.atan2(-fish.vz,fish.vx),step);
      }
      g.userData.tail.rotation.y=Math.sin(this.time*(fish===f&&phase==='reeling'?18:7)+i)*
        (fish.mode==='roam'?.22:.34);
      if(fish===f) {
        fish.lastHookX=this.hookPoint.x;fish.lastHookZ=this.hookPoint.z;
        fish.nearHook=this.fishMouth(fish,this.fishMouthScratch).distanceToSquared(this.hookPoint)<.0256;
      }
    }
    this.lastFishPhaseTime=phaseTime;
    return f;
  }

  buildWaterDetails() {
    this.flowLines=[];
    this.glintMaterials=[0,1,2].map(()=>new THREE.LineBasicMaterial({
      color:'#e3ebca',transparent:true,opacity:.3,depthWrite:false}));
    const flowPoints=[[],[],[]];
    // Long, broken threads follow the channel's bend, rather than crossing a pool.
    for(let i=0;i<48;i++) {
      const z=-23+this.rand()*48,length=.45+this.rand()*1.65;
      const fraction=.12+this.rand()*.77;
      const points=[];
      for(let j=0;j<=12;j++) {
        const pz=z+j/12*length,{left,right}=this.riverEdges(pz);
        points.push(V(mix(left,right,fraction)+Math.sin(j/12*PI)*.035,.138,pz));
      }
      for(let j=1;j<points.length;j++)flowPoints[i%3].push(points[j-1],points[j]);
    }
    flowPoints.forEach((points,i)=>{
      const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),this.glintMaterials[i]);
      line.renderOrder=4;this.world.add(line);this.flowLines.push({line,phase:i*2.1});
    });
    // Reflected leaf shadows briefly gather beside the bank and disperse again.
    this.reflectionMat=new THREE.MeshBasicMaterial({color:'#4b7562',transparent:true,opacity:.075,
      depthWrite:false,side:THREE.DoubleSide});
    const reflections=new THREE.Group();this.world.add(reflections);
    for(let i=0;i<26;i++) {
      const z=-12+this.rand()*23,side=i%2?-1:1,{left,right}=this.riverEdges(z);
      const x=(side<0?left:right)-side*(.15+this.rand()*.6);
      const reflection=this.mesh(leafGeometry(.18+this.rand()*.38,.03+this.rand()*.07,.008),this.reflectionMat,reflections,false);
      reflection.rotation.set(PI/2,0,this.rand()*.7-.35);reflection.position.set(x,.132,z);
      reflection.renderOrder=4;
    }
    this.combineGeometry(reflections,new Set(),false,true);
    reflections.children.forEach(o=>{o.renderOrder=4;});
    // Lily leaves sit in the quiet margin while the centre remains open for casting.
    for(let i=0;i<5;i++) {
      const z=2.8+i*.43,{right}=this.riverEdges(z),x=right-.3-(i%2)*.3;
      const shape=new THREE.Shape();shape.moveTo(0,0);shape.absarc(0,0,.17+i*.008,.15,PI*2-.15,false);shape.lineTo(0,0);
      const pad=this.mesh(new THREE.ShapeGeometry(shape,20),this.material(i%2?'#87a068':'#709260',.85,{side:THREE.DoubleSide}),this.world,false);
      pad.rotation.x=-PI/2;pad.rotation.z=i*.9;pad.position.set(x,.147,z);
      this.tube([[x,.15,z],[x-.07,.151,z-.05],[x-.15,.151,z-.07]],.0035,'#b5bd81');
      if(i===3) {
        for(let p=0;p<6;p++) {
          const a=p*PI/3;
          const petal=this.mesh(leafGeometry(.13,.048,.024),this.material('#e7d8b9',.85,{side:THREE.DoubleSide}),this.world,false);
          petal.position.set(x,.155,z);petal.rotation.set(Math.cos(a)*1.1,a,Math.sin(a)*1.1);
        }
        this.ball(x,.18,z,.032,.026,.032,'#c7aa70',this.world,8);
      }
    }
    this.bubbleMeshes=[];
    for(let i=0;i<5;i++) {
      const m=this.ring(0,.14,0,.04+i*.009,'#e1ecd2',this.world,.55);
      m.visible=false;this.bubbleMeshes.push(m);
    }
  }

  buildOtter() {
    this.otter=new THREE.Group();this.otter.position.set(-2.96,.12,-1.83);this.otter.rotation.y=.9;this.world.add(this.otter);this.otter.visible=false;
    const g=this.otter;
    this.ball(0,.1,0,.21,.25,.19,'#8e785d',g,20);
    this.ball(0,.26,.025,.23,.2,.2,'#927b5e',g,20);
    this.ball(-.18,.4,.01,.065,.07,.055,'#80694f',g,12);this.ball(.18,.4,.01,.065,.07,.055,'#80694f',g,12);
    this.ball(0,.2,.19,.16,.095,.075,'#d0b998',g,16);
    this.ball(-.09,.29,.19,.017,.02,.012,'#35473d',g,8);this.ball(.09,.29,.19,.017,.02,.012,'#35473d',g,8);
    this.ball(0,.23,.256,.038,.026,.023,'#4f4c3b',g,8);
    for(const side of[-1,1]) for(let i=0;i<3;i++)this.stick([side*.07,.2,.246],[side*.23,.19+i*.022,.23],.0025,'#e0cba8',g);
    this.ball(-.19,.04,.14,.06,.08,.09,'#8c7357',g,12);this.ball(.19,.04,.14,.06,.08,.09,'#8c7357',g,12);
    g.traverse(o=>{if(o.isMesh)o.castShadow=false;});
    this.stone(-3.04,.18,-1.52,.92,'#b7bfaa');
  }

  buildRain() {
    const n=300,positions=new Float32Array(n*12),colors=new Float32Array(n*12),indices=new Uint16Array(n*6);
    const shade=new THREE.Color('#668984'),highlight=new THREE.Color('#f4fcf6');
    this.rainSeeds=[];this.rainSide=V();
    for(let i=0;i<n;i++) {
      this.rainSeeds.push({x:-15+this.rand()*30,z:-20+this.rand()*40,y:this.rand()*6,s:.65+this.rand()*.5,length:.26+this.rand()*.16,width:.8+this.rand()*.4});
      for(let j=0;j<4;j++)(j<2?shade:highlight).toArray(colors,i*12+j*3);
      const v=i*4;indices.set([v,v+1,v+2,v+2,v+1,v+3],i*6);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setIndex(new THREE.BufferAttribute(indices,1));
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    // Camera-facing ribbons stay legible on displays that limit WebGL lines to one pixel.
    this.rainLines=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.82,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:false}));
    this.rainLines.frustumCulled=false;this.rainLines.renderOrder=6;
    this.world.add(this.rainLines);this.rainLines.visible=false;
    this.rainRippleGroup=new THREE.Group();this.world.add(this.rainRippleGroup);this.rainRippleGroup.visible=false;
    this.rainRipples=[];
    const rippleGeometry=new THREE.RingGeometry(.096,.108,24);
    for(let i=0;i<18;i++) {
      const z=-12+this.rand()*25,{left,right}=this.riverEdges(z);
      const mat=new THREE.MeshBasicMaterial({color:'#eaf5e6',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
      const ripple=this.mesh(rippleGeometry,mat,this.rainRippleGroup,false);
      ripple.position.set(mix(left,right,.13+this.rand()*.74),.149,z);
      ripple.rotation.x=-PI/2;ripple.renderOrder=5;
      this.rainRipples.push({mesh:ripple,phase:i*.137});
    }
    this.rainDroplets=new THREE.InstancedMesh(
      new THREE.SphereGeometry(.022,6,4),
      new THREE.MeshBasicMaterial({color:'#edf9f2',transparent:true,opacity:.85,depthWrite:false,toneMapped:false}),
      this.rainRipples.length*2
    );
    this.rainDroplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rainDroplets.frustumCulled=false;this.rainDroplets.renderOrder=6;
    this.rainDropletPose=new THREE.Object3D();
    this.rainRippleGroup.add(this.rainDroplets);
  }

  buildWaterOcclusion() {
    this.world.updateMatrixWorld(true);
    const objects=[...this.terrainMeshes];
    this.dock.traverse(object=>{if(object.isMesh&&!object.material.transparent)objects.push(object);});
    // Independent CPU geometry survives the static draw-call batching below.
    this.castOccluders=objects.map(object=>{
      const proxy=new THREE.Mesh(object.geometry.clone(),object.material);
      proxy.matrixAutoUpdate=false;
      proxy.matrix.copy(object.matrixWorld);
      proxy.matrixWorld.copy(object.matrixWorld);
      return proxy;
    });
  }

  batchStaticGeometry() {
    // Static details share a draw call per material. The handful of wind-driven
    // clumps are batched in their own local coordinates, so they still sway.
    const moving = new Set([
      this.character,this.rod,this.rodHandle,this.reel,this.bobber,this.bobberRipple,
      this.castMarker,this.catchDisplay,this.hookedFish,this.water,this.otter,
      this.rainLines,this.rainRippleGroup,
      ...this.fishes.map(f=>f.group),...this.bubbleMeshes,...this.plants.map(p=>p.group),
    ]);
    this.world.updateMatrixWorld(true);
    this.combineGeometry(this.world,moving,true);
    for(const plant of this.plants)this.combineGeometry(plant.group,new Set());
    this.combineGeometry(this.character,new Set([this.head,this.rodGrip,this.leftHand,this.rightHand]));
    this.combineGeometry(this.head,new Set());
  }

  combineGeometry(root,exclude,spatial=false,allowTransparent=false) {
    root.updateWorldMatrix(true,true);
    const retired=new Set();
    const batches=new Map(),inverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
    const bounds=new THREE.Box3(),center=V(),extent=V();
    root.traverse(object=>{
      if(!object.isMesh||Array.isArray(object.material)||(object.material.transparent&&!allowTransparent))return;
      let forest=false;
      for(let p=object;p&&p!==root;p=p.parent) {
        if(exclude.has(p))return;
        if(p.name==='pine-tree')forest=true;
      }
      const attrs=Object.keys(object.geometry.attributes).filter(k=>['position','normal','uv','color'].includes(k)).sort();
      let cell='local';
      if(spatial&&forest) {
        if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
        bounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
        bounds.getCenter(center);bounds.getSize(extent);
        // The light continuous terrain stays whole; woodland details are
        // grouped in small cells so a cropped forest can actually be culled.
        cell=Math.max(extent.x,extent.z)>12?'terrain':`${Math.floor(center.x/6)},${Math.floor(center.z/6)}`;
      }
      const key=`${cell}:${object.material.uuid}:${object.castShadow}:${attrs.join(',')}`;
      if(!batches.has(key))batches.set(key,{objects:[],attrs,material:object.material,shadow:object.castShadow});
      batches.get(key).objects.push(object);
    });
    for(const batch of batches.values()) {
      if(batch.objects.length<2)continue;
      const transformed=batch.objects.map(o=>{
        const g=o.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));return g;
      });
      const count=transformed.reduce((sum,g)=>sum+g.attributes.position.count,0);
      const geometry=new THREE.BufferGeometry();
      for(const name of batch.attrs) {
        const size=transformed[0].attributes[name].itemSize;
        const values=new Float32Array(count*size);let offset=0;
        transformed.forEach(g=>{values.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;});
        geometry.setAttribute(name,new THREE.BufferAttribute(values,size));
      }
      const indexCount=transformed.reduce((sum,g)=>sum+(g.index?g.index.count:g.attributes.position.count),0);
      const indices=count>65535?new Uint32Array(indexCount):new Uint16Array(indexCount);
      let vertexOffset=0,indexOffset=0;
      for(const part of transformed) {
        const length=part.index?part.index.count:part.attributes.position.count;
        for(let i=0;i<length;i++)indices[indexOffset+i]=vertexOffset+(part.index?part.index.array[i]:i);
        indexOffset+=length;vertexOffset+=part.attributes.position.count;
      }
      geometry.setIndex(new THREE.BufferAttribute(indices,1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const combined=this.mesh(geometry,batch.material,root,batch.shadow);
      combined.name='woodland river details';
      batch.objects.forEach(o=>{o.removeFromParent();retired.add(o.geometry);});
      transformed.forEach(g=>g.dispose());
    }
    retired.forEach(geometry=>geometry.dispose());
  }


  bindEvents() {
    this.onPointerDown=e=>{this.pointerDown={x:e.clientX,y:e.clientY,time:performance.now()};};
    this.onPointerUp=e=>{
      if(!this.pointerDown||Math.hypot(e.clientX-this.pointerDown.x,e.clientY-this.pointerDown.y)>12)return;
      this.pointerDown=null;
      const r=this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const hit=this.raycaster.intersectObject(this.water,false)[0];
      if(!hit)return;
      const {x,z}=hit.point;
      const obstruction=this.raycaster.intersectObjects(this.castOccluders,false)[0];
      if(obstruction&&obstruction.distance<hit.distance-.005)return;
      const spot=(x>2.8&&z<-0.6)||(x<-1.7&&z>1.8)?'reeds':x>1.65?'deep':'open';
      this.host.dispatchEvent(new CustomEvent('fishing-spot',{detail:{spot,target:{x,z}}}));
    };
    this.onContextLost=e=>{e.preventDefault();this.contextLost=true;this.host.dispatchEvent(new CustomEvent('fishing-scene-lost'));};
    this.onContextRestored=()=>{this.contextLost=false;this.needsRender=true;this.renderer.shadowMap.needsUpdate=true;this.host.dispatchEvent(new CustomEvent('fishing-scene-restored'));};
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',this.onPointerDown);
    canvas.addEventListener('pointerup',this.onPointerUp);
    canvas.addEventListener('webglcontextlost',this.onContextLost);
    canvas.addEventListener('webglcontextrestored',this.onContextRestored);
  }

  aimAt({x,z}) {
    const along=clamp(Number.isFinite(z)?z:0,-48,48),{left,right}=this.riverEdges(along);
    this.target.set(clamp(Number.isFinite(x)?x:1.25,left+.08,right-.08),WATER_Y,along);
    this.castMarker.position.set(this.target.x,0,this.target.z);
    this.needsRender=true;
  }

  resize() {
    const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight),aspect=width/height;
    this.renderer.setSize(width,height,false);
    this.portrait=aspect<.85;
    // Mobile looks down the river. Its closer view crops the banks, not the game.
    if(this.portrait) {
      this.camera.position.set(7.6,12.7,15.95);
      this.camera.lookAt(-.3,.3,.25);
      const halfWidth=4.55;
      this.camera.left=-halfWidth;this.camera.right=halfWidth;
      this.camera.top=halfWidth/aspect;this.camera.bottom=-halfWidth/aspect;
      this.camera.setViewOffset(width,height,0,-height*.012,width,height);
    } else {
      this.camera.position.set(9.9,12.4,15.2);
      this.camera.lookAt(.0,.35,.0);
      const halfHeight=aspect>1.9?5.1:5.35;
      this.camera.left=-halfHeight*aspect;this.camera.right=halfHeight*aspect;
      this.camera.top=halfHeight;this.camera.bottom=-halfHeight;
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    this.needsRender=true;
    if(this.renderer.shadowMap)this.renderer.shadowMap.needsUpdate=true;
  }

  updateRod(session, t) {
    this.rodGrip.getWorldPosition(this.rodBase);
    const tension=clamp(session.tension||0,0,1),casting=session.phase==='casting';
    const cast=casting?clamp(session.phaseTime||0,0,1):1,flick=casting?Math.sin(cast*PI):0;
    const bob=session.phase==='reeling'?Math.sin(t*8)*.022:Math.sin(t*1.2)*.012;
    const base=this.rodBase;
    const x0=base.x,y0=base.y,z0=base.z;
    const x1=x0+.12,y1=y0+.62,z1=z0-.04;
    const x2=x0+.57+tension*.22,y2=y0+1.35-tension*.05,z2=z0-.09;
    const x3=x0+1.1-flick*.85,y3=y0+1.82+flick*.65-tension*.42+bob,z3=z0-.14-flick*.15;
    this.rodTip.set(x3,y3,z3);
    const positions=this.rodPositions.array,normals=this.rodNormals.array;
    // An analytic cubic and its tangent fill reusable tube buffers directly.
    // Its radial normals need no curve frames, normal pass, or bounds scan.
    for(let i=0;i<=this.rodSegments;i++) {
      const u=i/this.rodSegments,v=1-u,a=v*v*v,b=3*v*v*u,c=3*v*u*u,d=u*u*u;
      const px=a*x0+b*x1+c*x2+d*x3,py=a*y0+b*y1+c*y2+d*y3,pz=a*z0+b*z1+c*z2+d*z3;
      let tx=3*v*v*(x1-x0)+6*v*u*(x2-x1)+3*u*u*(x3-x2);
      let ty=3*v*v*(y1-y0)+6*v*u*(y2-y1)+3*u*u*(y3-y2);
      let tz=3*v*v*(z1-z0)+6*v*u*(z2-z1)+3*u*u*(z3-z2);
      const inverseLength=1/Math.hypot(tx,ty,tz);tx*=inverseLength;ty*=inverseLength;tz*=inverseLength;
      const inverseSide=1/Math.hypot(tx,ty),nx=-ty*inverseSide,ny=tx*inverseSide;
      const bx=-tz*ny,by=tz*nx,bz=tx*ny-ty*nx,r=mix(.028,.011,u);
      for(let j=0;j<=this.rodSides;j++) {
        const cos=this.rodRadials[j*2],sin=this.rodRadials[j*2+1],index=(i*(this.rodSides+1)+j)*3;
        const dx=cos*nx+sin*bx,dy=cos*ny+sin*by,dz=sin*bz;
        positions[index]=px+r*dx;positions[index+1]=py+r*dy;positions[index+2]=pz+r*dz;
        normals[index]=dx;normals[index+1]=dy;normals[index+2]=dz;
      }
    }
    this.rodPositions.needsUpdate=true;this.rodNormals.needsUpdate=true;
    this.rodHandle.position.copy(base).addScaledVector(this.rodDirection,-.1);
    this.reel.position.set(base.x,base.y-.07,base.z+.075);
  }

  update(session,dt,{evening=false,rain=false,reducedMotion=false,discoveries=0}={}) {
    if(this.disposed||this.contextLost)return;
    const step=Math.min(dt||0,.06);
    const phase=session.phase||'idle',phaseTime=session.phaseTime||0,progress=clamp(session.progress||0,0,1),nibble=session.nibble||0;
    let fishMotion=step>0&&FISH_CAST_PHASES.has(phase);
    if(step>0&&!fishMotion)for(const fish of this.fishes)if(FISH_PATH_MODES.has(fish.mode)){fishMotion=true;break;}
    if(step===0||(reducedMotion&&!fishMotion)) {
      const pose=this.staticPose||(this.staticPose={});
      const poseTime=phase==='casting'||phase==='waiting'?phaseTime:0;
      const tension=session.tension||0,struggling=!!session.struggling,fishId=session.fish?.id||'';
      if(!this.needsRender&&this.hasStaticPose&&pose.phase===phase&&pose.time===poseTime&&
        pose.progress===progress&&pose.nibble===nibble&&pose.tension===tension&&pose.struggling===struggling&&
        pose.fishId===fishId&&pose.evening===evening&&pose.rain===rain&&pose.reducedMotion===reducedMotion&&pose.discoveries===discoveries)return;
      pose.phase=phase;pose.time=poseTime;pose.progress=progress;pose.nibble=nibble;pose.tension=tension;
      pose.struggling=struggling;pose.fishId=fishId;pose.evening=evening;pose.rain=rain;
      pose.reducedMotion=reducedMotion;pose.discoveries=discoveries;this.hasStaticPose=true;
    } else this.hasStaticPose=false;
    if(!reducedMotion)this.time+=step;
    const t=this.time;
    this.updateRod(session,t);
    this.castMarker.visible=phase==='idle';
    this.bobber.visible=!['idle','caught','escaped'].includes(phase);
    this.line.visible=!['idle','escaped'].includes(phase);
    this.bobberRipple.visible=this.bobber.visible&&phase!=='casting';
    const bobberPosition=this.bobberPosition.copy(this.target);
    if(phase==='casting') {
      const p=clamp(phaseTime,0,1),ease=1-Math.pow(1-p,2);
      bobberPosition.copy(this.rodTip).lerp(this.target,ease);bobberPosition.y+=Math.sin(p*PI)*1.0;
    } else if(phase==='reeling') {
      bobberPosition.lerp(this.reelTarget,progress*.84);
      bobberPosition.x+=Math.sin(t*12)*(session.struggling?.1:.025)*(1-progress);
      bobberPosition.z+=Math.cos(t*9)*.065*(1-progress);
    }
    const resident=this.updateResidentFish(session,step,bobberPosition,reducedMotion);
    if(phase==='caught'&&resident)this.fishMouth(resident,bobberPosition);
    const visibleNibble=resident?.nearHook?nibble:0;
    const dip=phase==='bite'?-.08+Math.sin(t*14)*.055:-visibleNibble*.065;
    bobberPosition.y+=(phase==='casting'?0:Math.sin(t*2.8)*.016+dip);
    this.bobber.position.copy(bobberPosition);
    this.bobber.rotation.z=(phase==='bite'?Math.sin(t*12)*.24:Math.sin(t*1.7)*.065);
    this.bobberRipple.position.set(bobberPosition.x,.139,bobberPosition.z);
    this.bobberRipple.scale.setScalar(1+(Math.sin(t*2.7)+1)*.18+visibleNibble*.3);
    this.bobberRipple.material.opacity=phase==='bite'?.8:.45;
    this.castMarker.children.forEach((r,i)=>{r.scale.setScalar(1+Math.sin(t*1.3+i*.7)*.035);});
    const linePos=this.line.geometry.attributes.position;
    for(let i=0;i<=32;i++) {
      const p=i/32;
      linePos.setXYZ(i,mix(this.rodTip.x,bobberPosition.x,p),
        mix(this.rodTip.y,bobberPosition.y,p)-Math.sin(p*PI)*(phase==='reeling'?.09:.25),
        mix(this.rodTip.z,bobberPosition.z,p));
    }
    linePos.needsUpdate=true;
    this.hookLeader.visible=['waiting','bite','reeling'].includes(phase);
    if(this.hookLeader.visible) {
      const leader=this.hookLeader.geometry.attributes.position;
      leader.setXYZ(0,bobberPosition.x,bobberPosition.y,bobberPosition.z);
      leader.setXYZ(1,this.hookPoint.x,this.hookPoint.y,this.hookPoint.z);leader.needsUpdate=true;
    }
    this.head.rotation.z=phase==='reeling'?Math.sin(t*6)*.025:Math.sin(t*.65)*.018;
    this.character.rotation.z=phase==='reeling'?-.035-Math.sin(t*6)*.015:0;
    this.plants.forEach(p=>{p.group.rotation.z=p.tilt+Math.sin(t*.85+p.phase)*(rain?.032:.022);});
    this.flowLines.forEach(f=>{f.line.position.z=Math.sin(t*.33+f.phase)*.13;});
    this.glintMaterials.forEach((m,i)=>{m.opacity=.15+(Math.sin(t*.55+i*2.1)+1)*.09;});
    this.reflectionMat.opacity=.055+(Math.sin(t*.38)+1)*.024;
    this.bubbleMeshes.forEach((b,i)=>{
      b.visible=phase==='bite'||phase==='reeling';
      b.position.set(bobberPosition.x+Math.sin(i*2.7)*.19,.141,bobberPosition.z+Math.cos(i*2.7)*.19);
      const pulse=((t*1.8+i*.22)%1);b.scale.setScalar(.4+pulse*1.7);b.material.opacity=(1-pulse)*.5;
    });
    if(step>0||this.lastOtterDiscoveries!==discoveries) {
      this.otter.visible=discoveries>=3 && (reducedMotion || this.time%27>18);
      if(this.otter.visible) {
        const ot=reducedMotion?1:clamp(Math.min((this.time%27-18)/1.3,(27-this.time%27)/1.2),0,1);
        this.otter.position.y=mix(-.3,.13,Math.sin(ot*PI/2));
        this.otter.rotation.y=.9+Math.sin(t*.8)*.12;
      }
      this.lastOtterDiscoveries=discoveries;
    }
    // A paused controller or reduced motion freezes the shower without hiding it.
    this.rainLines.visible=rain;
    this.rainRippleGroup.visible=rain;
    if(this.rainLines.visible) {
      const rp=this.rainLines.geometry.attributes.position;
      const side=this.rainSide.set(1,0,0).applyQuaternion(this.camera.quaternion);
      const pixel=(this.camera.right-this.camera.left)/Math.max(1,this.host.clientWidth);
      this.rainSeeds.forEach((r,i)=>{
        const y=(r.y-this.time*3.8*r.s%6+6)%6;
        const half=pixel*.85*r.width,top=half*.45,v=i*4;
        rp.setXYZ(v,r.x-side.x*top,y-side.y*top,r.z-side.z*top);
        rp.setXYZ(v+1,r.x+side.x*top,y+side.y*top,r.z+side.z*top);
        rp.setXYZ(v+2,r.x-.065-side.x*half,y-r.length-side.y*half,r.z+.025-side.z*half);
        rp.setXYZ(v+3,r.x-.065+side.x*half,y-r.length+side.y*half,r.z+.025+side.z*half);
      });rp.needsUpdate=true;
      this.rainRipples.forEach((r,i)=>{
        const pulse=(t*.74+r.phase)%1;
        r.mesh.scale.setScalar(.2+pulse*1.8);
        r.mesh.material.opacity=Math.sin(pulse*PI)*(1-pulse*.5)*.48;
        // A pair of tiny beads lifts from each impact, then settles back into the river.
        for(let j=0;j<2;j++) {
          const p=pulse/.42,alive=p<1,angle=i*2.4+j*PI;
          const travel=.035+Math.min(p,1)*(.09+j*.035),pose=this.rainDropletPose;
          pose.position.set(r.mesh.position.x+Math.cos(angle)*travel,.16+(alive?Math.sin(p*PI)*(.13-j*.035):0),r.mesh.position.z+Math.sin(angle)*travel);
          const size=alive?(1-p*.55)*(j?.75:1):0;
          pose.scale.set(size,size*(1.25+Math.sin(Math.min(p,1)*PI)*.4),size);
          pose.updateMatrix();this.rainDroplets.setMatrixAt(i*2+j,pose.matrix);
        }
      });
      this.rainDroplets.instanceMatrix.needsUpdate=true;
    }
    const desired=evening?1:0;
    this.eveningAmount=mix(this.eveningAmount||0,desired,step>0&&!reducedMotion?Math.min(1,step*2):1);
    const e=this.eveningAmount;
    if(this.lastPalette!==e||this.lastRain!==rain) {
      const ground=new THREE.Color(rain?'#a5b9aa':'#b8c9b3').lerp(new THREE.Color('#526c60'),e);
      this.scene.background.copy(ground);this.scene.fog.color.copy(ground);this.floorMat.color.copy(ground);
      this.scene.fog.near=rain?28:37;this.scene.fog.far=rain?64:78;
      this.sun.color.set(rain?'#e4e7d3':'#fff0ca').lerp(new THREE.Color('#e4b88d'),e);
      this.sun.intensity=mix(rain?2.2:3.1,1.1,e);
      this.hemisphere.intensity=mix(rain?1.8:2.15,1.15,e);
      this.waterMat.color.set(rain?'#c5d3cd':'#ffffff');this.waterMat.roughness=rain?.34:.2;
      this.lanternGlass.emissiveIntensity=mix(.32,1.1,e);
      this.lanternLight.intensity=mix(.3,2.2,e);
      this.lastPalette=e;
      this.lastRain=rain;
    }
    if(this.renderer.shadowMap&&phase!==this.previousPhase)this.renderer.shadowMap.needsUpdate=true;
    this.renderer.render(this.scene,this.camera);
    this.needsRender=false;
    this.previousPhase=phase;
  }

  dispose() {
    this.disposed=true;this.observer?.disconnect();
    const canvas=this.renderer.domElement;
    canvas.removeEventListener('pointerdown',this.onPointerDown);canvas.removeEventListener('pointerup',this.onPointerUp);
    canvas.removeEventListener('webglcontextlost',this.onContextLost);canvas.removeEventListener('webglcontextrestored',this.onContextRestored);
    const geometries=new Set(),materials=new Set();
    this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    this.castOccluders?.forEach(o=>o.geometry.dispose());
    this.renderer.dispose();canvas.remove();
  }
}

// The journal uses the very same authored fish anatomy as the living river.
export function createFishModel(species = {}) {
  return createRiverFish(species,1);
}
