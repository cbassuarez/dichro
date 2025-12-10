// Dichroic Light Pane — v2
// Turrell-style luminous pane with dichroic beams, depth, and bloom.
// Controls (default mapping):
//   1–4         : Set target energy (low → high)
//   [ and ]     : Nudge energy ±0.1
//   C           : Cycle color modes
//   R           : New random seed / arrangement
//   SPACE       : Pause/unpause animation
//   H           : Toggle HUD
//   Mouse drag  : When mouseY is in top 15% of screen, X controls energy [0..1]

let paneLayer;
let bloomLayer;

const MAX_BEAMS = 64;
let beams = [];

let params = {
  energy: 0.4,
  targetEnergy: 0.4,
  breath: 0.0,
  breathPeriod: 18.0,   // seconds per breath
  speedBase: 0.75,      // base temporal speed
  depthScale: 1.6,      // perspective strength
  bloomBlur: 18,        // px blur for bloom overlay
  bloomStrength: 0.9,   // 0..1
  vignetteStrength: 0.5 // 0..1
};

let time = 0;
let currentSeed = 12345;
let paused = false;
let showHUD = true;

let colorModes = {};
let activeModeName = 'turrellAmber';
let modeOrder = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  colorMode(HSL, 360, 100, 100, 1);

  initColorModes();
  createPaneLayers();
  reseed(currentSeed);
}

function draw() {
  if (!paused) {
    const dt = deltaTime / 1000.0;

    // Smoothly approach target energy
    const energyEase = 0.08;
    params.energy += (params.targetEnergy - params.energy) * energyEase;
    params.energy = constrain(params.energy, 0, 1);

    // Time & breath
    const speed = params.speedBase * (0.4 + 0.6 * params.energy);
    time += dt * speed;

    const omega = TWO_PI / params.breathPeriod;
    params.breath = sin(time * omega) * 0.5 + 0.5; // 0..1
  }

  // Update and render into layers
  paneLayer.clear();
  bloomLayer.clear();

  drawPaneBackground(paneLayer);

  const activeCount = floor(map(params.energy, 0, 1, 10, MAX_BEAMS));
  for (let i = 0; i < activeCount; i++) {
    const beam = beams[i];
    const geom = updateBeamAndProject(beam);

    drawBeamOnLayer(paneLayer, beam, geom, false);
    drawBeamOnLayer(bloomLayer, beam, geom, true);
  }

  // Composite layers to main canvas
  compositeLayers();

  // Vignette / chrome collapse
  drawVignette(params.vignetteStrength, params.breath);

  if (showHUD) {
    drawHUD();
  }
}

// ------------------------------------------------------------
// Initialization
// ------------------------------------------------------------

function createPaneLayers() {
  paneLayer = createGraphics(width, height);
  paneLayer.colorMode(HSL, 360, 100, 100, 1);

  bloomLayer = createGraphics(width, height);
  bloomLayer.colorMode(HSL, 360, 100, 100, 1);
}

function initColorModes() {
  // H, S, L are all 0..360 / 0..100 / 0..100

  colorModes = {
    // Amber core, magenta/blue edges; Turrell-ish
    turrellAmber: {
      paneCore: { h: 35, s: 80, l: 55 },
      paneEdge: { h: 290, s: 35, l: 8 },
      pairs: [
        [35, 310],  // amber ↔ magenta
        [20, 280],  // warm amber ↔ violet
        [45, 220]   // gold ↔ blue
      ]
    },

    // Blue core, violet/green edges
    turrellBlue: {
      paneCore: { h: 205, s: 75, l: 55 },
      paneEdge: { h: 300, s: 40, l: 8 },
      pairs: [
        [200, 280], // cyan/blue ↔ violet
        [190, 330], // teal ↔ magenta
        [210, 140]  // blue ↔ green
      ]
    },

    // 3M Chill-inspired (cool transmission, gold/green/blue reflection)
    filmChill: {
      paneCore: { h: 210, s: 70, l: 55 },
      paneEdge: { h: 45, s: 60, l: 12 },
      pairs: [
        [210, 60],  // blue ↔ yellow
        [300, 45],  // magenta ↔ gold
        [140, 210]  // green ↔ blue
      ]
    },

    // 3M Blaze-inspired (cyan/blue/magenta vs red/gold)
    filmBlaze: {
      paneCore: { h: 300, s: 75, l: 55 },
      paneEdge: { h: 15, s: 70, l: 10 },
      pairs: [
        [190, 0],   // cyan ↔ red
        [220, 45],  // blue ↔ gold
        [300, 15]   // magenta ↔ warm red
      ]
    }
  };

  modeOrder = Object.keys(colorModes);
  activeModeName = modeOrder[0];
}

function reseed(seed) {
  currentSeed = seed;
  randomSeed(seed);
  noiseSeed(seed);

  beams = [];

  const mode = colorModes[activeModeName];
  const w = width;
  const h = height;

  // World coordinates are centered around (0,0) for easy projection
  const rangeX = w * 0.4;
  const rangeY = h * 0.4;

  for (let i = 0; i < MAX_BEAMS; i++) {
    const dirBase = random(-PI / 10, PI / 10); // almost-vertical beams

    const lengthBase = random(h * 0.9, h * 1.6);
    const widthBase = random(10, 42);

    const slideRadius = random(h * 0.05, h * 0.18);
    const slideSpeed = random(0.15, 0.5);

    const z0 = random(); // 0..1, near ←→ far
    const zAmp = random(0.05, 0.22);
    const zSpeed = random(0.08, 0.3);

    const rotAmp = random(radians(3), radians(10));
    const rotSpeed = random(0.06, 0.25);

    const x0 = random(-rangeX, rangeX);
    const y0 = random(-rangeY, rangeY);

    const pairIndex = floor(random(mode.pairs.length));
    const noiseSeedLocal = random(1000);

    beams.push({
      x0,
      y0,
      z0,
      dirAngle: dirBase,
      lengthBase,
      widthBase,
      slideRadius,
      slideSpeed,
      zAmp,
      zSpeed,
      rotAmp,
      rotSpeed,
      phase: random(TWO_PI),
      zPhase: random(TWO_PI),
      rotPhase: random(TWO_PI),
      pairIndex,
      noiseSeed: noiseSeedLocal
    });
  }
}

// ------------------------------------------------------------
// Scene and layers
// ------------------------------------------------------------

function drawPaneBackground(pg) {
  const mode = colorModes[activeModeName];
  const core = mode.paneCore;
  const edge = mode.paneEdge;

  const ctx = pg.drawingContext;
  const w = pg.width;
  const h = pg.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(w, h) * 0.7;

  const brightnessBoost = 0.7 + 0.3 * params.energy;

  const grad = ctx.createRadialGradient(
    cx, cy, radius * 0.1,
    cx, cy, radius
  );

  grad.addColorStop(
    0,
    hslToCSS(core.h, core.s, core.l * brightnessBoost, 1.0)
  );
  grad.addColorStop(
    1,
    hslToCSS(edge.h, edge.s, edge.l, 1.0)
  );

  ctx.save();
  ctx.fillStyle = grad;

  // Gentle breathing scale for the whole pane
  const s = 1.0 + (params.breath - 0.5) * 0.04; // ±4%
  ctx.translate(cx, cy);
  ctx.scale(1.0, s);
  ctx.translate(-cx, -cy);

  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function updateBeamAndProject(beam) {
  const t = time;
  const motionEnergy = 0.5 + 0.7 * params.energy;

  // Slide along direction
  const slidePhase = t * beam.slideSpeed * motionEnergy + beam.phase;
  const slide = sin(slidePhase) * beam.slideRadius;
  const dxSlide = cos(beam.dirAngle) * slide;
  const dySlide = sin(beam.dirAngle) * slide;

  // Depth oscillation
  const zPhase = t * beam.zSpeed * motionEnergy + beam.zPhase;
  const zOffset = sin(zPhase) * beam.zAmp;
  const z = constrain(beam.z0 + zOffset, 0.0, 1.0);

  // Rotation oscillation
  const rotPhase = t * beam.rotSpeed * motionEnergy + beam.rotPhase;
  const angle = beam.dirAngle + sin(rotPhase) * beam.rotAmp;

  // World position (0,0 at pane center)
  const worldX = beam.x0 + dxSlide;
  const worldY = beam.y0 + dySlide;

  // Perspective projection
  const depthScale = params.depthScale;
  const persp = 1.0 + z * depthScale;
  const px = worldX / persp;
  const py = worldY / persp;

  // Length & thickness scale with depth and energy
  const energyScale = 0.7 + 0.6 * params.energy;
  const length = beam.lengthBase / persp * energyScale;
  const thickness = beam.widthBase / persp * (0.8 + 0.7 * params.energy);

  return {
    px,
    py,
    angle,
    z,
    length,
    thickness
  };
}

function drawBeamOnLayer(pg, beam, geom, isBloom) {
  const { px, py, angle, z, length, thickness } = geom;
  const mode = colorModes[activeModeName];

  pg.push();
  pg.translate(pg.width / 2, pg.height / 2);
  pg.translate(px, py);
  pg.rotate(angle);

  const ctx = pg.drawingContext;
  ctx.save();

  if (isBloom) {
    // Soft, thicker shape in bloom layer
    const colorForBloom = computeBeamCoreColor(beam, z, mode);
    ctx.fillStyle = hslToCSS(
      colorForBloom.h,
      colorForBloom.s,
      colorForBloom.l,
      0.55 + 0.35 * params.energy
    );

    const len = length * 1.15;
    const w = thickness * 1.6;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-len / 2, -w / 2, len, w, w * 0.55);
    } else {
      ctx.rect(-len / 2, -w / 2, len, w);
    }
    ctx.fill();
  } else {
    // Crisp gradient beam in pane layer
    const grad = createBeamGradient(ctx, beam, z, mode, thickness);
    ctx.fillStyle = grad;

    const len = length;
    const w = thickness;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-len / 2, -w / 2, len, w, w * 0.55);
    } else {
      ctx.rect(-len / 2, -w / 2, len, w);
    }
    ctx.fill();
  }

  ctx.restore();
  pg.pop();
}

function createBeamGradient(ctx, beam, z, mode, thickness) {
  const pairs = mode.pairs;
  const pair = pairs[beam.pairIndex % pairs.length];
  const [h1, h2] = pair;

  const n = noise(beam.noiseSeed, time * 0.12);
  const depthFactor = z;

  // Hue progression across width
  const hEdge1 = lerpHue(h1, h2, 0.10 + 0.10 * n);
  const hCore = lerpHue(
    h1,
    h2,
    0.5 +
      (depthFactor - 0.5) * 0.25 + // deeper beams shift toward one end
      (n - 0.5) * 0.18            // interference shimmer
  );
  const hEdge2 = lerpHue(h1, h2, 0.90 - 0.10 * n);

  const energy = params.energy;
  const satCore = 60 + 25 * energy;
  const satEdge = 45 + 12 * energy;

  const baseL = map(1 - depthFactor, 0, 1, 32, 72);
  const lCore = baseL * (0.9 + 0.35 * energy);
  const lEdge = baseL * 0.82;

  const halfW = thickness / 2;
  const grad = ctx.createLinearGradient(0, -halfW, 0, halfW);

  // Edges are more transparent so center feels luminous.
  grad.addColorStop(
    0.0,
    hslToCSS(hEdge1, satEdge, lEdge, 0.0 + 0.45 * energy)
  );
  grad.addColorStop(
    0.18,
    hslToCSS(hEdge1, satCore * 0.95, lCore * 0.9, 0.6 + 0.3 * energy)
  );
  grad.addColorStop(
    0.5,
    hslToCSS(hCore, satCore, lCore, 1.0)
  );
  grad.addColorStop(
    0.82,
    hslToCSS(hEdge2, satCore * 0.95, lCore * 0.9, 0.6 + 0.3 * energy)
  );
  grad.addColorStop(
    1.0,
    hslToCSS(hEdge2, satEdge, lEdge, 0.0 + 0.45 * energy)
  );

  return grad;
}

function computeBeamCoreColor(beam, z, mode) {
  const pairs = mode.pairs;
  const pair = pairs[beam.pairIndex % pairs.length];
  const [h1, h2] = pair;

  const depthFactor = z;
  const n = noise(beam.noiseSeed + 57.3, time * 0.11);

  const hue = lerpHue(
    h1,
    h2,
    0.5 +
      (depthFactor - 0.5) * 0.3 +
      (n - 0.5) * 0.2
  );

  const energy = params.energy;
  const sat = 65 + 25 * energy;
  const baseL = map(1 - depthFactor, 0, 1, 40, 78);
  const l = baseL * (0.9 + 0.35 * energy);

  return { h: hue, s: sat, l };
}

function compositeLayers() {
  // Base clear
  clear();

  // Pane layer (crisp beams + pane background)
  image(paneLayer, 0, 0, width, height);

  // Bloom layer (blurred overlay, additive/screen)
  push();
  const ctx = drawingContext;
  ctx.save();

  ctx.globalCompositeOperation = 'screen';
  ctx.filter = `blur(${params.bloomBlur}px)`;
  ctx.globalAlpha = params.bloomStrength;

  image(bloomLayer, 0, 0, width, height);

  // Reset
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;

  ctx.restore();
  pop();
}

// ------------------------------------------------------------
// Vignette / chrome
// ------------------------------------------------------------

function drawVignette(strength, breathValue) {
  if (strength <= 0.001) return;

  const steps = 10;
  const baseAlpha = 0.8 * strength * (0.8 + 0.4 * breathValue);

  noStroke();
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const alpha = (baseAlpha * t) / steps;

    fill(0, 0, 0, alpha);

    const marginX = (width * 0.50) * t;
    const marginY = (height * 0.50) * t;

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
    `mode: ${activeModeName}`,
    `seed: ${currentSeed}`,
    `energy (1–4, [ ]): ${params.energy.toFixed(2)}`,
    `breath: ${params.breath.toFixed(2)}`,
    `beams: ${floor(map(params.energy, 0, 1, 10, MAX_BEAMS))}`,
    `[C] color mode  [R] reseed  [SPACE] pause`,
    `[H] HUD  | mouse drag top strip = energy`
  ];

  const boxWidth = 320;
  const boxHeight = lineH * hudText.length + pad * 2;

  fill(0, 0, 0, 0.55);
  noStroke();
  rect(pad, pad, boxWidth, boxHeight, 8);

  fill(0, 0, 90, 0.95);
  textAlign(LEFT, TOP);
  textSize(11);

  for (let i = 0; i < hudText.length; i++) {
    text(hudText[i], pad + 8, pad + 6 + i * lineH);
  }
}

// ------------------------------------------------------------
// Interaction
// ------------------------------------------------------------

function keyPressed() {
  if (key === ' ') {
    paused = !paused;
    return;
  }

  switch (key) {
    // Energy scenes: low → high
    case '1':
      params.targetEnergy = 0.18;
      break;
    case '2':
      params.targetEnergy = 0.4;
      break;
    case '3':
      params.targetEnergy = 0.7;
      break;
    case '4':
      params.targetEnergy = 1.0;
      break;

    // Nudge energy
    case '[':
      params.targetEnergy = constrain(params.targetEnergy - 0.1, 0, 1);
      break;
    case ']':
      params.targetEnergy = constrain(params.targetEnergy + 0.1, 0, 1);
      break;

    // Cycle color modes
    case 'C':
      cycleColorMode();
      break;

    // Reseed arrangement
    case 'R':
      reseed(floor(random(1e9)));
      break;

    // Toggle HUD
    case 'H':
      showHUD = !showHUD;
      break;
  }
}

// Mouse drag in top strip = direct energy control
function mouseDragged() {
  if (mouseY < height * 0.15) {
    const e = constrain(mouseX / width, 0, 1);
    params.targetEnergy = e;
  }
}

function mousePressed() {
  if (mouseY < height * 0.15) {
    const e = constrain(mouseX / width, 0, 1);
    params.targetEnergy = e;
  }
}

// ------------------------------------------------------------
// Color mode cycling
// ------------------------------------------------------------

function cycleColorMode() {
  const idx = modeOrder.indexOf(activeModeName);
  const nextIdx = (idx + 1) % modeOrder.length;
  activeModeName = modeOrder[nextIdx];
  reseed(currentSeed);
}

// ------------------------------------------------------------
// Window resize
// ------------------------------------------------------------

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  createPaneLayers();
  reseed(currentSeed);
}

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------

function hslToCSS(h, s, l, a = 1.0) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

// Circular hue interpolation (degrees)
function lerpHue(a, b, t) {
  let delta = ((b - a + 540) % 360) - 180; // shortest path
  return (a + delta * t + 360) % 360;
}
