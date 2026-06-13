const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  const errors = [];
  const resourceFails = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('requestfailed', req => {
    resourceFails.push(req.url() + ' — ' + req.failure().errorText);
  });

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:8766/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(() => {
    function rect(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
               right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
    }

    const mWrap = rect('.marquee-wrap');
    const grid  = rect('.reel-grid');
    const uiBar = rect('.ui-bar');

    // Check ::after pseudo presence via computed style
    const mWrapStyle = window.getComputedStyle(document.querySelector('.marquee-wrap'), '::after');
    const afterBg = mWrapStyle.backgroundImage;
    const afterZ  = mWrapStyle.zIndex;
    const afterPE = mWrapStyle.pointerEvents;

    // Check logo visibility
    const logo = document.querySelector('.game-logo');
    const logoDisplay = logo ? window.getComputedStyle(logo).display : 'element not found';

    // Check for any img src referencing claw-border
    const allImgs = Array.from(document.querySelectorAll('img')).map(i => i.src);
    const clawBorderImgs = allImgs.filter(s => s.includes('claw-border') && !s.includes('ze-claw-border'));

    // Check for any ze-claw-border references (should be in ::after only, not in img tags)
    const zeBorderImgs = allImgs.filter(s => s.includes('ze-claw-border'));

    // Grid insets from mWrap
    const gTop    = +(((grid.y  - mWrap.y)  / mWrap.h * 100).toFixed(2));
    const gBottom = +(((mWrap.bottom - grid.bottom) / mWrap.h * 100).toFixed(2));
    const gLeft   = +(((grid.x  - mWrap.x)  / mWrap.w * 100).toFixed(2));
    const gRight  = +(((mWrap.right  - grid.right)  / mWrap.w * 100).toFixed(2));

    // Bar vs mWrap overlap
    const barTop = uiBar ? uiBar.y : null;
    const mWrapBottom = mWrap.bottom;
    const gap = barTop ? +(barTop - mWrapBottom).toFixed(1) : null;

    return {
      afterBg, afterZ, afterPE,
      logoDisplay,
      clawBorderImgs, zeBorderImgs,
      gTop, gBottom, gLeft, gRight,
      gap,
      mWrapH: mWrap.h, mWrapW: mWrap.w,
      gridW: grid.w, gridH: grid.h
    };
  });

  await browser.close();
  Stop: Stop;

  console.log('\n=== CONSOLE ERRORS ===');
  if (errors.length === 0) console.log('  None ✓');
  else errors.forEach(e => console.log('  ERROR:', e));

  console.log('\n=== RESOURCE LOAD FAILURES ===');
  const nonFontFails = resourceFails.filter(f => !f.includes('fonts.gstatic') && !f.includes('fonts.googleapis'));
  if (nonFontFails.length === 0) console.log('  None ✓');
  else nonFontFails.forEach(f => console.log('  FAIL:', f));

  console.log('\n=== BORDER OVERLAY (::after) ===');
  console.log('  background-image:', result.afterBg);
  console.log('  z-index:', result.afterZ);
  console.log('  pointer-events:', result.afterPE);
  const borderLoads = result.afterBg && result.afterBg.includes('ze-claw-border');
  console.log('  ze-claw-border.png referenced:', borderLoads ? 'YES ✓' : 'NO ✗');

  console.log('\n=== LOGO.PNG ===');
  console.log('  .game-logo display:', result.logoDisplay, result.logoDisplay === 'none' ? '✓' : '✗ (should be none!)');
  console.log('  ze-claw-border in <img> tags:', result.zeBorderImgs.length === 0 ? 'none (correct ✓)' : result.zeBorderImgs);
  console.log('  old claw-border in <img> tags:', result.clawBorderImgs.length === 0 ? 'none ✓' : result.clawBorderImgs);

  console.log('\n=== GRID WINDOW INSETS (from .marquee-wrap) ===');
  console.log(`  top:    ${result.gTop}%   target ~30.5%  ${Math.abs(result.gTop - 30.5) < 0.6 ? '✓' : '✗'}`);
  console.log(`  bottom: ${result.gBottom}%   target ~9.5%   ${Math.abs(result.gBottom - 9.5) < 0.6 ? '✓' : '✗'}`);
  console.log(`  left:   ${result.gLeft}%   target ~9.9%   ${Math.abs(result.gLeft - 9.9) < 0.6 ? '✓' : '✗'}`);
  console.log(`  right:  ${result.gRight}%   target ~9.9%   ${Math.abs(result.gRight - 9.9) < 0.6 ? '✓' : '✗'}`);

  console.log('\n=== UI BAR / MWRAP GAP ===');
  console.log(`  Gap between mWrap bottom and bar top: ${result.gap}px  ${result.gap >= 0 ? '(no overlap ✓)' : '(OVERLAP ✗)'}`);

  console.log('\n=== GRID UNCHANGED? ===');
  console.log(`  Grid: ${result.gridW} × ${result.gridH}px`);
  console.log(`  (Expected ~1097.7 × 629.0 — unchanged from pre-edit measurement)`);

  console.log('\nDone.');
})();
