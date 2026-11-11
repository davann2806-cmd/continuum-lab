/**
 * Bilingual Dictionary — Khmer (ភាសាខ្មែរ) & English
 * Carefully crafted scientific, mathematical, and Khmer acoustic terminology.
 */

export const TRANSLATIONS = {
  km: {
    appTitle: 'CONTINUUM',
    appSubtitle: 'មន្ទីរពិសោធន៍រូបវិទ្យាគណនា និងសំឡេងរូបវិទ្យាពេលវេលាពិត',
    langSwitchLabel: 'English',
    audioOff: 'បើកសំឡេង',
    audioOn: 'សំឡេងកំពុងដំណើរការ',
    pause: 'ផ្អាក',
    resume: 'បន្តដំណើរការ',
    reset: 'កំណត់ឡើងវិញ',
    stepOnce: '១ ជំហាន',

    // Modes
    modeFluid: 'ឌីណាមិកសន្ទនីយ៍',
    modeFluidSub: 'WebGL2 Navier–Stokes',
    modeWave: 'រលក និងអុបទិក',
    modeWaveSub: '2D FDTD អាំងទែផេរ៉ង់',
    modeNBody: 'មេកានិចតារាវិទ្យា',
    modeNBodySub: 'Yoshida លំដាប់ទី ៤',

    // Section headers
    secPresets: 'ការពិសោធន៍គំរូ',
    secParameters: 'ប៉ារ៉ាម៉ែត្ររូបវិទ្យា',
    secTools: 'ឧបករណ៍អន្តរកម្ម',
    secTelemetry: 'ទិន្នន័យរូបវិទ្យាផ្ទាល់',
    secAcoustics: 'សំយោគសំឡេងរូបវិទ្យា (Karplus–Strong)',
    secEquation: 'សមីការគ្រប់គ្រង',

    // Fluid Presets & Controls
    presetKarman: 'ផ្លូវកួច Kármán (ស៊ីឡាំងខ្យល់)',
    presetJets: 'ចរន្តបាញ់បញ្ច្រាសគ្នា',
    presetCalm: 'ផ្ទៃសន្ទនីយ៍សេរី',
    fluidVisLabel: 'របៀបបង្ហាញ',
    fluidVisDye: 'ពណ៌សន្ទនីយ៍',
    fluidVisCurl: 'ដែនកួច (Vorticity)',
    fluidVisSchlieren: 'អុបទិក Schlieren',
    fluidVorticity: 'កម្លាំងរក្សាកួច (Vorticity)',
    fluidDissipation: 'អត្រារលាយពណ៌',
    fluidIterations: 'ជំហានសម្ពាធ Poisson',
    fluidHint: 'អូសលើផ្ទៃដើម្បីបង្កើតលំហូរ ឬចាប់ទាញឧបសគ្គរង្វង់នៅក្នុងផ្លូវខ្យល់។',

    // Wave Presets & Controls
    presetDoubleSlit: 'រន្ធភ្លោះរបស់ Young',
    presetLens: 'កែវបង្រួមពន្លឺ (ចំណាំងបែរ)',
    presetEllipse: 'បន្ទប់អេលីបផ្តោតរលក',
    waveToolPluck: 'បង្កើតរលក',
    waveToolWall: 'គូសជញ្ជាំង',
    waveToolLens: 'គូសកែវចំណាំងបែរ',
    waveToolErase: 'លុបឧបសគ្គ',
    waveFreq: 'ប្រេកង់ប្រភពរលក',
    waveSpeed: 'ល្បឿនរលកមជ្ឈដ្ឋាន',
    waveEmitterToggle: 'បើកប្រភពរលកអចិន្ត្រៃយ៍',
    waveDetectorTitle: 'អាំងតង់ស៊ីតេអាំងទែផេរ៉ង់ I(y)',
    waveHint: 'ចុច ឬអូសដើម្បីបង្កើតរលក គូសជញ្ជាំង ឬកែវអុបទិក និងសង្កេតលំនាំអាំងទែផេរ៉ង់នៅខាងស្តាំ។',

    // N-Body Presets & Controls
    presetFigure8: 'គន្លងលេខ ៨ (អង្គធាតុទាំង ៣)',
    presetTrojans: 'ចំណុចលំនឹង Lagrange L4/L5',
    presetBinary: 'ប្រព័ន្ធផ្កាយភ្លោះ និងភព',
    presetGalaxy: 'ការប៉ះទង្គិចកាឡាក់ស៊ីគូ',
    nbodyDt: 'ល្បឿនពេលវេលា (Δt)',
    nbodyTrail: 'ប្រវែងគន្លងតារាវិថី',
    nbodySoftening: 'កម្រិតបន្ទន់ទំនាញ (ε)',
    nbodySlingshotMass: 'ម៉ាសភពបាញ់បញ្ចូលថ្មី',
    nbodyHint: 'ចុច ហើយទាញដូចខ្សែធ្នូ ដើម្បីគណនាគន្លងទុកជាមុន និងបាញ់បញ្ចូលភពថ្មីទៅក្នុងប្រព័ន្ធទំនាញ។',

    // Acoustics Controls
    scaleLabel: 'ប្រព័ន្ធសំឡេង',
    scalePinpeat: 'ពិណពាទ្យខ្មែរ (7-TET)',
    scaleJust: 'សមាមាត្រសុទ្ធ (Just)',
    scale12tet: 'សากล (12-TET)',
    timbreLabel: 'លក្ខណៈសំឡេង',
    timbreRoneat: 'រនាតឯក (ឈើរឹង Modal)',
    timbreString: 'ខ្សែសំឡេង (Waveguide)',
    couplingLabel: 'ភ្ជាប់រូបវិទ្យាទៅសំឡេង',
    resonatorHint: 'ចុចលើផ្លែរនាត ឬប្រើក្តារចុចលេខ 1–8 ដើម្បីប្រគំសំឡេងសំយោគផ្ទាល់ពីសមីការរលក',

    // Telemetry labels
    telFps: 'ល្បឿនគណនា (FPS)',
    telBackend: 'ម៉ាស៊ីនគណនា',
    telGridOrBodies: 'ទំហំប្រព័ន្ធ',
    telMetric1Fluid: 'ថាមពលស៊ីនេទិចមធ្យម',
    telMetric2Fluid: 'អាំងតង់ស៊ីតេកួចអតិបរមា',
    telMetric1Wave: 'ថាមពលរលកសរុប',
    telMetric2Wave: 'សញ្ញាឧបករណ៍ស្ទង់សំឡេង',
    telMetric1NBody: 'ថាមពលសរុប H = T + V',
    telMetric2NBody: 'កំហុសថាមពល |ΔH/H₀|'
  },

  en: {
    appTitle: 'CONTINUUM',
    appSubtitle: 'Real-Time Computational Physics & Physical-Modeling Acoustics Studio',
    langSwitchLabel: 'ភាសាខ្មែរ',
    audioOff: 'Enable Audio',
    audioOn: 'Audio Active',
    pause: 'Pause',
    resume: 'Resume',
    reset: 'Reset',
    stepOnce: 'Step',

    // Modes
    modeFluid: 'Fluid Dynamics',
    modeFluidSub: 'WebGL2 Navier–Stokes',
    modeWave: 'Wave Optics',
    modeWaveSub: '2D FDTD Interference',
    modeNBody: 'Orbital Mechanics',
    modeNBodySub: '4th-Order Yoshida',

    // Section headers
    secPresets: 'Experiment Presets',
    secParameters: 'Solver Parameters',
    secTools: 'Interactive Tools',
    secTelemetry: 'Live Solver Telemetry',
    secAcoustics: 'Physical-Modeling Synth (Karplus–Strong)',
    secEquation: 'Governing Equations',

    // Fluid Presets & Controls
    presetKarman: 'Kármán Vortex Street',
    presetJets: 'Opposing Shear Jets',
    presetCalm: 'Free Turbulent Tank',
    fluidVisLabel: 'Field View',
    fluidVisDye: 'Tracer Ink',
    fluidVisCurl: 'Vorticity (∇×u)',
    fluidVisSchlieren: 'Schlieren |∇ρ|',
    fluidVorticity: 'Vorticity Confinement',
    fluidDissipation: 'Dye Dissipation',
    fluidIterations: 'Poisson Jacobi Steps',
    fluidHint: 'Drag across the fluid to inject momentum, or grab and move the solid cylinder obstacle.',

    // Wave Presets & Controls
    presetDoubleSlit: 'Young’s Double-Slit',
    presetLens: 'Biconvex Optical Lens',
    presetEllipse: 'Elliptical Whispering Cavity',
    waveToolPluck: 'Emit Wave',
    waveToolWall: 'Sculpt Barrier',
    waveToolLens: 'Sculpt Glass Lens',
    waveToolErase: 'Erase Medium',
    waveFreq: 'Source Frequency',
    waveSpeed: 'Propagation Speed c₀',
    waveEmitterToggle: 'Continuous Coherent Source',
    waveDetectorTitle: 'Screen Fringe Intensity I(y)',
    waveHint: 'Click or drag to excite ripples, draw barriers or refractive lenses, and inspect live screen fringes.',

    // N-Body Presets & Controls
    presetFigure8: 'Figure-8 Three-Body',
    presetTrojans: 'Lagrange L4/L5 Trojans',
    presetBinary: 'Circumbinary System',
    presetGalaxy: 'Twin Spiral Merger',
    nbodyDt: 'Integration Step (Δt)',
    nbodyTrail: 'Orbital Trail Persistence',
    nbodySoftening: 'Gravity Softening (ε)',
    nbodySlingshotMass: 'Launch Body Mass',
    nbodyHint: 'Click and pull back like a slingshot to preview the predicted orbit and launch a new gravitating body.',

    // Acoustics Controls
    scaleLabel: 'Tuning Scale',
    scalePinpeat: 'Khmer Pinpeat (7-TET)',
    scaleJust: 'Pure Just Intonation',
    scale12tet: '12-TET Concert',
    timbreLabel: 'Resonator Model',
    timbreRoneat: 'Roneat Ek (Modal Bar)',
    timbreString: 'Waveguide String',
    couplingLabel: 'Couple Physics → Sound',
    resonatorHint: 'Click bars or press keys 1–8 to excite real-time Karplus–Strong & modal resonators',

    // Telemetry labels
    telFps: 'Solver Rate (FPS)',
    telBackend: 'Compute Backend',
    telGridOrBodies: 'Domain Resolution',
    telMetric1Fluid: 'Mean Kinetic Energy',
    telMetric2Fluid: 'Peak Vorticity |ω|',
    telMetric1Wave: 'Integrated Wave Energy',
    telMetric2Wave: 'Hydrophone Probe u(t)',
    telMetric1NBody: 'Hamiltonian H = T + V',
    telMetric2NBody: 'Energy Drift |ΔH/H₀|'
  }
};

export const EQUATIONS = {
  fluid: '∂u/∂t + (u·∇)u = −∇p + ν∇²u + f_conf,   ∇·u = 0',
  wave: '∂²u/∂t² = c²(x,y) ∇²u − γ ∂u/∂t',
  nbody: 'd²rᵢ/dt² = G ∑ⱼ≠ᵢ mⱼ (rⱼ − rᵢ) / (|rⱼ − rᵢ|² + ε²)^(3/2)'
};
