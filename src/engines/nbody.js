/**
 * 4th-Order Yoshida Symplectic N-Body Gravitational Engine
 * Conserves Hamiltonian phase-space volume and energy H = T + V to O(Δt⁴).
 */

const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2);
const W0 = -CBRT2 / (2 - CBRT2);
const C1 = W1 * 0.5;
const C2 = (W0 + W1) * 0.5;
const C3 = C2;
const C4 = C1;
const D1 = W1;
const D2 = W0;
const D3 = W1;

// Curated optical-instrument palette (warm amber, cyan-teal, ivory, coral, gold — zero purple)
const PALETTE = [
  '#f59e0b', // Tungsten Amber
  '#22d3ee', // Optical Cyan
  '#f4f1ea', // Warm Ivory
  '#fb7185', // Coral Rose
  '#34d399', // Emerald Phosphor
  '#fbbf24'  // Solar Gold
];

export class NBodySimulation {
  constructor() {
    this.G = 1.0;
    this.softening = 0.0;
    this.dt = 0.002;
    this.substeps = 8;
    this.trailLength = 220;
    this.bodies = [];
    this.initialEnergy = 0;
    this.currentEnergy = 0;
    this.angularMomentum = 0;
    this.presetName = 'figure8';
    this.viewScale = 220; // pixels per unit
    this.recentEvents = [];
    this._prevDistSq = new Map();
    this._approaching = new Map();
    this.loadPreset('figure8');
  }

  clear() {
    this.bodies = [];
    this._prevDistSq.clear();
    this._approaching.clear();
    this.recentEvents = [];
  }

  addBody({ x, y, vx, vy, mass, radius = 6, color = '#f59e0b', fixed = false, isTracer = false }) {
    this.bodies.push({
      x,
      y,
      vx,
      vy,
      ax: 0,
      ay: 0,
      mass,
      radius,
      color,
      fixed,
      isTracer,
      trail: [{ x, y }]
    });
  }

  loadPreset(name) {
    this.clear();
    this.presetName = name;

    if (name === 'figure8') {
      // Exact Chenciner–Montgomery (2000) / Simó Figure-8 3-body periodic solution
      this.G = 1.0;
      this.softening = 0.0;
      this.dt = 0.0018;
      this.substeps = 10;
      this.viewScale = 235;

      const x1 = -0.97000436;
      const y1 = 0.24308753;
      const vx3 = -0.93240737;
      const vy3 = -0.86473146;

      this.addBody({
        x: x1,
        y: y1,
        vx: -0.5 * vx3,
        vy: -0.5 * vy3,
        mass: 1.0,
        radius: 7.5,
        color: PALETTE[0]
      });
      this.addBody({
        x: -x1,
        y: -y1,
        vx: -0.5 * vx3,
        vy: -0.5 * vy3,
        mass: 1.0,
        radius: 7.5,
        color: PALETTE[1]
      });
      this.addBody({
        x: 0,
        y: 0,
        vx: vx3,
        vy: vy3,
        mass: 1.0,
        radius: 7.5,
        color: PALETTE[2]
      });
    } else if (name === 'trojans') {
      // Restricted 3-Body Problem: Sun + Gas Giant (mass ratio μ = 0.018 < Routh critical 0.03852)
      // with Trojan swarm oscillating stably around equilateral Lagrange points L4 (+60°) and L5 (-60°)
      this.G = 1.0;
      this.softening = 0.012;
      this.dt = 0.0022;
      this.substeps = 8;
      this.viewScale = 175;

      const m1 = 0.982;
      const m2 = 0.018;
      const R = 1.25;
      const omega = Math.sqrt((this.G * (m1 + m2)) / (R * R * R));

      // Barycentric coordinates
      const x1 = -m2 * R;
      const x2 = m1 * R;
      this.addBody({
        x: x1,
        y: 0,
        vx: 0,
        vy: x1 * omega,
        mass: m1,
        radius: 11,
        color: '#f59e0b'
      });
      this.addBody({
        x: x2,
        y: 0,
        vx: 0,
        vy: x2 * omega,
        mass: m2,
        radius: 6.5,
        color: '#22d3ee'
      });

      // Populate L4 (+60 deg) and L5 (-60 deg) Trojan asteroids
      for (const sign of [1, -1]) {
        const baseAngle = sign * (Math.PI / 3);
        for (let k = 0; k < 14; k++) {
          const dTheta = ((k - 6.5) / 14) * 0.16;
          const dr = ((k % 3) - 1) * 0.018;
          const r = R + dr;
          const theta = baseAngle + dTheta;
          // Relative to barycenter
          const px = x1 + r * Math.cos(theta);
          const py = r * Math.sin(theta);
          const speed = omega * Math.hypot(px, py);
          const phi = Math.atan2(py, px);
          this.addBody({
            x: px,
            y: py,
            vx: -speed * Math.sin(phi),
            vy: speed * Math.cos(phi),
            mass: 1e-6,
            radius: 2.6,
            color: sign > 0 ? '#34d399' : '#fbbf24',
            isTracer: true
          });
        }
      }
    } else if (name === 'binary') {
      // Circumbinary planetary system (two stars in tight eccentric mutual orbit + outer planets)
      this.G = 1.0;
      this.softening = 0.01;
      this.dt = 0.0018;
      this.substeps = 9;
      this.viewScale = 155;

      const mA = 0.65;
      const mB = 0.55;
      const sep = 0.46;
      const mu = mA + mB;
      const vRel = Math.sqrt((this.G * mu) / sep) * 0.88;

      this.addBody({
        x: (-mB / mu) * sep,
        y: 0,
        vx: 0,
        vy: (-mB / mu) * vRel,
        mass: mA,
        radius: 9.5,
        color: '#f59e0b'
      });
      this.addBody({
        x: (mA / mu) * sep,
        y: 0,
        vx: 0,
        vy: (mA / mu) * vRel,
        mass: mB,
        radius: 8.5,
        color: '#fb7185'
      });

      const radii = [1.15, 1.58, 2.05];
      const colors = ['#22d3ee', '#34d399', '#f4f1ea'];
      radii.forEach((r, idx) => {
        const v = Math.sqrt((this.G * mu) / r);
        const angle = idx * 2.1;
        this.addBody({
          x: r * Math.cos(angle),
          y: r * Math.sin(angle),
          vx: -v * Math.sin(angle),
          vy: v * Math.cos(angle),
          mass: 0.0008,
          radius: 4.5,
          color: colors[idx]
        });
      });
    } else if (name === 'galaxy') {
      // Twin Spiral Mini-Galaxy Tidal Merger
      this.G = 1.0;
      this.softening = 0.055;
      this.dt = 0.003;
      this.substeps = 5;
      this.viewScale = 135;

      const galaxies = [
        { cx: -1.15, cy: -0.42, vx: 0.24, vy: 0.16, coreMass: 0.9, spin: 1, coreColor: '#f59e0b', starColor: '#fcd34d' },
        { cx: 1.15, cy: 0.42, vx: -0.24, vy: -0.16, coreMass: 0.75, spin: 1, coreColor: '#22d3ee', starColor: '#67e8f9' }
      ];

      for (const gal of galaxies) {
        this.addBody({
          x: gal.cx,
          y: gal.cy,
          vx: gal.vx,
          vy: gal.vy,
          mass: gal.coreMass,
          radius: 8.5,
          color: gal.coreColor
        });

        const count = 68;
        for (let i = 0; i < count; i++) {
          // Deterministic golden-angle spiral distribution
          const u = (i + 1) / (count + 1);
          const r = 0.16 + 0.72 * Math.sqrt(u);
          const theta = i * 2.399963229728653;
          const px = gal.cx + r * Math.cos(theta);
          const py = gal.cy + r * Math.sin(theta);
          const vOrb = Math.sqrt((this.G * gal.coreMass) / Math.sqrt(r * r + this.softening * this.softening)) * gal.spin;
          this.addBody({
            x: px,
            y: py,
            vx: gal.vx - vOrb * Math.sin(theta),
            vy: gal.vy + vOrb * Math.cos(theta),
            mass: 0.0006,
            radius: 2.1,
            color: gal.starColor,
            isTracer: true
          });
        }
      }
    }

    this.initialEnergy = this.computeDiagnostics().energy;
    this.currentEnergy = this.initialEnergy;
  }

  _computeAccelerations(bodies) {
    const n = bodies.length;
    const G = this.G;
    const epsSq = this.softening * this.softening;

    for (let i = 0; i < n; i++) {
      bodies[i].ax = 0;
      bodies[i].ay = 0;
    }

    for (let i = 0; i < n; i++) {
      const bi = bodies[i];
      const mi = bi.mass;
      const iTracer = bi.isTracer;

      for (let j = i + 1; j < n; j++) {
        const bj = bodies[j];
        if (iTracer && bj.isTracer) continue; // massless tracers don't perturb each other

        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const distSq = dx * dx + dy * dy + epsSq;
        const invDist = 1 / Math.sqrt(distSq);
        const invDist3 = G * invDist * invDist * invDist;

        if (!bi.fixed && !bj.isTracer) {
          const s = bj.mass * invDist3;
          bi.ax += dx * s;
          bi.ay += dy * s;
        }
        if (!bj.fixed && !iTracer) {
          const s = mi * invDist3;
          bj.ax -= dx * s;
          bj.ay -= dy * s;
        }
      }
    }
  }

  /**
   * Advance one 4th-order Yoshida symplectic step of duration h.
   */
  yoshidaStep(h) {
    const bodies = this.bodies;
    const n = bodies.length;

    const drift = (coeff) => {
      const ch = coeff * h;
      for (let i = 0; i < n; i++) {
        const b = bodies[i];
        if (!b.fixed) {
          b.x += ch * b.vx;
          b.y += ch * b.vy;
        }
      }
    };

    const kick = (coeff) => {
      this._computeAccelerations(bodies);
      const dh = coeff * h;
      for (let i = 0; i < n; i++) {
        const b = bodies[i];
        if (!b.fixed) {
          b.vx += dh * b.ax;
          b.vy += dh * b.ay;
        }
      }
    };

    drift(C1);
    kick(D1);
    drift(C2);
    kick(D2);
    drift(C3);
    kick(D3);
    drift(C4);
  }

  stepFrame() {
    this.recentEvents.length = 0;
    const h = this.dt;
    for (let s = 0; s < this.substeps; s++) {
      this.yoshidaStep(h);
    }

    // Record trails & detect periapsis passages between massive bodies
    const maxTrail = this.presetName === 'galaxy' ? Math.min(48, this.trailLength) : this.trailLength;
    const n = this.bodies.length;

    for (let i = 0; i < n; i++) {
      const b = this.bodies[i];
      const last = b.trail[b.trail.length - 1];
      if (!last || (b.x - last.x) ** 2 + (b.y - last.y) ** 2 > 0.00018) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > maxTrail) {
          b.trail.shift();
        }
      }
    }

    // Periapsis acoustic trigger for massive bodies
    for (let i = 0; i < Math.min(n, 8); i++) {
      if (this.bodies[i].isTracer) continue;
      for (let j = i + 1; j < Math.min(n, 8); j++) {
        if (this.bodies[j].isTracer) continue;
        const key = `${i}:${j}`;
        const dx = this.bodies[j].x - this.bodies[i].x;
        const dy = this.bodies[j].y - this.bodies[i].y;
        const dSq = dx * dx + dy * dy;
        const prev = this._prevDistSq.get(key);
        const wasApproaching = this._approaching.get(key) || false;

        if (prev !== undefined) {
          const isApproaching = dSq < prev;
          if (wasApproaching && !isApproaching && dSq < 1.8) {
            const relVx = this.bodies[j].vx - this.bodies[i].vx;
            const relVy = this.bodies[j].vy - this.bodies[i].vy;
            this.recentEvents.push({
              speed: Math.hypot(relVx, relVy),
              distance: Math.sqrt(dSq),
              pairIndex: i + j
            });
          }
          this._approaching.set(key, isApproaching);
        }
        this._prevDistSq.set(key, dSq);
      }
    }

    const diag = this.computeDiagnostics();
    this.currentEnergy = diag.energy;
    this.angularMomentum = diag.angularMomentum;
    return diag;
  }

  computeDiagnostics() {
    let kinetic = 0;
    let potential = 0;
    let angularMomentum = 0;
    let px = 0;
    let py = 0;
    const epsSq = this.softening * this.softening;
    const massive = this.bodies.filter((b) => !b.isTracer);
    const mCount = massive.length;

    for (let i = 0; i < mCount; i++) {
      const bi = massive[i];
      kinetic += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy);
      angularMomentum += bi.mass * (bi.x * bi.vy - bi.y * bi.vx);
      px += bi.mass * bi.vx;
      py += bi.mass * bi.vy;

      for (let j = i + 1; j < mCount; j++) {
        const bj = massive[j];
        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const dist = Math.sqrt(dx * dx + dy * dy + epsSq);
        potential -= (this.G * bi.mass * bj.mass) / dist;
      }
    }

    const energy = kinetic + potential;
    const relDrift =
      Math.abs(this.initialEnergy) > 1e-12
        ? Math.abs((energy - this.initialEnergy) / this.initialEnergy)
        : Math.abs(energy - this.initialEnergy);

    return {
      energy,
      kinetic,
      potential,
      angularMomentum,
      momentumMag: Math.hypot(px, py),
      relDrift
    };
  }

  /**
   * Predict trajectory of a candidate body before launch using coupled integration
   * against the massive attractors.
   */
  predictTrajectory(x, y, vx, vy, mass = 0.05, steps = 130) {
    const clones = this.bodies
      .filter((b) => !b.isTracer)
      .map((b) => ({
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        ax: 0,
        ay: 0,
        mass: b.mass,
        fixed: b.fixed,
        isTracer: false
      }));

    const probeIndex = clones.length;
    clones.push({
      x,
      y,
      vx,
      vy,
      ax: 0,
      ay: 0,
      mass,
      fixed: false,
      isTracer: false
    });

    const points = [{ x, y }];
    const h = this.dt * 4.5;
    const savedBodies = this.bodies;
    this.bodies = clones;

    try {
      for (let s = 0; s < steps; s++) {
        this.yoshidaStep(h);
        points.push({ x: clones[probeIndex].x, y: clones[probeIndex].y });
      }
    } finally {
      this.bodies = savedBodies;
    }

    return points;
  }

  launchBody(x, y, vx, vy, mass = 0.08) {
    const color = PALETTE[this.bodies.length % PALETTE.length];
    const radius = Math.max(3.5, Math.min(9.5, 4 + Math.cbrt(mass) * 6));
    this.addBody({ x, y, vx, vy, mass, radius, color, isTracer: false });
    this.initialEnergy = this.computeDiagnostics().energy;
  }

  screenToWorld(px, py, width, height) {
    return {
      x: (px - width * 0.5) / this.viewScale,
      y: -(py - height * 0.5) / this.viewScale
    };
  }

  worldToScreen(wx, wy, width, height) {
    return {
      x: width * 0.5 + wx * this.viewScale,
      y: height * 0.5 - wy * this.viewScale
    };
  }

  render(ctx, width, height, slingshot = null) {
    // Deep optical obsidian background with subtle vignette
    const grad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      width * 0.05,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72
    );
    grad.addColorStop(0, '#13181e');
    grad.addColorStop(1, '#0a0d11');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle barycentric coordinate reticle (instrument optical hairlines, NOT a grid!)
    const cx = width * 0.5;
    const cy = height * 0.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 241, 234, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, this.viewScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy);
    ctx.lineTo(cx + 14, cy);
    ctx.moveTo(cx, cy - 14);
    ctx.lineTo(cx, cy + 14);
    ctx.stroke();

    // Draw orbital trails
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const tLen = b.trail.length;
      if (tLen < 2) continue;

      if (b.isTracer) {
        ctx.beginPath();
        for (let k = 0; k < tLen; k++) {
          const sx = cx + b.trail[k].x * this.viewScale;
          const sy = cy - b.trail[k].y * this.viewScale;
          if (k === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = b.color + '44';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      } else {
        // Tapered multi-segment luminous trail for primary bodies
        const chunk = Math.max(1, Math.floor(tLen / 18));
        for (let k = chunk; k < tLen; k += chunk) {
          const prevIdx = Math.max(0, k - chunk);
          const alpha = ((k / tLen) * 0.78).toFixed(3);
          ctx.beginPath();
          for (let m = prevIdx; m <= Math.min(tLen - 1, k); m++) {
            const sx = cx + b.trail[m].x * this.viewScale;
            const sy = cy - b.trail[m].y * this.viewScale;
            if (m === prevIdx) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = hexToRgba(b.color, Number(alpha));
          ctx.lineWidth = 1.2 + (k / tLen) * 1.8;
          ctx.stroke();
        }
      }
    }

    // Draw predicted slingshot trajectory before user releases mouse
    if (slingshot && slingshot.previewPoints && slingshot.previewPoints.length > 1) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      slingshot.previewPoints.forEach((pt, idx) => {
        const sx = cx + pt.x * this.viewScale;
        const sy = cy - pt.y * this.viewScale;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw launch vector arrow
      ctx.beginPath();
      ctx.moveTo(slingshot.startScreenX, slingshot.startScreenY);
      ctx.lineTo(slingshot.currScreenX, slingshot.currScreenY);
      ctx.strokeStyle = 'rgba(244, 241, 234, 0.55)';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(slingshot.startScreenX, slingshot.startScreenY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.restore();
    }

    // Draw bodies
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const sx = cx + b.x * this.viewScale;
      const sy = cy - b.y * this.viewScale;

      if (!b.isTracer) {
        const glow = ctx.createRadialGradient(sx, sy, b.radius * 0.3, sx, sy, b.radius * 3.4);
        glow.addColorStop(0, hexToRgba(b.color, 0.45));
        glow.addColorStop(1, hexToRgba(b.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, b.radius * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(sx, sy, b.radius, 0, Math.PI * 2);
      ctx.fill();

      if (!b.isTracer) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx - b.radius * 0.25, sy - b.radius * 0.25, b.radius * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
