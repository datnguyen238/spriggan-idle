const test=require('node:test'),assert=require('node:assert/strict');
const {setupScene,stats,Life}=require('./helpers/claw-scene.cjs');

function materialKey(n){const m=n.material;return [m.type,m.color?.getHexString(),m.roughness,m.metalness,m.emissive?.getHexString(),m.emissiveIntensity,m.map?.image?.text,m.transparent,m.opacity,m.depthWrite,m.side,n.castShadow,n.receiveShadow,n.renderOrder].join(':');}
function surface(root,THREE){
  const result=new Map(),point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3(),matrix=new THREE.Matrix4(),instance=new THREE.Matrix4();root.updateMatrixWorld(true);
  root.traverse(n=>{if(!n.isMesh)return;const key=materialKey(n);if(!result.has(key))result.set(key,[]);const values=result.get(key),g=n.geometry;
    for(let draw=0;draw<(n.isInstancedMesh?n.count:1);draw++){
      if(n.isInstancedMesh){n.getMatrixAt(draw,instance);matrix.multiplyMatrices(n.matrixWorld,instance);}else matrix.copy(n.matrixWorld);
      normalMatrix.getNormalMatrix(matrix);
      for(let i=0;i<(g.index?.count??g.attributes.position.count);i++){
        const at=g.index?g.index.getX(i):i;point.fromBufferAttribute(g.attributes.position,at).applyMatrix4(matrix);
        normal.fromBufferAttribute(g.attributes.normal,at).applyNormalMatrix(normalMatrix);
        values.push(point.x,point.y,point.z,normal.x,normal.y,normal.z,g.attributes.uv.getX(at),g.attributes.uv.getY(at));
      }
    }
  });
  // Opaque batches may reorder objects; compare the complete triangle surfaces with float32 tolerance.
  for(const [key,values] of result){const triangles=[];for(let at=0;at<values.length;at+=24)triangles.push(values.slice(at,at+24));
    triangles.sort((a,b)=>{for(let i=0;i<24;i++)if(Math.abs(a[i]-b[i])>.00001)return a[i]-b[i];return 0;});result.set(key,triangles.flat());}
  return result;
}
function sameSurface(actual,expected,label){
  assert.deepEqual([...actual.keys()].sort(),[...expected.keys()].sort(),label+' preserves materials and render flags');
  for(const [key,values] of expected){const found=actual.get(key);assert.equal(found.length,values.length,label+' preserves every triangle');
    for(let i=0;i<values.length;i++)assert(Math.abs(found[i]-values[i])<.00001,`${label}: position, normal, or UV changed at ${key} #${i}`);
  }
}
function screenPoint(h,object){const p=object.getWorldPosition(new h.THREE.Vector3()).project(h.scene.camera);return {clientX:(p.x+1)*h.host.clientWidth/2,clientY:(1-p.y)*h.host.clientHeight/2,pointerType:'mouse'};}

test('opaque batching cuts mesh submissions at both quality levels without removing a triangle or expanding indexed vertices',async()=>{
  for(const mobile of [false,true]){
    const control=await setupScene({mobile,unbatched:true}),optimized=await setupScene({mobile});
    control.draw(Life.create(()=>.8));optimized.draw(Life.create(()=>.8));
    const before=stats(control.scene.scene),after=stats(optimized.scene.scene);
    assert(after.meshes<before.meshes*.65,JSON.stringify({mobile,before,after}));
    assert.equal(after.triangles,before.triangles);assert.equal(after.vertices,before.vertices);
    assert(after.bufferBytes<before.bufferBytes*1.03,'shared geometry keeps buffer growth below the small instance-matrix overhead');
    assert.equal(after.transparent,before.transparent,'transparent glass, reflections, and targets keep separate sort entries');
    const shadow=optimized.scene.scene.children.find(n=>n.isDirectionalLight&&n.castShadow);
    assert.equal(shadow.shadow.mapSize.x,mobile?1024:1536,'the shipped shadow resolution is retained');
    assert.equal(optimized.scene.renderer.pixelRatio,1);
  }
});

test('every plush keeps its authored triangle positions, normals, UVs, and materials after batching',async()=>{
  for(const mobile of [false,true]){
    const control=await setupScene({mobile,unbatched:true}),optimized=await setupScene({mobile});
    for(const type of ['frog','bunny','chick','cat','koi','dumpling','moonfox']){
      sameSurface(surface(optimized.plush(type),optimized.THREE),surface(control.plush(type),control.THREE),type);
    }
  }
});

test('batching preserves transformed indexed surfaces and leaves animated and transparent objects independent',async()=>{
  const h=await setupScene(),T=h.THREE,root=new T.Group();root.position.set(2,3,4);root.rotation.y=.4;
  const mat=new T.MeshStandardMaterial({color:0x84958a}),glass=new T.MeshStandardMaterial({transparent:true,opacity:.07});
  const child=new T.Group();child.rotation.z=.32;root.add(child);
  for(let i=0;i<3;i++){const n=new T.Mesh(new T.BoxGeometry(1,1,1),mat);n.position.set(i,.2*i,-i);n.scale.set(.4+i,.8,.7);n.castShadow=true;n.receiveShadow=true;child.add(n);}
  const moving=new T.Mesh(new T.BoxGeometry(.1,.2,.3),mat);root.add(moving);
  const transparent=new T.Mesh(new T.PlaneGeometry(1,2),glass);transparent.renderOrder=4;root.add(transparent);
  const before=surface(root,T),vertices=stats(root).vertices;h.batchOpaque(root,new Set([moving]));
  // Compare the independently preserved objects separately so cross-material traversal ordering is immaterial.
  const combined=root.children.find(n=>n.name==='opaque-batch');assert(combined);assert(combined.geometry.index);
  assert.equal(stats(root).vertices,vertices);assert.equal(moving.parent,root);assert.equal(moving.matrixAutoUpdate,true);
  assert.equal(transparent.parent,root);assert.equal(transparent.material,glass);assert.equal(transparent.renderOrder,4);
  root.remove(moving,transparent);const mergedSurface=surface(root,T);
  const key=materialKey(combined),expected=new Map([[key,before.get(key)]]);
  sameSurface(mergedSurface,expected,'nested cabinet transform');
});

test('machine raycast controls and articulated parts remain independent at full quality',async()=>{
  const h=await setupScene(),s=Life.create(()=>.8);h.draw(s);
  assert.equal(h.scene.actionAt(screenPoint(h,h.scene.coinTarget)),'insert');
  assert.equal(h.scene.actionAt(screenPoint(h,h.scene.button)),'drop');
  for(const n of h.scene.shadowObjects)assert.equal(n.matrixAutoUpdate,true,'moving parts keep live local transforms');
  const open=h.scene.fingers.map(n=>n.rotation.x),links=h.scene.links.map(n=>n.scale.y);
  s.phase='grip';s.elapsed=Life.durations.grip;s.target=s.toys[0];h.draw(s);
  h.scene.fingers.forEach((n,i)=>assert.notEqual(n.rotation.x,open[i]));
  h.scene.links.forEach((n,i)=>assert.notEqual(n.scale.y,links[i]));
  s.phase='release';h.draw(s);assert.equal(h.scene.flap.rotation.x,-.5);
  s.phase='down';s.elapsed=.05;h.draw(s);assert.equal(h.scene.button.position.y,1.79);
  s.phase='coin';s.elapsed=Life.durations.coin/2;h.draw(s);assert.equal(h.scene.coin.visible,true);
});

test('desktop camera and moonfox radiance reuse shadows while every actual moving frame refreshes them',async()=>{
  const h=await setupScene(),s=Life.create(()=>0);h.draw(s);
  const model=[...h.scene.toys.values()].find(n=>n.userData.type==='moonfox'),effect=model.userData.radiance;
  const starY=effect.stars[0].position.y,firstShadows=h.scene.renderer.shadowUpdates;
  h.scene.orbitTarget+=.4;for(let i=0;i<120;i++)h.draw(s);
  assert(h.scene.renderer.renderCalls>60,'camera and radiance continue to render');
  assert.notEqual(effect.stars[0].position.y,starY,'the moonfox animation remains live');
  assert.equal(effect.stars[0].parent.name,'secret-radiance');
  assert.equal(h.scene.renderer.shadowUpdates,firstShadows,'camera and sprites do not regenerate unchanged shadow depth');
  assert.equal(h.scene.renderer.shadowMap.autoUpdate,false);
  Life.insert(s);Life.update(s,Life.durations.coin);h.draw(s);const movingShadows=h.scene.renderer.shadowUpdates;
  for(let i=0;i<60;i++){Life.update(s,1/60);h.draw(s);}
  assert.equal(h.scene.renderer.shadowUpdates-movingShadows,60,'moving desktop casters retain full frame shadow updates');
});

test('shadow invalidation covers physics poses, removals, held visibility, prizes, and context restoration',async()=>{
  const h=await setupScene(),s=Life.create(()=>.8);h.draw(s);
  function expectRefresh(change){const before=h.scene.renderer.shadowUpdates;change();h.draw(s,{},40);assert.equal(h.scene.renderer.shadowUpdates,before+1);}
  expectRefresh(()=>{s.physicsMoving=true;s.toys[0].pose={x:0,y:2.5,z:0,q:{x:0,y:0,z:0,w:1}};});
  expectRefresh(()=>{s.physicsMoving=false;s.toys.pop();h.scene.dirty=true;});
  expectRefresh(()=>{s.held=s.toys.shift();s.phase='carry';});
  expectRefresh(()=>{s.held.pose.y=1.3;});assert.equal(h.scene.held.visible,false);
  expectRefresh(()=>{s.held=null;});
  expectRefresh(()=>h.scene.presentPrize('moonfox'));expectRefresh(()=>h.scene.clearPrize());
  expectRefresh(()=>h.contextRestored());assert.equal(h.host.events.at(-1).type,'scene-restored');
});

test('mobile keeps its existing moving-shadow cadence and refreshes the final settled pose',async()=>{
  const h=await setupScene({mobile:true}),s=Life.create(()=>.8);Life.insert(s);Life.update(s,Life.durations.coin);h.draw(s);
  const before=h.scene.renderer.shadowUpdates;
  for(let i=0;i<60;i++){Life.update(s,1/60);h.draw(s);}
  const updates=h.scene.renderer.shadowUpdates-before;assert(updates>=10&&updates<=15,`one second of mobile shadows: ${updates}`);
  const final=h.scene.renderer.shadowUpdates;s.phase='idle';s.y=185;s.x+=1;h.draw(s);
  assert.equal(h.scene.renderer.shadowUpdates,final+1,'the resting pose never keeps a stale shadow');
});

test('removing a batched prize releases instance buffers and preserves geometry shared by the pile',async()=>{
  const h=await setupScene(),s=Life.create(()=>0);h.draw(s);h.scene.presentPrize('moonfox');
  const shared=new Set(),instances=[];h.scene.pile.traverse(n=>{if(n.geometry)shared.add(n.geometry);});
  h.scene.prize.traverse(n=>{if(n.isInstancedMesh)instances.push(n);});assert(instances.length>0);
  let disposed=0,sharedDisposals=0;for(const n of instances)n.addEventListener('dispose',()=>disposed++);
  for(const geometry of shared)geometry.addEventListener('dispose',()=>sharedDisposals++);
  h.scene.clearPrize();assert.equal(disposed,instances.length,'Three.js receives disposal for every instance-matrix buffer');
  assert.equal(sharedDisposals,0,'the remaining toys retain their shared sphere and box buffers');
});
