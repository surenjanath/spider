import {
  advanceBody,
  bodyTarget,
  clamp,
  createMotionState,
  FEELER_COUNT,
  lerp,
  sectionPosition,
  smoothstep,
  tokenAnchor as rawTokenAnchor,
  updateLegs,
  WORD_INTERVAL_MS,
} from "./spider-motion";

import { paintGalaxy, galaxyPoint, makeFootholds } from "./galaxy.js";
import {
  createVolumeScene,
  clusterExtent,
  traversalState,
  tokenDepth,
  projectVolume,
  bodyPlane,
} from "./volume-scene.js";

const TAU = Math.PI * 2;
const TYPES = {
  claim: "#99cbd7",
  owner: "#dfca85",
  file: "#a9beda",
  approval: "#9ec790",
  vague: "#e0a175",
};
const dot = (ctx, x, y, r, color) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
};
const line = (ctx, a, b, color, width = 1) => {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
};
function rawSourcePoint(finding, width, height) {
  const id = finding.source?.id || finding.id;
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [x, y] = sectionPosition(hash % 8);
  return {
    x: clamp(x * width + Math.sin(hash) * 35, 24, width - 24),
    y: clamp(y * height + Math.cos(hash) * 30, 24, height - 24),
  };
}
function curvePoint(a, b, t) {
  const bend = Math.min(48, Math.hypot(b.x - a.x, b.y - a.y) * 0.15);
  const middle = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 - bend };
  return {
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * middle.x + t * t * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * middle.y + t * t * b.y,
  };
}

// A single renderer survives cursor, playback, speed and section changes.
// React owns the crawl state; the renderer requests the next word only when its
// read cycle has finished. No second interval is allowed to race the animation.
export function startSpiderRenderer(canvas, latest, elements, onTelemetry) {
  const ctx = canvas.getContext("2d");
  const volume = createVolumeScene(
    elements.back.current,
    elements.front.current,
    () => {
      dirty = true;
    },
  );
  let depthCamera = null,
    drawPlane = null,
    extent = 1;
  const drawSpace = (point, z = 0) =>
    drawPlane
      ? drawPlane.toWorld(
          projectVolume({ ...point, z }, depthCamera, width, height),
        )
      : point;
  const tokenAnchor = (token, section, w, h, time) =>
    drawSpace(
      rawTokenAnchor(token, section, w, h, time),
      tokenDepth(token, extent),
    );
  const sourcePoint = (finding, w, h) =>
    drawSpace(rawSourcePoint(finding, w, h), -0.18 * extent);
  const orbit = {
    yaw: 0,
    pitch: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    changed: false,
  };
  const dragStart = (e) => {
    if (e.button !== 0) return;
    orbit.dragging = true;
    orbit.lastX = e.clientX;
    orbit.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const dragMove = (e) => {
    if (!orbit.dragging) return;
    orbit.yaw = clamp(orbit.yaw + (e.clientX - orbit.lastX) * 0.004, -0.9, 0.9);
    orbit.pitch = clamp(
      orbit.pitch + (e.clientY - orbit.lastY) * 0.003,
      -0.6,
      0.6,
    );
    orbit.lastX = e.clientX;
    orbit.lastY = e.clientY;
    orbit.changed = true;
  };
  const dragEnd = () => {
    orbit.dragging = false;
  };
  const orbitKey = (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return;
    e.preventDefault();
    orbit.yaw = clamp(
      orbit.yaw +
        (e.key === "ArrowLeft" ? -0.08 : e.key === "ArrowRight" ? 0.08 : 0),
      -0.9,
      0.9,
    );
    orbit.pitch = clamp(
      orbit.pitch +
        (e.key === "ArrowUp" ? -0.06 : e.key === "ArrowDown" ? 0.06 : 0),
      -0.6,
      0.6,
    );
    orbit.changed = true;
  };
  canvas.addEventListener("keydown", orbitKey);
  canvas.addEventListener("pointerdown", dragStart);
  canvas.addEventListener("pointermove", dragMove);
  canvas.addEventListener("pointerup", dragEnd);
  canvas.addEventListener("pointercancel", dragEnd);
  let galaxy = null;
  const view = { x: 0, y: 0, initialized: false };
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const pointerMove = (e) => {
    const box = canvas.getBoundingClientRect();
    pointer.targetX = (e.clientX - box.left) / Math.max(1, box.width) - 0.5;
    pointer.targetY = (e.clientY - box.top) / Math.max(1, box.height) - 0.5;
  };
  const pointerLeave = () => {
    pointer.targetX = 0;
    pointer.targetY = 0;
  };
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerleave", pointerLeave);
  const motion = createMotionState();
  let width = 0,
    height = 0,
    dpr = 1,
    frame = 0,
    previous = 0,
    lastSample = 0,
    sampleFrames = 0,
    sampleWords = 0;
  let lastCursor = -1,
    lastSection = -1,
    lastModel = null,
    lastZoom = -1,
    lastLabels = null,
    lastRunning = false,
    lastFollow = null,
    lastViewRevision = -1;
  let wordAge = 0,
    awaitingCommit = false,
    dirty = true,
    resizePending = true,
    layerModel = null;
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let particles = [],
    raf;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedChanged = (e) => {
    reduced = e.matches;
    dirty = true;
  };
  media.addEventListener("change", reducedChanged);
  const resize = new ResizeObserver(([entry]) => {
    const oldWidth = width,
      oldHeight = height;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oldWidth && oldHeight) {
      motion.x *= width / oldWidth;
      motion.y *= height / oldHeight;
    }
    dirty = true;
    resizePending = true;
  });
  resize.observe(canvas);
  function paintWeb(model) {
    if (volume?.available) {
      volume.resize(model.web, width, height, dpr);
      galaxy = {
        foothold: makeFootholds(model.web, width, height),
        projected: model.web.points.map((p) => galaxyPoint(p, width, height)),
      };
    } else {
      elements.back.current.style.visibility = "hidden";
      elements.front.current.style.visibility = "hidden";
      galaxy = paintGalaxy(model.web, width, height, dpr);
    }
    layerModel = model.web;
  }
  const draw = (now) => {
    const state = latest.current;
    if (state.viewRevision !== lastViewRevision) {
      orbit.yaw = 0;
      orbit.pitch = 0;
      pointer.x = 0;
      pointer.y = 0;
      pointer.targetX = 0;
      pointer.targetY = 0;
      view.initialized = false;
      dirty = true;
      lastViewRevision = state.viewRevision;
    }
    const elapsed = previous ? Math.min((now - previous) / 1000, 0.15) : 0;
    const dt = Math.min(elapsed, 0.05);
    previous = now;
    if (!lastSample) lastSample = now;
    const {
      model,
      cursor,
      running,
      activeSection,
      zoom,
      labels,
      speed,
      followCamera,
    } = state;
    const section = model.sections[activeSection] || model.sections[0];
    if (!section || width < 1 || height < 1) {
      raf = requestAnimationFrame(draw);
      return;
    }
    const cursorChanged = cursor !== lastCursor;
    const sectionChanged = activeSection !== lastSection;
    const modelChanged = model !== lastModel;
    if (running && !lastRunning) {
      lastSample = now;
      sampleFrames = 0;
      sampleWords = 0;
    }
    const seeking = cursorChanged && (cursor !== lastCursor + 1 || !running);
    if (cursorChanged) {
      if (
        lastCursor >= 0 &&
        cursor === lastCursor + 1 &&
        running &&
        !modelChanged
      ) {
        sampleWords++;
        const token = model.tokens[lastCursor];
        if (token) {
          const finding = model.byEnd.get(lastCursor);
          particles.push({ token, finding, age: 0 });
        }
      } else if (seeking) particles = [];
      wordAge =
        awaitingCommit && cursor === lastCursor + 1
          ? Math.max(0, wordAge - WORD_INTERVAL_MS / 1000 / speed)
          : 0;
      awaitingCommit = false;
      dirty = true;
    }
    if (modelChanged) {
      dirty = true;
      particles = [];
    }
    if (
      sectionChanged ||
      zoom !== lastZoom ||
      labels !== lastLabels ||
      running !== lastRunning ||
      followCamera !== lastFollow
    )
      dirty = true;
    if (running && document.visibilityState !== "hidden") {
      wordAge += elapsed;
      if (!reduced) motion.time += elapsed;
      if (
        wordAge >= WORD_INTERVAL_MS / 1000 / speed &&
        !awaitingCommit &&
        cursor < model.tokens.length
      ) {
        awaitingCommit = true;
        state.onAdvance();
      }
    }
    lastCursor = cursor;
    lastSection = activeSection;
    lastModel = model;
    lastZoom = zoom;
    lastLabels = labels;
    lastRunning = running;
    const followChanged = followCamera !== lastFollow;
    lastFollow = followCamera;
    if (orbit.changed) {
      dirty = true;
      orbit.changed = false;
    }
    const needsFrame = (running && !reduced) || dirty;
    if (!needsFrame) {
      raf = requestAnimationFrame(draw);
      return;
    }
    if (
      resizePending ||
      layerModel !== model.web ||
      (!volume?.available && !galaxy?.layers)
    )
      paintWeb(model);
    const snap =
      !motion.initialized ||
      seeking ||
      resizePending ||
      (sectionChanged && !running) ||
      reduced;
    const target = bodyTarget(section, cursor, width, height, motion.time);
    if (running || snap) advanceBody(motion, target, dt, snap);
    extent = clusterExtent(width, height);
    const phase = clamp(wordAge / (WORD_INTERVAL_MS / 1000 / speed), 0, 1);
    const traversal = traversalState(section, cursor, phase);
    const [clusterX, clusterY] = sectionPosition(section.index);
    const distance = Math.hypot(
      motion.x - clusterX * width,
      motion.y - clusterY * height,
    );
    const proximity =
      1 - smoothstep(clamp((distance - extent * 0.8) / (extent * 1.5), 0, 1));
    const desiredDepth =
      (0.85 - 1.62 * traversal.immersion * proximity) * extent;
    if (snap || motion.z === undefined) motion.z = desiredDepth;
    else if (running && !reduced)
      motion.z = lerp(motion.z, desiredDepth, 1 - Math.exp(-dt * 3.6));
    const immersion = clamp((0.85 - motion.z / extent) / 1.62, 0, 1);
    const depthStage =
      immersion > 0.65
        ? "WITHIN THE CORE"
        : traversal.progress > 0.55 && immersion > 0.13
          ? "EMERGING"
          : immersion > 0.13
            ? "ENTERING"
            : "OUTER SHELL";
    const size = clamp(Math.min(width, height) / 360, 0.85, 1.3);
    const legs = updateLegs(motion, size, snap, galaxy.foothold);
    resizePending = false;
    dirty = false;
    frame++;
    sampleFrames++;
    if (now - lastSample >= 1000) {
      onTelemetry({
        fps: Math.round((sampleFrames * 1000) / (now - lastSample)),
        frame,
        wordsPerSecond: (sampleWords * 1000) / (now - lastSample),
        immersion,
        depthStage,
        volume: !!volume?.available,
      });
      sampleFrames = 0;
      sampleWords = 0;
      lastSample = now;
    }
    const follow = clamp(
      (zoom - 1) / 0.75 + (followCamera && !reduced ? 0.78 : 0),
      0,
      1,
    );
    if (running && !reduced) {
      pointer.x = lerp(pointer.x, pointer.targetX, 1 - Math.exp(-dt * 3));
      pointer.y = lerp(pointer.y, pointer.targetY, 1 - Math.exp(-dt * 3));
    }
    const desiredView = {
      x: lerp(width / 2, motion.x, follow) - pointer.x * 9,
      y: lerp(height / 2, motion.y, follow) - pointer.y * 7,
    };
    const viewEase =
      snap || followChanged || !view.initialized || !running
        ? 1
        : 1 - Math.exp(-dt * 1.8);
    view.x = lerp(view.x, desiredView.x, viewEase);
    view.y = lerp(view.y, desiredView.y, viewEase);
    view.initialized = true;
    const time = motion.time;
    const camera = {
      ...view,
      z: 0,
      yaw:
        orbit.yaw +
        (reduced ? 0 : 0.18 + Math.sin(time * 0.09) * 0.1 + pointer.x * 0.16),
      pitch:
        orbit.pitch +
        (reduced
          ? 0
          : -0.14 + Math.sin(time * 0.075) * 0.065 + pointer.y * 0.1),
      zoom: zoom * (followCamera && !reduced ? 1.18 + immersion * 0.2 : 1),
      spiderX: motion.x,
      spiderY: motion.y,
    };
    depthCamera = camera;
    drawPlane = bodyPlane(
      { x: motion.x, y: motion.y, z: motion.z },
      camera,
      width,
      height,
    );
    const project = (p) => drawPlane.toScreen(p);
    const activeToken = model.tokens[cursor];
    const color = section.color || "#72d5ce";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (volume?.available) {
      volume.draw(camera, motion.z, time, immersion);
    } else {
      // No-WebGL fallback retains the larger field, camera and front occlusion.
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
      for (let i = 0; i < 2; i++)
        ctx.drawImage(galaxy.layers[i], 0, 0, width, height);
      ctx.restore();
    }
    ctx.save();
    ctx.setTransform(
      dpr * drawPlane.a,
      dpr * drawPlane.b,
      dpr * drawPlane.c,
      dpr * drawPlane.d,
      dpr * drawPlane.tx,
      dpr * drawPlane.ty,
    );

    // Genuine prompt tokens, linked to deterministic word coordinates.
    for (const token of model.tokens) {
      if (token.section !== activeSection && token.index >= cursor) continue;
      const p = tokenAnchor(
        token,
        model.sections[token.section],
        width,
        height,
        time,
      );
      const read = token.index < cursor;
      const tokenColor = read
        ? token.findingId
          ? TYPES[token.type]
          : "#939aa9"
        : "#505664";
      dot(
        ctx,
        p.x,
        p.y,
        token.index === cursor ? 2.8 : read ? 1.6 : 0.8,
        tokenColor,
      );
    }
    // Existing resolved source relationships accumulate as the crawl progresses.
    ctx.lineWidth = 0.65;
    for (const finding of model.findings) {
      if (finding.tokenIndex >= cursor || finding.status !== "resolved")
        continue;
      const token = model.tokens[finding.tokenIndex];
      if (!token) continue;
      const a = tokenAnchor(
          token,
          model.sections[token.section],
          width,
          height,
          time,
        ),
        b = sourcePoint(finding, width, height);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 30, b.x, b.y);
      ctx.strokeStyle = (TYPES[finding.type] || "#99cbd7") + "26";
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(
      motion.x,
      motion.y,
      0,
      motion.x,
      motion.y,
      100 * size,
    );
    glow.addColorStop(0, color + "16");
    glow.addColorStop(1, color + "00");
    ctx.fillStyle = glow;
    ctx.fillRect(
      motion.x - 100 * size,
      motion.y - 100 * size,
      200 * size,
      200 * size,
    );

    ctx.globalAlpha = 1 - immersion * 0.22;
    // Contact shadows and tapered three-segment limbs give the creature
    // weight. Landing ripples mark actual foot plants, not a looping effect.
    ctx.save();
    ctx.translate(motion.x + 3 * size, motion.y + 6 * size);
    ctx.rotate(motion.heading + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 1, 19 * size, 28 * size, 0, 0, TAU);
    ctx.fillStyle = "#0204088f";
    ctx.fill();
    ctx.restore();
    for (const leg of legs) {
      ctx.beginPath();
      ctx.moveTo(leg.hip.x, leg.hip.y);
      ctx.lineTo(leg.knee.x, leg.knee.y);
      ctx.lineTo(leg.ankle.x, leg.ankle.y);
      ctx.lineTo(leg.x, leg.y);
      ctx.strokeStyle = "#02050aaa";
      ctx.lineWidth = 4.2 * size;
      ctx.stroke();
      line(ctx, leg.hip, leg.knee, color + "b0", 1.8 * size);
      line(
        ctx,
        leg.knee,
        leg.ankle,
        color + (leg.lift > 2 ? "ef" : "a0"),
        1.05 * size,
      );
      line(ctx, leg.ankle, leg, color + "dd", 0.65 * size);
      line(
        ctx,
        { x: leg.hip.x - 0.5, y: leg.hip.y - 0.5 },
        { x: leg.knee.x - 0.5, y: leg.knee.y - 0.5 },
        "#e1f4ef70",
        0.4 * size,
      );
      dot(ctx, leg.knee.x, leg.knee.y, 1.7 * size, "#111e26");
      dot(ctx, leg.knee.x - 0.3, leg.knee.y - 0.3, 0.85 * size, color);
      dot(ctx, leg.ankle.x, leg.ankle.y, 0.85 * size, color + "cf");
      dot(ctx, leg.x, leg.y, 1 * size, "#d7e9e6");
      const landed = time - leg.landedAt;
      if (leg.planted && landed >= 0 && landed < 0.42) {
        ctx.globalAlpha = 1 - landed / 0.42;
        ctx.beginPath();
        ctx.arc(leg.x, leg.y, 2 + landed * 12, 0, TAU);
        ctx.strokeStyle = color + "87";
        ctx.lineWidth = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // Asymmetric sensory reactions: forward feelers attend to the current word;
    // trailing feelers lag behind turns instead of rotating as a rigid fan.
    motion.feelers ??= [];
    const sensing = activeToken
      ? tokenAnchor(
          activeToken,
          model.sections[activeToken.section],
          width,
          height,
          time,
        )
      : motion;
    const attention = Math.atan2(sensing.y - motion.y, sensing.x - motion.x);
    for (let i = 0; i < FEELER_COUNT; i++) {
      const angle = (i * TAU) / FEELER_COUNT + motion.heading;
      const wave =
        Math.sin(time * (1.5 + (i % 4) * 0.23) + i * 1.7) * 0.7 +
        Math.sin(time * 3.3 + i * 0.8) * 0.3;
      const endAngle = angle + wave * 0.24;
      const focus = Math.max(0, Math.cos(angle - attention));
      const reach =
        (34 +
          Math.sin(time * 1.7 + i) * 7 +
          focus * (8 + Math.sin(phase * Math.PI) * 10)) *
        size;
      const desired = {
        x: Math.cos(endAngle) * reach,
        y: Math.sin(endAngle) * reach,
      };
      let feeler = motion.feelers[i];
      if (!feeler || snap)
        feeler = motion.feelers[i] = { ...desired, vx: 0, vy: 0 };
      else if (running && !reduced) {
        const k = 32 + (i % 4) * 7;
        feeler.vx += ((desired.x - feeler.x) * k - feeler.vx * 8) * dt;
        feeler.vy += ((desired.y - feeler.y) * k - feeler.vy * 8) * dt;
        feeler.x += feeler.vx * dt;
        feeler.y += feeler.vy * dt;
      }
      const end = { x: motion.x + feeler.x, y: motion.y + feeler.y };
      ctx.beginPath();
      ctx.moveTo(
        motion.x + Math.cos(angle) * 15 * size,
        motion.y + Math.sin(angle) * 15 * size,
      );
      ctx.bezierCurveTo(
        motion.x + Math.cos(angle + 0.4) * 25 * size,
        motion.y + Math.sin(angle + 0.4) * 25 * size,
        end.x - Math.sin(angle) * 12 * wave,
        end.y + Math.cos(angle) * 12 * wave,
        end.x,
        end.y,
      );
      ctx.strokeStyle = i % 3 === 0 ? color + "af" : color + "61";
      ctx.lineWidth = 0.65;
      ctx.stroke();
      dot(ctx, end.x, end.y, 1.1 * size, i % 4 === 0 ? "#eeaccc" : color);
    }
    // Two reading probes extend, latch, hold, and retract on the word clock.
    if (activeToken && activeToken.section === activeSection) {
      const anchor = tokenAnchor(activeToken, section, width, height, time);
      const reach =
        phase < 0.42
          ? smoothstep(phase / 0.42)
          : phase < 0.74
            ? 1
            : 1 - smoothstep((phase - 0.74) / 0.26);
      for (const side of [-1, 1]) {
        const end = {
          x: lerp(motion.x, anchor.x, reach),
          y: lerp(motion.y, anchor.y, reach),
        };
        const bend =
          Math.min(
            55,
            Math.hypot(anchor.x - motion.x, anchor.y - motion.y) * 0.3,
          ) * side;
        ctx.beginPath();
        ctx.moveTo(motion.x, motion.y);
        ctx.bezierCurveTo(
          lerp(motion.x, end.x, 0.35) - bend * 0.4,
          lerp(motion.y, end.y, 0.35) + bend,
          lerp(motion.x, end.x, 0.72) + bend * 0.3,
          lerp(motion.y, end.y, 0.72) + bend * 0.5,
          end.x,
          end.y,
        );
        ctx.strokeStyle = side === 1 ? "#f4b7d9" : color + "a9";
        ctx.lineWidth = side === 1 ? 1.35 : 0.7;
        ctx.stroke();
        dot(ctx, end.x, end.y, 1.7, "#f4c8e1");
      }
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 4 + Math.sin(phase * Math.PI) * 3, 0, TAU);
      ctx.strokeStyle = phase > 0.44 ? "#ecc4dcef" : color + "70";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      line(
        ctx,
        { x: anchor.x - 9, y: anchor.y },
        { x: anchor.x - 5, y: anchor.y },
        color + "9f",
        0.7,
      );
      line(
        ctx,
        { x: anchor.x + 5, y: anchor.y },
        { x: anchor.x + 9, y: anchor.y },
        color + "9f",
        0.7,
      );
    }
    // Arrival events are emitted only for words the analysis has actually read.
    for (const event of particles) {
      if (running && !reduced) event.age += dt;
      const a = tokenAnchor(
        event.token,
        model.sections[event.token.section],
        width,
        height,
        time,
      );
      const status = event.finding?.status;
      const eventColor =
        status === "flagged"
          ? "#e3a778"
          : status === "resolved"
            ? "#a9d8c2"
            : "#a3bbd2";
      const alpha = Math.max(0, 1 - event.age / 1.1);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3 + event.age * 19, 0, TAU);
      ctx.strokeStyle = eventColor;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (status === "resolved" && event.age < 1.05) {
        const b = sourcePoint(event.finding, width, height),
          progress = clamp(event.age / 0.78, 0, 1);
        for (let i = 0; i < 5; i++) {
          const p = curvePoint(a, b, clamp(progress - i * 0.026, 0, 1));
          dot(
            ctx,
            p.x,
            p.y,
            Math.max(0.35, 2.1 - i * 0.38),
            eventColor + (i === 0 ? "ff" : "70"),
          );
        }
        if (progress > 0.85) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, 4 + event.age * 4, 0, TAU);
          ctx.strokeStyle = eventColor + "90";
          ctx.stroke();
        }
      }
    }
    particles = particles.filter((p) => p.age < 1.15);

    ctx.globalAlpha = 1 - immersion * 0.22;
    // A two-part, lightly breathing carapace with a shaded abdomen and thorax.
    const lifted = legs.reduce((sum, leg) => sum + leg.lift, 0) / legs.length;
    const breathing = 1 + Math.sin(time * 2.25) * 0.018;
    ctx.save();
    ctx.translate(
      motion.x,
      motion.y - lifted * 0.13 + Math.sin(time * 2.4) * 0.4,
    );
    ctx.rotate(motion.heading + Math.PI / 2 + Math.sin(time * 2.1) * 0.012);
    ctx.scale(size, size);
    const shell = ctx.createLinearGradient(-16, -20, 17, 26);
    shell.addColorStop(0, "#29434ae8");
    shell.addColorStop(0.42, "#0c1e28f5");
    shell.addColorStop(1, "#050a12f5");
    ctx.beginPath();
    ctx.ellipse(0, 7, 12.8 * breathing, 18.5 * breathing, 0, 0, TAU);
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.strokeStyle = color + "b5";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -12, 9.2, 11, 0, 0, TAU);
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.strokeStyle = color + "cf";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-2, 5, 8.5, 14, -0.1, Math.PI * 0.8, Math.PI * 1.7);
    ctx.strokeStyle = "#cfece052";
    ctx.lineWidth = 0.65;
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const y = i * 5 - 1;
      const w = Math.sqrt(Math.max(1, 1 - ((y - 7) / 19) ** 2)) * 10;
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.quadraticCurveTo(0, y + 3, w, y);
      ctx.strokeStyle = color + "45";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    line(ctx, { x: 0, y: -17 }, { x: 0, y: 22 }, color + "55", 0.55);
    // Two pedipalps angle toward the word, with four tiny optical highlights.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 5, -17);
      ctx.quadraticCurveTo(
        side * (9 + Math.sin(time * 3 + side)),
        -23,
        side * 7,
        -28,
      );
      ctx.strokeStyle = color + "bf";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      dot(ctx, side * 4, -19, 1.25, "#e7fff3");
      dot(ctx, side * 7, -16, 0.7, "#bfe5df");
    }
    const beat = time % 1.24;
    const pulse =
      Math.exp(-(((beat - 0.16) / 0.065) ** 2)) +
      0.5 * Math.exp(-(((beat - 0.34) / 0.08) ** 2));
    ctx.shadowColor = "#f46db5";
    ctx.shadowBlur = 13 + pulse * 8;
    dot(ctx, 0, 3, 3.5 + pulse * 0.65, "#f19fc9");
    ctx.shadowBlur = 0;
    dot(ctx, -0.8, 2.1, 1, "#fff0f7");
    ctx.restore();
    ctx.restore();

    if (!volume?.available) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);
      ctx.globalAlpha = 0.5 + immersion * 0.5;
      ctx.drawImage(galaxy.layers[2], 0, 0, width, height);
      ctx.restore();
    }

    // DOM labels remain clickable and keyboard accessible while following the
    // same world coordinates as the probe endpoints. No per-frame React render.
    const placed = [];
    for (const token of state.visibleTokens) {
      const element = elements.tokens.current.get(token.index);
      if (!element) continue;
      const anchor = project(
        tokenAnchor(token, model.sections[token.section], width, height, time),
      );
      const boxWidth = Math.min(150, Math.max(43, token.text.length * 6 + 16));
      let x = clamp(anchor.x + 8, 5, width - boxWidth - 5),
        y = clamp(anchor.y - 10, 7, height - 27);
      for (let pass = 0; pass < 4; pass++) {
        if (
          !placed.some(
            (p) =>
              Math.abs(p.y - y) < 23 &&
              x < p.x + p.width + 7 &&
              x + boxWidth + 7 > p.x,
          )
        )
          break;
        y = clamp(y + (y > height * 0.7 ? -25 : 25), 7, height - 27);
      }
      placed.push({ x, y, width: boxWidth });
      element.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
      element.style.opacity =
        token.index === cursor
          ? "1"
          : token.index > cursor
            ? ".4"
            : String(Math.max(0.35, 1 - (cursor - token.index) * 0.1));
    }
    for (const s of model.sections) {
      const element = elements.sections.current.get(s.index);
      if (!element) continue;
      const [x, y] = sectionPosition(s.index);
      const p = projectVolume(
        { x: x * width, y: y * height, z: 0 },
        camera,
        width,
        height,
      );
      p.y -= Math.min(160, height * 0.21) * p.scale;
      element.style.transform = `translate3d(${clamp(p.x - 8, 6, width - 92).toFixed(2)}px,${clamp(p.y, 10, height - 28).toFixed(2)}px,0)`;
    }
    if (elements.body.current) {
      const p = project(motion);
      elements.body.current.style.opacity = String(1 - immersion * 0.3);
      elements.body.current.style.transform = `translate3d(${p.x.toFixed(2)}px,${(p.y + 34 * size).toFixed(2)}px,0)`;
    }
    if (elements.phase.current)
      elements.phase.current.textContent = !running
        ? "PAUSED"
        : cursor >= model.tokens.length
          ? "COMPLETE"
          : phase < 0.44
            ? "REACHING"
            : phase < 0.83
              ? "READING"
              : "CLASSIFYING";
    // Useful observability without manufacturing metrics or resetting motion.
    canvas.dataset.frame = String(frame);
    canvas.dataset.cursor = String(cursor);
    canvas.dataset.bodyX = motion.x.toFixed(2);
    canvas.dataset.bodyY = motion.y.toFixed(2);
    canvas.dataset.motionTime = time.toFixed(3);
    canvas.dataset.bodyZ = motion.z.toFixed(2);
    canvas.dataset.immersion = immersion.toFixed(3);
    canvas.dataset.renderer = volume?.available
      ? "webgl-volume"
      : "canvas-fallback";
    if (elements.depth.current) {
      elements.depth.current.textContent = depthStage;
      elements.depth.current.style.setProperty("--depth", String(immersion));
    }
    if (elements.depthValue.current)
      elements.depthValue.current.textContent = `${Math.round(immersion * 100)}%`;
    if (elements.depthBar.current)
      elements.depthBar.current.style.transform = `scaleX(${Math.max(0.04, immersion)})`;
    canvas.dataset.cameraX = camera.x.toFixed(2);
    canvas.dataset.cameraY = camera.y.toFixed(2);
    canvas.dataset.viewYaw = camera.yaw.toFixed(4);
    canvas.dataset.viewPitch = camera.pitch.toFixed(4);
    canvas.dataset.fieldPoints = String(
      model.web.points.length + model.web.dust.length + model.web.field.length,
    );
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(raf);
    resize.disconnect();
    media.removeEventListener("change", reducedChanged);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerleave", pointerLeave);
    canvas.removeEventListener("pointerdown", dragStart);
    canvas.removeEventListener("pointermove", dragMove);
    canvas.removeEventListener("pointerup", dragEnd);
    canvas.removeEventListener("pointercancel", dragEnd);
    canvas.removeEventListener("keydown", orbitKey);
    volume?.dispose();
  };
}
