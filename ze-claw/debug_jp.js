'use strict';
// Debug: run ONE Jackpot bonus with seeded RNG, print every cluster and prize.

// ── seeded PRNG (mulberry32) replacing Math.random ────────────────────────────
let _seed = 42;
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(_seed);
// Override Math.random globally for this script
Math.random = rng;

// ── constants (verbatim from test-rtp.js) ─────────────────────────────────────
const GRID_SIZE          = 7;
const WILD_CELL          = 7;
const SCATTER_ID         = 8;
const JACKPOT_SCATTER_ID = 9;
const PAY_TABLE = [
  [1.0,  2.5,  7.5,  15.0, 150.0],
  [0.75, 2.0,  6.0,  12.5, 100.0],
  [0.5,  1.75, 4.0,  10.0,  60.0],
  [0.4,  1.25, 3.0,   7.0,  40.0],
  [0.3,  0.75, 2.0,   5.5,  30.0],
  [0.25, 0.4,  1.25,  2.75, 25.0],
  [0.2,  0.25, 1.0,   2.5,  20.0],
];
const SYMBOL_NAMES = ['gold-teddy','unicorn','robot','duck','pink-token','blue-token','yellow-token'];
const SYMBOL_WEIGHTS   = [14, 17, 18, 16, 12, 11, 10];
const SYM_CUM_WEIGHTS  = SYMBOL_WEIGHTS.reduce((acc, w, i) => { acc.push((acc[i-1] ?? 0) + w); return acc; }, []);
const SYM_TOTAL_WEIGHT = SYM_CUM_WEIGHTS[SYM_CUM_WEIGHTS.length - 1];
const BONUS_SCATTER_CHANCE   = 0.0107;
const CLAW_CHANCE_JACKPOT    = 0.09;
const GOLDEN_CLAW_RATE_JACKPOT = 0.10;
const MAX_TUMBLES_PER_SPIN   = 100;
const MAX_SPINS_PER_BONUS    = 50;
const FREE_SPINS             = 10;
const BONUS_BIAS             = 0.25;
const MAX_CELL_MULT          = 512;
const JACKPOT_CLAW_PRIZES = [
  ['extra_spins',            22],
  ['single_wild',            16],
  ['double_wild',            12],
  ['small_cash',             10],
  ['seed_bomb',              10],
  ['small_sticky_spot',      10],
  ['rolled_wild_count',      10],
  ['multiplier_rain',         7],
  ['big_rolled_sticky_spot',  2],
  ['board_frenzy',            1],
];
const JACKPOT_CLAW_PRIZE_TOTAL = JACKPOT_CLAW_PRIZES.reduce((s,[,w])=>s+w,0);
const JACKPOT_GOLDEN_PRIZES = [
  ['rolled_wild_count',     10],
  ['multiplier_rain',        7],
  ['big_rolled_sticky_spot', 2],
  ['board_frenzy',           1],
];
const JACKPOT_GOLDEN_TOTAL = JACKPOT_GOLDEN_PRIZES.reduce((s,[,w])=>s+w,0);

// ── state ─────────────────────────────────────────────────────────────────────
let symIds    = Array.from({length:GRID_SIZE},()=>new Array(GRID_SIZE).fill(null));
let winCounts = Array.from({length:GRID_SIZE},()=>new Array(GRID_SIZE).fill(0));
let stickySpots = {};
let jackpotStickyWilds = new Set();
let freeSpinsRemaining = FREE_SPINS;
let bonusSpinsPlayed   = 0;
let sessionWin         = 0;

function randomSymbol() {
  if (Math.random() < BONUS_SCATTER_CHANCE) return SCATTER_ID;
  const r = Math.random() * SYM_TOTAL_WEIGHT;
  for (let i = 0; i < SYM_CUM_WEIGHTS.length; i++) if (r < SYM_CUM_WEIGHTS[i]) return i;
  return 6;
}

function spinBoard() {
  for (let r=0;r<GRID_SIZE;r++)
    for (let c=0;c<GRID_SIZE;c++)
      symIds[r][c] = randomSymbol();
}

function detectClusters() {
  const clusters = [];
  for (let symId=0;symId<7;symId++) {
    const realVisited = new Set();
    for (let r=0;r<GRID_SIZE;r++) {
      for (let c=0;c<GRID_SIZE;c++) {
        if (symIds[r][c]!==symId) continue;
        const key=`${r},${c}`;
        if (realVisited.has(key)) continue;
        const wildsAdded=new Set(), queue=[{r,c}], group=[];
        realVisited.add(key);
        while (queue.length) {
          const {r:row,c:col}=queue.shift();
          group.push({row,col});
          for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr=row+dr,nc=col+dc;
            if (nr<0||nr>=GRID_SIZE||nc<0||nc>=GRID_SIZE) continue;
            const adj=symIds[nr][nc], nk=`${nr},${nc}`;
            if (adj===WILD_CELL) { if(!wildsAdded.has(nk)){wildsAdded.add(nk);group.push({row:nr,col:nc});} }
            else if (adj===symId&&!realVisited.has(nk)){realVisited.add(nk);queue.push({r:nr,c:nc});}
          }
        }
        if (group.length>=5) clusters.push({symId,cells:group});
      }
    }
  }
  return clusters;
}

function baseMultiplier(symId, size) {
  if (size<5) return 0;
  const [m5,m7,m10,m12,m15]=PAY_TABLE[symId];
  if (size>=15) return m15;
  if (size>=12) return m12+(size-12)/3*(m15-m12);
  if (size>=10) return m10+(size-10)/2*(m12-m10);
  if (size>=7)  return m7 +(size-7) /3*(m10-m7);
  return              m5 +(size-5) /2*(m7-m5);
}

function cellMult(r,c) {
  const wc=winCounts[r][c];
  return wc===0?0:Math.min(MAX_CELL_MULT,Math.pow(2,wc));
}

let globalClusterIdx = 0;
function clusterPayoutDebug(cluster) {
  globalClusterIdx++;
  const base = baseMultiplier(cluster.symId, cluster.cells.length);
  let multSum = 0;
  const details = [];
  for (const {row,col} of cluster.cells) {
    const cm = cellMult(row,col);
    const sk = stickySpots[`${row},${col}`] || 0;
    multSum += cm + sk;
    if (cm>0||sk>0) details.push(`    cell(${row},${col}) wc=${winCounts[row][col]} cellMult=${cm} sticky=${sk}`);
  }
  const payout = base * Math.max(1, multSum);
  console.log(`  CLUSTER#${globalClusterIdx}: sym=${SYMBOL_NAMES[cluster.symId]} size=${cluster.cells.length} `+
              `base=${base.toFixed(4)} multSum=${multSum} payout=${payout.toFixed(4)}`);
  for (const d of details) console.log(d);
  return payout;
}

function realCells() {
  const c=[];
  for (let r=0;r<GRID_SIZE;r++)
    for (let co=0;co<GRID_SIZE;co++)
      if (symIds[r][co]>=0&&symIds[r][co]<=6) c.push([r,co]);
  return c;
}
function shuffle(arr) {
  for (let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
}

function drawPrize() {
  const isGolden = Math.random() < GOLDEN_CLAW_RATE_JACKPOT;
  const pool = isGolden ? JACKPOT_GOLDEN_PRIZES : JACKPOT_CLAW_PRIZES;
  const total = isGolden ? JACKPOT_GOLDEN_TOTAL : JACKPOT_CLAW_PRIZE_TOTAL;
  let roll = Math.random() * total;
  for (const [name,w] of pool) { roll-=w; if(roll<0) return name; }
  return pool[pool.length-1][0];
}

function applyPrizeDebug(prize) {
  let extraSpins = 0, cash = 0, detail = '';
  if (prize==='extra_spins') {
    const rng=Math.random(); const n=rng<0.20?10:rng<0.50?5:3;
    extraSpins=n; detail=`+${n} spins`;
  } else if (prize==='single_wild') {
    const cands=realCells();
    if (cands.length){const[r,c]=cands[Math.floor(Math.random()*cands.length)];symIds[r][c]=WILD_CELL;detail=`wild at (${r},${c})`;}
  } else if (prize==='double_wild') {
    const cands=realCells();shuffle(cands);const placed=[];
    for (const [r,c] of cands.slice(0,2)){symIds[r][c]=WILD_CELL;placed.push(`(${r},${c})`);}
    detail='wilds at '+placed.join(',');
  } else if (prize==='small_cash') {
    const rng=Math.random();cash=rng<0.20?75:rng<0.60?50:25;detail=`+${cash}x cash`;
  } else if (prize==='seed_bomb') {
    const cands=realCells();shuffle(cands);
    for (const [r,c] of cands.slice(0,5)) winCounts[r][c]=Math.max(winCounts[r][c],3);
    detail='seed_bomb 5 cells → wc≥3';
  } else if (prize==='small_sticky_spot') {
    const cands=realCells();
    if (cands.length){const[r,c]=cands[Math.floor(Math.random()*cands.length)];
      const rng=Math.random();const val=rng<0.40?50:25;
      const key=`${r},${c}`;stickySpots[key]=(stickySpots[key]||0)+val;detail=`sticky ${val}x at (${r},${c})`;}
  } else if (prize==='rolled_wild_count') {
    const rng=Math.random();const count=rng<0.20?5:rng<0.50?4:3;
    const cands=realCells();shuffle(cands);const placed=[];
    for (const [r,c] of cands.slice(0,count)){symIds[r][c]=WILD_CELL;placed.push(`(${r},${c})`);}
    detail=`${count} wilds: `+placed.join(',');
  } else if (prize==='multiplier_rain') {
    const rng0=Math.random();const count=rng0<0.20?5:rng0<0.50?4:3;
    const cands=realCells();shuffle(cands);const spots=[];
    for (const [r,c] of cands.slice(0,count)){const rng=Math.random();const val=rng<0.25?100:rng<0.50?75:rng<0.80?50:25;
      const key=`${r},${c}`;stickySpots[key]=(stickySpots[key]||0)+val;spots.push(`(${r},${c})+${val}`);}
    detail=`rain ${count}: `+spots.join(',');
  } else if (prize==='big_rolled_sticky_spot') {
    const cands=realCells();
    if (cands.length){const[r,c]=cands[Math.floor(Math.random()*cands.length)];
      const rng=Math.random();const val=rng<0.20?1000:rng<0.50?500:250;
      const key=`${r},${c}`;stickySpots[key]=(stickySpots[key]||0)+val;detail=`big sticky ${val}x at (${r},${c})`;}
  } else if (prize==='board_frenzy') {
    const isMega=Math.random()<0.35;const r1=Math.random();
    const wc=isMega?(r1<0.40?5:6):(r1<0.50?4:5);
    const sc2=isMega?(Math.random()<0.50?3:4):(Math.random()<0.60?2:3);
    const cands=realCells();shuffle(cands);
    for (const [r,c] of cands.slice(0,sc2)){const rng=Math.random();
      const val=isMega?(rng<0.20?1000:rng<0.50?500:350):(rng<0.20?500:rng<0.50?300:200);
      const key=`${r},${c}`;stickySpots[key]=(stickySpots[key]||0)+val;}
    for (const [r,c] of cands.slice(sc2,sc2+wc)) symIds[r][c]=WILD_CELL;
    detail=`frenzy mega=${isMega} wilds=${wc} spots=${sc2}`;
  }
  console.log(`  PRIZE: ${prize} → ${detail}`);
  return {extraSpins, cash};
}

function tumbleBoard() {
  const pinned=[];
  for (const key of jackpotStickyWilds){
    const [r,c]=key.split(',').map(Number);
    if (symIds[r][c]===WILD_CELL){pinned.push([r,c]);symIds[r][c]=null;}
  }
  const layouts=[];
  for (let col=0;col<GRID_SIZE;col++){
    const surv=[];
    for (let row=0;row<GRID_SIZE;row++) if(symIds[row][col]!==null) surv.push(symIds[row][col]);
    const nc=GRID_SIZE-surv.length; layouts.push({col,nc});
    if(nc===0) continue;
    for (let row=0;row<GRID_SIZE;row++) symIds[row][col]=null;
    for (let i=0;i<surv.length;i++) symIds[nc+i][col]=surv[i];
  }
  for (const {col,nc} of layouts){
    if(nc===0) continue;
    for (let i=0;i<nc;i++){
      let symId;
      if (BONUS_BIAS>0&&Math.random()<BONUS_BIAS){
        const elig=[];
        for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){const nr=i+dr,nco=col+dc;
          if(nr<0||nr>=GRID_SIZE||nco<0||nco>=GRID_SIZE) continue;
          const nId=symIds[nr][nco];if(nId===null||nId>=WILD_CELL) continue; elig.push(nId);}
        symId=elig.length>0?elig[Math.floor(Math.random()*elig.length)]:randomSymbol();
      } else symId=randomSymbol();
      symIds[i][col]=symId;
    }
  }
  for (const [r,c] of pinned) symIds[r][c]=WILD_CELL;
}

function explode(clusters){
  const pos=new Set(clusters.flatMap(({cells})=>cells.filter(({row,col})=>symIds[row][col]!==WILD_CELL).map(({row,col})=>`${row},${col}`)));
  for (const key of pos){const [r,c]=key.split(',').map(Number);symIds[r][c]=null;}
}

function countScatters(){
  let n=0;
  for (let r=0;r<GRID_SIZE;r++) for(let c=0;c<GRID_SIZE;c++) if(symIds[r][c]===SCATTER_ID||symIds[r][c]===JACKPOT_SCATTER_ID) n++;
  return n;
}

// ── run ONE bonus ─────────────────────────────────────────────────────────────
console.log('=== JS DEBUG: ONE Jackpot Bonus (seed=42 mulberry32) ===\n');

freeSpinsRemaining = FREE_SPINS;
bonusSpinsPlayed   = 0;
sessionWin         = 0;
stickySpots        = {};
jackpotStickyWilds = new Set();
winCounts = Array.from({length:GRID_SIZE},()=>new Array(GRID_SIZE).fill(0));

while (freeSpinsRemaining > 0 && bonusSpinsPlayed < MAX_SPINS_PER_BONUS) {
  freeSpinsRemaining--;
  bonusSpinsPlayed++;
  spinBoard();
  for (const key of jackpotStickyWilds){
    const [r,c]=key.split(',').map(Number);symIds[r][c]=WILD_CELL;
  }

  console.log(`--- SPIN ${bonusSpinsPlayed}  spins_remaining=${freeSpinsRemaining} ` +
              `sticky_wilds=${jackpotStickyWilds.size} sticky_spots=${Object.keys(stickySpots).length} ---`);

  let spinWin=0, endCascadeDone=false, tumbles=0;

  while (true) {
    if (tumbles>=MAX_TUMBLES_PER_SPIN) break;
    const clusters=detectClusters();

    if (!clusters.length) {
      if (!endCascadeDone) {
        endCascadeDone=true;
        if (Math.random()<CLAW_CHANCE_JACKPOT){
          const prize=drawPrize();
          const {extraSpins,cash}=applyPrizeDebug(prize);
          if (extraSpins>0 && bonusSpinsPlayed<MAX_SPINS_PER_BONUS) freeSpinsRemaining+=extraSpins;
          spinWin+=cash;
          continue;
        }
      }
      break;
    }

    for (const cl of clusters) { spinWin += clusterPayoutDebug(cl); }
    for (const {cells} of clusters)
      for (const {row,col} of cells)
        if (symIds[row][col]!==WILD_CELL) winCounts[row][col]++;
    explode(clusters);
    tumbleBoard();
    tumbles++;

    if (Math.random()<CLAW_CHANCE_JACKPOT){
      const prize=drawPrize();
      const {extraSpins,cash}=applyPrizeDebug(prize);
      if (extraSpins>0 && bonusSpinsPlayed<MAX_SPINS_PER_BONUS) freeSpinsRemaining+=extraSpins;
      spinWin+=cash;
    }
  }

  jackpotStickyWilds=new Set();
  for (let r=0;r<GRID_SIZE;r++) for(let c=0;c<GRID_SIZE;c++) if(symIds[r][c]===WILD_CELL) jackpotStickyWilds.add(`${r},${c}`);

  sessionWin+=spinWin;
  if (sessionWin>30000){sessionWin=30000;freeSpinsRemaining=0;}

  const sc=countScatters();
  if (sc>=3&&bonusSpinsPlayed<MAX_SPINS_PER_BONUS){
    const add=sc>=7?30:sc>=6?20:sc>=5?15:sc>=4?12:10;
    freeSpinsRemaining+=add;
    console.log(`  SCATTER RETRIGGER: ${sc} scatters → +${add} spins`);
  }

  console.log(`  spin_win=${spinWin.toFixed(4)}  bonus_win_so_far=${sessionWin.toFixed(4)}  ` +
              `tumbles=${tumbles}  scatters=${sc}\n`);
}

console.log(`=== FINAL bonus_win=${sessionWin.toFixed(4)} ===`);
