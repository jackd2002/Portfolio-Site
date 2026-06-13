'use strict';

// ── Constants — verbatim from game.js ─────────────────────────────────────────
const GRID_SIZE          = 7;
const WILD_CELL          = 7;
const SCATTER_ID         = 8;
const JACKPOT_SCATTER_ID = 9;

const PAY_TABLE = [
  [1.0,  2.5,  7.5,  15.0, 150.0],  // Gold Teddy
  [0.75, 2.0,  6.0,  12.5, 100.0],  // Unicorn
  [0.5,  1.75, 4.0,  10.0,  60.0],  // Robot
  [0.4,  1.25, 3.0,   7.0,  40.0],  // Duck
  [0.3,  0.75, 2.0,   5.5,  30.0],  // Pink Token
  [0.25, 0.4,  1.25,  2.75, 25.0],  // Blue Token
  [0.2,  0.25, 1.0,   2.5,  20.0],  // Yellow Token
];

const SYMBOL_WEIGHTS   = [14, 17, 18, 16, 12, 11, 10];
const SYM_CUM_WEIGHTS  = SYMBOL_WEIGHTS.reduce((acc, w, i) => { acc.push((acc[i-1] ?? 0) + w); return acc; }, []);
const SYM_TOTAL_WEIGHT = SYM_CUM_WEIGHTS[SYM_CUM_WEIGHTS.length - 1];

const BASE_SCATTER_CHANCE    = 0.0057;
const BONUS_SCATTER_CHANCE   = 0.0107;
const JACKPOT_SCATTER_CHANCE = 0.000002;

const CLAW_PRIZES = [
  ['plus_three_spins', 31],
  ['single_wild',      25],
  ['double_wild',      14],
  ['cash_100x',        10],
  ['seed_bomb',         7],
  ['plus_ten_spins',    6],
  ['sticky_50x_spot',   4],
  ['board_double',      3],
];
const CLAW_PRIZE_TOTAL = CLAW_PRIZES.reduce((s, [, w]) => s + w, 0);

const JACKPOT_CLAW_PRIZES = [
  ['plus_three_spins', 30],
  ['single_wild',      24],
  ['double_wild',      13],
  ['cash_100x',        10],
  ['seed_bomb',         7],
  ['plus_ten_spins',    6],
  ['sticky_50x_spot',   4],
  ['board_double',      2],
  ['mega_multiplier',   2],
  ['wild_rain',         2],
];
const JACKPOT_CLAW_PRIZE_TOTAL = JACKPOT_CLAW_PRIZES.reduce((s, [, w]) => s + w, 0);

const CLAW_CHANCE_PRIZE   = 0.020;
const CLAW_CHANCE_JACKPOT = 0.056;
const MAX_SPINS_PER_BONUS  = 50;
const MAX_WIN_MULTIPLIER   = 30000;

const BASE_BIAS  = 0.0;
const BONUS_BIAS = 0.25;

const MAX_TUMBLES_PER_SPIN = 100;  // safety cap matching Python sim

// ── Mutable state (reset per bonus) ──────────────────────────────────────────
let symIds    = [];
let winCounts = [];
let stickySpots        = {};
let jackpotStickyWilds = new Set();
let prizeStickyWilds   = new Set();
let currentMode        = 'base';
let freeSpinsRemaining = 0;
let bonusSpinsPlayed   = 0;
let freePlaySessionWin = 0;

// ── Core helpers (exact logic from game.js, DOM calls stripped) ───────────────

function initArrays() {
  symIds    = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(null));
  winCounts = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(0));
}

// Returns a raw symId integer (game.js randomSymbol() returns a SYMBOLS object)
function randomSymbol() {
  if (currentMode === 'base' && Math.random() < JACKPOT_SCATTER_CHANCE) return JACKPOT_SCATTER_ID;
  const scatterChance = currentMode === 'base' ? BASE_SCATTER_CHANCE : BONUS_SCATTER_CHANCE;
  if (Math.random() < scatterChance) return SCATTER_ID;
  const r = Math.random() * SYM_TOTAL_WEIGHT;
  for (let i = 0; i < SYM_CUM_WEIGHTS.length; i++) if (r < SYM_CUM_WEIGHTS[i]) return i;
  return 6;
}

function detectClusters() {
  const clusters = [];
  for (let symId = 0; symId < 7; symId++) {
    const realVisited = new Set();
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (symIds[r][c] !== symId) continue;
        const key = `${r},${c}`;
        if (realVisited.has(key)) continue;
        const wildsAdded = new Set();
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
              if (!wildsAdded.has(nk)) { wildsAdded.add(nk); group.push({ row: nr, col: nc }); }
            } else if (adj === symId && !realVisited.has(nk)) {
              realVisited.add(nk);
              queue.push({ r: nr, c: nc });
            }
          }
        }
        if (group.length >= 5) clusters.push({ symId, cells: group });
      }
    }
  }
  return clusters;
}

function baseMultiplier(symId, size) {
  if (size < 5) return 0;
  const [m5, m7, m10, m12, m15] = PAY_TABLE[symId];
  if (size >= 15) return m15;
  if (size >= 12) return m12 + (size - 12) / 3 * (m15 - m12);
  if (size >= 10) return m10 + (size - 10) / 2 * (m12 - m10);
  if (size >=  7) return m7  + (size - 7)  / 3 * (m10 - m7);
  return               m5  + (size - 5)  / 2 * (m7  - m5);
}

function cellMultiplier(r, c) {
  const wc = winCounts[r][c];
  return wc === 0 ? 0 : Math.min(512, Math.pow(2, wc));
}

function clusterPayout(cluster, bet) {
  const base    = baseMultiplier(cluster.symId, cluster.cells.length) * bet;
  const multSum = cluster.cells.reduce((s, { row, col }) => {
    let m = cellMultiplier(row, col);
    const sk = stickySpots[`${row},${col}`];
    if (sk) m += sk;
    return s + m;
  }, 0);
  return base * Math.max(1, multSum);
}

function updateWinCounts(clusters) {
  for (const { cells } of clusters)
    for (const { row, col } of cells)
      if (symIds[row][col] !== WILD_CELL) winCounts[row][col]++;
}

function resetWinCounts() {
  for (let r = 0; r < GRID_SIZE; r++) winCounts[r].fill(0);
}

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

function setWild(r, c) {
  symIds[r][c] = WILD_CELL;
}

function drawPrize() {
  const pool  = currentMode === 'jackpot' ? JACKPOT_CLAW_PRIZES : CLAW_PRIZES;
  const total = currentMode === 'jackpot' ? JACKPOT_CLAW_PRIZE_TOTAL : CLAW_PRIZE_TOTAL;
  let roll = Math.random() * total;
  for (const [name, w] of pool) {
    roll -= w;
    if (roll < 0) return name;
  }
  return pool[pool.length - 1][0];
}

function applyPrize(prize, bet) {
  if (prize === 'single_wild') {
    const cands = realCells();
    if (cands.length) {
      const [r, c] = cands[Math.floor(Math.random() * cands.length)];
      setWild(r, c);
    }
  } else if (prize === 'double_wild') {
    const cands = realCells();
    shuffleArr(cands);
    for (const [r, c] of cands.slice(0, 2)) setWild(r, c);
  } else if (prize === 'seed_bomb') {
    const cands = realCells();
    shuffleArr(cands);
    for (const [r, c] of cands.slice(0, 5))
      winCounts[r][c] = Math.max(winCounts[r][c], 3);
  } else if (prize === 'cash_100x') {
    return 100 * bet;
  } else if (prize === 'sticky_50x_spot') {
    const cands = realCells();
    if (cands.length) {
      const [r, c] = cands[Math.floor(Math.random() * cands.length)];
      const key = `${r},${c}`;
      stickySpots[key] = (stickySpots[key] || 0) + 50;
    }
  } else if (prize === 'board_double') {
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (winCounts[r][c] > 0) winCounts[r][c] = Math.min(winCounts[r][c] + 1, 8);
  } else if (prize === 'mega_multiplier') {
    // Jackpot-exclusive; cap=10 matches sim (board_double stays at 8 for game.js parity)
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (winCounts[r][c] > 0) winCounts[r][c] = Math.min(winCounts[r][c] + 1, 10);
  } else if (prize === 'wild_rain') {
    // Jackpot-exclusive: place 5 wilds on random real-symbol cells; become sticky via end-of-spin snapshot
    const cands = realCells();
    shuffleArr(cands);
    for (const [r, c] of cands.slice(0, 5)) setWild(r, c);
  }
  return 0;
}

// ── Sync physics (no DOM, no animation delays) ────────────────────────────────

function spinBoardSync() {
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      symIds[r][c] = randomSymbol();
}

// Gravity + fill matching game.js tumble() two-phase approach:
// Phase A: move all survivors to bottom of each column (committed to symIds).
// Phase B: fill new top cells left-to-right (so later columns see earlier fills as neighbours).
// Jackpot mode: sticky wilds are pinned — excluded from gravity, restored after Phase B.
function tumbleSync() {
  const bias = currentMode === 'base' ? BASE_BIAS : BONUS_BIAS;

  // Bonus modes: pin sticky wilds before gravity; restore them after.
  const pinnedWilds = [];
  if (currentMode === 'jackpot' || currentMode === 'freeplay') {
    const activeStickyWilds = currentMode === 'jackpot' ? jackpotStickyWilds : prizeStickyWilds;
    for (const key of activeStickyWilds) {
      const [r, c] = key.split(',').map(Number);
      if (symIds[r][c] === WILD_CELL) {
        pinnedWilds.push([r, c]);
        symIds[r][c] = null;
      }
    }
  }

  // Phase A: gravity for all columns
  const columnLayouts = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    const survivors = [];
    for (let row = 0; row < GRID_SIZE; row++)
      if (symIds[row][col] !== null) survivors.push(symIds[row][col]);
    const newCount = GRID_SIZE - survivors.length;
    columnLayouts.push({ col, newCount });
    if (newCount === 0) continue;
    for (let row = 0; row < GRID_SIZE; row++) symIds[row][col] = null;
    for (let i = 0; i < survivors.length; i++) symIds[newCount + i][col] = survivors[i];
  }

  // Phase B: fill new cells (top rows) left-to-right
  for (const { col, newCount } of columnLayouts) {
    if (newCount === 0) continue;
    for (let i = 0; i < newCount; i++) {
      let symId;
      if (bias > 0 && Math.random() < bias) {
        const eligible = [];
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = i + dr, nc = col + dc;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
          const nId = symIds[nr][nc];
          if (nId === null || nId >= WILD_CELL) continue;  // normal symbols only (0–6)
          eligible.push(nId);
        }
        symId = eligible.length > 0
          ? eligible[Math.floor(Math.random() * eligible.length)]
          : randomSymbol();
      } else {
        symId = randomSymbol();
      }
      symIds[i][col] = symId;
    }
  }

  // Restore pinned wilds — overwrite whatever gravity placed at those positions.
  for (const [r, c] of pinnedWilds) {
    symIds[r][c] = WILD_CELL;
  }
}

function explodeClusters(clusters) {
  const positions = new Set(
    clusters.flatMap(({ cells }) =>
      cells
        .filter(({ row, col }) => symIds[row][col] !== WILD_CELL)
        .map(({ row, col }) => `${row},${col}`)
    )
  );
  for (const key of positions) {
    const [r, c] = key.split(',').map(Number);
    symIds[r][c] = null;
  }
}

function countScattersQuiet() {
  let n = 0;
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (symIds[r][c] === SCATTER_ID || symIds[r][c] === JACKPOT_SCATTER_ID) n++;
  return n;
}

function scatterSpins(count) {
  if (count >= 7) return 30;
  if (count >= 6) return 20;
  if (count >= 5) return 15;
  if (count >= 4) return 12;
  return 10;
}

// Matches runTumbleSequence() — no DOM/delays, returns spinWin in bet units.
// tumbleCap stats are accumulated in the passed-in stats object.
function runTumbleSync(bet, stats) {
  let spinWin = 0;
  let endCascadeClawDone = false;
  const clawChance = currentMode === 'jackpot' ? CLAW_CHANCE_JACKPOT : CLAW_CHANCE_PRIZE;
  let tumbleCount = 0;

  while (true) {
    if (tumbleCount >= MAX_TUMBLES_PER_SPIN) {
      stats.tumbleCapHits++;
      break;
    }

    const clusters = detectClusters();

    if (!clusters.length) {
      // End-of-cascade claw roll (once per spin, matching game.js endCascadeClawDone flag)
      if (!endCascadeClawDone && currentMode !== 'base') {
        endCascadeClawDone = true;
        if (Math.random() < clawChance) {
          const prize = drawPrize();
          if (prize === 'plus_ten_spins' || prize === 'plus_three_spins') {
            if (bonusSpinsPlayed < MAX_SPINS_PER_BONUS) {
              freeSpinsRemaining += prize === 'plus_ten_spins' ? 10 : 3;
            }
          } else {
            const pw = applyPrize(prize, bet);
            spinWin += pw;
            stats.prizeWin += pw;
          }
          continue;  // re-detect after prize (may form new clusters via wilds)
        }
      }
      break;
    }

    // Pay using winCounts BEFORE incrementing (matches game.js order)
    let stepWin = 0;
    for (const cluster of clusters) stepWin += clusterPayout(cluster, bet);
    spinWin += stepWin;
    stats.clusterWin += stepWin;
    updateWinCounts(clusters);
    explodeClusters(clusters);
    tumbleSync();
    tumbleCount++;
    stats.totalTumbles++;

    // Per-tumble claw roll (matches game.js per-tumble roll after new cells land)
    if (currentMode !== 'base') {
      if (Math.random() < clawChance) {
        const prize = drawPrize();
        if (prize === 'plus_ten_spins' || prize === 'plus_three_spins') {
          if (bonusSpinsPlayed < MAX_SPINS_PER_BONUS) {
            freeSpinsRemaining += prize === 'plus_ten_spins' ? 10 : 3;
          }
        } else {
          const pw = applyPrize(prize, bet);
          spinWin += pw;
          stats.prizeWin += pw;
        }
      }
    }
  }

  // Per-spin cap (base mode only; bonus uses session cap in runBonusSync)
  const capAmount = MAX_WIN_MULTIPLIER * bet;
  if (currentMode === 'base' && spinWin > capAmount) spinWin = capAmount;

  return spinWin;
}

// Runs one complete bonus session. Returns total session win as a multiplier (÷ bet).
function runBonusSync(mode, stats) {
  const bet = 1.0;  // normalised — all returns are in units of bet

  currentMode        = mode;
  freeSpinsRemaining = 10;
  bonusSpinsPlayed   = 0;
  freePlaySessionWin = 0;
  stickySpots        = {};
  jackpotStickyWilds = new Set();
  prizeStickyWilds   = new Set();
  initArrays();
  // Pre-seed win-counts at bonus start — Jackpot: all 49 cells wc=1 (2x on first win). Prize: no pre-seed.
  if (mode === 'jackpot') {
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        winCounts[r][c] = 1;
  }

  while (freeSpinsRemaining > 0 && bonusSpinsPlayed < MAX_SPINS_PER_BONUS) {
    // Roll fresh board
    spinBoardSync();

    // Bonus modes: re-apply surviving sticky wilds over the fresh board
    if (currentMode === 'jackpot') {
      for (const key of jackpotStickyWilds) {
        const [r, c] = key.split(',').map(Number);
        symIds[r][c] = WILD_CELL;
      }
    } else if (currentMode === 'freeplay') {
      for (const key of prizeStickyWilds) {
        const [r, c] = key.split(',').map(Number);
        symIds[r][c] = WILD_CELL;
      }
    }

    // Full cascade
    const spinWin = runTumbleSync(bet, stats);
    freePlaySessionWin += spinWin;
    stats.totalSpins++;

    // Bonus modes: snapshot surviving wilds for next spin
    if (currentMode === 'jackpot') {
      jackpotStickyWilds = new Set();
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (symIds[r][c] === WILD_CELL) jackpotStickyWilds.add(`${r},${c}`);
    } else if (currentMode === 'freeplay') {
      prizeStickyWilds = new Set();
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (symIds[r][c] === WILD_CELL) prizeStickyWilds.add(`${r},${c}`);
    }

    // Decrement spins (matching spin() order in game.js)
    freeSpinsRemaining -= 1;
    bonusSpinsPlayed   += 1;

    // Session win cap — matches game.js: strict >, retrigger still runs after cap
    const bonusCap = MAX_WIN_MULTIPLIER * bet;
    if (freePlaySessionWin > bonusCap) {
      freePlaySessionWin = bonusCap;
      freeSpinsRemaining = 0;
    }

    // Scatter retrigger check (matches game.js: fires even if cap zeroed freeSpinsRemaining)
    const scatterCount = countScattersQuiet();
    if (scatterCount >= 3 && bonusSpinsPlayed < MAX_SPINS_PER_BONUS) {
      freeSpinsRemaining += scatterSpins(scatterCount);
      stats.retriggersInBonus++;
    }
  }

  // Track avg winCount per cell at bonus end (diagnostic only)
  let wcSum = 0;
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      wcSum += winCounts[r][c];
  stats.totalWcAtBonusEnd += wcSum;

  // Clean up (matches game.js startBonus reset + end-of-bonus reset)
  resetWinCounts();
  stickySpots        = {};
  jackpotStickyWilds = new Set();
  prizeStickyWilds   = new Set();

  return freePlaySessionWin / bet;
}

// ── Simulation ────────────────────────────────────────────────────────────────

function runSim(mode, N) {
  const label = mode === 'jackpot' ? 'JACKPOT MODE' : 'PRIZE MODE';
  const buyMultiple = mode === 'jackpot' ? 565 : 95;

  const stats = {
    tumbleCapHits:      0,
    retriggersInBonus:  0,
    totalSpins:         0,
    totalTumbles:       0,
    clusterWin:         0,
    prizeWin:           0,
    totalWcAtBonusEnd:  0,
  };

  const t0 = Date.now();
  let totalReturn = 0;
  let cappedCount = 0;
  const buckets = { '0-50': 0, '50-100': 0, '100-200': 0, '200-500': 0, '500-1000': 0, '1000-5000': 0, '5000-10000': 0, '10000+': 0 };

  for (let i = 0; i < N; i++) {
    const ret = runBonusSync(mode, stats);
    totalReturn += ret;
    if (ret >= MAX_WIN_MULTIPLIER) cappedCount++;
    if      (ret <    50) buckets['0-50']++;
    else if (ret <   100) buckets['50-100']++;
    else if (ret <   200) buckets['100-200']++;
    else if (ret <   500) buckets['200-500']++;
    else if (ret <  1000) buckets['500-1000']++;
    else if (ret <  5000) buckets['1000-5000']++;
    else if (ret < 10000) buckets['5000-10000']++;
    else                  buckets['10000+']++;
  }

  const elapsed  = ((Date.now() - t0) / 1000).toFixed(1);
  const avgReturn = (totalReturn / N).toFixed(2);
  const medianApprox = cappedCount > N / 2 ? `≥${MAX_WIN_MULTIPLIER}` : '<' + MAX_WIN_MULTIPLIER;
  const rtp = (totalReturn / N / buyMultiple * 100).toFixed(2);

  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  ${label} SIMULATION`);
  console.log(`  ${N.toLocaleString()} bonuses   Buy cost: ${buyMultiple}× bet`);
  console.log('══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Avg return per bonus     ${avgReturn}× bet`);
  console.log(`  Bonus RTP                ${rtp}%  (avg ÷ buy cost)`);
  console.log(`  Bonuses hitting 30000x cap  ${cappedCount.toLocaleString()}  (${(cappedCount/N*100).toFixed(1)}%)`);
  console.log(`  Median approx            ${medianApprox}× bet`);
  console.log(`  Tumble-cap hits          ${stats.tumbleCapHits.toLocaleString()}  (${(stats.tumbleCapHits/N*100).toFixed(2)}% of bonuses)`);
  console.log(`  In-bonus retriggered     ${stats.retriggersInBonus.toLocaleString()}`);
  console.log(`  Elapsed                  ${elapsed}s  (${Math.round(N / parseFloat(elapsed))}/s)`);
  console.log('');
  const avgSpins   = (stats.totalSpins   / N).toFixed(3);
  const avgTumbles = stats.totalSpins > 0 ? (stats.totalTumbles / stats.totalSpins).toFixed(3) : '0';
  const avgClWin   = (stats.clusterWin   / N).toFixed(3);
  const avgPzWin   = (stats.prizeWin     / N).toFixed(3);
  const avgWinPS   = stats.totalSpins > 0 ? (totalReturn / stats.totalSpins).toFixed(3) : '0';
  const avgWcEnd = (stats.totalWcAtBonusEnd / N / (GRID_SIZE * GRID_SIZE)).toFixed(4);
  console.log(`  -- DIAGNOSTICS --`);
  console.log(`  Avg spins/bonus          ${avgSpins}    (Python Prize target: 12.860)`);
  console.log(`  Avg tumbles/spin         ${avgTumbles}    (Python Prize target:  0.420)`);
  console.log(`  Avg cluster win/bonus    ${avgClWin}`);
  console.log(`  Avg prize win/bonus      ${avgPzWin}`);
  console.log(`  Avg total win/spin       ${avgWinPS}`);
  console.log(`  Avg wc/cell at bonus end ${avgWcEnd}`);
  console.log('');
  console.log('  Outcome distribution:');
  for (const [range, count] of Object.entries(buckets)) {
    const pct = (count / N * 100).toFixed(1);
    const bar = '#'.repeat(Math.round(count / N * 40));
    console.log(`    ${range.padEnd(12)} ${count.toString().padStart(7)}  ${pct.padStart(5)}%  ${bar}`);
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const N = 30000;

console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('  Ze-Claw headless RTP test  (synced to locked sim config)');
console.log(`  ${N.toLocaleString()} Prize bonuses (95× buy) + ${N.toLocaleString()} Jackpot bonuses (565× buy)`);
console.log('══════════════════════════════════════════════════════');

runSim('freeplay', N);
//runSim('jackpot',N);

console.log('══════════════════════════════════════════════════════');
console.log('  Locked sim targets (100k bonus runs each):');
console.log('    Prize  avg ≈  88x  (~93% RTP on 95× buy)');
console.log('    Jackpot avg ≈ 531x  (~94% RTP on 565× buy)');
console.log('  Within ~5% of those targets = port is correct.');
console.log('══════════════════════════════════════════════════════');
console.log('');

