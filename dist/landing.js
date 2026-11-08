(() => {
  'use strict';
  const places = window.SPRIGGAN_PLACES;
  const stage = document.querySelector('#map-stage');
  const world = document.querySelector('#map-world');
  const panel = document.querySelector('#destination');
  const route = document.querySelector('#travel-route');
  const traveler = document.querySelector('#traveler');
  const status = document.querySelector('#map-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width:700px), (max-width:950px) and (max-height:500px)');
  const markers = [...document.querySelectorAll('[data-place]')];
  const pointers = new Map();
  const paths = window.VillagePaths;
  const { width: W, height: H } = paths;
  const network = paths.createNetwork();
  document.querySelectorAll('.road,.road-edge').forEach(road => road.setAttribute('d', network.roadPath));
  // Rendering, selection, camera focus, and walking share one destination position.
  places.forEach(place => {
    const node = network.nodes[place.id];
    if (node) Object.assign(place, node);
    const shop = document.querySelector(`.map-shop[data-place="${place.id}"]`);
    if (shop) {
      shop.style.left = `${(place.artX ?? place.x) / W * 100}%`;
      shop.style.top = `${(place.artY ?? place.y) / H * 100}%`;
    }
  });
  let selected = null, camera = { x: 0, y: 0, scale: 1 }, fit = 1;
  let frame = 0, flight = null, journey = null, drag = null;
  let restoreFocus = null;
  let gestureMoved = false, suppressShopClick = false;
  let avatarPoint = { ...network.nodes.square };
  let avatarDestination = null;

  function render() {
    world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
    const factor = camera.scale / fit;
    document.querySelector('#zoom-in').disabled = factor >= 2.19;
    document.querySelector('#zoom-out').disabled = camera.scale <= minimumScale() + .001;
  }
  function minimumScale() {
    return Math.min(stage.clientWidth / W, stage.clientHeight / H) * .92;
  }
  function constrain(value = camera) {
    // Keep the inhabited landscape in view; the ground extends past its edges.
    const width = W * value.scale, height = H * value.scale;
    value.x = width >= stage.clientWidth
      ? Math.max(stage.clientWidth - width - 90 * value.scale, Math.min(90 * value.scale, value.x))
      : (stage.clientWidth - width) / 2;
    value.y = height >= stage.clientHeight
      ? Math.max(stage.clientHeight - height - 90 * value.scale, Math.min(90 * value.scale, value.y))
      : (stage.clientHeight - height) / 2;
  }
  function overview(full = false) {
    flight = null;
    const mobile = compact.matches;
    const scale = full ? minimumScale() : fit * 1.05;
    camera = {
      scale,
      x: stage.clientWidth / 2 - (full ? W / 2 : mobile ? 410 : W * .45) * scale,
      y: stage.clientHeight / 2 - (full ? H / 2 : H * .4) * scale
    };
    constrain();
    render();
  }
  function resize() {
    fit = Math.max(stage.clientWidth / 1100, stage.clientHeight / 650);
    if (selected) focusPlace(selected, false);
    else overview();
  }
  function requestFrame() {
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (flight) {
      const t = Math.min(1, (now - flight.at) / 600);
      const ease = 1 - Math.pow(1 - t, 3);
      for (const key of ['x', 'y', 'scale']) camera[key] = flight.from[key] + (flight.to[key] - flight.from[key]) * ease;
      render();
      if (t === 1) flight = null;
    }
    if (journey) {
      const t = Math.min(1, (now - journey.at) / journey.duration);
      drawJourney(t);
      if (t === 1) {
        journey = null;
        stopWalking();
      }
    }
    if (flight || journey) requestFrame();
  }
  function stopWalking() {
    traveler.classList.remove('is-walking');
    if (!selected) route.style.strokeDashoffset = '1';
    if (selected) status.textContent = selected.href
      ? `Your avatar is at ${selected.name}. Enter when you’re ready.`
      : 'Your avatar is here. This place is still being made.';
  }
  function startJourney(id) {
    if (avatarDestination === id) {
      if (journey) status.textContent = `Your avatar is walking to ${selected.name}.`;
      else stopWalking();
      return;
    }
    avatarDestination = id;
    const points = network.plan(avatarPoint, id);
    route.setAttribute('d', paths.smoothPath(points));
    // Bake distance samples once. Each animation frame only interpolates a position.
    const length = route.getTotalLength();
    const steps = Math.max(1, Math.ceil(length / 2));
    const line = paths.polyline(Array.from({ length: steps + 1 }, (_, i) => {
      const point = route.getPointAtLength(length * i / steps);
      return { x: point.x, y: point.y };
    }));
    journey = { at: performance.now(), duration: Math.max(700, Math.min(5200, line.length * 7)), line };
    route.style.strokeDashoffset = '1';
    traveler.classList.add('is-walking');
    if (reduced.matches || line.length < .01) {
      drawJourney(1);
      journey = null;
      stopWalking();
    } else {
      drawJourney(0);
      status.textContent = `Your avatar is walking to ${selected.name}.`;
      requestFrame();
    }
  }
  function drawJourney(t) {
    const eased = t * t * (3 - 2 * t);
    avatarPoint = paths.pointAt(journey.line, journey.line.length * eased);
    route.style.strokeDashoffset = 1 - eased;
    traveler.setAttribute('transform', `translate(${avatarPoint.x} ${avatarPoint.y})`);
    traveler.dataset.x = avatarPoint.x;
    traveler.dataset.y = avatarPoint.y;
  }
  function finishMotion() {
    if (flight) camera = { ...flight.to };
    if (journey) drawJourney(1);
    flight = journey = null;
    stopWalking();
    cancelAnimationFrame(frame);
    frame = 0;
    render();
  }
  function focusPlace(place, smooth = true) {
    const mobile = compact.matches;
    let scale = fit * (mobile ? 1.2 : 1.12);
    let targetX = stage.clientWidth * .58, targetY = stage.clientHeight * .47;
    if (mobile) {
      const stageBounds = stage.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      const titleBounds = document.querySelector('.map-intro').getBoundingClientRect();
      const toolsBounds = document.querySelector('.map-tools').getBoundingClientRect();
      const landscape = stage.clientWidth > stage.clientHeight;
      const top = (landscape ? titleBounds.bottom : Math.max(titleBounds.bottom, toolsBounds.bottom)) - stageBounds.top + 12;
      const bottom = landscape ? stage.clientHeight - 22 : panelBounds.top - stageBounds.top - 12;
      const freeHeight = Math.max(80, bottom - top);
      scale = Math.min(scale, Math.max(.35, freeHeight / (place.id === 'slots' ? 135 : 230)));
      targetX = landscape ? Math.max(160, panelBounds.left - stageBounds.left) / 2 : stage.clientWidth / 2;
      targetY = top + freeHeight / 2;
    }
    const to = {
      scale,
      x: targetX - place.x * scale,
      y: targetY - (place.y - (place.id === 'pond' ? 70 : place.id === 'slots' ? 45 : 80)) * scale
    };
    constrain(to);
    if (reduced.matches || !smooth) { camera = to; flight = null; render(); }
    else { flight = { from: { ...camera }, to, at: performance.now() }; requestFrame(); }
  }
  function selectPlace(id, source) {
    const place = places.find(item => item.id === id);
    if (!place) return;
    selected = place;
    restoreFocus = source;
    markers.forEach(marker => marker.setAttribute('aria-pressed', String(marker.dataset.place === id)));
    const image = document.querySelector('#destination-image');
    image.hidden = !place.image;
    if (place.image) { image.src = place.image; image.alt = `${place.name} game preview`; }
    else { image.removeAttribute('src'); image.alt = ''; }
    document.querySelector('#destination-name').textContent = place.name;
    document.querySelector('#destination-kind').textContent = place.kind;
    document.querySelector('#destination-description').textContent = place.description;
    const enter = document.querySelector('#enter-world');
    enter.hidden = !place.href;
    if (place.href) enter.href = place.href;
    else enter.removeAttribute('href');
    enter.firstChild.textContent = id === 'slots' ? 'Play Golden Seed ' : 'Enter world ';
    enter.setAttribute('aria-label', `${id === 'slots' ? 'Play' : 'Enter'} ${place.name}`);
    document.querySelector('#coming-soon').hidden = !!place.href;
    panel.hidden = false;
    status.textContent = place.href ? `${place.name} selected. Enter when you’re ready.` : 'This destination is still being made.';
    startJourney(id);
    focusPlace(place);

  }
  markers.forEach(marker => marker.addEventListener('click', () => selectPlace(marker.dataset.place, marker)));
  function clearSelection() {
    selected = null;
    panel.hidden = true;
    if (!journey) route.style.strokeDashoffset = '1';
    markers.forEach(marker => marker.setAttribute('aria-pressed', 'false'));
    status.textContent = 'Choose a shop or place to visit.';
    overview();
    restoreFocus?.focus({ preventScroll: true });
  }
  document.querySelector('#close-destination').addEventListener('click', clearSelection);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && selected) clearSelection();
  });

  function zoomAt(multiplier, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
    flight = null;
    const scale = Math.max(minimumScale(), Math.min(fit * 2.2, camera.scale * multiplier));
    const ratio = scale / camera.scale;
    camera.x = x - (x - camera.x) * ratio;
    camera.y = y - (y - camera.y) * ratio;
    camera.scale = scale;
    constrain(); render();
  }
  document.querySelector('#zoom-in').addEventListener('click', () => zoomAt(1.2));
  document.querySelector('#zoom-out').addEventListener('click', () => zoomAt(1 / 1.2));
  document.querySelector('#reset-view').addEventListener('click', () => overview(true));
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    zoomAt(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * .002), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  stage.addEventListener('pointerdown', event => {
    const shop = event.target.closest('.map-shop');
    if ((!shop && event.target.closest('button,a')) || event.button !== 0) return;
    if (!pointers.size) { gestureMoved = false; suppressShopClick = false; }
    pointers.set(event.pointerId, { x:event.clientX, y:event.clientY, startX:event.clientX, startY:event.clientY });
    if (!shop) stage.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      const [a,b] = [...pointers.values()];
      drag = { distance:Math.hypot(a.x-b.x,a.y-b.y), x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
      gestureMoved = suppressShopClick = true;
      flight = null;
    }
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    const current = { ...previous, x:event.clientX, y:event.clientY };
    pointers.set(event.pointerId,current);
    if (pointers.size === 1) {
      const moved = Math.hypot(current.x-current.startX,current.y-current.startY);
      if (!gestureMoved && moved < 6) return;
      const origin = gestureMoved ? previous : { x:current.startX, y:current.startY };
      if (!gestureMoved) stage.setPointerCapture(event.pointerId);
      gestureMoved = suppressShopClick = true;
      flight = null;
      camera.x += current.x-origin.x;
      camera.y += current.y-origin.y;
      stage.classList.add('is-dragging');
      constrain(); render();
    } else if (pointers.size === 2) {
      const [a,b] = [...pointers.values()];
      const distance = Math.hypot(a.x-b.x,a.y-b.y);
      const center = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
      const rect = stage.getBoundingClientRect();
      if (drag) {
        camera.x += center.x-drag.x;
        camera.y += center.y-drag.y;
        zoomAt(distance/Math.max(1,drag.distance),center.x-rect.left,center.y-rect.top);
      }
      drag = { distance, ...center };
      gestureMoved = suppressShopClick = true;
      flight = null;
    }
  });
  function release(event) {
    pointers.delete(event.pointerId);
    drag = null;
    if (!pointers.size) { stage.classList.remove('is-dragging'); gestureMoved = false; }
    else pointers.forEach(point => { point.startX=point.x; point.startY=point.y; });
  }
  // A drag that starts on a shop must not also select it on release.
  stage.addEventListener('click', event => {
    if (suppressShopClick && event.detail > 0) {
      suppressShopClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  ['pointerup','pointercancel','lostpointercapture'].forEach(type => stage.addEventListener(type,release));
  stage.addEventListener('keydown', event => {
    if (event.target !== stage) return;
    const delta = { ArrowLeft: [65, 0], ArrowRight: [-65, 0], ArrowUp: [0, 65], ArrowDown: [0, -65] }[event.key];
    if (delta) { event.preventDefault(); flight = null; camera.x += delta[0]; camera.y += delta[1]; constrain(); render(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(1.2); }
    else if (event.key === '-') { event.preventDefault(); zoomAt(1 / 1.2); }
    else if (event.key === 'Home') { event.preventDefault(); overview(true); }
  });
  document.querySelectorAll('.light-controls [data-light]').forEach(button => button.addEventListener('click', () => {
    document.body.dataset.light = button.dataset.light;
    document.querySelectorAll('.light-controls [data-light]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  function visibility() {
    const running = !document.hidden && !reduced.matches;
    world.dataset.running = String(running);
    document.body.dataset.motion = running ? 'running' : 'paused';
    const terrain = document.querySelector('.terrain');
    if (running) terrain.unpauseAnimations?.();
    else terrain.pauseAnimations?.();
    if (document.hidden || reduced.matches) finishMotion();
  }
  reduced.addEventListener('change', visibility);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', () => { pointers.clear(); drag = null; gestureMoved = suppressShopClick = false; stage.classList.remove('is-dragging'); });
  window.addEventListener('resize', resize);
  resize(); visibility();
})();
