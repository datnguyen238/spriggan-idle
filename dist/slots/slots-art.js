(() => {
  'use strict';

  // Every shape is drawn on a small integer grid, like the chickens in the farm.
  // These renderers own no game state: their only animation clock is supplied by
  // the page, so pausing motion also pauses the garden and its little visitors.
  const C = {
    deep: '#284d3c', shadow: '#35573d', forest: '#426648', leaf: '#638652',
    grass: '#8aa16b', light: '#a8b982', sun: '#d3d7a0', bark: '#685442',
    wood: '#a88658', cream: '#f3efdf', coral: '#cf8772', water: '#557f72',
    gold: '#f3d88b', goldShade: '#cb9439', goldEdge: '#b08026'
  };

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function polygon(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(Math.round(x), Math.round(y)) : ctx.moveTo(Math.round(x), Math.round(y)));
    ctx.closePath();
    ctx.fill();
  }

  function leafSprite(ctx) {
    rect(ctx, -10, 10, 20, 2, '#d3c7a655');
    polygon(ctx, [[-10, 6], [-10, 0], [-6, -7], [1, -11], [12, -12], [10, -3], [5, 5], [-2, 9]], '#395e43');
    polygon(ctx, [[-8, 4], [-8, 0], [-4, -6], [2, -9], [10, -10], [8, -3], [3, 5], [-2, 7]], '#7e9b5c');
    rect(ctx, -5, -3, 3, 4, '#aec47b');
    rect(ctx, -2, -6, 5, 3, '#aec47b');
    rect(ctx, 2, -8, 5, 2, '#c2d48b');
    for (let i = 0; i < 10; i++) rect(ctx, -7 + i, 6 - i, 2, 2, '#4d7447');
    rect(ctx, -10, 8, 2, 3, '#7b6745');
    rect(ctx, -11, 10, 2, 2, '#7b6745');
    rect(ctx, -6, 0, 4, 1, '#66854d');
    rect(ctx, -1, -4, 1, 4, '#66854d');
    rect(ctx, 3, -6, 1, 3, '#66854d');
  }

  function flowerSprite(ctx) {
    rect(ctx, -10, 12, 21, 2, '#d3c7a655');
    rect(ctx, -1, 2, 2, 11, '#5d7b49');
    rect(ctx, -7, 6, 6, 3, '#78935a');
    rect(ctx, -5, 9, 4, 2, '#5d7b49');
    rect(ctx, 1, 4, 6, 3, '#91ab67');
    rect(ctx, 1, 7, 4, 2, '#78935a');
    for (const [x, y] of [[-5, -12], [2, -10], [5, -4], [1, 1], [-6, 0], [-10, -6]]) {
      rect(ctx, x, y, 7, 6, '#b97769');
      rect(ctx, x + 1, y - 1, 5, 7, '#e6a58b');
      rect(ctx, x + 1, y, 3, 2, '#f0c3a4');
    }
    rect(ctx, -4, -6, 8, 7, '#ac7d42');
    rect(ctx, -3, -7, 6, 8, '#e1b85a');
    rect(ctx, -2, -6, 4, 4, '#ffe6a0');
    rect(ctx, 0, -1, 2, 1, '#bc944a');
  }

  function eggSprite(ctx) {
    rect(ctx, -12, 8, 24, 4, '#a88453');
    rect(ctx, -9, 12, 18, 2, '#8e6f4b');
    rect(ctx, -13, 6, 26, 3, '#cab27b');
    rect(ctx, -11, 5, 6, 2, '#e3ca8a');
    rect(ctx, 4, 5, 8, 2, '#e3ca8a');
    rect(ctx, -7, -7, 14, 15, '#bcaf8a');
    rect(ctx, -5, -11, 10, 5, '#bcaf8a');
    rect(ctx, -3, -13, 6, 3, '#bcaf8a');
    rect(ctx, -6, -6, 12, 13, '#f3e9cf');
    rect(ctx, -4, -10, 8, 16, '#f3e9cf');
    rect(ctx, -2, -12, 4, 2, '#f3e9cf');
    rect(ctx, -4, -7, 3, 8, '#fff9e8');
    rect(ctx, -3, -9, 4, 2, '#fff9e8');
    rect(ctx, 3, -3, 2, 9, '#ddcfaa');
    rect(ctx, -2, 6, 7, 1, '#d4c398');
    rect(ctx, -10, 9, 7, 1, '#e3ca8a');
    rect(ctx, 1, 10, 7, 1, '#d5bc7c');
  }

  function chickenSprite(ctx) {
    rect(ctx, -12, 12, 24, 2, '#d3c7a655');
    rect(ctx, -5, 8, 2, 4, '#c59651');
    rect(ctx, 3, 8, 2, 4, '#c59651');
    rect(ctx, -6, 11, 4, 1, '#c59651');
    rect(ctx, 3, 11, 4, 1, '#c59651');
    rect(ctx, -14, -6, 3, 5, '#a99b77');
    rect(ctx, -13, -9, 4, 6, '#f3e6c8');
    rect(ctx, -10, -10, 3, 6, '#fff6dd');
    rect(ctx, -6, -9, 14, 1, '#b8a181');
    rect(ctx, -9, -7, 19, 3, '#b8a181');
    rect(ctx, -11, -4, 22, 9, '#b8a181');
    rect(ctx, -8, 5, 16, 3, '#b8a181');
    rect(ctx, -5, 8, 10, 1, '#b8a181');
    rect(ctx, -6, -8, 13, 14, '#fff7e5');
    rect(ctx, -9, -5, 19, 9, '#fff7e5');
    rect(ctx, -6, 5, 13, 2, '#e6d3b0');
    rect(ctx, -5, -7, 9, 2, '#fffdf2');
    rect(ctx, -7, 0, 7, 5, '#e6d3b0');
    rect(ctx, -5, 0, 5, 1, '#fff4d8');
    rect(ctx, -3, 4, 2, 1, '#c8b48b');
    rect(ctx, 0, -12, 3, 4, '#d87869');
    rect(ctx, 4, -13, 3, 5, '#d87869');
    rect(ctx, 1, -12, 1, 1, '#f3a191');
    rect(ctx, 5, -13, 1, 1, '#f3a191');
    rect(ctx, 6, -5, 2, 3, '#493f32');
    rect(ctx, 6, -5, 1, 1, '#fffdf0');
    rect(ctx, 10, -3, 4, 2, '#edb46b');
    rect(ctx, 11, -1, 2, 1, '#cb904e');
    rect(ctx, 7, 0, 2, 2, '#dc8778');
  }

  function fishSprite(ctx, golden, t = 0, silhouette = false) {
    const bend = Math.sin(t * 2) > 0 ? 1 : 0;
    const edge = silhouette ? '#335c52' : golden ? C.goldEdge : '#a89472';
    const body = silhouette ? '#335c52' : golden ? C.gold : '#f4f0df';
    const shade = silhouette ? '#335c52' : golden ? C.goldShade : '#d3cbb2';
    const shine = silhouette ? '#335c52' : golden ? '#fff0bf' : '#fffaf0';
    // A wide fan tail, paired translucent-looking fins, and rounded koi head.
    polygon(ctx, [[-7, -2], [-15, -8 + bend], [-14, -2], [-12, 0], [-14, 3], [-15, 8 + bend], [-6, 3]], edge);
    polygon(ctx, [[-8, -1], [-13, -5 + bend], [-12, -1], [-10, 1], [-13, 5 + bend], [-7, 2]], shade);
    rect(ctx, -12, -2 + bend, 3, 2, body);
    rect(ctx, -12, 3 + bend, 3, 1, body);
    polygon(ctx, [[-1, -4], [1, -10], [5, -9], [6, -4]], edge);
    polygon(ctx, [[0, -4], [2, -8], [4, -7], [4, -4]], shade);
    polygon(ctx, [[0, 4], [2, 9], [5, 8], [6, 4]], edge);
    polygon(ctx, [[1, 4], [3, 7], [4, 6], [4, 4]], shade);
    rect(ctx, -7, -3, 4, 7, edge);
    rect(ctx, -4, -5, 13, 11, edge);
    rect(ctx, 9, -3, 4, 7, edge);
    rect(ctx, 13, -1, 2, 3, edge);
    rect(ctx, -5, -2, 16, 6, body);
    rect(ctx, -3, -4, 11, 9, body);
    rect(ctx, 10, -2, 3, 5, body);
    rect(ctx, -3, 3, 10, 2, shade);
    rect(ctx, -4, -3, 9, 2, shine);
    if (!silhouette && !golden) {
      rect(ctx, -3, -3, 5, 4, '#d48554');
      rect(ctx, -2, -3, 3, 1, '#e8a779');
      rect(ctx, 6, -2, 5, 3, '#c7724d');
      rect(ctx, 7, -2, 3, 1, '#e8a779');
      rect(ctx, 1, 1, 3, 3, '#b9b5a4');
    } else if (!silhouette) {
      rect(ctx, 1, -2, 3, 1, '#e7be5e');
      rect(ctx, 4, 0, 3, 1, '#e7be5e');
      rect(ctx, -2, 1, 3, 1, '#e7be5e');
    }
    if (!silhouette) {
      rect(ctx, 10, -2, 1, 1, '#504d34');
      rect(ctx, 10, 3, 1, 1, '#504d34');
      rect(ctx, 13, 0, 2, 1, golden ? '#c7a350' : '#bfad8b');
    }
  }

  function seedSprite(ctx) {
    rect(ctx, -10, 11, 21, 2, '#d3c7a655');
    rect(ctx, -7, -5, 14, 16, '#a98444');
    rect(ctx, -5, -10, 10, 6, '#a98444');
    rect(ctx, -2, -13, 4, 3, '#a98444');
    rect(ctx, -6, -4, 12, 13, '#e0b566');
    rect(ctx, -4, -9, 8, 17, '#e0b566');
    rect(ctx, -1, -12, 2, 4, '#f3d88b');
    rect(ctx, -4, -6, 3, 11, '#f3d88b');
    rect(ctx, -3, -8, 4, 3, '#f3d88b');
    rect(ctx, 3, -4, 2, 12, '#c49b51');
    rect(ctx, 0, -7, 1, 15, '#a98444');
    rect(ctx, 1, -2, 1, 7, '#f3d88b');
    rect(ctx, -3, 9, 6, 1, '#c49b51');
    rect(ctx, 7, -9, 1, 5, '#d0b974');
    rect(ctx, 5, -7, 5, 1, '#d0b974');
  }

  const sprites = { leaf: leafSprite, flower: flowerSprite, egg: eggSprite, chicken: chickenSprite, seed: seedSprite };

  function drawSymbol(ctx, id, x, y, size, t = 0) {
    const scale = Math.max(0.5, Math.floor(size / 32));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    if (id === 'koi' || id === 'golden') fishSprite(ctx, id === 'golden', t);
    else (sprites[id] || seedSprite)(ctx);
    ctx.restore();
  }

  function tree(ctx, x, y, scale = 1, warm = false) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    rect(ctx, -16, 9, 36, 6, '#3d604643');
    rect(ctx, -4, -6, 8, 24, '#67533e');
    rect(ctx, -2, -4, 3, 20, '#9a7d51');
    rect(ctx, 2, 3, 2, 9, '#785f43');
    rect(ctx, -6, 15, 14, 2, '#6f6547');
    polygon(ctx, [[-4, -1], [-12, -10], [-9, -12], [0, -4]], '#67533e');
    polygon(ctx, [[1, 2], [10, -6], [12, -4], [4, 6]], '#67533e');
    rect(ctx, -24, -25, 49, 17, C.shadow);
    rect(ctx, -18, -36, 37, 15, C.shadow);
    rect(ctx, -11, -41, 23, 9, C.shadow);
    rect(ctx, -28, -20, 55, 9, C.shadow);
    rect(ctx, -21, -30, 41, 20, warm ? '#738954' : '#567c4f');
    rect(ctx, -15, -36, 31, 15, warm ? '#8d9e61' : '#789b5d');
    rect(ctx, -9, -39, 21, 8, warm ? '#a9b374' : '#97b475');
    rect(ctx, -24, -18, 15, 7, '#66834f');
    rect(ctx, -13, -27, 12, 5, warm ? '#b6bf83' : '#a7c183');
    rect(ctx, 3, -34, 12, 4, warm ? '#b6bf83' : '#a7c183');
    rect(ctx, 9, -18, 13, 7, '#3c6546');
    rect(ctx, -20, -13, 9, 2, '#87a465');
    rect(ctx, -8, -18, 6, 2, '#89a968');
    rect(ctx, 2, -12, 8, 2, '#66834f');
    ctx.restore();
  }

  function bush(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    rect(ctx, -13, -5, 27, 10, '#426548');
    rect(ctx, -9, -10, 19, 7, '#52764b');
    rect(ctx, -11, -4, 23, 7, '#638652');
    rect(ctx, -7, -8, 11, 4, '#89a96a');
    rect(ctx, 4, -4, 6, 3, '#91ae70');
    rect(ctx, -8, 3, 18, 2, '#3b6144');
    ctx.restore();
  }

  function smallFlower(ctx, x, y, shade = C.cream) {
    rect(ctx, x, y - 1, 1, 6, '#5b7e4d');
    rect(ctx, x - 2, y + 2, 2, 1, '#6c9155');
    rect(ctx, x - 2, y - 3, 5, 3, shade);
    rect(ctx, x - 1, y - 4, 3, 5, shade);
    rect(ctx, x, y - 2, 1, 1, '#c6a954');
  }

  function fence(ctx, x, y, width) {
    rect(ctx, x, y + 4, width, 3, '#9a7e54');
    rect(ctx, x, y + 11, width, 3, '#94794f');
    rect(ctx, x, y + 4, width, 1, '#c5ad7c');
    for (let i = 0; i < width; i += 13) {
      rect(ctx, x + i, y + 1, 4, 18, '#bca06b');
      rect(ctx, x + i + 1, y, 2, 2, '#dec28b');
      rect(ctx, x + i + 1, y + 2, 1, 14, '#d3b97f');
      rect(ctx, x + i + 3, y + 3, 1, 16, '#876d4c');
    }
  }

  function lily(ctx, x, y, lotus = false) {
    rect(ctx, x - 6, y - 2, 11, 5, '#396d50');
    rect(ctx, x - 4, y - 4, 7, 8, '#6a9260');
    rect(ctx, x - 4, y - 3, 6, 2, '#8bab70');
    rect(ctx, x + 1, y, 4, 1, '#426e52');
    if (lotus) {
      rect(ctx, x - 3, y - 5, 6, 3, '#d5a794');
      rect(ctx, x - 2, y - 7, 4, 5, '#efd1b8');
      rect(ctx, x - 1, y - 8, 2, 3, '#fae5c9');
      rect(ctx, x, y - 4, 1, 1, '#d0a65a');
    }
  }

  function pond(ctx, x, y, w, h, t, golden = false, lotus = false, silhouette = false) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    // Stepped shoreline gives a pixel oval without anti-aliased edges.
    const shore = [[w * .16, 0], [w * .75, 0], [w * .75, 3], [w * .88, 3], [w * .88, 9], [w * .96, 9], [w * .96, h * .35], [w, h * .35], [w, h * .71], [w * .93, h * .71], [w * .93, h * .86], [w * .8, h * .86], [w * .8, h], [w * .25, h], [w * .25, h * .95], [w * .12, h * .95], [w * .12, h * .83], [0, h * .83], [0, h * .32], [w * .06, h * .32], [w * .06, 7], [w * .16, 7]];
    polygon(ctx, shore, '#6a7860');
    ctx.save();
    ctx.translate(w * .055, h * .09);
    ctx.scale(.89, .82);
    polygon(ctx, shore, '#426b5e');
    ctx.restore();
    rect(ctx, w * .16, h * .2, w * .63, h * .58, '#567f70');
    rect(ctx, w * .23, h * .13, w * .5, h * .7, '#567f70');
    rect(ctx, w * .1, h * .4, w * .82, h * .27, '#567f70');
    rect(ctx, w * .26, h * .19, w * .39, 1, '#86a28c');
    rect(ctx, w * .11, h * .37, w * .24, 1, '#759a83');
    rect(ctx, w * .65, h * .65, w * .18, 1, '#739881');
    for (let i = 0; i < 7; i++) {
      const rx = w * (.15 + (i * .127) % .72), ry = h * (.27 + (i * .173) % .48);
      rect(ctx, rx + Math.sin(t * .35 + i) * 2, ry, 3 + i % 4, 1, '#658c79');
    }
    const stoneColors = ['#a5ad8c', '#bbc0a0', '#919b7e'];
    for (const [sx, sy, sw] of [[.13, .05, 7], [.33, 0, 9], [.67, .01, 7], [.87, .18, 6], [.9, .73, 8], [.7, .93, 7], [.36, .91, 8], [.08, .72, 6], [.01, .43, 5]]) {
      const c = stoneColors[Math.round(sx * 10) % 3];
      rect(ctx, sx * w, sy * h, sw, 4, c);
      rect(ctx, sx * w + 1, sy * h - 1, sw - 2, 1, '#cad0ac');
      rect(ctx, sx * w + 1, sy * h + 4, sw - 1, 1, '#536c53');
    }
    lily(ctx, w * .22, h * .28, lotus);
    lily(ctx, w * .78, h * .67, lotus);
    ctx.save();
    ctx.translate(Math.round(w * .51 + Math.sin(t * .13) * w * .12), Math.round(h * .55 + Math.sin(t * .2) * h * .09));
    ctx.scale(golden ? .78 : .63, golden ? .78 : .63);
    fishSprite(ctx, golden, t, silhouette);
    ctx.restore();
    if (!golden && !silhouette && w > 75) {
      ctx.save();
      ctx.translate(Math.round(w * .63 + Math.cos(t * .1) * w * .12), Math.round(h * .31));
      ctx.scale(-.4, .4);
      fishSprite(ctx, false, t + 3);
      ctx.restore();
    }
    ctx.restore();
  }

  function lantern(ctx, x, y, t) {
    rect(ctx, x, y, 2, 25, '#725f46');
    rect(ctx, x - 3, y, 9, 2, '#725f46');
    rect(ctx, x + 4, y + 1, 1, 5, '#725f46');
    rect(ctx, x + 1, y + 6, 8, 8, '#a17b48');
    rect(ctx, x + 2, y + 7, 6, 6, '#d8bc75');
    rect(ctx, x + 3, y + 8, 3, 4, Math.sin(t * .6 + x) > 0 ? '#f4df9b' : '#e9cc85');
    rect(ctx, x + 1, y + 14, 8, 1, '#6a5d42');
    rect(ctx, x + 3, y + 5, 4, 1, '#6a5d42');
  }

  function drawGarden(ctx, width, height, t = 0, spins = 0, golden = false) {
    const pixel = width < 560 ? 2 : 3;
    const w = Math.ceil(width / pixel), h = Math.ceil(height / pixel);
    const mobile = width < 560;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(pixel, pixel);
    rect(ctx, 0, 0, w, h, '#8ba16c');
    rect(ctx, 0, 0, w, h * .21, '#94aa78');
    rect(ctx, w * .16, h * .17, w * .68, h * .68, '#a3b581');
    rect(ctx, w * .22, h * .24, w * .56, h * .58, '#adbb88');
    // Sun-warmed grass and a deliberately still clearing behind the machine.
    for (let i = 0; i < Math.floor(w * h / 140); i++) {
      const x = (i * 71 + 11) % w, y = (i * 43 + 5) % h;
      const center = x > w * .17 && x < w * .83 && y > h * .19 && y < h * .79;
      if (!center || i % 5 === 0) rect(ctx, x, y, 2, 1, center ? '#9aae79' : i % 3 ? '#7e9861' : '#b0bf87');
      if (!center && i % 7 === 0) rect(ctx, x + 1, y - 2, 1, 2, '#698855');
    }
    // A softly worn path emerges from under the wooden cabinet.
    const pathY = h * .75;
    rect(ctx, w * .4, pathY, w * .21, h * .25, '#c2b488');
    rect(ctx, w * .35, h * .91, w * .29, h * .09, '#c2b488');
    for (let i = 0; i < 22; i++) rect(ctx, w * .41 + (i * 7) % (w * .17), pathY + (i * 11) % (h * .24), 2, 1, '#ae9e73');
    rect(ctx, w * .4, pathY, w * .21, 2, '#b4a57a');

    for (let x = -8; x < w + 12; x += 18) bush(ctx, x, 5, 1.15);
    fence(ctx, w * .08, h * .18, w * .2);
    fence(ctx, w * .73, h * .17, w * .2);
    tree(ctx, w * .055, h * .26, mobile ? .92 : 1.4);
    tree(ctx, w * .93, h * .24, mobile ? 1.0 : 1.45, true);
    tree(ctx, w * .8, h * .05, .84, true);
    tree(ctx, w * .18, h * .065, .8);

    // Low foliage frames the sides without covering the reel cabinet.
    for (const [bx, by, bs] of [[.015, .55, 1.18], [.96, .5, 1.18], [.04, .79, .85], [.965, .79, 1]]) bush(ctx, w * bx, h * by, bs);
    fence(ctx, -2, h * .83, w * .21);
    fence(ctx, w * .01, h * .39, mobile ? 8 : w * .1);
    rect(ctx, 3, h * .43, 2, h * .35, '#a0895f');
    rect(ctx, w - 5, h * .38, 2, h * .29, '#a0895f');

    const pondW = mobile ? w * .39 : w * .31;
    const pondH = mobile ? h * .16 : h * .24;
    const pondX = mobile ? w * .63 : w * .67;
    const pondY = mobile ? h * .83 : h * .72;
    pond(ctx, pondX, pondY, pondW, pondH, t, golden, spins >= 35);
    // Reeds and softly patterned stones along the water's edge.
    for (let i = 0; i < 4; i++) {
      const x = pondX + pondW * .9 + i * 2, y = pondY + pondH * .1 + i % 2 * 4;
      rect(ctx, x, y, 1, 8, '#4d774d');
      rect(ctx, x, y - 3, 1, 4, '#8d7b49');
    }
    for (const [x, y] of [[.08, .7], [.13, .76], [.06, .91], [.2, .93], [.91, .6], [.97, .69]]) smallFlower(ctx, w * x, h * y, '#e8dcaa');
    if (spins >= 8) {
      const bedX = mobile ? w * .055 : w * .1, bedY = mobile ? h * .88 : h * .79;
      rect(ctx, bedX - 3, bedY - 5, w * .2, 16, '#9b835b');
      rect(ctx, bedX - 1, bedY - 3, w * .2 - 4, 12, '#82784f');
      for (let i = 0; i < 7; i++) smallFlower(ctx, bedX + i * w * .026, bedY + i % 2 * 4, i % 3 ? '#e6b099' : '#eee1ae');
      rect(ctx, bedX - 3, bedY + 10, w * .2, 2, '#c1a571');
    }
    if (spins >= 20) {
      lantern(ctx, w * .12, h * .54, t);
      lantern(ctx, w * .9, h * .53, t + 1);
    }
    if (spins >= 60) {
      // A flowering sapling celebrates the completed garden, quietly at its edge.
      const sx = w * .09, sy = h * .56;
      rect(ctx, sx, sy - 10, 2, 16, '#8a7150');
      bush(ctx, sx, sy - 11, .65);
      for (const [dx, dy] of [[-6, -14], [3, -17], [5, -10], [-3, -9]]) {
        rect(ctx, sx + dx, sy + dy, 3, 2, '#e5b79e');
        rect(ctx, sx + dx + 1, sy + dy - 1, 1, 1, '#f8dbc0');
      }
    }
    // Tiny mushrooms and foreground shrubs tie this world to the farm palette.
    rect(ctx, w * .22, h * .89, 1, 4, '#e4d4af');
    rect(ctx, w * .22 - 2, h * .89 - 1, 5, 2, '#b97859');
    rect(ctx, w * .22 - 1, h * .89 - 2, 3, 1, '#d4946c');
    bush(ctx, w * .025, h + 3, 1.25);
    bush(ctx, w * .93, h + 6, 1.2);
    rect(ctx, 0, h - 2, w, 2, '#779260');
    ctx.restore();
  }

  function drawKoiPond(ctx, width, height, t = 0, golden = false) {
    const pixel = 2, w = Math.ceil(width / pixel), h = Math.ceil(height / pixel);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(pixel, pixel);
    rect(ctx, 0, 0, w, h, '#91a678');
    rect(ctx, 0, h * .64, w, h * .36, '#809b6b');
    for (let i = 0; i < 25; i++) rect(ctx, i * 31 % w, i * 17 % h, 2, 1, '#a9b988');
    pond(ctx, w * .075, h * .13, w * .85, h * .76, t, golden, true, !golden);
    bush(ctx, 0, h * .1, .62);
    bush(ctx, w, h, .75);
    smallFlower(ctx, w * .075, h * .77, '#ead6a8');
    smallFlower(ctx, w * .95, h * .32, '#dba28c');
    if (golden) {
      for (let i = 0; i < 3; i++) {
        const x = w * (.37 + i * .14), y = h * (.22 + i % 2 * .16);
        if (Math.sin(t * .65 + i * 2) > -.2) {
          rect(ctx, x, y - 2, 1, 5, '#f3d88b');
          rect(ctx, x - 1, y, 3, 1, '#f3d88b');
        }
      }
    }
    ctx.restore();
  }

  globalThis.SlotsArt = Object.freeze({ drawSymbol, drawGarden, drawKoiPond });
})();
