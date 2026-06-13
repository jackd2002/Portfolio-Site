'use strict';

const GRID_SIZE = 7;

const SYMBOLS = [
  { id: 0, src: 'assets/gold-teddy.png',        name: 'Gold Teddy'      },
  { id: 1, src: 'assets/unicorn.png',            name: 'Unicorn'         },
  { id: 2, src: 'assets/robot.png',              name: 'Robot'           },
  { id: 3, src: 'assets/duck.png',               name: 'Duck'            },
  { id: 4, src: 'assets/pink-token.png',         name: 'Pink Token'      },
  { id: 5, src: 'assets/blue-token.png',         name: 'Blue Token'      },
  { id: 6, src: 'assets/yellow-token.png',       name: 'Yellow Token'    },
  { id: 7, src: 'assets/wild.png',               name: 'Wild'            },
  { id: 8, src: 'assets/scatter.png',            name: 'Scatter'         },
  { id: 9, src: 'assets/jackpot-scatter.png',    name: 'Jackpot Scatter' },
];

const CLAW_ID            = 7;
const SCATTER_ID         = 8;
const JACKPOT_SCATTER_ID = 9;

// [5, 7, 10, 12, 15+] cluster-size breakpoints × bet
const PAY_TABLE = [
  [1.0,  2.5,  7.5,  15.0, 150.0],  // Gold Teddy
  [0.75, 2.0,  6.0,  12.5, 100.0],  // Unicorn
  [0.5,  1.75, 4.0,  10.0,  60.0],  // Robot
  [0.4,  1.25, 3.0,   7.0,  40.0],  // Duck
  [0.3,  0.75, 2.0,   5.5,  30.0],  // Pink Token
  [0.25, 0.4,  1.25,  2.75, 25.0],  // Blue Token
  [0.2,  0.25, 1.0,   2.5,  20.0],  // Yellow Token
  [0.0,  0.0,  0.0,   0.0,   0.0],  // Wild            — adjacent boost only, no cluster payout
  [0.0,  0.0,  0.0,   0.0,   0.0],  // Scatter         — trigger symbol, no cluster payout
  [0.0,  0.0,  0.0,   0.0,   0.0],  // Jackpot Scatter — trigger symbol, no cluster payout
];

const BET_STEPS = [0.20, 0.40, 0.60, 0.80, 1.00, 2.00, 5.00, 10.00];

// Weighted normal-symbol pool (ids 0–6 only; CLAW and SCATTER are handled separately)
// Lower id = higher pay = lower weight; higher id = lower pay = higher weight
const SYMBOL_WEIGHTS   = [14, 17, 18, 16, 12, 11, 10]; // Gold Teddy → Yellow Token (total 98)
const SYM_CUM_WEIGHTS  = SYMBOL_WEIGHTS.reduce((acc, w, i) => { acc.push((acc[i - 1] ?? 0) + w); return acc; }, []);
const SYM_TOTAL_WEIGHT = SYM_CUM_WEIGHTS[SYM_CUM_WEIGHTS.length - 1];


// Scatter probabilities — per-cell, new cells only (initial board + tumble fills)
const BASE_SCATTER_CHANCE    = 0.0057;    // base game  → ~1-in-308 natural Prize trigger
const BONUS_SCATTER_CHANCE   = 0.0107;    // in-bonus   → drives retrigger chains
const JACKPOT_SCATTER_CHANCE = 0.000002;  // base game only → ~1-in-9,300 natural Jackpot trigger
// Mid-tumble suspense pause when exactly 2 scatters are on the board
const SCATTER_TEASE_DELAY_MS = 1000;

// CLAW drop rates — per step (initial board + every tumble refill)
const CLAW_CHANCE_BASE    = 0.0;     // base game  — no CLAWs
const CLAW_CHANCE_PRIZE   = 0.020;   // Prize Mode — 2.0%
const CLAW_CHANCE_JACKPOT = 0.09;    // Jackpot Mode — 9.0%
const MAX_SPINS_PER_BONUS  = 50;     // retrigger cap — bonus ends once this many spins played
const MAX_TUMBLES_PER_SPIN = 100;    // backstop: matches sim's MAX_TUMBLES_PER_SPIN
const MAX_WIN_MULTIPLIER   = 30000;  // max payout: per-spin in base, per-bonus-session in bonus
const MAX_CELL_MULT        = 32;     // doubling-curve ceiling: min(MAX_CELL_MULT, 2^wc)
const MIN_CLUSTER          = 5;      // minimum cluster size to qualify for payout
const PAY_TABLE_BREAKPOINTS = [5, 7, 10, 12, 15]; // cluster-size keypoints for baseMultiplier
const PRIZE_BUY_MULT       = 95;     // Prize Mode buy cost (× bet)
const JACKPOT_BUY_MULT     = 500;    // Jackpot Mode buy cost (× bet)

// Single-cell wild — id 7
const WILD_CELL = 7;
const WILD_SRC  = 'assets/wild.png';

// Prize pool — weights sum to 100; must stay in sync with sim's CLAW_PRIZES
const CLAW_PRIZES = [
  ['plus_three_spins', 22],  // add 3 to freeSpinsRemaining
  ['single_wild',      23],  // place 1 WILD_CELL on a random real-symbol cell
  ['double_wild',      14],  // place 2 WILD_CELLs
  ['cash_100x',        18],  // add 245× bet directly to spin win
  ['seed_bomb',         7],  // set winCount ≥ 3 on 5 random cells (→ 8x ticket)
  ['plus_ten_spins',    6],  // add 10 to freeSpinsRemaining
  ['sticky_50x_spot',   7],  // mark 1 random cell as +50× permanent bonus multiplier
  ['board_double',      3],  // increment every non-zero winCount by 1 (cap wc=8)
];
const CLAW_PRIZE_TOTAL = CLAW_PRIZES.reduce((s, [, w]) => s + w, 0);  // 100

// Jackpot-exclusive prize pool — Prize Mode uses CLAW_PRIZES unchanged.
// DECENT(80) + MEDIUM(17) + INSANE(3) = 100  (placeholder weights; reweight pass TBD)
const JACKPOT_CLAW_PRIZES = [
  ['extra_spins',            22],  // DECENT  — rolled +3/+5/+10 (handled in runTumbleSequence, not applyPrize)
  ['single_wild',            16],  // DECENT  — 1 sticky wild
  ['double_wild',            12],  // DECENT  — 2 sticky wilds
  ['small_cash',             10],  // DECENT  — rolled flat 25×/50×/75×
  ['seed_bomb',              10],  // DECENT  — 5 cells → wc≥3 (8× ticket)
  ['small_sticky_spot',      10],  // DECENT  — 1 cell rolled 25×/50× permanent
  ['rolled_wild_count',      10],  // MEDIUM  — rolled 3/4/5 wilds; 3 most common, 5 rarest
  ['multiplier_rain',         7],  // MEDIUM  — 3/4/5 cells with rolled sticky values
  ['big_rolled_sticky_spot',  2],  // INSANE  — 1 cell top-skewed 250×/500×/1000×
  ['board_frenzy',            1],  // INSANE  — frenzy/mega-frenzy: wilds + big sticky spots (rarest)
];
const JACKPOT_CLAW_PRIZE_TOTAL = JACKPOT_CLAW_PRIZES.reduce((s, [, w]) => s + w, 0);  // 100

// Golden claw: per-mode rates + hard-prize sub-pools drawn when golden fires.
const GOLDEN_CLAW_RATE_PRIZE   = 0.01;   // 1%  of claw fires in Prize Mode are golden
const GOLDEN_CLAW_RATE_JACKPOT = 0.10;   // 10% of claw fires in Jackpot Mode are golden

const PRIZE_GOLDEN_PRIZES = [             // 4 rarest Prize Mode prizes (lowest weights)
  ['seed_bomb',       7],
  ['plus_ten_spins',  6],
  ['sticky_50x_spot', 4],
  ['board_double',    3],
];
const PRIZE_GOLDEN_TOTAL = PRIZE_GOLDEN_PRIZES.reduce((s, [, w]) => s + w, 0);   // 20

const JACKPOT_GOLDEN_PRIZES = [           // 2 INSANE + 2 MEDIUM Jackpot prizes
  ['rolled_wild_count',     10],
  ['multiplier_rain',        7],
  ['big_rolled_sticky_spot', 2],
  ['board_frenzy',           1],
];
const JACKPOT_GOLDEN_TOTAL = JACKPOT_GOLDEN_PRIZES.reduce((s, [, w]) => s + w, 0);  // 20

// ── Prize roll constants — read by applyPrize and the info overlay ────────────
const CASH_100X_VALUE         = 245;             // cash_100x: flat payout multiplier
const STICKY_50X_VALUE        = 50;              // sticky_50x_spot: additive increment per drop
const SEED_BOMB_CELL_COUNT    = 5;               // cells affected per seed_bomb
const SEED_BOMB_MIN_WC        = 3;               // win-count floor seed_bomb stamps (→ 8× ticket)
const SMALL_CASH_ROLLS        = [25, 50, 75];    // small_cash possible values [low → high]
const SMALL_STICKY_ROLLS      = [10, 20];        // small_sticky_spot possible values [low → high]
const BIG_STICKY_ROLLS        = [12, 25, 50];    // big_rolled_sticky_spot possible values [low → high]
const ROLLED_WILD_COUNTS      = [2, 3];          // rolled_wild_count: possible wild counts [low → high]
const MULT_RAIN_COUNTS        = [3, 4, 5];       // multiplier_rain: possible cell counts [low → high]
const MULT_RAIN_ROLLS         = [3, 6, 10, 15];  // multiplier_rain: possible sticky values [low → high]
const BOARD_DOUBLE_CAP_WC     = 8;               // board_double: max win-count after increment
const FRENZY_SPOT_ROLLS       = [9, 18, 30];     // board_frenzy normal: spot values [low → high]
const FRENZY_MEGA_SPOT_ROLLS  = [25, 50, 80];    // board_frenzy mega: spot values [low → high]
const FRENZY_MEGA_CHANCE      = 0.20;            // board_frenzy: probability of mega variant
const EXTRA_SPINS_ROLLS       = [3, 5, 10];      // extra_spins: rolled spin additions [low → high]
const PLUS_THREE_VALUE        = 3;               // plus_three_spins: spins added
const PLUS_TEN_VALUE          = 10;              // plus_ten_spins: spins added

const BASE_BIAS  = 0.0;
const BONUS_BIAS = 0.25;

let betIndex  = 0;
let balance   = 100000.00;
let isSpinning = false;

let currentMode        = 'base'; // 'base' | 'freeplay' | 'jackpot'
let freeSpinsRemaining = 0;
let bonusSpinsPlayed   = 0;
let freePlaySessionWin = 0;

// ── Debug RTP tracker (session totals, reset on page reload) ──────────────────
const rtp = { baseWagered: 0, baseWon: 0, bonusWagered: 0, bonusWon: 0 };

function logRTP() {
  const totW = rtp.baseWagered + rtp.bonusWagered;
  const totR = rtp.baseWon    + rtp.bonusWon;
  const fmt  = (w, r) => w > 0 ? (r / w * 100).toFixed(2) + '%' : '—';
  console.log(
    `[RTP] overall: $${totW.toFixed(2)} wagered  $${totR.toFixed(2)} won  ${fmt(totW, totR)}` +
    `  |  base: $${rtp.baseWagered.toFixed(2)}w $${rtp.baseWon.toFixed(2)}r ${fmt(rtp.baseWagered, rtp.baseWon)}` +
    `  |  bonus: $${rtp.bonusWagered.toFixed(2)}w $${rtp.bonusWon.toFixed(2)}r ${fmt(rtp.bonusWagered, rtp.bonusWon)}`
  );
}

// Per-cell state — winCounts persist across bonus spins; reset only at bonus start or base spin
let symIds       = [];  // [row][col] → symbol id (int) or null (empty)
let winCounts    = [];  // [row][col] → how many winning clusters this cell has been in

// Bonus-persistent state — cleared only at bonus start
let stickySpots        = {};     // `${r},${c}` → additive multiplier (sticky_50x_spot accumulates)
let jackpotStickyWilds = new Set(); // wild positions that survive across Jackpot bonus spins
let prizeStickyWilds   = new Set(); // wild positions that survive across Prize bonus spins
let _lastSeedBombCells    = [];      // passback: cells seeded by the most recent seed_bomb prize
let _lastBoardDoubleCells = [];      // passback: cells doubled by the most recent board_double prize

function initArrays() {
  symIds       = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(null));
  winCounts    = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(0));
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// TEMPORARY TEST — REMOVE
let _forceJackpotScatterOnce = false;
window.forceJackpotScatter = () => {
  _forceJackpotScatterOnce = true;
  console.log('[TEST] forceJackpotScatter armed — next base spin will land a jackpot-scatter');
};

let _forceTwoScattersOnce = false;
window.forceTwoScatters = () => {
  _forceTwoScattersOnce = true;
  console.log('[TEST] forceTwoScatters armed — next spin will start with exactly 2 scatters');
};
// TEMPORARY TEST — REMOVE

function randomSymbol() {
  // TEMPORARY TEST — REMOVE: force-inject one jackpot-scatter on the next base spin
  if (currentMode === 'base' && _forceJackpotScatterOnce) {
    _forceJackpotScatterOnce = false;
    return SYMBOLS[JACKPOT_SCATTER_ID];
  }
  // Jackpot-scatter: base mode only (~1-in-9,300 per spin across all cells)
  // Roll this FIRST so a cell can be jackpot-scatter OR regular scatter, never both.
  if (currentMode === 'base' && Math.random() < JACKPOT_SCATTER_CHANCE) return SYMBOLS[JACKPOT_SCATTER_ID];
  // Regular scatter: per-cell probability; rate depends on current mode
  const scatterChance = currentMode === 'base' ? BASE_SCATTER_CHANCE : BONUS_SCATTER_CHANCE;
  if (Math.random() < scatterChance) return SYMBOLS[SCATTER_ID];
  // Weighted selection from normal symbol pool (ids 0–6)
  const r = Math.random() * SYM_TOTAL_WEIGHT;
  for (let i = 0; i < SYM_CUM_WEIGHTS.length; i++) {
    if (r < SYM_CUM_WEIGHTS[i]) return SYMBOLS[i];
  }
  return SYMBOLS[6]; // unreachable; satisfies linter
}

function cellEl(r, c) {
  // NodeList is live — index stays stable as long as we don't add/remove .cell nodes
  return document.querySelectorAll('.cell')[r * GRID_SIZE + c];
}

// ── Grid initialisation ──────────────────────────────────────────────────────

function initGrid() {
  initArrays();
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className    = 'cell';
      cell.dataset.row  = r;
      cell.dataset.col  = c;

      const sym = randomSymbol();
      symIds[r][c]     = sym.id;
      cell.dataset.sym = sym.id;

      // Ticket layer (z-index 1) — sits behind the symbol
      const ticketLayer = document.createElement('div');
      ticketLayer.className = 'ticket-layer';
      const ticketImg = document.createElement('img');
      ticketImg.alt            = '';
      ticketImg.draggable      = false;
      ticketImg.style.display  = 'none';
      ticketLayer.appendChild(ticketImg);
      cell.appendChild(ticketLayer);

      // Symbol layer (z-index 2) — rendered on top of ticket
      const symbolLayer = document.createElement('div');
      symbolLayer.className = 'symbol-layer';
      const symImg = document.createElement('img');
      symImg.src      = sym.src;
      symImg.alt      = sym.name;
      symImg.draggable = false;
      symbolLayer.appendChild(symImg);
      cell.appendChild(symbolLayer);

      // Mark indicator (small badge, optional overlay)
      const mark = document.createElement('div');
      mark.className = 'mark-indicator';
      cell.appendChild(mark);

      grid.appendChild(cell);
    }
  }

}

// ── Cluster detection (BFS flood-fill) ───────────────────────────────────────
//
// Rules (matching sim's detect_clusters exactly):
//   • Seeds are real-symbol cells (ids 0–6) not yet in realVisited.
//   • BFS expands through matching real cells (added to realVisited).
//   • Adjacent WILD_CELL cells are absorbed into the cluster (boosting size)
//     but do NOT propagate BFS — one wild cell added per cluster max (wildsAdded dedup).
//   • A wild cell CAN appear in clusters of multiple different symbol types across passes
//     because realVisited is per-symbol-type and wildsAdded is per-cluster.
//   • Cluster pays if total size (real + wild) ≥ 5.

function detectClusters() {
  const clusters = [];

  for (let symId = 0; symId < 7; symId++) {
    const realVisited = new Set();  // reset per symbol-type pass

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (symIds[r][c] !== symId) continue;
        const key = `${r},${c}`;
        if (realVisited.has(key)) continue;

        const wildsAdded = new Set();  // per-cluster wild dedup
        const queue = [{ r, c }];
        const group = [];
        realVisited.add(key);

        while (queue.length) {
          const { r: row, c: col } = queue.shift();
          group.push({ row, col });

          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
            const adj = symIds[nr][nc];
            const nk  = `${nr},${nc}`;
            if (adj === WILD_CELL) {
              // Wild: include once per cluster, never expand BFS from it
              if (!wildsAdded.has(nk)) { wildsAdded.add(nk); group.push({ row: nr, col: nc }); }
            } else if (adj === symId && !realVisited.has(nk)) {
              realVisited.add(nk);
              queue.push({ r: nr, c: nc });
            }
          }
        }

        if (group.length >= MIN_CLUSTER) clusters.push({ symId, cells: group });
      }
    }
  }

  return clusters;
}

// ── Pay table ────────────────────────────────────────────────────────────────

function baseMultiplier(symId, size) {
  const [b0, b1, b2, b3, b4] = PAY_TABLE_BREAKPOINTS;  // 5, 7, 10, 12, 15
  if (size < b0) return 0;
  const [m5, m7, m10, m12, m15] = PAY_TABLE[symId];
  if (size >= b4) return m15;
  if (size >= b3) return m12 + (size - b3) / (b4 - b3) * (m15 - m12);
  if (size >= b2) return m10 + (size - b2) / (b3 - b2) * (m12 - m10);
  if (size >= b1) return m7  + (size - b1) / (b2 - b1) * (m10 - m7);
  return               m5  + (size - b0) / (b1 - b0) * (m7  - m5);
}

// Multiplier contributed by one cell based on its win history.
// wc=0 → 0 (no contribution); wc≥1 → 2^wc, capped at MAX_CELL_MULT.
// Mirrors sim: min(MAX_CELL_MULT, 2 ** wc) applied only when wc >= 1.
function cellMultiplier(r, c) {
  const wc = winCounts[r][c];
  return wc === 0 ? 0 : Math.min(MAX_CELL_MULT, Math.pow(2, wc));
}

function clusterPayout(cluster, bet) {
  const base    = baseMultiplier(cluster.symId, cluster.cells.length) * bet;
  const symName = SYMBOLS[cluster.symId].name;

  // Multiplier sum: win-count tickets + sticky_50x_spot bonuses per cell (both sources stack)
  const multSum = cluster.cells.reduce((s, { row, col }) => {
    let m = cellMultiplier(row, col);
    const sk = stickySpots[`${row},${col}`];
    if (sk) m += sk;
    return s + m;
  }, 0);
  const payout = base * Math.max(1, multSum);
  if (multSum > 0) {
    const ticketed = cluster.cells
      .map(({ row, col }) => {
        const m = cellMultiplier(row, col), sk = stickySpots[`${row},${col}`] || 0;
        return (m + sk) ? `(${row},${col})×${m + sk}` : null;
      })
      .filter(Boolean).join(', ');
    console.log(`[payout] ${cluster.cells.length}× ${symName}: base=$${base.toFixed(2)} mult=[${ticketed}] sum=${multSum} → $${payout.toFixed(2)}`);
  } else {
    console.log(`[payout] ${cluster.cells.length}× ${symName}: base=$${base.toFixed(2)} → $${payout.toFixed(2)}`);
  }
  return payout;
}

// ── Mark state ───────────────────────────────────────────────────────────────

function updateWinCounts(clusters) {
  for (const { cells } of clusters) {
    for (const { row, col } of cells) {
      if (symIds[row][col] === WILD_CELL) continue;  // wilds get no win-count tickets
      winCounts[row][col]++;
      const wc   = winCounts[row][col];
      const mult = wc === 0 ? 0 : Math.min(MAX_CELL_MULT, Math.pow(2, wc));
      console.log(`[ticket] (${row},${col}) hit #${wc} → ${mult}x ticket`);
    }
  }
}

function resetWinCounts() {
  for (let r = 0; r < GRID_SIZE; r++) winCounts[r].fill(0);
}

// Maps a linear mult value to the nearest available ticket image (powers of 2 only).
const _TICKET_TIERS = [2, 4, 8, 16, 32, 64, 128, 256, 512];
function nearestTicketName(mult) {
  let best = _TICKET_TIERS[0];
  for (const v of _TICKET_TIERS) {
    if (v <= mult) best = v; else break;
  }
  return `${best}x`;
}

function refreshMarkDisplay() {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const el     = cellEl(r, c);
      const ticket = el.querySelector('.ticket-layer img');
      const wc     = winCounts[r][c];
      const mark   = el.querySelector('.mark-indicator');

      if (wc === 0) {
        el.classList.remove('cell--marked');
        ticket.src           = '';
        ticket.style.display = 'none';
        mark.textContent     = '';
      } else {
        // wc=0: no contribution. wc≥1: show ticket image at 2^wc capped at 512.
        const mult = wc === 0 ? 0 : Math.min(MAX_CELL_MULT, Math.pow(2, wc));
        el.classList.add('cell--marked');
        if (mult > 0) {
          ticket.src           = `assets/${nearestTicketName(mult)}-ticket.png`;
          ticket.style.display = 'block';
        } else {
          ticket.src           = '';
          ticket.style.display = 'none';
        }
        mark.textContent     = '';
      }
      mark.className = 'mark-indicator';
    }
  }
}

// ── Animations ───────────────────────────────────────────────────────────────

function highlightClusters(clusters) {
  document.querySelectorAll('.cell').forEach(el => el.classList.remove('cell--win'));
  for (const { cells } of clusters)
    for (const { row, col } of cells)
      cellEl(row, col).classList.add('cell--win');
}

async function explodeClusters(clusters) {
  // Wild cells survive cluster payouts — only real cells (0–6) are removed from the board.
  // This matches the sim's winning_set which excludes WILD_CELL positions.
  const positions = clusters.flatMap(({ cells }) =>
    cells
      .filter(({ row, col }) => symIds[row][col] !== WILD_CELL)
      .map(({ row, col }) => `${row},${col}`)
  );
  const unique = [...new Set(positions)];

  for (const key of unique) {
    const [r, c] = key.split(',').map(Number);
    const el = cellEl(r, c);
    el.classList.remove('cell--win');
    el.classList.add('cell--explode');
  }

  await delay(260); // 10ms headroom over the 0.25s animation

  for (const key of unique) {
    const [r, c] = key.split(',').map(Number);
    const el  = cellEl(r, c);
    el.classList.remove('cell--explode');
    el.querySelector('.symbol-layer img').src = '';
    symIds[r][c] = null;
  }
}

// Gravity: surviving symbols sink to the bottom of their column; new symbols fill the top.
// Each moving symbol animates from its logical origin to its final cell using inline
// CSS transitions, with a per-column stagger so the grid feels alive.
async function tumble() {
  playTumbleDrop();
  const cellHeight = cellEl(0, 0).getBoundingClientRect().height;
  const DURATION   = 320;  // ms per column animation
  const STAGGER    = 35;   // ms offset between columns
  const EASING     = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // slight bounce on landing

  // ── 1. Compute final layout for every column that changed ─────────────────
  const colData     = [];
  const newlyFilled = []; // cells that received brand-new symbols this tumble
  const bias = currentMode === 'base' ? BASE_BIAS : BONUS_BIAS;

  // Bonus modes: remove pinned wilds from symIds before gravity so they stay fixed.
  // They are restored after Phase B and re-rendered after Steps 2 and 3.
  const pinnedWilds = [];
  if (currentMode === 'jackpot' || currentMode === 'freeplay') {
    const activeStickyWilds = currentMode === 'jackpot' ? jackpotStickyWilds : prizeStickyWilds;
    for (const key of activeStickyWilds) {
      const [r, c] = key.split(',').map(Number);
      if (symIds[r][c] === WILD_CELL) {
        pinnedWilds.push([r, c]);
        symIds[r][c] = null;  // exclude from gravity; restored after Phase B
      }
    }
  }

  // Phase A: pre-apply gravity for all columns so survivors sit at their final
  // rows in symIds before any new-cell neighbour lookups happen.
  const columnLayouts = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    const survivors = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      if (symIds[row][col] !== null)
        survivors.push({ symId: symIds[row][col], originalRow: row });
    }
    const newCount = GRID_SIZE - survivors.length;
    columnLayouts.push({ col, survivors, newCount });
    if (newCount === 0) continue;
    for (let row = 0; row < GRID_SIZE; row++) symIds[row][col] = null;
    for (let i = 0; i < survivors.length; i++) symIds[newCount + i][col] = survivors[i].symId;
  }

  // Phase B: fill new cells with neighbour bias (left-to-right, top-to-bottom),
  // committing each symbol immediately so later cells can read it as a neighbour.
  for (const layout of columnLayouts) {
    const { col, survivors, newCount } = layout;
    if (newCount === 0) { colData.push(null); continue; }

    const newSymIds = [];
    for (let i = 0; i < newCount; i++) {
      let symId;
      if (bias > 0 && Math.random() < bias) {
        const eligible = [];
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = i + dr, nc = col + dc;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
          const nId = symIds[nr][nc];
          if (nId === null || nId >= CLAW_ID) continue; // normal symbols only (ids 0–6)
          eligible.push(nId);
        }
        symId = eligible.length > 0
          ? eligible[Math.floor(Math.random() * eligible.length)]
          : randomSymbol().id;
      } else {
        symId = randomSymbol().id;
      }
      symIds[i][col] = symId;
      newSymIds.push(symId);
      newlyFilled.push({ row: i, col });
    }

    // entries: every cell in this column after gravity
    const entries = [
      // New symbols occupy the top rows, stacked above the grid.
      // All share startDelta = -newCount so they fall the same distance
      // in sync, maintaining their relative ordering as they enter.
      ...newSymIds.map((symId, i) => ({
        symId,
        finalRow: i,
        startDelta: -newCount,   // cells above the final position
        isNew: true,
      })),
      // Surviving symbols fall down by however many empties were below them.
      ...survivors.map(({ symId, originalRow }, i) => ({
        symId,
        finalRow: newCount + i,
        startDelta: originalRow - (newCount + i), // ≤ 0 (falls down)
        isNew: false,
      })),
    ];

    colData.push({ col, entries });
  }

  // Jackpot: restore pinned wilds at their fixed positions (overwrite whatever gravity placed here).
  for (const [r, c] of pinnedWilds) {
    symIds[r][c] = WILD_CELL;
  }

  // ── 2. Update every DOM cell with its new symbol (no animation yet) ───────
  // cell--tumbling suppresses scatter-throb during the fall; removed in step 5.
  for (const item of colData) {
    if (!item) continue;
    for (const { symId, finalRow, startDelta } of item.entries) {
      const sym = SYMBOLS[symId];
      const el  = cellEl(finalRow, item.col);
      el.dataset.sym = symId;
      if (startDelta !== 0) el.classList.add('cell--tumbling');
      const img = el.querySelector('.symbol-layer img');
      img.src = symId === WILD_CELL ? WILD_SRC : sym.src;
      img.alt = sym.name;
    }
  }

  // Jackpot: column processing (Step 2) may have written a non-wild src/dataset to the pinned cell.
  // Reset it to wild, no animation — it must appear stationary throughout.
  for (const [r, c] of pinnedWilds) {
    const el  = cellEl(r, c);
    el.dataset.sym = WILD_CELL;
    el.classList.remove('cell--tumbling');
    const img = el.querySelector('.symbol-layer img');
    img.src              = WILD_SRC;
    img.alt              = 'Wild';
    img.style.transition = 'none';
    img.style.transform  = '';
  }

  // ── 3. Set initial transform positions (transition disabled) ──────────────
  for (const item of colData) {
    if (!item) continue;
    for (const { finalRow, startDelta } of item.entries) {
      if (startDelta === 0) continue;
      const img = cellEl(finalRow, item.col).querySelector('.symbol-layer img');
      img.style.transition = 'none';
      img.style.transform  = `translateY(${startDelta * cellHeight}px)`;
    }
  }

  // Jackpot: Step 3 may have set a translateY on the pinned cell's colData entry.
  // Clear it so the wild img stays at its natural position with no animation.
  for (const [r, c] of pinnedWilds) {
    const img = cellEl(r, c).querySelector('.symbol-layer img');
    img.style.transition = 'none';
    img.style.transform  = '';
  }

  // Double rAF ensures the browser has painted the initial positions before
  // we enable transitions — prevents the "flash to final position" bug.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // ── 4. Trigger transitions column by column with a stagger ────────────────
  for (const item of colData) {
    if (!item) continue;
    const colDelay = item.col * STAGGER;
    for (const { finalRow, startDelta } of item.entries) {
      if (startDelta === 0) continue;
      const img = cellEl(finalRow, item.col).querySelector('.symbol-layer img');
      setTimeout(() => {
        img.style.transition = `transform ${DURATION}ms ${EASING}`;
        img.style.transform  = 'translateY(0)';
      }, colDelay);
    }
  }

  // ── 5. Wait for the last column to finish, then clean up ──────────────────
  await delay((GRID_SIZE - 1) * STAGGER + DURATION + 30);

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const el  = cellEl(r, c);
      const img = el.querySelector('.symbol-layer img');
      img.style.transition = '';
      img.style.transform  = '';
      el.classList.remove('cell--tumbling'); // re-enable scatter-throb now that fall is done
    }
  }

  return newlyFilled;
}

// ── Initial spin-in: all 49 symbols fall from above the reel ─────────────────
// Called once per spin before cluster detection, so clusters never fire mid-fall.

async function spinInGrid() {
  const DURATION     = 320;
  const STAGGER      = 35;
  const EASING       = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const cellHeight   = cellEl(0, 0).getBoundingClientRect().height;
  const fallDistance = GRID_SIZE * cellHeight; // far enough above to clear the reel-area

  // Randomise all cells and park their symbols above the reel.
  // Bonus modes with sticky wilds: skip those cells — they stay visually motionless.
  const _spinInStickyWilds = currentMode === 'jackpot' ? jackpotStickyWilds :
                              currentMode === 'freeplay' ? prizeStickyWilds : null;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (_spinInStickyWilds && _spinInStickyWilds.has(`${r},${c}`)) continue;
      const sym      = randomSymbol();
      symIds[r][c]   = sym.id;
      const el       = cellEl(r, c);
      el.dataset.sym = sym.id;
      el.classList.add('cell--tumbling'); // suppress scatter-throb during fall
      const img      = el.querySelector('.symbol-layer img');
      img.src              = sym.src;
      img.alt              = sym.name;
      img.style.transition = 'none';
      img.style.transform  = `translateY(${-fallDistance}px)`;
    }
  }

  // TEMPORARY TEST — REMOVE: force exactly 2 regular scatters on this board
  if (_forceTwoScattersOnce) {
    _forceTwoScattersOnce = false;
    const candidates = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (symIds[r][c] !== SCATTER_ID && symIds[r][c] !== JACKPOT_SCATTER_ID) candidates.push([r, c]);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let k = 0; k < 2; k++) {
      const [r, c] = candidates[k];
      symIds[r][c] = SCATTER_ID;
      const el = cellEl(r, c);
      el.dataset.sym = SCATTER_ID;
      const img = el.querySelector('.symbol-layer img');
      img.src = SYMBOLS[SCATTER_ID].src;
      img.alt = SYMBOLS[SCATTER_ID].name;
    }
    console.log('[TEST] forceTwoScatters: 2 scatters placed on initial board');
  }
  // TEMPORARY TEST — REMOVE

  // Distribution check — verify weighted symbol counts on each fresh board
  const dist = Array(SYMBOLS.length).fill(0);
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (symIds[r][c] !== null) dist[symIds[r][c]]++;
  console.log('[dist]', SYMBOLS.slice(0, CLAW_ID + 2).map((s, i) =>
    `${s.name}: ${dist[i]}`).join(' | '));

  // Let the browser paint the above-grid starting positions before adding transitions
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // Drop each column in sequence, left to right
  playTumbleDrop();
  for (let c = 0; c < GRID_SIZE; c++) {
    const colDelay = c * STAGGER;
    for (let r = 0; r < GRID_SIZE; r++) {
      const img = cellEl(r, c).querySelector('.symbol-layer img');
      setTimeout(() => {
        img.style.transition = `transform ${DURATION}ms ${EASING}`;
        img.style.transform  = 'translateY(0)';
      }, colDelay);
    }
  }

  // Await the last column finishing, then strip inline styles
  await delay((GRID_SIZE - 1) * STAGGER + DURATION + 30);

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const el  = cellEl(r, c);
      const img = el.querySelector('.symbol-layer img');
      img.style.transition = '';
      img.style.transform  = '';
      el.classList.remove('cell--tumbling'); // re-enable scatter-throb
    }
  }
}

// ── Celebration spin-in: like spinInGrid but places exactly 3 scatter symbols ─
// Used for the bonus buy ceremony only — does not affect game state beyond symIds.

async function spinInGridWithScatters(mode = 'freeplay') {
  const DURATION   = 320;
  const STAGGER    = 35;
  const EASING     = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const cellHeight = cellEl(0, 0).getBoundingClientRect().height;
  const fallDist   = GRID_SIZE * cellHeight;

  // Pick 3 unique random cell indices for scatter placement
  const scatterSlots = new Set();
  while (scatterSlots.size < 3) {
    scatterSlots.add(Math.floor(Math.random() * GRID_SIZE * GRID_SIZE));
  }

  // For Jackpot buy: one of the 3 slots shows the jackpot-scatter (cosmetic only)
  const slotArray         = [...scatterSlots];
  const jackpotSlotIdx    = mode === 'jackpot'
    ? slotArray[Math.floor(Math.random() * slotArray.length)]
    : -1;  // -1 = disabled (Prize buy keeps all 3 as regular scatter)

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const idx = r * GRID_SIZE + c;
      let sym;
      if (scatterSlots.has(idx)) {
        sym = idx === jackpotSlotIdx ? SYMBOLS[JACKPOT_SCATTER_ID] : SYMBOLS[SCATTER_ID];
      } else {
        // Normal symbol — exclude scatter so exactly 3 appear
        do { sym = randomSymbol(); } while (sym.id === SCATTER_ID || sym.id === JACKPOT_SCATTER_ID);
      }
      symIds[r][c] = sym.id;
      const el  = cellEl(r, c);
      el.dataset.sym = sym.id;
      el.classList.add('cell--tumbling'); // prevent scatter-throb overriding translateY during fall
      const img = el.querySelector('.symbol-layer img');
      img.src              = sym.src;
      img.alt              = sym.name;
      img.style.transition = 'none';
      img.style.transform  = `translateY(${-fallDist}px)`;
    }
  }

  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  for (let c = 0; c < GRID_SIZE; c++) {
    const colDelay = c * STAGGER;
    for (let r = 0; r < GRID_SIZE; r++) {
      const img = cellEl(r, c).querySelector('.symbol-layer img');
      setTimeout(() => {
        img.style.transition = `transform ${DURATION}ms ${EASING}`;
        img.style.transform  = 'translateY(0)';
      }, colDelay);
    }
  }

  await delay((GRID_SIZE - 1) * STAGGER + DURATION + 30);

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const el  = cellEl(r, c);
      const img = el.querySelector('.symbol-layer img');
      img.style.transition = '';
      img.style.transform  = '';
      el.classList.remove('cell--tumbling'); // re-enable scatter-throb now that fall is done
    }
  }
}

// ── Cluster result text ──────────────────────────────────────────────────────

// Win feed state — rows are absolutely-positioned; tracked here for push-down animation.
let _winFeedRows = [];       // [{el, y}] — each tracked row and its current translateY
const _WIN_ROW_H = 31;       // px — fixed row height matching CSS (22px icon + 8px padding + 1px border)

function showClusterResult(stepClusters) {
  const rowsEl = document.getElementById('winPanelRows');
  const containerH = rowsEl.offsetHeight || 120;
  const n = stepClusters.length;

  // Push ALL existing rows down by n slots at once so their final positions are
  // set before any rAF fires — prevents simultaneous clusters from overwriting
  // each other's translateY when per-cluster rAFs all resolve at the same tick.
  const toRemove = [];
  _winFeedRows.forEach(entry => {
    entry.y += n * _WIN_ROW_H;
    entry.el.style.transform = `translateY(${entry.y}px)`;
    if (entry.y >= containerH) {
      entry.el.style.opacity = '0';
      toRemove.push(entry.el);
    }
  });
  toRemove.forEach(el => setTimeout(() => el.remove(), 350));
  _winFeedRows = _winFeedRows.filter(e => e.y < containerH);

  // Build all new rows first so every finalY is known before any animation fires
  const newEntries = stepClusters.map(({ symId, size, payout }, i) => {
    const finalY = i * _WIN_ROW_H;
    const sym = SYMBOLS[symId];
    const row = document.createElement('div');
    row.className = 'win-row';
    const img = document.createElement('img');
    img.className = 'win-row-icon';
    img.src = sym.src;
    img.width = 32;
    img.height = 32;
    img.alt = _infoSymName(symId);
    const lbl = document.createElement('span');
    lbl.className = 'win-row-label';
    lbl.textContent = `${size}× ${_infoSymName(symId)}`;
    const amt = document.createElement('span');
    amt.className = 'win-row-amount';
    amt.textContent = `$${payout.toFixed(2)}`;
    row.appendChild(img);
    row.appendChild(lbl);
    row.appendChild(amt);
    row.style.transform = `translateY(${-_WIN_ROW_H}px)`;
    row.style.opacity = '0';
    rowsEl.appendChild(row);
    return { el: row, y: finalY };
  });

  _winFeedRows = [...newEntries, ..._winFeedRows];

  // Single shared rAF animates all new rows to their pre-computed final positions
  requestAnimationFrame(() => requestAnimationFrame(() => {
    newEntries.forEach(({ el, y }) => {
      el.style.transform = `translateY(${y}px)`;
      el.style.opacity = '1';
    });
  }));
}

function clearWinPanel() {
  const rowsEl = document.getElementById('winPanelRows');
  rowsEl.innerHTML = '';
  _winFeedRows = [];
}

// ── Prize system ──────────────────────────────────────────────────────────────

// Returns a random real-symbol cell [r, c], or null if none exist.
function realCells() {
  const cands = [];
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (symIds[r][c] >= 0 && symIds[r][c] <= 6) cands.push([r, c]);
  return cands;
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Place a WILD_CELL at (r, c), pick a random art variant, and update the DOM.
function setWild(r, c) {
  symIds[r][c] = WILD_CELL;
  const el  = cellEl(r, c);
  el.dataset.sym = WILD_CELL;
  const img = el.querySelector('.symbol-layer img');
  img.src = WILD_SRC;
  img.alt = 'Wild';
}

// Weighted random draw from the mode-appropriate prize pool. Returns prize name string.
// A golden-claw roll (1% Prize / 10% Jackpot) forces the draw from the hard-prize subset.
// Regular draws (the vast majority) use the full pool unchanged.
function drawPrize() {
  const isJackpot  = currentMode === 'jackpot';
  const goldenRate = isJackpot ? GOLDEN_CLAW_RATE_JACKPOT : GOLDEN_CLAW_RATE_PRIZE;
  const isGolden   = Math.random() < goldenRate;
  const pool  = isGolden
    ? (isJackpot ? JACKPOT_GOLDEN_PRIZES : PRIZE_GOLDEN_PRIZES)
    : (isJackpot ? JACKPOT_CLAW_PRIZES   : CLAW_PRIZES);
  const total = isGolden
    ? (isJackpot ? JACKPOT_GOLDEN_TOTAL  : PRIZE_GOLDEN_TOTAL)
    : (isJackpot ? JACKPOT_CLAW_PRIZE_TOTAL : CLAW_PRIZE_TOTAL);
  let roll = Math.random() * total;
  for (const [name, w] of pool) {
    roll -= w;
    if (roll < 0) return [name, isGolden];
  }
  return [pool[pool.length - 1][0], isGolden];
}

// Apply all board/state effects of a prize. Returns spin-win delta (cash prizes only).
// 'extra_spins', 'plus_ten_spins', and 'plus_three_spins' are NOT handled here —
// caller intercepts those and adds directly to freeSpinsRemaining.
function applyPrize(prize, bet) {
  if (prize === 'single_wild') {
    const cands = realCells();
    if (cands.length) {
      const [r, c] = cands[Math.floor(Math.random() * cands.length)];
      setWild(r, c);
      console.log(`[prize] single_wild → (${r},${c})`);
    }

  } else if (prize === 'double_wild') {
    const cands = realCells();
    shuffleArr(cands);
    for (const [r, c] of cands.slice(0, 2)) {
      setWild(r, c);
      console.log(`[prize] double_wild → (${r},${c})`);
    }

  } else if (prize === 'seed_bomb') {
    const cands = realCells();
    shuffleArr(cands);
    _lastSeedBombCells = cands.slice(0, SEED_BOMB_CELL_COUNT);
    for (const [r, c] of _lastSeedBombCells) winCounts[r][c] = Math.max(winCounts[r][c], SEED_BOMB_MIN_WC);
    refreshMarkDisplay();
    console.log(`[prize] seed_bomb — ${_lastSeedBombCells.length} cells seeded to wc≥3`);

  } else if (prize === 'cash_100x') {                   // Prize Mode only
    console.log(`[prize] cash_100x — +${(CASH_100X_VALUE * bet).toFixed(2)}`);
    return CASH_100X_VALUE * bet;

  } else if (prize === 'small_cash') {
    const rng = Math.random();
    const val = rng < 0.20 ? SMALL_CASH_ROLLS[2] : rng < 0.60 ? SMALL_CASH_ROLLS[1] : SMALL_CASH_ROLLS[0];
    console.log(`[prize] small_cash — +${(val * bet).toFixed(2)} (${val}x)`);
    return val * bet;

  } else if (prize === 'sticky_50x_spot') {             // Prize Mode only
    const cands = realCells();
    if (cands.length) {
      const [r, c] = cands[Math.floor(Math.random() * cands.length)];
      const key = `${r},${c}`;
      stickySpots[key] = (stickySpots[key] || 0) + STICKY_50X_VALUE;
      console.log(`[prize] sticky_50x_spot → (${r},${c}) now ${stickySpots[key]}x sticky`);
      addStickyFireEffect(r, c);
    }

  } else if (prize === 'small_sticky_spot') {
    const cands = realCells();
    if (cands.length) {
      const [r, c] = cands[Math.floor(Math.random() * cands.length)];
      const rng = Math.random();
      const val = rng < 0.40 ? SMALL_STICKY_ROLLS[1] : SMALL_STICKY_ROLLS[0];
      const key = `${r},${c}`;
      stickySpots[key] = (stickySpots[key] || 0) + val;
      console.log(`[prize] small_sticky_spot → (${r},${c}) +${val}x (total ${stickySpots[key]}x)`);
      addStickyFireEffect(r, c);
    }

  } else if (prize === 'board_double') {                // Prize Mode only
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (winCounts[r][c] > 0) _lastBoardDoubleCells.push([r, c]);
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (winCounts[r][c] > 0) winCounts[r][c] = Math.min(winCounts[r][c] + 1, BOARD_DOUBLE_CAP_WC);
    refreshMarkDisplay();
    console.log(`[prize] board_double — all wincounts +1 (cap 8)`);

  } else if (prize === 'big_rolled_sticky_spot') {
    const cands = realCells();
    if (cands.length) {
      const [r, c] = cands[Math.floor(Math.random() * cands.length)];
      const rng = Math.random();
      const val = rng < 0.10 ? BIG_STICKY_ROLLS[2] : rng < 0.40 ? BIG_STICKY_ROLLS[1] : BIG_STICKY_ROLLS[0];
      const key = `${r},${c}`;
      stickySpots[key] = (stickySpots[key] || 0) + val;
      console.log(`[prize] big_rolled_sticky_spot → (${r},${c}) +${val}x (total ${stickySpots[key]}x)`);
      addStickyFireEffect(r, c);
    }

  } else if (prize === 'rolled_wild_count') {
    const rng = Math.random();
    const count = rng < 0.75 ? ROLLED_WILD_COUNTS[0] : ROLLED_WILD_COUNTS[1];
    const cands = realCells();
    shuffleArr(cands);
    const targets = cands.slice(0, count);
    for (const [r, c] of targets) setWild(r, c);
    console.log(`[prize] rolled_wild_count — ${targets.length} wilds placed`);

  } else if (prize === 'multiplier_rain') {
    const rng0 = Math.random();
    const count = rng0 < 0.20 ? MULT_RAIN_COUNTS[2] : rng0 < 0.50 ? MULT_RAIN_COUNTS[1] : MULT_RAIN_COUNTS[0];
    const cands = realCells();
    shuffleArr(cands);
    let placed = 0;
    for (const [r, c] of cands.slice(0, count)) {
      const rng = Math.random();
      const val = rng < 0.25 ? MULT_RAIN_ROLLS[3] : rng < 0.50 ? MULT_RAIN_ROLLS[2] : rng < 0.80 ? MULT_RAIN_ROLLS[1] : MULT_RAIN_ROLLS[0];
      const key = `${r},${c}`;
      stickySpots[key] = (stickySpots[key] || 0) + val;
      addStickyFireEffect(r, c);
      placed++;
    }
    console.log(`[prize] multiplier_rain — ${placed} sticky spots placed`);

  } else if (prize === 'board_frenzy') {
    const isMega = Math.random() < FRENZY_MEGA_CHANCE;
    const r1 = Math.random();
    const wildCount = isMega ? (r1 < 0.50 ? 3 : 4) : (r1 < 0.60 ? 2 : 3);
    const spotCount = isMega ? (Math.random() < 0.50 ? 3 : 4) : (Math.random() < 0.60 ? 2 : 3);
    const cands = realCells();
    shuffleArr(cands);
    for (const [r, c] of cands.slice(0, spotCount)) {
      const rng = Math.random();
      const val = isMega
        ? (rng < 0.20 ? FRENZY_MEGA_SPOT_ROLLS[2] : rng < 0.50 ? FRENZY_MEGA_SPOT_ROLLS[1] : FRENZY_MEGA_SPOT_ROLLS[0])
        : (rng < 0.20 ? FRENZY_SPOT_ROLLS[2]      : rng < 0.50 ? FRENZY_SPOT_ROLLS[1]      : FRENZY_SPOT_ROLLS[0]);
      const key = `${r},${c}`;
      stickySpots[key] = (stickySpots[key] || 0) + val;
      addStickyFireEffect(r, c);
    }
    const wildTargets = cands.slice(spotCount, spotCount + wildCount);
    for (const [r, c] of wildTargets) setWild(r, c);
    console.log(`[prize] board_frenzy${isMega ? ' (MEGA)' : ''} — ${spotCount} spots + ${wildTargets.length} wilds`);
  }
  return 0;
}

// ── Seed bomb landing animation ───────────────────────────────────────────────
// Plays after applyPrize('seed_bomb') has already set winCounts + shown the tickets.
// Runs concurrently with the prize reveal text via Promise.all — caller awaits both.
// staggerMs: ms between each cell's punch (default cascades; pass 0 for simultaneous board flash)
async function animateSeedBomb(cells, staggerMs) {
  const SEED_STAGGER_MS = 90;   // ms between each cell's staggered punch — tune for cascade feel
  const SEED_PUNCH_MS   = 480;  // punch animation duration — must match CSS seed-bomb-punch
  const SEED_HOLD_MS    = 750;  // ms to hold the post-punch glow so player can read the cells
  const stagger = staggerMs ?? SEED_STAGGER_MS;

  // Phase 1: staggered punch-in
  cells.forEach(([r, c], i) => {
    setTimeout(() => {
      const el = cellEl(r, c);
      el.classList.remove('cell--seed-punch');
      void el.offsetWidth;             // force reflow so animation restarts cleanly
      el.classList.add('cell--seed-punch');
    }, i * stagger);
  });

  // Wait for all punches to land
  await delay((cells.length - 1) * stagger + SEED_PUNCH_MS);

  // Phase 2: swap to persistent glow so player can read which cells were seeded
  for (const [r, c] of cells) {
    const el = cellEl(r, c);
    el.classList.remove('cell--seed-punch');
    el.classList.add('cell--seed-glow');
  }
  await delay(SEED_HOLD_MS);

  for (const [r, c] of cells) cellEl(r, c).classList.remove('cell--seed-glow');
}

// ── Sticky 50× fire effect ────────────────────────────────────────────────────
// Overlays a pulsing fire border on a cell for the duration of the bonus.
// Called immediately after applyPrize sets stickySpots so the value is current.
function addStickyFireEffect(r, c) {
  const el = cellEl(r, c);
  const existing = el.querySelector('.sticky-fire');
  if (existing) existing.remove();    // re-create so label shows updated value

  const val   = stickySpots[`${r},${c}`] || 50;
  const fire  = document.createElement('div');
  fire.className = 'sticky-fire';

  const label = document.createElement('div');
  label.className = 'sticky-fire-label';
  label.textContent = `+${val}×`;

  fire.appendChild(label);
  el.appendChild(fire);
}

function clearAllStickyFireEffects() {
  document.querySelectorAll('.sticky-fire').forEach(el => el.remove());
}

// ── Tumble sequence (runs until no clusters remain) ──────────────────────────

async function runTumbleSequence() {
  const bet = BET_STEPS[betIndex];
  let spinWin = 0;
  let tumbleCount = 0;
  // Claw fires once at end-of-cascade (matching sim's initial_claw_done flag).
  // Tumble-step claw rolls are separate (one per tumble, after new cells land).
  let endCascadeClawDone = false;

  const initialScatters = countScattersQuiet();
  if (initialScatters > 0) console.log(`[scatter] initial board: ${initialScatters} scatter(s)`);

  while (true) {
    const clusters = detectClusters();

    if (!clusters.length) {
      // ── End-of-cascade claw roll (fires once per spin when all clusters settle) ──
      if (!endCascadeClawDone && currentMode !== 'base') {
        endCascadeClawDone = true;
        const clawChance = currentMode === 'jackpot' ? CLAW_CHANCE_JACKPOT : CLAW_CHANCE_PRIZE;
        if (Math.random() < clawChance) {
          const [prize, isGolden] = drawPrize();
          console.log(`[claw] end-cascade prize: ${prize}${isGolden ? ' (GOLDEN)' : ''}`);
          const [tr, tc] = pickAnimTarget();
          await animateClawDrop(tr, tc, isGolden);
          // Fire reveal; apply prize effect while text is visible, then await reveal finish.
          const revealDone = showPrizeReveal(prize);
          if (prize === 'extra_spins' || prize === 'plus_ten_spins' || prize === 'plus_three_spins') {
            if (bonusSpinsPlayed < MAX_SPINS_PER_BONUS) {
              let add;
              if (prize === 'extra_spins') {
                const rng = Math.random();
                add = rng < 0.20 ? EXTRA_SPINS_ROLLS[2] : rng < 0.50 ? EXTRA_SPINS_ROLLS[1] : EXTRA_SPINS_ROLLS[0];
              } else {
                add = prize === 'plus_ten_spins' ? PLUS_TEN_VALUE : PLUS_THREE_VALUE;
              }
              freeSpinsRemaining += add;
              updateFPIndicator();
              console.log(`[prize] ${prize} → +${add} spins, remaining=${freeSpinsRemaining}`);
            }
          } else {
            spinWin += applyPrize(prize, bet);
          }
          // seed_bomb / board_double: animate concurrently with reveal
          const bombAnim   = _lastSeedBombCells.length    ? animateSeedBomb(_lastSeedBombCells.slice())       : null;
          const doubleAnim = _lastBoardDoubleCells.length ? animateSeedBomb(_lastBoardDoubleCells.slice(), 0) : null;
          _lastSeedBombCells = [];  _lastBoardDoubleCells = [];
          await Promise.all([revealDone, bombAnim, doubleAnim]);
          continue;  // re-detect clusters after prize; may form new ones (e.g. wilds)
        }
      }
      break;
    }

    // 1. Highlight (400 ms)
    highlightClusters(clusters);
    playClusterChing();
    await delay(400);

    // 2. Compute payout using winCounts BEFORE incrementing
    let stepWin = 0;
    const stepClusters = [];
    for (const cluster of clusters) {
      const p = clusterPayout(cluster, bet);
      stepWin += p;
      stepClusters.push({ symId: cluster.symId, size: cluster.cells.length, payout: p });
    }
    spinWin += stepWin;
    document.getElementById('lastWin').textContent = '$' + spinWin.toFixed(2);
    if (stepWin > 0 && (currentMode === 'freeplay' || currentMode === 'jackpot')) {
      freePlaySessionWin += stepWin;
      updateFPIndicator();
    }

    // 3. Increment marks, refresh badges
    updateWinCounts(clusters);
    refreshMarkDisplay();

    // 4. Explode symbols (~250 ms)
    await explodeClusters(clusters);

    // 5. Tumble new symbols in (~350 ms)
    tumbleCount++;
    await tumble();
    maybePlayScatterDings();
    const runningScatters = countScattersQuiet();
    if (runningScatters > 0) console.log(`[scatter] after tumble ${tumbleCount}: ${runningScatters} scatter(s) accumulated`);

    // ── Per-tumble claw roll (after new cells land, matching sim's per-tumble roll) ──
    if (currentMode !== 'base') {
      const clawChance = currentMode === 'jackpot' ? CLAW_CHANCE_JACKPOT : CLAW_CHANCE_PRIZE;
      if (Math.random() < clawChance) {
        const [prize, isGolden] = drawPrize();
        console.log(`[claw] tumble-step prize: ${prize}${isGolden ? ' (GOLDEN)' : ''}`);
        const [tr, tc] = pickAnimTarget();
        await animateClawDrop(tr, tc, isGolden);
        // Fire reveal; apply prize effect while text is visible, then await reveal finish.
        const revealDone = showPrizeReveal(prize);
        if (prize === 'extra_spins' || prize === 'plus_ten_spins' || prize === 'plus_three_spins') {
          if (bonusSpinsPlayed < MAX_SPINS_PER_BONUS) {
            let add;
            if (prize === 'extra_spins') {
              const rng = Math.random();
              add = rng < 0.20 ? 10 : rng < 0.50 ? 5 : 3;
            } else {
              add = prize === 'plus_ten_spins' ? 10 : 3;
            }
            freeSpinsRemaining += add;
            updateFPIndicator();
            console.log(`[prize] ${prize} → +${add} spins, remaining=${freeSpinsRemaining}`);
          }
        } else {
          spinWin += applyPrize(prize, bet);
        }
        // seed_bomb / board_double: animate concurrently with reveal
        const bombAnim   = _lastSeedBombCells.length    ? animateSeedBomb(_lastSeedBombCells.slice())       : null;
        const doubleAnim = _lastBoardDoubleCells.length ? animateSeedBomb(_lastBoardDoubleCells.slice(), 0) : null;
        _lastSeedBombCells = [];  _lastBoardDoubleCells = [];
        await Promise.all([revealDone, bombAnim, doubleAnim]);
      }
    }

    if (tumbleCount >= MAX_TUMBLES_PER_SPIN) break;

    // 6. Brief pause before next check (150 ms)
    await delay(150);

    // Tease: exactly 2 scatters on board → hold before next cluster check to build suspense
    if (runningScatters === 2) await delay(SCATTER_TEASE_DELAY_MS);

    showClusterResult(stepClusters);
  }

  // Per-spin win cap (base mode); bonus session cap is enforced in spin() after accumulation
  const capAmount = MAX_WIN_MULTIPLIER * bet;
  if (currentMode === 'base' && spinWin > capAmount) {
    console.log(`[cap] spin win $${spinWin.toFixed(2)} → capped at ${MAX_WIN_MULTIPLIER}x ($${capAmount.toFixed(2)})`);
    spinWin = capAmount;
  }

  // End of spin: bank the win, clear marks
  if (spinWin > 0) {
    balance += spinWin;
    if (currentMode === 'freeplay' || currentMode === 'jackpot') {
      rtp.bonusWon += spinWin;
    } else {
      rtp.baseWon += spinWin;
    }
    updateUI();
  }
  if (currentMode === 'base') {
    resetWinCounts();
    // refreshMarkDisplay intentionally deferred — ticket images persist until next spin starts
  }
  logRTP();
}

// ── Scatter trigger ──────────────────────────────────────────────────────────

const SCATTER_SPINS_TABLE = [[3, 10], [4, 12], [5, 15], [6, 20], [7, 30]];  // [minScatters, spinsAwarded]

function scatterSpins(count) {
  for (let i = SCATTER_SPINS_TABLE.length - 1; i >= 0; i--) {
    if (count >= SCATTER_SPINS_TABLE[i][0]) return SCATTER_SPINS_TABLE[i][1];
  }
  return SCATTER_SPINS_TABLE[0][1];
}

function countScattersQuiet() {
  // Counts both regular and jackpot-scatter (jackpot-scatter counts toward regular total)
  let n = 0;
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (symIds[r][c] === SCATTER_ID || symIds[r][c] === JACKPOT_SCATTER_ID) n++;
  return n;
}

function countGridScatters() {
  // Counts both regular and jackpot-scatter combined.
  let count = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const id = symIds[r][c];
      if (id === SCATTER_ID || id === JACKPOT_SCATTER_ID) {
        count++;
        console.log(`[scatter] found ${id === JACKPOT_SCATTER_ID ? 'JACKPOT-SCATTER' : 'scatter'} at (${r},${c})`);
      }
    }
  }
  return count;
}

function countJackpotScatters() {
  let n = 0;
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (symIds[r][c] === JACKPOT_SCATTER_ID) n++;
  return n;
}

function showScatterNotification(count, spins) {
  const el    = document.getElementById('scatterNotif');
  const title = el.querySelector('.scatter-notif-title');
  const sub   = el.querySelector('.scatter-notif-sub');
  title.textContent = 'PRIZE MODE TRIGGERED!';
  sub.textContent   = `${count} SCATTER${count > 1 ? 'S' : ''} → ${spins} FREE SPINS`;
  el.classList.add('visible');
  console.log(`[scatter] TRIGGER — ${count} scatters → ${spins} free spins`);
}

function hideScatterNotification() {
  document.getElementById('scatterNotif').classList.remove('visible');
}

async function shakeScatters() {
  const shakeCells = [];
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (symIds[r][c] === SCATTER_ID || symIds[r][c] === JACKPOT_SCATTER_ID) shakeCells.push(cellEl(r, c));
  if (!shakeCells.length) return;
  console.log(`[scatter] shake — ${shakeCells.length} scatter(s)`);
  for (const el of shakeCells) {
    el.classList.remove('scatter-shake');
    void el.offsetWidth; // force reflow so animation always restarts
    el.classList.add('scatter-shake');
  }
  await delay(620); // 100ms buffer after 520ms animation
  for (const el of shakeCells) el.classList.remove('scatter-shake');
}

// ── Prize animation helpers ──────────────────────────────────────────────────

const PRIZE_LABELS = {
  // ── Prize Mode (CLAW_PRIZES) ─────────────────────────────────────────────
  plus_three_spins:    '+3 SPINS!',           // explicit count, never confused with Jackpot spin prize
  plus_ten_spins:      '+10 SPINS!',          // explicit count
  single_wild:         'STICKY WILD!',        // tier 1 wild — one cell
  double_wild:         'DOUBLE WILD!',        // tier 2 wild — two cells
  cash_100x:           '245\xD7 CASH!',       // explicit value separates it from small_cash
  seed_bomb:           'SEED BOMB!',          // unique name, no confusion
  sticky_50x_spot:     '50\xD7 STICKY!',      // explicit value, distinct from LUCKY MARK / FIRE SPOT
  board_double:        'DOUBLE UP!',          // board-wide effect, unique phrasing
  // ── Jackpot Mode (JACKPOT_CLAW_PRIZES) ──────────────────────────────────
  extra_spins:             'BONUS SPINS!',    // DECENT — rolled +3/+5/+10; "BONUS" vs "+N" distinguishes from Prize mode
  small_cash:              'QUICK CASH!',     // DECENT — 25–75×; "QUICK" signals small & instant
  small_sticky_spot:       'LUCKY MARK!',     // DECENT — 25/50× sticky; "MARK" visually distinct from SPOT
  rolled_wild_count:       'WILD STORM!',     // MEDIUM — 3–5 wilds; escalates STICKY → DOUBLE → STORM
  multiplier_rain:         'MULT RAIN!',      // MEDIUM — 3–5 sticky spots; "RAIN" vs "BOMB" vs "STORM" all distinct
  big_rolled_sticky_spot:  'FIRE SPOT!',      // INSANE — 250–1000×; "FIRE" signals intensity vs LUCKY MARK
  board_frenzy:            'BOARD FRENZY!',   // INSANE — wilds + spots combo; unique compound prize
};

// Pick a random real-symbol cell to aim the claw at; falls back to grid centre.
function pickAnimTarget() {
  const cands = realCells();
  if (!cands.length) return [3, 3];
  return cands[Math.floor(Math.random() * cands.length)];
}

// ── Claw animation timing + sizing knobs — adjust here to tune feel ──────────
const CLAW_DESCENT_MS  = 320;   // ms — descent; lower = faster drop
const CLAW_RETRACT_MS  = 480;   // ms — retract
const CLAW_GRAB_MS     = 400;   // ms — GIF plays during grab pause; tune to match GIF duration
const CLAW_GRAB_DEPTH  = 0.88;  // 0..1 — fraction of grid height the head reaches
const CLAW_HEAD_FRAC   = 0.38;  // claw head width as fraction of grid width
const CLAW_CORD_FRAC   = 0.09;  // cord width as fraction of grid width
const CLAW_MOUNT_ABOVE = 10;    // px above grid top where the cord anchors
// ─────────────────────────────────────────────────────────────────────────────

// Claw punches in at scale(2.5) opacity 0, snaps to scale(1) opacity 1 in 150ms hard ease-out.
// isGolden selects gold-claw.png; regular uses claw.png. No cord involved.
async function animateClawDrop(targetR, targetC, isGolden = false) {
  const headEl  = document.getElementById('claw-head');
  const cordEl  = document.getElementById('claw-cord');
  const assy    = document.getElementById('claw-assembly');
  const flashEl = document.getElementById('claw-rainbow-flash');
  const gRect   = document.getElementById('grid').getBoundingClientRect();

  const headW     = Math.round(gRect.width  * CLAW_HEAD_FRAC);
  const headH     = headW;  // claw.png / gold-claw.png are 640×640 (1:1)
  const descentPx = Math.round(gRect.height * CLAW_GRAB_DEPTH);
  const centerX   = gRect.left + gRect.width / 2;
  const mountY    = gRect.top  - CLAW_MOUNT_ABOVE;

  const headSrc  = isGolden ? 'assets/gold-claw.png' : 'assets/claw.png';
  const headGlow = isGolden
    ? 'drop-shadow(0 0 12px rgba(255,200,0,0.95)) drop-shadow(0 4px 12px rgba(0,0,0,0.7))'
    : 'drop-shadow(0 0 8px rgba(160,32,240,0.9)) drop-shadow(0 0 20px rgba(200,0,255,0.45)) drop-shadow(0 4px 12px rgba(0,0,0,0.7))';

  // ── Setup: geometry + assets, no transitions yet ──────────────────────────
  cordEl.style.display = 'none';

  assy.style.cssText =
    `display:block;left:${centerX}px;top:${mountY}px;` +
    `width:${headW}px;height:${descentPx + headH}px;transform:translateX(-50%)`;

  headEl.src = headSrc;
  headEl.style.cssText =
    `position:absolute;top:0;left:50%;display:block;` +
    `width:${headW}px;height:${headH}px;` +
    `transform:translateX(-50%) translateY(${descentPx}px) scale(2.5);` +
    `opacity:0;filter:${headGlow};transition:none`;

  // ── Setup rainbow flash — snap to grid rect, hidden ───────────────────────
  flashEl.style.cssText =
    `left:${gRect.left}px;top:${gRect.top}px;` +
    `width:${gRect.width}px;height:${gRect.height}px;` +
    `opacity:0;transition:none`;

  void assy.offsetWidth;  // flush paint before transitions
  playClawAlarm();

  // ── Phase 1 — punch-in (150ms hard ease-out) ─────────────────────────────
  const punchEase = 'cubic-bezier(0.0, 0.0, 0.2, 1)';
  headEl.style.transition = `transform 150ms ${punchEase}, opacity 150ms ${punchEase}`;
  headEl.style.transform  = `translateX(-50%) translateY(${descentPx}px) scale(1)`;
  headEl.style.opacity    = '1';
  flashEl.style.transition = 'opacity 150ms ease-out';
  flashEl.style.opacity    = '0.68';
  await delay(150);

  // ── Hold at rest ─────────────────────────────────────────────────────────
  await delay(300);

  // ── Phase 3 — retract + rainbow fade-out ──────────────────────────────────
  const retractEase = 'cubic-bezier(0.55, 0, 1, 0.45)';
  headEl.style.transition = `transform ${CLAW_RETRACT_MS}ms ${retractEase}`;
  headEl.style.transform  = `translateX(-50%) translateY(0px)`;
  flashEl.style.transition = `opacity ${CLAW_RETRACT_MS}ms ease-in`;
  flashEl.style.opacity    = '0';
  await delay(CLAW_RETRACT_MS);

  assy.style.display = 'none';
}

// Show prize label text briefly (~1.2 s with fade). Returned promise resolves when hidden.
// Callers fire the prize EFFECT immediately after calling this (before awaiting the promise)
// so the board changes are visible while the text is still displayed.
async function showPrizeReveal(prize) {
  const el = document.getElementById('prize-reveal');
  el.textContent = PRIZE_LABELS[prize] || prize.replace(/_/g, ' ').toUpperCase();
  el.style.display = 'block';
  void el.offsetWidth;     // force reflow to trigger transition from opacity:0
  el.classList.add('visible');
  await delay(1000);
  el.classList.remove('visible');
  await delay(200);        // allow fade-out transition to complete
  el.style.display = 'none';
}

// ── Spin entry point ─────────────────────────────────────────────────────────

async function spin() {
  if (isSpinning) return;
  const bet = BET_STEPS[betIndex];

  if (currentMode === 'base') {
    if (balance < bet) return;
    balance -= bet;
    rtp.baseWagered += bet;
  }
  // freeplay and jackpot modes spin for free

  isSpinning = true;

  // Clear previous spin visuals
  document.querySelectorAll('.cell').forEach(el => el.classList.remove('cell--win'));
  document.getElementById('lastWin').textContent = '$0.00';
  if (currentMode === 'base') {
    clearWinPanel();
    resetWinCounts();
    refreshMarkDisplay();
  }

  updateUI();

  // Drop all 49 symbols in from above; cluster detection waits until animation completes
  _scatterDingsThisSpin = false;
  await spinInGrid();
  maybePlayScatterDings(); // fires immediately if 3+ scatters landed on the initial board

  await runTumbleSequence();

  // Bonus modes: snapshot which cells are still WILD_CELL after cascade settles
  if (currentMode === 'jackpot') {
    jackpotStickyWilds = new Set();
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (symIds[r][c] === WILD_CELL) jackpotStickyWilds.add(`${r},${c}`);
    if (jackpotStickyWilds.size) console.log(`[jackpot] ${jackpotStickyWilds.size} wild(s) will persist to next spin`);
  } else if (currentMode === 'freeplay') {
    prizeStickyWilds = new Set();
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (symIds[r][c] === WILD_CELL) prizeStickyWilds.add(`${r},${c}`);
    if (prizeStickyWilds.size) console.log(`[prize] ${prizeStickyWilds.size} wild(s) will persist to next spin`);
  }

  if (currentMode === 'freeplay' || currentMode === 'jackpot') {
    const isJackpot = currentMode === 'jackpot';
    freeSpinsRemaining -= 1;
    bonusSpinsPlayed   += 1;
    updateFPIndicator();
    console.log(`[${currentMode}] spins remaining: ${freeSpinsRemaining}  played: ${bonusSpinsPlayed}/${MAX_SPINS_PER_BONUS}`);

    // Cumulative bonus session cap: end the bonus immediately if total hits 30,000x
    const bonusCap = MAX_WIN_MULTIPLIER * bet;
    if (freePlaySessionWin > bonusCap) {
      freePlaySessionWin = bonusCap;
      freeSpinsRemaining = 0;
      console.log(`[cap] bonus session capped at ${MAX_WIN_MULTIPLIER}x — ending bonus`);
    }

    // ── In-bonus scatter retrigger — evaluated BEFORE teardown so currentMode is still correct.
    // Mirrors sim order: decrement spins → run spin → check retrigger → check teardown.
    // A retrigger on the "final" spin (freeSpinsRemaining just hit 0) refills it so the
    // teardown block below is skipped and the current mode continues uninterrupted.
    {
      const sc = countGridScatters();
      const sa = sc >= 3 ? scatterSpins(sc) : 0;
      console.log(`[scatter] spin complete — ${sc} scatter(s) → ${sa ? `RE-TRIGGER: +${sa} spins` : 'no retrigger'}`);
      if (sc >= 3) {
        await shakeScatters();
        if (bonusSpinsPlayed < MAX_SPINS_PER_BONUS) {
          freeSpinsRemaining += sa;
          updateFPIndicator();
          const notif = document.getElementById('scatterNotif');
          notif.querySelector('.scatter-notif-title').textContent = `+${sa} SPINS · RE-TRIGGER`;
          notif.querySelector('.scatter-notif-sub').textContent   = `${sc} SCATTER${sc > 1 ? 'S' : ''} → ${freeSpinsRemaining} SPINS LEFT`;
          playJackpotDings();
          notif.classList.add('visible');
          console.log(`[scatter] RE-TRIGGER — ${sc} scatters → +${sa} spins, now ${freeSpinsRemaining} remaining`);
          await delay(2500);
          notif.classList.remove('visible');
        } else {
          console.log(`[scatter] RE-TRIGGER suppressed — bonus cap (${MAX_SPINS_PER_BONUS}) reached`);
        }
      }
    }

    // Teardown: only runs when spins are truly exhausted (retrigger above may have refilled them)
    if (freeSpinsRemaining === 0 || bonusSpinsPlayed >= MAX_SPINS_PER_BONUS) {
      if (bonusSpinsPlayed >= MAX_SPINS_PER_BONUS && freeSpinsRemaining > 0) {
        console.log(`[cap] spin cap (${MAX_SPINS_PER_BONUS}) reached — discarding ${freeSpinsRemaining} queued spins`);
        freeSpinsRemaining = 0;
      }
      const sessionTotal = freePlaySessionWin;
      currentMode = 'base';
      marqueeIdle();
      freePlaySessionWin = 0;
      document.getElementById('fp-indicator').style.display = 'none';
      document.getElementById('spinBtn').disabled = false;
      const notif = document.getElementById('scatterNotif');
      notif.querySelector('.scatter-notif-title').textContent = isJackpot ? 'JACKPOT MODE ENDED' : 'PRIZE MODE ENDED';
      notif.querySelector('.scatter-notif-sub').textContent   = `TOTAL WIN: $${sessionTotal.toFixed(2)}`;
      playJackpotDings();
      notif.classList.add('visible');
      console.log(`[${isJackpot ? 'jackpot' : 'prize-mode'}] bonus ended — total win: $${sessionTotal.toFixed(2)}`);
      await delay(2500);
      notif.classList.remove('visible');
      clearWinPanel();
      resetWinCounts();
      refreshMarkDisplay();
      clearAllStickyFireEffects();
      stickySpots        = {};
      jackpotStickyWilds = new Set();
      prizeStickyWilds   = new Set();
    }
  }

  // ── Base-game scatter trigger check ──────────────────────────────────────
  // In-bonus scatters are now fully handled above (retrigger fires before teardown).
  // This block only fires when currentMode is 'base' — either a genuine base spin,
  // or a spin where the bonus just ended and scatters happen to remain on the board.
  const scatterCount        = countGridScatters();
  const jackpotScatterCount = countJackpotScatters();
  const spinsAwarded        = scatterCount >= 3 ? scatterSpins(scatterCount) : 0;
  if (currentMode === 'base' && (scatterCount > 0 || jackpotScatterCount > 0))
    console.log(`[scatter] base — ${scatterCount} scatter(s) (${jackpotScatterCount} jackpot-scatter) → ${spinsAwarded ? `TRIGGER: ${spinsAwarded} spins` : 'no trigger'}`);

  if (jackpotScatterCount >= 1 && currentMode === 'base') {
    // Jackpot-scatter present → Jackpot Mode (overrides Prize even if 3+ regular also present)
    const jackpotSpins = scatterSpins(Math.max(scatterCount, 3)); // at least 10 spins
    console.log(`[scatter] JACKPOT TRIGGER — ${jackpotScatterCount} jackpot-scatter → ${jackpotSpins} free spins`);
    await shakeScatters();
    showScatterNotification(scatterCount, jackpotSpins);
    await delay(3000);
    hideScatterNotification();
    isSpinning = false;
    startBonus('jackpot', jackpotSpins);
    return;
  }

  if (scatterCount >= 3 && currentMode === 'base') {
    await shakeScatters();
    showScatterNotification(scatterCount, spinsAwarded);
    await delay(3000);
    hideScatterNotification();
    isSpinning = false;
    startFreePlay(spinsAwarded);
    return;
  }

  isSpinning = false;

  if (currentMode === 'freeplay' || currentMode === 'jackpot') {
    await delay(1000);
    spin();
  }
}

function marqueeFlash() {}
function marqueeBonus() {}
function marqueeIdle()  {}

// ── UI helpers ───────────────────────────────────────────────────────────────

async function startBonus(mode, spins = 10) {
  marqueeFlash();
  setTimeout(marqueeBonus, 650);
  currentMode = mode;
  freeSpinsRemaining = spins;
  bonusSpinsPlayed   = 0;
  freePlaySessionWin = 0;
  clearAllStickyFireEffects();
  stickySpots        = {};
  jackpotStickyWilds = new Set();
  prizeStickyWilds   = new Set();
  updateFPIndicator();
  document.getElementById('fp-indicator').style.display = 'block';
  document.getElementById('spinBtn').disabled = true;
  console.log(`[${mode}] bonus started`);

  document.querySelectorAll('.cell').forEach(el => el.classList.remove('cell--win'));
  document.getElementById('lastWin').textContent = '$0.00';
  clearWinPanel();
  resetWinCounts();
  refreshMarkDisplay();

  spin();               // kick off first auto-spin (spin() generates the board via spinInGrid)
}

async function startFreePlay(spins = 10) {
  return startBonus('freeplay', spins);
}

const CELEB_DATA = {
  1: { title: 'PRIZE MODE<br>UNLOCKED!',   sub: '10 FREE SPINS AWARDED' },
  2: { title: 'JACKPOT MODE<br>UNLOCKED!', sub: '10 FREE SPINS AWARDED' },
};

function showBonusCelebration(tier) {
  const data = CELEB_DATA[tier] || CELEB_DATA[1];
  document.getElementById('celebTitle').innerHTML = data.title;
  document.getElementById('celebSub').textContent = data.sub;
  const el = document.getElementById('bonusCelebration');
  el.classList.remove('active');
  void el.offsetWidth; // force reflow so pop animation replays
  el.classList.add('active');
}

async function hideBonusCelebration() {
  document.getElementById('bonusCelebration').classList.remove('active');
  await delay(400); // match opacity transition duration
}

async function celebrateBonusBuy(tier, mode) {
  document.getElementById('spinBtn').disabled = true;
  document.querySelectorAll('.cell').forEach(el => el.classList.remove('cell--win'));
  document.getElementById('lastWin').textContent = '$0.00';
  clearWinPanel();

  await spinInGridWithScatters(mode);   // celebration board: 3 scatters (1 jackpot-scatter if Jackpot buy)
  await delay(1000);                // scatters pulse — let the player see them
  await shakeScatters();            // shake the scatters before the celebration

  showBonusCelebration(tier);
  await delay(2200);
  await hideBonusCelebration();

  playJackpotDings();
  await startBonus(mode);
}

function updateFPIndicator() {
  const el      = document.getElementById('fp-indicator');
  const spinsEl = document.getElementById('fp-spins-left');
  const winEl   = document.getElementById('fp-win-total');

  if (spinsEl && winEl) {
    // Hot path: update only the two changing values — no innerHTML rebuild, no reflow
    spinsEl.textContent = freeSpinsRemaining;
    winEl.textContent   = '$' + freePlaySessionWin.toFixed(2);
  } else {
    // First render per bonus: build the static structure once, then never rebuild it
    const mode = currentMode === 'jackpot' ? 'JACKPOT MODE' : 'PRIZE MODE';
    el.innerHTML =
      `${mode} &middot; <span id="fp-spins-left">${freeSpinsRemaining}</span> SPINS LEFT` +
      ` &middot; WON <span id="fp-win-total">$${freePlaySessionWin.toFixed(2)}</span>`;
  }

  if (currentMode === 'jackpot') {
    el.classList.add('fp-indicator--jackpot');
  } else {
    el.classList.remove('fp-indicator--jackpot');
  }
}

function updateUI() {
  document.getElementById('balance').textContent  = '$' + balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('bet').textContent      = '$' + BET_STEPS[betIndex].toFixed(2);
  document.getElementById('betDown').disabled     = betIndex === 0;
  document.getElementById('betUp').disabled       = betIndex === BET_STEPS.length - 1;
  updateModalPrices();
}

// ── Bonus buy modal ──────────────────────────────────────────────────────────

function updateModalPrices() {
  const bet = BET_STEPS[betIndex];
  document.getElementById('tier1Price').textContent = '$' + (bet * PRIZE_BUY_MULT).toFixed(2);
  document.getElementById('tier2Price').textContent = '$' + (bet * JACKPOT_BUY_MULT).toFixed(2);
}

function openModal() {
  updateModalPrices();
  document.getElementById('bonusModal').classList.add('open');
}

function closeModal() {
  document.getElementById('bonusModal').classList.remove('open');
}

document.getElementById('buyBtn').addEventListener('click', () => { playButtonClick(); openModal(); });
document.getElementById('bonusClose').addEventListener('click', closeModal);
document.getElementById('bonusBackdrop').addEventListener('click', closeModal);

let pendingConfirmAction = null;

function openConfirm(label, cost, onConfirm) {
  document.getElementById('confirmLabel').textContent    = `Confirm ${label}`;
  document.getElementById('confirmPriceLine').textContent = `purchase for $${cost.toFixed(2)}?`;
  pendingConfirmAction = onConfirm;
  const overlay = document.getElementById('confirmOverlay');
  overlay.classList.remove('active');
  void overlay.offsetWidth; // force reflow so animation replays
  overlay.classList.add('active');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('active');
  pendingConfirmAction = null;
}

document.querySelector('.card-buy-btn[data-tier="1"]').addEventListener('click', () => {
  playButtonClick();
  const cost = BET_STEPS[betIndex] * PRIZE_BUY_MULT;
  openConfirm('PRIZE MODE', cost, () => {
    if (balance < cost) { alert('Insufficient balance'); return; }
    balance -= cost;
    rtp.bonusWagered += cost;
    updateUI();
    console.log('Prize Mode purchased');
    celebrateBonusBuy(1, 'freeplay');
  });
});

document.querySelector('.card-buy-btn[data-tier="2"]').addEventListener('click', () => {
  playButtonClick();
  const cost = BET_STEPS[betIndex] * JACKPOT_BUY_MULT;
  openConfirm('JACKPOT MODE', cost, () => {
    if (balance < cost) { alert('Insufficient balance'); return; }
    balance -= cost;
    rtp.bonusWagered += cost;
    updateUI();
    console.log('Jackpot Mode purchased');
    celebrateBonusBuy(2, 'jackpot');
  });
});

document.getElementById('confirmYes').addEventListener('click', () => {
  playButtonClick();
  if (pendingConfirmAction) { startMusic(); pendingConfirmAction(); }
  closeConfirm();
  closeModal();
});

document.getElementById('confirmNo').addEventListener('click', closeConfirm);

// ── Info overlay ──────────────────────────────────────────────────────────────

const INFO_TOTAL_PAGES = 8;

// Display-name overrides — changes what the PLAYER SEES; does not rename any id,
// PAY_TABLE key, asset filename, or SYMBOLS[].name code field.
const INFO_SYMBOL_DISPLAY_NAMES = {
  2: 'Alien',       // SYMBOLS[2].name stays 'Robot'
  4: 'Red Ball',    // SYMBOLS[4].name stays 'Pink Token'
  5: 'Blue Ball',   // SYMBOLS[5].name stays 'Blue Token'
  6: 'Orange Ball', // SYMBOLS[6].name stays 'Yellow Token'
};

function _infoSymName(id) {
  return INFO_SYMBOL_DISPLAY_NAMES[id] !== undefined ? INFO_SYMBOL_DISPLAY_NAMES[id] : SYMBOLS[id].name;
}

let _infoPage = 1;

function openInfoOverlay() {
  _infoPage = 1;
  document.getElementById('infoOverlay').classList.add('open');
  _renderInfoPage();
}

function closeInfoOverlay() {
  document.getElementById('infoOverlay').classList.remove('open');
}

function _renderInfoPage() {
  document.getElementById('infoPageIndicator').textContent = `Page ${_infoPage} / ${INFO_TOTAL_PAGES}`;
  document.getElementById('infoPrev').disabled = _infoPage === 1;
  document.getElementById('infoNext').disabled = _infoPage === INFO_TOTAL_PAGES;
  document.getElementById('infoContent').innerHTML = _buildInfoPage(_infoPage);
}

function _buildInfoPage(page) {
  switch (page) {
    case 1: return _infoSymPage('PREMIUM SYMBOLS', [0, 1]);
    case 2: return _infoSymPage('HIGH SYMBOLS',    [2, 3]);
    case 3: return _infoSymPage('LOW SYMBOLS',     [4, 5, 6]);
    case 4: return _infoClustersPage();
    case 5: return _infoMultPage();
    case 6: return _infoWildsPage();
    case 7: return _infoModesPage();
    case 8: return _infoPrizesPage();
    default: return '';
  }
}

function _infoSymPage(title, ids) {
  const bps = PAY_TABLE_BREAKPOINTS;
  let h = `<h2 class="info-page-title">${title}</h2>`;
  h += `<p class="info-pay-label">Cluster size → multiplier (× bet). Values between keypoints are linearly interpolated.</p>`;
  for (const id of ids) {
    const pays = PAY_TABLE[id];
    h += `<div class="info-sym-row">
      <img class="info-sym-icon" src="${SYMBOLS[id].src}" alt="${_infoSymName(id)}" width="44" height="44">
      <div class="info-sym-data">
        <div class="info-sym-name">${_infoSymName(id)}</div>
        <div class="info-pay-row">`;
    for (let i = 0; i < bps.length; i++) {
      const lbl = i === bps.length - 1 ? `${bps[i]}+` : `${bps[i]}`;
      h += `<div class="info-pay-cell">
        <div class="info-pay-header">${lbl}</div>
        <div class="info-pay-value">${pays[i].toFixed(2)}</div>
      </div>`;
    }
    h += `</div></div></div>`;
    if (id !== ids[ids.length - 1]) h += `<hr class="info-divider">`;
  }
  return h;
}

function _infoClustersPage() {
  return `<h2 class="info-page-title">HOW CLUSTERS WORK</h2>
    <div class="info-stat-grid">
      <div class="info-stat-box"><div class="info-stat-label">Grid</div><div class="info-stat-value">${GRID_SIZE}×${GRID_SIZE}</div></div>
      <div class="info-stat-box"><div class="info-stat-label">Min cluster</div><div class="info-stat-value">${MIN_CLUSTER}+</div></div>
    </div>
    <p class="info-text">Connect <strong>${MIN_CLUSTER} or more</strong> of the same symbol horizontally or vertically (no diagonals) on the <strong>${GRID_SIZE}×${GRID_SIZE}</strong> grid to form a winning cluster.</p>
    <p class="info-text"><strong>Wilds</strong> are absorbed into adjacent clusters to boost size — counted at most once per cluster per step.</p>
    <p class="info-text"><strong>Tumbling reels:</strong> winning symbols are removed. New symbols cascade in from above and the step repeats until no clusters form. All tumbles within a spin share accumulated mark state.</p>
    <p class="info-text"><strong>Multiple clusters</strong> pay independently on every step. A wild between two different symbol groups can contribute to both.</p>`;
}

function _infoMultPage() {
  let rows = '';
  for (let wc = 0; wc <= 5; wc++) {
    const mult = wc === 0 ? 0 : Math.min(MAX_CELL_MULT, Math.pow(2, wc));
    const lbl  = wc === 5 ? '5+' : String(wc);
    rows += `<tr><td class="accent">${lbl}</td><td>${mult === 0 ? '0×' : mult + '×'}</td></tr>`;
  }
  return `<h2 class="info-page-title">MULTIPLIER MARKS</h2>
    <p class="info-text">Each cell tracks how many winning clusters it has contributed to (<em>win-count</em>). The win-count determines the cell's ticket multiplier, capped at <strong>${MAX_CELL_MULT}×</strong>:</p>
    <table class="info-table">
      <thead><tr><th>Win-count</th><th>Ticket multiplier</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="info-text"><strong>Payout formula:</strong> cluster base pay × max(1, sum of all ticket values in the cluster). Each cell contributes its ticket independently.</p>
    <p class="info-text"><strong>Sticky spots</strong> (CLAW prizes) add a permanent flat multiplier to a cell, stacking additively with the ticket on the same cell.</p>
    <p class="info-text">Win-counts persist across tumbles within a spin. In bonus modes they also persist across spins — building across the full session.</p>`;
}

function _infoWildsPage() {
  const scatterRows = SCATTER_SPINS_TABLE.map(([cnt, spins], i) => {
    const lbl = i === SCATTER_SPINS_TABLE.length - 1 ? `${cnt}+` : String(cnt);
    return `<tr><td class="accent">${lbl} scatters</td><td>${spins} spins</td></tr>`;
  }).join('');
  return `<h2 class="info-page-title">WILDS & SCATTERS</h2>
    <p class="info-text"><strong>Wild</strong> substitutes for any normal symbol. It boosts adjacent cluster size but never receives a win-count ticket itself. A wild can contribute to clusters of different symbol types in the same step.</p>
    <hr class="info-divider">
    <div class="info-sym-row" style="align-items:flex-start">
      <img class="info-sym-icon" src="${SYMBOLS[SCATTER_ID].src}" alt="Scatter" width="56" height="56">
      <div class="info-sym-data">
        <p class="info-text"><strong>Scatter</strong>: collect <strong>3 or more</strong> on the same spin to trigger <strong>Prize Mode</strong>. More scatters = more free spins:</p>
        <table class="info-table">
          <thead><tr><th>Scatters landed</th><th>Free spins</th></tr></thead>
          <tbody>${scatterRows}</tbody>
        </table>
      </div>
    </div>
    <hr class="info-divider">
    <div class="info-sym-row" style="align-items:flex-start">
      <img class="info-sym-icon" src="${SYMBOLS[JACKPOT_SCATTER_ID].src}" alt="Jackpot Scatter" width="56" height="56">
      <div class="info-sym-data">
        <p class="info-text"><strong>Jackpot Scatter</strong>: a single Jackpot Scatter triggers <strong>Jackpot Mode</strong> directly, overriding Prize Mode even if 3+ regular scatters are also present. Counts toward the scatter total for spin-count purposes.</p>
      </div>
    </div>
    <p class="info-text">In-bonus scatters retrigger additional spins, subject to the ${MAX_SPINS_PER_BONUS}-spin session cap.</p>`;
}

function _infoModesPage() {
  const bet = BET_STEPS[betIndex];
  return `<h2 class="info-page-title">BONUS MODES</h2>
    <div class="info-mode-block">
      <div class="info-mode-title prize-color">PRIZE MODE</div>
      <div class="info-stat-grid">
        <div class="info-stat-box"><div class="info-stat-label">Buy cost</div><div class="info-stat-value">${PRIZE_BUY_MULT}×</div></div>
        <div class="info-stat-box"><div class="info-stat-label">At $${bet.toFixed(2)} bet</div><div class="info-stat-value">$${(bet * PRIZE_BUY_MULT).toFixed(2)}</div></div>
        <div class="info-stat-box"><div class="info-stat-label">CLAW rate</div><div class="info-stat-value">${(CLAW_CHANCE_PRIZE * 100).toFixed(1)}%</div></div>
        <div class="info-stat-box"><div class="info-stat-label">Golden CLAW</div><div class="info-stat-value">${(GOLDEN_CLAW_RATE_PRIZE * 100).toFixed(0)}%</div></div>
      </div>
      <p class="info-text" style="margin:6px 0 0">Persistent multiplier marks. CLAW drops prizes from the standard pool. Golden CLAW guarantees a top-tier prize.</p>
    </div>
    <div class="info-mode-block">
      <div class="info-mode-title jackpot-color">JACKPOT MODE</div>
      <div class="info-stat-grid">
        <div class="info-stat-box"><div class="info-stat-label">Buy cost</div><div class="info-stat-value">${JACKPOT_BUY_MULT}×</div></div>
        <div class="info-stat-box"><div class="info-stat-label">At $${bet.toFixed(2)} bet</div><div class="info-stat-value">$${(bet * JACKPOT_BUY_MULT).toFixed(2)}</div></div>
        <div class="info-stat-box"><div class="info-stat-label">CLAW rate</div><div class="info-stat-value">${(CLAW_CHANCE_JACKPOT * 100).toFixed(1)}%</div></div>
        <div class="info-stat-box"><div class="info-stat-label">Golden CLAW</div><div class="info-stat-value">${(GOLDEN_CLAW_RATE_JACKPOT * 100).toFixed(0)}%</div></div>
      </div>
      <p class="info-text" style="margin:6px 0 0">Same engine as Prize Mode — 4.5× higher CLAW rate, jackpot-exclusive prize pool, sticky wilds persist for the full session.</p>
    </div>
    <p class="info-text" style="color:rgba(255,255,255,0.4);font-size:12px;margin:0">Both modes: max <strong style="color:rgba(255,255,255,0.6)">${MAX_SPINS_PER_BONUS}</strong> spins per session including retriggered spins.</p>`;
}

function _infoPrizesPage() {
  const desc = (name) => {
    switch (name) {
      case 'plus_three_spins':       return `+${PLUS_THREE_VALUE} spins`;
      case 'plus_ten_spins':         return `+${PLUS_TEN_VALUE} spins`;
      case 'extra_spins':            return `+${EXTRA_SPINS_ROLLS.join('/')} spins (rolled)`;
      case 'single_wild':            return `Place 1 sticky wild`;
      case 'double_wild':            return `Place 2 sticky wilds`;
      case 'cash_100x':              return `+${CASH_100X_VALUE}× instant cash`;
      case 'small_cash':             return `+${SMALL_CASH_ROLLS.join('/')}× cash (rolled)`;
      case 'seed_bomb':              return `Stamp ${SEED_BOMB_CELL_COUNT} cells → ${Math.min(MAX_CELL_MULT, 2 ** SEED_BOMB_MIN_WC)}× ticket`;
      case 'sticky_50x_spot':        return `+${STICKY_50X_VALUE}× sticky on 1 cell`;
      case 'small_sticky_spot':      return `+${SMALL_STICKY_ROLLS.join('/')}× sticky (rolled)`;
      case 'big_rolled_sticky_spot': return `+${BIG_STICKY_ROLLS.join('/')}× sticky (top-skewed roll)`;
      case 'board_double':           return `All marks +1 win-count (cap ${BOARD_DOUBLE_CAP_WC})`;
      case 'rolled_wild_count':      return `${ROLLED_WILD_COUNTS.join(' or ')} sticky wilds (rolled)`;
      case 'multiplier_rain':        return `${MULT_RAIN_COUNTS.join('/')} cells × +${MULT_RAIN_ROLLS.join('/')}× sticky (rolled)`;
      case 'board_frenzy':           return `Wilds + spots ${FRENZY_SPOT_ROLLS.join('/')}×; Mega ${(FRENZY_MEGA_CHANCE*100).toFixed(0)}%: ${FRENZY_MEGA_SPOT_ROLLS.join('/')}×`;
      default: return '—';
    }
  };
  const buildRows = (pool) => pool.map(([name]) =>
    `<tr><td style="white-space:nowrap">${PRIZE_LABELS[name] ?? name}</td><td>${desc(name)}</td></tr>`
  ).join('');

  return `<h2 class="info-page-title">PRIZES & CAPS</h2>
    <p class="info-text" style="margin-bottom:4px"><strong>PRIZE MODE</strong> pool (${CLAW_PRIZES.length} prizes):</p>
    <table class="info-table"><thead><tr><th>Prize</th><th>Effect</th></tr></thead><tbody>${buildRows(CLAW_PRIZES)}</tbody></table>
    <p class="info-text" style="margin:12px 0 4px"><strong>JACKPOT MODE</strong> pool (${JACKPOT_CLAW_PRIZES.length} prizes):</p>
    <table class="info-table"><thead><tr><th>Prize</th><th>Effect</th></tr></thead><tbody>${buildRows(JACKPOT_CLAW_PRIZES)}</tbody></table>
    <hr class="info-divider">
    <p class="info-text" style="font-size:12px;color:rgba(255,255,255,0.5)">
      Max win <strong style="color:#f0c040">${MAX_WIN_MULTIPLIER.toLocaleString()}×</strong> bet ·
      Max <strong style="color:#f0c040">${MAX_SPINS_PER_BONUS}</strong> spins per session ·
      Max <strong style="color:#f0c040">${MAX_TUMBLES_PER_SPIN}</strong> tumbles per spin
    </p>`;
}

document.getElementById('infoBtn').addEventListener('click', openInfoOverlay);
document.getElementById('infoClose').addEventListener('click', closeInfoOverlay);
document.getElementById('infoBackdrop').addEventListener('click', closeInfoOverlay);
document.getElementById('infoPrev').addEventListener('click', () => {
  if (_infoPage > 1) { _infoPage--; _renderInfoPage(); }
});
document.getElementById('infoNext').addEventListener('click', () => {
  if (_infoPage < INFO_TOTAL_PAGES) { _infoPage++; _renderInfoPage(); }
});

document.getElementById('spinBtn').addEventListener('click', () => {
  startMusic();
  console.log(`[spin click] currentMode=${currentMode}`);
  spin();
});
document.getElementById('betDown').addEventListener('click', () => {
  if (!isSpinning && betIndex > 0) { betIndex--; updateUI(); }
});
document.getElementById('betUp').addEventListener('click', () => {
  if (!isSpinning && betIndex < BET_STEPS.length - 1) { betIndex++; updateUI(); }
});

// ── Background music ─────────────────────────────────────────────────────────

const bgMusic = new Audio('assets/Prize Drop Parade.mp3');
bgMusic.loop   = true;
bgMusic.volume = 0.3;

let musicStarted = false;

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  bgMusic.play().catch(() => {});
}

const clusterChing = new Audio('assets/cluster-ching.mp3');
clusterChing.volume = 0.52;

function playClusterChing() {
  if (bgMusic.muted) return;
  const ching = clusterChing.cloneNode();
  ching.volume = 0.52;
  ching.play().catch(() => {});
}

const tumbleDropSrc = new Audio('assets/tumble-drop.mp3');
tumbleDropSrc.volume = 0.4;

function playTumbleDrop() {
  if (bgMusic.muted) return;
  const drop = tumbleDropSrc.cloneNode();
  drop.volume = 0.4;
  drop.play().catch(() => {});
}

const btnClickSrc = new Audio('assets/button-click.mp3');
btnClickSrc.volume = 0.5;

function playButtonClick() {
  if (bgMusic.muted) return;
  const click = btnClickSrc.cloneNode();
  click.volume = 0.5;
  click.play().catch(() => {});
}

const jackpotDingsSrc = new Audio('assets/jackpot-dings.mp3');
jackpotDingsSrc.volume = 0.55;

function playJackpotDings() {
  if (bgMusic.muted) return;
  const ding = jackpotDingsSrc.cloneNode();
  ding.volume = 0.55;
  ding.play().catch(() => {});
}

const clawAlarmSrc = new Audio('assets/claw-alarm.mp3');
clawAlarmSrc.volume = 0.65;

function playClawAlarm() {
  if (bgMusic.muted) return;
  const alarm = clawAlarmSrc.cloneNode();
  alarm.volume = 0.65;
  alarm.play().catch(() => {});
}

// Fires jackpot-dings the first time 3+ scatters appear on the board this base spin.
let _scatterDingsThisSpin = false;
function maybePlayScatterDings() {
  if (_scatterDingsThisSpin) return;
  if (currentMode !== 'base') return;
  if (countScattersQuiet() < 3) return;
  _scatterDingsThisSpin = true;
  playJackpotDings();
}

document.getElementById('settingsBtn').addEventListener('click', () => {
  bgMusic.muted = !bgMusic.muted;
  document.getElementById('settingsBtn').classList.toggle('btn-settings--muted', bgMusic.muted);
});

initGrid();
updateUI();

// Inject overlays at body level so they escape .reel-area's overflow/stacking context.
(function () {
  const notif = document.createElement('div');
  notif.id        = 'scatterNotif';
  notif.className = 'scatter-notif';
  notif.innerHTML =
    '<div class="scatter-notif-panel">' +
      '<div class="scatter-notif-title"></div>' +
      '<div class="scatter-notif-sub"></div>' +
    '</div>';
  document.body.appendChild(notif);

  const clawAssembly = document.createElement('div');
  clawAssembly.id = 'claw-assembly';
  clawAssembly.innerHTML =
    '<div id="claw-cord"></div>' +
    '<img id="claw-head" src="" alt="" draggable="false">';
  document.body.appendChild(clawAssembly);

  const rainbowFlash = document.createElement('div');
  rainbowFlash.id = 'claw-rainbow-flash';
  document.body.appendChild(rainbowFlash);

  const prizeReveal = document.createElement('div');
  prizeReveal.id = 'prize-reveal';
  document.body.appendChild(prizeReveal);
}());

// Align the buy-bonus button's top edge with the first row of the grid.
function alignBuyButton() {
  const btn     = document.querySelector('.btn-buy');
  const grid    = document.getElementById('grid');
  const reelCol = document.querySelector('.reel-column');
  if (!btn || !grid || !reelCol) return;
  const offset = grid.getBoundingClientRect().top - reelCol.getBoundingClientRect().top;
  btn.style.top = offset + 'px';
}
requestAnimationFrame(alignBuyButton);
window.addEventListener('resize', alignBuyButton);
