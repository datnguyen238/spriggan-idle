/* Shared road geometry for the village illustration and avatar navigation. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VillagePaths = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const baseNodes = {
    midway: { x: 692.875, y: 305 }, slots: { x: 700, y: 290 }, entry: { x: 550, y: 640 }, square: { x: 550, y: 380 }, north: { x: 560, y: 355 }, south: { x: 580, y: 440 },
    claw: { x: 275, y: 240 }, dumplings: { x: 583, y: 240 }, hex: { x: 813, y: 240 },
    pixel: { x: 249, y: 466.6666666666667 }, pond: { x: 630, y: 464 }, incoming: { x: 970, y: 466.6666666666667 }
  };
  const nodes = Object.fromEntries(Object.entries(baseNodes).map(([id, point]) => [id, { x: point.x * 1.5, y: point.y * 1.5 }]));
  const definitions = [
    ['claw', 'square', [335, 290, 465, 335]],
    ['pixel', 'square', [360, 465, 460, 415]],
    ['square', 'north', [551, 371, 556, 363]],
    ['north', 'midway', [605, 335, 650, 321.25]],
    ['midway', 'hex', [735.75, 288.75, 776.5, 270]],
    ['midway', 'slots', [695, 299, 698, 295]],
    ['north', 'dumplings', [562, 312, 580, 275]],
    ['square', 'south', [552, 402, 565, 427]],
    ['south', 'entry', [568, 510, 550, 580]],
    ['south', 'pond', [599, 456, 616, 463]],
    ['pond', 'incoming', [740, 474, 866, 465]]
  ].map(([a, b, controls]) => [a, b, controls.map(value => value * 1.5)]);
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  function polyline(points) {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
    return { points, lengths, length: lengths[lengths.length - 1] };
  }
  function pointAt(line, d) {
    d = Math.max(0, Math.min(line.length, d));
    let low = 0, high = line.points.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (line.lengths[mid] <= d) low = mid;
      else high = mid;
    }
    if (low === high) return { ...line.points[low] };
    const span = line.lengths[high] - line.lengths[low];
    const t = span > 0 ? (d - line.lengths[low]) / span : 0;
    const a = line.points[low], b = line.points[high];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function smoothPath(points) {
    if (points.length === 1) return `M${points[0].x} ${points[0].y}L${points[0].x} ${points[0].y}`;
    let path = `M${points[0].x} ${points[0].y}`;
    // Local tangents round junctions without pulling the route out of the road.
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[Math.max(0, i - 1)], a = points[i], b = points[i + 1], q = points[Math.min(points.length - 1, i + 2)];
      path += `C${a.x + (b.x - p.x) / 6} ${a.y + (b.y - p.y) / 6} ${b.x - (q.x - a.x) / 6} ${b.y - (q.y - a.y) / 6} ${b.x} ${b.y}`;
    }
    return path;
  }
  function createNetwork() {
    const edges = definitions.map(([a, b, c]) => {
      const start = nodes[a], end = nodes[b];
      const points = Array.from({ length: 97 }, (_, i) => {
        const t = i / 96, u = 1 - t;
        return { x: u*u*u*start.x + 3*u*u*t*c[0] + 3*u*t*t*c[2] + t*t*t*end.x,
          y: u*u*u*start.y + 3*u*u*t*c[1] + 3*u*t*t*c[3] + t*t*t*end.y };
      });
      return { a, b, ...polyline(points), d: `M${start.x} ${start.y}C${c.join(' ')} ${end.x} ${end.y}` };
    });
    function nearest(position) {
      let best = null;
      edges.forEach((edge, index) => {
        for (let i = 1; i < edge.points.length; i++) {
          const a = edge.points[i - 1], b = edge.points[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((position.x-a.x)*dx+(position.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
          const p = { x: a.x + dx*t, y: a.y + dy*t };
          const gap = distance(position, p);
          if (!best || gap < best.gap) best = { edge: index, distance: edge.lengths[i-1] + distance(a,p), gap };
        }
      });
      return best;
    }
    function segmentPoints(segment) {
      const edge = edges[segment.edge];
      const min = Math.min(segment.from, segment.to), max = Math.max(segment.from, segment.to);
      const points = [pointAt(edge,min)];
      edge.points.forEach((p,i) => { if (edge.lengths[i]>min && edge.lengths[i]<max) points.push(p); });
      points.push(pointAt(edge,max));
      return segment.from <= segment.to ? points : points.reverse();
    }
    function plan(position, target) {
      if (!nodes[target]) throw new Error(`Unknown village destination: ${target}`);
      if (distance(position,nodes[target]) < .01) return [{ ...position }, { ...nodes[target] }];
      const projection = nearest(position), first = edges[projection.edge];
      const candidates = new Map([
        [first.a, { cost: projection.distance, segments: [{ edge:projection.edge, from:projection.distance, to:0 }] }],
        [first.b, { cost: first.length-projection.distance, segments: [{ edge:projection.edge, from:projection.distance, to:first.length }] }]
      ]);
      const visited = new Set();
      while (!visited.has(target)) {
        let next = null;
        for (const [id,entry] of candidates) if (!visited.has(id) && (!next || entry.cost<next.entry.cost)) next={id,entry};
        if (!next) throw new Error('Village destination is disconnected');
        visited.add(next.id);
        edges.forEach((edge,index) => {
          if (edge.a!==next.id && edge.b!==next.id) return;
          const forward=edge.a===next.id, end=forward?edge.b:edge.a;
          const cost=next.entry.cost+edge.length;
          if (!candidates.has(end) || cost<candidates.get(end).cost) candidates.set(end,{cost,segments:[...next.entry.segments,{edge:index,from:forward?0:edge.length,to:forward?edge.length:0}]});
        });
      }
      const points = [{ ...position }];
      for (const segment of candidates.get(target).segments) {
        for (const p of segmentPoints(segment)) if (distance(points[points.length-1],p)>.01) points.push({ ...p });
      }
      points[points.length-1]={...nodes[target]};
      return points;
    }
    return { nodes, edges, plan, roadPath:edges.map(edge=>edge.d).join(' ') };
  }
  return { createNetwork, polyline, pointAt, smoothPath, width: 1650, height: 975 };
});
