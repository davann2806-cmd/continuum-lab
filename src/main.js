import { TRANSLATIONS, EQUATIONS } from './i18n/translations.js';
import { FluidSimulation } from './engines/fluid.js';
import { WaveSimulation } from './engines/wave.js';
import { NBodySimulation } from './engines/nbody.js';
import { AcousticStudio, SCALES, computeScaleFrequencies } from './engines/audio.js';

const PRESET_DEFS = {
  fluid: [
    { id: 'karman', labelKey: 'presetKarman', tag: 'Re ≈ 180' },
    { id: 'jets', labelKey: 'presetJets', tag: 'KH Shear' },
    { id: 'calm', labelKey: 'presetCalm', tag: 'Free' }
  ],
  wave: [
    { id: 'doubleSlit', labelKey: 'presetDoubleSlit', tag: 'λ / 2d' },
    { id: 'lens', labelKey: 'presetLens', tag: 'n = 1.66' },
    { id: 'ellipse', labelKey: 'presetEllipse', tag: 'F₁ → F₂' }
  ],
  nbody: [
    { id: 'figure8', labelKey: 'presetFigure8', tag: 'Exact 3-Body' },
    { id: 'trojans', labelKey: 'presetTrojans', tag: 'L4 / L5' },
    { id: 'binary', labelKey: 'presetBinary', tag: 'Kepler' },
    { id: 'galaxy', labelKey: 'presetGalaxy', tag: '138 Bodies' }
  ]
};

class ContinuumApp {
  constructor() {
    this.lang = 'km'; // Default to Khmer per user conversation, instant toggle to English
    this.mode = 'fluid';
    this.paused = false;
    this.waveTool = 'pluck';
    this.launchMass = 0.08;

    this.stageEl = document.getElementById('viewport-stage');
    this.glCanvas = document.getElementById('gl-canvas');
    this.simCanvas = document.getElementById('sim-canvas');
    this.simCtx = this.simCanvas.getContext('2d');
    this.scopeCanvas = document.getElementById('scope-canvas');

    this.audio = new AcousticStudio();
    this.fluid = new FluidSimulation(this.glCanvas);
    this.wave = new WaveSimulation(264, 172);
    this.nbody = new NBodySimulation();

    this.pointer = {
      down: false,
      x: 0,
      y: 0,
      startX: 0,
      startY: 0,
      draggingProbe: false,
      slingshot: null
    };

    this.fpsSmooth = 60;
    this.lastFrameMs = performance.now();
    this._prevWaveProbe = 0;

    this._buildRoneatBars();
    this._bindControls();
    this._bindStageInteractions();
    this._resizeStage();
    this.applyLanguage();
    this._renderPresetButtons();
    this._syncModeVisibility();

    window.addEventListener('resize', () => this._resizeStage());
    requestAnimationFrame((ts) => this._loop(ts));
  }

  t(key) {
    return TRANSLATIONS[this.lang][key] || TRANSLATIONS.en[key] || key;
  }

  _resizeStage() {
    const rect = this.stageEl.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(280, Math.floor(rect.height));

    this.simCanvas.width = w;
    this.simCanvas.height = h;
    this.fluid.resize(w, h);
  }

  _buildRoneatBars() {
    const container = document.getElementById('roneat-bars');
    container.innerHTML = '';
    this.barEls = [];

    // Tapered heights inspired by authentic Cambodian Roneat Ek hardwood bars
    for (let i = 0; i < 8; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'roneat-bar';
      btn.id = `roneat-bar-${i}`;
      const heightPct = 100 - i * 4.2;
      btn.style.height = `${heightPct}%`;

      const degSpan = document.createElement('span');
      degSpan.className = 'bar-degree';
      const freqSpan = document.createElement('span');
      freqSpan.className = 'bar-freq';

      btn.appendChild(degSpan);
      btn.appendChild(freqSpan);

      btn.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        if (!this.audio.enabled) {
          await this.audio.toggleAudio(true);
          this._updateAudioButtonUI();
        }
        this.audio.playBar(i, 0.85);
      });

      container.appendChild(btn);
      this.barEls.push({ btn, degSpan, freqSpan });
    }

    this.audio.onBarTriggered((idx) => {
      const item = this.barEls[idx];
      if (!item) return;
      item.btn.classList.add('is-struck');
      clearTimeout(item._timer);
      item._timer = setTimeout(() => item.btn.classList.remove('is-struck'), 160);
    });

    this._refreshBarLabels();
  }

  _refreshBarLabels() {
    const scaleMeta = SCALES[this.audio.scale] || SCALES.pinpeat;
    const freqs = computeScaleFrequencies(this.audio.scale, this.audio.rootHz);
    this.barEls.forEach((item, idx) => {
      item.degSpan.textContent = scaleMeta.noteLabels[idx];
      item.freqSpan.textContent = `${Math.round(freqs[idx])}Hz`;
    });
  }

  _updateAudioButtonUI() {
    const btn = document.getElementById('btn-audio');
    const lbl = document.getElementById('label-audio');
    btn.classList.toggle('is-active', this.audio.enabled);
    lbl.textContent = this.audio.enabled ? this.t('audioOn') : this.t('audioOff');
  }

  applyLanguage() {
    document.documentElement.lang = this.lang;
    document.getElementById('app-title').textContent = this.t('appTitle');
    document.getElementById('app-subtitle').textContent = this.t('appSubtitle');
    document.getElementById('btn-lang').textContent = this.t('langSwitchLabel');
    document.getElementById('btn-pause').textContent = this.paused ? this.t('resume') : this.t('pause');
    document.getElementById('btn-step').textContent = this.t('stepOnce');
    document.getElementById('btn-reset').textContent = this.t('reset');
    this._updateAudioButtonUI();

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });

    this._renderPresetButtons();
    this._updateStageMeta();
  }

  _renderPresetButtons() {
    const container = document.getElementById('preset-container');
    container.innerHTML = '';
    const list = PRESET_DEFS[this.mode];
    const currentPreset =
      this.mode === 'fluid'
        ? this.fluid.presetName
        : this.mode === 'wave'
          ? this.wave.presetName
          : this.nbody.presetName;

    list.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = `preset-${p.id}`;
      btn.className = `btn preset-btn ${currentPreset === p.id ? 'is-active' : ''}`;

      const title = document.createElement('span');
      title.textContent = this.t(p.labelKey);
      const tag = document.createElement('span');
      tag.className = 'control-val';
      tag.textContent = p.tag;

      btn.appendChild(title);
      btn.appendChild(tag);
      btn.addEventListener('click', () => {
        if (this.mode === 'fluid') {
          this.fluid.loadPreset(p.id);
          document.getElementById('slider-vorticity').value = String(this.fluid.curlStrength);
          document.getElementById('val-vorticity').textContent = String(this.fluid.curlStrength);
          document.getElementById('slider-dissipation').value = String(this.fluid.dyeDissipation);
          document.getElementById('val-dissipation').textContent = this.fluid.dyeDissipation.toFixed(2);
        } else if (this.mode === 'wave') {
          this.wave.loadPreset(p.id);
          document.getElementById('chk-emitter').checked = this.wave.emitterEnabled;
          document.getElementById('slider-wfreq').value = String(this.wave.frequency);
          document.getElementById('val-wfreq').textContent = `${this.wave.frequency.toFixed(2)} rad`;
        } else {
          this.nbody.loadPreset(p.id);
          document.getElementById('slider-ndt').value = String(this.nbody.dt);
          document.getElementById('val-ndt').textContent = this.nbody.dt.toFixed(4);
        }
        this._renderPresetButtons();
      });

      container.appendChild(btn);
    });
  }

  _syncModeVisibility() {
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      const active = tab.dataset.mode === this.mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    const useGl = this.mode === 'fluid' && Boolean(this.fluid.gl);
    this.glCanvas.classList.toggle('is-hidden', !useGl);
    this.simCanvas.classList.toggle('is-hidden', useGl);

    document.getElementById('controls-fluid').classList.toggle('is-hidden', this.mode !== 'fluid');
    document.getElementById('controls-wave').classList.toggle('is-hidden', this.mode !== 'wave');
    document.getElementById('controls-nbody').classList.toggle('is-hidden', this.mode !== 'nbody');

    this._renderPresetButtons();
    this._updateStageMeta();
  }

  _updateStageMeta() {
    document.getElementById('equation-readout').textContent = EQUATIONS[this.mode];

    if (this.mode === 'fluid') {
      document.getElementById('stage-hint').textContent = this.t('fluidHint');
      document.getElementById('tel-label-1').textContent = this.t('telMetric1Fluid');
      document.getElementById('tel-label-2').textContent = this.t('telMetric2Fluid');
    } else if (this.mode === 'wave') {
      document.getElementById('stage-hint').textContent = this.t('waveHint');
      document.getElementById('tel-label-1').textContent = this.t('telMetric1Wave');
      document.getElementById('tel-label-2').textContent = this.t('telMetric2Wave');
    } else {
      document.getElementById('stage-hint').textContent = this.t('nbodyHint');
      document.getElementById('tel-label-1').textContent = this.t('telMetric1NBody');
      document.getElementById('tel-label-2').textContent = this.t('telMetric2NBody');
    }
  }

  _bindControls() {
    document.getElementById('btn-lang').addEventListener('click', () => {
      this.lang = this.lang === 'km' ? 'en' : 'km';
      this.applyLanguage();
    });

    document.getElementById('btn-audio').addEventListener('click', async () => {
      await this.audio.toggleAudio();
      this._updateAudioButtonUI();
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
      this.paused = !this.paused;
      const btn = document.getElementById('btn-pause');
      btn.classList.toggle('is-active', this.paused);
      btn.textContent = this.paused ? this.t('resume') : this.t('pause');
    });

    document.getElementById('btn-step').addEventListener('click', () => {
      this.paused = true;
      const btn = document.getElementById('btn-pause');
      btn.classList.add('is-active');
      btn.textContent = this.t('resume');
      this._stepActiveSimulation();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (this.mode === 'fluid') this.fluid.loadPreset(this.fluid.presetName);
      else if (this.mode === 'wave') this.wave.loadPreset(this.wave.presetName);
      else this.nbody.loadPreset(this.nbody.presetName);
    });

    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.mode = tab.dataset.mode;
        this._syncModeVisibility();
      });
    });

    // Fluid controls
    document.querySelectorAll('[data-vis]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.fluid.visMode = Number(btn.dataset.vis);
        document.querySelectorAll('[data-vis]').forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });

    const sVort = document.getElementById('slider-vorticity');
    sVort.addEventListener('input', () => {
      this.fluid.curlStrength = Number(sVort.value);
      document.getElementById('val-vorticity').textContent = sVort.value;
    });

    const sDiss = document.getElementById('slider-dissipation');
    sDiss.addEventListener('input', () => {
      this.fluid.dyeDissipation = Number(sDiss.value);
      document.getElementById('val-dissipation').textContent = Number(sDiss.value).toFixed(2);
    });

    const sJac = document.getElementById('slider-jacobi');
    sJac.addEventListener('input', () => {
      this.fluid.pressureIterations = Number(sJac.value);
      document.getElementById('val-jacobi').textContent = sJac.value;
    });

    // Wave controls
    document.querySelectorAll('[data-wtool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.waveTool = btn.dataset.wtool;
        document.querySelectorAll('[data-wtool]').forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });

    const sWFreq = document.getElementById('slider-wfreq');
    sWFreq.addEventListener('input', () => {
      this.wave.frequency = Number(sWFreq.value);
      document.getElementById('val-wfreq').textContent = `${this.wave.frequency.toFixed(2)} rad`;
    });

    const sWSpeed = document.getElementById('slider-wspeed');
    sWSpeed.addEventListener('input', () => {
      this.wave.baseC2 = Number(sWSpeed.value);
      document.getElementById('val-wspeed').textContent = `${Math.sqrt(this.wave.baseC2).toFixed(2)} c`;
    });

    const chkEmit = document.getElementById('chk-emitter');
    chkEmit.addEventListener('change', () => {
      this.wave.emitterEnabled = chkEmit.checked;
    });

    // N-Body controls
    const sNDt = document.getElementById('slider-ndt');
    sNDt.addEventListener('input', () => {
      this.nbody.dt = Number(sNDt.value);
      document.getElementById('val-ndt').textContent = this.nbody.dt.toFixed(4);
    });

    const sNTrail = document.getElementById('slider-ntrail');
    sNTrail.addEventListener('input', () => {
      this.nbody.trailLength = Number(sNTrail.value);
      document.getElementById('val-ntrail').textContent = sNTrail.value;
    });

    const sNMass = document.getElementById('slider-nmass');
    sNMass.addEventListener('input', () => {
      this.launchMass = Number(sNMass.value);
      document.getElementById('val-nmass').textContent = `${this.launchMass.toFixed(2)} M`;
    });

    // Acoustic controls
    document.querySelectorAll('[data-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.scale = btn.dataset.scale;
        document.querySelectorAll('[data-scale]').forEach((b) => b.classList.toggle('is-active', b === btn));
        this._refreshBarLabels();
      });
    });

    document.querySelectorAll('[data-timbre]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.timbre = btn.dataset.timbre;
        document.querySelectorAll('[data-timbre]').forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });

    document.getElementById('chk-couple').addEventListener('change', (e) => {
      this.audio.coupled = e.target.checked;
    });

    // Keyboard playability (1-8 for Roneat bars, Space for pause)
    window.addEventListener('keydown', async (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        document.getElementById('btn-pause').click();
      } else if (e.key >= '1' && e.key <= '8') {
        const idx = Number(e.key) - 1;
        if (!this.audio.enabled) {
          await this.audio.toggleAudio(true);
          this._updateAudioButtonUI();
        }
        this.audio.playBar(idx, 0.85);
      }
    });
  }

  _bindStageInteractions() {
    const getLocalPos = (e) => {
      const rect = this.stageEl.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        w: rect.width,
        h: rect.height
      };
    };

    this.stageEl.addEventListener('pointerdown', (e) => {
      this.stageEl.setPointerCapture(e.pointerId);
      const pos = getLocalPos(e);
      this.pointer.down = true;
      this.pointer.x = pos.x;
      this.pointer.y = pos.y;
      this.pointer.startX = pos.x;
      this.pointer.startY = pos.y;

      if (this.mode === 'wave') {
        const g = this.wave.screenToGrid(pos.x, pos.y, pos.w, pos.h);
        // Check if grabbing hydrophone probe
        if (Math.hypot(g.gx - this.wave.probeX, g.gy - this.wave.probeY) < 9) {
          this.pointer.draggingProbe = true;
          return;
        }
        if (this.waveTool === 'pluck') {
          this.wave.pluck(g.gx, g.gy, 3.6, 5.2);
          this.audio.triggerFromPhysics(0.62, 1 - pos.y / pos.h, 70);
        } else {
          this.wave.paintStroke(g.gx, g.gy, g.gx, g.gy, this.waveTool, 3.2);
        }
      } else if (this.mode === 'nbody') {
        const worldStart = this.nbody.screenToWorld(pos.x, pos.y, pos.w, pos.h);
        this.pointer.slingshot = {
          startScreenX: pos.x,
          startScreenY: pos.y,
          currScreenX: pos.x,
          currScreenY: pos.y,
          worldX: worldStart.x,
          worldY: worldStart.y,
          vx: 0,
          vy: 0,
          previewPoints: [{ x: worldStart.x, y: worldStart.y }]
        };
      }
    });

    this.stageEl.addEventListener('pointermove', (e) => {
      if (!this.pointer.down) return;
      const pos = getLocalPos(e);
      const dx = pos.x - this.pointer.x;
      const dy = pos.y - this.pointer.y;

      if (this.mode === 'fluid') {
        const res = this.fluid.pointerDrag(pos.x, pos.y, dx, dy, pos.w, pos.h);
        if (res.speed > 7) {
          this.audio.triggerFromPhysics(Math.min(0.7, res.speed * 0.018), 1 - pos.y / pos.h, 130);
        }
      } else if (this.mode === 'wave') {
        const g0 = this.wave.screenToGrid(this.pointer.x, this.pointer.y, pos.w, pos.h);
        const g1 = this.wave.screenToGrid(pos.x, pos.y, pos.w, pos.h);
        if (this.pointer.draggingProbe) {
          this.wave.probeX = Math.max(4, Math.min(this.wave.cols - 5, Math.round(g1.gx)));
          this.wave.probeY = Math.max(4, Math.min(this.wave.rows - 5, Math.round(g1.gy)));
        } else if (this.waveTool === 'pluck') {
          this.wave.pluck(g1.gx, g1.gy, 2.2, 4.4);
          this.audio.triggerFromPhysics(0.45, 1 - pos.y / pos.h, 135);
        } else {
          this.wave.paintStroke(g0.gx, g0.gy, g1.gx, g1.gy, this.waveTool, 3.2);
        }
      } else if (this.mode === 'nbody' && this.pointer.slingshot) {
        const s = this.pointer.slingshot;
        s.currScreenX = pos.x;
        s.currScreenY = pos.y;
        // Pull-back slingshot: launch velocity opposite to drag vector
        const pullX = (s.startScreenX - pos.x) * 0.012;
        const pullY = -(s.startScreenY - pos.y) * 0.012;
        s.vx = pullX;
        s.vy = pullY;
        s.previewPoints = this.nbody.predictTrajectory(s.worldX, s.worldY, s.vx, s.vy, this.launchMass, 125);
      }

      this.pointer.x = pos.x;
      this.pointer.y = pos.y;
    });

    const finishPointer = () => {
      if (!this.pointer.down) return;
      if (this.mode === 'nbody' && this.pointer.slingshot) {
        const s = this.pointer.slingshot;
        this.nbody.launchBody(s.worldX, s.worldY, s.vx, s.vy, this.launchMass);
        const speedNorm = Math.min(1, Math.hypot(s.vx, s.vy) * 0.45);
        this.audio.triggerFromPhysics(0.68, speedNorm, 40);
      }
      this.pointer.down = false;
      this.pointer.draggingProbe = false;
      this.pointer.slingshot = null;
    };

    this.stageEl.addEventListener('pointerup', finishPointer);
    this.stageEl.addEventListener('pointercancel', finishPointer);
  }

  _stepActiveSimulation() {
    if (this.mode === 'fluid') {
      const diag = this.fluid.stepFrame(0.016);
      this._updateTelemetryFluid(diag);
    } else if (this.mode === 'wave') {
      const diag = this.wave.stepFrame(2);
      // Couple positive zero-crossing crests at hydrophone probe to resonator!
      if (this._prevWaveProbe <= 0.22 && diag.probeSignal > 0.22) {
        const pitchNorm = 1 - this.wave.probeY / this.wave.rows;
        this.audio.triggerFromPhysics(Math.min(0.65, Math.abs(diag.probeSignal) * 0.45), pitchNorm, 190);
      }
      this._prevWaveProbe = diag.probeSignal;
      this._updateTelemetryWave(diag);
    } else {
      const diag = this.nbody.stepFrame();
      if (this.nbody.recentEvents.length > 0) {
        const ev = this.nbody.recentEvents[0];
        const norm = (ev.pairIndex % 8) / 8;
        this.audio.triggerFromPhysics(Math.min(0.7, ev.speed * 0.28), norm, 210);
      }
      this._updateTelemetryNBody(diag);
    }
  }

  _updateTelemetryFluid(diag) {
    document.getElementById('tel-backend').textContent = this.fluid.backendName;
    document.getElementById('tel-domain').textContent = diag.gridDesc;
    document.getElementById('tel-val-1').textContent = `${diag.meanEnergy.toFixed(3)} J/m²`;
    document.getElementById('tel-val-2').textContent = `${diag.peakVorticity.toFixed(1)} s⁻¹`;
  }

  _updateTelemetryWave(diag) {
    document.getElementById('tel-backend').textContent = 'Isotropic 9-Pt FDTD';
    document.getElementById('tel-domain').textContent = `${this.wave.cols}×${this.wave.rows}`;
    document.getElementById('tel-val-1').textContent = diag.totalEnergy.toFixed(2);
    document.getElementById('tel-val-2').textContent =
      (diag.probeSignal >= 0 ? '+' : '') + diag.probeSignal.toFixed(3);
  }

  _updateTelemetryNBody(diag) {
    document.getElementById('tel-backend').textContent = 'Yoshida 4th-Order';
    document.getElementById('tel-domain').textContent = `${this.nbody.bodies.length} Bodies`;
    document.getElementById('tel-val-1').textContent = diag.energy.toFixed(5);
    document.getElementById('tel-val-2').textContent = diag.relDrift.toExponential(2);
  }

  _loop(nowMs) {
    const dtMs = Math.max(1, nowMs - this.lastFrameMs);
    this.lastFrameMs = nowMs;
    const instFps = 1000 / dtMs;
    this.fpsSmooth = this.fpsSmooth * 0.92 + instFps * 0.08;
    document.getElementById('tel-fps').textContent = Math.min(120, this.fpsSmooth).toFixed(1);

    if (!this.paused) {
      this._stepActiveSimulation();
    }

    const w = this.simCanvas.width;
    const h = this.simCanvas.height;

    if (this.mode === 'fluid') {
      this.fluid.render(this.simCtx, w, h);
    } else if (this.mode === 'wave') {
      this.wave.render(this.simCtx, w, h, 'I(y)');
    } else {
      this.nbody.render(this.simCtx, w, h, this.pointer.slingshot);
    }

    this.audio.renderOscilloscope(this.scopeCanvas);
    requestAnimationFrame((ts) => this._loop(ts));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.continuumApp = new ContinuumApp();
});
