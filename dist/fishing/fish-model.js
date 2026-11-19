import * as THREE from '../claw/vendor/three.module.min.js?v=perf-e2b5ee6bccd38fd6';

const PI = Math.PI;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

// The same little river, eight different anatomies. Dimensions are sculpted
// before the uniform specimen scale is applied, so fins and eyes stay in scale.
const FORMS = {
  'willow-minnow': { length: 1.02, height: .77, width: .77, dorsal: .76, tail: .88, pattern: 'minnow' },
  'copper-perch': { length: .96, height: 1.07, width: .96, dorsal: 1, tail: .94, pattern: 'perch' },
  'pebble-loach': { length: 1.15, height: .68, width: .89, dorsal: .60, tail: .74, pattern: 'loach' },
  'ribbon-dace': { length: 1.11, height: .78, width: .74, dorsal: .79, tail: 1.05, pattern: 'dace' },
  'clover-carp': { length: 1.01, height: 1.05, width: 1.15, dorsal: .89, tail: .97, pattern: 'carp' },
  'glassfin': { length: .97, height: .85, width: .75, dorsal: .83, tail: 1, pattern: 'glass' },
  'moon-bream': { length: .88, height: 1.17, width: 1.02, dorsal: .76, tail: 1.02, pattern: 'bream' },
  'starfin': { length: 1, height: .96, width: .94, dorsal: 1.04, tail: 1.06, pattern: 'star' },
};

// x, upper/lower half-height, half-width, centreline. The shoulder flows into
// the gill cover and snout; the narrow rear rings form a real caudal peduncle.
const PROFILE = [
  [-.49, .035, .028, .005], [-.40, .050, .039, .006],
  [-.29, .092, .065, .008], [-.13, .137, .094, .006],
  [.045, .155, .109, .002], [.21, .139, .101, -.002],
  [.34, .112, .083, -.010], [.45, .070, .058, -.020],
  [.535, .032, .029, -.025], [.564, .004, .004, -.026],
];

function profileAt(x) {
  let i = 0;
  while (i < PROFILE.length - 2 && x > PROFILE[i + 1][0]) i++;
  const a = PROFILE[i], b = PROFILE[i + 1];
  const before = PROFILE[Math.max(0, i - 1)], after = PROFILE[Math.min(PROFILE.length - 1, i + 2)];
  const t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
  const t2 = t * t, t3 = t2 * t, span = b[0] - a[0];
  const result = [];
  for (let k = 1; k < 4; k++) {
    const ma = (b[k] - before[k]) / (b[0] - before[0]);
    const mb = (after[k] - a[k]) / (after[0] - a[0]);
    result.push((2*t3-3*t2+1)*a[k] + (t3-2*t2+t)*ma*span + (-2*t3+3*t2)*b[k] + (t3-t2)*mb*span);
  }
  return result;
}

function skinColor(x, theta, form, palette) {
  const height = Math.cos(theta), flank = Math.abs(Math.sin(theta));
  const c = palette.base.clone();
  c.lerp(palette.back, smooth(.12, .96, height) * .84);
  c.lerp(palette.belly, smooth(.05, .98, -height) * .92);
  const side = smooth(.5, .95, flank);
  const along = smooth(-.43, -.23, x) * (1 - smooth(.27, .46, x));
  const lateral = Math.exp(-Math.pow((height - .02) / .12, 2)) * side * along;
  if (form.pattern === 'minnow') c.lerp(palette.back, lateral * .70);
  if (form.pattern === 'dace') {
    c.lerp(palette.back, lateral * .78);
    c.lerp(palette.pearl, Math.exp(-Math.pow((height - .19) / .095, 2)) * side * along * .90);
  }
  if (form.pattern === 'perch') {
    const bars = Math.pow(Math.max(0, Math.cos((x + .28) * 38 + height * .8)), 9);
    c.lerp(palette.back, bars * along * smooth(-.60, .55, height) * .74);
  }
  if (form.pattern === 'loach') {
    const mottles = Math.sin(x*62 + theta*3.1) * Math.sin(theta*12 - x*17);
    c.lerp(palette.back, smooth(.20, .75, mottles) * smooth(-.4, .5, height) * along * .58);
  }
  if (form.pattern === 'carp') {
    // A restrained staggered scale edge, painted into the skin rather than
    // stuck-on beads. It breaks up the warm flank without a checkerboard.
    const row = Math.floor((theta / PI + 1) * 12);
    const scallop = Math.cos(x * 80 + (row % 2) * PI) * Math.cos(theta * 24);
    c.lerp(palette.gold, smooth(.70, .96, scallop) * side * along * .25);
  }
  if (form.pattern === 'glass') c.lerp(palette.pearl, lateral * .65);
  if (form.pattern === 'bream') c.lerp(palette.pearl, side * along * .32);
  if (form.pattern === 'star') {
    const flecks = Math.sin(x * 133 + theta*37) * Math.sin(theta*57 - x*43);
    c.lerp(palette.gold, smooth(.87, .985, flecks) * along * .80);
  }
  // Tiny tonal scales follow the body surface; they never change its outline.
  const grain = Math.sin(x * 146 + theta * 43) * Math.sin(theta * 61 - x * 81);
  c.multiplyScalar(1 + grain * .012);
  return c;
}

function makeBody(form, palette, material) {
  const rows = 62, columns = 40, positions = [], colors = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const x = -.49 + 1.054 * i / rows;
    const [h, w, center] = profileAt(x);
    for (let j = 0; j <= columns; j++) {
      const theta = j / columns * PI * 2;
      const cy = Math.cos(theta), sz = Math.sin(theta);
      // A slightly fuller belly and narrow dorsal ridge give top and flank
      // views different, believable silhouettes.
      const y = (center + cy * h * (cy < 0 ? .88 : 1)) * form.height;
      const z = sz * w * (1 - Math.max(0, cy) * .13) * form.width;
      positions.push(x * form.length, y, z);
      const color = skinColor(x, theta, form, palette);
      colors.push(color.r, color.g, color.b);
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j, b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const body = new THREE.Mesh(geometry, material);
  body.name = 'continuous painted river-fish body';
  body.castShadow = true;
  return body;
}

function shapeFrom(start, segments) {
  const shape = new THREE.Shape();
  shape.moveTo(...start);
  for (const segment of segments) {
    if (segment.length === 4) shape.quadraticCurveTo(...segment);
    else shape.bezierCurveTo(...segment);
  }
  shape.closePath();
  return shape;
}

/** A small, sculpted freshwater specimen. Head +x, back +y, flanks +/-z. */
export function createRiverFish(species = {}, scale = 1) {
  const form = FORMS[species.id] || FORMS['willow-minnow'];
  const base = new THREE.Color(species.color || '#9eaf91');
  const accent = new THREE.Color(species.accent || '#e9d5a3');
  const palette = {
    base,
    back: base.clone().multiplyScalar(.48).lerp(new THREE.Color('#31534c'), .17),
    belly: accent.clone().lerp(new THREE.Color('#efe7ce'), .51),
    pearl: new THREE.Color('#dce6d4'),
    gold: accent.clone().lerp(new THREE.Color('#efd5a1'), .5),
  };
  const group = new THREE.Group();
  group.name = species.id || 'river fish';
  group.scale.setScalar(Number.isFinite(scale) && scale > 0 ? scale : 1);
  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .58, metalness: .04 });
  const finMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .67, metalness: .02, side: THREE.DoubleSide, transparent: form.pattern === 'glass', opacity: form.pattern === 'glass' ? .72 : 1, depthWrite: form.pattern !== 'glass' });
  const rays = [], details = [];
  const point = (x, y, z = 0) => V(x * form.length, y * form.height, z * form.width);
  const flankPoint = (x, y, side, offset = .0015) => {
    const [height, width, center] = profileAt(x);
    const cosine = clamp((y - center) / (height * (y < center ? .88 : 1)), -.995, .995);
    const z = Math.sqrt(1-cosine*cosine) * width * (1-Math.max(0,cosine)*.13);
    return point(x, y, side * (z + offset));
  };
  const body = makeBody(form, palette, bodyMaterial);
  group.add(body);
  group.userData.body = body;

  const rayColor = accent.clone().lerp(palette.back, .36);
  const finRoot = base.clone().lerp(accent, .25).multiplyScalar(.77);
  const finTip = accent.clone().lerp(palette.pearl, form.pattern === 'glass' ? .48 : .13);

  function fin(name, shape, map, root, ends, parent = group, amount = 1) {
    const geometry = new THREE.ShapeGeometry(shape, 14);
    const attribute = geometry.attributes.position;
    const colorValues = [];
    for (let i = 0; i < attribute.count; i++) {
      const x = attribute.getX(i), y = attribute.getY(i);
      const mapped = map(x, y);
      attribute.setXYZ(i, mapped.x, mapped.y, mapped.z);
      const distance = Math.hypot(x-root[0], y-root[1]);
      const color = finRoot.clone().lerp(finTip, clamp(distance / amount, 0, 1) * .82);
      colorValues.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorValues, 3));
    geometry.computeVertexNormals();
    const membrane = new THREE.Mesh(geometry, finMaterial);
    membrane.name = name;
    parent.add(membrane);
    const lines = parent === group ? rays : [];
    for (const end of ends) {
      let previous;
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        const x = THREE.MathUtils.lerp(root[0], end[0], t);
        const y = THREE.MathUtils.lerp(root[1], end[1], t) + Math.sin(t * PI) * .009;
        const p = map(x, y);
        p.z += .0016;
        if (previous) lines.push(previous, p);
        previous = p;
      }
    }
    if (parent !== group) addLines(lines, rayColor, .35, parent, 'caudal fin rays');
    return membrane;
  }

  function addLines(points, color, opacity, parent = group, name = 'fine anatomical lines') {
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    lines.name = name;
    parent.add(lines);
    return lines;
  }

  function curve(points, array = details) {
    const sampled = new THREE.CatmullRomCurve3(points).getPoints(18);
    for (let i = 1; i < sampled.length; i++) array.push(sampled[i-1], sampled[i]);
  }

  // The dorsal membrane folds backwards from its shoulder, with a soft trailing
  // scallop. Its height is restrained enough to belong to the body beneath it.
  const d = form.dorsal;
  const dorsal = shapeFrom([.20, .128], [
    [.10, .145 + .115*d, -.015, .157 + .115*d],
    [-.085, .157 + .108*d, -.15, .152 + .075*d],
    [-.22, .151, -.33, .071],
    [-.12, .145, .20, .128],
  ]);
  const dorsalMap = (x, y) => point(x, y, Math.sin((x + .33) * 6) * (y - .12) * .16);
  fin('swept dorsal fin', dorsal, dorsalMap, [.01,.14], [[.11,.145+.09*d],[.025,.157+.112*d],[-.06,.157+.10*d],[-.15,.152+.068*d],[-.24,.13]], group, .21);

  const anal = shapeFrom([-.10,-.114], [
    [-.19,-.17,-.30,-.183], [-.32,-.159,-.35,-.071], [-.20,-.12,-.10,-.114],
  ]);
  fin('soft anal fin', anal, (x,y)=>point(x,y,.003), [-.16,-.112], [[-.24,-.168],[-.29,-.173],[-.32,-.136]], group, .18);

  // Tail is its own assembly at the peduncle. Rotation around y is an actual
  // lateral tail stroke; the full fish is never flattened to fake this view.
  const tail = new THREE.Group();
  tail.name = 'caudal peduncle pivot';
  tail.position.copy(point(-.475,.005,0));
  group.add(tail);
  group.userData.tail = tail;
  const fork = form.pattern === 'loach' ? .25 : 1;
  const t = form.tail;
  const caudal = form.pattern === 'loach' ? shapeFrom([.02,.034], [
    [-.10,.04,-.20,.092], [-.31,.112,-.33,.068],
    [-.36,0,-.33,-.068], [-.30,-.10,-.20,-.084],
    [-.10,-.034,.02,-.029], [.04,0,.02,.034],
  ]) : shapeFrom([.02,.034], [
    [-.095,.055,-.22,.156*t], [-.305,.19*t,-.34,.165*t],
    [-.31,.08*t,-.24,.018*fork], [-.232,0,-.24,-.018*fork],
    [-.31,-.08*t,-.34,-.15*t], [-.295,-.174*t,-.21,-.14*t],
    [-.095,-.045,.02,-.029], [.04,0,.02,.034],
  ]);
  const tailMap = (x,y) => point(x,y, Math.sin(-x*9) * .009 + y*.07);
  fin('flowing forked caudal fin', caudal, tailMap, [0,0], [[-.31,.163*t],[-.29,.115*t],[-.263,.064*t],[-.24,.018*fork],[-.24,-.018*fork],[-.268,-.065*t],[-.30,-.119*t],[-.31,-.151*t]], tail, .34);

  // Paired fins spread gently into the water. Their curved leaf edges give a
  // clear silhouette from above, without turning the specimen into a bird.
  for (const side of [-1,1]) {
    const pectoral = shapeFrom([.245,0], [
      [.19,.037,.058,.122], [-.035,.145,-.06,.109],
      [-.075,.06,.17,.006], [.22,0,.245,0],
    ]);
    fin('paired pectoral fin', pectoral, (x,z)=>point(x,-.046-z*.26,side*(.078+z)), [.22,.004], [[.085,.109],[.025,.128],[-.035,.108],[-.008,.07]], group, .27);
    const pelvic = shapeFrom([-.06,0], [
      [-.12,.05,-.22,.078], [-.275,.085,-.235,.036], [-.16,.005,-.06,0],
    ]);
    fin('paired pelvic fin', pelvic, (x,z)=>point(x,-.112-z*.20,side*(.051+z)), [-.07,0], [[-.17,.059],[-.22,.071],[-.235,.04]], group, .18);
  }
  addLines(rays, rayColor, .27, group, 'delicate fin rays');

  // Eye sockets sit on the head surface, small and lateral. The pupil and
  // restrained pin of reflected light are the only round facial elements.
  const eyeRim = new THREE.MeshStandardMaterial({ color: accent.clone().lerp(base,.34), roughness: .55 });
  const eyeBlack = new THREE.MeshStandardMaterial({ color: '#152824', roughness: .24, metalness: .04 });
  const eyeLight = new THREE.MeshBasicMaterial({ color: '#e9eed7' });
  const eyeGeometry = new THREE.SphereGeometry(1, 16, 10);
  for (const side of [-1,1]) {
    const position = flankPoint(.396,.029,side,.002);
    const rim = new THREE.Mesh(eyeGeometry, eyeRim);
    rim.scale.set(.022,.023,.008);
    rim.position.copy(position);
    group.add(rim);
    const eye = new THREE.Mesh(eyeGeometry, eyeBlack);
    eye.scale.set(.0145,.016,.007);
    eye.position.copy(position).add(V(.001,.001,side*.005));
    group.add(eye);
    const light = new THREE.Mesh(eyeGeometry, eyeLight);
    light.scale.set(.004,.004,.002);
    light.position.copy(eye.position).add(V(.004,.006,side*.006));
    group.add(light);
    // The gill seam wraps over each shoulder instead of drawing a smile.
    curve([
      flankPoint(.255,.110,side), flankPoint(.279,.066,side),
      flankPoint(.275,-.012,side), flankPoint(.238,-.090,side),
    ]);
    // Short, downturned mouth at the end of the snout.
    curve([flankPoint(.556,-.025,side),flankPoint(.532,-.032,side),flankPoint(.501,-.034,side)]);
    if (form.pattern === 'loach' || form.pattern === 'carp') {
      curve([point(.52,-.043,side*.025),point(.57,-.065,side*.054),point(.60,-.052,side*.069)]);
    }
  }
  addLines(details, palette.back, .43);
  group.userData.species = species.id || 'willow-minnow';
  return group;
}
