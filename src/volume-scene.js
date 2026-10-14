import { galaxyPoint, GALAXY_SCALE } from "./galaxy.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const CLUSTER_SCALE = GALAXY_SCALE;
export function clusterExtent(width, height) {
  return Math.min(width, height) * CLUSTER_SCALE * 0.13;
}
export function traversalState(section, cursor, phase = 0) {
  const first = section.tokens[0]?.index || 0;
  const progress = clamp(
    (cursor - first + phase) / Math.max(section.tokens.length, 1),
    0,
    1,
  );
  const immersion = Math.sin(progress * Math.PI) ** 0.85;
  return {
    progress,
    immersion,
    depth: 0.85 - 1.62 * immersion,
    stage:
      progress < 0.13
        ? "APPROACH"
        : progress < 0.38
          ? "ENTERING"
          : progress < 0.7
            ? "WITHIN THE CORE"
            : progress < 0.92
              ? "EMERGING"
              : "OUTER SHELL",
  };
}
export function tokenDepth(token, extent) {
  const seed = Math.sin((token.index + 1) * 12.9898) * 43758.5453;
  return ((seed - Math.floor(seed)) * 1.35 - 0.65) * extent;
}
// Shared by GPU shaders, spider, probes, and DOM labels. Z is real scene depth;
// yaw and pitch rotate that volume before perspective, not a parallax sticker.
export function projectVolume(point, camera, width, height) {
  const x = point.x - camera.x,
    y = point.y - camera.y,
    z = (point.z || 0) - (camera.z || 0);
  const cy = Math.cos(camera.yaw),
    sy = Math.sin(camera.yaw),
    cp = Math.cos(camera.pitch),
    sp = Math.sin(camera.pitch);
  const rx = x * cy - z * sy,
    rz = x * sy + z * cy;
  const ry = y * cp - rz * sp,
    depth = y * sp + rz * cp;
  const focal = Math.min(width, height) * 2.8;
  const scale = focal / Math.max(focal * 0.24, focal - depth);
  return {
    x: width / 2 + rx * scale * camera.zoom,
    y: height / 2 + ry * scale * camera.zoom,
    depth,
    scale: scale * camera.zoom,
  };
}
export function bodyPlane(body, camera, width, height) {
  const p = projectVolume(body, camera, width, height);
  const px = projectVolume({ ...body, x: body.x + 1 }, camera, width, height);
  const py = projectVolume({ ...body, y: body.y + 1 }, camera, width, height);
  const a = px.x - p.x,
    b = px.y - p.y,
    c = py.x - p.x,
    d = py.y - p.y,
    det = a * d - b * c;
  const tx = p.x - a * body.x - c * body.y,
    ty = p.y - b * body.x - d * body.y;
  return {
    a,
    b,
    c,
    d,
    tx,
    ty,
    screen: p,
    toScreen: (q) => ({ x: a * q.x + c * q.y + tx, y: b * q.x + d * q.y + ty }),
    toWorld: (q) => ({
      x: ((q.x - tx) * d - (q.y - ty) * c) / det,
      y: ((q.y - ty) * a - (q.x - tx) * b) / det,
    }),
  };
}

const VERTEX = `
precision highp float;
attribute vec3 aPosition;
attribute vec4 aStyle;
uniform vec2 uViewport;
uniform vec3 uCamera;
uniform vec2 uAngles;
uniform float uZoom;
uniform float uDpr;
uniform float uTime;
uniform float uLine;
uniform float uFront;
uniform float uSpiderDepth;
varying float vDepth;
varying float vAlpha;
varying float vKind;
varying float vBrightness;
void main(){
 vec3 p=aPosition-uCamera;
 float cy=cos(uAngles.x),sy=sin(uAngles.x),cp=cos(uAngles.y),sp=sin(uAngles.y);
 float rx=p.x*cy-p.z*sy,rz=p.x*sy+p.z*cy;
 float ry=p.y*cp-rz*sp,depth=p.y*sp+rz*cp;
 float focal=min(uViewport.x,uViewport.y)*2.8;
 float perspective=focal/max(focal*.24,focal-depth);
 vec2 screen=vec2(rx,ry)*perspective*uZoom;
 gl_Position=vec4(screen.x/(uViewport.x*.5),-screen.y/(uViewport.y*.5),0.,1.);
 float diameter=aStyle.x*perspective*uZoom*uDpr;
 gl_PointSize=max(1.,diameter);
 vDepth=depth;vKind=aStyle.z;vBrightness=aStyle.x;
 float twinkle=.86+.14*sin(uTime*.8+aStyle.w);
 vAlpha=aStyle.y*twinkle*min(1.,diameter*diameter);
 if(uLine>.5)vAlpha=aStyle.y;
 if(uLine<.5&&((uFront>.5&&depth<=uSpiderDepth)||(uFront<.5&&depth>uSpiderDepth))){gl_Position=vec4(3.,3.,0.,1.);gl_PointSize=1.;}
}`;
const FRAGMENT = `
precision highp float;
uniform float uFront;
uniform float uSpiderDepth;
uniform float uLine;
uniform float uImmersion;
varying float vDepth;
varying float vAlpha;
varying float vKind;
varying float vBrightness;
void main(){
 bool front=vDepth>uSpiderDepth;
 if(uFront>.5&&!front)discard;
 if(uFront<.5&&front)discard;
 float alpha=vAlpha;
 vec3 color=mix(vec3(.50,.57,.70),vec3(.87,.90,.96),clamp(vBrightness*.5,0.,1.));
 if(uLine<.5){
  float r=length(gl_PointCoord-vec2(.5))*2.;
  if(r>1.)discard;
  if(vKind>2.5){alpha*=exp(-r*r*5.5)*(.55+uImmersion*.3);color=vec3(.39,.44,.58);}
  else {alpha*=mix(exp(-r*r*5.),1.-smoothstep(.12,.74,r),.62);}
 }
 if(uFront>.5)alpha*=.75+uImmersion*.25;
 alpha=clamp(alpha,0.,.88);
 gl_FragColor=vec4(color*alpha,alpha);
}`;
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw Error(error);
  }
  return shader;
}
function createPass(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    depth: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  try {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX),
      fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program));
    const buffer = gl.createBuffer(),
      lineBuffer = gl.createBuffer();
    const uniforms = {};
    for (const name of [
      "uViewport",
      "uCamera",
      "uAngles",
      "uZoom",
      "uDpr",
      "uTime",
      "uLine",
      "uFront",
      "uSpiderDepth",
      "uImmersion",
    ])
      uniforms[name] = gl.getUniformLocation(program, name);
    const position = gl.getAttribLocation(program, "aPosition"),
      style = gl.getAttribLocation(program, "aStyle");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    return { gl, program, buffer, lineBuffer, uniforms, position, style };
  } catch (error) {
    console.warn(
      "WebGL volume unavailable; using cached depth layers.",
      error.message,
    );
    return null;
  }
}
export function createVolumeScene(
  backCanvas,
  frontCanvas,
  onInvalidate = () => {},
) {
  const back = createPass(backCanvas),
    front = createPass(frontCanvas);
  if (!back || !front) return null;
  let pointsCount = 0,
    lineCount = 0,
    width = 0,
    height = 0,
    dpr = 1;
  let lost = false;
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    onInvalidate();
  };
  backCanvas.addEventListener("webglcontextlost", onLost);
  frontCanvas.addEventListener("webglcontextlost", onLost);
  return {
    get available() {
      return !lost;
    },
    resize(web, w, h, ratio) {
      width = w;
      height = h;
      dpr = Math.min(ratio, 2);
      const extent = clusterExtent(w, h),
        data = [],
        lines = [];
      const push = (p, size, alpha, kind, phase) => {
        const q = galaxyPoint(p, w, h);
        data.push(
          q.x,
          q.y,
          p.field ? -extent * (2 + p.depth * 2) : p.depth * extent,
          size,
          alpha,
          kind,
          phase || 0,
        );
      };
      for (const p of web.points)
        push(
          p,
          p.size > 0.992 ? 3.2 : 1 + p.size * 0.6,
          p.size > 0.992 ? 0.9 : 0.36 + p.size * 0.18,
          1,
          p.phase,
        );
      for (let i = 0; i < web.dust.length; i++) {
        const p = web.dust[i],
          fog = i % 79 === 0;
        push(
          p,
          fog ? 45 + p.size * 45 : 1 + p.size * 0.9,
          fog ? 0.13 : 0.2 + p.size * 0.16,
          fog ? 3 : 0,
          p.size * 6.28,
        );
      }
      for (const p of web.field)
        push(p, 0.8 + p.size * 2, 0.2 + p.size * 0.5, 2, p.phase);
      const vertex = (p, alpha) => {
        const q = galaxyPoint(p, w, h);
        lines.push(q.x, q.y, p.depth * extent, 0.8, alpha, 1, 0);
      };
      for (const [i, j] of web.edges) {
        vertex(web.points[i], 0.067);
        vertex(web.points[j], 0.067);
      }
      for (const bridge of web.bridges) {
        let last = null;
        for (let i = 0; i <= 14; i++) {
          const t = i / 14,
            u = 1 - t;
          const p = {
            x:
              (u * u * u * bridge.ax +
                3 *
                  u *
                  u *
                  t *
                  (bridge.ax * 0.55 + bridge.bx * 0.45 + bridge.bend) +
                3 *
                  u *
                  t *
                  t *
                  (bridge.ax * 0.3 + bridge.bx * 0.7 - bridge.bend) +
                t * t * t * bridge.bx) *
              w,
            y:
              (u * u * u * bridge.ay +
                3 * u * u * t * (bridge.ay * 0.7 + bridge.by * 0.3) +
                3 * u * t * t * (bridge.ay * 0.3 + bridge.by * 0.7) +
                t * t * t * bridge.by) *
              h,
            z: -Math.sin(t * Math.PI) * extent * 0.4,
          };
          if (last) {
            lines.push(
              last.x,
              last.y,
              last.z,
              0.6,
              0.028,
              1,
              0,
              p.x,
              p.y,
              p.z,
              0.6,
              0.028,
              1,
              0,
            );
          }
          last = p;
        }
      }
      pointsCount = data.length / 7;
      lineCount = lines.length / 7;
      const positions = new Float32Array(data),
        edges = new Float32Array(lines);
      for (const pass of [back, front]) {
        const { gl } = pass;
        gl.canvas.width = Math.round(w * dpr);
        gl.canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.bindBuffer(gl.ARRAY_BUFFER, pass.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, pass.lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, edges, gl.STATIC_DRAW);
      }
    },
    draw(camera, spiderZ, time, immersion) {
      if (lost) return;
      const projected = projectVolume(
        { x: camera.spiderX, y: camera.spiderY, z: spiderZ },
        camera,
        width,
        height,
      );
      for (const [index, pass] of [back, front].entries()) {
        const { gl, uniforms: u } = pass;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(pass.program);
        gl.uniform2f(u.uViewport, width, height);
        gl.uniform3f(u.uCamera, camera.x, camera.y, camera.z || 0);
        gl.uniform2f(u.uAngles, camera.yaw, camera.pitch);
        gl.uniform1f(u.uZoom, camera.zoom);
        gl.uniform1f(u.uDpr, dpr);
        gl.uniform1f(u.uTime, time);
        gl.uniform1f(u.uFront, index);
        gl.uniform1f(u.uSpiderDepth, projected.depth);
        gl.uniform1f(u.uImmersion, immersion);
        const attributes = (buffer) => {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.enableVertexAttribArray(pass.position);
          gl.vertexAttribPointer(pass.position, 3, gl.FLOAT, false, 28, 0);
          gl.enableVertexAttribArray(pass.style);
          gl.vertexAttribPointer(pass.style, 4, gl.FLOAT, false, 28, 12);
        };
        attributes(pass.lineBuffer);
        gl.uniform1f(u.uLine, 1);
        gl.drawArrays(gl.LINES, 0, lineCount);
        attributes(pass.buffer);
        gl.uniform1f(u.uLine, 0);
        gl.drawArrays(gl.POINTS, 0, pointsCount);
      }
    },
    dispose() {
      backCanvas.removeEventListener("webglcontextlost", onLost);
      frontCanvas.removeEventListener("webglcontextlost", onLost);
      for (const pass of [back, front]) {
        const { gl } = pass;
        gl.deleteBuffer(pass.buffer);
        gl.deleteBuffer(pass.lineBuffer);
        gl.deleteProgram(pass.program);
      }
    },
  };
}
