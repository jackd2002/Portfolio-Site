# Info Panel — Handover Document

**From:** the assistant on *Ze Claw* (a cluster-pays slot machine)
**To:** the assistant building the new game
**Subject:** How the in-game "info / paytable" panel was designed and built

You're on a different stack, so nothing here is about a specific language or markup — it's about the **design, the architecture, and the game rules the panel has to communicate**. Steal the pattern, not the syntax.

---

## 1. What the info panel actually is

It's the rules screen. A player taps the **info button** (a small icon sitting next to the Spin button in the bottom control bar) and a **modal overlay** takes over the screen: a dark, dimmed backdrop behind a single centered card. The card is **paginated** — 8 pages — and the player flips through them with a Prev / Next control. A page counter ("Page 3 / 8") and a close button (✕) sit in the header. Clicking the dimmed backdrop or the ✕ closes it.

That's the whole interaction surface. Three verbs: **open, flip, close.** Everything else is content.

### The one principle that matters most

**The info panel is not written by hand. It is generated from the exact same numbers that run the game.**

Every payout value, drop rate, cap, spin count, and prize effect shown to the player is read *live* from the same constants the game engine uses to actually resolve spins. Nobody types "the top symbol pays 150×" into the rules screen. The rules screen reads the pay table variable, pulls the number out, and renders it. If a designer retunes the game — changes a payout, a bonus cost, a drop rate — the info panel updates itself with zero extra work and **can never drift out of sync with reality.**

This is the single most important thing to copy. In gambling-style games, a rules screen that lies (because someone forgot to update it after a balance change) is the worst possible bug. Make the paytable a *view* of your config, never a copy of it. Build this before your game gets complicated, because retrofitting it later means hunting down every hardcoded number.

---

## 2. How *Ze Claw* works (so you know what the panel is describing)

You can't document a rules screen without knowing the rules. Here's the game in full.

### The board
- A **7×7 grid** of symbols.
- Every symbol is one of: 7 normal paying symbols, a **Wild**, a **Scatter**, or a **Jackpot Scatter**.

### Winning — clusters, not lines
This is a **cluster-pays** game, not a payline game.
- A **win** is **5 or more of the same symbol connected orthogonally** (up/down/left/right — no diagonals).
- Bigger clusters pay dramatically more. Payout scales with cluster size along breakpoints at **5, 7, 10, 12, 15+** symbols.
- Between breakpoints the payout is **linearly interpolated** — a cluster of 8 pays somewhere between the "7" value and the "10" value. This keeps every extra symbol feeling like it matters, instead of flat tiers.

### Symbol hierarchy (rarer = higher paying)
Symbols are split into three tiers for the paytable:
- **Premium** (2 symbols) — highest pay, lowest spawn weight.
- **High** (2 symbols).
- **Low** (3 symbols) — lowest pay, highest spawn weight.

The spawn weights are deliberately inverse to the payouts: the symbol that pays the most shows up the least. This is the core lever for tuning volatility.

### Tumbling / cascades
After a cluster pays, **the winning symbols are removed, and new symbols drop in from above** to fill the gaps. Then the board is re-checked. This repeats until no new clusters form. A single spin can therefore chain into many "tumbles." State (see multipliers below) **accumulates across all tumbles within a spin.** There's a hard backstop cap on tumbles per spin so a spin can always terminate.

### The multiplier / "mark" system — the game's signature mechanic
This is what makes *Ze Claw* more than a basic cluster game.
- **Every cell tracks a "win-count"**: how many separate winning clusters that specific cell has been part of.
- The win-count converts to a **ticket multiplier on a doubling curve** (win-count 1 → 2×, 2 → 4×, 3 → 8×… up to a cap of 32×). Win-count 0 = no multiplier.
- **A cluster's payout** = its base pay (from size + symbol) **× the sum of all the ticket multipliers on the cells in that cluster** (floored at 1× so a fresh cluster still pays its base).
- Because win-counts persist across tumbles, cells that keep winning become worth more and more within a spin. **In bonus modes the win-counts persist across entire spins**, so the whole session builds toward bigger and bigger hits.

### Wilds
- A **Wild** substitutes for any normal symbol and can glue clusters together.
- It **boosts adjacent cluster size but never earns its own multiplier ticket.**
- One wild can feed two *different* symbol clusters in the same step.

### Scatters and the two bonus modes
- **Scatter symbol:** land **3 or more in one spin** to trigger **Prize Mode** (free spins). More scatters = more spins (3→10, 4→12, 5→15, 6→20, 7→30).
- **Jackpot Scatter:** a *single* one triggers the premium **Jackpot Mode** directly, overriding Prize Mode. It's astronomically rare in the base game (~1 in 9,300 spins).
- Scatters landed *during* a bonus **retrigger** more spins, up to a hard session cap of 50 spins.

### The CLAW — the bonus prize engine
During bonus modes, a **CLAW** can drop onto the board (per step, at a mode-dependent rate) and award a **prize** from a weighted pool. Occasionally the claw is **golden**, which guarantees a prize from a rarer, better sub-pool.

There are two prize pools:
- **Prize Mode pool** — the standard set: extra spins, sticky wilds, instant cash, "seed bombs" (stamp several cells with a high win-count instantly), permanent sticky multiplier spots, board-wide multiplier bumps.
- **Jackpot Mode pool** — same idea, much higher claw drop rate (~4.5× more often), and juicier top-end prizes (mass wild drops, "multiplier rain," huge single-cell sticky multipliers, a rare "board frenzy").

**Sticky spots** are permanent flat multipliers pinned to a cell for the rest of the bonus, and they stack additively with the win-count tickets on the same cell.

### The two buyable bonuses
Players can **buy** a bonus instead of waiting for scatters:
- **Prize Mode** — costs 95× the current bet.
- **Jackpot Mode** — costs 500× the current bet (pure variance, chase the big win).

### Caps (the guardrails)
- Max win: **30,000× bet** (per spin in base game; per session in bonus).
- Max **50 spins** per bonus session.
- Max **100 tumbles** per spin.
- Cell multiplier cap: **32×**.

That's the whole game. The info panel exists to teach all of the above without a manual.

---

## 3. The 8-page structure (and why it's split this way)

The panel breaks the rules into pages ordered **most-immediately-useful → deepest**. A casual player reads pages 1–3 and stops; a serious player goes all the way to 8. Each page is a self-contained function that builds its own content from live constants.

| Page | Title | What it shows |
|------|-------|---------------|
| 1 | **Premium Symbols** | The 2 top symbols with their full size→payout tables |
| 2 | **High Symbols** | The 2 mid symbols, same format |
| 3 | **Low Symbols** | The 3 low symbols, same format |
| 4 | **How Clusters Work** | Grid size, min cluster, tumbling, multiple-clusters rules |
| 5 | **Multiplier Marks** | The win-count → ticket-multiplier curve + the payout formula |
| 6 | **Wilds & Scatters** | Wild behavior, scatter→spins table, jackpot scatter |
| 7 | **Bonus Modes** | Prize vs Jackpot mode: buy cost, claw rate, golden rate |
| 8 | **Prizes & Caps** | Full prize pools for both modes + all the hard caps |

Pages 1–3 are all produced by **one shared symbol-page builder** that takes a title and a list of symbol IDs — three pages, one function, no duplication. Pages 4–8 are each their own builder because their layouts differ (tables, stat grids, prose).

**Design takeaway:** group your rules by "how soon does the player need this," give repeated layouts a single parameterized builder, and let each conceptually-distinct page own its format.

---

## 4. How each page pulls from the engine (the data-driven bit in detail)

Every builder reaches into the game's real config. Concretely, on *Ze Claw*:

- **Symbol pages** loop over the pay table and the breakpoint list. The header row ("5, 7, 10, 12, 15+") *is* the breakpoints array; the values under each are the actual pay-table entries. Add a breakpoint to the game and every symbol page grows a column automatically.
- **Clusters page** interpolates its text with the real grid size and minimum cluster constant.
- **Multiplier page** *computes the curve live* — it runs the same `min(cap, 2^winCount)` formula the engine uses, in a loop, to build the table rows. The table can't disagree with the engine because it's running the engine's math.
- **Wilds & scatters page** renders the scatter→spins table straight from the lookup array the trigger logic uses.
- **Bonus modes page** shows buy costs, claw drop rates, and golden rates from their constants — and even multiplies the buy cost by the player's *current* bet to show a live dollar figure.
- **Prizes page** iterates the actual weighted prize pools. Each prize's human description (e.g. "+10 spins," "place 2 sticky wilds," "5 cells → 8× ticket") is generated from the very constants that define that prize's effect. Reweight or retune a prize and its description follows.

The pattern in the abstract:

```
for each rule the player needs to know:
    read the live config value(s) that define that rule
    format them into a human sentence / table row
```

No rule text contains a literal number that also lives in the engine. Ever.

### One nice touch worth stealing: display-name overrides
The game's internal symbol names (used in code, asset filenames, pay-table keys) are **decoupled from the names shown to the player.** There's a small override map: "the symbol the code calls *Robot* is shown to the player as *Alien*." This lets you rename things for players — for theming, localization, reskins — without touching a single line of game logic or renaming any asset. Keep your *internal identifiers* and your *player-facing labels* as two separate layers from day one.

---

## 5. The visual / UX design language

Described so you can rebuild the *feel* on your stack, not the styling.

**Layout.** A single centered card over a heavily dimmed (~78% black) backdrop, so the game visually recedes and the rules command full attention. The card has three horizontal zones:
- **Header:** page counter on the left, close ✕ on the right.
- **Body:** the scrolling content area (it's the only part that scrolls; header and footer stay pinned).
- **Footer:** Prev ◀ and Next ▶ navigation.

The card is capped in both width and height; the body scrolls internally if a page overflows. This keeps the panel the same size on every page and never lets it run off-screen.

**Tone.** Dark theme (deep near-black indigo card), soft rounded corners, a big soft drop shadow so it floats above the game. It reads "premium arcade cabinet," not "spreadsheet."

**Color as hierarchy.** A single **warm gold accent** carries all the emphasis — page titles, the key number in a table row, the highlighted stat. Body text is white at reduced opacity; secondary/hint text is dimmer still. Three opacity levels of white + one gold = the entire palette. This is what makes dense number-heavy pages still feel calm and readable.

**Repeating content components.** A few small reusable display blocks get used across pages:
- **Stat boxes** — a little labeled tile ("Min cluster: 5+") for headline numbers.
- **Data tables** — for anything with a "this value → that result" shape (the multiplier curve, scatter spins, prize effects).
- **Symbol rows** — icon + name + its payout cells, for the symbol pages.

Design each of these once, reuse everywhere. Consistency across pages is what makes it feel like one considered screen instead of eight different ones.

**Affordances.** Nav buttons visibly **disable at the ends** (Prev greyed out on page 1, Next greyed on page 8) so the player always knows where the boundaries are. The counter reinforces it. Hover states on everything interactive.

---

## 6. Checklist for building yours

1. **Make your config the single source of truth.** Payouts, rates, caps, costs — all live in named constants the engine reads. Do this first.
2. **The rules screen reads that config; it never restates it.** Loop over the data, format it, render it.
3. **Compute derived values with the engine's own formula** (like the multiplier curve) rather than typing out the results.
4. **Separate internal IDs from player-facing labels** so you can rename/localize/reskin freely.
5. **Paginate by urgency:** the stuff a new player needs first goes first; the deep math goes last.
6. **One parameterized builder for repeated layouts** (the three symbol pages share one).
7. **A tiny set of reusable display components** (stat box, table, symbol row) used across all pages.
8. **Modal UX = open / flip / close.** Dim the game hard, pin header+footer, scroll only the body, disable nav at the ends, allow backdrop-click and an explicit ✕ to close.
9. **Keep the palette tiny:** one accent color for all emphasis, a couple of opacity steps of your text color for hierarchy.

If you get #1 and #2 right, everything else is presentation. The whole reason this panel is trustworthy is that it's structurally *incapable* of showing the player a number the game doesn't actually use.
