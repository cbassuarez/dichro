// Liquid Glass Garden — v1
// A minimal, glassy, ripple-first clicker in p5.js
//
// Entities:
//   - Cells: floating "liquid glass" blobs you can seed / upgrade
//   - Ripples: expanding waves from clicks, animating cells
// Progression:
//   - lightScore (resource) on clicks + idle
//   - a few upgrades (ripple power, seed chance, idle light, cell reactivity)
// UI:
//   - Glass strip at bottom with lightScore, tool buttons, upgrades, snapshot buttons

// ------------------------------------------------------------
// Classes
// ------------------------------------------------------------

class Cell {
  constructor(x, y, radius, hueIndex) {
    this.pos = createVector(x, y);
    this.baseRadius = radius;
    this.radiusAnimPhase = random(TWO_PI);
    this.type = 'seed'; // 'seed' | 'prism' | 'resonator'
    this.charge = 0;
    this.hueIndex = hueIndex;
    this.velocity = p5.Vector.random2D().mult(random(2, 6)); // px per second-ish, scaled later
    this.lastHitTime = -999;
    this.clickCount = 0;
  }

  worldRadius(timeSec) {
    // Breathing + type + charge-based scaling
    const breath = sin(timeSec * config.cellBreathSpeed + this.radiusAnimPhase) * 0.08;
    const chargeBoost = constrain(this.charge * 0.15, 0, 0.5);
    const typeFactor =
      this.type === 'seed' ? 1.0 :
      this.type === 'prism' ? 1.2 :
      1.4;
    // Hit "wobble"
    const sinceHit = timeSec - this.lastHitTime;
    const hitPulse = sinceHit >= 0 && sinceHit < 0.4
      ? 0.18 * (1 - sinceHit / 0.4)
      : 0;
    return this.baseRadius * typeFactor * (1 + breath + chargeBoost + hitPulse);
  }

  update(dt, timeSec) {
    // Tiny drift; scaled by upgrade
    const driftSpeed = config.cellDriftStrength;
    const offset = p5.Vector.mult(this.velocity, driftSpeed * dt * 0.01);
    this.pos.add(offset);

    // Soft wrap
    const margin = 40;
    if (this.pos.x < -margin) this.pos.x = width + margin;
    if (this.pos.x > width + margin) this.pos.x = -margin;
    if (this.pos.y < -margin) this.pos.y = height + margin;
    if (this.pos.y > height + margin) this.pos.y = -margin;

    // Gentle passive charge decay
    this.charge = max(0, this.charge - dt * 0.05);
  }

  hitByRipple(strength, timeSec) {
    this.lastHitTime = timeSec;
    const gain = strength * config.cellHitChargeGain;
    this.charge = min(this.charge + gain, 3);

    // Chance to auto-upgrade based on charge
    if (this.type === 'seed' && this.charge > 0.9 && this.clickCount >= 1) {
      this.type = 'prism';
    } else if (this.type === 'prism' && this.charge > 1.8 && this.clickCount >= 3) {
      this.type = 'resonator';
    }
  }

  clicked() {
    this.clickCount++;
    // Direct upgrade path via clicks
    if (this.type === 'seed' && this.clickCount >= config.seedToPrismClicks) {
      this.type = 'prism';
    } else if (this.type === 'prism' && this.clickCount >= config.prismToResonatorClicks) {
      this.type = 'resonator';
    }
  }

  draw(palette, timeSec) {
    const r = this.worldRadius(timeSec);
    const x = this.pos.x;
    const y = this.pos.y;

    // Hue selection from palette
    const baseHue = palette.hues[this.hueIndex % palette.hues.length];
    const secondaryHue = palette.hues[(this.hueIndex + 1) % palette.hues.length];

    // Type influences saturation/brightness
    const chargeNorm = constrain(this.charge / 3, 0, 1);
    const typeBoost =
      this.type === 'seed' ? 0.0 :
      this.type === 'prism' ? 0.2 :
      0.4;

    const sat = lerp(palette.satBase, palette.satBase + 15, typeBoost + chargeNorm * 0.6);
    const lBase = lerp(palette.cellLMin, palette.cellLMax, 0.45 + typeBoost * 0.3 + chargeNorm * 0.4);
    const alphaCore = 0.75;

    // Use canvas gradient for glassy fill
    const ctx = drawingContext;
    ctx.save();

    // Inner radial gradient, offset slightly for "light source"
    const highlightOffsetX = -r * 0.3;
    const highlightOffsetY = -r * 0.35;

    const grad = ctx.createRadialGradient(
      x + highlightOffsetX, y + highlightOffsetY, r * 0.05,
      x, y, r
    );

    const hEdge = lerpHue(baseHue, secondaryHue, 0.2 + typeBoost * 0.3);
    const hCore = lerpHue(baseHue, secondaryHue, 0.5 + chargeNorm * 0.3);

    const lEdgeOuter = lBase * 0.6;
    const lEdgeInner = lBase * 0.85;
    const lCore = lBase * (1.0 + 0.1 * chargeNorm);

    grad.addColorStop(0.0, hslToCSS(hCore, sat, lCore, alphaCore));
    grad.addColorStop(0.45, hslToCSS(hCore, sat * 0.95, lCore * 0.95, alphaCore * 0.9));
    grad.addColorStop(0.8, hslToCSS(hEdge, sat * 0.9, lEdgeInner, alphaCore * 0.7));
    grad.addColorStop(1.0, hslToCSS(hEdge, sat * 0.8, lEdgeOuter, alphaCore * 0.1));

    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Thin outer rim
    const rimAlpha = 0.35 + 0.25 * typeBoost + 0.2 * chargeNorm;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hslToCSS(hEdge, sat * 0.85, lEdgeInner * 1.05, rimAlpha);
    ctx.stroke();

    // Small specular highlight
    ctx.beginPath();
    const hr = r * 0.45;
    ctx.ellipse(
      x + r * -0.25,
      y + r * -0.25,
      hr,
      hr * 0.55,
      radians(-25),
      0,
      Math.PI * 2
    );
    ctx.closePath();
    ctx.fillStyle = hslToCSS(0, 0, 100, 0.16 + 0.12 * typeBoost);
    ctx.fill();

    ctx.restore();
  }
}

class Ripple {
  constructor(x, y, strength, hueIndex) {
    this.pos = createVector(x, y);
    this.birth = timeSecGlobal;
    this.strength = strength; // influences visual & scoring
    this.speed = config.rippleSpeed; // px per second
    this.maxRadius = max(width, height) * 1.3;
    this.hueIndex = hueIndex;
  }

  get age() {
    return timeSecGlobal - this.birth;
  }

  get radius() {
    return this.age * this.speed;
  }

  get alive() {
    return this.radius < this.maxRadius;
  }

  draw(palette) {
    const r = this.radius;
    if (r <= 0) return;

    const ageNorm = constrain(this.age / (this.maxRadius / this.speed), 0, 1);
    const fade = 1 - ageNorm;

    const baseHue = palette.hues[this.hueIndex % palette.hues.length];
    const secondaryHue = palette.hues[(this.hueIndex + 1) % palette.hues.length];
    const hue = lerpHue(baseHue, secondaryHue, 0.3 + 0.4 * (1 - fade));

    const sat = palette.rippleSat;
    const l = lerp(palette.rippleLMax, palette.rippleLMin, ageNorm);

    const bandWidth = config.rippleThickness;
    const rings = 3;

    const ctx = drawingContext;
    ctx.save();
    ctx.lineWidth = bandWidth / rings;

    for (let i = 0; i < rings; i++) {
      const innerR = r - bandWidth * 0.5 + (i / (rings - 1)) * bandWidth;
      const alpha = 0.38 * this.strength * fade * (1 - i / rings);

      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, max(innerR, 0), 0, Math.PI * 2);
      ctx.strokeStyle = hslToCSS(hue, sat, l, alpha);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ------------------------------------------------------------
// Globals & config
// ------------------------------------------------------------

let cells = [];
let ripples = [];

let lightScore = 0;
let idleLightRate = 0; // points per second from upgrades

let runSeed = Math.floor(Math.random() * 1e9);
let palette;

let timeSecGlobal = 0;

const config = {
  maxCells: 80,
  initialCells: 8,
  cellBreathSpeed: 0.6,
  cellDriftStrength: 6, // drift scale
  rippleSpeed: 320, // px per second
  rippleThickness: 24,
  rippleBaseStrength: 1.0,
  lightPerClickBase: 1.0,
  seedChanceBase: 0.7, // chance to spawn seed on empty click (modulated)
  seedToPrismClicks: 3,
  prismToResonatorClicks: 6,
  cellHitChargeGain: 0.4,
  comboRadiusFactor: 0.28, // ~fraction of max dimension
  idleLightBase: 0.0
};

// tools: 'ripple' | 'seed' | 'upgrade'
let currentTool = 'ripple';

// UI
const ui = {
  barHeight: 72,
  barMargin: 18,
  toolButtons: [],
  upgradesButton: null,
  snapshotButtons: [],
  upgradesOpen: false
};

// Simple upgrades system
const upgrades = [
  {
    id: 'ripplePower',
    name: 'Brighter Ripples',
    desc: 'Ripples are stronger and yield more light per click.',
    level: 0,
    maxLevel: 5,
    baseCost: 10,
    costFactor: 2.3
  },
  {
    id: 'seedChance',
    name: 'Seed Bloom',
    desc: 'Empty clicks more often plant new glass cells.',
    level: 0,
    maxLevel: 4,
    baseCost: 15,
    costFactor: 2.4
  },
  {
    id: 'idleDrip',
    name: 'Idle Drip',
    desc: 'Slowly gain light over time, even when not clicking.',
    level: 0,
    maxLevel: 6,
    baseCost: 20,
    costFactor: 2.1
  },
  {
    id: 'cellReactivity',
    name: 'Resonance',
    desc: 'Cells react more strongly and feed more light when hit.',
    level: 0,
    maxLevel: 4,
    baseCost: 30,
    costFactor: 2.7
  }
];

// ------------------------------------------------------------
// Setup & draw
// ------------------------------------------------------------

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  colorMode(HSL, 360, 100, 100, 1);

  initPalette();
  initCells();
  applyUpgrades(); // baseline
}

function draw() {
  const dt = deltaTime / 1000.0;
  timeSecGlobal += dt;

  // Idle light accumulation
  lightScore += idleLightRate * dt;

  updateRipples(dt);
  updateCells(dt);

  // Render
  drawBackgroundGradient();
  drawRipples();
  drawCells();
  drawUI();
}

// ------------------------------------------------------------
// Palette & background
// ------------------------------------------------------------

function initPalette() {
  randomSeed(runSeed);

  const palettes = [
    {
      name: 'tealMagenta',
      hues: [190, 310, 45], // teal, magenta, soft amber
      satBase: 55,
      cellLMin: 18,
      cellLMax: 72,
      rippleSat: 75,
      rippleLMin: 30,
      rippleLMax: 78
    },
    {
      name: 'blueViolet',
      hues: [210, 280, 60],
      satBase: 58,
      cellLMin: 16,
      cellLMax: 70,
      rippleSat: 80,
      rippleLMin: 35,
      rippleLMax: 80
    },
    {
      name: 'cyanAmber',
      hues: [185, 45, 320],
      satBase: 60,
      cellLMin: 18,
      cellLMax: 74,
      rippleSat: 77,
      rippleLMin: 32,
      rippleLMax: 82
    }
  ];

  palette = random(palettes);
}

function drawBackgroundGradient() {
  const ctx = drawingContext;
  const w = width;
  const h = height;
  const cx = w / 2;
  const cy = h / 2;
  const r = max(w, h) * 0.7;

  ctx.save();
  const grad = ctx.createRadialGradient(
    cx, cy, r * 0.08,
    cx, cy, r
  );

  const edgeH = palette.hues[0];
  const coreH = palette.hues[1];

  const lEdge = 4;
  const lCore = 12;

  grad.addColorStop(0.0, hslToCSS(coreH, 22, lCore, 1.0));
  grad.addColorStop(1.0, hslToCSS(edgeH, 30, lEdge, 1.0));

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ------------------------------------------------------------
// Cells & ripples update / draw
// ------------------------------------------------------------

function initCells() {
  cells = [];
  const count = config.initialCells;
  const margin = min(width, height) * 0.15;

  for (let i = 0; i < count; i++) {
    const x = random(margin, width - margin);
    const y = random(margin, height - margin);
    const r = random(18, 32);
    const hueIndex = floor(random(palette.hues.length));
    cells.push(new Cell(x, y, r, hueIndex));
  }
}

function updateCells(dt) {
  for (let c of cells) {
    c.update(dt, timeSecGlobal);
  }
}

function updateRipples(dt) {
  // Also handle ripple-cell interactions & scoring here
  const comboRadius = max(width, height) * config.comboRadiusFactor;

  for (let i = ripples.length - 1; i >= 0; i--) {
    const ripple = ripples[i];
    if (!ripple.alive) {
      ripples.splice(i, 1);
      continue;
    }

    const r = ripple.radius;
    const band = config.rippleThickness * 1.1;

    // Interactions
    for (let c of cells) {
      const d = p5.Vector.dist(ripple.pos, c.pos);
      if (abs(d - r) < band) {
        c.hitByRipple(ripple.strength, timeSecGlobal);

        // small reactive light gain
        const reactivity = 0.06 + 0.03 * getUpgradeLevel('cellReactivity');
        lightScore += reactivity * ripple.strength;
      }
    }
  }
}

function drawCells() {
  for (let c of cells) {
    c.draw(palette, timeSecGlobal);
  }
}

function drawRipples() {
  for (let r of ripples) {
    r.draw(palette);
  }
}

// ------------------------------------------------------------
// Interaction
// ------------------------------------------------------------

function mousePressed() {
  // First see if click hit UI
  if (handleUIClick(mouseX, mouseY)) {
    return;
  }

  // Otherwise, canvas interaction based on tool
  const clickedCell = findCellAt(mouseX, mouseY);

  if (currentTool === 'ripple') {
    handleRippleClick(mouseX, mouseY, clickedCell);
  } else if (currentTool === 'seed') {
    handleSeedClick(mouseX, mouseY, clickedCell);
  } else if (currentTool === 'upgrade') {
    handleUpgradeClick(mouseX, mouseY, clickedCell);
  }
}

function keyPressed() {
  if (key === '1') {
    currentTool = 'ripple';
  } else if (key === '2') {
    currentTool = 'seed';
  } else if (key === '3') {
    currentTool = 'upgrade';
  } else if (key === 'U' || key === 'u') {
    ui.upgradesOpen = !ui.upgradesOpen;
  } else if (key === 'S' || key === 's') {
    saveCanvas('liquid-glass-garden', 'png');
  } else if (key === 'J' || key === 'j') {
    const snapshot = makeSnapshotJSON();
    console.log('Liquid Glass Garden snapshot:', snapshot);
    // You could also trigger a download here if desired.
  } else if (key === ' ') {
    // Optional: could add pause if you want
  }
}

// ------------------------------------------------------------
// Click handlers
// ------------------------------------------------------------

function handleRippleClick(x, y, clickedCell) {
  const hueIndex = clickedCell
    ? clickedCell.hueIndex
    : floor(random(palette.hues.length));

  const strength = config.rippleBaseStrength;
  ripples.push(new Ripple(x, y, strength, hueIndex));

  const nearbyCount = countCellsNear(x, y, max(width, height) * config.comboRadiusFactor);
  const combo = 1 + nearbyCount * 0.15;

  const clickLight = config.lightPerClickBase * combo;
  lightScore += clickLight;

  // Chance to seed a new cell in emptier areas
  if (!clickedCell && cells.length < config.maxCells) {
    const densityFactor = clamp(1 - nearbyCount / 8, 0.2, 1.0);
    const seedChance = config.seedChanceBase * densityFactor * (1 + 0.25 * getUpgradeLevel('seedChance'));
    if (random() < seedChance) {
      const r = random(14, 26);
      const hueIndex = floor(random(palette.hues.length));
      cells.push(new Cell(x, y, r, hueIndex));
    }
  }

  // If clicked a cell, also mark it as clicked for upgrade path
  if (clickedCell) {
    clickedCell.clicked();
  }
}

function handleSeedClick(x, y, clickedCell) {
  if (!clickedCell && cells.length < config.maxCells) {
    const r = random(16, 28);
    const hueIndex = floor(random(palette.hues.length));
    cells.push(new Cell(x, y, r, hueIndex));
  }

  // Small, soft ripple for feedback
  const hueIndex = clickedCell
    ? clickedCell.hueIndex
    : floor(random(palette.hues.length));

  ripples.push(new Ripple(x, y, 0.5, hueIndex));
  lightScore += config.lightPerClickBase * 0.5;

  if (clickedCell) {
    clickedCell.clicked();
  }
}

function handleUpgradeClick(x, y, clickedCell) {
  if (clickedCell) {
    clickedCell.clicked();
    const hueIndex = clickedCell.hueIndex;
    ripples.push(new Ripple(x, y, 0.7 + clickedCell.charge * 0.2, hueIndex));
    lightScore += config.lightPerClickBase * 0.8;
  } else {
    // If no cell, behave like soft ripple
    const hueIndex = floor(random(palette.hues.length));
    ripples.push(new Ripple(x, y, 0.6, hueIndex));
  }
}

// ------------------------------------------------------------
// Cell helpers
// ------------------------------------------------------------

function findCellAt(x, y) {
  // Find nearest cell within a radius threshold
  let best = null;
  let bestDist = Infinity;

  for (let c of cells) {
    const r = c.worldRadius(timeSecGlobal);
    const d = dist(x, y, c.pos.x, c.pos.y);
    if (d <= r * 1.1 && d < bestDist) {
      bestDist = d;
      best = c;
    }
  }

  return best;
}

function countCellsNear(x, y, radius) {
  let count = 0;
  for (let c of cells) {
    if (dist(x, y, c.pos.x, c.pos.y) <= radius) {
      count++;
    }
  }
  return count;
}

// ------------------------------------------------------------
// UI drawing & input
// ------------------------------------------------------------

function drawUI() {
  const barH = ui.barHeight;
  const margin = ui.barMargin;
  const barW = min(width - margin * 2, 560);
  const x = (width - barW) / 2;
  const y = height - barH - margin;

  const ctx = drawingContext;
  ctx.save();

  // Frosted bar background
  ctx.beginPath();
  const r = 14;
  roundedRectPath(ctx, x, y, barW, barH, r);
  ctx.closePath();

  ctx.fillStyle = hslToCSS(0, 0, 100, 0.08);
  ctx.fill();
  ctx.strokeStyle = hslToCSS(0, 0, 100, 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();

  // LightScore
  const padX = x + 16;
  const padY = y + 12;

  const score = Math.floor(lightScore);
  noStroke();
  fill(0, 0, 90, 0.9);
  textAlign(LEFT, TOP);
  textSize(13);
  text(`✺ ${score}`, padX, padY);

  // Score bar
  const barInnerY = padY + 20;
  const barInnerW = barW * 0.36;
  const barInnerH = 6;

  fill(0, 0, 0, 0.35);
  rect(padX, barInnerY, barInnerW, barInnerH, 3);

  // Softly show progress relative to a soft cap (log curve)
  const softCap = 200 + 200 * getTotalUpgradeLevel();
  const t = softCap > 0 ? constrain(score / softCap, 0, 1) : 0;
  const eased = t * (2 - t);
  const accentHue = palette.hues[1];

  fill(accentHue, 70, 70, 0.9);
  rect(padX, barInnerY, barInnerW * eased, barInnerH, 3);

  // Tool buttons
  const buttonW = 34;
  const buttonH = 34;
  const gap = 10;

  const toolsXStart = padX + barInnerW + 18;
  const toolsY = y + barH / 2 - buttonH / 2;

  ui.toolButtons = [];

  const tools = [
    { id: 'ripple', label: 'R', icon: 'ripple' },
    { id: 'seed', label: 'S', icon: 'seed' },
    { id: 'upgrade', label: 'U', icon: 'up' }
  ];

  for (let i = 0; i < tools.length; i++) {
    const bx = toolsXStart + i * (buttonW + gap);
    const by = toolsY;
    const isActive = currentTool === tools[i].id;
    drawToolButton(bx, by, buttonW, buttonH, tools[i], isActive);
    ui.toolButtons.push({ id: tools[i].id, x: bx, y: by, w: buttonW, h: buttonH });
  }

  // Upgrades button
  const upW = 34;
  const upH = 34;
  const upX = toolsXStart + tools.length * (buttonW + gap) + 6;
  const upY = toolsY;
  drawUpgradesButton(upX, upY, upW, upH);
  ui.upgradesButton = { x: upX, y: upY, w: upW, h: upH };

  // Snapshot buttons
  const snapW = 30;
  const snapH = 30;
  const snapGap = 8;
  const snapXStart = x + barW - snapW - 16;
  const snapY = toolsY + 2;

  ui.snapshotButtons = [];
  drawSnapshotButton(snapXStart - snapW - snapGap, snapY, snapW, snapH, 'PNG');
  ui.snapshotButtons.push({
    kind: 'png',
    x: snapXStart - snapW - snapGap,
    y: snapY,
    w: snapW,
    h: snapH
  });
  drawSnapshotButton(snapXStart, snapY, snapW, snapH, '{}');
  ui.snapshotButtons.push({
    kind: 'json',
    x: snapXStart,
    y: snapY,
    w: snapW,
    h: snapH
  });

  // Upgrades overlay if open
  if (ui.upgradesOpen) {
    drawUpgradesOverlay(x, y - 8, barW);
  }
}

function drawToolButton(x, y, w, h, tool, active) {
  const ctx = drawingContext;
  ctx.save();

  ctx.beginPath();
  const r = 10;
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.closePath();

  if (active) {
    ctx.fillStyle = hslToCSS(palette.hues[1], 70, 68, 0.55);
  } else {
    ctx.fillStyle = hslToCSS(0, 0, 100, 0.06);
  }
  ctx.fill();

  ctx.strokeStyle = hslToCSS(0, 0, 100, active ? 0.32 : 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw simple icon
  ctx.translate(x + w / 2, y + h / 2);
  ctx.strokeStyle = hslToCSS(0, 0, 100, 0.88);
  ctx.lineWidth = 1.4;
  ctx.beginPath();

  if (tool.icon === 'ripple') {
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
  } else if (tool.icon === 'seed') {
    ctx.ellipse(0, 0, 5, 8, radians(-25), 0, Math.PI * 2);
  } else if (tool.icon === 'up') {
    ctx.moveTo(-4, 4);
    ctx.lineTo(0, -4);
    ctx.lineTo(4, 4);
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 5);
  }

  ctx.stroke();
  ctx.restore();
}

function drawUpgradesButton(x, y, w, h) {
  const ctx = drawingContext;
  ctx.save();

  ctx.beginPath();
  const r = 10;
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.closePath();

  ctx.fillStyle = hslToCSS(0, 0, 100, ui.upgradesOpen ? 0.18 : 0.07);
  ctx.fill();

  ctx.strokeStyle = hslToCSS(0, 0, 100, 0.2);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Little diamond icon
  ctx.translate(x + w / 2, y + h / 2);
  ctx.strokeStyle = hslToCSS(palette.hues[2] || palette.hues[1], 70, 70, 0.9);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(6, 0);
  ctx.lineTo(0, 6);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function drawSnapshotButton(x, y, w, h, label) {
  const ctx = drawingContext;
  ctx.save();

  ctx.beginPath();
  const r = 9;
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.closePath();

  ctx.fillStyle = hslToCSS(0, 0, 100, 0.05);
  ctx.fill();

  ctx.strokeStyle = hslToCSS(0, 0, 100, 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = hslToCSS(0, 0, 100, 0.86);
  ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);

  ctx.restore();
}

function drawUpgradesOverlay(barX, barY, barW) {
  const cardW = barW;
  const cardMaxH = min(220, height - 120);
  const cardX = barX;
  const cardY = barY - cardMaxH - 10;

  const ctx = drawingContext;
  ctx.save();

  ctx.beginPath();
  const r = 14;
  roundedRectPath(ctx, cardX, cardY, cardW, cardMaxH, r);
  ctx.closePath();

  ctx.fillStyle = hslToCSS(0, 0, 0, 0.82);
  ctx.fill();

  ctx.strokeStyle = hslToCSS(0, 0, 100, 0.22);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();

  // Draw upgrade items
  const padding = 14;
  const lineH = 20;
  const colCostW = 80;

  textAlign(LEFT, TOP);
  textSize(12);
  noStroke();

  fill(0, 0, 90, 0.92);
  text('Upgrades', cardX + padding, cardY + padding);

  let y = cardY + padding + 18;
  for (let up of upgrades) {
    const cost = getUpgradeCost(up);
    const canAfford = lightScore >= cost;
    const isMax = up.level >= up.maxLevel;

    const levelStr = isMax ? 'max' : `lv ${up.level}`;
    const textColor = isMax ? color(0, 0, 60, 0.6) : color(0, 0, 85, 0.92);

    fill(textColor);
    text(up.name, cardX + padding, y);
    fill(0, 0, 70, 0.8);
    text(up.desc, cardX + padding, y + 12);

    // Cost / buy button
    const btnW = 60;
    const btnH = 18;
    const btnX = cardX + cardW - padding - btnW;
    const btnY = y + 4;

    const btnColor = isMax
      ? color(0, 0, 40, 0.5)
      : canAfford
      ? color(palette.hues[1], 70, 60, 0.9)
      : color(0, 0, 30, 0.5);

    fill(btnColor);
    rect(btnX, btnY, btnW, btnH, 8);

    fill(0, 0, 97, isMax ? 0.6 : 0.95);
    textAlign(CENTER, CENTER);
    textSize(11);
    text(
      isMax ? 'MAX' : `${Math.floor(cost)}`,
      btnX + btnW / 2,
      btnY + btnH / 2
    );

    // store UI rect for clicks
    up._uiRect = { x: btnX, y: btnY, w: btnW, h: btnH, yLabel: y };

    // level text
    textAlign(LEFT, TOP);
    textSize(11);
    fill(0, 0, 65, 0.9);
    text(levelStr, cardX + padding, y + 32);

    y += 52;
    if (y > cardY + cardMaxH - 40) break; // simple clipping
  }
}

function handleUIClick(mx, my) {
  // Check tool buttons
  for (let b of ui.toolButtons) {
    if (pointInRect(mx, my, b)) {
      currentTool = b.id;
      return true;
    }
  }

  // Upgrades button
  if (ui.upgradesButton && pointInRect(mx, my, ui.upgradesButton)) {
    ui.upgradesOpen = !ui.upgradesOpen;
    return true;
  }

  // Snapshot buttons
  for (let sb of ui.snapshotButtons) {
    if (pointInRect(mx, my, sb)) {
      if (sb.kind === 'png') {
        saveCanvas('liquid-glass-garden', 'png');
      } else if (sb.kind === 'json') {
        const snapshot = makeSnapshotJSON();
        console.log('Liquid Glass Garden snapshot:', snapshot);
      }
      return true;
    }
  }

  // Upgrades overlay
  if (ui.upgradesOpen) {
    for (let up of upgrades) {
      if (!up._uiRect) continue;
      if (pointInRect(mx, my, up._uiRect)) {
        attemptUpgradePurchase(up);
        return true;
      }
    }
  }

  return false;
}

// ------------------------------------------------------------
// Upgrades logic
// ------------------------------------------------------------

function getUpgradeLevel(id) {
  const up = upgrades.find(u => u.id === id);
  return up ? up.level : 0;
}

function getTotalUpgradeLevel() {
  let sum = 0;
  for (let u of upgrades) sum += u.level;
  return sum;
}

function getUpgradeCost(up) {
  if (up.level >= up.maxLevel) return Infinity;
  return up.baseCost * Math.pow(up.costFactor, up.level);
}

function attemptUpgradePurchase(up) {
  if (up.level >= up.maxLevel) return;
  const cost = getUpgradeCost(up);
  if (lightScore >= cost) {
    lightScore -= cost;
    up.level++;
    applyUpgrades();
  }
}

function applyUpgrades() {
  // Reset to base
  config.rippleBaseStrength = 1.0;
  config.lightPerClickBase = 1.0;
  config.seedChanceBase = 0.7;
  idleLightRate = config.idleLightBase;
  config.cellHitChargeGain = 0.4;
  config.cellDriftStrength = 6;

  const rippleLevel = getUpgradeLevel('ripplePower');
  const seedLevel = getUpgradeLevel('seedChance');
  const idleLevel = getUpgradeLevel('idleDrip');
  const reactLevel = getUpgradeLevel('cellReactivity');

  config.rippleBaseStrength = 1.0 + rippleLevel * 0.4;
  config.lightPerClickBase = 1.0 + rippleLevel * 0.5;
  config.seedChanceBase = 0.7 + seedLevel * 0.1;
  idleLightRate = idleLevel * 0.6; // points per second
  config.cellHitChargeGain = 0.4 + reactLevel * 0.15;
  config.cellDriftStrength = 6 + seedLevel * 1.2;
}

// ------------------------------------------------------------
// Snapshot JSON (soft repeatability)
// ------------------------------------------------------------

function makeSnapshotJSON() {
  const snapshot = {
    runSeed,
    paletteName: palette.name,
    lightScore: Math.floor(lightScore),
    upgrades: upgrades.map(u => ({ id: u.id, level: u.level })),
    cellCount: cells.length,
    cellTypes: {
      seed: cells.filter(c => c.type === 'seed').length,
      prism: cells.filter(c => c.type === 'prism').length,
      resonator: cells.filter(c => c.type === 'resonator').length
    }
  };
  return snapshot;
}

// ------------------------------------------------------------
// Resize
// ------------------------------------------------------------

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------

function hslToCSS(h, s, l, a = 1.0) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

// Circular hue interpolation (degrees)
function lerpHue(a, b, t) {
  let delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

function pointInRect(px, py, rectObj) {
  return (
    px >= rectObj.x &&
    px <= rectObj.x + rectObj.w &&
    py >= rectObj.y &&
    py <= rectObj.y + rectObj.h
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
