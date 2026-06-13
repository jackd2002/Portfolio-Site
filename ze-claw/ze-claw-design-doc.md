# ZE CLAW — Game Design Document

**Studio:** Jack's Machines
**Designer:** Jack
**Status:** In Development
**Document version:** v1.1
**Last updated:** June 2026

---

## 1. The Pitch

A 7×7 cluster-pays slot where the slow accumulation of multiplier marks is interrupted by rare, theatrical moments delivered by **the CLAW** — a toy-claw mechanism that descends to place wilds, double marks, shower sticky multipliers, or trigger full board frenzies.

The game is structured around two bonus modes — Prize Mode and Jackpot Mode — each accessible *either* through natural scatter combinations during base play *or* through direct bonus buy. The base game is a complete, playable experience on its own.

**One-liner:** A 7×7 cluster game where you choose how much of the arcade you want to win.

---

## 2. Design Thesis

The game fuses two competing schools of modern slot design:

- **The "build-up" school** (Sugar Rush 1000, Pragmatic Play) — persistent multiplier marks accumulate across spins, building investment in the grid state.
- **The "moment" school** (Wanted Dead or a Wild, Hacksaw Gaming) — rare, cinematic feature triggers deliver punctuated drama.

Most games choose one. Ze Claw fuses both: **accumulation is the setup for the theatrical moment, mechanically and emotionally.** Every multiplier mark a player earns in base play is potential energy that the CLAW will eventually release.

---

## 3. Core Specifications

| Spec | Value |
|---|---|
| Grid | 7×7 |
| Mechanic | Cluster pays (5+ symbols connected horizontally/vertically) |
| Reel behavior | Tumbling (winning symbols removed, new symbols cascade in) |
| RTP (measured) | Base ~91.6% · Prize buy ~93.4% · Jackpot buy ~94.8% |
| Volatility | High (base) / Very High (Prize Mode) / Extreme (Jackpot Mode) |
| Max win | 30,000× bet |
| Min bet | $0.20 |
| Bonus buy tiers | 2 — Prize Mode 95× · Jackpot Mode 500× |

---

## 4. Theme & Art Direction

### Theme
**Toy Shop / Arcade.** Specifically: the inside of a vibrant Tokyo-style arcade after hours, with the prize-cabinet glow illuminating the room. The player is reaching into a magical claw machine that contains the entire shop's prize stock.

### Visual Hierarchy
Following the principle from Hot Fiesta (Pragmatic Play) — the win-relevant symbols carry the highest visual energy; everything else is intentionally restrained to protect the hero's space.

### Color System
- **Theme palette:** hot magenta, electric cyan, sunshine yellow, chrome
- **Background:** dim aubergine/deep purple — the "after-hours arcade" look
- **UI accent (universal):** hot magenta (Pragmatic Play visual convention)
- **Mode-specific accents:** yellow (Prize Mode) / red (Jackpot Mode)

### Game Frame
A chunky **arcade cabinet** as the game's frame: chrome and neon edges, marquee lights along the top with the "ZE CLAW" logo embedded, "coin return" detail at the bottom, arcade tokens visible. Frame is the most thematically expressive part of the UI; reels themselves are neutral.

### Mode-Transforming Marquee
The top marquee changes color and signage based on game mode:
- Base game: "ZE CLAW" logo, multicolor neon
- Prize Mode bonus: "FREE PLAY" marquee, yellow bulbs
- Jackpot Mode bonus: "JACKPOT MODE" marquee, red bulbs

### Backdrop
A dim arcade interior visible behind the cabinet — rows of arcade machines in the distance, a "PRIZES" neon sign on a far wall, checkered floor. Heavily blurred during base play. Lights up dramatically during bonus modes (red wash for Jackpot Mode).

### Side Decorations
- Chrome claw mechanism partially visible at the top, with its track running along the frame — the claw is always slightly present, hinting at what's possible.
- A stack of plush toys on the side that **grows visually as the player accumulates multiplier marks**, creating a gameplay-responsive decoration.

---

## 5. Symbol Set

### High-Pay Symbols ("the premium toys")

| Rank | Symbol | Description |
|---|---|---|
| 1 | Golden Teddy Bear | The "grand prize plush" — the unreachable thing behind the glass. Glossy gold, bowtie, premium feel. |
| 2 | Sparkly Unicorn Plush | Rainbow mane, hot pink body, holographic horn. |
| 3 | Robot Toy | Chrome body, blinking lights, retro tin-toy aesthetic. |
| 4 | Rubber Duck | Classic yellow, oversized and glossy, instantly readable. |

### Low-Pay Symbols ("the fillers")

| Rank | Symbol | Description |
|---|---|---|
| 5 | Pink Arcade Token | Glossy plastic token, pink. |
| 6 | Blue Arcade Token | Glossy plastic token, blue. |
| 7 | Yellow Arcade Token | Glossy plastic token, yellow. |

### Special Symbols

**The CLAW (hero special symbol).**
A *toy version of a claw* — chunky, cartoon-proportioned, three rounded prongs like grabby fingers. Body in saturated colors: hot pink upper, electric blue mid, sunshine yellow base, glossy plastic with holographic glitter overlay. Cartoon eyes on the upper housing, friendly and blinking. Rainbow particle aura.

The CLAW does NOT pay as a cluster. When it lands during a bonus, it grants a prize from the active mode's prize pool.

**The Multiplier-Mark (persistent marker).**
Visually represented as an **arcade prize ticket** — yellow paper ticket stamped with a multiplier value. As the multiplier doubles, the ticket physically stacks higher on its grid position. By 32×, the position holds a visible wad of stacked tickets. The doubling curve caps at 32× (reached at win-count 5; 2⁵ = 32).

Win-count → multiplier: 0 → 0× · 1 → 2× · 2 → 4× · 3 → 8× · 4 → 16× · 5+ → 32× (cap).

**Scatter Symbols (two types):**

| Scatter | Visual | Function |
|---|---|---|
| Regular | Plain yellow arcade prize ticket | Counts toward the scatter trigger; 3+ triggers Prize Mode |
| Jackpot | Glowing red "BIG WIN" arcade button with neon-red light burst | Triggers Jackpot Mode directly (overrides Prize Mode); also counts toward the regular scatter total for spin-count purposes |

Scatters do NOT pay on their own (purely functional). Their reward is the anticipation of bonus entry.

### Symbol Rendering Style
Following the modern Pragmatic-style convention:
- Glossy plastic / dimensional 3D look
- Top-left key lighting with strong specular highlight
- Dark outline that pops symbols off the dark background
- Drop shadow underneath
- Pulse, glow, and emit themed particles when winning

---

## 6. Pay Table (values at $1.00 bet — final tuned)

Columns are keypoints at cluster sizes 5, 7, 10, 12, and 15+. Payouts for cluster sizes between keypoints are linearly interpolated (e.g. a 9-cluster Robot pays 4.00 + (9−7)/(10−7) × (10.00−4.00) = 8.00×). Clusters of 15+ pay the 15+ value with no further scaling.

| Symbol | 5 | 7 | 10 | 12 | 15+ |
|---|---|---|---|---|---|
| Gold Teddy | 1.00 | 2.50 | 7.50 | 15.00 | 150.00 |
| Unicorn | 0.75 | 2.00 | 6.00 | 12.50 | 100.00 |
| Robot | 0.50 | 1.75 | 4.00 | 10.00 | 60.00 |
| Duck | 0.40 | 1.25 | 3.00 | 7.00 | 40.00 |
| Pink Token | 0.30 | 0.75 | 2.00 | 5.50 | 30.00 |
| Blue Token | 0.25 | 0.40 | 1.25 | 2.75 | 25.00 |
| Yellow Token | 0.20 | 0.25 | 1.00 | 2.50 | 20.00 |

Spread ratio top-to-bottom: ~5:1 at the 5-cluster entry, widening sharply at 15+ (150× vs 20×) to reward large cluster formation.

When multiplier-mark tickets are active, the cluster's base pay is multiplied by the sum of all ticket values in the cluster (minimum 1× if no tickets). Sticky spot bonuses from CLAW prizes stack additively with ticket values on the same cell.

---

## 7. The Two-Mode Bonus System

The game's central design innovation. Two bonus modes, each accessible TWO ways: natural scatter trigger OR direct bonus buy.

### Layered Design Principle
Jackpot Mode is Prize Mode at a higher intensity — the same underlying engine running with a 4.5× higher CLAW drop rate and a jackpot-exclusive prize pool that reaches into extreme territory. This is not two separate games; it's the same game on two different settings.

- **Prize Mode** = standard bonus with CLAW prize drops
- **Jackpot Mode** = Prize Mode + 4.5× CLAW rate + jackpot prize pool (bigger wilds, multiplier rain, mega sticky spots, board frenzy) + sticky wilds that persist across the whole session

### The Two Modes

#### MODE 1 — PRIZE MODE

- **Natural trigger:** 3+ regular scatters (~1 in 308 spins)
- **Bonus buy cost:** 95× bet ($19.00 at $0.20 bet)
- **CLAW drop rate:** 2.0% per fill step
- **Mechanic:** Standard cluster-pays free spins. Persistent multiplier marks. On each fill step the CLAW may land, granting a prize from the Prize Mode pool: wild placements, extra spins, seed bombs (seeds 5 random cells to 8× ticket level), instant cash (245×), sticky +50× multiplier spots, or a board double (every active mark +1, cap wc=8).
- **Spins awarded:** 10 (3 scatters) → 12 (4) → 15 (5) → 20 (6) → 30 (7+); hard cap 50 total including retriggered spins
- **Vibe:** The classic Sugar Rush experience. Slow build, satisfying accumulation.
- **Marquee color:** Yellow

#### MODE 2 — JACKPOT MODE

- **Natural trigger:** 1 Jackpot Scatter (~1 in 9,300 spins)
- **Bonus buy cost:** 500× bet ($100.00 at $0.20 bet)
- **CLAW drop rate:** 9.0% per fill step
- **Mechanic:** Everything from Prize Mode, plus prizes are drawn from the Jackpot-exclusive pool: rolled wild counts (2–3 sticky wilds), multiplier rain (3–5 cells each receiving a sticky multiplier spot), big sticky spots (up to 50×), small cash (25–75×), seed bombs, or board frenzy (wilds + large sticky spots; rare mega-frenzy variant reaches 80× per spot). Wilds placed by CLAW prizes are sticky for the entire bonus session.
- **Spins awarded:** Same table as Prize Mode; hard cap 50 total
- **Vibe:** Accumulation is the setup, the CLAW is the release.
- **Marquee color:** Red

### Golden CLAW
Each mode has a small chance that a CLAW drop is a Golden CLAW — guaranteed to draw from the top tier of that mode's prize pool.

- Prize Mode: 1% of CLAW fires are golden
- Jackpot Mode: 10% of CLAW fires are golden

### Math Constraint (locked principle)
Buy prices match measured return.
- Prize buy = 95× bet → measured RTP ~93.4% → avg bonus return ~88.7× bet
- Jackpot buy = 500× bet → measured RTP ~94.8% → avg bonus return ~474× bet

Base game RTP (including value of naturally triggered bonuses): ~91.6%.

### Regulatory Note
The Jackpot buy at 500× sits at the 500× threshold cited in restrictive markets (UK / Netherlands / Germany). Operators in those jurisdictions should assess compliance before offering the Jackpot buy. The Prize buy at 95× is well below common thresholds and faces no additional headwind.

---

## 8. UI Layout

Following standard slot UI conventions (Pragmatic Play pattern) for player familiarity:

- **Top-left:** BUY BONUS button. Chunky arcade-button styling, magenta. Click opens the two-tier buy panel.
- **Top-right:** Settings / Info / Sound icons.
- **Top marquee:** Game logo (transforms by mode — see Marquee section)
- **Center:** The 7×7 reel grid in a dark window inside the arcade cabinet frame
- **Sides:** Themed decorations (claw mechanism, plush stack)
- **Bottom-left:** Balance display, last-win display
- **Bottom-center:** Bet selector (- / + around bet amount)
- **Bottom-right:** SPIN button (large circular, magenta with chrome rim, two-arrows icon). AUTOPLAY beside it, TURBO above.

### Buy Bonus Panel
Big visual card per mode, each with:
- The mode name in marquee styling (PRIZE MODE / JACKPOT MODE)
- Color story matching the mode (yellow / red)
- An animated preview loop showing the feature in action
- The price ($19.00 / $100.00 at $0.20 bet, scales with bet)
- A single tagline: "Watch the multipliers stack" / "Watch the claw drop in"
- A clear BUY button

---

## 9. Win Animation System

Tiered visual response based on payout size:

| Win Size | Treatment |
|---|---|
| Under 5× bet | Quick number popup |
| 5–20× bet | Chunky golden text, symbols pulse |
| 20–100× bet | "BIG WIN!" callout, screen-edge sparkles |
| 100–500× bet | "MEGA WIN!" callout, screen flash, slow-mo |
| 500×+ bet | "JACKPOT!" callout, full theatrical sequence |
| Max-tier wins | "JACKPOT!" with arcade ticket-pour finale |

Every win includes the **"ZE CLAW!"** announcer voice line, escalating in intensity:
- Small CLAW activation: quick "Ze Claw!"
- Big moment: booming "ZE CLAW!"
- Max win: over-the-top "ZZZZE CLAAAAW!"

---

## 10. Audio Direction

- **Base game:** subtle arcade ambience — distant pings, a far-off bell, the hum of fluorescent lights, a faint claw-machine motor hum.
- **Spin:** mechanical click + brief whoosh, then the soft clatter of toys settling.
- **Cluster wins:** themed particle sounds (chime for premium, soft "boop" for tokens).
- **CLAW landing:** dramatic chrome-mechanical descent sound, hydraulic hiss, "click" as it grabs.
- **CLAW activation:** confetti pop + arcade-jackpot bell cascade.
- **Bonus trigger:** the announcer voice ("ZE CLAW!") + a tier-specific sting (yellow chime / red alarm-bell).
- **Mode-specific ambience during bonus:** Prize Mode has upbeat arcade music; Jackpot Mode adds a driving bassline.

---

## 11. Open Decisions (To Resolve During Build)

- Whether the CLAW can appear in the base game at very low frequency to remind players it exists (currently disabled: CLAW_CHANCE_BASE = 0.0)
- Whether to include a "double up" / gamble feature (industry standard: probably no, gamble features are increasingly restricted)

*(Resolved: free spins per trigger → 10 for 3 scatters, sliding to 30 for 7+; retrigger → yes, in-bonus scatters retrigger; symbol reel weights → tuned and locked; Grand Prize / third tier → not built, dropped from scope.)*

---

## 12. Influences & References

- **Sugar Rush 1000** (Pragmatic Play) — base cluster-pays + multiplier-mark structure
- **Wanted Dead or a Wild** (Hacksaw Gaming) — the rare theatrical feature trigger
- **Hot Fiesta** (Pragmatic Play) — saturation hierarchy on the hero symbol
- **Pragmatic Play visual system generally** — UI conventions, frame design, win animation pattern

This game borrows the *visual dialect* of modern Pragmatic-style cluster games while inventing original mechanics (the tiered scatter trigger system, the CLAW prize-pool mechanic).

---

## 13. Build Plan

Phase 1 — Base game (Weeks 1-3): 7×7 grid, cluster detection, tumbles, multiplier marks, symbol art placeholders, spin/balance UI.

Phase 2 — Bonus modes (Weeks 4-6): scatter system, Prize Mode / Jackpot Mode feature toggles, CLAW symbol and animations, buy-bonus panel.

Phase 3 — Math verification (Week 5, parallel): Python Monte Carlo simulator. Final measured RTPs: Base ~91.6%, Prize buy ~93.4%, Jackpot buy ~94.8%. Symbol weights and prize pool weights tuned and locked.

Phase 4 — Polish (Weeks 7-8): final art pass, audio integration, win animations, mode-transforming marquee, side decoration responsiveness.

---

*Designed by Jack at Jack's Machines.*
*Tuning complete — all values in this document reflect the final locked game configuration as of June 2026.*
