# CONTINUUM LAB — មន្ទីរពិសោធន៍រូបវិទ្យាគណនា និងសំឡេងរូបវិទ្យាពេលវេលាពិត

**🌐 តំណភ្ជាប់សាកល្បងផ្ទាល់លើទូរសព្ទ និងកុំព្យូទ័រ (Live Public Web App):** [https://davann2806-cmd.github.io/continuum-lab/](https://davann2806-cmd.github.io/continuum-lab/)

**Continuum Lab** គឺជាកម្មវិធីពិសោធន៍រូបវិទ្យាគណនា និងសំយោគសំឡេងរូបវិទ្យាពេលវេលាពិត (Real-Time Computational Physics & Physical-Modeling Acoustics Studio) ដែលសរសេរឡើងពីមូលដ្ឋានគណិតវិទ្យាផ្ទាល់ **ដោយមិនប្រើប្រាស់ Library ខាងក្រៅសូម្បីតែមួយ (Zero External Dependencies)** ព្រមទាំងគាំទ្រទាំង **ភាសាខ្មែរ** និង **English**។

**Continuum Lab** is a zero-dependency real-time computational physics bench and physical-modeling musical synthesizer built from mathematical first principles using raw **WebGL2 GLSL floating-point shaders**, **isotropic 2D FDTD wave optics**, **4th-order Yoshida symplectic celestial mechanics**, and **WebAudio Karplus–Strong / Euler–Bernoulli modal synthesis** tuned to traditional **Khmer Pinpeat (ពិណពាទ្យខ្មែរ 7-TET)**, Just Intonation, and 12-TET scales.

---

## ម៉ាស៊ីនគណនាទាំង ៤ (Four Coupled Engines)

### 1. WebGL2 GPU Navier–Stokes Fluid Dynamics (`ឌីណាមិកសន្ទនីយ៍`)
Solves the 2D incompressible Euler / Navier–Stokes equations across 7 floating-point (`RGBA16F`) ping-pong framebuffer shader passes per frame:
- **Curl & Vorticity Confinement**: Preserves fine-scale turbulent eddies and Kelvin–Helmholtz shear roll-ups.
- **Helmholtz–Hodge Pressure Projection**: Solves the Poisson equation $\nabla^2 p = \nabla \cdot \mathbf{u}^*$ with homogeneous Neumann boundary conditions around a movable solid cylinder obstacle to produce genuine **von Kármán vortex streets (`ផ្លូវកួច Kármán`)**.
- **3 Optical Field Views**: Luminous Tracer Ink, Diverging Vorticity ($\nabla \times \mathbf{u}$), and Knife-Edge **Schlieren** ($|\nabla \rho|$) wind-tunnel photography mode.

### 2. 2D Isotropic FDTD Wave Optics & Interference (`រលក និងអុបទិក`)
Solves the damped 2D wave equation $\frac{\partial^2 u}{\partial t^2} = c^2(x,y)\nabla^2 u - \gamma \frac{\partial u}{\partial t}$ using a 9-point isotropic Laplacian stencil (eliminating grid-axis numerical dispersion) and quadratic sponge absorbing boundaries:
- **Young's Double-Slit Interference (`រន្ធភ្លោះរបស់ Young`)** with a live time-averaged fringe intensity detector $I(y) = \langle u^2(x_{\text{screen}}, y) \rangle$.
- **Biconvex Crown-Glass Lens (`កែវបង្រួមពន្លឺ`, $n = 1.66$)** demonstrating Snell's law wavefront refraction and focal convergence.
- **Elliptical Whispering Cavity (`បន្ទប់អេលីបផ្តោតរលក`)** focusing impulses from focus $F_1$ to conjugate focus $F_2$, monitored by a draggable **Hydrophone Probe**.

### 3. 4th-Order Yoshida Symplectic N-Body Mechanics (`មេកានិចតារាវិទ្យា`)
Integrates Newtonian $N$-body gravitation with Yoshida's 4th-order symplectic composition scheme, conserving Hamiltonian phase-space volume and energy $H = T + V$ to $|\Delta H / H_0| < 10^{-8}$:
- **Chenciner–Montgomery Figure-8 Three-Body Choreography (`គន្លងលេខ ៨ នៃអង្គធាតុទាំង ៣`)**
- **Lagrange $L_4 / L_5$ Trojan Asteroid Swarm (`ចំណុចលំនឹង Lagrange L4/L5`)**
- **Circumbinary Planetary System** & **Twin Spiral Galaxy Tidal Merger**
- **Interactive Slingshot Trajectory Predictor**: Pull back anywhere on the canvas to forward-integrate and visualize the curved orbital trajectory before launching a new body.

### 4. Physical-Modeling Acoustics (`សំយោគសំឡេងរូបវិទ្យា រនាតឯក និងខ្សែសំឡេង`)
Zero audio samples — every note is synthesized mathematically in real time:
- **Roneat Ek Modal Bar (`រនាតឯក`)**: Sums Euler–Bernoulli free-free hardwood beam eigenmodes ($1 : 2.756 : 5.404$) with mallet contact transients.
- **Karplus–Strong Digital Waveguide (`ខ្សែសំឡេង`)**: Fractional-delay all-pass waveguide string model.
- **Khmer Pinpeat 7-TET (`ពិណពាទ្យខ្មែរ`)**, **Pure Just Intonation**, and **12-TET** tuning, complete with a live waveform oscilloscope and delay-coordinate Lissajous phase portrait.

---

## ការដំណើរការ និងតេស្ត (Quick Start & Verification)

Requires **Node.js 18+** (zero `npm install` packages needed):

```bash
# Run mathematical solver & acoustics unit tests
npm test

# Start local server at http://localhost:4173
npm start

# Build self-contained single-file bundle (dist/index.html)
npm run build
```

## រចនាសម្ព័ន្ធកូដ (Project Structure)

```text
├── index.html                  # Semantic bilingual studio shell (Khmer & English)
├── styles/main.css             # Precision optical-instrument Vanilla CSS design system
├── src/
│   ├── main.js                 # Studio controller, pointer physics & telemetry
│   ├── i18n/translations.js    # Complete Khmer (km) & English (en) dictionary
│   └── engines/
│       ├── fluid.js            # WebGL2 RGBA16F Navier–Stokes + CPU SOR fallback
│       ├── wave.js             # 2D isotropic FDTD wave solver + fringe detector
│       ├── nbody.js            # 4th-order Yoshida symplectic N-body + orbit predictor
│       └── audio.js            # Roneat modal & Karplus–Strong WebAudio synthesizer
├── scripts/
│   ├── build.mjs               # Single-file HTML bundler + VM syntax check
│   └── serve.mjs               # Zero-dependency static HTTP server
└── tests/
    └── physics.test.mjs        # Automated mathematical & acoustic verification suite
```
