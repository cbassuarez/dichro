// Bauhaus Clickfield
// Click tiles to cycle states. Shift+click = step back. Alt/Option+click = change module type.
// Palettes: 1–4. R = new layout. S = save PNG + JSON to console. G = grid. H = HUD.

// -------------------- config --------------------

const GRID_COLS = 8;
const GRID_ROWS = 6;
const MAX_SCENES = 4;

let scenes = new Array(MAX_SCENES).fill(null);

let playMode = false;
let sweep = {
  pos: 0,
  speed: 0.6,    // rows per second
  width: 0.8,    // highlight band width in rows
  autoAdvance: true
};
let prevSweepPos = 0;

let shapeScale = 1.0;      // global shape size scalar
let brightnessOverlay = 0; // -0.7..0.7, negative = darker, positive = lighter

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

// -------------------- globals --------------------

let tiles = [];
let paletteIndex = 0;
let showGrid = false;
let showHUD = true;

let gridMetrics = {
  x0: 0,
  y0: 0,
  cellW: 1,
  cellH: 1
};

let currentSeed = 123456789;

// -------------------- setup / draw --------------------

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  noStroke();
  textFont('system-ui, -apple-system, BlinkMacSystemFont, sans-serif');

  currentSeed = getSeedFromURL() ?? floor(random(1e9));
  buildTilesFromSeed();
}

function updateSweep(dt) {
  prevSweepPos = sweep.pos;
  sweep.pos += dt * sweep.speed;

  // Wrap in [0, GRID_ROWS)
  if (sweep.pos >= GRID_ROWS) sweep.pos -= GRID_ROWS;
  if (sweep.pos < 0) sweep.pos += GRID_ROWS;

  if (!sweep.autoAdvance) return;

  // Auto-advance tiles once when the band’s center crosses a row center
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const centerRow = tile.row + 0.5;

    let prev = prevSweepPos;
    let curr = sweep.pos;
    let tileCenter = centerRow;

    // handle wrap-around (always move "forward" in row space)
    if (curr < prev) curr += GRID_ROWS;
    if (tileCenter < prev) tileCenter += GRID_ROWS;

    if (prev <= tileCenter && curr > tileCenter) {
      advanceTileState(tile, +1);
    }
  }
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

function draw() {
  const palette = currentPalette();
  background(palette.bg);

  const dt = deltaTime / 1000.0;

  if (playMode) {
    updateSweep(dt);
  }

  // tiles
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
    drawHUD();
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
  // Map columns into four bands: circle, bar, block, diagonal
  const bandCount = MODULE_TYPES.length; // 4
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
      const role = pickRole();

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
        moduleType,
        state: initialState,
        stateCount,
        role,
        animActive: false,
        animT: 1,
        animDuration: 0.22, // seconds
        animDirection: random([-1, 1]),
        clickCount: 0,
        lastChangedFrame: -1
      });
    }
  }
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

function pickRole() {
  const r = random();
  if (r < 0.65) return 'primary';
  if (r < 0.9) return 'secondary';
  return 'accent';
}

function currentPalette() {
  return paletteDefs[paletteIndex % paletteDefs.length];
}

function getFillForTile(tile, palette) {
  switch (tile.role) {
    case 'primary':
      return palette.primary;
    case 'secondary':
      return palette.secondary;
    case 'accent':
      return palette.accent;
    default:
      return palette.primary;
  }
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

  // Sweep highlight (behind the module)
  if (playMode) {
    const rowCenter = tile.row + 0.5;
    let sweepPos = sweep.pos % GRID_ROWS;
    if (sweepPos < 0) sweepPos += GRID_ROWS;

    let d = abs(rowCenter - sweepPos);
    // shortest distance accounting for wrap-around
    d = min(d, GRID_ROWS - d);

    let intensity = max(0, 1 - d / sweep.width);
    if (intensity > 0) {
      push();
      noStroke();
      const alpha = 18 * intensity;
      fill(255, 255, 255, alpha);
      rect(tile.x, tile.y, tile.w, tile.h);
      pop();
    }
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
    const influence = constrain(Math.log(tile.clickCount + 1) / Math.log(10), 0, 1);
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
function registerTileChange(tile) {
  tile.clickCount = (tile.clickCount || 0) + 1;
  tile.lastChangedFrame = frameCount;
}

// -------------------- module drawing --------------------

function drawCircleModule(tile, size, baseColor, bgColor) {
  const state = tile.state;
  const r = size * 0.5;

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
  const tile = findTileAt(mouseX, mouseY);
  if (!tile) return;

  const alt = keyIsDown(ALT);
  const shift = keyIsDown(SHIFT);

  if (alt) {
    // change module type
    changeTileModule(tile);
  } else {
    // advance or step back in state
    const direction = shift ? -1 : 1;
    advanceTileState(tile, direction);
  }
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

function triggerTileAnimation(tile, hard) {
  tile.animActive = true;
  tile.animT = 0;
  tile.animDuration = hard ? 0.26 : 0.22;
  tile.animDirection = random([-1, 1]);
}

function keyPressed() {
  // HUD + grid toggles
  if (key === 'H') {
    showHUD = !showHUD;
    return;
  }
  if (key === 'G') {
    showGrid = !showGrid;
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

  // New seed / reroll layout (moved from 'R' to 'N')
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

  // Play mode + sweep
  if (key === 'P') {
    playMode = !playMode;
    return;
  }
  if (key === '-') {
    sweep.speed = max(0.1, sweep.speed - 0.1);
    return;
  }
  if (key === '=') {
    sweep.speed = min(3.0, sweep.speed + 0.1);
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

// -------------------- HUD & grid --------------------

function drawGridOverlay() {
  const { x0, y0, cellW, cellH } = gridMetrics;
  stroke(0, 40);
  strokeWeight(1);
  noFill();

  // inner grid
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

function drawHUD() {
  const palette = currentPalette();
  const pad = 12;
  const lineH = 16;

    const lines = [
    `palette: ${palette.name}`,
    `seed: ${currentSeed}`,
    `grid: ${GRID_COLS} × ${GRID_ROWS}`,
    `mode: ${playMode ? 'play (sweep)' : 'edit (click)'}`,
    `click: next · shift+click: back · alt+click: module`,
    `[1–4] palette · [N] new seed · [S] save · [G] grid · [H] HUD`,
    `[QWER] recall scenes · Shift+QWER store scenes`,
    `[P] play sweep · [-/=] sweep speed · [Z/X] scale · [L/K] light/dark`
  ];

  const boxW = 380;
  const boxH = lineH * lines.length + pad * 2;

  // semi-opaque HUD box
  fill(0, 0, 0, 140);
  noStroke();
  rect(pad, pad, boxW, boxH, 10);

  fill(255, 240);
  textAlign(LEFT, TOP);
  textSize(12);

  for (let i = 0; i < lines.length; i++) {
    text(lines[i], pad + 10, pad + 6 + i * lineH);
  }
}

// -------------------- save & snapshot --------------------

function saveComposition() {
  // image
  const palette = currentPalette();
  const filenameBase = `clickfield_${palette.name.replace(/\s+/g, '-')}_${currentSeed}`;
  saveCanvas(filenameBase, 'png');

  // JSON snapshot
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
      role: t.role
    }))
  };

  console.log('Clickfield snapshot:', snapshot);
  console.log('JSON:', JSON.stringify(snapshot));
}

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
      role: t.role
    }))
  };

  console.log(`Stored scene ${index} (palette: ${currentPalette().name}, seed: ${currentSeed})`);
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
    tile.role = snap.role;
    triggerTileAnimation(tile, true);
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
