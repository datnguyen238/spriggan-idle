const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const life = require('../dist/fishing/fishing-life.js');

const modelPromise = import(pathToFileURL(path.resolve(__dirname, '../dist/fishing/fish-model.js')).href);
const threePromise = import(pathToFileURL(path.resolve(__dirname, '../dist/claw/vendor/three.module.min.js')).href);

test('all river specimens have finite, dimensional geometry and restrained fin proportions', async () => {
  const [{createRiverFish}, THREE] = await Promise.all([modelPromise, threePromise]);
  const silhouettes = new Set();
  for (const species of life.SPECIES) {
    const fish = createRiverFish(species);
    fish.traverse(object => {
      if (!object.geometry) return;
      for (const attribute of Object.values(object.geometry.attributes)) {
        assert.ok(Array.from(attribute.array).every(Number.isFinite), `${species.id}: finite mesh attributes`);
      }
    });
    const size = new THREE.Box3().setFromObject(fish).getSize(new THREE.Vector3());
    assert.ok(size.y > .23 && size.y < .51, `${species.id}: fins belong to body silhouette`);
    assert.ok(size.x / size.y > 2.35, `${species.id}: streamlined river-fish proportions`);
    assert.ok(size.z > .24 && size.z < .53, `${species.id}: a fully dimensional fish`);
    silhouettes.add(size.toArray().map(value => value.toFixed(3)).join(','));
  }
  assert.equal(silhouettes.size, life.SPECIES.length, 'each species has a distinct sculpted silhouette');
});

test('tail strokes pivot at the rear of the body and do not rotate the specimen', async () => {
  const [{createRiverFish}, THREE] = await Promise.all([modelPromise, threePromise]);
  const fish = createRiverFish(life.SPECIES[0]);
  const {body, tail} = fish.userData;
  assert.ok(body.isMesh);
  assert.ok(tail.isGroup);
  const bodyBounds = new THREE.Box3().setFromObject(body);
  assert.ok(Math.abs(tail.position.x - bodyBounds.min.x) < .04);
  const before = new THREE.Box3().setFromObject(tail).getSize(new THREE.Vector3());
  tail.rotation.y = .7;
  fish.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(tail).getSize(new THREE.Vector3());
  assert.ok(after.z > before.z + .12, 'tail stroke sweeps sideways through water');
  assert.equal(body.rotation.y, 0);
  assert.equal(fish.rotation.y, 0);
});

test('specimens own their resources and a requested scale applies uniformly', async () => {
  const [{createRiverFish}, THREE] = await Promise.all([modelPromise, threePromise]);
  const first = createRiverFish(life.SPECIES[0]);
  const second = createRiverFish(life.SPECIES[0], 2);
  const firstResources = new Set();
  first.traverse(object => {
    if (object.geometry) firstResources.add(object.geometry);
    if (object.material) firstResources.add(object.material);
  });
  second.traverse(object => {
    assert.ok(!object.geometry || !firstResources.has(object.geometry));
    assert.ok(!object.material || !firstResources.has(object.material));
  });
  const firstSize = new THREE.Box3().setFromObject(first).getSize(new THREE.Vector3());
  const secondSize = new THREE.Box3().setFromObject(second).getSize(new THREE.Vector3());
  for (const axis of ['x','y','z']) assert.ok(Math.abs(secondSize[axis] / firstSize[axis] - 2) < 1e-6);
});
