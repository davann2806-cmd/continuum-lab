/**
 * 2D Isotropic Finite-Difference Time-Domain (FDTD) Wave Equation Solver
 * Solves ∂²u/∂t² = c²(x,y) ∇²u − γ ∂u/∂t with 9-point isotropic Laplacian,
 * refractive optical media (lenses), hard reflective barriers (slits/cavities),
 * absorbing sponge boundaries, hydrophone probe, and live fringe intensity screen.
 */

export class WaveSimulation {
  constructor(cols = 264, rows = 172) {
    this.cols = cols;
    this.rows = rows;
    const size = cols * rows;

    this.uPrev = new Float32Array(size);
    this.uCurr = new Float32Array(size);
    this.uNext = new Float32Array(size);
    this.mediaIndex = new Float32Array(size); // Refractive index n >= 1.0 (1.0 = vacuum/air, 1.68 = crown glass)
    this.wall = new Uint8Array(size);         // 1 = hard reflective barrier
    this.damping = new Float32Array(size);    // Sponge boundary damping factor in (0, 1]

    this.baseC2 = 0.28;      // Courant number squared (c₀·Δt/Δx)² = 0.28 << 0.75 stability limit
    this.frequency = 0.23;   // Radians per step for continuous source
    this.phase = 0;
    this.emitterEnabled = true;
    this.presetName = 'doubleSlit';

    // Detector screen at x = cols - 34 for interference fringe measurement
    this.detectorX = cols - 34;
    this.fringeIntensity = new Float32Array(rows);

    // Movable hydrophone probe in grid coordinates
    this.probeX = Math.floor(cols * 0.72);
    this.probeY = Math.floor(rows * 0.5);
    this.probeSignal = 0;

    // Offscreen pixel buffer (initialized lazily when rendering in browser)
    this._offscreen = null;
    this._offCtx = null;
    this._imageData = null;
    this._pixels32 = null;

    this._initSponge();
    this.loadPreset('doubleSlit');
  }

  _initSponge(enableEdges = true) {
    const { cols, rows, damping } = this;
    const margin = 18;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        if (!enableEdges) {
          damping[idx] = 0.9992;
          continue;
        }
        const dx = Math.min(x, cols - 1 - x);
        const dy = Math.min(y, rows - 1 - y);
        const d = Math.min(dx, dy);
        if (d < margin) {
          const s = (margin - d) / margin;
          damping[idx] = Math.max(0.86, 0.9994 - 0.11 * s * s);
        } else {
          damping[idx] = 0.9994;
        }
      }
    }
  }

  clearFields() {
    this.uPrev.fill(0);
    this.uCurr.fill(0);
    this.uNext.fill(0);
    this.fringeIntensity.fill(0);
    this.phase = 0;
  }

  loadPreset(name) {
    this.presetName = name;
    this.clearFields();
    this.wall.fill(0);
    this.mediaIndex.fill(1.0);

    const { cols, rows } = this;
    const cy = Math.floor(rows * 0.5);

    if (name === 'doubleSlit') {
      this._initSponge(true);
      this.emitterEnabled = true;
      this.frequency = 0.25;
      const wallX = Math.floor(cols * 0.34);
      const slitHalfGap = 15;
      const slitHalfWidth = 3;

      for (let y = 0; y < rows; y++) {
        const inUpperSlit = Math.abs(y - (cy - slitHalfGap)) <= slitHalfWidth;
        const inLowerSlit = Math.abs(y - (cy + slitHalfGap)) <= slitHalfWidth;
        if (!inUpperSlit && !inLowerSlit) {
          this.wall[y * cols + wallX] = 1;
          this.wall[y * cols + wallX + 1] = 1;
        }
      }

      this.probeX = Math.floor(cols * 0.68);
      this.probeY = cy - 14;
    } else if (name === 'lens') {
      this._initSponge(true);
      this.emitterEnabled = true;
      this.frequency = 0.24;

      // Biconvex refractive lens (intersection of two spheres)
      const lensCenterX = Math.floor(cols * 0.42);
      const R = 64;
      const halfThick = 13;
      const cLeftX = lensCenterX + (R - halfThick);
      const cRightX = lensCenterX - (R - halfThick);

      for (let y = 16; y < rows - 16; y++) {
        for (let x = lensCenterX - halfThick - 2; x <= lensCenterX + halfThick + 2; x++) {
          const d1 = Math.hypot(x - cLeftX, y - cy);
          const d2 = Math.hypot(x - cRightX, y - cy);
          if (d1 <= R && d2 <= R) {
            this.mediaIndex[y * cols + x] = 1.66;
          }
        }
      }

      // Place hydrophone probe near theoretical focal region
      this.probeX = Math.floor(cols * 0.69);
      this.probeY = cy;
    } else if (name === 'ellipse') {
      // Closed elliptical whispering gallery: pulse at focus F1 converges sharply at focus F2
      this._initSponge(false);
      this.emitterEnabled = false;
      this.frequency = 0.22;

      const cx = Math.floor(cols * 0.5);
      const a = Math.floor(cols * 0.41);
      const b = Math.floor(rows * 0.41);
      const focalDist = Math.sqrt(a * a - b * b);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const norm = ((x - cx) * (x - cx)) / (a * a) + ((y - cy) * (y - cy)) / (b * b);
          if (norm >= 1.0) {
            this.wall[y * cols + x] = 1;
          }
        }
      }

      const f1x = Math.round(cx - focalDist);
      const f2x = Math.round(cx + focalDist);
      this.probeX = f2x;
      this.probeY = cy;

      // Seed initial crisp Gaussian acoustic impulse right at Focus F1
      this.pluck(f1x, cy, 4.2, 5.5);
    }
  }

  /**
   * Inject a smooth Gaussian wave packet at grid coordinate (gx, gy).
   */
  pluck(gx, gy, amplitude = 3.2, radius = 5.0) {
    const { cols, rows, uCurr, uPrev, wall } = this;
    const rCeil = Math.ceil(radius * 2.4);
    const inv2Sigma2 = 1 / (radius * radius);

    const minY = Math.max(2, Math.floor(gy - rCeil));
    const maxY = Math.min(rows - 3, Math.ceil(gy + rCeil));
    const minX = Math.max(2, Math.floor(gx - rCeil));
    const maxX = Math.min(cols - 3, Math.ceil(gx + rCeil));

    for (let y = minY; y <= maxY; y++) {
      const dy = y - gy;
      for (let x = minX; x <= maxX; x++) {
        const idx = y * cols + x;
        if (wall[idx]) continue;
        const dx = x - gx;
        const w = amplitude * Math.exp(-(dx * dx + dy * dy) * inv2Sigma2);
        uCurr[idx] += w;
        uPrev[idx] += w * 0.92;
      }
    }
  }

  /**
   * Paint wall, optical glass lens, or erase medium along a stroke segment.
   */
  paintStroke(gx0, gy0, gx1, gy1, tool = 'wall', brushRadius = 3.2) {
    const { cols, rows } = this;
    const dist = Math.max(1, Math.hypot(gx1 - gx0, gy1 - gy0));
    const steps = Math.ceil(dist * 1.5);
    const rSq = brushRadius * brushRadius;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = gx0 + (gx1 - gx0) * t;
      const cy = gy0 + (gy1 - gy0) * t;

      const minY = Math.max(2, Math.floor(cy - brushRadius - 1));
      const maxY = Math.min(rows - 3, Math.ceil(cy + brushRadius + 1));
      const minX = Math.max(2, Math.floor(cx - brushRadius - 1));
      const maxX = Math.min(cols - 3, Math.ceil(cx + brushRadius + 1));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= rSq) {
            const idx = y * cols + x;
            if (tool === 'wall') {
              this.wall[idx] = 1;
              this.mediaIndex[idx] = 1.0;
              this.uCurr[idx] = 0;
              this.uPrev[idx] = 0;
            } else if (tool === 'lens') {
              this.wall[idx] = 0;
              this.mediaIndex[idx] = 1.66;
            } else if (tool === 'erase') {
              this.wall[idx] = 0;
              this.mediaIndex[idx] = 1.0;
            }
          }
        }
      }
    }
  }

  /**
   * Advance one FDTD wave equation time step.
   */
  stepOnce() {
    const { cols, rows, uPrev, uCurr, uNext, mediaIndex, wall, damping, baseC2 } = this;

    // Drive continuous coherent source if enabled
    if (this.emitterEnabled) {
      this.phase += this.frequency;
      const drive = Math.sin(this.phase) * 1.65;

      if (this.presetName === 'doubleSlit' || this.presetName === 'lens') {
        const srcX = 24;
        const yMargin = 26;
        for (let y = yMargin; y < rows - yMargin; y++) {
          // Smooth Tukey window taper at ends of planar source to prevent edge diffraction artifacts
          let taper = 1.0;
          const edgeDist = Math.min(y - yMargin, rows - 1 - yMargin - y);
          if (edgeDist < 14) {
            taper = 0.5 * (1 - Math.cos((Math.PI * edgeDist) / 14));
          }
          const idx = y * cols + srcX;
          if (!wall[idx]) {
            uCurr[idx] = drive * taper;
          }
        }
      } else {
        // Point focus harmonic source for elliptical cavity
        const cx = Math.floor(cols * 0.5);
        const a = Math.floor(cols * 0.41);
        const b = Math.floor(rows * 0.41);
        const f1x = Math.round(cx - Math.sqrt(a * a - b * b));
        const cy = Math.floor(rows * 0.5);
        const idx = cy * cols + f1x;
        if (!wall[idx]) {
          uCurr[idx] = drive * 2.1;
        }
      }
    }

    // Interior 9-point isotropic Laplacian update
    const inv6 = 1 / 6;
    for (let y = 1; y < rows - 1; y++) {
      const rowOffset = y * cols;
      const upOffset = rowOffset - cols;
      const dnOffset = rowOffset + cols;

      for (let x = 1; x < cols - 1; x++) {
        const i = rowOffset + x;
        if (wall[i]) {
          uNext[i] = 0;
          continue;
        }

        const center = uCurr[i];
        const ortho = uCurr[i - 1] + uCurr[i + 1] + uCurr[upOffset + x] + uCurr[dnOffset + x];
        const diag =
          uCurr[upOffset + x - 1] +
          uCurr[upOffset + x + 1] +
          uCurr[dnOffset + x - 1] +
          uCurr[dnOffset + x + 1];

        const laplacian = (4 * ortho + diag - 20 * center) * inv6;
        const n = mediaIndex[i];
        const localC2 = baseC2 / (n * n);
        const damp = damping[i];

        // Damped second-order wave update
        const vel = (center - uPrev[i]) * damp;
        uNext[i] = center + vel + localC2 * laplacian;
      }
    }

    // Rotate state buffers
    this.uPrev = uCurr;
    this.uCurr = uNext;
    this.uNext = uPrev;

    // Accumulate time-averaged intensity I(y) = <u²> on virtual detector screen
    const detX = this.detectorX;
    for (let y = 0; y < rows; y++) {
      const u = this.uCurr[y * cols + detX];
      this.fringeIntensity[y] = this.fringeIntensity[y] * 0.982 + u * u * 0.018;
    }

    const pIdx =
      Math.max(1, Math.min(rows - 2, this.probeY)) * cols +
      Math.max(1, Math.min(cols - 2, this.probeX));
    this.probeSignal = this.uCurr[pIdx];
  }

  stepFrame(substeps = 2) {
    for (let s = 0; s < substeps; s++) {
      this.stepOnce();
    }
    return this.computeDiagnostics();
  }

  computeDiagnostics() {
    const { cols, rows, uCurr, uPrev, wall } = this;
    let totalEnergy = 0;
    const len = cols * rows;
    for (let i = 0; i < len; i++) {
      if (wall[i]) continue;
      const vel = uCurr[i] - uPrev[i];
      totalEnergy += 0.5 * (vel * vel + 0.25 * uCurr[i] * uCurr[i]);
    }
    return {
      totalEnergy,
      probeSignal: this.probeSignal
    };
  }

  screenToGrid(px, py, width, height) {
    return {
      gx: (px / width) * this.cols,
      gy: (py / height) * this.rows
    };
  }

  render(ctx, width, height, detectorLabel = 'I(y)') {
    const { cols, rows, uCurr, wall, mediaIndex, fringeIntensity } = this;

    if (!this._offscreen && typeof document !== 'undefined') {
      this._offscreen = document.createElement('canvas');
      this._offscreen.width = cols;
      this._offscreen.height = rows;
      this._offCtx = this._offscreen.getContext('2d');
      this._imageData = this._offCtx.createImageData(cols, rows);
      this._pixels32 = new Uint32Array(this._imageData.data.buffer);
    }

    if (this._pixels32) {
      const px32 = this._pixels32;
      const len = cols * rows;

      for (let i = 0; i < len; i++) {
        if (wall[i]) {
          // Brushed brass/titanium barrier
          px32[i] = (255 << 24) | (68 << 16) | (74 << 8) | 82;
          continue;
        }

        const u = uCurr[i];
        const glass = mediaIndex[i] > 1.05;

        // Diverging scientific wave colormap:
        // Positive crests -> Warm Tungsten Amber/Ivory; Negative troughs -> Deep Optical Cyan
        const pos = u > 0 ? Math.min(1, u * 0.72) : 0;
        const neg = u < 0 ? Math.min(1, -u * 0.72) : 0;

        let r = 12 + pos * 238 + neg * 10;
        let g = 16 + pos * 168 + neg * 188;
        let b = 22 + pos * 48 + neg * 224;

        // Specular highlight for intense constructive wave crests
        const crest = Math.max(0, Math.abs(u) - 0.95) * 0.45;
        r += crest * 120;
        g += crest * 120;
        b += crest * 120;

        if (glass) {
          // Subtle optical crown-glass tint
          r = r * 0.86 + 26;
          g = g * 0.88 + 42;
          b = b * 0.86 + 48;
        }

        const ri = r > 255 ? 255 : r | 0;
        const gi = g > 255 ? 255 : g | 0;
        const bi = b > 255 ? 255 : b | 0;

        px32[i] = (255 << 24) | (bi << 16) | (gi << 8) | ri;
      }

      this._offCtx.putImageData(this._imageData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this._offscreen, 0, 0, width, height);
    }

    // Draw detector screen line & live interference intensity profile I(y)
    if (this.presetName === 'doubleSlit' || this.presetName === 'lens') {
      const detScreenX = (this.detectorX / cols) * width;
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 241, 234, 0.22)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(detScreenX, 16);
      ctx.lineTo(detScreenX, height - 16);
      ctx.stroke();
      ctx.setLineDash([]);

      // Normalize fringe intensity smoothly
      let maxI = 0.04;
      for (let y = 14; y < rows - 14; y++) {
        if (fringeIntensity[y] > maxI) maxI = fringeIntensity[y];
      }

      const maxBarWidth = Math.min(78, width - detScreenX - 10);
      ctx.beginPath();
      for (let y = 14; y < rows - 14; y++) {
        const sy = (y / rows) * height;
        const norm = Math.min(1, fringeIntensity[y] / maxI);
        const sx = detScreenX + norm * maxBarWidth;
        if (y === 14) ctx.moveTo(detScreenX, sy);
        ctx.lineTo(sx, sy);
      }
      ctx.lineTo(detScreenX, ((rows - 14) / rows) * height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.20)';
      ctx.fill();

      ctx.beginPath();
      for (let y = 14; y < rows - 14; y++) {
        const sy = (y / rows) * height;
        const norm = Math.min(1, fringeIntensity[y] / maxI);
        const sx = detScreenX + norm * maxBarWidth;
        if (y === 14) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.75;
      ctx.stroke();

      ctx.fillStyle = 'rgba(244, 241, 234, 0.72)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(detectorLabel, Math.max(8, detScreenX - 24), 24);
      ctx.restore();
    }

    // Draw movable Hydrophone Probe marker
    const px = (this.probeX / cols) * width;
    const py = (this.probeY / rows) * height;
    const pulseRadius = 7 + Math.min(12, Math.abs(this.probeSignal) * 6);

    ctx.save();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(px, py, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
