import * as THREE from '../claw/vendor/three.module.min.js';

// A small river made from clay, old timber, and a little blue-green resin.
// Coordinates are metres in the miniature: y is up, the dock is west of the pool.
const PI = Math.PI;
const WATER_Y = 0.12;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

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
    depth, bevelEnabled: bevel > 0, bevelSegments: 3,
    steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 8,
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
    this.scene.background = new THREE.Color('#d9dfc8');
    this.scene.fog = new THREE.Fog('#d9dfc8', 25, 55);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, innerWidth < 720 ? 1.3 : 1.7));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:manipulation;';
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80);
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
    const m = this.mesh(new THREE.SphereGeometry(1, detail, Math.max(8, detail / 2)), typeof color === 'string' ? this.material(color) : color, parent);
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
    const shadowSize=typeof innerWidth!=='undefined'&&innerWidth<720?1024:2048;
    this.sun.shadow.mapSize.set(shadowSize,shadowSize);
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 8, bottom: -8, near: 1, far: 30 });
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.0001;
    this.sun.shadow.radius = 5;
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight('#c6e6dc', 0.7);
    fill.position.set(8, 6, -9);
    this.scene.add(fill);
    this.floorMat = this.material('#d9dfc8');
    const floor = this.mesh(new THREE.PlaneGeometry(180, 180), this.floorMat, this.scene, false);
    floor.rotation.x = -PI / 2;
    floor.position.y = -1.13;
  }

  buildRiver() {
    const outline = [[-5.55,-2.7],[-4.8,-3.65],[-1.4,-3.8],[2.8,-3.75],[5.35,-2.95],[5.7,-0.2],[5.5,2.9],[3.9,3.7],[-0.2,3.8],[-4.8,3.4],[-5.65,1.7]];
    const base = this.mesh(organicGeometry(outline, 0.48, 0.17), this.material('#a89775'));
    base.position.y = -0.91;
    const strata = this.mesh(organicGeometry(outline.map(([x,z]) => [x*.995,z*.995]), 0.15, 0.1), this.material('#d5c39c'));
    strata.position.y = -0.42;
    const bed = this.mesh(organicGeometry(outline.map(([x,z]) => [x*.99,z*.99]), 0.08, 0.1), this.material('#80aca0', 0.75));
    bed.position.y = -0.31;
    this.waterSideMat = this.material('#82bfb1', 0.24, { transparent: true, opacity: 0.54, depthWrite: false, metalness: 0.05 });
    const resin = this.mesh(organicGeometry(outline.map(([x,z]) => [x*.985,z*.985]), 0.3, 0.08), this.waterSideMat, this.world, false);
    resin.position.y = -0.25;
    this.waterMat = this.material('#acd8c7', 0.17, { transparent: true, opacity: 0.3, depthWrite: false, metalness: 0.07, side: THREE.DoubleSide });
    this.water = this.mesh(new THREE.ShapeGeometry(roundedShape(outline.map(([x,z]) => [x*.98,z*.98])), 18), this.waterMat, this.world, false);
    this.water.rotation.x = -PI / 2;
    this.water.position.y = WATER_Y;
    this.water.renderOrder = 3;
    // A darker bed gives the deep end an actual visible contour under the resin.
    for (let i=0;i<4;i++) {
      const pool = this.ball(2.05, -0.115 + i*.003, .1, 2.15-i*.23, .026, 2.4-i*.22, this.material(['#609b94','#5a9892','#55958e','#57998f'][i]), this.world, 32);
      pool.rotation.y = -.25;
      pool.castShadow = false;
    }
    const pebbleColors = ['#b6c5ad','#8fa996','#d1c6a9','#a3b6a4','#d3d5b9'];
    for (let i=0;i<95;i++) {
      const x = -4.7+this.rand()*9.5, z = -3.15+this.rand()*6.2;
      const s = .045+this.rand()*.14;
      const p = this.ball(x,-.075,z,s*1.5,s*.5,s,pebbleColors[i%5],this.world,8);
      p.rotation.y=this.rand()*PI;
      p.castShadow=false;
    }
    // Fine striations in the exposed clay edge.
    for(let i=0;i<25;i++) {
      const x=-4.6+i*.38;
      this.stick([x,-.65,3.62],[x+.14,-.64,3.64],.006,'#8f896e');
    }
  }

  stone(x,y,z,s=1,color='#b2b7a0',parent=this.world) {
    const m=this.ball(x,y,z,.34*s,.22*s,.28*s,color,parent,10);
    m.rotation.set(this.rand()*.22,this.rand()*PI,this.rand()*.15);
    return m;
  }

  blade(x,y,z,length,angle,color='#758e55',parent=this.world,width=.065) {
    const m=this.mesh(leafGeometry(length,width,.08),this.material(color,.86,{side:THREE.DoubleSide}),parent);
    m.position.set(x,y,z);
    m.rotation.set(.1+this.rand()*.2,angle,(this.rand()-.5)*.5);
    return m;
  }

  grass(x,z,s=1,parent=this.world,y=.42) {
    const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);
    for(let j=0;j<5;j++) this.blade((this.rand()-.5)*.12,0,(this.rand()-.5)*.12,(.25+this.rand()*.3)*s,j*1.8,['#6e8754','#90a56b','#a7b67e'][j%3],g,.035*s);
    this.plants.push({group:g,phase:this.rand()*6,tilt:g.rotation.z});
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
    const left=[[-5.5,-2.8],[-4.6,-3.55],[-2.7,-3.63],[-2.95,-2.6],[-3.35,-1.6],[-3.0,-.8],[-3.6,.05],[-3.45,1.15],[-2.6,2.05],[-2.9,3.48],[-4.8,3.3],[-5.5,1.5]];
    const soil=this.mesh(organicGeometry(left,.43,.15),this.material('#aa9473'));
    soil.position.y=-.15;
    this.bankMat=this.material('#91a86d');
    const moss=this.mesh(organicGeometry(left.map(([x,z])=>[x*.995,z*.995]),.13,.14),this.bankMat);
    moss.position.y=.3;
    const right=[ [3,-3.58],[4.8,-3.25],[5.45,-2.65],[5.53,-.7],[4.85,-.45],[4.4,-1.15],[3.8,-1.6],[3.15,-2.0],[2.4,-2.8] ];
    const isle=this.mesh(organicGeometry(right,.4,.14),this.material('#a18f72'));
    isle.position.y=-.15;
    const isleTop=this.mesh(organicGeometry(right,.13,.12),this.material('#9caf76'));
    isleTop.position.y=.28;
    this.terrainMeshes=[soil,moss,isle,isleTop];
    // Rounded stones follow the shore rather than a perfect decorative border.
    const shore=[[-2.8,-3.05],[-2.95,-2.55],[-3.25,-1.9],[-3.3,-1.6],[-3.1,-1.13],[-3.2,-.65],[-3.55,-.1],[-3.55,.4],[-3.35,1.2],[-2.85,1.85],[-2.65,2.1],[-2.65,2.7],[-2.85,3.1], [2.65,-2.7],[3.1,-2.2],[3.7,-1.8],[4.25,-1.35],[4.7,-.8],[5.05,-.55]];
    shore.forEach(([x,z],i)=>{
      const s=.7+this.rand()*.8;
      this.stone(x,.19,z,s,['#a8b3a0','#bec5ad','#9ca994','#d2c8a9'][i%4]);
      if(i%3===0) this.stone(x+.14,.34,z-.06,s*.48,'#9caf78');
    });
    for(let i=0;i<37;i++) {
      const z=-3.1+this.rand()*6.1,x=-5.1+this.rand()*1.4;
      if(Math.abs(z-.8)<.7&&x>-4.3) continue;
      this.grass(x,z,.55+this.rand()*.65);
      if(i%4===0)this.flower(x+.15,.45,z,.55+this.rand()*.5,['#edd8a3','#d4b6a3','#f4e8c8'][i%3]);
    }
    this.fern(-3.95,.45,-1.4,1.1,-.4);
    this.fern(-4.7,.45,2.45,.85,1.1);
    this.fern(4.85,.44,-1.6,.82,-1.2);
    this.fern(3.62,.43,-2.8,.75,1);
    // Short rounded trees leave the river and the fisher unobscured.
    this.tree(-4.55,-2.55,1.05);
    this.tree(-5.0,.45,.78);
    this.tree(4.8,-2.8,.84);
    this.buildReeds(3.65,-1.4,1);
    this.buildReeds(4.65,-.65,.8);
    this.buildReeds(-2.75,2.5,.68);
    // A stream slips between the rear rocks into the pool.
    this.stone(2.55,.34,-3.2,1.2,'#a7b29d');
    this.stone(3.2,.47,-3.33,1.7,'#aeb5a0');
    this.stone(3.8,.4,-3.45,1.3,'#bfc4aa');
    this.waterfall=this.mesh(new THREE.PlaneGeometry(.67,.63,5,8),this.material('#d0e8d8',.25,{transparent:true,opacity:.7,side:THREE.DoubleSide}),this.world,false);
    this.waterfall.position.set(2.99,.34,-2.94);this.waterfall.rotation.x=-.28;this.waterfall.rotation.y=-.23;
    for(let i=0;i<7;i++) {
      const foam=this.ball(2.65+this.rand()*.67,.145,-2.65+this.rand()*.3,.06+this.rand()*.08,.018,.035,'#e0edda',this.world,8);
      foam.castShadow=false;
    }
    this.fallRipple=this.ring(2.95,.139,-2.5,.58,'#cce7d2',this.world,.5);
    this.fallRipple.scale.z=.55;
    // Little mushrooms and a forgotten terracotta cup reward a closer look.
    for(let i=0;i<3;i++) {
      const x=-4.3+i*.12,z=1.98+(i%2)*.15;
      this.stick([x,.43,z],[x,.56+i*.025,z],.022,'#e6d6b7');
      this.ball(x,.58+i*.025,z,.11,.065,.1,i===1?'#bd7c57':'#d0a375',this.world,12);
    }
  }

  tree(x,z,s) {
    const g=new THREE.Group();g.position.set(x,.44,z);g.scale.setScalar(s);this.world.add(g);
    this.tube([[0,0,0],[.03,.6,0],[-.04,1.2,-.02]],.105,'#8c795b',g);
    this.stick([0,.6,0],[.45,1.2,.03],.05,'#8c795b',g,.028);
    this.stick([0,.85,0],[-.34,1.4,-.1],.05,'#8c795b',g,.02);
    [[-.35,1.55,-.1,.6],[.28,1.5,.05,.64],[0,1.92,-.05,.62],[.03,1.52,-.4,.5]].forEach(([a,b,c,r],i)=>{
      const m=this.ball(a,b,c,r,r*.85,r*.82,['#7c965f','#98ac73','#8fa66b','#738e5a'][i],g,14);
      m.rotation.z=.2;
    });
    // Pale seed clusters, rather than perfectly featureless green balls.
    for(let j=0;j<7;j++) {
      const a=this.rand()*PI*2;
      this.ball(Math.cos(a)*.5,1.65+this.rand()*.4,.25+Math.sin(a)*.28,.035,.04,.035,'#c7cd95',g,6);
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
    this.lanternLight=new THREE.PointLight('#ffc879',.4,4,2);this.lanternLight.position.set(x,y+.3,z);this.world.add(this.lanternLight);
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
    this.rodCurve=new THREE.CatmullRomCurve3([V(),V(0,1,0),V(0,2,0),V(0,3,0)]);
    this.rod=this.mesh(new THREE.TubeGeometry(this.rodCurve,28,.023,5,false),this.rodMaterial);
    this.rodPositions=this.rod.geometry.attributes.position;
    this.rodPositions.setUsage(THREE.DynamicDrawUsage);
    this.rodTip=V();this.rodBase=V();
    this.rodHandle=this.stick([0,0,0],[0,.35,0],.045,'#b49a64');
    this.reel=this.mesh(new THREE.TorusGeometry(.1,.03,8,16),this.material('#7b8d77',.38));
    this.lineMaterial=new THREE.LineBasicMaterial({color:'#f2e7c6',transparent:true,opacity:.88});
    const lineGeometry=new THREE.BufferGeometry();
    lineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(33*3),3));
    lineGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.line=new THREE.Line(lineGeometry,this.lineMaterial);this.world.add(this.line);
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
    this.catchFish=this.makeFish('#d8b878','#c48f60',.8,this.catchDisplay);
    this.catchFish.rotation.z=-.3;
  }

  makeFish(color,accent,scale=1,parent=this.world,id='') {
    const g=new THREE.Group();g.scale.setScalar(scale);parent.add(g);
    const body=this.ball(0,0,0,.32,.095,.12,color,g,16);
    this.ball(.18,.014,0,.12,.09,.11,color,g,12);
    this.ball(-.02,-.035,0,.22,.055,.105,accent,g,12);
    const tailShape=new THREE.Shape();tailShape.moveTo(-.23,0);tailShape.quadraticCurveTo(-.4,.06,-.49,.14);tailShape.quadraticCurveTo(-.45,0,-.49,-.14);tailShape.quadraticCurveTo(-.37,-.06,-.23,0);
    const tail=this.mesh(new THREE.ShapeGeometry(tailShape,6),this.material(accent,.75,{side:THREE.DoubleSide}),g);
    tail.rotation.x=PI/2;tail.position.y=.012;g.userData.tail=tail;
    const fin=this.mesh(leafGeometry(.18,.05,.015),this.material(accent,.75,{side:THREE.DoubleSide}),g);
    fin.position.set(-.03,.05,0);fin.rotation.z=-1.1;fin.rotation.y=PI/2;
    for(const side of[-1,1]) {
      this.ball(.2,.04,side*.091,.018,.022,.008,'#f4dfb0',g,8);
      this.ball(.205,.041,side*.097,.009,.013,.004,'#3f5145',g,8);
      const f=this.mesh(leafGeometry(.13,.045,.01),this.material(accent,.75,{side:THREE.DoubleSide}),g);
      f.position.set(.065,-.01,side*.08);f.rotation.set(side*1.1,side*.4,-1.8);
    }
    // Flecks on the back make distinct fish visible through the water.
    for(let i=0;i<5;i++)this.ball(-.15+i*.065,.081+Math.sin(i)*.004,(i%2-.5)*.045,.012,.006,.009,accent,g,6);
    g.userData.body=body;
    this.decorateFish(g,id,accent);
    return g;
  }

  decorateFish(g,id,accent) {
    const factors={
      'willow-minnow':[1,.77,.8], 'copper-perch':[1,1.18,1],
      'pebble-loach':[1.24,.7,.86], 'ribbon-dace':[1.18,.78,.82],
      'clover-carp':[1.06,1.38,1.27], 'glassfin':[.98,.9,.84],
      'moon-bream':[.86,1.65,1.2], 'starfin':[1,1.13,1.08],
    }[id];
    if(factors)g.scale.multiply(V(...factors));
    if(id==='copper-perch')for(let i=0;i<5;i++) {
      const x=-.16+i*.07;
      this.tube([[x,.035,-.102],[x,.089,-.055],[x,.101,0],[x,.089,.055],[x,.035,.102]],.009,'#8b7153',g,12);
    }
    if(id==='pebble-loach'||id==='clover-carp')for(const side of[-1,1]) {
      this.tube([[.27,-.025,side*.04],[.34,-.055,side*.1],[.39,-.05,side*.13]],.005,'#c5b88f',g,10);
    }
    if(id==='ribbon-dace')for(const side of[-1,1])this.tube([[-.24,0,side*.07],[-.03,.015,side*.12],[.22,.02,side*.08]],.013,accent,g,14);
    if(id==='moon-bream'||id==='starfin'||id==='glassfin') {
      for(const side of[-1,1]) {
        const fin=this.mesh(leafGeometry(id==='starfin'?.3:.24,.085,.015),this.material(accent,.6,{side:THREE.DoubleSide,transparent:id==='glassfin',opacity:id==='glassfin'?.58:1}),g);
        fin.position.set(-.09,side*.055,0);fin.rotation.z=side>0?-1.1:-2.0;fin.rotation.y=PI/2;
        if(id==='starfin')for(let i=0;i<4;i++)this.ball(-.13+i*.055,side*(.10+i*.012),.015,.009,.009,.006,'#fff0bd',g,6);
      }
    }
  }

  fitSwimmingFish(group) {
    // The specimen sculpt keeps its full fins in the notebook. Underwater its
    // vertical profile is compressed by the shallow resin and its refraction.
    group.updateMatrixWorld(true);
    let box=new THREE.Box3().setFromObject(group);
    const height=box.max.y-box.min.y;
    group.scale.y*=Math.min(1,.15/height);
    group.updateMatrixWorld(true);
    box=new THREE.Box3().setFromObject(group);
    group.userData.swimOffsetY=-(box.min.y+box.max.y)/2;
    return group;
  }

  buildFish() {
    const colors=[['#c8bc86','#9e9e63'],['#cf9b75','#aa7656'],['#e4c88a','#b29c65'],['#89a8a0','#5c8e83'],['#91aaa7','#6a8c80'],['#d7b47b','#b18659'],['#a7b8a4','#75988a']];
    for(let i=0;i<7;i++) {
      const ids=['willow-minnow','copper-perch','clover-carp','ribbon-dace','pebble-loach','copper-perch','glassfin'];
      const g=this.makeFish(...colors[i],.72+(i%3)*.13,this.world,ids[i]);
      this.fitSwimmingFish(g);
      const f={group:g,x:.1+(i%3)*1.1,z:-1.9+Math.floor(i/3)*1.4,phase:i*1.7,speed:.18+this.rand()*.1,radius:.35+this.rand()*.5};
      g.position.set(f.x,-.015,f.z);this.fishes.push(f);
    }
    this.hookedFish=this.fitSwimmingFish(this.makeFish('#d7b97c','#ad925a',1.02));
    this.hookedFish.visible=false;
  }

  buildWaterDetails() {
    this.flowLines=[];
    const lineMat=new THREE.LineBasicMaterial({color:'#e3ecd0',transparent:true,opacity:.38,depthWrite:false});
    const paths=[[-.9,-2.55,1.1],[-.2,2.4,1.6],[1.2,-1.7,1.1],[3.4,1.9,1.1],[3.8,.6,.6],[-1.6,-.6,.7],[.6,3,1.2],[4.2,-2.3,.4]];
    paths.forEach(([x,z,l],i)=>{
      const curve=new THREE.CatmullRomCurve3([V(x,.143,z),V(x+l*.3,.143,z+.06),V(x+l*.7,.143,z+.025),V(x+l,.143,z+.07)]);
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(18)),lineMat);this.world.add(line);
      this.flowLines.push({line,x,phase:i});
    });
    // Thin broken highlights read as resin rather than a flat blue floor.
    for(let i=0;i<18;i++) {
      const x=-1.7+this.rand()*6.5,z=-3+this.rand()*6;
      const r=this.ring(x,.137,z,.07+this.rand()*.12,'#d7e5c9',this.world,.18);
      r.scale.z=.45;
    }
    // Floating lily pads at the quiet right edge: shaped not circular discs.
    for(let i=0;i<4;i++) {
      const x=4.15+(i%2)*.47,z=.8+Math.floor(i/2)*.65;
      const shape=new THREE.Shape();shape.moveTo(0,0);shape.absarc(0,0,.21+i*.015,.12,PI*2-.12,false);shape.lineTo(0,0);
      const pad=this.mesh(new THREE.ShapeGeometry(shape,24),this.material(i%2?'#91aa6f':'#769b67',.8,{side:THREE.DoubleSide}),this.world,false);
      pad.rotation.x=-PI/2;pad.rotation.z=i*.9;pad.position.set(x,.144,z);
      this.tube([[x,.149,z],[x-.08,.15,z-.06],[x-.17,.15,z-.09]],.004,'#b3c185');
      if(i===2) {
        for(let p=0;p<7;p++) {
          const a=p*PI*2/7;
          const leaf=this.mesh(leafGeometry(.17,.065,.025),this.material('#e9d7ba',.8,{side:THREE.DoubleSide}));
          leaf.position.set(x,.15,z);leaf.rotation.set(Math.cos(a)*1.1,a,Math.sin(a)*1.1);
        }
        this.ball(x,.18,z,.04,.035,.04,'#d4b575');
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
    this.stone(-3.04,.18,-1.52,.92,'#b7bfaa');
  }

  buildRain() {
    const n=110,positions=new Float32Array(n*6);this.rainSeeds=[];
    for(let i=0;i<n;i++)this.rainSeeds.push({x:-6+this.rand()*12,z:-4+this.rand()*8,y:this.rand()*6,s:.65+this.rand()*.5});
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.rainLines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#e2e9dc',transparent:true,opacity:.45,depthWrite:false}));
    this.world.add(this.rainLines);this.rainLines.visible=false;
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
    // Preserve the moving sculptures, and join the hundreds of little nails,
    // stones, stems and wicker strands into a few material-sized draw calls.
    const moving = new Set([
      this.character,this.rod,this.rodHandle,this.reel,this.bobber,this.bobberRipple,
      this.castMarker,this.catchDisplay,this.hookedFish,this.water,this.waterfall,
      this.fallRipple,this.otter,...this.fishes.map(f=>f.group),...this.bubbleMeshes,
    ]);
    this.world.updateMatrixWorld(true);
    const batches=new Map();
    this.world.traverse(object=>{
      if(!object.isMesh || Array.isArray(object.material) || object.material.transparent)return;
      for(let p=object;p&&p!==this.world;p=p.parent)if(moving.has(p))return;
      const attrs=Object.keys(object.geometry.attributes).filter(k=>['position','normal','uv'].includes(k)).sort();
      const key=`${object.material.uuid}:${object.castShadow}:${attrs.join(',')}`;
      if(!batches.has(key))batches.set(key,{objects:[],attrs,material:object.material,shadow:object.castShadow});
      batches.get(key).objects.push(object);
    });
    for(const batch of batches.values()) {
      if(batch.objects.length<2)continue;
      const transformed=batch.objects.map(o=>{
        const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);return g;
      });
      const count=transformed.reduce((sum,g)=>sum+g.attributes.position.count,0);
      const geometry=new THREE.BufferGeometry();
      for(const name of batch.attrs) {
        const size=transformed[0].attributes[name].itemSize;
        const values=new Float32Array(count*size);let offset=0;
        transformed.forEach(g=>{values.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;});
        geometry.setAttribute(name,new THREE.BufferAttribute(values,size));
      }
      geometry.computeBoundingSphere();
      const combined=this.mesh(geometry,batch.material,this.world,batch.shadow);
      combined.name='handmade river details';
      batch.objects.forEach(o=>{o.removeFromParent();o.geometry.dispose();});
      transformed.forEach(g=>g.dispose());
    }
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
    this.onContextRestored=()=>{this.contextLost=false;this.host.dispatchEvent(new CustomEvent('fishing-scene-restored'));};
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',this.onPointerDown);
    canvas.addEventListener('pointerup',this.onPointerUp);
    canvas.addEventListener('webglcontextlost',this.onContextLost);
    canvas.addEventListener('webglcontextrestored',this.onContextRestored);
  }

  aimAt({x,z}) {
    this.target.set(clamp(x,-2.2,4.8),WATER_Y,clamp(z,-3.1,3.05));
    this.castMarker.position.set(this.target.x,0,this.target.z);
  }

  resize() {
    const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight),aspect=width/height;
    this.renderer.setSize(width,height,false);
    this.portrait=aspect<.85;
    // Mobile looks down the river. Its closer view crops the banks, not the game.
    if(this.portrait) {
      this.camera.position.set(7.9,12.7,15.8);
      this.camera.lookAt(.0,.3,.1);
      const halfWidth=4.43;
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
  }

  updateRod(session, t) {
    this.character.updateWorldMatrix(true,true);
    this.rodGrip.getWorldPosition(this.rodBase);
    const tension=clamp(session.tension||0,0,1);
    const casting=session.phase==='casting';
    const cast=casting?clamp((session.phaseTime||0),0,1):1;
    const flick=casting?Math.sin(cast*PI):0;
    const bob=(session.phase==='reeling'?Math.sin(t*8)*.022:Math.sin(t*1.2)*.012);
    const base=this.rodBase;
    const tip=V(base.x+1.1-flick*.85,base.y+1.82+flick*.65-tension*.42,base.z-.14-flick*.15);
    this.rodCurve.points=[base.clone(),V(base.x+.12,base.y+.62,base.z-.04),V(base.x+.57+tension*.22,base.y+1.35-tension*.05,base.z-.09),tip];
    this.rodTip.copy(tip);this.rodTip.y+=bob;
    this.rodCurve.points[3].y+=bob;
    const frames=this.rodCurve.computeFrenetFrames(28,false),pos=this.rodPositions;
    for(let i=0;i<=28;i++) {
      const p=this.rodCurve.getPointAt(i/28),r=mix(.028,.011,i/28);
      for(let j=0;j<=5;j++) {
        const a=j/5*PI*2,c=Math.cos(a)*r,s=Math.sin(a)*r,index=(i*6+j)*3;
        pos.array[index]=p.x+c*frames.normals[i].x+s*frames.binormals[i].x;
        pos.array[index+1]=p.y+c*frames.normals[i].y+s*frames.binormals[i].y;
        pos.array[index+2]=p.z+c*frames.normals[i].z+s*frames.binormals[i].z;
      }
    }
    pos.needsUpdate=true;this.rod.geometry.computeVertexNormals();this.rod.geometry.computeBoundingSphere();
    const handleDir=this.rodCurve.getTangentAt(.02);
    this.rodHandle.position.copy(base).addScaledVector(handleDir,-.1);
    this.rodHandle.quaternion.setFromUnitVectors(V(0,1,0),handleDir);
    this.reel.position.copy(base).add(V(0,-.07,.075));this.reel.rotation.y=.2;
  }

  update(session,dt,{evening=false,rain=false,reducedMotion=false,discoveries=0}={}) {
    if(this.disposed||this.contextLost)return;
    const step=Math.min(dt||0,.06);
    if(!reducedMotion)this.time+=step;
    const t=this.time;
    const phase=session.phase||'idle',phaseTime=session.phaseTime||0,progress=clamp(session.progress||0,0,1),nibble=session.nibble||0;
    this.updateRod(session,t);
    this.castMarker.visible=phase==='idle';
    this.bobber.visible=!['idle','caught','escaped'].includes(phase);
    this.line.visible=!['idle','caught','escaped'].includes(phase);
    this.bobberRipple.visible=this.bobber.visible&&phase!=='casting';
    const bobberPosition=this.target.clone();
    if(phase==='casting') {
      const p=clamp(phaseTime,0,1),ease=1-Math.pow(1-p,2);
      bobberPosition.copy(this.rodTip).lerp(this.target,ease);bobberPosition.y+=Math.sin(p*PI)*1.0;
    } else if(phase==='reeling') {
      bobberPosition.lerp(V(-.74,WATER_Y,.95),progress*.84);
      bobberPosition.x+=Math.sin(t*12)*(session.struggling?.1:.025)*(1-progress);
      bobberPosition.z+=Math.cos(t*9)*.065*(1-progress);
    }
    const dip=phase==='bite'?-.08+Math.sin(t*14)*.055:-nibble*.065;
    bobberPosition.y+=(phase==='casting'?0:Math.sin(t*2.8)*.016+dip);
    this.bobber.position.copy(bobberPosition);
    this.bobber.rotation.z=(phase==='bite'?Math.sin(t*12)*.24:Math.sin(t*1.7)*.065);
    this.bobberRipple.position.set(bobberPosition.x,.139,bobberPosition.z);
    this.bobberRipple.scale.setScalar(1+(Math.sin(t*2.7)+1)*.18+nibble*.3);
    this.bobberRipple.material.opacity=phase==='bite'?.8:.45;
    this.castMarker.children.forEach((r,i)=>{r.scale.setScalar(1+Math.sin(t*1.3+i*.7)*.035);});
    const linePos=this.line.geometry.attributes.position;
    for(let i=0;i<=32;i++) {
      const p=i/32,v=this.rodTip.clone().lerp(bobberPosition,p);
      v.y-=Math.sin(p*PI)*(phase==='reeling'?.09:.25);
      linePos.setXYZ(i,v.x,v.y,v.z);
    }
    linePos.needsUpdate=true;this.line.geometry.computeBoundingSphere();
    if(session.fish?.id&&this.fishId!==session.fish.id) {
      this.fishId=session.fish.id;
      for(const old of[this.hookedFish,this.catchFish]){old.removeFromParent();old.traverse(o=>o.geometry?.dispose());}
      this.hookedFish=this.fitSwimmingFish(this.makeFish(session.fish.color,session.fish.accent,1.02,this.world,session.fish.id));
      this.catchFish=this.makeFish(session.fish.color,session.fish.accent,.8,this.catchDisplay,session.fish.id);
      this.catchFish.rotation.z=-.3;
    }
    const active=['waiting','bite','reeling'].includes(phase);
    this.hookedFish.visible=active;
    if(active) {
      const approach=phase==='waiting'?clamp(phaseTime/3,0,1):1;
      const orbit=phase==='waiting'?(1-approach)*.7+.13:.06;
      this.hookedFish.position.set(bobberPosition.x+Math.sin(t*1.6)*orbit,-.005+this.hookedFish.userData.swimOffsetY+Math.sin(t*2)*.005,bobberPosition.z+Math.cos(t*1.6)*orbit);
      this.hookedFish.rotation.y=-Math.cos(t*1.6)*.7+(phase==='reeling'?PI:0);
      this.hookedFish.rotation.z=phase==='bite'?Math.sin(t*12)*.04:0;
      this.hookedFish.userData.tail.rotation.z=Math.sin(t*(phase==='reeling'?20:7))*.45;
      if(session.fish?.color&&this.fishColor!==session.fish.color) {
        this.fishColor=session.fish.color;
        this.hookedFish.userData.body.material=this.material(session.fish.color,.7);
        this.catchFish.userData.body.material=this.material(session.fish.color,.7);
      }
    }
    this.fishes.forEach((f,i)=>{
      const a=t*f.speed+f.phase;
      f.group.position.set(f.x+Math.cos(a)*f.radius,-.005+f.group.userData.swimOffsetY+Math.sin(a*1.7)*.008,f.z+Math.sin(a)*f.radius*.55);
      f.group.rotation.y=Math.atan2(-Math.cos(a)*.55,-Math.sin(a));
      f.group.userData.tail.rotation.z=Math.sin(t*6+i)*.24;
      f.group.visible=!(active&&f.group.position.distanceTo(this.target)<.65);
    });
    this.catchDisplay.visible=phase==='caught';
    if(phase==='caught') {
      this.catchDisplay.position.set(-.7,1.65,1.07);this.catchDisplay.rotation.y=-.3;
      this.catchFish.rotation.z=-.2+Math.sin(t*5)*.05;
      this.catchFish.userData.tail.rotation.z=Math.sin(t*8)*.2;
    }
    this.head.rotation.z=phase==='reeling'?Math.sin(t*6)*.025:Math.sin(t*.65)*.018;
    this.character.rotation.z=phase==='reeling'?-.035-Math.sin(t*6)*.015:0;
    this.plants.forEach(p=>{p.group.rotation.z=p.tilt+Math.sin(t*.85+p.phase)*.022;});
    this.flowLines.forEach(f=>{f.line.position.x=Math.sin(t*.35+f.phase)*.09;});
    this.fallRipple.scale.set(1+Math.sin(t*2)*.12,1,.55+Math.sin(t*2)*.06);
    this.waterfall.material.opacity=.63+Math.sin(t*5)*.06;
    this.bubbleMeshes.forEach((b,i)=>{
      b.visible=phase==='bite'||phase==='reeling';
      b.position.set(bobberPosition.x+Math.sin(i*2.7)*.19,.141,bobberPosition.z+Math.cos(i*2.7)*.19);
      const pulse=((t*1.8+i*.22)%1);b.scale.setScalar(.4+pulse*1.7);b.material.opacity=(1-pulse)*.5;
    });
    this.otter.visible=discoveries>=3 && (reducedMotion || this.time%27>18);
    if(this.otter.visible) {
      const ot=reducedMotion?1:clamp(Math.min((this.time%27-18)/1.3,(27-this.time%27)/1.2),0,1);
      this.otter.position.y=mix(-.3,.13,Math.sin(ot*PI/2));
      this.otter.rotation.y=.9+Math.sin(t*.8)*.12;
    }
    this.rainLines.visible=rain&&!reducedMotion;
    if(this.rainLines.visible) {
      const rp=this.rainLines.geometry.attributes.position;
      this.rainSeeds.forEach((r,i)=>{
        const y=(r.y-this.time*3.8*r.s%6+6)%6;
        rp.setXYZ(i*2,r.x,y,r.z);rp.setXYZ(i*2+1,r.x-.045,y-.19,r.z+.015);
      });rp.needsUpdate=true;
    }
    const desired=evening?1:0;
    this.eveningAmount=mix(this.eveningAmount||0,desired,step>0?Math.min(1,step*2):1);
    const e=this.eveningAmount;
    if(this.lastPalette!==e||this.lastRain!==rain) {
      const ground=new THREE.Color('#d9dfc8').lerp(new THREE.Color('#526c60'),e);
      this.scene.background.copy(ground);this.scene.fog.color.copy(ground);this.floorMat.color.copy(ground);
      this.sun.color.set('#fff0ca').lerp(new THREE.Color('#e4b88d'),e);
      this.sun.intensity=mix(rain?2.2:3.1,1.1,e);
      this.hemisphere.intensity=mix(rain?1.8:2.15,1.15,e);
      this.lanternGlass.emissiveIntensity=mix(.32,1.1,e);
      this.lanternLight.intensity=mix(.3,2.2,e);
      this.lastPalette=e;
      this.lastRain=rain;
    }
    this.renderer.render(this.scene,this.camera);
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

// The journal uses the same little sculpt as the river. Head points +x; the
// specimen is about .83 wide × .24 deep × .2 high, centred on the origin.
export function createFishModel(species = {}) {
  const builder = Object.create(FishingScene.prototype);
  builder.materials = new Map();
  builder.world = new THREE.Group();
  const model = builder.makeFish(species.color || '#d7b47b', species.accent || '#a88859', 1, builder.world,species.id||'');
  model.removeFromParent();
  return model;
}
