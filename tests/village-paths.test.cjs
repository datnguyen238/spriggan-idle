const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNetwork, polyline, pointAt, smoothPath } = require('../dist/landing-paths.js');
const network = createNetwork();
const destinations = ['slots', 'claw', 'dumplings', 'hex', 'pixel', 'pond', 'incoming'];
const gap = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

test('every destination can be reached from every other place without a position jump', () => {
  for (const from of destinations) for (const to of destinations) {
    const points = network.plan(network.nodes[from],to);
    assert.ok(gap(points[0],network.nodes[from])<.001);
    assert.ok(gap(points.at(-1),network.nodes[to])<.001);
    for (const point of points) assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
    for (let i=1;i<points.length;i++) assert.ok(gap(points[i-1],points[i])<7,'route skips a road segment');
  }
});

test('the northern side road joins the main road at the same coordinate', () => {
  const branches = network.edges.filter(edge=>edge.a==='north'||edge.b==='north');
  assert.equal(branches.length,3);
  for (const edge of branches) {
    assert.deepEqual(edge.a==='north'?edge.points[0]:edge.points.at(-1),network.nodes.north);
  }
});

test('nearby destinations use their shared road instead of returning to the square', () => {
  const points = network.plan(network.nodes.pond,'incoming');
  assert.ok(points.every(point=>gap(point,network.nodes.south)>10));
  assert.ok(points.every(point=>gap(point,network.nodes.square)>20));
  assert.ok(polyline(points).length<700);
});

test('redirecting during a walk preserves the exact current position', () => {
  const first = polyline(network.plan(network.nodes.claw,'pond'));
  for (const fraction of [.1,.35,.7,.95]) {
    const current = pointAt(first,first.length*fraction);
    const redirected = network.plan(current,'dumplings');
    assert.deepEqual(redirected[0],current);
    assert.deepEqual(redirected.at(-1),network.nodes.dumplings);
  }
});

test('distance interpolation clamps safely and handles a stationary avatar', () => {
  const stationary=polyline([{x:12,y:9},{x:12,y:9}]);
  assert.deepEqual(pointAt(stationary,100),{x:12,y:9});
  const line=polyline([{x:0,y:0},{x:3,y:4},{x:9,y:4}]);
  assert.deepEqual(pointAt(line,-5),{x:0,y:0});
  assert.deepEqual(pointAt(line,100),{x:9,y:4});
  assert.deepEqual(pointAt(line,8),{x:6,y:4});
});

test('rounded paths retain the start and end of a trip', () => {
  const points=network.plan(network.nodes.pixel,'hex');
  const d=smoothPath(points);
  assert.ok(d.startsWith(`M${points[0].x} ${points[0].y}`));
  assert.ok(d.endsWith(`${points.at(-1).x} ${points.at(-1).y}`));
  assert.ok(!/NaN|undefined/.test(d));
});


test('the pond path continues smoothly toward Incoming without a dead-end branch', () => {
  const edges=network.edges.filter(edge=>edge.a==='pond'||edge.b==='pond');
  assert.equal(edges.length,2);
  const arrival=edges.find(edge=>edge.b==='pond');
  const departure=edges.find(edge=>edge.a==='pond');
  assert.equal(departure.b,'incoming');
  const before=arrival.points.at(-2), at=network.nodes.pond, after=departure.points[1];
  const incoming={x:at.x-before.x,y:at.y-before.y};
  const outgoing={x:after.x-at.x,y:after.y-at.y};
  const alignment=(incoming.x*outgoing.x+incoming.y*outgoing.y)/(Math.hypot(incoming.x,incoming.y)*Math.hypot(outgoing.x,outgoing.y));
  assert.ok(alignment>.99, 'the promenade has a sharp turn at the pond');
});

test('the main entrance is centered on the park square and connects to the road network', () => {
  assert.equal(network.nodes.entry.x,network.nodes.square.x);
  const points=network.plan(network.nodes.entry,'claw');
  assert.deepEqual(points[0],network.nodes.entry);
  assert.deepEqual(points.at(-1),network.nodes.claw);
});
