import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceBody,
  bodyTarget,
  createMotionState,
  LEG_COUNT,
  makeWeb,
  tokenAnchor,
  updateLegs,
  WORD_INTERVAL_MS,
} from "./spider-motion.js";
import { parsePrompt, DEMO_PROMPT } from "./engine.js";
const sections = parsePrompt(DEMO_PROMPT);

test("word clock leaves time for reaching, reading, and classification", () => {
  assert.equal(WORD_INTERVAL_MS, 480);
  assert.ok(WORD_INTERVAL_MS / 4 >= 100);
});

test("body travels continuously across section changes without resetting time", () => {
  const state = createMotionState();
  const a = bodyTarget(sections[0], 3, 800, 500, 0);
  advanceBody(state, a, 1 / 60);
  state.time = 3;
  const b = bodyTarget(sections[1], 23, 800, 500, state.time);
  advanceBody(state, b, 1 / 60);
  assert.ok(state.x > a.x && state.x < b.x);
  assert.equal(state.time, 3);
  for (let i = 0; i < 360; i++) advanceBody(state, b, 1 / 60);
  assert.ok(Math.hypot(state.x - b.x, state.y - b.y) < 0.01);
});

test("eight articulated legs lift independently and have finite knee positions", () => {
  const state = createMotionState(200, 200);
  state.initialized = true;
  state.time = 0;
  updateLegs(state);
  const before = JSON.stringify(state.legs);
  for (let i = 0; i < 12; i++) {
    state.time += 1 / 60;
    advanceBody(state, { x: 260, y: 205 }, 1 / 60);
    updateLegs(state);
  }
  const legs = state.legs;
  assert.equal(legs.length, LEG_COUNT);
  assert.notEqual(JSON.stringify(legs), before);
  assert.ok(legs.some((l) => l.lift > 1));
  assert.ok(legs.some((l) => l.lift < 0.01));
  for (const leg of legs)
    for (const point of [leg, leg.hip, leg.knee])
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
});

test("feet are planted during the stance portion of the gait", () => {
  const state = createMotionState(200, 200);
  state.time = 0.32;
  updateLegs(state);
  const foot = { x: state.legs[0].x, y: state.legs[0].y };
  state.x += 2;
  state.time = 0.35;
  updateLegs(state);
  assert.deepEqual({ x: state.legs[0].x, y: state.legs[0].y }, foot);
});

test("pause freezes both the body and the gait when the clock does not advance", () => {
  const state = createMotionState(200, 200);
  state.time = 2.1;
  updateLegs(state);
  const snapshot = JSON.stringify(state);
  updateLegs(state);
  assert.equal(JSON.stringify(state), snapshot);
});

test("word anchors are stable on scrubbing and finite on mobile", () => {
  const token = sections[2].tokens[3];
  assert.deepEqual(
    tokenAnchor(token, sections[2], 800, 500, 1),
    tokenAnchor(token, sections[2], 800, 500, 1),
  );
  const mobile = tokenAnchor(token, sections[2], 300, 260, 3);
  assert.ok(
    mobile.x >= 20 && mobile.x <= 275 && mobile.y >= 26 && mobile.y <= 236,
  );
  for (const section of sections) {
    const target = bodyTarget(section, section.tokens[0].index, 300, 260, 1);
    assert.ok(target.x >= 60 && target.x <= 240);
    assert.ok(target.y >= 50 && target.y <= 210);
  }
});

test("organic web is seeded, bounded in cost, and connects valid vertices", () => {
  const a = makeWeb(sections),
    b = makeWeb(sections);
  assert.equal(a.points.length, 14000);
  assert.equal(a.dust.length, 56000);
  assert.equal(a.field.length, 900);
  assert.ok(
    a.points.some((p) => p.depth < -0.33) &&
      a.points.some((p) => p.depth > 0.33),
  );
  assert.ok(a.edges.length > 10000 && a.edges.length < 36000);
  assert.deepEqual(a.points.slice(0, 20), b.points.slice(0, 20));
  assert.deepEqual(a.edges.slice(0, 20), b.edges.slice(0, 20));
  assert.ok(a.edges.every(([i, j]) => i >= 0 && j < a.points.length && i < j));
});

test("body acceleration is bounded and travel does not teleport", () => {
  const state = createMotionState(100, 100);
  state.initialized = true;
  advanceBody(state, { x: 1000, y: 1000 }, 1 / 60);
  assert.ok(state.speed <= 7.0001);
  assert.ok(Math.hypot(state.x - 100, state.y - 100) < 0.2);
  for (let i = 0; i < 120; i++)
    advanceBody(state, { x: 1000, y: 1000 }, 1 / 60);
  assert.ok(state.speed <= 165.0001);
});

test("a resting spider does not churn its feet without a useful next foothold", () => {
  const state = createMotionState(200, 200);
  state.initialized = true;
  updateLegs(state);
  const feet = state.legs.map((leg) => ({ x: leg.x, y: leg.y }));
  for (let i = 0; i < 90; i++) {
    state.time += 1 / 60;
    updateLegs(state);
  }
  assert.deepEqual(
    state.legs.map((leg) => ({ x: leg.x, y: leg.y })),
    feet,
  );
  assert.ok(state.legs.every((leg) => leg.planted));
});
