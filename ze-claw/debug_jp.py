#!/usr/bin/env python3
"""Debug: run ONE Jackpot bonus with seed=42, print every cluster and prize."""
import random, sys, time
from collections import deque

# ── constants (verbatim from ze-claw-sim.py) ──────────────────────────────────
GRID_SIZE = 7
WILD_CELL = 7
SCATTER_ID = 8
JACKPOT_SCATTER_ID = 9
PAY_TABLE = [
    [1.0,  2.5,   7.5,  15.0,  150.0],
    [0.75, 2.0,   6.0,  12.5,  100.0],
    [0.5,  1.75,  4.0,  10.0,   60.0],
    [0.4,  1.25,  3.0,   7.0,   40.0],
    [0.3,  0.75,  2.0,   5.5,   30.0],
    [0.25, 0.4,   1.25,  2.75,  25.0],
    [0.2,  0.25,  1.0,   2.5,   20.0],
]
SYMBOL_IDS = list(range(7))
BONUS_WEIGHTS = [14, 17, 18, 16, 12, 11, 10]
BONUS_SCATTER_CHANCE = 0.0107
BONUS_BIAS = 0.25
MAX_CELL_MULT = 512
MAX_TUMBLES_PER_SPIN = 100
MAX_SPINS_PER_BONUS = 50
FREE_SPINS_PER_BONUS = 10
CLAW_CHANCE_JACKPOT = 0.09
GOLDEN_CLAW_RATE_JACKPOT = 0.10
JACKPOT_CLAW_PRIZES = [
    ('extra_spins',            22),
    ('single_wild',            16),
    ('double_wild',            12),
    ('small_cash',             10),
    ('seed_bomb',              10),
    ('small_sticky_spot',      10),
    ('rolled_wild_count',      10),
    ('multiplier_rain',         7),
    ('big_rolled_sticky_spot',  2),
    ('board_frenzy',            1),
]
JACKPOT_CLAW_PRIZE_TOTAL = sum(w for _, w in JACKPOT_CLAW_PRIZES)
JACKPOT_GOLDEN_PRIZES = [
    ('rolled_wild_count',     10),
    ('multiplier_rain',        7),
    ('big_rolled_sticky_spot', 2),
    ('board_frenzy',           1),
]
JACKPOT_GOLDEN_TOTAL = sum(w for _, w in JACKPOT_GOLDEN_PRIZES)
_DIRS = ((-1,0),(1,0),(0,-1),(0,1))
SYMBOL_NAMES = ['gold-teddy','unicorn','robot','duck','pink-token','blue-token','yellow-token']

def base_multiplier(sym_id, size):
    if size < 5: return 0.0
    m5, m7, m10, m12, m15 = PAY_TABLE[sym_id]
    if size >= 15: return m15
    if size >= 12: return m12 + (size-12)/3*(m15-m12)
    if size >= 10: return m10 + (size-10)/2*(m12-m10)
    if size >=  7: return m7  + (size-7) /3*(m10-m7)
    return              m5  + (size-5) /2*(m7-m5)

def random_symbol():
    if random.random() < BONUS_SCATTER_CHANCE: return SCATTER_ID
    return random.choices(SYMBOL_IDS, weights=BONUS_WEIGHTS)[0]

def make_grid():
    return [[random_symbol() for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]

def detect_clusters(grid):
    real_visited = set()
    clusters = []
    for sr in range(GRID_SIZE):
        for sc in range(GRID_SIZE):
            sym = grid[sr][sc]
            if not (0 <= sym <= 6): continue
            key = (sr, sc)
            if key in real_visited: continue
            sym_id = sym
            queue = deque([key])
            group = [key]
            wilds_added = set()
            real_visited.add(key)
            while queue:
                r, c = queue.popleft()
                for dr, dc in _DIRS:
                    nr, nc = r+dr, c+dc
                    if not (0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE): continue
                    adj = grid[nr][nc]
                    nk = (nr, nc)
                    if adj == WILD_CELL and nk not in wilds_added:
                        wilds_added.add(nk)
                        group.append(nk)
                    elif adj == sym_id and nk not in real_visited:
                        real_visited.add(nk)
                        queue.append(nk)
                        group.append(nk)
            if len(group) >= 5:
                clusters.append((sym_id, group))
    return clusters

def cluster_payout_debug(sym_id, cells, win_counts, sticky_spots, cluster_idx):
    size = len(cells)
    base = base_multiplier(sym_id, size)
    if base == 0.0: return 0.0
    mult_sum = 0
    cell_details = []
    for r, c in cells:
        wc = win_counts[r][c]
        cm = min(MAX_CELL_MULT, 2**wc) if wc >= 1 else 0
        sp = sticky_spots.get((r, c), 0) if sticky_spots else 0
        mult_sum += cm + sp
        if cm > 0 or sp > 0:
            cell_details.append(f"    cell({r},{c}) wc={wc} cellMult={cm} sticky={sp}")
    payout = base * max(1, mult_sum)
    print(f"  CLUSTER#{cluster_idx}: sym={SYMBOL_NAMES[sym_id]} size={size} "
          f"base={base:.4f} multSum={mult_sum} payout={payout:.4f}")
    for d in cell_details:
        print(d)
    return payout

def roll_claw():
    if random.random() >= CLAW_CHANCE_JACKPOT: return None
    if random.random() < GOLDEN_CLAW_RATE_JACKPOT:
        pool, total = JACKPOT_GOLDEN_PRIZES, JACKPOT_GOLDEN_TOTAL
    else:
        pool, total = JACKPOT_CLAW_PRIZES, JACKPOT_CLAW_PRIZE_TOTAL
    roll = random.random() * total
    cum = 0.0
    for name, w in pool:
        cum += w
        if roll < cum: return name
    return pool[-1][0]

def apply_prize_debug(prize, grid, win_counts, sticky_spots):
    extra_spins = 0
    cash = 0.0
    detail = ''
    if prize == 'extra_spins':
        rng = random.random()
        n = 10 if rng < 0.20 else 5 if rng < 0.50 else 3
        extra_spins = n
        detail = f'+{n} spins'
    elif prize == 'single_wild':
        cands = [(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
        if cands:
            r,c = random.choice(cands)
            grid[r][c] = WILD_CELL
            detail = f'wild at ({r},{c})'
    elif prize == 'double_wild':
        cands = [(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
        random.shuffle(cands)
        placed = []
        for r,c in cands[:2]:
            grid[r][c] = WILD_CELL
            placed.append(f'({r},{c})')
        detail = 'wilds at ' + ','.join(placed)
    elif prize == 'small_cash':
        rng = random.random()
        cash = 75.0 if rng < 0.20 else 50.0 if rng < 0.60 else 25.0
        detail = f'+{cash}x cash'
    elif prize == 'seed_bomb':
        cands = [(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
        random.shuffle(cands)
        for r,c in cands[:5]:
            win_counts[r][c] = max(win_counts[r][c], 3)
        detail = f'seed_bomb 5 cells → wc≥3'
    elif prize == 'small_sticky_spot':
        cands = [(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
        if cands:
            r,c = random.choice(cands)
            rng = random.random()
            val = 50 if rng < 0.40 else 25
            sticky_spots[(r,c)] = sticky_spots.get((r,c),0) + val
            detail = f'sticky {val}x at ({r},{c})'
    elif prize == 'rolled_wild_count':
        rng = random.random()
        count = 5 if rng < 0.20 else 4 if rng < 0.50 else 3
        cands = [(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
        random.shuffle(cands)
        placed = []
        for r,c in cands[:count]:
            grid[r][c] = WILD_CELL
            placed.append(f'({r},{c})')
        detail = f'{count} wilds: ' + ','.join(placed)
    elif prize == 'multiplier_rain':
        rng = random.random()
        count = 5 if rng < 0.20 else 4 if rng < 0.50 else 3
        cands = [(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
        random.shuffle(cands)
        spots = []
        for r,c in cands[:count]:
            rng2 = random.random()
            val = 100 if rng2 < 0.25 else 75 if rng2 < 0.50 else 50 if rng2 < 0.80 else 25
            sticky_spots[(r,c)] = sticky_spots.get((r,c),0) + val
            spots.append(f'({r},{c})+{val}')
        detail = f'rain {count}: ' + ','.join(spots)
    elif prize == 'big_rolled_sticky_spot':
        cands = [(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
        if cands:
            r,c = random.choice(cands)
            rng = random.random()
            val = 1000 if rng < 0.20 else 500 if rng < 0.50 else 250
            sticky_spots[(r,c)] = sticky_spots.get((r,c),0) + val
            detail = f'big sticky {val}x at ({r},{c})'
    elif prize == 'board_frenzy':
        is_mega = random.random() < 0.35
        r1 = random.random()
        wc = (5 if r1 < 0.40 else 6) if is_mega else (4 if r1 < 0.50 else 5)
        sc2 = (3 if random.random() < 0.50 else 4) if is_mega else (2 if random.random() < 0.60 else 3)
        cands = [(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if 0<=grid[r][c]<=6]
        random.shuffle(cands)
        for r,c in cands[:sc2]:
            rng = random.random()
            val = (1000 if rng<0.20 else 500 if rng<0.50 else 350) if is_mega else (500 if rng<0.20 else 300 if rng<0.50 else 200)
            sticky_spots[(r,c)] = sticky_spots.get((r,c),0) + val
        for r,c in cands[sc2:sc2+wc]:
            grid[r][c] = WILD_CELL
        detail = f'frenzy mega={is_mega} wilds={wc} spots={sc2}'
    print(f"  PRIZE: {prize} → {detail}")
    return extra_spins, cash

def apply_tumble(grid, winning_set, sticky_wilds):
    pinned = {}
    if sticky_wilds:
        for r,c in sticky_wilds:
            if grid[r][c] == WILD_CELL:
                pinned[(r,c)] = WILD_CELL
                grid[r][c] = -1
    for col in range(GRID_SIZE):
        survivors = [grid[row][col] for row in range(GRID_SIZE)
                     if (row,col) not in winning_set and grid[row][col] >= 0]
        new_count = GRID_SIZE - len(survivors)
        if new_count == 0: continue
        for row in range(GRID_SIZE): grid[row][col] = -1
        for i, sym in enumerate(survivors): grid[new_count+i][col] = sym
        for row in range(new_count):
            sym = None
            if BONUS_BIAS > 0 and random.random() < BONUS_BIAS:
                neighbors = []
                for dr,dc in _DIRS:
                    nr,nc = row+dr, col+dc
                    if 0<=nr<GRID_SIZE and 0<=nc<GRID_SIZE:
                        adj = grid[nr][nc]
                        if 0<=adj<=6: neighbors.append(adj)
                if neighbors: sym = random.choice(neighbors)
            if sym is None: sym = random_symbol()
            grid[row][col] = sym
    for (r,c),v in pinned.items():
        grid[r][c] = v

# ── run ONE bonus ─────────────────────────────────────────────────────────────
random.seed(42)

win_counts = [[0]*GRID_SIZE for _ in range(GRID_SIZE)]
sticky_spots = {}
sticky_wilds = set()
bonus_win = 0.0
spins_remaining = FREE_SPINS_PER_BONUS
bonus_spins = 0
global_cluster_idx = 0

print("=== PYTHON DEBUG: ONE Jackpot Bonus (seed=42) ===\n")

while spins_remaining > 0 and bonus_spins < MAX_SPINS_PER_BONUS:
    spins_remaining -= 1
    bonus_spins += 1
    grid = make_grid()
    for r,c in sticky_wilds:
        grid[r][c] = WILD_CELL

    print(f"--- SPIN {bonus_spins}  spins_remaining={spins_remaining} "
          f"sticky_wilds={len(sticky_wilds)} sticky_spots={len(sticky_spots)} ---")

    spin_win = 0.0
    initial_claw_done = False
    spin_tumbles = 0
    extra_spins_total = 0
    spin_scatters = 0

    while True:
        clusters = detect_clusters(grid)

        if not clusters:
            if not initial_claw_done:
                initial_claw_done = True
                if CLAW_CHANCE_JACKPOT > 0:
                    prize = roll_claw()
                    if prize is not None:
                        es, cash = apply_prize_debug(prize, grid, win_counts, sticky_spots)
                        extra_spins_total += es
                        spin_win += cash
                        continue
            break

        spin_tumbles += 1

        for sym_id, cells in clusters:
            global_cluster_idx += 1
            pay = cluster_payout_debug(sym_id, cells, win_counts, sticky_spots, global_cluster_idx)
            spin_win += pay

        for _, cells in clusters:
            for r,c in cells:
                sym = grid[r][c]
                if 0 <= sym <= 6:
                    win_counts[r][c] += 1

        winning_set = {(r,c) for _,cells in clusters for r,c in cells if 0<=grid[r][c]<=6}
        apply_tumble(grid, winning_set, sticky_wilds)

        prize = roll_claw()
        if prize is not None:
            es, cash = apply_prize_debug(prize, grid, win_counts, sticky_spots)
            extra_spins_total += es
            spin_win += cash

        if spin_tumbles >= MAX_TUMBLES_PER_SPIN:
            break

    for r in range(GRID_SIZE):
        for c in range(GRID_SIZE):
            sym = grid[r][c]
            if sym in (SCATTER_ID, JACKPOT_SCATTER_ID):
                spin_scatters += 1

    bonus_win += spin_win
    spins_remaining += extra_spins_total
    sticky_wilds = {(r,c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if grid[r][c]==WILD_CELL}

    if spin_scatters >= 3 and bonus_spins < MAX_SPINS_PER_BONUS:
        add = 30 if spin_scatters>=7 else 20 if spin_scatters>=6 else 15 if spin_scatters>=5 else 12 if spin_scatters>=4 else 10
        spins_remaining += add
        print(f"  SCATTER RETRIGGER: {spin_scatters} scatters → +{add} spins")

    print(f"  spin_win={spin_win:.4f}  bonus_win_so_far={bonus_win:.4f}  "
          f"tumbles={spin_tumbles}  scatters={spin_scatters}\n")

print(f"=== FINAL bonus_win={bonus_win:.4f}  capped={min(bonus_win,30000):.4f} ===")
