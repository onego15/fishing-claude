// Frame-stepped capture of the real game, driven by the in-game demo bot.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const out = process.argv[2] || 'frames';
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('PAGEERROR: '+e.message));
  await page.goto('http://localhost:8123/index.html?capture=1');
  await page.waitForFunction(() => window.LMcap);
  await page.evaluate(() => document.fonts.ready);
  let n = 0; const T0 = Date.now(); const marks = [];
  const ev = (f, a) => page.evaluate(f, a);
  async function frames(k, untilJs) {
    for (let i = 0; i < k; i++) {
      const st = await ev(() => { LMcap.step(1, 1/30); const f = LMcap.G._fight(); return LMcap.G.state + (LMcap.G.state==='fight'&&f?':'+f.act:''); });
      await page.screenshot({ path: `${out}/f${String(n).padStart(5,'0')}.jpg`, type: 'jpeg', quality: 90 });
      if (!marks.length || marks[marks.length-1][1] !== st) marks.push([n, st]);
      n++;
      if (n % 100 === 0) console.log('frame', n, st, Math.round((Date.now()-T0)/1000)+'s');
      if (untilJs && await ev(untilJs)) return;
    }
  }
  const mark = (label) => { marks.push([n, '#' + label]); console.log('mark', label, n); };
  // --- segment A: title → day catch
  await ev(() => { LMcap.bot.paused = true; LMcap.step(30, 1/30); });
  mark('title');
  await frames(75);
  await ev(() => { LMcap.start(false); LMcap.bot.paused = false; LMcap.bot.idleDelay = 1.2; LMcap.bot.nextTarget = 0.8; LMcap.G.forceFish = 'tsuyuhikari'; LMcap.bot.cardDelay = 2.8; });
  mark('dayplay');
  await frames(900, () => LMcap.G.state === 'idle' && LMcap.G.save.catches > 0);
  await frames(15);
  // --- segment B: journal & workshop
  mark('menus');
  await ev(() => { LMcap.bot.paused = true; LMcap.G.save.lumen += 60; LMcap.ui.openDex(); });
  await frames(55);
  await ev(() => { LMcap.ui.closeModals(); LMcap.ui.openShop(); });
  await frames(30);
  await ev(() => { document.querySelector('#shop-list .buy:not(:disabled)')?.click(); });
  await frames(30);
  await ev(() => { LMcap.ui.closeModals(); });
  await frames(10);
  // --- segment C: rest to dusk, glowing jumper
  mark('dusk');
  await ev(() => { LMcap.env.hour = 15.9; LMcap.G.rest(); });
  await frames(80);
  await ev(() => { LMcap.env.weather = 'clear'; LMcap.env.hour = 17.55; LMcap.bot.paused = false; LMcap.bot.nextTarget = 0.62; LMcap.G.forceFish = 'hotaruayu'; LMcap.env.secondsPerHour = 60; });
  await frames(900, () => LMcap.G.state === 'idle' && LMcap.G.save.catches > 1);
  await frames(10);
  // --- segment D: rain at nightfall
  mark('rain');
  await ev(() => { LMcap.env.weather = 'rain'; LMcap.env.rain = 0.8; LMcap.env.hour = 18.9; LMcap.G.forceFish = 'aogane'; LMcap.bot.nextTarget = 0.95; });
  await frames(30);
  await ev(() => { LMcap.env.lightning = 1; });
  await frames(900, () => LMcap.G.state === 'idle' && LMcap.G.save.catches > 2);
  await frames(10);
  // --- segment E: clear night, the sovereign
  mark('night');
  await ev(() => {
    LMcap.bot.paused = true;
    LMcap.G.fade = 1; LMcap.env.weather = 'clear'; LMcap.env.rain = 0; LMcap.env.fog = 0; LMcap.env.hour = 21.2;
    const s = LMcap.G.save; for (const f of LM.FISH) if (!f.legend && !s.species[f.id]) s.species[f.id] = { count: 1, best: f.size };
    s.up.lure = 2; s.up.rod = 1; s.up.line = 1; LMcap.ui.updateHud();
  });
  await frames(50);
  await ev(() => { LMcap.bot.paused = false; LMcap.bot.nextTarget = 0.97; LMcap.bot.cardDelay = 3.2; });
  await frames(1500, () => LMcap.G.state === 'ending' && LMcap.G.stateT > 6.5);
  mark('end');
  await frames(120);
  fs.writeFileSync(out + '/marks.json', JSON.stringify(marks));
  console.log('done', n, Math.round((Date.now()-T0)/1000)+'s');
  await browser.close();
})();
