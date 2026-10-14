import test from "node:test";
import assert from "node:assert/strict";
import { galaxyPoint, makeGalaxy, makeFootholds } from "./galaxy.js";

test("galaxy uses filaments and depth-separated dust, not a flat neighbor mesh", () => {
  const galaxy = makeGalaxy(8);
  assert.equal(galaxy.streams.length, 560);
  assert.equal(galaxy.clouds.length, 8);
  assert.ok(galaxy.bridges.length > 100);
  assert.equal(
    galaxy.points.length + galaxy.dust.length + galaxy.field.length,
    70900,
  );
  assert.ok(galaxy.streams.every((stream) => stream.ids.length === 25));
  assert.ok(
    galaxy.points.every(
      (p) =>
        Number.isFinite(p.depth) &&
        Number.isFinite(p.dx) &&
        Number.isFinite(p.dy),
    ),
  );
});

test("galaxy sizes stay bounded as section counts increase", () => {
  for (const count of [1, 4, 16, 50]) {
    const galaxy = makeGalaxy(count);
    assert.ok(galaxy.points.length <= 14000);
    assert.ok(galaxy.dust.length <= 56000);
  }
});

test("galaxy projection preserves local proportions across different aspect ratios", () => {
  const p = { cluster: 0, dx: 0.1, dy: 0.1 };
  const landscape = galaxyPoint(p, 800, 400);
  const portrait = galaxyPoint(p, 400, 800);
  assert.ok(
    Math.abs(landscape.x - 0.28 * 800 - (landscape.y - 0.29 * 400)) < 0.0001,
  );
  assert.ok(
    Math.abs(portrait.x - 0.28 * 400 - (portrait.y - 0.29 * 800)) < 0.0001,
  );
});

test("feet can find a real nearby web vertex, or keep their target if none exists", () => {
  const galaxy = makeGalaxy(2);
  const foot = makeFootholds(galaxy, 800, 500);
  const real = galaxyPoint(galaxy.points[0], 800, 500);
  const placed = foot({ x: real.x + 1, y: real.y + 1 });
  assert.ok(Math.hypot(placed.x - real.x, placed.y - real.y) < 3);
  const outside = { x: -1000, y: -1000 };
  assert.deepEqual(foot(outside), outside);
});
