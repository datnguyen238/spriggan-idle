const test=require('node:test');
const assert=require('node:assert/strict');
const Life=require('../dist/fishing/fishing-life.js');
const {setupScene,pose,residents,residentFor,sessionFor,tick,advance}=require('./helpers/fishing-scene.cjs');

const SPOTS=[{x:3,z:-1.9},{x:1,z:.3},{x:2.6,z:.7}];
function begin(fish){return sessionFor(fish,{phase:'casting',_waitDuration:3});}
function setPhase(session,phase){session.phase=phase;session.phaseTime=0;}
function meshIds(scene){const ids=[];scene.world.traverse(o=>{if(o.isMesh)ids.push(o.uuid);});return ids.sort();}
function fishGeometryIds(scene){const ids=[];residents(scene).forEach(group=>group.traverse(o=>{if(o.isMesh)ids.push(o.geometry.uuid);}));return ids.sort();}
function worldTransforms(scene){
  const objects=[];scene.world.traverse(o=>objects.push([o.uuid,...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),o.visible]));return objects;
}
function watchMovement(scene){
  const previous=new Map(residents(scene).map(group=>[group,pose(group)]));
  let maxDistance=0,maxHeading=0;
  const check=()=>{
    for(const group of residents(scene)){
      const before=previous.get(group),distance=group.position.distanceTo(before.position),turn=group.quaternion.angleTo(before.quaternion);
      maxDistance=Math.max(maxDistance,distance);maxHeading=Math.max(maxHeading,turn);
      assert(distance<=.13+1e-8,`${group.userData.species} jumped ${distance.toFixed(3)} units in one frame`);
      assert(turn<=.20+1e-8,`${group.userData.species} snapped its heading by ${turn.toFixed(3)} radians`);
      assert(group.scale.equals(before.scale),'a selected resident never pops to a different specimen scale');
      assert.equal(group.visible,true,'residents remain visible through approaches and returns');
      assert(group.parent===scene.world,'a resident stays in its original world parent');
      previous.set(group,pose(group));
    }
  };
  check.stats=()=>({maxDistance,maxHeading});return check;
}
function approach(scene,session,check=()=>{}){
  scene.update(session,0);check();
  advance(scene,session,1,{},check);
  setPhase(session,'waiting');advance(scene,session,3,{},check);
  setPhase(session,'bite');scene.update(session,0);check();
}
function assertMouthAtHook(scene,THREE,fish){
  assert.equal(typeof scene.fishMouth,'function','the authored mouth has a world-space anchor');
  assert(fish.mouthLocal?.isVector3||fish.group.userData.mouthLocal?.isVector3);
  assert(scene.hookPoint?.isVector3,'the submerged hook has a world-space anchor');
  const mouth=scene.fishMouth(fish,new THREE.Vector3());
  assert(mouth.distanceTo(scene.hookPoint)<=.12,`${fish.id} mouth is ${mouth.distanceTo(scene.hookPoint).toFixed(3)} units from the hook at the bite`);
}

test('all eight guide species already swim as permanent visible river residents',async()=>{
  const h=await setupScene();try{
    assert.equal(h.scene.fishes.length,8);
    assert.deepEqual(residents(h.scene).map(group=>group.userData.species).sort(),Life.SPECIES.map(f=>f.id).sort());
    assert.equal(new Set(residents(h.scene)).size,8);
    for(const group of residents(h.scene)){
      assert.equal(group.visible,true);assert(group.parent===h.scene.world);
      assert(group.userData.body?.isMesh&&group.userData.tail?.isObject3D);
      assert(Number.isFinite(group.position.length()));
    }
  }finally{h.dispose();}
});

test('every species swims from its existing mesh to the hook, then reels without a new model or a heading snap',async()=>{
  const h=await setupScene();try{
    const topology=meshIds(h.scene),geometry=fishGeometryIds(h.scene),originalMake=h.scene.makeFish;
    let newModels=0;h.scene.makeFish=function(...args){newModels++;return originalMake.apply(this,args);};
    for(const [i,fish] of Life.SPECIES.entries()){
      const group=residentFor(h.scene,fish.id);assert(group,fish.id+' is resident before casting');
      h.scene.aimAt(SPOTS[i%SPOTS.length]);
      const session=begin(fish),check=watchMovement(h.scene);
      approach(h.scene,session,()=>{
        check();assert(h.scene.activeFish.group===group);assert(h.scene.hookedFish===group);
      });
      assertMouthAtHook(h.scene,h.THREE,h.scene.activeFish);
      setPhase(session,'reeling');
      for(let frame=0;frame<180;frame++){
        session.progress=frame/900;session.tension=.35;tick(h.scene,session);check();
        assert(h.scene.hookedFish===group);assert(h.scene.activeFish.group===group);
      }
      setPhase(session,'escaped');advance(h.scene,session,2,{},check);
      setPhase(session,'idle');advance(h.scene,session,2,{},check);
      assert.deepEqual(meshIds(h.scene),topology,'casting and reeling reuse the established scene topology');
      assert.deepEqual(fishGeometryIds(h.scene),geometry,'resident anatomy is never rebuilt while approaching or reeling');
    }
    assert.equal(newModels,0,'no replacement fish is built to approach or reel');
  }finally{h.dispose();}
});

test('the hook can attract a resident from farther up or down the river before the earliest bite',async()=>{
  const h=await setupScene();try{
    for(const [index,z] of [-10,10].entries()){
      const fish=Life.SPECIES[index*6],edges=h.scene.riverEdges(z);
      h.scene.aimAt({x:(edges.left+edges.right)/2,z});
      const session=begin(fish),check=watchMovement(h.scene);
      approach(h.scene,session,check);assertMouthAtHook(h.scene,h.THREE,h.scene.activeFish);
      setPhase(session,'escaped');advance(h.scene,session,3,{},check);
      setPhase(session,'idle');advance(h.scene,session,2,{},check);
    }
  }finally{h.dispose();}
});

test('nearby residents stay visible instead of vanishing to make room for the attracted fish',async()=>{
  const h=await setupScene();try{
    const chosen=Life.SPECIES[0],other=h.scene.fishes.find(f=>f.group.userData.species!==chosen.id);
    h.scene.aimAt(other.group.position);const session=begin(chosen);
    approach(h.scene,session,()=>{
      assert(residents(h.scene).every(group=>group.visible),'proximity to the float never hides a resident');
    });
    assert.equal(h.scene.fishes.length,8);assert.equal(other.group.visible,true);
  }finally{h.dispose();}
});

test('cancel, escape, and a rapid same-species recast preserve position and mesh identity',async()=>{
  const h=await setupScene();try{
    const fish=Life.SPECIES[3],group=residentFor(h.scene,fish.id),session=begin(fish),check=watchMovement(h.scene);
    h.scene.aimAt(SPOTS[0]);advance(h.scene,session,.45,{},check);
    // The UI may cancel and cast again between two renderer frames: no idle update occurs.
    const recast=begin(fish);h.scene.aimAt(SPOTS[2]);h.scene.update(recast,1/60);check();
    assert(h.scene.activeFish.group===group);
    approach(h.scene,recast,check);assertMouthAtHook(h.scene,h.THREE,h.scene.activeFish);
    setPhase(recast,'escaped');tick(h.scene,recast);check();
    const again=begin(fish);h.scene.update(again,1/60);check();
    assert(h.scene.activeFish.group===group);advance(h.scene,again,.5,{},check);
    setPhase(again,'idle');advance(h.scene,again,5,{},check);
    assert(residentFor(h.scene,fish.id)===group);assert.equal(group.visible,true);
  }finally{h.dispose();}
});

test('a caught fish returns smoothly when release and the next cast happen between renderer frames',async()=>{
  const h=await setupScene();try{
    for(const sameSpecies of [true,false]){
      const fish=Life.SPECIES[5],session=begin(fish),check=watchMovement(h.scene);
      h.scene.aimAt(SPOTS[1]);approach(h.scene,session,check);
      setPhase(session,'reeling');
      for(let i=0;i<180;i++){session.progress=i/180;tick(h.scene,session);check();}
      setPhase(session,'caught');session.progress=1;advance(h.scene,session,1.2,{},check);
      const caughtGroup=residentFor(h.scene,fish.id);
      const next=begin(sameSpecies?fish:Life.SPECIES[6]);
      h.scene.aimAt(SPOTS[0]);h.scene.update(next,1/60);check();
      advance(h.scene,next,1,{},check);
      assert.equal(caughtGroup.visible,true);assert(residentFor(h.scene,fish.id)===caughtGroup);
      setPhase(next,'idle');advance(h.scene,next,3,{},check);
    }
  }finally{h.dispose();}
});

test('reduced motion still completes a seven-second approach, catch lift, and release with the same resident',async()=>{
  const h=await setupScene();try{
    const fish=Life.SPECIES[7],group=residentFor(h.scene,fish.id),session=begin(fish),options={reducedMotion:true};
    session._waitDuration=7;
    const edges=h.scene.riverEdges(10);h.scene.aimAt({x:(edges.left+edges.right)/2,z:10});
    const check=watchMovement(h.scene);h.scene.update(session,0,options);
    advance(h.scene,session,1,options,check);setPhase(session,'waiting');
    advance(h.scene,session,7,options,check);
    setPhase(session,'bite');h.scene.update(session,0,options);
    assertMouthAtHook(h.scene,h.THREE,h.scene.activeFish);
    assert(h.scene.activeFish.group===group);
    setPhase(session,'reeling');
    for(let frame=0;frame<180;frame++){session.progress=frame/180;tick(h.scene,session,1/60,options);check();}
    setPhase(session,'caught');session.progress=1;advance(h.scene,session,2,options,check);
    assert(group.position.y>1.5,'a caught resident finishes rising to the angler even with ambient motion reduced');
    assert(h.scene.activeFish.group===group);
    const held=group.position.clone();setPhase(session,'idle');advance(h.scene,session,3,options,check);
    const resident=h.scene.fishes.find(f=>f.group===group);
    assert(Math.abs(group.position.y-resident.swimY)<.05,'release finishes below the water instead of freezing halfway through the dive');
    assert(group.position.distanceTo(held)>1,'the released fish leaves the angler’s hand');
    assert.equal(h.scene.fishes.length,8);assert.equal(group.visible,true);
  }finally{h.dispose();}
});

test('120 paused frames preserve fish, gear, and rain without another draw or rod geometry update',async()=>{
  const h=await setupScene();try{
    const session=begin(Life.SPECIES[1]);advance(h.scene,session,1);setPhase(session,'waiting');advance(h.scene,session,1);
    const options={rain:true,reducedMotion:true};h.scene.update(session,0,options);
    const before=residents(h.scene).map(pose),time=h.scene.time,draws=h.scene.renderer.renderCalls;
    const transforms=worldTransforms(h.scene);
    const bobber=pose(h.scene.bobber),rod=Buffer.from(h.scene.rodPositions.array.buffer).toString('base64');
    const rain=Buffer.from(h.scene.rainDroplets.instanceMatrix.array.buffer).toString('base64');
    const original=h.scene.updateRod;let rodUpdates=0;h.scene.updateRod=function(...args){rodUpdates++;return original.apply(this,args);};
    for(let frame=0;frame<120;frame++)h.scene.update(session,0,options);
    assert.equal(h.scene.time,time);assert.equal(h.scene.renderer.renderCalls,draws);assert.equal(rodUpdates,0);
    assert.deepEqual(worldTransforms(h.scene),transforms,'fish fins, plants, gear, and other world transforms remain still');
    residents(h.scene).forEach((group,i)=>{
      assert(group.position.equals(before[i].position));assert(group.quaternion.equals(before[i].quaternion));
    });
    assert(h.scene.bobber.position.equals(bobber.position));
    assert.equal(Buffer.from(h.scene.rodPositions.array.buffer).toString('base64'),rod);
    assert.equal(Buffer.from(h.scene.rainDroplets.instanceMatrix.array.buffer).toString('base64'),rain);
  }finally{h.dispose();}
});

test('resident bodies and fins stay above the riverbed, between the banks, and in view across map presets',async()=>{
  for(const [width,height] of [[1440,900],[390,844],[844,390]]){
    const h=await setupScene(width,height);try{
      const session=sessionFor(null),box=new h.THREE.Box3(),center=new h.THREE.Vector3();
      for(let frame=0;frame<1800;frame++){
        tick(h.scene,session);
        if(frame%120)continue;
        for(const group of residents(h.scene)){
          box.setFromObject(group);const id=group.userData.species;
          for(const z of [box.min.z,(box.min.z+box.max.z)/2,box.max.z]){
            const edges=h.scene.riverEdges(z);
            assert(box.min.x>=edges.left+.02&&box.max.x<=edges.right-.02,id+' fins crossed a riverbank');
            for(const x of [box.min.x,box.max.x])assert(box.min.y>=h.scene.riverBedHeight(x,z)+.02,id+' fins clipped into the riverbed');
          }
          assert(box.max.y<.12,id+' should remain beneath the water surface while swimming');
          box.getCenter(center).project(h.scene.camera);
          assert(Math.abs(center.x)<1&&Math.abs(center.y)<1&&Math.abs(center.z)<1,`${id} left the ${width}×${height} map view`);
        }
      }
    }finally{h.dispose();}
  }
});
