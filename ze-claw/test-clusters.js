'use strict';
// ── Read-only cluster trace harness — does NOT import or modify game.js ───────
// Copies detectClusters, baseMultiplier, clusterPayout verbatim so we can
// prove what the real BFS does on concrete 7×7 board states.

// ── Constants (verbatim from game.js) ────────────────────────────────────────
const GRID_SIZE = 7;

const SYMBOLS = [
  { id: 0, name: 'Gold Teddy'      },
  { id: 1, name: 'Unicorn'         },
  { id: 2, name: 'Robot'           },
  { id: 3, name: 'Duck'            },
  { id: 4, name: 'Pink Token'      },
  { id: 5, name: 'Blue Token'      },
  { id: 6, name: 'Yellow Token'    },
  { id: 7, name: 'Claw'            },
  { id: 8, name: 'Scatter'         },
  { id: 9, name: 'Jackpot Scatter' },
];

const CLAW_ID            = 7;
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

// ── Module-level state (mirrors game.js globals) ──────────────────────────────
let symIds          = null;
let winCounts       = null;
let expandingWildCols  = new Set();
let expandingWildMults = {};

function resetState() {
  symIds    = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(0));
  winCounts = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(0));
  expandingWildCols  = new Set();
  expandingWildMults = {};
}

// ── detectClusters — VERBATIM copy of game.js lines 213-273 ──────────────────
function detectClusters() {
  const clusters = [];

  for (let symId = 0; symId < 7; symId++) {
    const realVisited = new Set();  // reset per symbol type — wilds available fresh each pass

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (expandingWildCols.has(c)) continue;   // wilds are never seeds
        if (symIds[r][c] !== symId) continue;
        const key = `${r},${c}`;
        if (realVisited.has(key)) continue;

        const wildVisited = new Set();             // per-cluster wild dedup
        const queue = [{ r, c }];
        const group = [];
        realVisited.add(key);

        while (queue.length) {
          const { r: row, c: col } = queue.shift();
          group.push({ row, col });

          // Wild cells are collected but never expand — only real cells drive BFS.
          if (expandingWildCols.has(col)) continue;

          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
            const adjSym = symIds[nr][nc];
            if (adjSym === null || adjSym === SCATTER_ID || adjSym === JACKPOT_SCATTER_ID) continue;
            const nk = `${nr},${nc}`;

            if (expandingWildCols.has(nc)) {
              // Adjacent wild: include once per cluster, never expand from it
              if (!wildVisited.has(nk)) { wildVisited.add(nk); queue.push({ r: nr, c: nc }); }
            } else {
              // Real cell: must match this pass's symbol type
              if (adjSym !== symId || realVisited.has(nk)) continue;
              realVisited.add(nk);
              queue.push({ r: nr, c: nc });
            }
          }
        }

        if (group.length >= 5) {
          clusters.push({ symId, cells: group });
        }
      }
    }
  }

  return clusters;
}

// ── baseMultiplier — VERBATIM from game.js lines 277-285 ─────────────────────
function baseMultiplier(symId, size) {
  if (size < 5) return 0;
  const [m5, m7, m10, m12, m15] = PAY_TABLE[symId];
  if (size >= 15) return m15;
  if (size >= 12) return m12 + (size - 12) / 3 * (m15 - m12);
  if (size >= 10) return m10 + (size - 10) / 2 * (m12 - m10);
  if (size >=  7) return m7  + (size - 7)  / 3 * (m10 - m7);
  return               m5  + (size - 5)  / 2 * (m7  - m5);
}

// ── clusterPayout — VERBATIM from game.js lines 296-327 ──────────────────────
function clusterPayout(cluster, bet) {
  const base    = baseMultiplier(cluster.symId, cluster.cells.length) * bet;

  const wildCols = [...new Set(
    cluster.cells.filter(({ col }) => expandingWildCols.has(col)).map(({ col }) => col)
  )];

  if (wildCols.length > 0) {
    const wildMultSum = wildCols.reduce((s, c) => s + (expandingWildMults[c] ?? 1), 0);
    const payout = base * wildMultSum;
    const multDetail = wildCols.map(c => `col${c}×${expandingWildMults[c]}`).join(' + ');
    return { payout, wildDetail: multDetail, wildMultSum, base };
  }

  const multSum = cluster.cells.reduce((s, { row, col }) => {
    const wc = winCounts[row][col];
    return s + (wc === 0 ? 0 : Math.min(512, Math.pow(2, wc)));
  }, 0);
  const payout = base * Math.max(1, multSum);
  return { payout, base };
}

// ── Display helpers ───────────────────────────────────────────────────────────
const SYM2 = ['GT','UC','RB','DK','PK','BL','YL','CL','SC','JS'];

function printBoard() {
  const wildArr = [...expandingWildCols].sort((a,b)=>a-b);
  const hdr = '     ' + [...Array(GRID_SIZE).keys()].map(c =>
    expandingWildCols.has(c) ? `[c${c}]` : `  c${c} `).join('');
  const sub = '     ' + [...Array(GRID_SIZE).keys()].map(c =>
    expandingWildCols.has(c) ? `[W${expandingWildMults[c]}] ` : ' ----  ').join('');
  console.log(hdr);
  console.log(sub);
  for (let r = 0; r < GRID_SIZE; r++) {
    const cells = [...Array(GRID_SIZE).keys()].map(c => {
      if (expandingWildCols.has(c)) return `[   ] `;
      const id = symIds[r][c];
      return id === null ? ' ----  ' : `  ${SYM2[id] ?? `S${id}`}  `;
    });
    console.log(`r${r}   ${cells.join('')}`);
  }
}

function printClusters(clusters, bet = 1.00) {
  if (clusters.length === 0) {
    console.log('  *** NO CLUSTERS (0 payouts) ***');
    return;
  }
  let total = 0;
  for (let i = 0; i < clusters.length; i++) {
    const { symId, cells } = clusters[i];
    const real = cells.filter(({col}) => !expandingWildCols.has(col));
    const wild = cells.filter(({col}) =>  expandingWildCols.has(col));
    const { payout, wildDetail, wildMultSum, base } = clusterPayout(clusters[i], bet);
    total += payout;
    console.log(`\n  Cluster ${i+1}: ${SYMBOLS[symId].name} (symId=${symId})`);
    console.log(`    Size : ${cells.length} total = ${real.length} real + ${wild.length} wild`);
    console.log(`    Real : ${real.map(({row,col})=>`(r${row},c${col})`).join(', ')}`);
    if (wild.length)
      console.log(`    Wild : ${wild.map(({row,col})=>`(r${row},c${col})`).join(', ')}`);
    if (wildDetail)
      console.log(`    Pay  : base=${base.toFixed(3)} × wild[${wildDetail}] sum=${wildMultSum} → $${payout.toFixed(3)}`);
    else
      console.log(`    Pay  : base=${base.toFixed(3)} × 1 → $${payout.toFixed(3)}`);
  }
  console.log(`\n  TOTAL PAYOUT @ $1 bet: $${total.toFixed(3)}`);
}

function hr(ch = '─') { console.log(ch.repeat(72)); }
function section(title) {
  console.log('\n');
  hr('═');
  console.log(title);
  hr('═');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — 4 ducks directly adjacent to wild column
// Board: col 3 = wild (×5); col 2 rows 0-3 = Duck; everything else = Gold Teddy
// Expected: 4 real + 4 wild = 8 cells → ≥5, one Duck cluster
// ─────────────────────────────────────────────────────────────────────────────
section('TEST 1: 4 Ducks adjacent to single wild column');

resetState();
expandingWildCols  = new Set([3]);
expandingWildMults = { 3: 5 };
for (let r = 0; r < GRID_SIZE; r++)
  for (let c = 0; c < GRID_SIZE; c++)
    if (!expandingWildCols.has(c)) symIds[r][c] = 0;    // Gold Teddy
for (let r = 0; r < 4; r++) symIds[r][2] = 3;           // DK in c2, rows 0-3

console.log('\nBoard (GT=Gold Teddy, DK=Duck, [W5]=wild col ×5):');
printBoard();
console.log('\nExpected: 1 cluster — Duck×8 (4 real + 4 wild) — should fire.');

const t1 = detectClusters();
console.log('\nResult:');
printClusters(t1);
console.log('\nVerdict: ' + (t1.length === 1 && t1[0].cells.length === 8
  ? 'CORRECT — 4 ducks + 4 adjacent wild cells = 8, cluster fires.'
  : 'UNEXPECTED — see cluster details above.'));

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 — Wild column between two duck groups (THE KEY BRIDGING QUESTION)
// Board: col 3 = wild (×5); col 2 rows 0-3 = LEFT ducks; col 4 rows 0-3 = RIGHT ducks
// Question: does wild bridge them into ONE cluster of 12, or TWO clusters of 8?
// ─────────────────────────────────────────────────────────────────────────────
section('TEST 2: Wild column BETWEEN two duck groups — does it bridge them?');

resetState();
expandingWildCols  = new Set([3]);
expandingWildMults = { 3: 5 };
for (let r = 0; r < GRID_SIZE; r++)
  for (let c = 0; c < GRID_SIZE; c++)
    if (!expandingWildCols.has(c)) symIds[r][c] = 0;
for (let r = 0; r < 4; r++) symIds[r][2] = 3;   // LEFT ducks  c2 r0-3
for (let r = 0; r < 4; r++) symIds[r][4] = 3;   // RIGHT ducks c4 r0-3

console.log('\nBoard:');
printBoard();

console.log(`
THE CRITICAL BFS LINES (game.js ~235-253):

  while (queue.length) {
    const { r: row, c: col } = queue.shift();
    group.push({ row, col });

    // Wild cells are collected but never expand — only real cells drive BFS.
    if (expandingWildCols.has(col)) continue;        // ← STOPS HERE for wild cells

    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      ...
      if (expandingWildCols.has(nc)) {
        // Adjacent wild: include once per cluster, never expand from it
        if (!wildVisited.has(nk)) { wildVisited.add(nk); queue.push({ r: nr, c: nc }); }
      } else {
        if (adjSym !== symId || realVisited.has(nk)) continue;  // real must match
        realVisited.add(nk); queue.push({ r: nr, c: nc });
      }
    }
  }

BFS trace for LEFT duck group (starting at r0,c2):
  Dequeue (r0,c2)=DK: not wild → check 4 neighbors
    (r1,c2)=DK: real match → push to queue
    (r0,c1)=GT: real non-match → skip
    (r0,c3)=wild: → wildVisited.add('0,3'), queue.push({r:0,c:3})
  Dequeue (r1,c2)=DK: not wild → check 4 neighbors
    (r0,c2)=DK: already in realVisited → skip
    (r2,c2)=DK: push
    (r1,c1)=GT: skip
    (r1,c3)=wild: → wildVisited.add('1,3'), queue.push({r:1,c:3})
  Dequeue (r0,c3)=WILD: group.push({r:0,c:3}) → if(expandingWildCols.has(col)) CONTINUE
    *** BFS does NOT look at (r0,c4). The right-duck group is never reached. ***
  Dequeue (r2,c2)=DK → (r3,c2)=DK pushed; (r2,c3)=wild pushed
  Dequeue (r1,c3)=WILD: group.push → CONTINUE  (r1,c4 never queued)
  Dequeue (r3,c2)=DK → (r3,c3)=wild pushed; no more real ducks below
  Dequeue (r2,c3)=WILD: group.push → CONTINUE
  Dequeue (r3,c3)=WILD: group.push → CONTINUE
  Queue empty. group = [c2r0,c2r1,c3r0,c2r2,c3r1,c2r3,c3r2,c3r3] = 8 cells.

  LEFT BFS ends. realVisited = {0,2 / 1,2 / 2,2 / 3,2}. Wild cells never enter realVisited.

  RIGHT duck (r0,c4): NOT in realVisited → starts a FRESH BFS with fresh wildVisited.
  Collects (r0,c4),(r1,c4),(r2,c4),(r3,c4) + wild (r0,c3),(r1,c3),(r2,c3),(r3,c3) = 8 cells.

ANSWER: The wild is a DEAD-END, not a bridge. Left-group and right-group form SEPARATE clusters.
        Both independently claim the same wild-column cells (both wildVisited sets are fresh).
        You get TWO clusters, each ≥5, each triggering a wild-multiplier payout.`);

console.log('\nResult:');
const t2 = detectClusters();
printClusters(t2);
console.log(`\nVerdict: ${t2.length === 2
  ? 'TWO separate clusters — wild does NOT bridge. Each group claims wild cells independently.'
  : t2.length === 1
    ? 'ONE cluster — wild IS bridging (unexpected — re-check code).'
    : `${t2.length} clusters (unexpected).`}`);
if (t2.length === 2)
  console.log('  Is this correct? Depends on intent.\n  Per the "wild endpoint" design rule → intentional.\n  If intent is "wild bridges same-type groups" → this is a bug.\n  Current behaviour: two payouts (both ×5) instead of one bigger payout.');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 — Two adjacent wild columns; duck groups on outer sides
// Board: wild c3(×3), wild c4(×4); ducks c2 r0-3 (LEFT), ducks c5 r0-3 (RIGHT)
// Can two wild columns chain to connect two real groups?
// ─────────────────────────────────────────────────────────────────────────────
section('TEST 3: Two adjacent wild columns — do they chain?');

resetState();
expandingWildCols  = new Set([3, 4]);
expandingWildMults = { 3: 3, 4: 4 };
for (let r = 0; r < GRID_SIZE; r++)
  for (let c = 0; c < GRID_SIZE; c++)
    if (!expandingWildCols.has(c)) symIds[r][c] = 0;
for (let r = 0; r < 4; r++) symIds[r][2] = 3;   // LEFT ducks  c2 r0-3
for (let r = 0; r < 4; r++) symIds[r][5] = 3;   // RIGHT ducks c5 r0-3

console.log('\nBoard:');
printBoard();

console.log(`
BFS key: when a wild cell is dequeued, the BFS does "continue" — it looks at NO neighbors,
including neighboring wild cells. So wild(r0,c3) never queues wild(r0,c4), and the left
group can never bridge through c3→c4 to reach c5. Similarly the right group touches c4
but the BFS stops there and never reaches c3 or c2.

Each group claims only the ONE wild column it directly borders:
  Left  ducks (c2) → touch c3 only  → payout uses wildMultSum = ×${3}
  Right ducks (c5) → touch c4 only  → payout uses wildMultSum = ×${4}`);

const t3 = detectClusters();
console.log('\nResult:');
printClusters(t3);
const t3left  = t3.find(cl => cl.cells.some(({col}) => col === 2));
const t3right = t3.find(cl => cl.cells.some(({col}) => col === 5));
console.log(`\nVerdict: ${t3.length === 2
  ? 'TWO clusters — adjacent wild columns do NOT chain. Each claims its nearest wild only.'
  : `${t3.length} clusters (unexpected).`}`);
if (t3left && t3right) {
  const lWild = [...new Set(t3left.cells.filter(({col})=>expandingWildCols.has(col)).map(({col})=>col))];
  const rWild = [...new Set(t3right.cells.filter(({col})=>expandingWildCols.has(col)).map(({col})=>col))];
  console.log(`  Left  cluster wild cols claimed : [${lWild.map(c=>`c${c}×${expandingWildMults[c]}`).join(', ')}]`);
  console.log(`  Right cluster wild cols claimed : [${rWild.map(c=>`c${c}×${expandingWildMults[c]}`).join(', ')}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4 — Screenshot scenario: 3 wild cols in middle (c2,c3,c4)
// Outer cols have sparse symbols — trace EXACTLY why nothing connects.
//
// Board designed so the LARGEST real+wild group in any outer column is 4
// (just below the 5-cell threshold).
//
//      c0   c1  [c2] [c3] [c4]  c5   c6
// r0:  GT   DK  [W]  [W]  [W]  UC   RB
// r1:  UC   DK  [W]  [W]  [W]  UC   GT
// r2:  RB   GT  [W]  [W]  [W]  GT   UC
// r3:  DK   UC  [W]  [W]  [W]  RB   DK
// r4:  GT   RB  [W]  [W]  [W]  DK   GT
// r5:  UC   GT  [W]  [W]  [W]  UC   RB
// r6:  RB   UC  [W]  [W]  [W]  GT   UC
//
// Key groups to trace:
//   Ducks in c1 r0-1: DK(r0,c1)+DK(r1,c1) → each touches c2-wild → 2 real + 2 wild = 4 (not ≥5)
//   Unicorns in c5 r0-1: UC(r0,c5)+UC(r1,c5) → each touches c4-wild → 2 real + 2 wild = 4 (not ≥5)
// ─────────────────────────────────────────────────────────────────────────────
section('TEST 4: Screenshot scenario — 3 wild cols centre, why nothing connects');

resetState();
expandingWildCols  = new Set([2, 3, 4]);
expandingWildMults = { 2: 2, 3: 3, 4: 4 };

//                    c0  c1  c2  c3  c4  c5  c6
const board4 = [
  /* r0 */          [ 0,  3, -1, -1, -1,  1,  2 ],  // GT DK [W][W][W] UC RB
  /* r1 */          [ 1,  3, -1, -1, -1,  1,  0 ],  // UC DK [W][W][W] UC GT
  /* r2 */          [ 2,  0, -1, -1, -1,  0,  1 ],  // RB GT [W][W][W] GT UC
  /* r3 */          [ 0,  1, -1, -1, -1,  2,  3 ],  // GT UC [W][W][W] RB DK
  /* r4 */          [ 2,  2, -1, -1, -1,  3,  0 ],  // RB RB [W][W][W] DK GT
  /* r5 */          [ 1,  0, -1, -1, -1,  1,  2 ],  // UC GT [W][W][W] UC RB
  /* r6 */          [ 2,  1, -1, -1, -1,  0,  1 ],  // RB UC [W][W][W] GT UC
];

for (let r = 0; r < GRID_SIZE; r++)
  for (let c = 0; c < GRID_SIZE; c++)
    if (!expandingWildCols.has(c)) symIds[r][c] = board4[r][c];

console.log('\nBoard (wild cols 2,3,4 have multipliers ×2, ×3, ×4):');
printBoard();

// Per-column symbol inventory for outer cols
console.log('\nSymbol inventory — outer columns only:');
for (const c of [0, 1, 5, 6]) {
  const tally = {};
  for (let r = 0; r < GRID_SIZE; r++) {
    const name = SYMBOLS[symIds[r][c]].name;
    tally[name] = (tally[name] ?? 0) + 1;
  }
  const adjWild = c === 1 ? 'c2' : c === 5 ? 'c4' : 'none';
  console.log(`  col${c} (adj wild: ${adjWild}): ` +
    Object.entries(tally).map(([n,ct])=>`${n}×${ct}`).join(', '));
}

// Trace each symbol type's candidate groups
console.log('\nPer-symbol group trace (real cells + their immediately adjacent wild cells):');
for (let symId = 0; symId < 7; symId++) {
  const realVisited = new Set();
  const groups = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (expandingWildCols.has(c)) continue;
      if (symIds[r][c] !== symId) continue;
      const key = `${r},${c}`;
      if (realVisited.has(key)) continue;

      const wildVisited = new Set();
      const queue = [{ r, c }];
      const group = [];
      realVisited.add(key);

      while (queue.length) {
        const { r: row, c: col } = queue.shift();
        group.push({ row, col });
        if (expandingWildCols.has(col)) continue;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = row + dr, nc = col + dc;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
          const adjSym = symIds[nr][nc];
          if (adjSym === null || adjSym === SCATTER_ID || adjSym === JACKPOT_SCATTER_ID) continue;
          const nk = `${nr},${nc}`;
          if (expandingWildCols.has(nc)) {
            if (!wildVisited.has(nk)) { wildVisited.add(nk); queue.push({ r: nr, c: nc }); }
          } else {
            if (adjSym !== symId || realVisited.has(nk)) continue;
            realVisited.add(nk); queue.push({ r: nr, c: nc });
          }
        }
      }
      groups.push(group);
    }
  }
  // Only show groups that have at least 2 cells (size-1 singletons clutter output)
  const notable = groups.filter(g => g.length >= 2);
  if (notable.length === 0) continue;
  console.log(`\n  ${SYMBOLS[symId].name} (symId=${symId}):`);
  for (const g of notable) {
    const real = g.filter(({col}) => !expandingWildCols.has(col));
    const wild = g.filter(({col}) =>  expandingWildCols.has(col));
    const status = g.length >= 5 ? '>>> CLUSTER <<<' : `size ${g.length} — need ${5 - g.length} more`;
    console.log(`    [${status}] real=[${real.map(({row,col})=>`r${row}c${col}`).join(',')}]` +
      (wild.length ? ` + wild=[${wild.map(({row,col})=>`r${row}c${col}`).join(',')}]` : ''));
  }
}

const t4 = detectClusters();
console.log('\nFinal result:');
printClusters(t4);
if (t4.length === 0) {
  console.log(`
WHY NOTHING CONNECTS:
  With wilds filling cols 2,3,4, real cells exist only in cols 0,1,5,6.
  A cluster needs ≥5 cells. The only paths to 5 are:
    (a) 5+ same-symbol real cells orthogonally connected in outer cols (none here — max run is 2)
    (b) real cells + adjacent wild cells summing to ≥5.
  For (b): each real cell in col1 can only claim one wild cell from col2.
    DK r0c1 + DK r1c1 = 2 real, each touching one c2-wild cell = 2 wild → total 4.  MISS by 1.
    UC r0c5 + UC r1c5 = 2 real, each touching one c4-wild cell = 2 wild → total 4.  MISS by 1.
  The wild columns in the middle (c3,c4 for left-side; c2,c3 for right-side) are unreachable:
    col1 touches c2 only (not c3,c4); BFS stops at c2 wild and never propagates further.
  To form a cluster from col1 you'd need ≥3 same-symbol cells in col1 forming a vertical run,
  which would give 3 real + 3 wild = 6 ≥ 5. This board has only 2 of any symbol per column.`);
}
