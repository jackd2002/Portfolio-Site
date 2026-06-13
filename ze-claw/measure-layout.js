// One-shot Puppeteer layout measurement for Ze Claw at 1920x1080
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for fonts + layout to stabilize
  await new Promise(r => setTimeout(r, 2000));

  const data = await page.evaluate(() => {
    function rect(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    }

    const col    = rect('.reel-column');
    const mBody  = rect('.machine-body');
    const mWrap  = rect('.marquee-wrap');
    const frame  = rect('.reel-frame');
    const area   = rect('.reel-area');
    const grid   = rect('.reel-grid');
    const cell0  = rect('.cell');    // first cell
    const uiBar  = rect('.ui-bar');
    const logo   = rect('.game-logo');
    const fpInd  = rect('.fp-indicator');

    // Gap between adjacent cells
    const cells = Array.from(document.querySelectorAll('.cell'));
    let cellGap = null;
    if (cells.length >= 2) {
      const c1 = cells[0].getBoundingClientRect();
      const c2 = cells[1].getBoundingClientRect();
      cellGap = { h: c2.x - (c1.x + c1.width) };
    }

    return { col, mBody, mWrap, frame, area, grid, cell0, uiBar, logo, fpInd, cellGap,
             vw: window.innerWidth, vh: window.innerHeight };
  });

  await browser.close();

  const { col, mBody, mWrap, frame, area, grid, cell0, uiBar, vw, vh, cellGap } = data;

  console.log('\n=== VIEWPORT ===');
  console.log(`  ${vw} × ${vh}`);

  console.log('\n=== (1) REEL-COLUMN (cabinet envelope) ===');
  console.log(`  x=${col.x.toFixed(1)}, y=${col.y.toFixed(1)}`);
  console.log(`  width=${col.w.toFixed(1)}, height=${col.h.toFixed(1)}`);
  console.log(`  aspect ratio = ${(col.w/col.h).toFixed(4)} (${col.w.toFixed(0)}:${col.h.toFixed(0)})`);

  console.log('\n=== (2) MARQUEE-WRAP ===');
  console.log(`  x=${mWrap.x.toFixed(1)}, y=${mWrap.y.toFixed(1)}`);
  console.log(`  width=${mWrap.w.toFixed(1)}, height=${mWrap.h.toFixed(1)}`);
  console.log(`  aspect ratio = ${(mWrap.w/mWrap.h).toFixed(4)}`);

  console.log('\n=== (3) REEL-FRAME ===');
  console.log(`  x=${frame.x.toFixed(1)}, y=${frame.y.toFixed(1)}`);
  console.log(`  width=${frame.w.toFixed(1)}, height=${frame.h.toFixed(1)}`);

  console.log('\n=== (4) REEL-AREA ===');
  console.log(`  x=${area.x.toFixed(1)}, y=${area.y.toFixed(1)}`);
  console.log(`  width=${area.w.toFixed(1)}, height=${area.h.toFixed(1)}`);

  console.log('\n=== (5) REEL-GRID (symbol play area) ===');
  console.log(`  page-absolute: x=${grid.x.toFixed(1)}, y=${grid.y.toFixed(1)}`);
  console.log(`  width=${grid.w.toFixed(1)}, height=${grid.h.toFixed(1)}`);
  console.log(`  aspect ratio = ${(grid.w/grid.h).toFixed(4)}`);

  // Grid position relative to marquee-wrap
  const gTop    = grid.y  - mWrap.y;
  const gLeft   = grid.x  - mWrap.x;
  const gBottom = mWrap.bottom - grid.bottom;
  const gRight  = mWrap.right  - grid.right;
  console.log('\n  Grid offsets from MARQUEE-WRAP edges:');
  console.log(`    top:    ${gTop.toFixed(1)}px  (${(gTop/mWrap.h*100).toFixed(2)}% of mWrap height)`);
  console.log(`    bottom: ${gBottom.toFixed(1)}px  (${(gBottom/mWrap.h*100).toFixed(2)}%)`);
  console.log(`    left:   ${gLeft.toFixed(1)}px  (${(gLeft/mWrap.w*100).toFixed(2)}% of mWrap width)`);
  console.log(`    right:  ${gRight.toFixed(1)}px  (${(gRight/mWrap.w*100).toFixed(2)}%)`);

  // Grid position relative to reel-column
  const cgTop    = grid.y  - col.y;
  const cgLeft   = grid.x  - col.x;
  const cgBottom = col.bottom - grid.bottom;
  const cgRight  = col.right  - grid.right;
  console.log('\n  Grid offsets from REEL-COLUMN (cabinet envelope) edges:');
  console.log(`    top:    ${cgTop.toFixed(1)}px  (${(cgTop/col.h*100).toFixed(2)}% of col height)`);
  console.log(`    bottom: ${cgBottom.toFixed(1)}px  (${(cgBottom/col.h*100).toFixed(2)}%)`);
  console.log(`    left:   ${cgLeft.toFixed(1)}px  (${(cgLeft/col.w*100).toFixed(2)}% of col width)`);
  console.log(`    right:  ${cgRight.toFixed(1)}px  (${(cgRight/col.w*100).toFixed(2)}%)`);

  console.log('\n=== (6) CELL SIZE ===');
  if (cell0) {
    console.log(`  first cell: ${cell0.w.toFixed(1)} × ${cell0.h.toFixed(1)}`);
    if (cellGap) console.log(`  gap between cells (h): ${cellGap.h.toFixed(1)}px`);
    const cellsInRow = Math.round(grid.w / (cell0.w + (cellGap ? cellGap.h : 5)));
    console.log(`  estimated cells per row: ${cellsInRow}`);
  }

  console.log('\n=== (7) UI-BAR ===');
  if (uiBar) {
    console.log(`  page-absolute: x=${uiBar.x.toFixed(1)}, y=${uiBar.y.toFixed(1)}`);
    console.log(`  width=${uiBar.w.toFixed(1)}, height=${uiBar.h.toFixed(1)}`);
    const barTopFromMWrap = uiBar.y - mWrap.bottom;
    console.log(`  top of bar is ${barTopFromMWrap.toFixed(1)}px below marquee-wrap bottom`);
    const barTopFromCol = uiBar.y - col.y;
    const barBotFromCol = col.bottom - uiBar.bottom;
    console.log(`  bar top offset from col top: ${barTopFromCol.toFixed(1)}px (${(barTopFromCol/col.h*100).toFixed(2)}%)`);
    console.log(`  bar bottom offset from col bottom: ${barBotFromCol.toFixed(1)}px (${(barBotFromCol/col.h*100).toFixed(2)}%)`);
  }

  console.log('\n=== (8) MARQUEE-WRAP top-to-grid-top (crown zone) ===');
  const crownZone = grid.y - mWrap.y;
  const crownZonePct = crownZone / mWrap.h * 100;
  const frameTopZone = frame.y - mWrap.y;
  console.log(`  mWrap top -> frame top: ${frameTopZone.toFixed(1)}px (${(frameTopZone/mWrap.h*100).toFixed(2)}%)`);
  console.log(`  mWrap top -> grid top:  ${crownZone.toFixed(1)}px (${crownZonePct.toFixed(2)}%)`);
  console.log(`  Available crown height = ${frameTopZone.toFixed(1)}px`);
  console.log(`  Without grid intrusion = grid top - mWrap top = ${crownZone.toFixed(1)}px`);

  console.log('\nDone.');
})();
