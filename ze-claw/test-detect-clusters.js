'use strict';

// ── Extracted constants from game.js ─────────────────────────────────────────
const GRID_SIZE = 7;
const CLAW_ID            = 7;
const SCATTER_ID         = 8;
const JACKPOT_SCATTER_ID = 9;

const SYMBOL_WEIGHTS  = [14, 17, 18, 16, 12, 11, 10];
const SYM_CUM_WEIGHTS = SYMBOL_WEIGHTS.reduce((acc, w, i) => { acc.push((acc[i-1] ?? 0) + w); return acc; }, []);
const SYM_TOTAL_WEIGHT = SYM_CUM_WEIGHTS[SYM_CUM_WEIGHTS.length - 1];
const BASE_SCATTER_CHANCE    = 0.0057;
const JACKPOT_SCATTER_CHANCE = 0.000002;

// ── Shared state ──────────────────────────────────────────────────────────────
let symIds = [];

// ── detectClusters — verbatim copy from game.js Stage 1 ──────────────────────
function detectClusters() {
  const clusters = [];

  for (let symId = 0; symId < 7; symId++) {
    const visited = new Set();

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (symIds[r][c] !== symId) continue;
        const key = `${r},${c}`;
        if (visited.has(key)) continue;

        const queue = [{ r, c }];
        const group = [];
        visited.add(key);

        while (queue.length) {
          const { r: row, c: col } = queue.shift();
          group.push({ row, col });

          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
            if (symIds[nr][nc] !== symId) continue;
            const nk = `${nr},${nc}`;
            if (visited.has(nk)) continue;
            visited.add(nk);
            queue.push({ r: nr, c: nc });
          }
        }

        if (group.length >= 5) clusters.push({ symId, cells: group });
      }
    }
  }

  return clusters;
}

// ── Board builder ─────────────────────────────────────────────────────────────
// Fill entire grid with filler (default 6 = yellow-token), then patch in cells.
// patches: array of { r, c, sym }
function makeBoard(patches, filler = 6) {
  symIds = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(filler));
  for (const { r, c, sym } of patches) symIds[r][c] = sym;
}

// ── Result printer ────────────────────────────────────────────────────────────
const SYM_NAMES = ['gold-teddy','unicorn','robot','duck','pink-token','blue-token','yellow-token'];

function printResult(label, expect, clusters) {
  const ok = clusters.length === expect.count &&
    (expect.size == null || clusters.every(cl => cl.cells.length === expect.size)) &&
    (expect.symId == null || clusters.every(cl => cl.symId === expect.symId));

  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${label}`);
  for (const cl of clusters) {
    console.log(`        cluster: sym=${SYM_NAMES[cl.symId]}  size=${cl.cells.length}`);
  }
  if (!ok) {
    console.log(`        EXPECTED: ${expect.count} cluster(s)` +
      (expect.size != null ? ` of size ${expect.size}` : '') +
      (expect.symId != null ? ` sym=${SYM_NAMES[expect.symId]}` : ''));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('  detectClusters unit tests');
console.log('══════════════════════════════════════════════════════');
console.log('');

// Test A: 5-in-a-row horizontal ducks (row 3, cols 1-5)
// Background: yellow-token (sym 6) — same as duck? No, duck=3, yellow=6. Fine.
makeBoard([
  { r:3, c:1, sym:3 }, { r:3, c:2, sym:3 }, { r:3, c:3, sym:3 },
  { r:3, c:4, sym:3 }, { r:3, c:5, sym:3 },
]);
{
  const cl = detectClusters().filter(c => c.symId === 3);
  printResult('A: 5 horizontal ducks → 1 cluster of 5', { count:1, size:5, symId:3 }, cl);
}

// Test B: 2×3 block of gold-teddy (rows 2-3, cols 2-4)
makeBoard([
  { r:2, c:2, sym:0 }, { r:2, c:3, sym:0 }, { r:2, c:4, sym:0 },
  { r:3, c:2, sym:0 }, { r:3, c:3, sym:0 }, { r:3, c:4, sym:0 },
]);
{
  const cl = detectClusters().filter(c => c.symId === 0);
  printResult('B: 2×3 gold-teddy block → 1 cluster of 6', { count:1, size:6, symId:0 }, cl);
}

// Test C: L-shape of 5 unicorns
//   (1,1)(1,2)(1,3)(1,4)
//   (2,4)
makeBoard([
  { r:1, c:1, sym:1 }, { r:1, c:2, sym:1 }, { r:1, c:3, sym:1 }, { r:1, c:4, sym:1 },
  { r:2, c:4, sym:1 },
]);
{
  const cl = detectClusters().filter(c => c.symId === 1);
  printResult('C: L-shape 5 unicorns → 1 cluster of 5', { count:1, size:5, symId:1 }, cl);
}

// Test D: 4 connected ducks — BELOW minimum, expect NOTHING
makeBoard([
  { r:0, c:0, sym:3 }, { r:0, c:1, sym:3 }, { r:0, c:2, sym:3 }, { r:0, c:3, sym:3 },
]);
{
  const cl = detectClusters().filter(c => c.symId === 3);
  printResult('D: 4-duck connected group → 0 duck clusters (below min)', { count:0, symId:3 }, cl);
}

// Test E: two separate 5-clusters of ducks, not touching
// Cluster 1: row 0, cols 0-4
// Cluster 2: row 6, cols 2-6
makeBoard([
  { r:0, c:0, sym:3 }, { r:0, c:1, sym:3 }, { r:0, c:2, sym:3 }, { r:0, c:3, sym:3 }, { r:0, c:4, sym:3 },
  { r:6, c:2, sym:3 }, { r:6, c:3, sym:3 }, { r:6, c:4, sym:3 }, { r:6, c:5, sym:3 }, { r:6, c:6, sym:3 },
]);
{
  const cl = detectClusters().filter(c => c.symId === 3);
  printResult('E: two separate 5-duck clusters → 2 clusters, each size 5', { count:2, size:5, symId:3 }, cl);
}

// Test F: bonus — two clusters share a corner but NOT an edge (diagonal only) → still TWO clusters
// Duck cluster 1: (0,0)(0,1)(0,2)(0,3)(0,4)
// Duck cluster 2: (1,5)(1,6)(2,5)(2,6)(3,5)   — touches (0,4) only diagonally via (1,5)
makeBoard([
  { r:0, c:0, sym:3 }, { r:0, c:1, sym:3 }, { r:0, c:2, sym:3 }, { r:0, c:3, sym:3 }, { r:0, c:4, sym:3 },
  { r:1, c:5, sym:3 }, { r:1, c:6, sym:3 }, { r:2, c:5, sym:3 }, { r:2, c:6, sym:3 }, { r:3, c:5, sym:3 },
]);
{
  const cl = detectClusters().filter(c => c.symId === 3);
  printResult('F: diagonal-only touching clusters → 2 clusters (orthogonal only)', { count:2, symId:3 }, cl);
}

// Test G: CLAW and scatter cells are transparent — duck cluster around them still detected
// 5 ducks in a row, middle cell replaced by CLAW — ducks are split to 2+2, cluster should NOT fire
makeBoard([
  { r:3, c:0, sym:3 }, { r:3, c:1, sym:3 },
  { r:3, c:2, sym:CLAW_ID },          // CLAW breaks the row
  { r:3, c:3, sym:3 }, { r:3, c:4, sym:3 },
]);
{
  const cl = detectClusters().filter(c => c.symId === 3);
  printResult('G: CLAW breaks duck row → 0 duck clusters (each half has only 2)', { count:0, symId:3 }, cl);
}

// ─────────────────────────────────────────────────────────────────────────────
// HIT FREQUENCY SIMULATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('  Hit frequency simulation  (50,000 boards)');
console.log('  Expected ~31% (base game without wilds)');
console.log('══════════════════════════════════════════════════════');
console.log('');

function randomSymId() {
  // Match game.js randomSymbol logic for base game (no scatter for speed, negligible effect)
  const r = Math.random() * SYM_TOTAL_WEIGHT;
  for (let i = 0; i < SYM_CUM_WEIGHTS.length; i++) {
    if (r < SYM_CUM_WEIGHTS[i]) return i;
  }
  return 6;
}

function rollBoard() {
  symIds = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => randomSymId())
  );
}

const N = 50000;
let hits = 0;
const clusterSizeDist = {};

for (let i = 0; i < N; i++) {
  rollBoard();
  const clusters = detectClusters();
  if (clusters.length > 0) {
    hits++;
    for (const cl of clusters) {
      const sz = cl.cells.length;
      clusterSizeDist[sz] = (clusterSizeDist[sz] || 0) + 1;
    }
  }
}

const hitPct = (hits / N * 100).toFixed(2);
console.log(`  Boards simulated : ${N.toLocaleString()}`);
console.log(`  Boards with ≥1 cluster : ${hits.toLocaleString()}  (${hitPct}%)`);
console.log(`  Expected : ~31%`);
console.log(`  Status : ${Math.abs(parseFloat(hitPct) - 31) < 5 ? 'OK (within ±5%)' : 'WARNING — may be off'}`);
console.log('');
console.log('  Cluster size distribution:');
for (const sz of Object.keys(clusterSizeDist).map(Number).sort((a,b)=>a-b)) {
  console.log(`    size ${sz}: ${clusterSizeDist[sz].toLocaleString()}`);
}
console.log('');
