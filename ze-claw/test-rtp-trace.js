'use strict';
const GRID_SIZE=7,WILD_CELL=7,SCATTER_ID=8,JACKPOT_SCATTER_ID=9;
const PAY_TABLE=[[1.0,2.5,7.5,15.0,150.0],[0.75,2.0,6.0,12.5,100.0],[0.5,1.75,4.0,10.0,60.0],[0.4,1.25,3.0,7.0,40.0],[0.3,0.75,2.0,5.5,30.0],[0.25,0.4,1.25,2.75,25.0],[0.2,0.25,1.0,2.5,20.0]];
const SYMBOL_WEIGHTS=[14,17,18,16,12,11,10];
const SYM_CUM_WEIGHTS=SYMBOL_WEIGHTS.reduce((a,w,i)=>{a.push((a[i-1]??0)+w);return a;},[]);
const SYM_TOTAL_WEIGHT=SYM_CUM_WEIGHTS[SYM_CUM_WEIGHTS.length-1];
const CLAW_PRIZES=[['plus_three_spins',31],['single_wild',25],['double_wild',14],['cash_100x',10],['seed_bomb',7],['plus_ten_spins',6],['sticky_50x_spot',4],['board_double',3]];
const CLAW_PRIZE_TOTAL=CLAW_PRIZES.reduce((s,[,w])=>s+w,0);
const CLAW_CHANCE_PRIZE=0.020,CLAW_CHANCE_JACKPOT=0.056;
const MAX_SPINS_PER_BONUS=50,MAX_WIN_MULTIPLIER=30000,BONUS_BIAS=0.25,MAX_TUMBLES_PER_SPIN=100;
let symIds=[],winCounts=[],stickySpots={},prizeStickyWilds=new Set();
let currentMode='base',freeSpinsRemaining=0,bonusSpinsPlayed=0,freePlaySessionWin=0;
let _trace=false,_spinNum=0;

function initArrays(){
  symIds=Array.from({length:GRID_SIZE},()=>new Array(GRID_SIZE).fill(null));
  winCounts=Array.from({length:GRID_SIZE},()=>new Array(GRID_SIZE).fill(0));
}
function randomSymbol(){
  const sc=0.0107;
  if(Math.random()<sc)return SCATTER_ID;
  const r=Math.random()*SYM_TOTAL_WEIGHT;
  for(let i=0;i<SYM_CUM_WEIGHTS.length;i++)if(r<SYM_CUM_WEIGHTS[i])return i;
  return 6;
}
function detectClusters(){
  const clusters=[];
  for(let symId=0;symId<7;symId++){
    const rv=new Set();
    for(let r=0;r<GRID_SIZE;r++){
      for(let c=0;c<GRID_SIZE;c++){
        if(symIds[r][c]!==symId)continue;
        const key=`${r},${c}`;
        if(rv.has(key))continue;
        const wa=new Set(),q=[{r,c}],g=[];
        rv.add(key);
        while(q.length){
          const{r:row,c:col}=q.shift();
          g.push({row,col});
          for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
            const nr=row+dr,nc=col+dc;
            if(nr<0||nr>=GRID_SIZE||nc<0||nc>=GRID_SIZE)continue;
            const adj=symIds[nr][nc],nk=`${nr},${nc}`;
            if(adj===WILD_CELL){if(!wa.has(nk)){wa.add(nk);g.push({row:nr,col:nc});}}
            else if(adj===symId&&!rv.has(nk)){rv.add(nk);q.push({r:nr,c:nc});}
          }
        }
        if(g.length>=5)clusters.push({symId,cells:g});
      }
    }
  }
  return clusters;
}
function baseMultiplier(symId,size){
  if(size<5)return 0;
  const[m5,m7,m10,m12,m15]=PAY_TABLE[symId];
  if(size>=15)return m15;
  if(size>=12)return m12+(size-12)/3*(m15-m12);
  if(size>=10)return m10+(size-10)/2*(m12-m10);
  if(size>=7)return m7+(size-7)/3*(m10-m7);
  return m5+(size-5)/2*(m7-m5);
}
function cellMultiplier(r,c){const wc=winCounts[r][c];return wc===0?0:Math.min(512,Math.pow(2,wc));}
function clusterPayout(cluster,bet){
  const base=baseMultiplier(cluster.symId,cluster.cells.length)*bet;
  const multSum=cluster.cells.reduce((s,{row,col})=>{
    let m=cellMultiplier(row,col);
    const sk=stickySpots[`${row},${col}`];
    if(sk)m+=sk;
    return s+m;
  },0);
  if(_trace){
    const detail=cluster.cells.map(({row,col})=>{
      const wc=winCounts[row][col],m=cellMultiplier(row,col)+(stickySpots[`${row},${col}`]||0);
      return `(${row},${col})wc${wc}=${m}`;
    }).join(' ');
    console.log(`    CLU sym${cluster.symId} sz${cluster.cells.length} base${base.toFixed(3)} multSum${multSum} pay${(base*Math.max(1,multSum)).toFixed(3)}`);
    console.log(`      ${detail}`);
  }
  return base*Math.max(1,multSum);
}
function updateWinCounts(clusters){
  for(const{cells}of clusters)
    for(const{row,col}of cells)
      if(symIds[row][col]!==WILD_CELL)winCounts[row][col]++;
}
function resetWinCounts(){for(let r=0;r<GRID_SIZE;r++)winCounts[r].fill(0);}
function realCells(){
  const c=[];
  for(let r=0;r<GRID_SIZE;r++)for(let cc=0;cc<GRID_SIZE;cc++)if(symIds[r][cc]>=0&&symIds[r][cc]<=6)c.push([r,cc]);
  return c;
}
function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
function setWild(r,c){symIds[r][c]=WILD_CELL;}
function drawPrize(){
  let roll=Math.random()*CLAW_PRIZE_TOTAL;
  for(const[name,w]of CLAW_PRIZES){roll-=w;if(roll<0)return name;}
  return CLAW_PRIZES[CLAW_PRIZES.length-1][0];
}
function applyPrize(prize,bet){
  if(prize==='single_wild'){const c=realCells();if(c.length){const[r,cc]=c[Math.floor(Math.random()*c.length)];setWild(r,cc);}}
  else if(prize==='double_wild'){const c=realCells();shuffleArr(c);for(const[r,cc]of c.slice(0,2))setWild(r,cc);}
  else if(prize==='seed_bomb'){const c=realCells();shuffleArr(c);for(const[r,cc]of c.slice(0,5))winCounts[r][cc]=Math.max(winCounts[r][cc],3);}
  else if(prize==='cash_100x')return 100*bet;
  else if(prize==='sticky_50x_spot'){const c=realCells();if(c.length){const[r,cc]=c[Math.floor(Math.random()*c.length)];const k=`${r},${cc}`;stickySpots[k]=(stickySpots[k]||0)+50;}}
  else if(prize==='board_double'){for(let r=0;r<GRID_SIZE;r++)for(let c=0;c<GRID_SIZE;c++)if(winCounts[r][c]>0)winCounts[r][c]=Math.min(winCounts[r][c]+1,8);}
  return 0;
}
function spinBoardSync(){for(let r=0;r<GRID_SIZE;r++)for(let c=0;c<GRID_SIZE;c++)symIds[r][c]=randomSymbol();}
function tumbleSync(){
  const pinnedWilds=[];
  for(const key of prizeStickyWilds){const[r,c]=key.split(',').map(Number);if(symIds[r][c]===WILD_CELL){pinnedWilds.push([r,c]);symIds[r][c]=null;}}
  const cols=[];
  for(let col=0;col<GRID_SIZE;col++){
    const surv=[];
    for(let row=0;row<GRID_SIZE;row++)if(symIds[row][col]!==null)surv.push(symIds[row][col]);
    const nc=GRID_SIZE-surv.length;
    cols.push({col,nc});
    if(nc===0)continue;
    for(let row=0;row<GRID_SIZE;row++)symIds[row][col]=null;
    for(let i=0;i<surv.length;i++)symIds[nc+i][col]=surv[i];
  }
  for(const{col,nc}of cols){
    if(nc===0)continue;
    for(let i=0;i<nc;i++){
      let sid;
      if(BONUS_BIAS>0&&Math.random()<BONUS_BIAS){
        const elig=[];
        for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){const nr=i+dr,ncc=col+dc;if(nr>=0&&nr<GRID_SIZE&&ncc>=0&&ncc<GRID_SIZE){const nId=symIds[nr][ncc];if(nId!==null&&nId<WILD_CELL)elig.push(nId);}}
        sid=elig.length>0?elig[Math.floor(Math.random()*elig.length)]:randomSymbol();
      }else{sid=randomSymbol();}
      symIds[i][col]=sid;
    }
  }
  for(const[r,c]of pinnedWilds)symIds[r][c]=WILD_CELL;
}
function explodeClusters(clusters){
  const pos=new Set(clusters.flatMap(({cells})=>cells.filter(({row,col})=>symIds[row][col]!==WILD_CELL).map(({row,col})=>`${row},${col}`)));
  for(const key of pos){const[r,c]=key.split(',').map(Number);symIds[r][c]=null;}
}
function countScattersQuiet(){let n=0;for(let r=0;r<GRID_SIZE;r++)for(let c=0;c<GRID_SIZE;c++)if(symIds[r][c]===SCATTER_ID)n++;return n;}
function scatterSpins(n){if(n>=7)return 30;if(n>=6)return 20;if(n>=5)return 15;if(n>=4)return 12;return 10;}

function runTumbleSync(bet,stats){
  let spinWin=0,endCascadeClawDone=false,tumbleCount=0;
  while(true){
    if(tumbleCount>=MAX_TUMBLES_PER_SPIN){stats.tumbleCapHits++;break;}
    const clusters=detectClusters();
    if(!clusters.length){
      if(!endCascadeClawDone&&currentMode!=='base'){
        endCascadeClawDone=true;
        if(Math.random()<CLAW_CHANCE_PRIZE){
          const prize=drawPrize();
          if(_trace)console.log(`    END-CASCADE CLAW: ${prize}`);
          if(prize==='plus_ten_spins'||prize==='plus_three_spins'){
            if(bonusSpinsPlayed<MAX_SPINS_PER_BONUS)freeSpinsRemaining+=prize==='plus_ten_spins'?10:3;
          }else{const pw=applyPrize(prize,bet);spinWin+=pw;stats.prizeWin+=pw;}
          continue;
        }
      }
      break;
    }
    if(_trace){
      const nz=[];for(let r=0;r<GRID_SIZE;r++)for(let c=0;c<GRID_SIZE;c++)if(winCounts[r][c]>0)nz.push(`(${r},${c})=${winCounts[r][c]}`);
      console.log(`  TUMBLE ${tumbleCount+1}  wc>0 before pay: [${nz.slice(0,6).join(' ')}]`);
    }
    let stepWin=0;
    for(const cluster of clusters){
      const cw=clusterPayout(cluster,bet);
      stepWin+=cw;
      stats.clusterCount++;
      stats.basePayOnly+=baseMultiplier(cluster.symId,cluster.cells.length)*bet;
    }
    spinWin+=stepWin;
    stats.clusterWin+=stepWin;
    if(_trace)console.log(`    => stepWin=${stepWin.toFixed(3)}  spinWin=${spinWin.toFixed(3)}`);
    updateWinCounts(clusters);
    explodeClusters(clusters);
    tumbleSync();
    tumbleCount++;
    stats.totalTumbles++;
    if(currentMode!=='base'){
      if(Math.random()<CLAW_CHANCE_PRIZE){
        const prize=drawPrize();
        if(_trace)console.log(`    PER-TUMBLE CLAW: ${prize}`);
        if(prize==='plus_ten_spins'||prize==='plus_three_spins'){
          if(bonusSpinsPlayed<MAX_SPINS_PER_BONUS)freeSpinsRemaining+=prize==='plus_ten_spins'?10:3;
        }else{const pw=applyPrize(prize,bet);spinWin+=pw;stats.prizeWin+=pw;}
      }
    }
  }
  return spinWin;
}

function runBonusSync(mode,stats){
  const bet=1.0;
  currentMode=mode;freeSpinsRemaining=10;bonusSpinsPlayed=0;freePlaySessionWin=0;
  stickySpots={};prizeStickyWilds=new Set();
  initArrays();
  while(freeSpinsRemaining>0&&bonusSpinsPlayed<MAX_SPINS_PER_BONUS){
    spinBoardSync();
    for(const key of prizeStickyWilds){const[r,c]=key.split(',').map(Number);symIds[r][c]=WILD_CELL;}
    _spinNum=bonusSpinsPlayed+1;
    if(_trace){
      const nz=winCounts.flat().filter(v=>v>0).length;
      console.log(`\nSPIN ${_spinNum}  freeSpins=${freeSpinsRemaining}  wc>0_cells=${nz}`);
    }
    const spinWin=runTumbleSync(bet,stats);
    freePlaySessionWin+=spinWin;
    stats.totalSpins++;
    if(_trace)console.log(`  => spinWin=${spinWin.toFixed(3)}  sessionWin=${freePlaySessionWin.toFixed(3)}`);
    prizeStickyWilds=new Set();
    for(let r=0;r<GRID_SIZE;r++)for(let c=0;c<GRID_SIZE;c++)if(symIds[r][c]===WILD_CELL)prizeStickyWilds.add(`${r},${c}`);
    freeSpinsRemaining-=1;bonusSpinsPlayed+=1;
    const cap=MAX_WIN_MULTIPLIER*bet;
    if(freePlaySessionWin>cap){freePlaySessionWin=cap;freeSpinsRemaining=0;}
    const sc=countScattersQuiet();
    if(sc>=3&&bonusSpinsPlayed<MAX_SPINS_PER_BONUS){freeSpinsRemaining+=scatterSpins(sc);stats.retriggersInBonus++;}
  }
  let wcSum=0;for(let r=0;r<GRID_SIZE;r++)for(let c=0;c<GRID_SIZE;c++)wcSum+=winCounts[r][c];
  stats.totalWcAtBonusEnd+=wcSum;
  resetWinCounts();stickySpots={};prizeStickyWilds=new Set();
  return freePlaySessionWin/bet;
}

const stats={tumbleCapHits:0,retriggersInBonus:0,totalSpins:0,totalTumbles:0,clusterWin:0,prizeWin:0,totalWcAtBonusEnd:0,clusterCount:0,basePayOnly:0};
// Use fixed seed equivalent - run many bonuses to get stable avg
let totalReturn=0;
const N=50000;
for(let i=0;i<N;i++){
  if(i===0)_trace=true;
  const ret=runBonusSync('freeplay',stats);
  if(i===0){
    _trace=false;
    console.log('\n=== END FIRST BONUS ===');
    console.log('First bonus return: '+ret.toFixed(3)+'x');
  }
  totalReturn+=ret;
}
console.log('\n=== 50k BONUS STATS ===');
console.log('Avg return: '+(totalReturn/N).toFixed(3)+'x  (target ~88x)');
console.log('clusterWin/bonus: '+(stats.clusterWin/N).toFixed(3));
console.log('prizeWin/bonus: '+(stats.prizeWin/N).toFixed(3));
console.log('basePayOnly/bonus: '+(stats.basePayOnly/N).toFixed(3));
console.log('multFactor: '+(stats.clusterWin/stats.basePayOnly).toFixed(4));
