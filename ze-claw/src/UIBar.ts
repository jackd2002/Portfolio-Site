import {
  Application,
  Graphics,
  Text,
  TextStyle,
  Sprite,
  Assets,
  Container,
  FillGradient,
  type Texture,
} from 'pixi.js';
import { gsap } from 'gsap';

// ─── Palette ─────────────────────────────────────────────────────────────────
const GOLD      = 0xFFD700;
const CREAM     = 0xFFF8E7;
const PANEL_TOP = 0x1E0A40;
const PANEL_BOT = 0x080214;
const PLATE_BG  = 0x07010E;
const BTN_BG    = 0x170338;

// ─── Bar dimensions ───────────────────────────────────────────────────────────
const BAR_H   = 80;
const PLATE_Y = 10;        // top/bottom gap from bar edge to plate

// ─── Layout ──────────────────────────────────────────────────────────────────
interface Layout {
  W: number;
  H: number;
  plateH: number;
  bX: number; bW: number;   // balance
  wX: number; wW: number;   // win
  betX: number; betW: number; // bet
  sX: number; sW: number;   // spin
  lX: number; lW: number;   // logo
  d1: number; d2: number; d3: number; // divider x centres
}

function makeLayout(W: number): Layout {
  const pad     = 10;
  const gap     = 11;   // spacing between section plates (includes divider)
  const logoW   = 44;
  const logoGap = 8;

  // Total width assigned to the four main sections
  const avail = W - pad * 2 - gap * 3 - logoGap - logoW;

  // Proportional widths: balance 24 % · win 17 % · bet 30 % · spin gets rest
  const bW   = Math.floor(avail * 0.24);
  const wW   = Math.floor(avail * 0.17);
  const betW = Math.floor(avail * 0.30);
  const sW   = avail - bW - wW - betW;

  const bX   = pad;
  const wX   = bX   + bW   + gap;
  const betX = wX   + wW   + gap;
  const sX   = betX + betW + gap;
  const lX   = sX   + sW   + logoGap;

  return {
    W, H: BAR_H, plateH: BAR_H - PLATE_Y * 2,
    bX, bW, wX, wW, betX, betW, sX, sW, lX, lW: logoW,
    d1: bX   + bW   + Math.floor(gap / 2),
    d2: wX   + wW   + Math.floor(gap / 2),
    d3: betX + betW + Math.floor(gap / 2),
  };
}

// ─── Text styles ─────────────────────────────────────────────────────────────
const LABEL_STYLE = new TextStyle({
  fontFamily: '"Fredoka", Arial, sans-serif',
  fontSize: 10,
  fontWeight: '600',
  fill: GOLD,
  letterSpacing: 2,
});

const VALUE_STYLE = new TextStyle({
  fontFamily: '"Fredoka", Arial, sans-serif',
  fontSize: 17,
  fontWeight: '700',
  fill: CREAM,
});

const BTN_STYLE = new TextStyle({
  fontFamily: '"Fredoka", Arial, sans-serif',
  fontSize: 20,
  fontWeight: '700',
  fill: GOLD,
});

// ─── UIBar ────────────────────────────────────────────────────────────────────
class UIBar {
  private app!: Application;
  private canvas!: HTMLCanvasElement;
  private W = 600;
  private dpr = 1;

  // Live text references (replaced on resize rebuild)
  private balV!: Text;
  private winV!: Text;
  private betV!: Text;
  private betMinus!: Container;
  private betPlus!: Container;
  private spinCt!: Container;

  // Hidden DOM mirror elements (game.js writes here; we observe and reflect)
  private hBal!: HTMLElement;
  private hWin!: HTMLElement;
  private hBet!: HTMLElement;
  private hBetDown!: HTMLButtonElement;
  private hBetUp!: HTMLButtonElement;
  private hSpin!: HTMLButtonElement;

  constructor(private mount: HTMLElement, private hidden: HTMLElement) {}

  async init(): Promise<void> {
    this.dpr = window.devicePixelRatio || 1;
    this.W   = Math.max(this.mount.clientWidth || 600, 320);

    // ── DOM mirrors ───────────────────────────────────────────────────────────
    this.hBal     = this.hidden.querySelector('#balance')!;
    this.hWin     = this.hidden.querySelector('#lastWin')!;
    this.hBet     = this.hidden.querySelector('#bet')!;
    this.hBetDown = this.hidden.querySelector<HTMLButtonElement>('#betDown')!;
    this.hBetUp   = this.hidden.querySelector<HTMLButtonElement>('#betUp')!;
    this.hSpin    = this.hidden.querySelector<HTMLButtonElement>('#spinBtn')!;

    // ── Canvas + PixiJS ───────────────────────────────────────────────────────
    this.canvas = document.createElement('canvas');
    this.mount.appendChild(this.canvas);

    this.app = new Application();
    await this.app.init({
      canvas:          this.canvas,
      width:           this.W,
      height:          BAR_H,
      backgroundAlpha: 0,
      resolution:      this.dpr,
      autoDensity:     true,
      antialias:       true,
    });
    this.canvas.style.display = 'block';

    // ── Assets ────────────────────────────────────────────────────────────────
    await Assets.load([
      { alias: 'spin',      src: 'assets/spin.png'      },
      { alias: 'uibarlogo', src: 'assets/uibarlogo.png' },
    ]);

    // ── Build ─────────────────────────────────────────────────────────────────
    this.build();
    this.syncAll();
    this.wireObservers();

    // ── Resize ────────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0 && w !== this.W) {
        this.W   = w;
        this.dpr = window.devicePixelRatio || 1;
        this.app.renderer.resize(w, BAR_H);
        this.app.stage.removeChildren();
        this.build();
        this.syncAll();
      }
    });
    ro.observe(this.mount);
  }

  // ─── Full redraw ────────────────────────────────────────────────────────────
  private build(): void {
    const L = makeLayout(this.W);
    this.drawPanel(L);
    this.drawPlate(L.bX,   L.bW,   L);
    this.drawPlate(L.wX,   L.wW,   L);
    this.drawPlate(L.betX, L.betW, L);
    this.drawDividers(L);
    this.balV   = this.addReadout('BALANCE', L.bX,   L.bW,   L);
    this.winV   = this.addReadout('WIN',     L.wX,   L.wW,   L);
    this.betV   = this.addBetSection(L);
    this.spinCt = this.addSpinButton(L);
    this.addLogo(L);
  }

  // ─── Panel gradient + gold accents ─────────────────────────────────────────
  private drawPanel(L: Layout): void {
    const g    = new Graphics();
    const grad = new FillGradient(0, 0, 0, L.H);
    grad.addColorStop(0, PANEL_TOP);
    grad.addColorStop(1, PANEL_BOT);
    g.roundRect(0, 0, L.W, L.H, 12).fill(grad);

    // Gold top border
    g.rect(0, 0, L.W, 2).fill({ color: GOLD, alpha: 0.88 });
    // Glossy highlight strip just below top border
    g.rect(0, 2, L.W, 3).fill({ color: 0xFFFFFF, alpha: 0.055 });
    // Gold bottom border
    g.rect(0, L.H - 2, L.W, 2).fill({ color: GOLD, alpha: 0.68 });
    // Gold left / right edges
    g.rect(0, 0, 2, L.H).fill({ color: GOLD, alpha: 0.55 });
    g.rect(L.W - 2, 0, 2, L.H).fill({ color: GOLD, alpha: 0.55 });

    this.app.stage.addChild(g);
  }

  // ─── Recessed readout plate ────────────────────────────────────────────────
  private drawPlate(px: number, pw: number, L: Layout): void {
    const g = new Graphics();
    const r = 8;
    g.roundRect(px, PLATE_Y, pw, L.plateH, r)
      .fill({ color: PLATE_BG, alpha: 0.9 });
    g.roundRect(px, PLATE_Y, pw, L.plateH, r)
      .stroke({ color: GOLD, width: 1.5, alpha: 0.88 });
    // Glossy inner highlight at plate top
    g.roundRect(px + 2, PLATE_Y + 2, pw - 4, 4, 2)
      .fill({ color: 0xFFFFFF, alpha: 0.07 });
    this.app.stage.addChild(g);
  }

  // ─── Gold vertical dividers ────────────────────────────────────────────────
  private drawDividers(L: Layout): void {
    const g  = new Graphics();
    const y0 = PLATE_Y + 5;
    const dH = L.plateH - 10;
    for (const dx of [L.d1, L.d2, L.d3]) {
      g.rect(dx, y0, 1, dH).fill({ color: GOLD, alpha: 0.42 });
    }
    this.app.stage.addChild(g);
  }

  // ─── Balance / Win readout (label + value); returns the value Text ──────────
  private addReadout(label: string, px: number, pw: number, _L: Layout): Text {
    const cx = px + pw / 2;

    const lbl = new Text({ text: label, style: LABEL_STYLE, resolution: this.dpr });
    lbl.anchor.set(0.5, 0);
    lbl.x = cx;
    lbl.y = PLATE_Y + 8;
    this.app.stage.addChild(lbl);

    const val = new Text({ text: '$0.00', style: VALUE_STYLE, resolution: this.dpr });
    val.anchor.set(0.5, 0);
    val.x = cx;
    val.y = lbl.y + lbl.height + 3;
    this.app.stage.addChild(val);

    return val;
  }

  // ─── Bet plate: BET label at top, then [−  value  +] row ───────────────────
  private addBetSection(L: Layout): Text {
    const cx = L.betX + L.betW / 2;
    const cy = PLATE_Y + L.plateH / 2 + 7; // centre of button row
    const R  = 13;

    const lbl = new Text({ text: 'BET', style: LABEL_STYLE, resolution: this.dpr });
    lbl.anchor.set(0.5, 0);
    lbl.x = cx;
    lbl.y = PLATE_Y + 8;
    this.app.stage.addChild(lbl);

    this.betMinus = this.makeBetBtn('−', L.betX + R + 10,          cy, R);
    this.betPlus  = this.makeBetBtn('+', L.betX + L.betW - R - 10, cy, R);

    const val = new Text({ text: '$0.00', style: VALUE_STYLE, resolution: this.dpr });
    val.anchor.set(0.5, 0.5);
    val.x = cx;
    val.y = cy;
    this.app.stage.addChild(val);

    return val;
  }

  // ─── Circular bet button ────────────────────────────────────────────────────
  private makeBetBtn(sym: string, cx: number, cy: number, r: number): Container {
    const c = new Container();
    c.x = cx;
    c.y = cy;

    const bg = new Graphics();
    bg.circle(0, 0, r).fill({ color: BTN_BG });
    bg.circle(0, 0, r).stroke({ color: GOLD, width: 1.5, alpha: 0.88 });
    // Subtle inner gloss
    bg.arc(0, -r * 0.15, r * 0.7, Math.PI, 0).fill({ color: 0xFFFFFF, alpha: 0.06 });
    c.addChild(bg);

    const t = new Text({ text: sym, style: BTN_STYLE, resolution: this.dpr });
    t.anchor.set(0.5, 0.5);
    t.y = sym === '−' ? 0 : 1;
    c.addChild(t);

    c.eventMode = 'static';
    c.cursor    = 'pointer';

    c.on('pointerover',      () => gsap.to(c.scale, { x: 1.12, y: 1.12, duration: 0.12 }));
    c.on('pointerout',       () => gsap.to(c.scale, { x: 1,    y: 1,    duration: 0.15 }));
    c.on('pointerdown',      () => { gsap.killTweensOf(c.scale); gsap.to(c.scale, { x: 0.88, y: 0.88, duration: 0.07 }); });
    c.on('pointerupoutside', () => gsap.to(c.scale, { x: 1,    y: 1,    duration: 0.2  }));
    c.on('pointerup', () => {
      gsap.to(c.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2)' });
      (sym === '−' ? this.hBetDown : this.hBetUp).click();
    });

    this.app.stage.addChild(c);
    return c;
  }

  // ─── Spin button (spin.png) ─────────────────────────────────────────────────
  private addSpinButton(L: Layout): Container {
    const c = new Container();
    c.x = L.sX + L.sW / 2;
    c.y = BAR_H / 2;

    const tex = Assets.get<Texture>('spin');
    if (tex) {
      const maxH = BAR_H - 10;
      const maxW = L.sW - 8;
      const sc   = Math.min(maxH / tex.height, maxW / tex.width);
      const sp   = new Sprite(tex);
      sp.width   = Math.round(tex.width  * sc);
      sp.height  = Math.round(tex.height * sc);
      sp.anchor.set(0.5);
      c.addChild(sp);
    }

    c.eventMode = 'static';
    c.cursor    = 'pointer';

    c.on('pointerover', () => {
      if (!this.hSpin.disabled)
        gsap.to(c.scale, { x: 1.06, y: 1.06, duration: 0.15 });
    });
    c.on('pointerout', () => gsap.to(c.scale, { x: 1, y: 1, duration: 0.15 }));
    c.on('pointerdown', () => {
      if (!this.hSpin.disabled) {
        gsap.killTweensOf(c.scale);
        gsap.to(c.scale, { x: 0.94, y: 0.94, duration: 0.08 });
      }
    });
    c.on('pointerupoutside', () => gsap.to(c.scale, { x: 1, y: 1, duration: 0.2 }));
    c.on('pointerup', () => {
      if (!this.hSpin.disabled) {
        gsap.to(c.scale, { x: 1, y: 1, duration: 0.45, ease: 'back.out(1.7)' });
        this.hSpin.click();
      } else {
        gsap.to(c.scale, { x: 1, y: 1, duration: 0.15 });
      }
    });

    this.app.stage.addChild(c);
    return c;
  }

  // ─── Maker's mark (uibarlogo.png) ──────────────────────────────────────────
  private addLogo(L: Layout): void {
    const tex = Assets.get<Texture>('uibarlogo');
    if (!tex) return;

    const maxH = BAR_H - 20;
    const maxW = L.lW;
    const sc   = Math.min(maxH / tex.height, maxW / tex.width);
    const sp   = new Sprite(tex);
    sp.width   = Math.round(tex.width  * sc);
    sp.height  = Math.round(tex.height * sc);
    sp.x       = L.lX + Math.floor((L.lW - sp.width)  / 2);
    sp.y       = Math.floor((BAR_H - sp.height) / 2);
    sp.alpha   = 0.88;
    this.app.stage.addChild(sp);
  }

  // ─── Sync initial state from hidden DOM values ──────────────────────────────
  private syncAll(): void {
    if (this.balV) this.balV.text = this.hBal.textContent ?? '$0.00';
    if (this.winV) this.winV.text = this.hWin.textContent ?? '$0.00';
    if (this.betV) this.betV.text = this.hBet.textContent ?? '$0.00';
    this.refreshSpin();
    this.refreshBet();
  }

  // ─── MutationObservers — sync DOM writes to PixiJS display ─────────────────
  private wireObservers(): void {
    const T = { childList: true, subtree: true, characterData: true };
    const A = { attributes: true, attributeFilter: ['disabled'] };

    new MutationObserver(() => {
      if (this.balV) this.balV.text = this.hBal.textContent ?? '$0.00';
    }).observe(this.hBal, T);

    new MutationObserver(() => {
      if (this.winV) this.winV.text = this.hWin.textContent ?? '$0.00';
    }).observe(this.hWin, T);

    new MutationObserver(() => {
      if (this.betV) this.betV.text = this.hBet.textContent ?? '$0.00';
    }).observe(this.hBet, T);

    new MutationObserver(() => this.refreshBet()).observe(this.hBetDown, A);
    new MutationObserver(() => this.refreshBet()).observe(this.hBetUp,   A);
    new MutationObserver(() => this.refreshSpin()).observe(this.hSpin,   A);
  }

  private refreshSpin(): void {
    if (!this.spinCt) return;
    gsap.to(this.spinCt, { alpha: this.hSpin.disabled ? 0.38 : 1, duration: 0.25 });
  }

  private refreshBet(): void {
    if (!this.betMinus || !this.betPlus) return;
    gsap.to(this.betMinus, { alpha: this.hBetDown.disabled ? 0.28 : 1, duration: 0.2 });
    gsap.to(this.betPlus,  { alpha: this.hBetUp.disabled   ? 0.28 : 1, duration: 0.2 });
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────
export async function mountUIBar(mount: HTMLElement, hidden: HTMLElement): Promise<void> {
  const bar = new UIBar(mount, hidden);
  await bar.init();
}
