import { makeGalaxy } from "./galaxy.js";
// One shared clock drives reaching, classification, and the actual word commit.
export const WORD_INTERVAL_MS = 480;
export const LEG_COUNT = 8;
export const FEELER_COUNT = 12;
export const SECTION_POSITIONS = [
  [0.28, 0.29],
  [0.52, 0.17],
  [0.77, 0.34],
  [0.73, 0.66],
  [0.24, 0.66],
  [0.54, 0.84],
  [0.46, 0.48],
  [0.84, 0.83],
];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const fract = (value) => value - Math.floor(value);
export function randomGenerator(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sectionPosition(index) {
  if (index < SECTION_POSITIONS.length) return SECTION_POSITIONS[index];
  const angle = index * 2.399963;
  return [0.5 + Math.cos(angle) * 0.28, 0.5 + Math.sin(angle) * 0.28];
}
export function tokenAnchor(token, section, width, height, time = 0) {
  const center = sectionPosition(token.section);
  const local = token.index - (section.tokens[0]?.index || 0);
  const angle = local * 2.399963 + token.section * 0.73;
  const radius = 0.72 + fract(local * 0.618) * 0.4;
  // Token coordinates are persistent, not re-randomized on each React update.
  const rx = Math.min(width * 0.17, 126);
  const ry = Math.min(height * 0.19, 107);
  return {
    x: clamp(
      center[0] * width +
        Math.cos(angle) * rx * radius +
        Math.sin(time * 0.65 + local) * 2,
      20,
      width - 25,
    ),
    y: clamp(
      center[1] * height +
        Math.sin(angle) * ry * radius +
        Math.cos(time * 0.55 + local) * 2,
      26,
      height - 24,
    ),
  };
}
export function bodyTarget(section, cursor, width, height, time) {
  const [x, y] = sectionPosition(section.index);
  const progress = clamp(
    (cursor - (section.tokens[0]?.index || 0)) /
      Math.max(section.tokens.length, 1),
    0,
    1,
  );
  const angle = section.index * 0.9 + 0.5;
  const travel =
    (1 - 2 * progress) * Math.min(90, Math.min(width, height) * 0.16);
  const token =
    section.tokens.find((t) => t.index === cursor) || section.tokens.at(-1);
  const look = token
    ? tokenAnchor(token, section, width, height, time)
    : { x: x * width, y: y * height };
  return {
    lookX: look.x,
    lookY: look.y,
    x: clamp(
      x * width + Math.cos(angle) * travel + Math.sin(time * 0.9) * 0.6,
      Math.min(72, width * 0.22),
      width - Math.min(72, width * 0.22),
    ),
    y: clamp(
      y * height + Math.sin(angle) * travel * 0.65 + Math.cos(time * 1.1) * 0.6,
      Math.min(65, height * 0.22),
      height - Math.min(65, height * 0.22),
    ),
  };
}
export function createMotionState(x = 0, y = 0) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    speed: 0,
    heading: -0.7,
    time: 0,
    gaitTime: null,
    legs: [],
    initialized: false,
  };
}
export function advanceBody(state, target, delta, snap = false) {
  if (snap || !state.initialized) {
    state.x = target.x;
    state.y = target.y;
    state.vx = 0;
    state.vy = 0;
    state.speed = 0;
    state.initialized = true;
    return;
  }
  const dt = clamp(delta, 0, 0.05);
  // Acceleration and turning limits make the body carry weight instead of
  // sliding immediately toward the next point on an exponential tween.
  let ax = (target.x - state.x) * 19 - state.vx * 8.7;
  let ay = (target.y - state.y) * 19 - state.vy * 8.7;
  const acceleration = Math.hypot(ax, ay),
    maxAcceleration = 420;
  if (acceleration > maxAcceleration) {
    ax *= maxAcceleration / acceleration;
    ay *= maxAcceleration / acceleration;
  }
  state.vx += ax * dt;
  state.vy += ay * dt;
  const velocity = Math.hypot(state.vx, state.vy),
    maxSpeed = 165;
  if (velocity > maxSpeed) {
    state.vx *= maxSpeed / velocity;
    state.vy *= maxSpeed / velocity;
  }
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.speed = Math.hypot(state.vx, state.vy);
  const moving = state.speed > 9;
  const lookX = moving ? state.vx : (target.lookX ?? target.x) - state.x;
  const lookY = moving ? state.vy : (target.lookY ?? target.y) - state.y;
  if (Math.hypot(lookX, lookY) > 0.2) {
    const desired = Math.atan2(lookY, lookX);
    const turn = Math.atan2(
      Math.sin(desired - state.heading),
      Math.cos(desired - state.heading),
    );
    state.heading += clamp(
      turn * (1 - Math.exp(-dt * 3.1)),
      -dt * 2.2,
      dt * 2.2,
    );
  }
  state.gaitTime =
    (state.gaitTime ?? state.time * 0.7) +
    dt * (0.55 + Math.min(3.1, state.speed / 45));
}
export function updateLegs(
  state,
  scale = 1,
  snap = false,
  foothold = (p) => p,
) {
  const gait = state.gaitTime ?? state.time * 1.65;
  for (let i = 0; i < LEG_COUNT; i++) {
    const side = i < 4 ? -1 : 1,
      pair = i % 4;
    const angle = state.heading + side * (0.54 + pair * 0.7);
    const reach = (46 + (pair === 1 || pair === 2 ? 12 : 0)) * scale;
    const stride = Math.min(17, (state.speed || 0) * 0.1) * scale;
    const desired = {
      x:
        state.x +
        Math.cos(angle) * reach +
        Math.cos(state.heading) * (7 * scale + stride),
      y:
        state.y +
        Math.sin(angle) * reach +
        Math.sin(state.heading) * (7 * scale + stride),
    };
    const phase = fract(
      gait + (i % 2) * 0.5 + (i >= 4 ? 0.5 : 0) + pair * 0.04,
    );
    let leg = state.legs[i];
    if (!leg || snap) {
      const ground = foothold(desired);
      leg = state.legs[i] = {
        x: ground.x,
        y: ground.y,
        ground,
        from: ground,
        to: ground,
        stepStart: state.time - 10,
        duration: 0.23,
        lift: 0,
        planted: true,
        landedAt: -10,
      };
    }
    const drift = Math.hypot(desired.x - leg.to.x, desired.y - leg.to.y);
    const stretched =
      Math.hypot(state.x - leg.x, state.y - leg.y) > reach * 1.45;
    // A stationary foot does not churn in place. Step only when it has a useful
    // next foothold; emergency replanting prevents unbounded stretched legs.
    if (leg.planted && ((phase < 0.25 && drift > 4.5 * scale) || stretched)) {
      leg.from = { ...leg.ground };
      leg.to = foothold(desired);
      leg.stepStart = state.time;
      leg.duration = 0.27 - Math.min(0.11, (state.speed || 0) / 1500);
      leg.planted = false;
    }
    const progress = clamp((state.time - leg.stepStart) / leg.duration, 0, 1);
    if (!leg.planted) {
      const ease = progress ** 3 * (progress * (progress * 6 - 15) + 10);
      leg.ground = {
        x: lerp(leg.from.x, leg.to.x, ease),
        y: lerp(leg.from.y, leg.to.y, ease),
      };
      if (progress === 1) {
        leg.planted = true;
        leg.landedAt = state.time;
      }
    }
    leg.lift = leg.planted
      ? 0
      : Math.sin(progress * Math.PI) ** 0.85 * (8 + pair) * scale;
    leg.x = leg.ground.x;
    leg.y = leg.ground.y - leg.lift;
    const sway = Math.sin(state.time * 2.4) * 0.45;
    leg.hip = {
      x: state.x + Math.cos(angle) * 12 * scale,
      y: state.y + Math.sin(angle) * 12 * scale + sway,
    };
    const dx = leg.x - leg.hip.x,
      dy = leg.y - leg.hip.y,
      distance = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.sqrt(
      Math.max(0, (37 * scale) ** 2 - (distance * 0.5) ** 2),
    );
    leg.knee = {
      x: (leg.hip.x + leg.x) / 2 - (dy / distance) * bend * side,
      y:
        (leg.hip.y + leg.y) / 2 +
        (dx / distance) * bend * side -
        leg.lift * 0.28,
    };
    leg.ankle = {
      x: lerp(leg.knee.x, leg.x, 0.77) + (dy / distance) * 2.5 * side * scale,
      y: lerp(leg.knee.y, leg.y, 0.77) - (dx / distance) * 2.5 * side * scale,
    };
  }
  return state.legs;
}

export function makeWeb(sections) {
  return makeGalaxy(typeof sections === "number" ? sections : sections.length);
}
