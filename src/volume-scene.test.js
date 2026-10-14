import test from "node:test";
import assert from "node:assert/strict";
import {
  traversalState,
  projectVolume,
  bodyPlane,
  clusterExtent,
  tokenDepth,
  CLUSTER_SCALE,
} from "./volume-scene.js";
import { parsePrompt, DEMO_PROMPT } from "./engine.js";
const section = parsePrompt(DEMO_PROMPT)[0];
const camera = { x: 400, y: 300, z: 0, yaw: 0.25, pitch: -0.15, zoom: 1.2 };

test("clusters are substantially larger than the previous 1.55-scale map", () => {
  assert.ok(CLUSTER_SCALE / 1.55 > 1.7);
  assert.equal(clusterExtent(800, 500), 500 * 2.65 * 0.13);
});

test("a crawl approaches the shell, descends behind the core, and emerges", () => {
  const start = traversalState(section, 0);
  const core = traversalState(section, 11);
  const end = traversalState(section, 22);
  assert.ok(start.depth > 0 && end.depth > 0);
  assert.ok(core.depth < -0.7);
  assert.equal(core.immersion, 1);
  assert.equal(core.stage, "WITHIN THE CORE");
  assert.ok(start.immersion < 0.01 && end.immersion < 0.01);
});

test("depth progresses within each word rather than snapping only on word counts", () => {
  const a = traversalState(section, 3, 0.1),
    b = traversalState(section, 3, 0.8);
  assert.ok(b.progress > a.progress && b.immersion > a.immersion);
});

test("perspective gives near points larger apparent scale than far points", () => {
  const flat = { ...camera, yaw: 0, pitch: 0 };
  const near = projectVolume({ x: 430, y: 300, z: 150 }, flat, 800, 600);
  const far = projectVolume({ x: 430, y: 300, z: -150 }, flat, 800, 600);
  assert.ok(near.scale > far.scale);
  assert.ok(near.x - 400 > far.x - 400);
});

test("orbit separates points with the same x/y but different depth", () => {
  const front = projectVolume({ x: 400, y: 300, z: 100 }, camera, 800, 600);
  const back = projectVolume({ x: 400, y: 300, z: -100 }, camera, 800, 600);
  assert.ok(Math.abs(front.x - back.x) > 20);
  assert.ok(Math.abs(front.y - back.y) > 10);
});

test("drawing plane correctly maps 3D word positions onto probe endpoints", () => {
  const body = { x: 350, y: 260, z: -120 };
  const plane = bodyPlane(body, camera, 800, 600);
  const screen = projectVolume({ x: 480, y: 320, z: 100 }, camera, 800, 600);
  const endpoint = plane.toWorld(screen),
    back = plane.toScreen(endpoint);
  assert.ok(Math.abs(back.x - screen.x) < 1e-8);
  assert.ok(Math.abs(back.y - screen.y) < 1e-8);
  const center = plane.toScreen(body);
  assert.ok(Math.abs(center.x - plane.screen.x) < 1e-8);
});

test("word depths are deterministic and stay inside the reading volume", () => {
  const extent = clusterExtent(800, 500);
  for (const token of section.tokens) {
    assert.equal(tokenDepth(token, extent), tokenDepth(token, extent));
    assert.ok(Math.abs(tokenDepth(token, extent)) <= extent);
  }
});
