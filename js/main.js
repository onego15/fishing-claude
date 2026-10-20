/* Lumina Mere — boot, main loop, input, and capture/demo hooks */
'use strict';

(function (LM) {
  const G = LM.G;
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('view');
  const params = new URLSearchParams(location.search);
  const CAPTURE = params.has('capture');
  const DEMO = params.has('demo') || CAPTURE;
  let post;

  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(2560, Math.round(r.width * dpr));
    canvas.width = w;
    canvas.height = Math.round(w * 9 / 16);
    stage.style.fontSize = (r.height / 1080 * 24) + 'px';
  }

  // ------------------------------------------------------------ input
  const inp = G.input;
  let downSrc = 0;
  function press() {
    LM.audio.init();
    if (G.state === 'title') return;
    if (LM.ui.dismissCatch()) return;
    if (G.menuOpen) return;
    if (!inp.down) { inp.down = true; inp.pressed = true; }
  }
  function release() {
    if (inp.down) { inp.down = false; inp.released = true; }
  }
  stage.addEventListener('pointerdown', (e) => { if (DEMO) return; downSrc++; press(); e.preventDefault(); });
  window.addEventListener('pointerup', () => { if (DEMO) return; release(); });
  window.addEventListener('blur', release);
  window.addEventListener('keydown', (e) => {
    if (DEMO) return;
    const k = e.key.toLowerCase();
    if (G.state === 'title') {
      if (k === 'arrowup' || k === 'arrowdown' || k === 'w' || k === 's') {
        if (G.hasSave()) { LM.ui.titleSel = 1 - LM.ui.titleSel; LM.ui.markTitle(); LM.audio.init(); LM.audio.sfx('ui'); }
      }
      if (k === ' ' || k === 'enter' || k === 'z') { LM.audio.init(); G.startGame(LM.ui.titleSel === 1); }
      e.preventDefault();
      return;
    }
    if (k === ' ' || k === 'enter' || k === 'z') { if (!e.repeat) press(); e.preventDefault(); return; }
    if (e.repeat) return;
    if (k === 'escape') { LM.ui.closeModals(); return; }
    if (k === 'j') { if (!LM.ui.closeModals()) LM.ui.openDex(); }
    if (k === 'u') { if (!LM.ui.closeModals()) LM.ui.openShop(); }
    if (k === 'r') G.rest();
    if (k === 'm') LM.ui.toggleSound();
  });
  window.addEventListener('keyup', (e) => {
    if (DEMO) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter' || k === 'z') release();
  });

  // ------------------------------------------------------------ demo bot
  // Plays the real game through the same input flags a player would use.
  const bot = { target: 0.85, holdT: 0, wantDown: false, lastState: '', script: null };
  LM.bot = bot;
  function botThink(dt) {
    let want = false;
    const s = G.state;
    if (s !== bot.lastState) { bot.lastState = s; bot.t = 0; if (s === 'idle') bot.target = bot.nextTarget !== undefined ? bot.nextTarget : 0.6 + Math.random() * 0.4; }
    bot.t += dt;
    switch (s) {
      case 'idle': want = bot.t > (bot.idleDelay || 0.9); break;
      case 'charge': want = G.power < bot.target || G.powerDir < 0 && G.power > bot.target + 0.05 ? true : false; if (G.power >= bot.target && G.powerDir > 0) want = false; break;
      case 'bite': want = G.stateT > 0.18 + Math.random() * 0.05; break;
      case 'fight': {
        const f = LM.G._fight();
        if (!f) break;
        const air = f.act === 'jump' && f.actT > 0.05;
        if (f.justT > 0 && f.justT < 0.3) { want = !inp.down; break; }
        if (air) { want = false; break; }
        const heavy = f.act === 'pull' || f.act === 'dive' || (f.act === 'vanish' && f.F > 0.5);
        const limit = heavy ? 62 : 84;
        want = inp.down ? f.T < limit : f.T < limit - 22;
        break;
      }
      case 'result': if (bot.t > (bot.cardDelay || 2.6)) LM.ui.dismissCatch(); break;
    }
    if (want && !inp.down) { inp.down = true; inp.pressed = true; }
    else if (!want && inp.down) { inp.down = false; inp.released = true; }
  }

  // ------------------------------------------------------------ frame
  let last = performance.now();
  let lightningT = 20;
  function frame(dtReal) {
    const dt = Math.min(dtReal, 1 / 20);
    G.real += dt;
    if (DEMO && G.state !== 'title' && !bot.paused) botThink(dt);
    const sdt = dt * G.timeScale;
    G.time += sdt;
    const freeze = G.state === 'title' || G.menuOpen || G.state === 'ending';
    LM.env.update(sdt, { freezeTime: freeze });
    if (G.state !== 'title' || true) G.update(sdt);
    LM.World.update(sdt, G);
    LM.audio.update(dt);
    LM.ui.tick(dt);
    // thunder in heavy rain
    if (LM.env.rain > 0.8) {
      lightningT -= dt;
      if (lightningT <= 0) { LM.env.lightning = 1; setTimeout(() => LM.audio.sfx('thunder'), 700); lightningT = 25 + Math.random() * 30; }
    }
    inp.pressed = false;
    inp.released = false;
    render();
  }

  function render() {
    LM.World.render(G);
    const env = LM.env, c = env.c, cam = G.cam;
    const shake = cam.shake;
    const sx = Math.sin(G.real * 53) * shake * 0.006, sy = Math.cos(G.real * 61) * shake * 0.006;
    const ws = (x, y) => { const p = G.worldToScreen(x, y); return [p.x, p.y]; };
    const zf = 1 / Math.max(cam.focus - LM.HORIZON + 3, 1), zc = 1 / (205 - LM.HORIZON + 3);
    post.render(LM.World.layers, {
      cx: cam.cx + sx, cy: cam.cy + sy, zoom: cam.zoom, focus: cam.focus, time: G.real,
      sun: ws(c.sun.x, c.sun.y), moon: ws(c.moon.x, c.moon.y),
      fog: env.fog, night: c.night, sunny: c.sunny * (c.sun.y < LM.HORIZON + 4 ? 1 : 0), rain: env.rain,
      flash: G.flash, fade: G.fade, sat: 1.1 - env.rain * 0.25 - env.fog * 0.1, sky: 1.0, blurScale: 1.0,
      lightning: env.lightning, grain: CAPTURE ? 0 : 1, dofMid: LM.clamp(Math.abs(zf - zc) * 40, 0, 1.0),
      amb: c.amb, fogCol: LM.scale(c.fog, 1 / 255), sunCol: LM.scale(c.glow, 1 / 255),
    });
  }

  function loop(now) {
    const dt = (now - last) / 1000;
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ boot
  function boot() {
    resize();
    window.addEventListener('resize', resize);
    try { post = new LM.Post(canvas); } catch (e) { console.error(e); post = null; }
    if (!post) { post = { render() {} }; }
    LM.World.init();
    LM.env.hour = 17.9;
    LM.env.update(0, {});
    LM.ui.init();
    G.fade = 1;
    // expose for automated capture
    window.LMcap = {
      step(n, dt) { for (let i = 0; i < n; i++) frame(dt || 1 / 30); },
      start(cont) { G.startGame(!!cont); },
      G, env: LM.env, bot, ui: LM.ui,
      webgl: !!(post && post.gl),
    };
    if (!CAPTURE) requestAnimationFrame((t) => { last = t; requestAnimationFrame(loop); });
    if (DEMO && !CAPTURE) setTimeout(() => G.startGame(false), 2500);
  }
  window.addEventListener('load', boot);
})(window.LM);
