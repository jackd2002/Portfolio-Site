# UI Bar — Texture & Style Handover

**From:** the assistant on *Ze Claw* (a cluster-pays slot machine)
**To:** the assistant building the other slot
**Subject:** How the bottom control bar gets its "lit metal" look — texture and style only

This is **not** about layout, controls, or what goes in the bar. Ze Claw's bar happens to hold settings, three readout plates, and a spin button; yours can hold anything. Copy the **surface treatment**, not the arrangement.

You may be on a different stack, so every section describes the *physical effect* first and gives Ze Claw's CSS second as one possible implementation. Steal the recipe, not the syntax.

---

## 1. The one thing that makes it work

**There is no texture image anywhere in this bar.** No noise map, no brushed-metal bitmap, no gradient PNG. Every bit of "material" is faked with gradients and stacked shadows, and it holds together for exactly one reason:

**One light source, fixed at the top, obeyed by every single element without exception.**

Every highlight sits on a top edge. Every shadow sits on a bottom edge or is pushed downward. Every surface gradient runs at roughly the same diagonal. Nothing in the bar contradicts the lamp.

That consistency is the whole illusion. If you add one element lit from below, the bar stops reading as an object and starts reading as a collection of boxes. Pick your light direction before you write a single value, then never break it.

---

## 2. The material vocabulary

The entire bar is built from **three verbs**, applied to every surface:

| Verb | What it does physically | How it's made |
|---|---|---|
| **Bevel** | Tells you whether a surface is raised or sunken | A light inset on one edge, a dark inset on the opposite edge |
| **Halo** | Puts a metal rim around a shape | A dull border, plus a *brighter* 1px ring just outside it |
| **Specular** | Makes metal look polished rather than painted | A bright line that fades to nothing at both ends |

Everything below is a combination of those three. There is nothing else.

---

## 3. Raised vs. recessed — the same ingredients, sign-flipped

This is the trick worth internalizing. The bar shell and the readout plates sitting inside it use *identical* ingredients. The only difference is which edge gets the light.

**The bar shell is convex — it bulges toward you.**
- Light inset on the **top** edge (thin, sharp, gold)
- Dark inset on the **bottom** edge (thin, sharp, black)

**The readout plates are concave — they're pressed into the bar.**
- Dark inset at the **top**, and *blurred* rather than sharp — this is the big one, it's what makes the plate look like it has depth under its lip
- A much fainter gold top lip, almost gone

Same three ingredients, opposite sign, and now you have two materials from one recipe. Ze Claw's:

```css
/* Raised: the bar */
box-shadow:
  0 0 0 1px rgba(212, 175, 55, 0.22),   /* halo ring          */
  0 0 22px rgba(60, 0, 120, 0.50),      /* ambient bloom      */
  inset 0 1px 0 rgba(255, 215, 0, 0.16),/* top lip — lit      */
  inset 0 -1px 0 rgba(0, 0, 0, 0.40);   /* bottom — shaded    */

/* Recessed: a readout plate */
box-shadow:
  0 0 0 1px rgba(212, 175, 55, 0.16),   /* same halo, dimmer  */
  inset 0 2px 8px rgba(0, 0, 0, 0.60),  /* sunken: dark, blurred, pushed DOWN */
  inset 0 1px 0 rgba(212, 175, 55, 0.10);
```

Note the blur difference. **Sharp = an edge. Blurred = a cavity.** A 1px hard black line reads as the underside of a lip; an 8px soft black smudge reads as a recess with air in it. That single distinction is doing most of the work.

---

## 4. The field gradient (don't flatten this)

The bar's background is **not** a two-stop gradient. It's four stops, and it's non-monotonic:

```css
background: linear-gradient(160deg,
  #280660 0%,    /* brighter purple */
  #14022e 40%,   /* near-black      */
  #1c0448 70%,   /* mid             */
  #280660 100%   /* brighter again  */
);
```

Bright → dark → mid → bright. It's a **valley**, not a ramp. A straight light-to-dark ramp reads as a flat panel someone tinted. This curve reads as light rolling across a slightly curved surface and falling off in the middle. It's subtle and it is the difference between "plastic" and "metal."

The plates reuse the **same 160° angle** with darker, semi-transparent stops so the bar's own field shows through them:

```css
background: linear-gradient(160deg, rgba(6, 0, 18, 0.80), rgba(18, 0, 45, 0.70));
```

Reusing the angle is the point — every surface is lit from the same place, so they read as one carved object rather than stacked cards. (Minor inconsistency you may as well fix in yours: Ze Claw's *buttons* use `145deg` instead of `160deg`. Nobody has ever noticed, but pick one angle and hold it.)

---

## 5. Specular lines fade at their ends. Always.

There are three bright gold lines in the bar: one horizontal shimmer across the top, and two vertical dividers. **Every one of them is transparent at both ends and brightest in the middle.**

```css
/* Top shimmer — inset from the corners so it clears the radius */
.ui-bar::before {
  position: absolute; top: 0; left: 12px; right: 12px; height: 1.5px;
  background: linear-gradient(90deg,
    transparent, #c8960c 15%, #f0c040 50%, #c8960c 85%, transparent);
  pointer-events: none;
}

/* Vertical divider — same idea, rotated */
background: linear-gradient(180deg,
  transparent 0%, #c8960c 20%, #f0c040 50%, #c8960c 80%, transparent 100%);
```

**A line that runs edge to edge is a border. A line that fades out is light.** This is the cheapest, highest-leverage rule in the whole document. If you take one thing besides the light direction, take this.

Two details that matter:
- The shimmer is inset 12px from each side so it never collides with the corner radius — a highlight that runs into a rounded corner instantly looks like a stroke.
- The dividers get a small vertical margin (2–3px) so they don't touch the bar's inner edges. Highlights that touch the frame read as structure, not reflection.

Ze Claw also runs **two tiers of divider**: the primary uses solid hex, the secondary uses the same gradient in rgba at ~0.65/0.85 alpha. Major sections get the bright one, sub-divisions inside a section get the quiet one. One divider treatment at two volumes, rather than two different dividers.

---

## 6. Gold is four colors, and each one has a job

The most common way to get this wrong is to pick one gold and use it everywhere. Ze Claw uses a **ladder of four**, each assigned to a role and never used outside it:

| Value | Role |
|---|---|
| `#7a5200` | Structural borders. Dull, almost brown. This is *metal in shadow.* |
| `#c8960c` | Labels, divider bodies. Mid gold. This is *metal in ambient light.* |
| `rgba(212, 175, 55, α)` | Halo rings, glows, accents. Always semi-transparent, alpha 0.10–0.22. |
| `#f0c040` | The specular peak — only ever the 50% stop of a fading highlight. |

The counterintuitive part: **the border is the dullest gold in the set.** Brightness never comes from the border — it comes from the halo ring and the specular line sitting next to it. A bright border reads as a sticker outline; a dull border with a bright ring beside it reads as an edge catching light.

Which brings us to the halo:

```css
border: 1.5px solid #7a5200;                    /* dull */
box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.22); /* brighter ring, just outside */
```

`0 0 0 1px` — zero offset, **zero blur**, 1px spread — is a fake second border. Dull line + bright line = a metal edge with thickness. One line = a rectangle.

---

## 7. Text: engraved, not printed

Two treatments, and they're deliberately different from each other.

**Labels glow.** Small, uppercase, wide tracking (`0.14em`), colored the *mid* gold, with a soft shadow at **zero offset** — a glow, not a drop:
```css
color: #c8960c;
text-shadow: 0 0 6px rgba(200, 150, 12, 0.45);
```

**Values are engraved and lit.** Larger, warm off-white, with a **hard 1px black drop** (that's the engraving) plus a faint warm bloom (that's the light hitting it):
```css
color: #fff8e7;
text-shadow: 0 1px 0 rgba(0, 0, 0, 0.85), 0 0 10px rgba(255, 240, 200, 0.18);
```

`0 1px 0` with **no blur** is the whole engraving effect. Blur it and it becomes a drop shadow on a floating label; keep it sharp and the text sits *in* the plate.

And the value color is `#fff8e7`, **not** `#ffffff`. The field is cool purple, the trim is warm gold — pure white breaks the temperature story and looks like a bug next to the gold. Warm text on a cool field is a big part of why this reads as rich rather than cheap.

Typeface is Fredoka at weight 600 throughout. If you don't have it, substitute something **rounded and geometric** — the softness is load-bearing for the arcade feel; a sharp grotesk will fight everything else here.

---

## 8. Buttons: same material, smaller

Buttons are the same three verbs at a smaller scale. Note the bronze metal is warm where the bar is cool — buttons read as gold hardware set into a purple chassis:

```css
/* Bet ± — bronze metal */
background: linear-gradient(145deg, #7a4a00, #3e2500);
border: 1.5px solid rgba(212, 175, 55, 0.80);   /* bright here — small parts need it */
box-shadow: 0 0 8px rgba(200, 150, 0, 0.30),    /* outer glow */
            inset 0 1px 0 rgba(255, 255, 255, 0.18); /* top lip — light again */

/* Small icon buttons — purple-black, recede into the chassis */
background: linear-gradient(145deg, rgba(28, 6, 66, 0.92), rgba(10, 0, 28, 0.88));
border: 1.5px solid rgba(180, 130, 0, 0.62);
box-shadow: 0 0 7px rgba(160, 100, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.10);
```

Small elements get a *brighter* border than the bar does — at 24px there isn't room for a halo ring to read, so the border has to carry it alone. Scale changes the recipe.

**Image buttons (spin, info) get no background and no border at all.** The art carries itself; lighting is done with `drop-shadow()` filters so the glow follows the artwork's alpha edge instead of a rectangle. If your bar uses sprite buttons, do this — a box-shadow on a transparent PNG outlines the *box*, which is always wrong.

**The interaction grammar is uniform across every control:**
- Hover → `scale(1.07–1.10)` + brightness or gold glow, ~0.12s ease
- Active → `scale(0.92–0.94)`, faster
- Disabled → opacity drop (0.30 small, 0.50 spin), all filters and transforms cleared

Only the spin button breaks the pattern, and deliberately: its press uses a `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot spring at 0.07s. The hero control gets a springier press than everything else. One exception, earned.

---

## 9. Details that are load-bearing

- **`overflow: hidden` on the bar shell.** The shimmer line is an absolutely-positioned pseudo-element; without clipping it escapes the rounded corners. Whatever your stack, the top highlight must be clipped by the shell's radius.
- **Nested radii shrink inward.** 16px shell → 10px plates. An inner radius equal to or larger than its container's always looks wrong.
- **Depth is layered, never single.** Every surface stacks 3–4 shadows: halo ring, ambient bloom, inner top light, inner bottom dark. One `box-shadow` gives you a card; four give you an object.
- **The ambient bloom** (`0 0 22px rgba(60, 0, 120, 0.50)`) is the bar glowing *into the room*. It's what ties the bar to the cabinet art behind it instead of floating on top of it. Tint it to your game's field color.
- **Everything is fluid.** Every size, pad, and font is `clamp(min, ~vw, max)`. Borders stay a fixed 1.5px — scaling them would destroy the bevel at small sizes.
- **The maker's mark sits at `opacity: 0.72`** with `pointer-events: none`. Branding should recede; it's the only element in the bar deliberately turned down.

---

## 10. Checklist for building yours

1. **Fix your light direction first.** Top. Write it down. Every highlight goes on a top edge, every shadow on a bottom edge, every gradient on one shared diagonal. No exceptions, ever.
2. **Build one raised surface and one recessed surface from the same three ingredients**, sign-flipped. Sharp inset = edge, blurred inset = cavity.
3. **Make the field gradient non-monotonic** — 4 stops, bright→dark→mid→bright. Never a 2-stop ramp.
4. **Every specular line fades to transparent at both ends,** and is inset from the corners. This is the highest-leverage rule here.
5. **Build a 4-step ladder of your accent color** and assign each step a role: dull border, mid text, transparent halo, bright peak. Never one flat accent.
6. **Dull border + bright zero-blur ring beside it.** Brightness never comes from the border itself.
7. **Hard 1px black drop on value text** = engraved. Zero-offset glow on labels = lit. Don't blur the engraving.
8. **Warm text on a cool field.** Never pure white.
9. **Shrink radii inward** as you nest.
10. **One interaction grammar** — hover grows and brightens, active shrinks, disabled goes flat — applied to every control, with at most one earned exception.

Ze Claw's palette is purple + gold; yours will be whatever your game is. **Retheme the hues freely — the recipe is the deliverable, not the colors.** Swap `#280660`/`#14022e` for your field and keep the four-step accent ladder, and it will look like the same machine shop built both cabinets.

If you get #1 and #4 right, the rest is tuning. The bar looks like metal for one reason: nothing in it ever disagrees about where the light is coming from.
