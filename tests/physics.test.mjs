import test from 'node:test';
import assert from 'node:assert/strict';

import { NBodySimulation } from '../src/engines/nbody.js';
import { WaveSimulation } from '../src/engines/wave.js';
import { CpuStableFluid } from '../src/engines/fluid.js';
import { computeScaleFrequencies, synthesizePhysicalWave } from '../src/engines/audio.js';
import { TRANSLATIONS } from '../src/i18n/translations.js';

test('4th-Order Yoshida N-Body: Figure-8 three-body choreography conserves Hamiltonian energy & momentum', () => {
  const sim = new NBodySimulation();
  sim.loadPreset('figure8');

  const initDiag = sim.computeDiagnostics();
  assert.ok(initDiag.energy < 0, 'Bound 3-body choreography must have negative total energy');
  assert.ok(initDiag.momentumMag < 1e-12, 'Initial barycentric linear momentum must vanish');

  // Advance 120 frames × 10 Yoshida substeps = 1,200 4th-order symplectic steps
  for (let f = 0; f < 120; f++) {
    sim.stepFrame();
  }

  const finalDiag = sim.computeDiagnostics();
  assert.ok(
    finalDiag.relDrift < 1e-7,
    `Expected 4th-order Yoshida energy drift < 1e-7, got ${finalDiag.relDrift}`
  );
  assert.ok(
    finalDiag.momentumMag < 1e-11,
    `Expected linear momentum conservation < 1e-11, got ${finalDiag.momentumMag}`
  );
});

test('N-Body trajectory predictor computes future path without mutating live bodies', () => {
  const sim = new NBodySimulation();
  sim.loadPreset('binary');
  const snapshotX = sim.bodies[0].x;
  const preview = sim.predictTrajectory(1.2, 0.3, -0.2, 0.7, 0.05, 80);

  assert.equal(preview.length, 81);
  assert.equal(sim.bodies[0].x, snapshotX, 'Predictor must not mutate active simulation state');
  assert.ok(preview.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y)));
});

test('2D Isotropic FDTD Wave Solver: CFL stability and symmetric Young double-slit interference', () => {
  const wave = new WaveSimulation(200, 140);
  wave.loadPreset('doubleSlit');

  for (let i = 0; i < 260; i++) {
    wave.stepOnce();
  }

  const diag = wave.computeDiagnostics();
  assert.ok(Number.isFinite(diag.totalEnergy) && diag.totalEnergy > 0, 'Wave field must carry positive finite energy');

  // Verify mirror symmetry of interference fringes across central optical axis cy = 70
  const cy = Math.floor(wave.rows * 0.5);
  for (const offset of [6, 12, 20]) {
    const upper = wave.fringeIntensity[cy - offset];
    const lower = wave.fringeIntensity[cy + offset];
    const diff = Math.abs(upper - lower);
    assert.ok(diff < 1e-4, `Double-slit fringe asymmetry too high at offset ${offset}: ${diff}`);
  }
});

test('Navier–Stokes Helmholtz–Hodge projection removes velocity divergence', () => {
  const fluid = new CpuStableFluid(64, 48);
  fluid.splat(0.5, 0.5, 18.0, -12.0, [1, 0.5, 0], 0.08);
  const divBefore = fluid.maxDivergence();
  assert.ok(divBefore > 0.5);

  fluid.project(35);
  const divAfter = fluid.maxDivergence();
  assert.ok(
    divAfter < divBefore * 0.1,
    `Expected Poisson projection to reduce divergence by >90% (before=${divBefore}, after=${divAfter})`
  );
});

test('Khmer Pinpeat 7-TET & Karplus–Strong / Roneat physical synthesis accuracy', () => {
  const freqs = computeScaleFrequencies('pinpeat', 277.18);
  assert.equal(freqs.length, 8);
  // Index 6 in [0, 1, 2, 4, 5, 6, 7, 8] is 7/7 octave -> exact 2x root frequency
  assert.ok(Math.abs(freqs[6] / freqs[0] - 2.0) < 1e-12, '7-TET octave degree must equal 2.0x root');
  // Step 1/7 ratio check
  assert.ok(Math.abs(freqs[1] / freqs[0] - Math.pow(2, 1 / 7)) < 1e-12);

  for (const timbre of ['roneat', 'string']) {
    const buf = synthesizePhysicalWave({
      sampleRate: 44100,
      frequency: 330,
      duration: 0.8,
      timbre,
      velocity: 0.85
    });
    assert.equal(buf.length, Math.floor(44100 * 0.8));

    // Verify finite bounded signal and physical energy decay from start to tail
    let earlyRms = 0;
    let lateRms = 0;
    const window = 4000;
    for (let i = 0; i < window; i++) {
      assert.ok(Number.isFinite(buf[i]) && Math.abs(buf[i]) <= 1.5);
      earlyRms += buf[i + 200] ** 2;
      lateRms += buf[buf.length - 1 - i] ** 2;
    }
    assert.ok(earlyRms > 1e-4, `${timbre} must produce audible initial energy`);
    assert.ok(lateRms < earlyRms * 0.35, `${timbre} must physically decay over time`);
  }
});

test('Bilingual dictionary parity between Khmer (km) and English (en)', () => {
  const kmKeys = Object.keys(TRANSLATIONS.km).sort();
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  assert.deepEqual(kmKeys, enKeys, 'Khmer and English translation keys must match 1-to-1');
  for (const k of kmKeys) {
    assert.ok(TRANSLATIONS.km[k].trim().length > 0, `Empty Khmer translation for ${k}`);
    assert.ok(TRANSLATIONS.en[k].trim().length > 0, `Empty English translation for ${k}`);
  }
});
