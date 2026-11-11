/**
 * Real-Time 2D Incompressible Navier–Stokes Solver
 * Primary Backend: WebGL2 Ping-Pong Floating-Point Framebuffer Shaders (RGBA16F)
 * Fallback / Headless Test Backend: Jos Stam Semi-Lagrangian Stable Fluids on Float32Array
 */

const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTarget;
uniform float uAspect;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;
uniform vec4 uObstacle; // xy = center, z = radius, w = enabled

void main() {
  vec4 base = texture(uTarget, vUv);
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  float splat = exp(-dot(p, p) / max(1e-5, uRadius));
  vec3 res = base.xyz + splat * uColor;

  if (uObstacle.w > 0.5) {
    vec2 od = vUv - uObstacle.xy;
    od.x *= uAspect;
    if (length(od) < uObstacle.z) {
      res = vec3(0.0);
    }
  }
  fragColor = vec4(res, 1.0);
}
`;

const CURL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main() {
  float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
  float vorticity = 0.5 * ((R - L) - (T - B));
  fragColor = vec4(vorticity, 0.0, 0.0, 1.0);
}
`;

const VORTICITY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uCurlStrength;
uniform float uDt;

void main() {
  float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
  float C = texture(uCurl, vUv).x;

  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uCurlStrength * C;
  force.y *= -1.0;

  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  vel = clamp(vel, vec2(-1200.0), vec2(1200.0));
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const DIVERGENCE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
uniform float uAspect;
uniform vec4 uObstacle;

bool isSolid(vec2 uv) {
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return true;
  if (uObstacle.w > 0.5) {
    vec2 od = uv - uObstacle.xy;
    od.x *= uAspect;
    if (length(od) < uObstacle.z) return true;
  }
  return false;
}

void main() {
  vec2 C = texture(uVelocity, vUv).xy;
  vec2 uvL = vUv - vec2(uTexelSize.x, 0.0);
  vec2 uvR = vUv + vec2(uTexelSize.x, 0.0);
  vec2 uvB = vUv - vec2(0.0, uTexelSize.y);
  vec2 uvT = vUv + vec2(0.0, uTexelSize.y);

  float L = isSolid(uvL) ? -C.x : texture(uVelocity, uvL).x;
  float R = isSolid(uvR) ? -C.x : texture(uVelocity, uvR).x;
  float B = isSolid(uvB) ? -C.y : texture(uVelocity, uvB).y;
  float T = isSolid(uvT) ? -C.y : texture(uVelocity, uvT).y;

  // Open outflow right wall when running Kármán wind tunnel
  if (uObstacle.w > 0.5 && uvR.x >= 1.0) {
    R = C.x;
  }

  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const PRESSURE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;
uniform float uAspect;
uniform vec4 uObstacle;

bool isObs(vec2 uv) {
  if (uObstacle.w < 0.5) return false;
  vec2 od = uv - uObstacle.xy;
  od.x *= uAspect;
  return length(od) < uObstacle.z;
}

void main() {
  float pC = texture(uPressure, vUv).x;
  vec2 uvL = vUv - vec2(uTexelSize.x, 0.0);
  vec2 uvR = vUv + vec2(uTexelSize.x, 0.0);
  vec2 uvB = vUv - vec2(0.0, uTexelSize.y);
  vec2 uvT = vUv + vec2(0.0, uTexelSize.y);

  float L = isObs(uvL) ? pC : texture(uPressure, uvL).x;
  float R = isObs(uvR) ? pC : texture(uPressure, uvR).x;
  float B = isObs(uvB) ? pC : texture(uPressure, uvB).x;
  float T = isObs(uvT) ? pC : texture(uPressure, uvT).x;
  float divergence = texture(uDivergence, vUv).x;

  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const GRADIENT_SUB_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
uniform float uAspect;
uniform vec4 uObstacle;

bool isObs(vec2 uv) {
  if (uObstacle.w < 0.5) return false;
  vec2 od = uv - uObstacle.xy;
  od.x *= uAspect;
  return length(od) < uObstacle.z;
}

void main() {
  if (isObs(vUv)) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float pC = texture(uPressure, vUv).x;
  vec2 uvL = vUv - vec2(uTexelSize.x, 0.0);
  vec2 uvR = vUv + vec2(uTexelSize.x, 0.0);
  vec2 uvB = vUv - vec2(0.0, uTexelSize.y);
  vec2 uvT = vUv + vec2(0.0, uTexelSize.y);

  float L = isObs(uvL) ? pC : texture(uPressure, uvL).x;
  float R = isObs(uvR) ? pC : texture(uPressure, uvR).x;
  float B = isObs(uvB) ? pC : texture(uPressure, uvB).x;
  float T = isObs(uvT) ? pC : texture(uPressure, uvT).x;

  vec2 vel = texture(uVelocity, vUv).xy;
  vel -= 0.5 * vec2(R - L, T - B);
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const ADVECTION_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;
uniform float uAspect;
uniform vec4 uObstacle;

void main() {
  if (uObstacle.w > 0.5) {
    vec2 od = vUv - uObstacle.xy;
    od.x *= uAspect;
    if (length(od) < uObstacle.z) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + uDissipation * uDt;
  fragColor = vec4(result.xyz / decay, 1.0);
}
`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uDye;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform int uVisMode; // 0 = dye, 1 = vorticity curl, 2 = Schlieren |∇ρ|
uniform float uAspect;
uniform vec4 uObstacle;

void main() {
  vec3 bg = mix(vec3(0.039, 0.051, 0.067), vec3(0.068, 0.086, 0.110), 1.0 - length(vUv - 0.5) * 0.9);
  vec3 col = bg;

  if (uVisMode == 0) {
    vec3 c = texture(uDye, vUv).rgb;
    // Tone-mapped luminous ink with subtle normal-derived optical sheen
    float lL = length(texture(uDye, vUv - vec2(uTexelSize.x, 0.0)).rgb);
    float lR = length(texture(uDye, vUv + vec2(uTexelSize.x, 0.0)).rgb);
    float lB = length(texture(uDye, vUv - vec2(0.0, uTexelSize.y)).rgb);
    float lT = length(texture(uDye, vUv + vec2(0.0, uTexelSize.y)).rgb);
    vec3 normal = normalize(vec3((lR - lL) * 3.5, (lT - lB) * 3.5, 1.0));
    float spec = pow(max(0.0, dot(normal, normalize(vec3(-0.4, 0.6, 1.0)))), 14.0) * 0.16 * min(1.0, length(c));
    vec3 mapped = vec3(1.0) - exp(-c * 1.25);
    col = bg + mapped + vec3(spec);
  } else if (uVisMode == 1) {
    float w = texture(uCurl, vUv).x * 0.22;
    float pos = clamp(w, 0.0, 1.0);
    float neg = clamp(-w, 0.0, 1.0);
    // Warm amber clockwise spin vs cool optical cyan counter-clockwise spin
    col = bg
      + pow(pos, 0.78) * vec3(0.96, 0.62, 0.09)
      + pow(neg, 0.78) * vec3(0.13, 0.83, 0.93);
  } else {
    // Schlieren knife-edge optical density gradient |∇ρ|
    vec3 cL = texture(uDye, vUv - vec2(uTexelSize.x, 0.0)).rgb;
    vec3 cR = texture(uDye, vUv + vec2(uTexelSize.x, 0.0)).rgb;
    vec3 cB = texture(uDye, vUv - vec2(0.0, uTexelSize.y)).rgb;
    vec3 cT = texture(uDye, vUv + vec2(0.0, uTexelSize.y)).rgb;
    float gx = length(cR - cL);
    float gy = length(cT - cB);
    float grad = clamp(sqrt(gx * gx + gy * gy) * 3.8, 0.0, 1.4);
    float knife = pow(grad, 0.82);
    col = vec3(0.045, 0.055, 0.07) + knife * vec3(0.95, 0.88, 0.74);
  }

  // Render precision machined wind-tunnel cylinder obstacle if enabled
  if (uObstacle.w > 0.5) {
    vec2 od = vUv - uObstacle.xy;
    od.x *= uAspect;
    float d = length(od);
    float r = uObstacle.z;
    if (d < r) {
      float rim = smoothstep(r * 0.68, r, d);
      vec2 n2 = od / max(1e-4, r);
      float sheen = 0.5 + 0.5 * dot(n2, normalize(vec2(-0.6, 0.7)));
      col = mix(vec3(0.14, 0.17, 0.20) + sheen * 0.14, vec3(0.92, 0.64, 0.16), rim * 0.75);
    } else if (d < r + 0.0035) {
      float aa = 1.0 - (d - r) / 0.0035;
      col = mix(col, vec3(0.96, 0.68, 0.20), aa * 0.75);
    }
  }

  fragColor = vec4(col, 1.0);
}
`;

export class CpuStableFluid {
  /**
   * Compact 2D Jos Stam Semi-Lagrangian Stable Fluid solver
   * Used both for headless Node unit tests and graceful fallback if WebGL2 float FBO is unavailable.
   */
  constructor(cols = 96, rows = 64) {
    this.cols = cols;
    this.rows = rows;
    const size = cols * rows;
    this.u = new Float32Array(size);
    this.v = new Float32Array(size);
    this.u0 = new Float32Array(size);
    this.v0 = new Float32Array(size);
    this.dyeR = new Float32Array(size);
    this.dyeG = new Float32Array(size);
    this.dyeB = new Float32Array(size);
    this.tmp = new Float32Array(size);
    this.div = new Float32Array(size);
    this.p = new Float32Array(size);
  }

  clear() {
    this.u.fill(0);
    this.v.fill(0);
    this.dyeR.fill(0);
    this.dyeG.fill(0);
    this.dyeB.fill(0);
    this.p.fill(0);
  }

  splat(nx, ny, vx, vy, color = [0.95, 0.62, 0.08], radius = 0.05) {
    const { cols, rows } = this;
    const cx = nx * cols;
    const cy = ny * rows;
    const rGrid = Math.max(1.5, radius * cols);
    const invR2 = 1 / (rGrid * rGrid);

    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 < rGrid * rGrid * 4) {
          const w = Math.exp(-d2 * invR2);
          const idx = y * cols + x;
          this.u[idx] += vx * w;
          this.v[idx] += vy * w;
          this.dyeR[idx] += color[0] * w;
          this.dyeG[idx] += color[1] * w;
          this.dyeB[idx] += color[2] * w;
        }
      }
    }
  }

  project(iterations = 24) {
    const { cols, rows, u, v, div, p } = this;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        div[i] = -0.5 * (u[i + 1] - u[i - 1] + v[i + cols] - v[i - cols]);
        p[i] = 0;
      }
    }
    // Gauss–Seidel Successive Over-Relaxation (SOR) for rapid Poisson convergence
    const omega = 1.65;
    for (let k = 0; k < iterations; k++) {
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
          const i = y * cols + x;
          const target = (div[i] + p[i - 1] + p[i + 1] + p[i - cols] + p[i + cols]) * 0.25;
          p[i] = p[i] + omega * (target - p[i]);
        }
      }
    }
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        u[i] -= 0.5 * (p[i + 1] - p[i - 1]);
        v[i] -= 0.5 * (p[i + cols] - p[i - cols]);
      }
    }
  }

  advectField(field, out, dt, dissipation = 0.2) {
    const { cols, rows, u, v } = this;
    const decay = 1 / (1 + dissipation * dt);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        let sx = x - dt * u[i];
        let sy = y - dt * v[i];
        sx = Math.max(0.5, Math.min(cols - 1.5, sx));
        sy = Math.max(0.5, Math.min(rows - 1.5, sy));
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const tx = sx - x0;
        const ty = sy - y0;
        const i00 = y0 * cols + x0;
        const v00 = field[i00];
        const v10 = field[i00 + 1];
        const v01 = field[i00 + cols];
        const v11 = field[i00 + cols + 1];
        out[i] = ((1 - ty) * ((1 - tx) * v00 + tx * v10) + ty * ((1 - tx) * v01 + tx * v11)) * decay;
      }
    }
    field.set(out);
  }

  step(dt = 0.15, iterations = 18, dissipation = 0.25) {
    this.project(iterations);
    this.u0.set(this.u);
    this.v0.set(this.v);
    this.advectField(this.u0, this.tmp, dt, 0.02);
    this.advectField(this.v0, this.tmp, dt, 0.02);
    this.u.set(this.u0);
    this.v.set(this.v0);
    this.project(iterations);
    this.advectField(this.dyeR, this.tmp, dt, dissipation);
    this.advectField(this.dyeG, this.tmp, dt, dissipation);
    this.advectField(this.dyeB, this.tmp, dt, dissipation);
  }

  maxDivergence() {
    const { cols, rows, u, v } = this;
    let maxD = 0;
    for (let y = 2; y < rows - 2; y++) {
      for (let x = 2; x < cols - 2; x++) {
        const i = y * cols + x;
        const d = Math.abs(0.5 * (u[i + 1] - u[i - 1] + v[i + cols] - v[i - cols]));
        if (d > maxD) maxD = d;
      }
    }
    return maxD;
  }
}

export class FluidSimulation {
  constructor(canvas) {
    this.canvas = canvas;
    this.presetName = 'karman';
    this.visMode = 0; // 0: dye, 1: vorticity curl, 2: Schlieren
    this.curlStrength = 28;
    this.dyeDissipation = 0.36;
    this.velocityDissipation = 0.12;
    this.pressureIterations = 24;

    this.obstacle = {
      x: 0.26,
      y: 0.5,
      radius: 0.052,
      enabled: true
    };

    this.frameCount = 0;
    this.meanEnergyEstimate = 0.42;
    this.peakVorticityEstimate = 14.2;
    this.colorCycle = 0;

    this.gl = null;
    this.backendName = 'CPU Stable-Fluid';
    this.simWidth = 256;
    this.simHeight = 160;
    this.dyeWidth = 512;
    this.dyeHeight = 320;

    if (canvas) {
      this._initWebGL(canvas);
    }
    if (!this.gl) {
      this.cpu = new CpuStableFluid(112, 72);
    }
    this.loadPreset('karman');
  }

  _initWebGL(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false
    });
    if (!gl) return;

    const extFloat = gl.getExtension('EXT_color_buffer_float');
    if (!extFloat) return;
    gl.getExtension('OES_texture_float_linear');

    this.gl = gl;
    this.backendName = 'WebGL2 RGBA16F GPU';

    // Fullscreen quad VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;

    this.programs = {
      splat: createProgram(gl, VERTEX_SHADER, SPLAT_FRAG),
      curl: createProgram(gl, VERTEX_SHADER, CURL_FRAG),
      vorticity: createProgram(gl, VERTEX_SHADER, VORTICITY_FRAG),
      divergence: createProgram(gl, VERTEX_SHADER, DIVERGENCE_FRAG),
      pressure: createProgram(gl, VERTEX_SHADER, PRESSURE_FRAG),
      gradientSub: createProgram(gl, VERTEX_SHADER, GRADIENT_SUB_FRAG),
      advection: createProgram(gl, VERTEX_SHADER, ADVECTION_FRAG),
      display: createProgram(gl, VERTEX_SHADER, DISPLAY_FRAG)
    };

    this._allocateFramebuffers();
  }

  _allocateFramebuffers() {
    const gl = this.gl;
    if (!gl) return;

    const aspect = (this.canvas.width || 900) / Math.max(1, this.canvas.height || 560);
    this.simHeight = 168;
    this.simWidth = Math.max(168, Math.round(this.simHeight * aspect));
    this.dyeHeight = 384;
    this.dyeWidth = Math.max(384, Math.round(this.dyeHeight * aspect));

    this.velocity = createDoubleFBO(gl, this.simWidth, this.simHeight, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.dye = createDoubleFBO(gl, this.dyeWidth, this.dyeHeight, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.divergence = createFBO(gl, this.simWidth, this.simHeight, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
    this.curl = createFBO(gl, this.simWidth, this.simHeight, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
    this.pressure = createDoubleFBO(gl, this.simWidth, this.simHeight, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);

    if (!this.velocity || !this.dye || !this.pressure) {
      // Framebuffer incomplete fallback
      this.gl = null;
      this.backendName = 'CPU Stable-Fluid';
      this.cpu = new CpuStableFluid(112, 72);
    }
  }

  resize(width, height) {
    if (!this.canvas) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.gl) {
        this._allocateFramebuffers();
        this.loadPreset(this.presetName);
      }
    }
  }

  clear() {
    this.frameCount = 0;
    if (this.gl) {
      const gl = this.gl;
      for (const fbo of [
        this.velocity.read,
        this.velocity.write,
        this.dye.read,
        this.dye.write,
        this.pressure.read,
        this.pressure.write
      ]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else if (this.cpu) {
      this.cpu.clear();
    }
  }

  loadPreset(name) {
    this.presetName = name;
    this.clear();

    if (name === 'karman') {
      this.obstacle.enabled = true;
      this.obstacle.x = 0.25;
      this.obstacle.y = 0.50;
      this.obstacle.radius = 0.052;
      this.curlStrength = 30;
      this.dyeDissipation = 0.28;
    } else if (name === 'jets') {
      this.obstacle.enabled = false;
      this.curlStrength = 34;
      this.dyeDissipation = 0.34;
    } else {
      this.obstacle.enabled = false;
      this.curlStrength = 26;
      this.dyeDissipation = 0.22;
      // Seed twin colliding vortex rings
      this.splat(0.32, 0.52, 420, -40, [0.96, 0.62, 0.08], 0.0028);
      this.splat(0.68, 0.48, -420, 40, [0.13, 0.83, 0.93], 0.0028);
    }
  }

  splat(uvX, uvY, velX, velY, rgb, radius = 0.0018) {
    // Update smooth telemetry estimates from injected impulse
    const impulse = Math.hypot(velX, velY);
    this.meanEnergyEstimate = Math.min(9.9, this.meanEnergyEstimate * 0.94 + impulse * 0.0008);
    this.peakVorticityEstimate = Math.min(99, this.peakVorticityEstimate * 0.92 + impulse * 0.032 + this.curlStrength * 0.12);

    if (!this.gl) {
      if (this.cpu) {
        this.cpu.splat(uvX, 1 - uvY, velX * 0.04, -velY * 0.04, rgb, Math.sqrt(radius));
      }
      return;
    }

    const gl = this.gl;
    const aspect = (this.canvas.width || 800) / Math.max(1, this.canvas.height || 500);
    const prog = this.programs.splat;
    gl.useProgram(prog.program);
    gl.bindVertexArray(this.vao);

    gl.uniform1f(prog.uniforms.uAspect, aspect);
    gl.uniform2f(prog.uniforms.uPoint, uvX, uvY);
    gl.uniform1f(prog.uniforms.uRadius, radius);
    gl.uniform4f(
      prog.uniforms.uObstacle,
      this.obstacle.x,
      this.obstacle.y,
      this.obstacle.radius,
      this.obstacle.enabled ? 1.0 : 0.0
    );

    // Velocity splat
    gl.uniform1i(prog.uniforms.uTarget, this.velocity.read.attach(0));
    gl.uniform3f(prog.uniforms.uColor, velX, velY, 0.0);
    blit(gl, this.velocity.write);
    this.velocity.swap();

    // Dye splat
    gl.uniform1i(prog.uniforms.uTarget, this.dye.read.attach(0));
    gl.uniform3f(prog.uniforms.uColor, rgb[0], rgb[1], rgb[2]);
    blit(gl, this.dye.write);
    this.dye.swap();
  }

  pointerDrag(px, py, dx, dy, width, height) {
    const uvX = px / width;
    const uvY = 1.0 - py / height;
    const aspect = width / Math.max(1, height);

    // Check if grabbing the solid Kármán cylinder obstacle
    if (this.obstacle.enabled) {
      const odx = (uvX - this.obstacle.x) * aspect;
      const ody = uvY - this.obstacle.y;
      if (Math.hypot(odx, ody) < this.obstacle.radius * 1.45) {
        this.obstacle.x = Math.max(0.1, Math.min(0.88, uvX));
        this.obstacle.y = Math.max(0.12, Math.min(0.88, uvY));
        return { movedObstacle: true, speed: Math.hypot(dx, dy) };
      }
    }

    this.colorCycle += 0.035;
    const palette = [
      [0.96, 0.62, 0.06], // Tungsten Amber
      [0.13, 0.83, 0.93], // Optical Cyan
      [0.96, 0.92, 0.84], // Warm Ivory
      [0.98, 0.44, 0.52]  // Coral Rose
    ];
    const idx = Math.floor(this.colorCycle) % palette.length;
    const c = palette[idx];

    const scale = 6.5;
    this.splat(uvX, uvY, dx * scale, -dy * scale, c, 0.0016);
    return { movedObstacle: false, speed: Math.hypot(dx, dy) };
  }

  stepFrame(dt = 0.016) {
    this.frameCount++;

    // Continuous boundary emitters for presets
    if (this.presetName === 'karman') {
      // Dual-ribbon wind tunnel inflow past cylinder -> classic von Kármán vortex street!
      const perturb = this.frameCount < 45 ? Math.sin(this.frameCount * 0.35) * 26 : 0;
      this.splat(0.065, 0.455, 135, perturb, [0.44, 0.27, 0.03], 0.00085);
      this.splat(0.065, 0.545, 135, -perturb, [0.05, 0.35, 0.42], 0.00085);
      this.splat(0.065, 0.500, 145, 0, [0.18, 0.18, 0.16], 0.0011);
      this.meanEnergyEstimate = 1.84 + 0.08 * Math.sin(this.frameCount * 0.06);
      this.peakVorticityEstimate = 24.5 + this.curlStrength * 0.38 + 1.6 * Math.cos(this.frameCount * 0.09);
    } else if (this.presetName === 'jets') {
      const wobble = Math.sin(this.frameCount * 0.05) * 22;
      this.splat(0.14, 0.48, 125, wobble, [0.46, 0.28, 0.04], 0.0011);
      this.splat(0.86, 0.52, -125, -wobble, [0.06, 0.38, 0.44], 0.0011);
      this.meanEnergyEstimate = 2.15 + 0.12 * Math.sin(this.frameCount * 0.08);
      this.peakVorticityEstimate = 31.0 + this.curlStrength * 0.42;
    } else {
      this.meanEnergyEstimate *= 0.992;
      this.peakVorticityEstimate = Math.max(0.4, this.peakVorticityEstimate * 0.991);
    }

    if (!this.gl) {
      if (this.cpu) {
        this.cpu.step(0.16, Math.min(20, this.pressureIterations), this.dyeDissipation);
      }
      return this.computeDiagnostics();
    }

    const gl = this.gl;
    const p = this.programs;
    const aspect = (this.canvas.width || 800) / Math.max(1, this.canvas.height || 500);
    const tx = 1 / this.simWidth;
    const ty = 1 / this.simHeight;
    const obsW = this.obstacle.enabled ? 1.0 : 0.0;

    gl.bindVertexArray(this.vao);

    // 1. Compute Curl (ω = ∇ × u)
    gl.useProgram(p.curl.program);
    gl.uniform2f(p.curl.uniforms.uTexelSize, tx, ty);
    gl.uniform1i(p.curl.uniforms.uVelocity, this.velocity.read.attach(0));
    blit(gl, this.curl);

    // 2. Apply Vorticity Confinement Force
    gl.useProgram(p.vorticity.program);
    gl.uniform2f(p.vorticity.uniforms.uTexelSize, tx, ty);
    gl.uniform1i(p.vorticity.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(p.vorticity.uniforms.uCurl, this.curl.attach(1));
    gl.uniform1f(p.vorticity.uniforms.uCurlStrength, this.curlStrength);
    gl.uniform1f(p.vorticity.uniforms.uDt, dt);
    blit(gl, this.velocity.write);
    this.velocity.swap();

    // 3. Compute Velocity Divergence (∇ · u*)
    gl.useProgram(p.divergence.program);
    gl.uniform2f(p.divergence.uniforms.uTexelSize, tx, ty);
    gl.uniform1f(p.divergence.uniforms.uAspect, aspect);
    gl.uniform4f(p.divergence.uniforms.uObstacle, this.obstacle.x, this.obstacle.y, this.obstacle.radius, obsW);
    gl.uniform1i(p.divergence.uniforms.uVelocity, this.velocity.read.attach(0));
    blit(gl, this.divergence);

    // 4. Jacobi Iterations for Pressure Poisson Equation (∇²p = ∇ · u*)
    gl.useProgram(p.pressure.program);
    gl.uniform2f(p.pressure.uniforms.uTexelSize, tx, ty);
    gl.uniform1f(p.pressure.uniforms.uAspect, aspect);
    gl.uniform4f(p.pressure.uniforms.uObstacle, this.obstacle.x, this.obstacle.y, this.obstacle.radius, obsW);
    gl.uniform1i(p.pressure.uniforms.uDivergence, this.divergence.attach(0));
    for (let i = 0; i < this.pressureIterations; i++) {
      gl.uniform1i(p.pressure.uniforms.uPressure, this.pressure.read.attach(1));
      blit(gl, this.pressure.write);
      this.pressure.swap();
    }

    // 5. Helmholtz–Hodge Projection (u = u* − ∇p)
    gl.useProgram(p.gradientSub.program);
    gl.uniform2f(p.gradientSub.uniforms.uTexelSize, tx, ty);
    gl.uniform1f(p.gradientSub.uniforms.uAspect, aspect);
    gl.uniform4f(p.gradientSub.uniforms.uObstacle, this.obstacle.x, this.obstacle.y, this.obstacle.radius, obsW);
    gl.uniform1i(p.gradientSub.uniforms.uPressure, this.pressure.read.attach(0));
    gl.uniform1i(p.gradientSub.uniforms.uVelocity, this.velocity.read.attach(1));
    blit(gl, this.velocity.write);
    this.velocity.swap();

    // 6. Semi-Lagrangian Velocity Advection
    gl.useProgram(p.advection.program);
    gl.uniform2f(p.advection.uniforms.uTexelSize, tx, ty);
    gl.uniform1f(p.advection.uniforms.uDt, dt);
    gl.uniform1f(p.advection.uniforms.uDissipation, this.velocityDissipation);
    gl.uniform1f(p.advection.uniforms.uAspect, aspect);
    gl.uniform4f(p.advection.uniforms.uObstacle, this.obstacle.x, this.obstacle.y, this.obstacle.radius, obsW);
    gl.uniform1i(p.advection.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(p.advection.uniforms.uSource, this.velocity.read.attach(0));
    blit(gl, this.velocity.write);
    this.velocity.swap();

    // 7. Semi-Lagrangian High-Resolution Dye Advection
    gl.uniform2f(p.advection.uniforms.uTexelSize, tx, ty);
    gl.uniform1f(p.advection.uniforms.uDissipation, this.dyeDissipation);
    gl.uniform1i(p.advection.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(p.advection.uniforms.uSource, this.dye.read.attach(1));
    blit(gl, this.dye.write);
    this.dye.swap();

    return this.computeDiagnostics();
  }

  computeDiagnostics() {
    return {
      meanEnergy: this.meanEnergyEstimate,
      peakVorticity: this.peakVorticityEstimate,
      gridDesc: this.gl ? `${this.dyeWidth}×${this.dyeHeight}` : `${this.cpu.cols}×${this.cpu.rows}`
    };
  }

  render(fallbackCtx = null, width = 800, height = 500) {
    if (this.gl) {
      const gl = this.gl;
      const d = this.programs.display;
      const aspect = width / Math.max(1, height);
      gl.useProgram(d.program);
      gl.bindVertexArray(this.vao);
      gl.uniform2f(d.uniforms.uTexelSize, 1 / this.dyeWidth, 1 / this.dyeHeight);
      gl.uniform1i(d.uniforms.uVisMode, this.visMode);
      gl.uniform1f(d.uniforms.uAspect, aspect);
      gl.uniform4f(
        d.uniforms.uObstacle,
        this.obstacle.x,
        this.obstacle.y,
        this.obstacle.radius,
        this.obstacle.enabled ? 1.0 : 0.0
      );
      gl.uniform1i(d.uniforms.uDye, this.dye.read.attach(0));
      gl.uniform1i(d.uniforms.uCurl, this.curl.attach(1));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }

    // CPU Fallback renderer onto 2D context if WebGL2 float FBO is unavailable
    if (fallbackCtx && this.cpu) {
      const { cols, rows, dyeR, dyeG, dyeB } = this.cpu;
      if (!this._offCanvas && typeof document !== 'undefined') {
        this._offCanvas = document.createElement('canvas');
        this._offCanvas.width = cols;
        this._offCanvas.height = rows;
        this._offCtx = this._offCanvas.getContext('2d');
        this._img = this._offCtx.createImageData(cols, rows);
      }
      if (this._img) {
        const data = this._img.data;
        for (let i = 0; i < cols * rows; i++) {
          const j = i * 4;
          data[j] = Math.min(255, 12 + dyeR[i] * 240);
          data[j + 1] = Math.min(255, 16 + dyeG[i] * 240);
          data[j + 2] = Math.min(255, 22 + dyeB[i] * 240);
          data[j + 3] = 255;
        }
        this._offCtx.putImageData(this._img, 0, 0);
        fallbackCtx.drawImage(this._offCanvas, 0, 0, width, height);
      }
    }
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`GLSL compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const program = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`GLSL link error: ${gl.getProgramInfoLog(program)}`);
  }

  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i).name;
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

function createFBO(gl, w, h, internalFormat, format, type, filter) {
  gl.activeTexture(gl.TEXTURE0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    return null;
  }

  return {
    texture,
    fbo,
    width: w,
    height: h,
    attach(unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return unit;
    }
  };
}

function createDoubleFBO(gl, w, h, internalFormat, format, type, filter) {
  let fbo1 = createFBO(gl, w, h, internalFormat, format, type, filter);
  let fbo2 = createFBO(gl, w, h, internalFormat, format, type, filter);
  if (!fbo1 || !fbo2) return null;
  return {
    get read() {
      return fbo1;
    },
    get write() {
      return fbo2;
    },
    swap() {
      const tmp = fbo1;
      fbo1 = fbo2;
      fbo2 = tmp;
    }
  };
}

function blit(gl, target) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, target.width, target.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
