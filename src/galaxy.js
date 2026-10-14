// A procedural cosmic web: streamlines, tidal bridges, depth-separated dust,
// and stellar points. Ambient geometry is illustrative, never source evidence.
const TAU = Math.PI * 2;
export const GALAXY_SCALE = 2.65;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CENTERS = [
  [0.28, 0.29],
  [0.52, 0.17],
  [0.77, 0.34],
  [0.73, 0.66],
  [0.24, 0.66],
  [0.54, 0.84],
  [0.46, 0.48],
  [0.84, 0.83],
];
const SHAPES = [
  [1.25, 1.05, -0.68],
  [0.95, 0.95, 0.5],
  [1.25, 1.12, 0.82],
  [1.3, 1.1, -0.27],
  [1.16, 0.95, -0.83],
  [1.1, 1.05, 0.38],
  [0.8, 0.82, -0.3],
  [0.85, 0.9, 0.85],
];
export function galaxyCenter(index) {
  if (index < 8) return CENTERS[index];
  const angle = index * 2.399963;
  return [0.5 + Math.cos(angle) * 0.28, 0.5 + Math.sin(angle) * 0.28];
}
export function galaxyPoint(p, width, height) {
  if (p.field) return { x: p.x * width, y: p.y * height };
  const [cx, cy] = galaxyCenter(p.cluster);
  const unit = Math.min(width, height) * GALAXY_SCALE;
  return { x: cx * width + p.dx * unit, y: cy * height + p.dy * unit };
}
export function makeGalaxy(sectionCount) {
  const count = Math.max(1, sectionCount),
    rand = seeded(817);
  const normal = () =>
    Math.sqrt(-2 * Math.log(Math.max(0.0001, rand()))) * Math.cos(TAU * rand());
  const points = [],
    dust = [],
    edges = [],
    streams = [],
    clouds = [],
    bridges = [],
    field = [];
  const strands = Math.floor(Math.min(14000, count * 1800) / count / 25);
  for (let cluster = 0; cluster < count; cluster++) {
    const [sx, sy, rotation] = SHAPES[cluster % 8];
    const transform = (x, y) => ({
      dx: (x * Math.cos(rotation) - y * Math.sin(rotation)) * sx,
      dy: (x * Math.sin(rotation) + y * Math.cos(rotation)) * sy,
    });
    clouds.push({ cluster, ...transform(0, 0), sx, sy, rotation });
    for (let strand = 0; strand < strands; strand++) {
      const arm = rand() * TAU,
        depth = rand() * 2 - 1;
      const start = 0.006 + Math.pow(rand(), 1.5) * 0.072;
      const span = 0.023 + rand() * 0.078;
      const curl = (rand() > 0.4 ? 1 : -1) * (1.1 + rand() * 2.4);
      const phase = rand() * TAU,
        warp = 0.002 + rand() * 0.009;
      const ids = [];
      for (let step = 0; step < 25; step++) {
        const t = step / 24,
          r = start + span * t;
        const a = arm + curl * t + Math.sin(t * 5 + phase) * 0.16;
        const q = transform(
          Math.cos(a) * r + Math.sin(t * 7 + phase) * warp,
          Math.sin(a) * r * 0.78 + Math.cos(t * 9 + phase) * warp * 0.6,
        );
        const p = {
          ...q,
          cluster,
          depth: depth + Math.sin(t * 3 + phase) * 0.12,
          size: rand(),
          phase: rand() * TAU,
        };
        const [cx, cy] = galaxyCenter(cluster);
        p.x = cx + p.dx;
        p.y = cy + p.dy;
        const index = points.length;
        points.push(p);
        ids.push(index);
        if (step) edges.push([index - 1, index]);
        // Finely scattered matter fills the fibers instead of making flat polygons.
        for (let d = 0; d < 2; d++) {
          const scatter = (0.0025 + r * 0.047) * (d ? 1.8 : 1);
          dust.push({
            cluster,
            dx: q.dx + normal() * scatter,
            dy: q.dy + normal() * scatter,
            depth: clamp(depth + normal() * 0.24, -1, 1),
            size: rand(),
          });
          const fog = transform(normal() * 0.043, normal() * 0.037);
          dust.push({
            ...fog,
            cluster,
            depth: clamp(normal() * 0.6, -1, 1),
            size: rand(),
          });
        }
      }
      streams.push({ ids, depth, cluster });
    }
  }
  // Sparse cross-fibers add structure without a uniform triangulated lattice.
  const buckets = new Map(),
    cell = 0.022;
  points.forEach((p, i) => {
    const key = `${p.cluster}:${Math.floor(p.dx / cell)},${Math.floor(p.dy / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });
  for (let i = 0; i < points.length; i += 3) {
    const p = points[i],
      x = Math.floor(p.dx / cell),
      y = Math.floor(p.dy / cell);
    let closest = -1,
      best = 0.001;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const j of buckets.get(`${p.cluster}:${x + a},${y + b}`) || []) {
          if (j <= i || Math.abs(j - i) < 26) continue;
          const q = points[j],
            distance =
              (p.dx - q.dx) ** 2 +
              (p.dy - q.dy) ** 2 +
              ((p.depth - q.depth) * 0.13) ** 2;
          if (distance < best) {
            best = distance;
            closest = j;
          }
        }
    if (closest >= 0) edges.push([i, closest]);
  }
  // Thin tidal streams join the major complexes, as in the reference cloud map.
  const routes = [
    [0, 1],
    [0, 4],
    [0, 6],
    [1, 2],
    [2, 3],
    [3, 5],
    [4, 5],
    [4, 6],
    [6, 3],
    [5, 7],
  ];
  for (const [from, to] of routes) {
    if (from >= count || to >= count) continue;
    const [ax, ay] = galaxyCenter(from),
      [bx, by] = galaxyCenter(to);
    for (let i = 0; i < 18; i++) {
      const offset = (rand() - 0.5) * 0.07;
      bridges.push({
        ax: ax + offset,
        ay: ay + offset * 0.7,
        bx: bx - offset * 0.5,
        by: by + offset,
        bend: (rand() - 0.5) * 0.13,
        alpha: 0.022 + rand() * 0.024,
      });
    }
  }
  for (let i = 0; i < 900; i++)
    field.push({
      field: true,
      x: rand(),
      y: rand(),
      size: Math.pow(rand(), 3),
      depth: rand(),
      phase: rand() * TAU,
    });
  return { points, dust, edges, streams, clouds, bridges, field };
}

export function makeFootholds(web, width, height) {
  const buckets = new Map(),
    cell = 32;
  web.points.forEach((point, i) => {
    if (i % 4) return;
    const p = galaxyPoint(point, width, height);
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  });
  return (target) => {
    const x = Math.floor(target.x / cell),
      y = Math.floor(target.y / cell);
    let found = target,
      best = 18 * 18;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const p of buckets.get(`${x + a},${y + b}`) || []) {
          const distance = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
          if (distance < best) {
            found = p;
            best = distance;
          }
        }
    return { x: found.x, y: found.y };
  };
}

function haze(ctx, x, y, rx, ry, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, `rgba(${color},${alpha})`);
  gradient.addColorStop(0.35, `rgba(${color},${alpha * 0.45})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}
export function paintGalaxy(web, width, height, dpr) {
  const ratio = Math.min(dpr, 1.5),
    unit = Math.min(width, height) * GALAXY_SCALE;
  const layers = Array.from({ length: 3 }, () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { canvas, ctx };
  });
  const projected = web.points.map((p) => galaxyPoint(p, width, height));
  const depthIndex = (depth) => (depth < -0.33 ? 0 : depth > 0.33 ? 2 : 1);
  // Nebular bloom is restrained and local: no opaque gradient "cloud stickers".
  for (const cloud of web.clouds) {
    const [cx, cy] = galaxyCenter(cloud.cluster);
    const ctx = layers[0].ctx;
    ctx.save();
    ctx.translate(cx * width, cy * height);
    ctx.rotate(cloud.rotation);
    haze(
      ctx,
      0,
      0,
      unit * 0.115 * cloud.sx,
      unit * 0.09 * cloud.sy,
      "111,123,161",
      0.07,
    );
    haze(
      ctx,
      0,
      0,
      unit * 0.038 * cloud.sx,
      unit * 0.033 * cloud.sy,
      "167,166,185",
      0.095,
    );
    haze(
      ctx,
      -unit * 0.055,
      unit * 0.018,
      unit * 0.075,
      unit * 0.06,
      "144,146,167",
      0.048,
    );
    ctx.restore();
  }
  for (let layer = 0; layer < 3; layer++) {
    const ctx = layers[layer].ctx;
    // Cache dust in intensity bands. Thousands of subpixel specks form a volume.
    for (let band = 0; band < 4; band++) {
      ctx.fillStyle = `rgba(${layer === 0 ? "148,158,185" : layer === 1 ? "193,196,212" : "215,220,231"},${0.065 + band * 0.032})`;
      for (const p of web.dust) {
        if (depthIndex(p.depth) !== layer || Math.floor(p.size * 4) !== band)
          continue;
        const q = galaxyPoint(p, width, height);
        const r = 0.32 + p.size * 0.48;
        ctx.fillRect(q.x, q.y, r, r);
      }
    }
    ctx.beginPath();
    for (const [i, j] of web.edges) {
      if (depthIndex(web.points[i].depth) !== layer) continue;
      const a = projected[i],
        b = projected[j];
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle =
      layer === 0
        ? "rgba(148,160,187,.105)"
        : layer === 1
          ? "rgba(191,194,213,.145)"
          : "rgba(207,214,227,.175)";
    ctx.lineWidth = layer === 0 ? 0.35 : 0.4;
    ctx.stroke();
    for (let bin = 0; bin < 4; bin++) {
      ctx.beginPath();
      web.points.forEach((p, i) => {
        if (depthIndex(p.depth) !== layer || Math.floor(p.size * 4) !== bin)
          return;
        const q = projected[i];
        const r = p.size > 0.993 ? 1.05 : 0.22 + p.size * 0.34;
        ctx.moveTo(q.x + r, q.y);
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      });
      ctx.fillStyle = `rgba(215,222,235,${0.14 + bin * 0.13})`;
      ctx.fill();
    }
  }
  const middle = layers[1].ctx;
  for (const bridge of web.bridges) {
    middle.beginPath();
    middle.moveTo(bridge.ax * width, bridge.ay * height);
    middle.bezierCurveTo(
      (bridge.ax * 0.55 + bridge.bx * 0.45 + bridge.bend) * width,
      (bridge.ay * 0.7 + bridge.by * 0.3) * height,
      (bridge.ax * 0.3 + bridge.bx * 0.7 - bridge.bend) * width,
      (bridge.ay * 0.3 + bridge.by * 0.7) * height,
      bridge.bx * width,
      bridge.by * height,
    );
    middle.strokeStyle = `rgba(181,191,218,${bridge.alpha})`;
    middle.lineWidth = 0.45;
    middle.stroke();
  }
  // Brighter stellar highlights have real tiny halos, rather than large dots.
  for (let i = 0; i < web.points.length; i++) {
    const p = web.points[i];
    if (p.size < 0.992) continue;
    const q = projected[i],
      ctx = layers[depthIndex(p.depth)].ctx;
    haze(ctx, q.x, q.y, 4.5, 4.5, "193,213,244", 0.22);
    if (p.size > 0.998) {
      ctx.beginPath();
      ctx.moveTo(q.x - 3, q.y);
      ctx.lineTo(q.x + 3, q.y);
      ctx.moveTo(q.x, q.y - 3);
      ctx.lineTo(q.x, q.y + 3);
      ctx.strokeStyle = "rgba(220,231,250,.26)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
  return {
    layers: layers.map((layer) => layer.canvas),
    projected,
    foothold: makeFootholds(web, width, height),
  };
}
