// Bauhaus Clickfield — Ripple Sequencer with Audio
// - Grid of clickable modules (circle/bar/block/diagonal).
// - Ripple sequencer emanating from an origin tile (default: center).
// - Long-press on a tile sets origin.
// - Web Audio-based tone "grains" per tile as ripple passes.
// - Glyph type and color are independent properties.
//
// Controls:
//   Click          : advance tile state
//   Shift+click    : step state backwards
//   Alt+click      : change glyph type
//   Long-press     : set ripple origin tile
//
//   Space          : play/pause ripple
//   , / .          : bpm down / up
//
//   Q/W/E/R        : recall scenes 0–3
//   Shift+Q/W/E/R  : store scenes 0–3
//   1–4            : palettes
//   N              : new seed / reroll
//   S              : save PNG + JSON snapshot
//
//   Z / X          : global scale up/down
//   L / K          : global light/dark overlay
//   G              : toggle grid overlay
//   H              : toggle chrome

// -------------------- config --------------------

const GRID_COLS = 8;
const GRID_ROWS = 6;

const paletteDefs = [
  {
    name: 'Bauhaus Primary',
    bg: '#f6f2e8',
    primary: '#111111',
    secondary: '#d12b2b',
    accent: '#2153d6'
  },
  {
    name: 'Bauhaus Muted',
    bg: '#f0f0f0',
    primary: '#202020',
    secondary: '#b38b3b',
    accent: '#466b9c'
  },
  {
    name: 'Apple Dark',
    bg: '#05060a',
    primary: '#f5f5f7',
    secondary: '#7b7c82',
    accent: '#0a84ff'
  },
  {
    name: 'Apple Mono',
    bg: '#111217',
    primary: '#f2f2f4',
    secondary: '#8f9096',
    accent: '#ff375f'
  }
];

const MODULE_TYPES = ['circle', 'bar', 'block', 'diagonal'];
const MAX_SCENES = 4;
const LONG_PRESS_MS = 400;

// -------------------- globals --------------------

let tiles = [];
let paletteIndex = 0;

let gridMetrics = {
  x0: 0,
  y0: 0,
  cellW: 1,
  cellH: 1
};

let currentSeed = 123456789;

let scenes = new Array(MAX_SCENES).fill(null);

let showGrid = false;
let showHUD = true;

let shapeScale = 1.0;      // global shape size
let brightnessOverlay = 0; // -0.7..0.7

// Ripple sequencer state
let isPlaying = false;
let bpm = 96;
let rippleSpeed = 1.0; // multiplier on bpm timing

let originTile = null;
let maxRippleRing = 0;
let rippleIndex = 0;
let rippleTimer = 0;

// Pointer for long-press origin selection
let pointerDownTile = null;
let pointerDownTime = 0;

// Web Audio
let audioCtx = null;
let masterGain = null;

// -------------------- setup / draw --------------------

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  noStroke();
  textFont('system-ui, -apple-system, BlinkMacSystemFont, sans-serif');

  currentSeed = getSeedFromURL() ?? floor(random(1e9));
  buildTilesFromSeed();
  initRippleOrigin();
}

function draw() {
  const palette = currentPalette();
  background(palette.bg);

  const dt = deltaTime / 1000.0;

  if (isPlaying) {
    updateRipple(dt);
  }

  for (let i = 0; i < tiles.length; i++) {
    updateTile(tiles[i], dt);
    drawTile(tiles[i], palette);
  }

  if (brightnessOverlay !== 0) {
    drawBrightnessOverlay();
  }

  if (showGrid) {
    drawGridOverlay();
  }

  if (showHUD) {
    drawChrome();
  }
}

// -------------------- layout & seeding --------------------

function computeGridMetrics() {
  const marginX = width * 0.08;
  const marginY = height * 0.08;
  const gridW = width - marginX * 2;
  const gridH = height - marginY * 2;

  gridMetrics.x0 = marginX;
  gridMetrics.y0 = marginY;
  gridMetrics.cellW = gridW / GRID_COLS;
  gridMetrics.cellH = gridH / GRID_ROWS;
}

function moduleTypeForCol(col) {
  // Columns still have a "voice" bias, but color is independent.
  const bandCount = MODULE_TYPES.length;
  const segment = floor(map(col, 0, GRID_COLS, 0, bandCount));
  return MODULE_TYPES[constrain(segment, 0, bandCount - 1)];
}

function densityBiasForRow(row) {
  // 0 at top row (sparse), 1 at bottom row (dense)
  if (GRID_ROWS <= 1) return 0.5;
  return row / (GRID_ROWS - 1);
}

function emptyStateIndex(type) {
  if (type === 'circle') return 5;
  return 4;
}

function pickInitialState(moduleType, row) {
  const n = moduleStateCount(moduleType);
  const emptyIndex = emptyStateIndex(moduleType);
  const bias = densityBiasForRow(row); // 0 top (more empties), 1 bottom (fewer empties)
  const r = random();

  if (r > bias) {
    // Prefer empty in sparser rows
    return emptyIndex;
  } else {
    // Choose a non-empty state
    let s = floor(random(n - 1));
    if (s >= emptyIndex) s++;
    return s;
  }
}

function buildTilesFromSeed() {
  randomSeed(currentSeed);
  computeGridMetrics();
  tiles = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const moduleType = moduleTypeForCol(col);
      const stateCount = moduleStateCount(moduleType);
      const initialState = pickInitialState(moduleType, row);

      const { x0, y0, cellW, cellH } = gridMetrics;
      const x = x0 + col * cellW;
      const y = y0 + row * cellH;

      tiles.push({
        col,
        row,
        x,
        y,
        w: cellW,
        h: cellH,
        moduleType,           // glyph type
        state: initialState,  // glyph state
        stateCount,
        colorIndex: floor(random(3)), // 0: primary, 1: secondary, 2: accent
        animActive: false,
        animT: 1,
        animDuration: 0.22,
        animDirection: random([-1, 1]),
        clickCount: 0,
        lastChangedFrame: -1,
        ring: 0 // ripple ring index (Manhattan distance from origin)
      });
    }
  }

  initRippleOrigin();
}

function updateTileGeometry() {
  computeGridMetrics();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const { x0, y0, cellW, cellH } = gridMetrics;
    t.x = x0 + t.col * cellW;
    t.y = y0 + t.row * cellH;
    t.w = cellW;
    t.h = cellH;
  }
}

// -------------------- ripple sequencer --------------------

function initRippleOrigin() {
  // Default to center cell
  originTile =
    findTileAtGridIndex(floor(GRID_COLS / 2), floor(GRID_ROWS / 2)) ||
    tiles[0] ||
    null;
  computeRippleRings();
  rippleIndex = 0;
  rippleTimer = 0;
}

function findTileAtGridIndex(col, row) {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.col === col && t.row === row) return t;
  }
  return null;
}

function computeRippleRings() {
  if (!originTile) return;
  maxRippleRing = 0;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const dx = t.col - originTile.col;
    const dy = t.row - originTile.row;
    t.ring = abs(dx) + abs(dy); // Manhattan distance
    if (t.ring > maxRippleRing) maxRippleRing = t.ring;
  }
}

function updateRipple(dt) {
  if (!originTile) return;
  rippleTimer += dt;

  const secondsPerBeat = 60.0 / bpm;
  const secondsPerRing = (secondsPerBeat / 2.0) / rippleSpeed; // 8ths-ish

  while (rippleTimer >= secondsPerRing) {
    rippleTimer -= secondsPerRing;
    rippleIndex = (rippleIndex + 1) % (maxRippleRing + 1);

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.ring === rippleIndex) {
        handleRippleOnTile(tile);
      }
    }
  }
}

function handleRippleOnTile(tile) {
  triggerTileAnimation(tile, false);
  triggerGrainFromTile(tile, rippleIndex);
}

// -------------------- tile logic --------------------

function moduleStateCount(type) {
  switch (type) {
    case 'circle':
      return 6; // full, ring, half up, half right, quarter, empty
    case 'bar':
      return 5; // vertical, horizontal, cross, double vertical, empty
    case 'block':
      return 5; // full, two stacks, L, window, empty
    case 'diagonal':
      return 5; // /, \, X, diagonal blocks, empty
    default:
      return 1;
  }
}

function randomModuleType() {
  return random(MODULE_TYPES);
}

function currentPalette() {
  return paletteDefs[paletteIndex % paletteDefs.length];
}

function getFillForTile(tile, palette) {
  if (tile.colorIndex === 0) return palette.primary;
  if (tile.colorIndex === 1) return palette.secondary;
  return palette.accent;
}

function updateTile(tile, dt) {
  if (tile.animActive) {
    tile.animT += dt / tile.animDuration;
    if (tile.animT >= 1) {
      tile.animT = 1;
      tile.animActive = false;
    }
  }
}

function drawTile(tile, palette) {
  const cx = tile.x + tile.w / 2;
  const cy = tile.y + tile.h / 2;
  const size = min(tile.w, tile.h) * 0.78 * shapeScale;

  const baseColor = getFillForTile(tile, palette);
  const bg = palette.bg;

  // Ripple ring highlight
  if (isPlaying && tile.ring === rippleIndex) {
    push();
    noStroke();
    fill(255, 255, 255, 26);
    rect(tile.x, tile.y, tile.w, tile.h);
    pop();
  }

  // animation: gentle pulse + tiny rotation
  let t = tile.animT;
  if (!tile.animActive) t = 1;

  const pulse = 1 + 0.06 * sin(t * PI);
  const rot = tile.animActive ? tile.animDirection * 0.08 * sin(t * PI) : 0;

  push();
  translate(cx, cy);
  scale(pulse);
  rotate(rot);

  switch (tile.moduleType) {
    case 'circle':
      drawCircleModule(tile, size, baseColor, bg);
      break;
    case 'bar':
      drawBarModule(tile, size, baseColor, bg);
      break;
    case 'block':
      drawBlockModule(tile, size, baseColor, bg);
      break;
    case 'diagonal':
      drawDiagonalModule(tile, size, baseColor, bg);
      break;
  }

  // Ghost / history overlay — faint inner frame for "hot" tiles
  if (tile.clickCount && tile.clickCount > 0) {
    const influence = constrain(
      Math.log(tile.clickCount + 1) / Math.log(10),
      0,
      1
    );
    const alpha = 30 * influence;
    noFill();
    stroke(0, 0, 0, alpha);
    strokeWeight(1);
    rectMode(CENTER);
    const ghostSize = size * 0.92;
    rect(0, 0, ghostSize, ghostSize, ghostSize * 0.1);
    noStroke();
  }

  pop();
}

// -------------------- module drawing --------------------

function drawCircleModule(tile, size, baseColor, bgColor) {
  const state = tile.state;

  noStroke();

  if (state === 5) {
    // empty
    return;
  }

  if (state === 0) {
    // full circle
    fill(baseColor);
    circle(0, 0, size);
  } else if (state === 1) {
    // ring
    fill(baseColor);
    circle(0, 0, size);
    fill(bgColor);
    circle(0, 0, size * 0.55);
  } else if (state === 2) {
    // half circle up
    fill(baseColor);
    arc(0, 0, size, size, PI, TWO_PI, PIE);
  } else if (state === 3) {
    // half circle right
    fill(baseColor);
    arc(0, 0, size, size, -HALF_PI, HALF_PI, PIE);
  } else if (state === 4) {
    // quarter top-left
    fill(baseColor);
    arc(0, 0, size, size, PI, -HALF_PI, PIE);
  }
}

function drawBarModule(tile, size, baseColor, bgColor) {
  const state = tile.state;
  const long = size * 0.9;
  const thick = size * 0.18;

  noStroke();
  fill(baseColor);
  rectMode(CENTER);

  if (state === 4) {
    // empty
    return;
  }

  if (state === 0) {
    // vertical
    rect(0, 0, thick, long, thick * 0.3);
  } else if (state === 1) {
    // horizontal
    rect(0, 0, long, thick, thick * 0.3);
  } else if (state === 2) {
    // cross
    rect(0, 0, thick, long, thick * 0.3);
    rect(0, 0, long, thick, thick * 0.3);
  } else if (state === 3) {
    // double vertical
    rect(-size * 0.18, 0, thick, long * 0.9, thick * 0.3);
    rect(size * 0.18, 0, thick, long * 0.9, thick * 0.3);
  }
}

function drawBlockModule(tile, size, baseColor, bgColor) {
  const state = tile.state;
  const s = size;
  const r = s * 0.1;

  noStroke();
  rectMode(CENTER);

  if (state === 4) {
    // empty
    return;
  }

  if (state === 0) {
    // full block
    fill(baseColor);
    rect(0, 0, s, s, r);
  } else if (state === 1) {
    // two stacked blocks
    fill(baseColor);
    const h = s * 0.4;
    rect(0, -h * 0.75, s, h, r);
    rect(0, h * 0.75, s, h, r);
  } else if (state === 2) {
    // L-shape
    fill(baseColor);
    const w = s;
    const h = s * 0.4;
    rect(0, -s * 0.3, w, h, r);
    rect(-s * 0.3, 0, h, s, r);
  } else if (state === 3) {
    // window: outer rect with inner cutout
    fill(baseColor);
    rect(0, 0, s, s, r);
    fill(bgColor);
    rect(0, 0, s * 0.55, s * 0.55, r * 0.5);
  }
}

function drawDiagonalModule(tile, size, baseColor, bgColor) {
  const state = tile.state;
  const len = size * 0.95;
  const thick = size * 0.16;

  noStroke();
  rectMode(CENTER);

  if (state === 4) {
    // empty
    return;
  }

  fill(baseColor);

  if (state === 0) {
    // /
    push();
    rotate(-PI / 4);
    rect(0, 0, len, thick, thick * 0.4);
    pop();
  } else if (state === 1) {
    // \
    push();
    rotate(PI / 4);
    rect(0, 0, len, thick, thick * 0.4);
    pop();
  } else if (state === 2) {
    // X
    push();
    rotate(-PI / 4);
    rect(0, 0, len, thick, thick * 0.4);
    rotate(PI / 2);
    rect(0, 0, len, thick, thick * 0.4);
    pop();
  } else if (state === 3) {
    // diagonal blocks in corners
    const half = size * 0.45;
    rect(-half * 0.6, -half * 0.6, half, half * 0.45, thick * 0.4);
    rect(half * 0.6, half * 0.6, half, half * 0.45, thick * 0.4);
  }
}

// -------------------- interaction --------------------

function mousePressed() {
  ensureAudioRunning(); // wake audio on any click
  pointerDownTile = findTileAt(mouseX, mouseY);
  pointerDownTime = millis();
}


function mouseReleased() {
  if (!pointerDownTile) return;
  const tile = findTileAt(mouseX, mouseY);
  const pressDuration = millis() - pointerDownTime;

  if (tile && tile === pointerDownTile && pressDuration >= LONG_PRESS_MS) {
    // Long press: set new origin for ripple
    originTile = tile;
    computeRippleRings();
    rippleIndex = 0;
    rippleTimer = 0;
    triggerTileAnimation(tile, true);
  } else if (tile && tile === pointerDownTile) {
  // Short click: normal state changes
  const alt = keyIsDown(ALT);
  const shift = keyIsDown(SHIFT);

  if (alt) {
    changeTileModule(tile);
  } else {
    advanceTileState(tile, shift ? -1 : 1);
  }

  // NEW: audible feedback on click
  triggerGrainFromTile(tile, tile.ring || 0);
}

  pointerDownTile = null;
}

function findTileAt(px, py) {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (px >= t.x && px < t.x + t.w && py >= t.y && py < t.y + t.h) {
      return t;
    }
  }
  return null;
}

function advanceTileState(tile, direction) {
  const n = tile.stateCount;
  tile.state = ((tile.state + direction) % n + n) % n;
  registerTileChange(tile);
  triggerTileAnimation(tile);
}

function changeTileModule(tile) {
  const others = MODULE_TYPES.filter((m) => m !== tile.moduleType);
  tile.moduleType = random(others);
  tile.stateCount = moduleStateCount(tile.moduleType);
  tile.state = constrain(tile.state, 0, tile.stateCount - 1);
  registerTileChange(tile);
  triggerTileAnimation(tile, true);
}

function registerTileChange(tile) {
  tile.clickCount = (tile.clickCount || 0) + 1;
  tile.lastChangedFrame = frameCount;
}

function triggerTileAnimation(tile, hard) {
  tile.animActive = true;
  tile.animT = 0;
  tile.animDuration = hard ? 0.26 : 0.22;
  tile.animDirection = random([-1, 1]);
}

function keyPressed() {
  // Toggle chrome
  if (key === 'H') {
    showHUD = !showHUD;
    return;
  }

  // Grid overlay
  if (key === 'G') {
    showGrid = !showGrid;
    return;
  }

  // Transport
  if (key === ' ') {
  ensureAudioRunning();
  isPlaying = !isPlaying;
  return;
}
  }
  if (key === ',') {
    bpm = max(20, bpm - 5);
    return;
  }
  if (key === '.') {
    bpm = min(240, bpm + 5);
    return;
  }

  // Scenes on Q/W/E/R: Shift+key = store, key = recall
  if (key === 'Q') {
    if (keyIsDown(SHIFT)) storeScene(0);
    else recallScene(0);
    return;
  }
  if (key === 'W') {
    if (keyIsDown(SHIFT)) storeScene(1);
    else recallScene(1);
    return;
  }
  if (key === 'E') {
    if (keyIsDown(SHIFT)) storeScene(2);
    else recallScene(2);
    return;
  }
  if (key === 'R') {
    if (keyIsDown(SHIFT)) storeScene(3);
    else recallScene(3);
    return;
  }

  // New seed / reroll layout
  if (key === 'N') {
    currentSeed = floor(random(1e9));
    buildTilesFromSeed();
    return;
  }

  // Save PNG + JSON snapshot
  if (key === 'S') {
    saveComposition();
    return;
  }

  // Palettes: 1–4
  if (key === '1') {
    paletteIndex = 0;
    return;
  }
  if (key === '2') {
    paletteIndex = 1;
    return;
  }
  if (key === '3') {
    paletteIndex = 2;
    return;
  }
  if (key === '4') {
    paletteIndex = 3;
    return;
  }

  // Global scale macros
  if (key === 'Z') {
    shapeScale = constrain(shapeScale + 0.08, 0.7, 1.4);
    return;
  }
  if (key === 'X') {
    shapeScale = constrain(shapeScale - 0.08, 0.7, 1.4);
    return;
  }

  // Brightness macros
  if (key === 'L') {
    brightnessOverlay = constrain(brightnessOverlay + 0.1, -0.7, 0.7);
    return;
  }
  if (key === 'K') {
    brightnessOverlay = constrain(brightnessOverlay - 0.1, -0.7, 0.7);
    return;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateTileGeometry();
}

// -------------------- chrome & overlays --------------------

function drawGridOverlay() {
  const { x0, y0, cellW, cellH } = gridMetrics;
  stroke(0, 40);
  strokeWeight(1);
  noFill();

  for (let c = 0; c <= GRID_COLS; c++) {
    const x = x0 + c * cellW;
    line(x, y0, x, y0 + GRID_ROWS * cellH);
  }
  for (let r = 0; r <= GRID_ROWS; r++) {
    const y = y0 + r * cellH;
    line(x0, y, x0 + GRID_COLS * cellW, y);
  }

  noStroke();
}

function drawBrightnessOverlay() {
  const amount = abs(brightnessOverlay);
  if (amount <= 0.0001) return;

  const alpha = map(amount, 0, 0.7, 0, 120);
  noStroke();
  if (brightnessOverlay > 0) {
    fill(255, 255, 255, alpha);
  } else {
    fill(0, 0, 0, alpha);
  }
  rect(0, 0, width, height);
}

function drawChrome() {
  const palette = currentPalette();
  const margin = 14;
  const fontSize = 11;

  const fgCol = chromeColorForBackground(palette.bg);

  noStroke();
  fill(fgCol);

  textSize(fontSize);
  textAlign(LEFT, BASELINE);

  const modeLabel = isPlaying ? 'ripple · playing' : 'ripple · stopped';
  const titleLine = `CLICKFIELD · ${palette.name} · ${modeLabel} · bpm ${bpm}`;
  text(titleLine, margin, margin + fontSize);

  // top-right: seed
  textAlign(RIGHT, BASELINE);
  text(`seed ${currentSeed}`, width - margin, margin + fontSize);

  // bottom-left: origin + grid
  textAlign(LEFT, BASELINE);
  const bottomY = height - margin;
  const dot = isPlaying ? '●' : '○';
  const originLabel = originTile ? `${originTile.col},${originTile.row}` : '—';
  text(
    `${dot} origin ${originLabel} · grid ${GRID_COLS}×${GRID_ROWS}`,
    margin,
    bottomY
  );

  // bottom-right: key hints
  textAlign(RIGHT, BASELINE);
  text(
    `[space] play · long-press tile: origin · [QWER] scenes · [N] seed`,
    width - margin,
    bottomY
  );
}

function chromeColorForBackground(bgHex) {
  const c = color(bgHex);
  const lum = 0.299 * red(c) + 0.587 * green(c) + 0.114 * blue(c);
  const alpha = 200;
  if (lum > 150) {
    return color(0, 0, 0, alpha);
  } else {
    return color(255, 255, 255, alpha);
  }
}

// -------------------- scenes & save --------------------

function storeScene(index) {
  if (index < 0 || index >= MAX_SCENES) return;

  scenes[index] = {
    paletteIndex,
    seed: currentSeed,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    tiles: tiles.map((t) => ({
      moduleType: t.moduleType,
      state: t.state,
      colorIndex: t.colorIndex
    }))
  };

  console.log(
    `Stored scene ${index} (palette: ${currentPalette().name}, seed: ${currentSeed})`
  );
}

function recallScene(index) {
  const scene = scenes[index];
  if (!scene) return;

  if (scene.cols !== GRID_COLS || scene.rows !== GRID_ROWS) {
    console.warn('Scene grid size does not match current grid; ignoring.');
    return;
  }

  paletteIndex = scene.paletteIndex % paletteDefs.length;

  for (let i = 0; i < tiles.length && i < scene.tiles.length; i++) {
    const snap = scene.tiles[i];
    const tile = tiles[i];

    tile.moduleType = snap.moduleType;
    tile.stateCount = moduleStateCount(tile.moduleType);
    tile.state = constrain(snap.state, 0, tile.stateCount - 1);
    tile.colorIndex = snap.colorIndex;
    triggerTileAnimation(tile, true);
  }

  computeRippleRings();
}

function saveComposition() {
  const palette = currentPalette();
  const filenameBase = `clickfield_${palette.name.replace(/\s+/g, '-')}_${currentSeed}`;
  saveCanvas(filenameBase, 'png');

  const snapshot = {
    seed: currentSeed,
    paletteName: palette.name,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    tiles: tiles.map((t) => ({
      col: t.col,
      row: t.row,
      moduleType: t.moduleType,
      state: t.state,
      colorIndex: t.colorIndex
    }))
  };

  console.log('Clickfield snapshot:', snapshot);
  console.log('JSON:', JSON.stringify(snapshot));
}

// -------------------- audio engine --------------------

function initAudio() {
  if (audioCtx && audioCtx.state !== 'closed') return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    console.warn('Web Audio API not supported in this browser.');
    return;
  }
  audioCtx = new AudioCtx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.3;
  masterGain.connect(audioCtx.destination);
}

function ensureAudioRunning() {
  if (!audioCtx) {
    initAudio();
  }
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

function triggerGrainFromTile(tile, ringIndex) {
  ensureAudioRunning();
  if (!audioCtx) return;

  const ctx = audioCtx;
  const now = ctx.currentTime;

  // Map row to a simple pitch ladder (major-ish)
  const scale = [0, 2, 4, 7, 9, 12]; // semitones
  const degree = scale[tile.row % scale.length];
  const octave = 3 + floor(tile.row / scale.length);
  const midi = 12 * octave + degree; // rough MIDI note
  let freq = 440 * Math.pow(2, (midi - 69) / 12);

  const stateNorm =
    tile.stateCount > 1 ? tile.state / (tile.stateCount - 1) : 0.0;
  const ringNorm = maxRippleRing > 0 ? ringIndex / maxRippleRing : 0.0;

  // Slight frequency warping by state
  freq *= lerp(0.8, 1.4, 0.3 + 0.4 * stateNorm);

  // Oscillator type based on glyph type
  let type = 'sine';
  if (tile.moduleType === 'bar') type = 'square';
  else if (tile.moduleType === 'block') type = 'triangle';
  else if (tile.moduleType === 'diagonal') type = 'sawtooth';

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;

  // Envelope & pan
  const gain = ctx.createGain();
  const panNode = ctx.createStereoPanner
    ? ctx.createStereoPanner()
    : null;

  // Duration depends on module/state
  let baseDur = 0.12;
  if (tile.moduleType === 'circle') baseDur = 0.18;
  if (tile.moduleType === 'bar') baseDur = 0.10;
  if (tile.moduleType === 'block') baseDur = 0.16;
  if (tile.moduleType === 'diagonal') baseDur = 0.14;

  const dur = lerp(baseDur * 0.6, baseDur * 1.4, stateNorm);

  // Velocity from colorIndex & ring distance
  let vel = 0.2;
  if (tile.colorIndex === 2) vel *= 1.4; // accent
  if (tile.colorIndex === 1) vel *= 0.85; // secondary
  vel *= lerp(0.8, 1.2, ringNorm);

  const attack = 0.005;
  const release = dur * 0.85;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vel, now + attack);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + attack + release
  );

  osc.start(now);
  osc.stop(now + attack + release + 0.02);

  if (panNode) {
    const panVal = lerp(
      -0.8,
      0.8,
      GRID_COLS > 1 ? tile.col / (GRID_COLS - 1) : 0.5
    );
    panNode.pan.setValueAtTime(panVal, now);
    osc.connect(gain);
    gain.connect(panNode);
    panNode.connect(masterGain);
  } else {
    osc.connect(gain);
    gain.connect(masterGain);
  }
}

// -------------------- utils --------------------

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
