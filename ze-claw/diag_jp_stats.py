#!/usr/bin/env python3
"""Diagnostic: run N Jackpot bonuses and print same stats as test-rtp.js"""
import random, sys
from collections import deque

N = int(sys.argv[1]) if len(sys.argv) > 1 else 100000

# ── constants (same as ze-claw-sim.py) ───────────────────────────────────────
GRID_SIZE = 7; WILD_CELL = 7; SCATTER_ID = 8; JACKPOT_SCATTER_ID = 9
PAY_TABLE = [
    [1.0,2.5,7.5,15.0,150.0],[0.75,2.0,6.0,12.5,100.0],
    [0.5,1.75,4.0,10.0,60.0],[0.4,1.25,3.0,7.0,40.0],
    [0.3,0.75,2.0,5.5,30.0],[0.25,0.4,1.25,2.75,25.0],[0.2,0.25,1.0,2.5,20.0],
]
SYMBOL_IDS=list(range(7)); BONUS_WEIGHTS=[14,17,18,16,12,11,10]
BONUS_SCATTER_CHANCE=0.0107; BONUS_BIAS=0.25; MAX_CELL_MULT=512
MAX_TUMBLES=100; MAX_SPINS=50; FREE_SPINS=10
CLAW_CHANCE=0.09; GOLDEN_RATE=0.10
JACKPOT_CLAW_PRIZES=[('extra_spins',22),('single_wild',16),('double_wild',12),
    ('small_cash',10),('seed_bomb',10),('small_sticky_spot',10),
    ('rolled_wild_count',10),('multiplier_rain',7),('big_rolled_sticky_spot',2),('board_frenzy',1)]
JACKPOT_CLAW_TOTAL=sum(w for _,w in JACKPOT_CLAW_PRIZES)
JACKPOT_GOLDEN=[('rolled_wild_count',10),('multiplier_rain',7),('big_rolled_sticky_spot',2),('board_frenzy',1)]
JACKPOT_GOLDEN_TOTAL=sum(w for _,w in JACKPOT_GOLDEN)
_DIRS=((-1,0),(1,0),(0,-1),(0,1))

def base_mult(s,n):
    if n<5: return 0.0
    a,b,c,d,e=PAY_TABLE[s]
    if n>=15: return e
    if n>=12: return d+(n-12)/3*(e-d)
    if n>=10: return c+(n-10)/2*(d-c)
    if n>=7:  return b+(n-7)/3*(c-b)
    return           a+(n-5)/2*(b-a)

def rand_sym():
    if random.random()<BONUS_SCATTER_CHANCE: return SCATTER_ID
    return random.choices(SYMBOL_IDS,weights=BONUS_WEIGHTS)[0]

def make_grid():
    return [[rand_sym() for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]

def detect_clusters(grid):
    rv=set(); cl=[]
    for sr in range(GRID_SIZE):
        for sc in range(GRID_SIZE):
            sym=grid[sr][sc]
            if not(0<=sym<=6): continue
            k=(sr,sc)
            if k in rv: continue
            q=deque([k]); g=[k]; wa=set(); rv.add(k)
            while q:
                r,c=q.popleft()
                for dr,dc in _DIRS:
                    nr,nc=r+dr,c+dc
                    if not(0<=nr<GRID_SIZE and 0<=nc<GRID_SIZE): continue
                    a=grid[nr][nc]; nk=(nr,nc)
                    if a==WILD_CELL and nk not in wa: wa.add(nk); g.append(nk)
                    elif a==sym and nk not in rv: rv.add(nk); q.append(nk); g.append(nk)
            if len(g)>=5: cl.append((sym,g))
    return cl

def cluster_pay(sym,cells,wc,ss):
    base=base_mult(sym,len(cells))
    if base==0: return 0.0
    ms=0
    for r,c in cells:
        w=wc[r][c]
        if w>=1: ms+=min(MAX_CELL_MULT,2**w)
        if ss: ms+=ss.get((r,c),0)
    return base*max(1,ms)

def roll_claw():
    if random.random()>=CLAW_CHANCE: return None
    if random.random()<GOLDEN_RATE: pool,tot=JACKPOT_GOLDEN,JACKPOT_GOLDEN_TOTAL
    else: pool,tot=JACKPOT_CLAW_PRIZES,JACKPOT_CLAW_TOTAL
    r=random.random()*tot; cum=0.0
    for n,w in pool:
        cum+=w
        if r<cum: return n
    return pool[-1][0]

def apply_prize(prize,grid,wc,ss):
    extra=0; cash=0.0
    cands=[(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
    if prize=='extra_spins':
        rng=random.random(); extra=10 if rng<0.20 else 5 if rng<0.50 else 3
    elif prize=='single_wild':
        if cands: r,c=random.choice(cands); grid[r][c]=WILD_CELL
    elif prize=='double_wild':
        random.shuffle(cands)
        for r,c in cands[:2]: grid[r][c]=WILD_CELL
    elif prize=='small_cash':
        rng=random.random(); cash=75 if rng<0.20 else 50 if rng<0.60 else 25
    elif prize=='seed_bomb':
        random.shuffle(cands)
        for r,c in cands[:5]: wc[r][c]=max(wc[r][c],3)
    elif prize=='small_sticky_spot':
        if cands:
            r,c=random.choice(cands); rng=random.random(); val=50 if rng<0.40 else 25
            ss[(r,c)]=ss.get((r,c),0)+val
    elif prize=='rolled_wild_count':
        rng=random.random(); cnt=5 if rng<0.20 else 4 if rng<0.50 else 3
        random.shuffle(cands)
        for r,c in cands[:cnt]: grid[r][c]=WILD_CELL
    elif prize=='multiplier_rain':
        rng=random.random(); cnt=5 if rng<0.20 else 4 if rng<0.50 else 3
        random.shuffle(cands)
        for r,c in cands[:cnt]:
            rng2=random.random(); val=100 if rng2<0.25 else 75 if rng2<0.50 else 50 if rng2<0.80 else 25
            ss[(r,c)]=ss.get((r,c),0)+val
    elif prize=='big_rolled_sticky_spot':
        if cands:
            r,c=random.choice(cands); rng=random.random()
            val=1000 if rng<0.20 else 500 if rng<0.50 else 250
            ss[(r,c)]=ss.get((r,c),0)+val
    elif prize=='board_frenzy':
        is_mega=random.random()<0.35; r1=random.random()
        wc2=(5 if r1<0.40 else 6) if is_mega else (4 if r1<0.50 else 5)
        sc2=(3 if random.random()<0.50 else 4) if is_mega else (2 if random.random()<0.60 else 3)
        random.shuffle(cands)
        for r,c in cands[:sc2]:
            rng=random.random()
            val=(1000 if rng<0.20 else 500 if rng<0.50 else 350) if is_mega else (500 if rng<0.20 else 300 if rng<0.50 else 200)
            ss[(r,c)]=ss.get((r,c),0)+val
        for r,c in cands[sc2:sc2+wc2]: grid[r][c]=WILD_CELL
    return extra,cash

def apply_tumble(grid,winning_set,sticky_wilds):
    pinned={}
    if sticky_wilds:
        for r,c in sticky_wilds:
            if grid[r][c]==WILD_CELL: pinned[(r,c)]=WILD_CELL; grid[r][c]=-1
    for col in range(GRID_SIZE):
        surv=[grid[row][col] for row in range(GRID_SIZE) if (row,col) not in winning_set and grid[row][col]>=0]
        nc=GRID_SIZE-len(surv)
        if nc==0: continue
        for row in range(GRID_SIZE): grid[row][col]=-1
        for i,sym in enumerate(surv): grid[nc+i][col]=sym
        for row in range(nc):
            sym=None
            if BONUS_BIAS>0 and random.random()<BONUS_BIAS:
                neigh=[]
                for dr,dc in _DIRS:
                    nr2,nc2=row+dr,col+dc
                    if 0<=nr2<GRID_SIZE and 0<=nc2<GRID_SIZE:
                        a=grid[nr2][nc2]
                        if 0<=a<=6: neigh.append(a)
                if neigh: sym=random.choice(neigh)
            if sym is None: sym=rand_sym()
            grid[row][col]=sym
    for (r,c),v in pinned.items(): grid[r][c]=v

# ── main ──────────────────────────────────────────────────────────────────────
total_ret=0.0; total_cl_win=0.0; total_pz_win=0.0
total_spins=0; total_tumbles=0; tumble_cap_hits=0
total_wc=0; retriggers=0

for _ in range(N):
    wc=[[0]*GRID_SIZE for _ in range(GRID_SIZE)]
    ss={}; sw=set(); bonus_win=0.0
    spins_rem=FREE_SPINS; bonus_sp=0

    while spins_rem>0 and bonus_sp<MAX_SPINS:
        spins_rem-=1; bonus_sp+=1
        grid=make_grid()
        for r,c in sw: grid[r][c]=WILD_CELL
        total_spins+=1

        spin_cl_win=0.0; spin_pz_win=0.0
        init_done=False; tumbles=0; spin_extra=0; scatters=0

        while True:
            clusters=detect_clusters(grid)
            if not clusters:
                if not init_done:
                    init_done=True
                    prize=roll_claw()
                    if prize is not None:
                        ex,cash=apply_prize(prize,grid,wc,ss)
                        spin_extra+=ex; spin_pz_win+=cash
                        continue
                break
            if tumbles>=MAX_TUMBLES:
                tumble_cap_hits+=1; break
            tumbles+=1; total_tumbles+=1
            for sym,cells in clusters:
                pay=cluster_pay(sym,cells,wc,ss)
                spin_cl_win+=pay
            for _,cells in clusters:
                for r,c in cells:
                    if 0<=grid[r][c]<=6: wc[r][c]+=1
            ws={(r,c) for _,cells in clusters for r,c in cells if 0<=grid[r][c]<=6}
            apply_tumble(grid,ws,sw)
            prize=roll_claw()
            if prize is not None:
                ex,cash=apply_prize(prize,grid,wc,ss)
                spin_extra+=ex; spin_pz_win+=cash

        for r in range(GRID_SIZE):
            for c in range(GRID_SIZE):
                s=grid[r][c]
                if s in(SCATTER_ID,JACKPOT_SCATTER_ID): scatters+=1

        bonus_win+=spin_cl_win+spin_pz_win
        spins_rem+=spin_extra
        sw={(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if grid[r][c]==WILD_CELL}

        if scatters>=3 and bonus_sp<MAX_SPINS:
            add=30 if scatters>=7 else 20 if scatters>=6 else 15 if scatters>=5 else 12 if scatters>=4 else 10
            spins_rem+=add; retriggers+=1

        total_cl_win+=spin_cl_win; total_pz_win+=spin_pz_win

    bonus_win=min(bonus_win,30000)
    for r in range(GRID_SIZE):
        for c in range(GRID_SIZE):
            total_wc+=wc[r][c]
    total_ret+=bonus_win

avg=total_ret/N
print(f"\nPYTHON Jackpot {N:,} bonuses")
print(f"  Avg return/bonus         {avg:.3f}")
print(f"  RTP (avg / 500 * 100)    {avg/500*100:.2f}%")
print(f"  Avg spins/bonus          {total_spins/N:.3f}")
print(f"  Avg tumbles/spin         {total_tumbles/total_spins:.3f}")
print(f"  Avg cluster win/bonus    {total_cl_win/N:.3f}")
print(f"  Avg prize win/bonus      {total_pz_win/N:.3f}")
print(f"  Avg wc/cell at bonus end {total_wc/N/(GRID_SIZE*GRID_SIZE):.4f}")
print(f"  Tumble-cap hits          {tumble_cap_hits}  ({tumble_cap_hits/total_spins*100:.2f}% of spins)")
print(f"  Retriggers               {retriggers}")
