/**
 * Physical-Modeling Acoustic Engine
 * Synthesizes real-time sound from first principles (zero audio samples):
 * 1. Fractional-Delay Karplus–Strong Digital Waveguide ( Plucked String )
 * 2. Euler–Bernoulli Free-Bar Modal Resonator ( Khmer Roneat Ek Hardwood Mallet )
 * Supports Khmer Pinpeat 7-TET, Pure Just Intonation, and 12-TET tuning systems.
 */

export const SCALES = {
  // Traditional Cambodian Pinpeat equidistant 7-TET steps (171.43 cents per degree)
  pinpeat: {
    labelKm: 'ពិណពាទ្យខ្មែរ (7-TET)',
    labelEn: 'Khmer Pinpeat (7-TET)',
    noteLabels: ['១', '២', '៣', '៥', '៦', '៧', '១′', '២′'],
    ratios: [0, 1, 2, 4, 5, 6, 7, 8].map((deg) => Math.pow(2, deg / 7))
  },
  // Pure Ptolemaic / Harmonic Just Intonation ratios
  just: {
    labelKm: 'សមាមាត្រសុទ្ធ (Just)',
    labelEn: 'Pure Just Intonation',
    noteLabels: ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8', '2/1'],
    ratios: [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2]
  },
  // Western 12-Tone Equal Temperament pentatonic-extended concert voicing
  '12tet': {
    labelKm: 'សากล (12-TET)',
    labelEn: '12-TET Concert',
    noteLabels: ['C4', 'D4', 'E4', 'G4', 'A4', 'B4', 'C5', 'D5'],
    ratios: [0, 2, 4, 7, 9, 11, 12, 14].map((semi) => Math.pow(2, semi / 12))
  }
};

export function computeScaleFrequencies(scaleKey = 'pinpeat', rootHz = 277.18) {
  const scale = SCALES[scaleKey] || SCALES.pinpeat;
  return scale.ratios.map((r) => rootHz * r);
}

/**
 * Pure mathematical waveform synthesizer (runs identically in Node tests and WebAudio).
 */
export function synthesizePhysicalWave({
  sampleRate = 44100,
  frequency = 320,
  duration = 1.65,
  timbre = 'roneat',
  velocity = 0.8
}) {
  const length = Math.max(256, Math.floor(sampleRate * duration));
  const out = new Float32Array(length);
  const amp = Math.max(0.08, Math.min(1.0, velocity));

  if (timbre === 'roneat') {
    // Euler–Bernoulli free-free hardwood bar eigenmodes (1 : 2.756 : 5.404) + mallet strike
    const modes = [
      { ratio: 1.0, gain: 0.68, decay: 3.4 },
      { ratio: 2.0, gain: 0.14, decay: 6.2 },     // Arch-carved Roneat harmonic tuning overtone
      { ratio: 2.756, gain: 0.24, decay: 11.5 },  // 2nd Euler–Bernoulli beam mode
      { ratio: 5.404, gain: 0.09, decay: 24.0 }   // 3rd Euler–Bernoulli beam mode
    ];

    const twoPiOverSr = (2 * Math.PI) / sampleRate;
    for (let n = 0; n < length; n++) {
      const t = n / sampleRate;
      // Soft felt/hardwood mallet attack envelope (2.2 ms rise)
      const attack = 1 - Math.exp(-t * 950);
      let sample = 0;

      for (let m = 0; m < modes.length; m++) {
        const mode = modes[m];
        const f = frequency * mode.ratio;
        if (f >= sampleRate * 0.45) continue;
        sample += mode.gain * Math.sin(twoPiOverSr * f * n) * Math.exp(-t * mode.decay);
      }

      // Subtle wooden contact transient in first 5 ms
      if (t < 0.006) {
        const click = Math.sin(twoPiOverSr * frequency * 7.1 * n) * Math.exp(-t * 520) * 0.16;
        sample += click;
      }

      out[n] = sample * attack * amp * 0.58;
    }
    return out;
  }

  // Fractional-Delay Karplus–Strong Plucked String Digital Waveguide
  const exactDelay = sampleRate / Math.max(40, frequency);
  const delayInt = Math.max(2, Math.floor(exactDelay - 0.5));
  const frac = exactDelay - 0.5 - delayInt;
  const allpassCoeff = (1 - frac) / (1 + frac);

  const ring = new Float32Array(delayInt + 1);
  // Deterministic Warm Plucked-String Burst (filtered pseudo-random + fundamental half-sine)
  let seed = Math.floor(frequency * 1000) ^ 0x9e3779b9;
  let prevNoise = 0;
  for (let i = 0; i < delayInt; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    const smooth = 0.55 * white + 0.45 * prevNoise;
    prevNoise = smooth;
    const body = Math.sin((Math.PI * 2 * i) / delayInt) * 0.45;
    ring[i] = (smooth * 0.65 + body) * amp;
  }

  const loss = Math.min(0.9985, 0.9935 + Math.min(0.0045, velocity * 0.003));
  let ptr = 0;
  let prevOut = 0;
  let apPrevIn = 0;
  let apPrevOut = 0;

  for (let n = 0; n < length; n++) {
    const nextPtr = (ptr + 1) % delayInt;
    // Two-point linear averaging bridge low-pass filter
    const avg = 0.5 * (ring[ptr] + ring[nextPtr]) * loss;
    // First-order all-pass filter for exact fractional pitch tuning
    const apOut = allpassCoeff * (avg - apPrevOut) + apPrevIn;
    apPrevIn = avg;
    apPrevOut = apOut;

    ring[ptr] = apOut;
    ptr = nextPtr;

    // Gentle DC blocker
    const y = apOut - prevOut * 0.02;
    prevOut = apOut;
    out[n] = y * 0.62;
  }

  return out;
}

export class AcousticStudio {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.masterGain = null;
    this.enabled = false;
    this.coupled = true;
    this.scale = 'pinpeat';
    this.timbre = 'roneat';
    this.rootHz = 277.18; // C#4 / traditional Pinpeat Roneat reference pitch
    this.lastPhysicsTriggerMs = 0;
    this.activeBarCallbacks = [];
    this._waveBuf = new Float32Array(256);
  }

  onBarTriggered(fn) {
    this.activeBarCallbacks.push(fn);
  }

  async toggleAudio(forceState) {
    const target = forceState !== undefined ? forceState : !this.enabled;
    if (target) {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
          this.compressor = this.ctx.createDynamicsCompressor();
          this.compressor.threshold.value = -14;
          this.compressor.ratio.value = 4;

          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.value = 0.72;

          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 512;
          this._waveBuf = new Float32Array(this.analyser.fftSize);

          // Warm stereo algorithmic ambience delay network
          const delayL = this.ctx.createDelay();
          const delayR = this.ctx.createDelay();
          delayL.delayTime.value = 0.11;
          delayR.delayTime.value = 0.165;
          const fbGain = this.ctx.createGain();
          fbGain.gain.value = 0.22;
          const wetGain = this.ctx.createGain();
          wetGain.gain.value = 0.24;

          this.masterGain.connect(this.compressor);
          this.masterGain.connect(delayL);
          delayL.connect(delayR);
          delayR.connect(fbGain);
          fbGain.connect(delayL);
          delayR.connect(wetGain);
          wetGain.connect(this.compressor);

          this.compressor.connect(this.analyser);
          this.analyser.connect(this.ctx.destination);
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.enabled = Boolean(this.ctx);
      if (this.enabled) {
        // Play a gentle welcoming two-note Pinpeat fifth interval
        this.playBar(0, 0.55);
        setTimeout(() => this.playBar(3, 0.5), 110);
      }
    } else {
      this.enabled = false;
    }
    return this.enabled;
  }

  playBar(index, velocity = 0.8) {
    const freqs = computeScaleFrequencies(this.scale, this.rootHz);
    const clampedIdx = ((index % freqs.length) + freqs.length) % freqs.length;
    const freq = freqs[clampedIdx];

    for (const cb of this.activeBarCallbacks) {
      cb(clampedIdx, velocity);
    }

    if (!this.enabled || !this.ctx) return;

    const sr = this.ctx.sampleRate;
    const samples = synthesizePhysicalWave({
      sampleRate: sr,
      frequency: freq,
      duration: this.timbre === 'roneat' ? 1.4 : 1.85,
      timbre: this.timbre,
      velocity
    });

    const audioBuffer = this.ctx.createBuffer(1, samples.length, sr);
    audioBuffer.copyToChannel(samples, 0);

    const src = this.ctx.createBufferSource();
    src.buffer = audioBuffer;

    // Subtle stereo pan across the 8 resonator bars
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = ((clampedIdx / 7) * 2 - 1) * 0.55;
      src.connect(panner);
      panner.connect(this.masterGain);
    } else {
      src.connect(this.masterGain);
    }

    src.start();
  }

  triggerFromPhysics(intensity = 0.5, pitchNorm = 0.5, minIntervalMs = 115) {
    if (!this.enabled || !this.coupled) return;
    const now = performance.now();
    if (now - this.lastPhysicsTriggerMs < minIntervalMs) return;
    this.lastPhysicsTriggerMs = now;

    const barIndex = Math.max(0, Math.min(7, Math.floor(pitchNorm * 8)));
    const vel = Math.max(0.18, Math.min(0.75, intensity));
    this.playBar(barIndex, vel);
  }

  renderOscilloscope(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0c1015';
    ctx.fillRect(0, 0, w, h);

    // Center zero-crossing hairline
    ctx.strokeStyle = 'rgba(244, 241, 234, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w * 0.72, h * 0.5);
    ctx.moveTo(w * 0.74, 6);
    ctx.lineTo(w * 0.74, h - 6);
    ctx.stroke();

    if (this.enabled && this.analyser) {
      this.analyser.getFloatTimeDomainData(this._waveBuf);
    } else {
      this._waveBuf.fill(0);
    }

    // Left 72%: Time-domain waveform u(t)
    const waveW = w * 0.71;
    ctx.beginPath();
    const len = this._waveBuf.length;
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * waveW;
      const y = h * 0.5 - this._waveBuf[i] * h * 0.42;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = this.enabled ? '#f59e0b' : 'rgba(244, 241, 234, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Right 26%: Delay-coordinate Lissajous Phase Portrait (u(t) vs u(t - τ))
    const cx = w * 0.87;
    const cy = h * 0.5;
    const scale = Math.min(w * 0.11, h * 0.40);
    const tau = 14;
    ctx.beginPath();
    for (let i = tau; i < len; i++) {
      const x = cx + this._waveBuf[i] * scale * 1.6;
      const y = cy - this._waveBuf[i - tau] * scale * 1.6;
      if (i === tau) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = this.enabled ? '#22d3ee' : 'rgba(34, 211, 238, 0.18)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }
}
