// Dichroic Beams — v1 skeleton
// - Full-frame drifting beams
// - Angle + interference-based dichroic color
// - Keyboard controls for density, velocity, scale, breath, chrome, presets
// - Seeded for reproducibility

let beams = [];
let params;
let colorSets = {};
let presets = {};

let time = 0;
let breath = 0;
let currentSeed = 12345;
let paused = false;
let showHUD = true;

// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSL, 360, 100, 100, 100);
  noStroke();

  initColorSets();
  initParamsAndPresets();

  // Try to pull a seed from URL (?seed=12345), else use default
  const seedFromURL = getSeedFromURL();
  if (seedFromURL !== null) {
    currentSeed = seedFromURL;
  }

  reseed(currentSeed);
}

// ------------------------------------------------------------
// Draw loop
// ------------------------------------------------------------

function draw() {
  if (!paused) {
    const dt = deltaTime / 1000.0;
    const motionBase = 0.5 + params.velocity;
    time += dt * motionBase;

    const omega = TWO_PI / params.breathPeriod;
    breath = sin(time * omega) * 0.5 + 0.5; // 0..1
  }

  // Trails background — low lightness, partial alpha
  background(0, 0, params.backgroundLuminance, params.trailAlpha);

  // Draw beams
  for (let i = 0; i < beams.length; i++) {
    drawBeam(beams[i]);
  }

  // Chrome / vignette overlay
  drawVignette(params.chromeVignette, breath);

  if (showHUD) {
    drawHUD();
  }
}

// ------------------------------------------------------------
// Initialization helpers
// ------------------------------------------------------------

function initColorSets() {
  // Approximate hue sets (H in 0..360)
  colorSets = {
    // 3M "Chill"-ish cool / gold-green-blue
    chillCool: [210, 300, 60],
    chillWarm: [45, 140, 210],

    // 3M "Blaze"-ish
    blazeCool: [190, 220, 300],
    blazeWarm: [0, 45],

    // Simple dichroic-ish pairs
    redPurple: [0, 290],
    blueGreen: [210, 140],
    amberTeal: [40, 180],

    // Generic spectrum-ish
    rainbow1: [0, 270],
    rainbow2: [60, 200]
  };
}

function initParamsAndPresets() {
  params = {
    density: 0.6, // 0..1
    maxBeams: 90,
    velocity: 0.5, // 0..1
    scale: 1.0, // ~0.3..1.5
    breathAmp: 0.5, // 0..1
    breathPeriod: 18.0, // seconds
    chromeVignette: 0.4, // 0..1
    activeColorSetName: 'chillCool',
    backgroundLuminance: 5, // HSL lightness
    trailAlpha: 20 // 0..100
  };

  presets = {
    chillCurtain: {
      seed: 12345,
      density: 0.7,
      velocity: 0.4,
      scale: 1.0,
      breathAmp: 0.5,
      chromeVignette: 0.35,
      colorSet: 'chillCool'
    },
    chillWarmVeil: {
      seed: 23456,
      density: 0.6,
      velocity: 0.3,
      scale: 1.2,
      breathAmp: 0.4,
      chromeVignette: 0.25,
      colorSet: 'chillWarm'
    },
    blazeCoolField: {
      seed: 34567,
      density: 0.8,
      velocity: 0.6,
      scale: 0.9,
      breathAmp: 0.6,
      chromeVignette: 0.45,
      colorSet: 'blazeCool'
    },
    blazeWarmField: {
      seed: 45678,
      density: 0.75,
      velocity: 0.5,
      scale: 1.1,
      breathAmp: 0.5,
      chromeVignette: 0.5,
      colorSet: 'blazeWarm'
    },
    redPurpleCross: {
      seed: 56789,
      density: 0.65,
      velocity: 0.45,
      scale: 1.1,
      breathAmp: 0.55,
      chromeVignette: 0.35,
      colorSet: 'redPurple'
    },
    blueGreenDrift: {
      seed: 67890,
      density: 0.55,
      velocity: 0.35,
      scale: 1.3,
      breathAmp: 0.45,
      chromeVignette: 0.3,
      colorSet: 'blueGreen'
    }
  };
}

// ------------------------------------------------------------
// Seeding & beams
// ------------------------------------------------------------

function reseed(seed) {
  currentSeed = seed;
  randomSeed(seed);
  noiseSeed(seed);

  const numBeams = floor(params.maxBeams * params.density);
  beams = [];

  const w = width;
  const h = height;

  for (let i = 0; i < numBeams; i++) {
    const bx = random(-w * 0.2, w * 1.2);
    const by = random(-h * 0.2, h * 1.2);
    const baseLen = random(w * 0.5, w * 1.4);
    const baseWidth = baseLen * random(0.015, 0.05);
    const angleBase = random(-PI, PI);

    const beam = {
      x: bx,
      y: by,
      length: baseLen,
      width: baseWidth,
      angleBase: angleBase,
      angleNoiseAmp: random(0.15, 0.45),
      posNoiseSeed: random(1000),
      rotNoiseSeed: random(1000),
      phase: random(TWO_PI),
      layer: random() // 0..1
    };

    beams.push(beam);
  }
}

function applyPreset(name) {
  const p = presets[name];
  if (!p) return;

  params.density = p.density;
  params.velocity = p.velocity;
  params.scale = p.scale;
  params.breathAmp = p.breathAmp;
  params.chromeVignette = p.chromeVignette;
  params.activeColorSetName = p.colorSet;

  reseed(p.seed);
}

// ------------------------------------------------------------
// Beam rendering
// ------------------------------------------------------------

function drawBeam(beam) {
  const motionFactor = 0.5 + params.velocity;

  // Noise-driven position
  const posT = time * 0.05 * motionFactor + beam.phase;
  const nx = noise(beam.posNoiseSeed, posT);
  const ny = noise(beam.posNoiseSeed + 100, posT);

  const driftRadius = 40 * params.scale;
  const dx = map(nx, 0, 1, -driftRadius, driftRadius);
  const dy = map(ny, 0, 1, -driftRadius, driftRadius);

  const px = beam.x + dx;
  const py = beam.y + dy;

  // Noise-driven rotation
  const rotT = time * 0.03 * motionFactor + beam.phase;
  const nr = noise(beam.rotNoiseSeed, rotT);
  const angle = beam.angleBase + (nr - 0.5) * 2 * beam.angleNoiseAmp;

  // Scale with breath
  const scaleFactor = params.scale * lerp(0.8, 1.2, breath * params.breathAmp);
  const len = beam.length * scaleFactor;
  const w = beam.width * scaleFactor;

  // Color sets / dichroic mapping
  const set = colorSets[params.activeColorSetName];
  if (!set || set.length === 0) return;

  // Angle-based step index
  let uAngle = (angle + PI) / TWO_PI; // 0..1
  uAngle = constrain(uAngle, 0, 0.999999);
  let idx = floor(uAngle * set.length);
  if (idx < 0) idx = 0;
  if (idx >= set.length) idx = set.length - 1;

  const hBase = set[idx];

  // Interference field at beam center
  const nField = noise(px * 0.0015, py * 0.0015, time * 0.05);
  const hNext = set[(idx + 1) % set.length];
  const blend = nField;

  const h = lerpHue(hBase, hNext, blend);
  const sat = lerp(40, 90, nField);
  const baseL = 55 + (beam.layer - 0.5) * 10;
  const l = baseL * lerp(0.7, 1.2, breath);

  fill(h, sat, l, 90);

  // Draw the beam
  push();
  translate(px, py);
  rotate(angle);
  rectMode(CENTER);
  rect(0, 0, len, w, w * 0.5);
  pop();
}

// ------------------------------------------------------------
// Vignette / chrome
// ------------------------------------------------------------

function drawVignette(strength, breathValue) {
  if (strength <= 0.001) return;

  const steps = 10;
  const baseAlpha = 50 * strength * (0.8 + 0.4 * breathValue); // slight breathing

  noStroke();
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const alpha = (baseAlpha * t) / steps;
    fill(0, 0, 0, alpha);

    const marginX = (width * 0.5) * t;
    const marginY = (height * 0.5) * t;
    rect(marginX, marginY, width - 2 * marginX, height - 2 * marginY);
  }
}

// ------------------------------------------------------------
// HUD
// ------------------------------------------------------------

function drawHUD() {
  const pad = 12;
  const lineH = 14;

  const hudText = [
    `seed: ${currentSeed}`,
    `preset: ${getPresetNameForCurrent() || 'custom'}`,
    `density (Q/W): ${params.density.toFixed(2)}`,
    `velocity (A/S): ${params.velocity.toFixed(2)}`,
    `scale (Z/X): ${params.scale.toFixed(2)}`,
    `breath (E/R): ${params.breathAmp.toFixed(2)}`,
    `chrome (D/F): ${params.chromeVignette.toFixed(2)}`,
    `color: ${params.activeColorSetName}`,
    `[SPACE] pause · [H] HUD · [C] clear · [N] new seed`,
    `[1–6] presets`
  ];

  const boxWidth = 280;
  const boxHeight = lineH * hudText.length + pad * 2;

  // Semi-transparent background
  fill(0, 0, 0, 50);
  noStroke();
  rect(pad, pad, boxWidth, boxHeight, 8);

  fill(0, 0, 90, 90);
  textAlign(LEFT, TOP);
  textSize(11);

  for (let i = 0; i < hudText.length; i++) {
    text(hudText[i], pad + 8, pad + 6 + i * lineH);
  }
}

function getPresetNameForCurrent() {
  const names = Object.keys(presets);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const p = presets[name];
    if (
      p.seed === currentSeed &&
      approxEqual(p.density, params.density) &&
      approxEqual(p.velocity, params.velocity) &&
      approxEqual(p.scale, params.scale) &&
      approxEqual(p.breathAmp, params.breathAmp) &&
      approxEqual(p.chromeVignette, params.chromeVignette) &&
      p.colorSet === params.activeColorSetName
    ) {
      return name;
    }
  }
  return null;
}

// ------------------------------------------------------------
// Key controls
// ------------------------------------------------------------

function keyPressed() {
  // Space: pause/unpause
  if (key === ' ') {
    paused = !paused;
    return;
  }

  switch (key) {
    // Density
    case 'Q':
      adjustDensity(-0.05);
      break;
    case 'W':
      adjustDensity(0.05);
      break;

    // Velocity
    case 'A':
      params.velocity = constrain(params.velocity - 0.05, 0.0, 1.0);
      break;
    case 'S':
      params.velocity = constrain(params.velocity + 0.05, 0.0, 1.0);
      break;

    // Scale
    case 'Z':
      params.scale = constrain(params.scale - 0.05, 0.3, 1.5);
      break;
    case 'X':
      params.scale = constrain(params.scale + 0.05, 0.3, 1.5);
      break;

    // Breath amplitude
    case 'E':
      params.breathAmp = constrain(params.breathAmp - 0.05, 0.0, 1.0);
      break;
    case 'R':
      params.breathAmp = constrain(params.breathAmp + 0.05, 0.0, 1.0);
      break;

    // Chrome / vignette
    case 'D':
      params.chromeVignette = constrain(params.chromeVignette - 0.05, 0.0, 1.0);
      break;
    case 'F':
      params.chromeVignette = constrain(params.chromeVignette + 0.05, 0.0, 1.0);
      break;

    // Presets
    case '1':
      applyPreset('chillCurtain');
      break;
    case '2':
      applyPreset('chillWarmVeil');
      break;
    case '3':
      applyPreset('blazeCoolField');
      break;
    case '4':
      applyPreset('blazeWarmField');
      break;
    case '5':
      applyPreset('redPurpleCross');
      break;
    case '6':
      applyPreset('blueGreenDrift');
      break;

    // HUD toggle
    case 'H':
      showHUD = !showHUD;
      break;

    // Clear trails
    case 'C':
      clearTrails();
      break;

    // New random seed
    case 'N':
      reseed(floor(random(1e9)));
      console.log('New seed:', currentSeed);
      break;
  }
}

// ------------------------------------------------------------
// Window resize
// ------------------------------------------------------------

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  reseed(currentSeed);
}

// ------------------------------------------------------------
// Utility functions
// ------------------------------------------------------------

function adjustDensity(delta) {
  params.density = constrain(params.density + delta, 0.1, 1.0);
  reseed(currentSeed);
}

function clearTrails() {
  // Full clear this frame
  background(0, 0, params.backgroundLuminance, 100);
}

// Circular hue lerp (degrees)
function lerpHue(a, b, t) {
  let delta = ((b - a + 540) % 360) - 180; // shortest path
  return (a + delta * t + 360) % 360;
}

// Approximate float equality
function approxEqual(a, b, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

// Try to extract ?seed=1234 from the URL; returns number or null
function getSeedFromURL() {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const seedParam = url.searchParams.get('seed');
    if (!seedParam) return null;
    const n = parseInt(seedParam, 10);
    if (Number.isNaN(n)) return null;
    return n;
  } catch (e) {
    return null;
  }
}
