/* Lumina Mere — gameplay
 * State machine: title → idle → charge → cast → wait → bite → fight → landing → result
 * plus the reel-in duel where each species fights with its own behaviour set.
 */
'use strict';

(function (LM) {
  const W = LM.W, H = LM.H, HZ = LM.HORIZON;

  const G = {
    time: 0, real: 0, timeScale: 1,
    state: 'title', stateT: 0,
    input: { down: false, pressed: false, released: false },
    player: { pose: 'hold', lean: 0, hop: 0 },
    rod: { angle: -0.75, bend: 0 },
    bobber: { x: 0, y: 0, visible: false, onWater: false, h: 0, dip: 0, glow: 0 },
    line: { taut: 0 },
    fishVis: null,
    cam: { zoom: 1.12, cx: 0.5, cy: 0.5, focus: 205, tz: 1.12, tcx: 0.5, tcy: 0.5, tfocus: 205, shake: 0, blur: 1 },
    flash: 0, fade: 1, legendGlow: 0,
    save: null,
    tutorial: {},
    menuOpen: false,
  };
  LM.G = G;
  G._fight = () => fight;

  // ------------------------------------------------------------ save data
  const SAVE_KEY = 'lumina-mere-save-v1';
  function freshSave() {
    return { lumen: 0, species: {}, up: { rod: 0, line: 0, lure: 0 }, catches: 0, legendDone: false, playTime: 0, biggest: null };
  }
  G.loadSave = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return Object.assign(freshSave(), JSON.parse(raw));
    } catch (e) { /* storage unavailable */ }
    return null;
  };
  G.writeSave = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* ignore */ }
  };
  G.hasSave = function () { const s = G.loadSave(); return !!(s && s.catches > 0); };
  G.newGame = function () { G.save = freshSave(); try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } };
  G.continueGame = function () { G.save = G.loadSave() || freshSave(); };
  G.speciesCount = function () { return Object.keys(G.save.species).filter((id) => !LM.FISH_BY_ID[id].legend).length; };
  G.tier = function (k) { return LM.UPGRADES[k].tiers[G.save.up[k]]; };

  // fish sprites cache
  const fishSprites = {};
  G.fishSprite = function (id) {
    if (!fishSprites[id]) fishSprites[id] = LM.P.makeFish(LM.FISH_BY_ID[id].look);
    return fishSprites[id];
  };

  // ------------------------------------------------------------ helpers
  function setState(s) {
    G.state = s;
    G.stateT = 0;
  }
  G.setState = setState;

  function tutorial(key, text) {
    if (G.tutorial[key]) return;
    G.tutorial[key] = true;
    LM.ui.hint(text, 6);
  }

  function pickFish(zone) {
    const env = LM.env, per = env.period.id, wea = env.weather;
    const up = G.save.up;
    const lure = G.tier('lure');
    if (G.forceFish) { const f = LM.FISH_BY_ID[G.forceFish]; G.forceFish = null; return { fish: f, gated: null }; }
    const legendOk = G.speciesCount() >= LM.LEGEND_NEED && up.lure >= 2 && per === 'night' && zone === 2;
    if (legendOk && !G.save.legendDone && Math.random() < 0.6) return { fish: LM.FISH_BY_ID.lumineria, gated: false };
    let gated = null;
    const cand = [];
    for (const f of LM.FISH) {
      if (f.legend) continue;
      if (!f.periods.includes(per) || !f.weather.includes(wea)) continue;
      let w = f.rarity === 1 ? 10 : f.rarity === 2 ? 4.5 : 1.6;
      if (f.rarity >= 2) w *= lure.rare;
      if (!f.zone.includes(zone)) w *= 0.15;
      if (!G.save.species[f.id]) w *= 1.8;
      if ((f.lure && up.lure + 1 < f.lure) || (f.rod && up.rod + 1 < f.rod)) { gated = f; continue; }
      cand.push([f, w]);
    }
    if (!cand.length) return { fish: LM.FISH_BY_ID.minamobuna, gated };
    let tot = 0;
    for (const c of cand) tot += c[1];
    let r = Math.random() * tot;
    for (const c of cand) { r -= c[1]; if (r <= 0) return { fish: c[0], gated }; }
    return { fish: cand[0][0], gated };
  }
  G.pickFish = pickFish;

  // ------------------------------------------------------------ cast
  let cast = null, wait = null, fight = null, landing = null;

  function startCharge() {
    setState('charge');
    G.power = 0;
    G.powerDir = 1;
    LM.audio.sfx('charge', 0);
  }

  function releaseCast() {
    const p = G.power;
    const zone = p < 0.38 ? 0 : p < 0.72 ? 1 : 2;
    const tx = 226 + p * 196 + (Math.random() - 0.5) * 10;
    const ty = 216 - p * 82 + (Math.random() - 0.5) * 4;
    const tip = LM.World.rodTip(G);
    cast = { sx: tip.tx, sy: tip.ty, tx, ty, p, zone, t: 0, dur: 0.55 + p * 0.35 };
    G.bobber.visible = true;
    G.bobber.onWater = false;
    G.bobber.hidden = false;
    G.bobber.glow = G.save.up.lure >= 2 ? 0.35 : 0;
    setState('cast');
    LM.audio.sfx('cast');
    LM.ui.powerMeter(false);
  }

  function startWait() {
    const lure = G.tier('lure');
    wait = {
      bite: (2.2 + Math.random() * 4.5) * lure.bite,
      nibbles: [],
      biteOn: false,
    };
    const n = Math.floor(Math.random() * 3.2);
    for (let i = 0; i < n; i++) wait.nibbles.push(wait.bite * (0.3 + 0.6 * Math.random()));
    wait.nibbles.sort((a, b) => a - b);
    setState('wait');
    tutorial('wait', 'ウキが大きく沈んだら、すかさず押してアワセる！');
  }

  function reelBack(msg) {
    setState('reelback');
    cast = { sx: G.bobber.x, sy: G.bobber.y, t: 0 };
    if (msg) LM.ui.toast(msg);
    G.bobber.onWater = false;
  }

  // ------------------------------------------------------------ fight
  function startFight(fish) {
    const zone = cast.zone;
    const legend = !!fish.legend;
    fight = {
      fish, D: 52 + zone * 9 + (legend ? 12 : 0), T: 25, act: 'rest', actT: 1.2, upcoming: null,
      snap: 0, air: 0, justT: 0, x: G.bobber.x, y: G.bobber.y, ox: G.bobber.x, oy: G.bobber.y,
      lat: 0, latV: 0, t: 0, warnT: 0, reelTick: 0, jumpCount: 0, splashT: 0, phase: 0,
    };
    fight.D0 = fight.D;
    setState('fight');
    G.bobber.hidden = true;
    LM.audio.sfx('hook');
    LM.World.splash(G.bobber.x, G.bobber.y, 14, 1.2);
    LM.World.ripple(G.bobber.x, G.bobber.y, 18, true);
    G.cam.shake = 0.6;
    LM.ui.fightHud(true, fight);
    tutorial('fight', '押している間リールを巻く。テンションが赤に入ったら離して耐えよう！');
    if (legend) {
      LM.ui.banner('湖の主 ルミナリア', '星を抱く者が目を覚ました');
      LM.audio.sfx('legend');
    }
  }

  function chooseAct(f) {
    const beh = f.fish.beh;
    const items = Object.entries(beh);
    let tot = 0;
    for (const [, w] of items) tot += w;
    let r = Math.random() * tot;
    for (const [k, w] of items) { r -= w; if (r <= 0) return k; }
    return items[0][0];
  }

  function actDuration(f, act) {
    const er = f.fish.erratic ? 0.6 : 1;
    switch (act) {
      case 'rest': return f.fish.rhythm ? f.fish.rhythm : (0.9 + Math.random() * 1.1) * er;
      case 'pull': return f.fish.rhythm ? f.fish.rhythm : (1.1 + Math.random() * 1.0) * er;
      case 'dash': return 0.8 + Math.random() * 0.5;
      case 'dive': return 1.4 + Math.random() * 0.9;
      case 'jump': return 1.05;
      case 'vanish': return 2.6 + Math.random() * 1.2;
    }
    return 1;
  }

  function updateFight(dt) {
    const f = fight, fish = f.fish, inp = G.input;
    const rod = G.tier('rod'), line = G.tier('line');
    f.t += dt;
    f.actT -= dt;
    if (f.actT <= 0) {
      if (f.act === 'tele') {
        f.act = f.upcoming;
        f.actT = actDuration(f, f.act);
        if (f.act === 'jump') { f.air = 0; f.jumpCount++; LM.audio.sfx('jump'); LM.World.splash(f.x, f.y, 16, 1.4); tutorial('jump', '跳ねた！空中では指を離し、着水の瞬間に押すとジャスト！'); }
        if (f.act === 'dash') { f.latV = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 30); }
        if (f.act === 'vanish') { LM.ui.popupWorld('霧に溶けた…', f.x, f.y - 14, 'mist'); }
        if (f.act === 'dive' || f.act === 'pull') { LM.World.splash(f.x, f.y, 10, 1); }
      } else if (f.act !== 'rest') {
        f.act = 'rest';
        f.actT = actDuration(f, 'rest');
      } else {
        f.upcoming = chooseAct(f);
        if (f.upcoming === 'rest') { f.actT = actDuration(f, 'rest'); }
        else {
          f.act = 'tele';
          f.actT = fish.tele;
          LM.audio.sfx('tele');
          LM.ui.popupWorld('！', f.x, f.y - 10, 'tele');
          LM.World.ripple(f.x, f.y, 12, true);
        }
      }
    }
    // force of the fish this instant
    let F = 0;
    switch (f.act) {
      case 'rest': F = 0.12; break;
      case 'tele': F = 0.2; break;
      case 'pull': F = fish.rhythm ? 0.6 + 0.6 * Math.max(0, Math.sin(f.t * Math.PI / fish.rhythm * 2)) : 1.0; break;
      case 'dash': F = 0.6; break;
      case 'dive': F = 1.4; break;
      case 'jump': F = 0; break;
      case 'vanish': F = 0.35 + 0.65 * Math.max(0, Math.sin(f.t * 2.3)) ; break;
    }
    // fish tire as the duel goes on
    F *= fish.power * Math.max(0.55, 1 - f.t / 45);
    f.F = F;
    const airborne = f.act === 'jump' && f.actT > 0.05;
    if (inp.down) {
      const rate = 11 * rod.reel / Math.sqrt(fish.stamina) * (1 - 0.5 * Math.min(1, F));
      f.D -= rate * dt;
      let dT = (6 + F * 95) * line.tension;
      if (airborne) dT = 150 * line.tension;
      f.T += dT * dt;
      f.reelTick -= dt;
      if (f.reelTick <= 0) { LM.audio.sfx('reel'); f.reelTick = 0.07; }
    } else {
      if (!airborne) f.D += F * 7 * dt;
      f.T -= 60 * dt;
      f.T = Math.max(f.T, F * 22);
    }
    // jump: splash-down timing window
    if (f.act === 'jump') {
      f.air += dt;
      if (f.actT <= 0.05 && !f.landed) {
        f.landed = true;
        f.justT = 0.38;
        LM.World.splash(f.x, f.y, 18, 1.3);
        LM.World.ripple(f.x, f.y, 20, true);
        LM.audio.sfx('jump');
        LM.ui.popupWorld('いまだ！', f.x, f.y - 16, 'now');
      }
    } else f.landed = false;
    if (f.justT > 0) {
      f.justT -= dt;
      if (inp.pressed) {
        f.justT = 0;
        f.D -= 11;
        f.T = Math.max(0, f.T - 25);
        LM.audio.sfx('just');
        LM.ui.popupWorld('ジャスト！', f.x, f.y - 18, 'just');
        LM.World.sparkBurst(f.x, f.y - 4, 12, [255, 240, 170]);
        G.cam.shake = 0.3;
      }
    }
    f.T = LM.clamp(f.T, 0, 110);
    if (f.T >= 100) {
      f.snap += dt;
      f.warnT -= dt;
      if (f.warnT <= 0) { LM.audio.sfx('warn'); f.warnT = 0.12; }
      G.cam.shake = Math.max(G.cam.shake, 0.25);
      if (f.snap > line.grace) return endFight('snap');
    } else {
      f.snap = Math.max(0, f.snap - dt * 1.5);
      if (f.T > 82) { f.warnT -= dt; if (f.warnT <= 0) { LM.audio.sfx('warn'); f.warnT = 0.3; } }
    }
    if (f.D >= 100) return endFight('escape');
    if (f.D <= 0) return endFight('win');
    // fish position: comes toward the pier as distance drops
    const k = LM.clamp(f.D / f.D0, 0, 1.4);
    const px = 208, py = 230;
    if (f.act === 'dash') { f.lat += f.latV * dt; f.latV *= Math.pow(0.4, dt); }
    f.lat = LM.damp(f.lat, Math.sin(f.t * 0.7) * 14, f.act === 'dash' ? 0.2 : 1.2, dt);
    const bx = LM.lerp(px, f.ox, k), by = LM.lerp(py, f.oy, k);
    f.x = LM.clamp(bx + f.lat, 200, 470);
    f.y = LM.clamp(by + (f.act === 'dive' ? 3 : 0) + Math.sin(f.t * 1.3) * 1.5, HZ + 10, 262);
    // water disturbance
    f.splashT -= dt;
    if (f.splashT <= 0) {
      LM.World.ripple(f.x + (Math.random() - 0.5) * 6, f.y, 6 + F * 6);
      if (F > 0.5 && f.act !== 'vanish') LM.World.splash(f.x, f.y, 3, 0.6);
      f.splashT = f.act === 'rest' ? 0.5 : 0.18;
    }
    // visuals
    const sp = G.fishSprite(fish.id);
    const vanish = f.act === 'vanish';
    const shadowSize = LM.clamp(fish.size / 10, 3, 14);
    G.fishVis = { shadow: { x: f.x, y: f.y + 1, size: shadowSize, alpha: vanish ? 0.06 : 0.42, dir: f.latV >= 0 ? 1 : -1 } };
    if (f.act === 'jump' && f.actT > 0.05) {
      const jt = 1 - f.actT / 1.05;
      const hgt = Math.sin(jt * Math.PI) * (16 + Math.min(18, fish.size * 0.15));
      G.fishVis.jump = { x: f.x + (jt - 0.5) * 14, y: f.y - hgt - 2, rot: (jt - 0.5) * -1.6, sprite: sp.canvas };
      G.fishVis.shadow.alpha = 0.15;
      if (fish.look.glow) G.fishVis.glowAt = { x: f.x, y: f.y - hgt, r: 16, col: LM.hex(fish.look.glow), a: 0.45 };
    } else if (fish.look.glow && !vanish) {
      G.fishVis.glowAt = { x: f.x, y: f.y, r: 18, col: LM.hex(fish.look.glow), a: 0.35 };
    }
    G.bobber.x = f.x; G.bobber.y = f.y;
    G.line.taut = LM.clamp(0.4 + f.T / 120, 0, 1);
    G.rod.bend = LM.damp(G.rod.bend, LM.clamp(f.T / 100, 0, 1.1) * (airborne ? 0.2 : 1), 10, dt);
    G.rod.angle = LM.damp(G.rod.angle, inp.down ? -1.05 : -0.7, 6, dt);
    G.player.lean = LM.damp(G.player.lean, inp.down ? -1 : 0, 10, dt);
    LM.ui.fightHud(true, f);
    // camera frames angler and fish together, focus pulls to the fish
    G.cam.tz = 1.38;
    G.cam.tcx = LM.clamp(((168 + f.x) / 2) / W, 0.3, 0.7);
    G.cam.tcy = LM.clamp(((190 + f.y) / 2) / H, 0.45, 0.75);
    G.cam.tfocus = LM.lerp(205, f.y, 0.6);
  }

  function endFight(result) {
    const f = fight;
    LM.ui.fightHud(false);
    if (result === 'win') {
      startLanding(f.fish);
      return;
    }
    G.fishVis = null;
    G.bobber.visible = false;
    G.rod.bend = 0;
    G.line.taut = 0;
    if (result === 'snap') {
      LM.audio.sfx('snap');
      LM.ui.toast('糸が切れてしまった… 赤いゲージでは指を離そう');
      G.cam.shake = 0.8;
    } else {
      LM.audio.sfx('escape');
      LM.ui.toast(`${f.fish.legend ? '湖の主' : '魚'}に逃げられた…`);
      LM.World.splash(f.x, f.y, 8, 0.8);
    }
    setState('lost');
  }

  // ------------------------------------------------------------ landing
  function startLanding(fish) {
    const base = fish.size;
    const size = fish.legend ? Math.round(232 + Math.random() * 20) : Math.round(base * (0.72 + Math.random() * 0.6) * 10) / 10;
    landing = { fish, size, t: 0, sx: fight.x, sy: fight.y };
    setState('landing');
    G.timeScale = 0.35;
    G.flash = 0.55;
    LM.audio.sfx('catch');
    LM.World.splash(fight.x, fight.y, 24, 1.6);
    LM.World.ripple(fight.x, fight.y, 24, true);
    G.bobber.visible = false;
    G.line.taut = 0;
  }

  function updateLanding(dt) {
    const l = landing;
    l.t += dt;
    const sp = G.fishSprite(l.fish.id);
    const p = LM.World.charPos(G);
    const ex = p.x + 16, ey = p.y - sp.h / 2 + 2;
    const k = LM.clamp(l.t / 0.9, 0, 1);
    const e = LM.easeInOut(k);
    const x = LM.lerp(l.sx, ex, e), y = LM.lerp(l.sy, ey, e) - Math.sin(k * Math.PI) * 40;
    G.fishVis = { jump: { x, y, rot: (1 - k) * -2.2 * (k < 1 ? 1 : 0), sprite: sp.canvas } };
    if (l.fish.look.glow) G.fishVis.glowAt = { x, y, r: 16, col: LM.hex(l.fish.look.glow), a: 0.4 };
    G.player.pose = k > 0.6 ? 'up' : 'hold';
    G.rod.angle = LM.damp(G.rod.angle, -1.6, 6, dt);
    G.rod.bend = 0;
    G.cam.tz = 1.75;
    G.cam.tcx = (p.x + 10) / W;
    G.cam.tcy = (p.y + 4) / H;
    G.cam.tfocus = 205;
    if (l.t > 0.35) G.timeScale = LM.damp(G.timeScale, 1, 3, dt);
    if (k >= 1 && !l.done) {
      l.done = true;
      G.hideRod = true;
      G.timeScale = 1;
      G.player.hop = 3;
      LM.World.sparkBurst(ex, ey, 26, [255, 236, 170]);
      finishCatch(l.fish, l.size);
    }
  }

  function finishCatch(fish, size) {
    const s = G.save;
    const prev = s.species[fish.id];
    const isNew = !prev;
    const record = !prev || size > prev.best;
    s.species[fish.id] = { count: (prev ? prev.count : 0) + 1, best: Math.max(size, prev ? prev.best : 0) };
    let reward = Math.round(fish.value * (0.75 + 0.25 * size / fish.size));
    if (isNew) reward = Math.round(reward * 1.5);
    s.lumen += reward;
    s.catches++;
    if (!s.biggest || size > s.biggest.size) s.biggest = { id: fish.id, size };
    if (fish.legend) s.legendDone = true;
    G.writeSave();
    if (isNew) LM.audio.sfx('new');
    setState('result');
    const sp = G.fishSprite(fish.id);
    G.fishVis = { held: sp.canvas };
    if (fish.look.glow) G.fishVis.glowAt = null;
    LM.ui.showCatch(fish, size, reward, isNew, record && !isNew, () => {
      G.fishVis = null;
      G.hideRod = false;
      G.player.pose = 'hold';
      if (fish.legend && !G.endingShown) { G.endingShown = true; startEnding(); return; }
      setState('idle');
      // progress hints
      const n = G.speciesCount();
      if (n === LM.LEGEND_NEED && !s.legendDone) LM.ui.banner('湖の主の気配', '夜、遠くへ投げれば何かが応えるかもしれない');
      LM.ui.updateHud();
    });
    LM.ui.updateHud();
  }

  // ------------------------------------------------------------ ending
  function startEnding() {
    setState('ending');
    LM.World.releaseLanterns(40);
    LM.audio.sfx('legend');
    setTimeout(() => LM.ui.showEnding(), 3200);
  }

  // ------------------------------------------------------------ rest
  G.rest = function () {
    if (G.state !== 'idle') return;
    const nextStart = { dawn: 7, day: 17, dusk: 19, night: 5 }[LM.env.period.id];
    setState('resting');
    G.restTarget = nextStart;
    LM.audio.sfx('rest');
  };

  // ------------------------------------------------------------ update
  G.update = function (dt) {
    const inp = G.input;
    G.stateT += dt;
    const env = LM.env;
    const bob = G.bobber;
    // default camera targets
    let tz = 1.0, tcx = 0.5, tcy = 0.5, tfocus = 205;
    switch (G.state) {
      case 'title': {
        tz = 1.1 + Math.sin(G.time * 0.1) * 0.02; tcx = 0.6; tcy = 0.42; tfocus = 170;
        G.rod.angle = -0.75 + Math.sin(G.time * 0.8) * 0.03;
        break;
      }
      case 'idle': {
        G.player.pose = 'hold';
        G.rod.angle = LM.damp(G.rod.angle, -0.78 + Math.sin(G.time * 0.8) * 0.03, 5, dt);
        G.rod.bend = LM.damp(G.rod.bend, 0, 5, dt);
        G.player.lean = LM.damp(G.player.lean, 0, 5, dt);
        tz = 1.08; tcx = 0.52; tcy = 0.58; tfocus = 205;
        if (!G.menuOpen && inp.pressed && G.stateT > 0.2) startCharge();
        tutorial('idle', '長押しで力をためて、離してキャスト。遠くへ投げるほど大物が潜んでいる。');
        break;
      }
      case 'charge': {
        G.power += G.powerDir * dt * 1.05;
        if (G.power >= 1) { G.power = 1; G.powerDir = -1; }
        if (G.power <= 0) { G.power = 0; G.powerDir = 1; }
        G.rod.angle = LM.damp(G.rod.angle, -2.1 - G.power * 0.5, 10, dt);
        G.player.pose = 'up';
        G.player.lean = LM.damp(G.player.lean, -1, 8, dt);
        LM.ui.powerMeter(true, G.power);
        if (Math.floor(G.stateT * 12) !== Math.floor((G.stateT - dt) * 12)) LM.audio.sfx('charge', G.power);
        tz = 1.06; tcx = 0.56; tcy = 0.55; tfocus = 200;
        if (!inp.down) releaseCast();
        break;
      }
      case 'cast': {
        cast.t += dt;
        const k = LM.clamp(cast.t / cast.dur, 0, 1);
        G.player.pose = k < 0.15 ? 'up' : 'hold';
        G.rod.angle = LM.damp(G.rod.angle, -0.35, 14, dt);
        G.player.lean = LM.damp(G.player.lean, 0.5, 10, dt);
        const tip = LM.World.rodTip(G);
        bob.x = LM.lerp(tip.tx, cast.tx, LM.easeOutCubic(k));
        bob.y = LM.lerp(tip.ty, cast.ty, k);
        bob.h = Math.sin(k * Math.PI) * (26 + cast.p * 30) * (1 - k * 0.2);
        G.line.taut = 0.2;
        tz = 1.05; tcx = LM.lerp(0.5, (cast.tx + 160) / 2 / W, k); tcy = 0.55; tfocus = LM.lerp(205, cast.ty, k);
        if (k >= 1) {
          bob.h = 0; bob.onWater = true; bob.x = cast.tx; bob.y = cast.ty;
          LM.audio.sfx('plop');
          LM.World.ripple(bob.x, bob.y, 12, true);
          LM.World.splash(bob.x, bob.y, 6, 0.6);
          startWait();
        }
        break;
      }
      case 'wait': {
        bob.dip = Math.round(Math.sin(G.time * 2.4) * 0.6);
        G.rod.angle = LM.damp(G.rod.angle, -0.55, 4, dt);
        G.player.lean = LM.damp(G.player.lean, 0, 5, dt);
        G.line.taut = 0;
        tz = 1.18; tcx = LM.clamp((bob.x + 175) / 2 / W, 0.35, 0.68); tcy = LM.clamp((bob.y + 185) / 2 / H, 0.4, 0.72); tfocus = bob.y;
        if (wait.nibbles.length && G.stateT > wait.nibbles[0]) {
          wait.nibbles.shift();
          bob.dip = 2;
          LM.World.ripple(bob.x, bob.y, 6);
          LM.audio.sfx('nibble');
        }
        if (G.stateT > wait.bite) {
          const pick = pickFish(cast.zone);
          wait.fish = pick.fish;
          if (pick.gated && Math.random() < 0.3) LM.ui.toast(pick.gated.rod ? '大きな影が通り過ぎた… 今の竿では太刀打ちできない' : '月影のような魚が擬餌を見て去った… もっと良い擬餌が要る');
          setState('bite');
          wait.window = wait.fish.rarity >= 3 ? 0.75 : 0.95;
          LM.audio.sfx('bite');
          LM.World.splash(bob.x, bob.y, 8, 0.8);
          LM.World.ripple(bob.x, bob.y, 14, true);
          LM.ui.popupWorld('！', bob.x, bob.y - 12, 'bite');
          G.cam.shake = 0.25;
          break;
        }
        if (inp.pressed && !G.menuOpen) reelBack('仕掛けを回収した');
        break;
      }
      case 'bite': {
        bob.dip = 4 + Math.round(Math.sin(G.time * 30));
        G.rod.bend = 0.35;
        G.rod.angle = LM.damp(G.rod.angle, -0.5, 6, dt);
        tz = 1.28; tcx = LM.clamp((bob.x + 175) / 2 / W, 0.35, 0.68); tcy = LM.clamp((bob.y + 185) / 2 / H, 0.4, 0.72); tfocus = bob.y;
        if (inp.pressed) { startFight(wait.fish); break; }
        if (G.stateT > wait.window) {
          G.rod.bend = 0;
          reelBack('アタリを逃した…');
        }
        break;
      }
      case 'fight': {
        updateFight(dt);
        tz = G.cam.tz; tcx = G.cam.tcx; tcy = G.cam.tcy; tfocus = G.cam.tfocus;
        break;
      }
      case 'reelback': {
        cast.t += dt;
        const k = LM.clamp(cast.t / 0.45, 0, 1);
        const tip = LM.World.rodTip(G);
        bob.x = LM.lerp(cast.sx, tip.tx, LM.easeInOut(k));
        bob.y = LM.lerp(cast.sy, tip.ty, k);
        bob.h = Math.sin(k * Math.PI) * 10;
        bob.dip = 0;
        G.rod.angle = LM.damp(G.rod.angle, -1.3, 8, dt);
        G.rod.bend = 0;
        if (k >= 1) { bob.visible = false; setState('idle'); }
        break;
      }
      case 'lost': {
        G.rod.angle = LM.damp(G.rod.angle, -0.9, 4, dt);
        G.rod.bend = LM.damp(G.rod.bend, 0, 6, dt);
        G.player.lean = LM.damp(G.player.lean, 0, 5, dt);
        if (G.stateT > 1.3) setState('idle');
        break;
      }
      case 'landing': {
        updateLanding(dt);
        tz = G.cam.tz; tcx = G.cam.tcx; tcy = G.cam.tcy; tfocus = G.cam.tfocus;
        break;
      }
      case 'result': {
        const p = LM.World.charPos(G);
        tz = 1.6; tcx = (p.x + 10) / W; tcy = (p.y + 2) / H; tfocus = 205;
        G.player.pose = 'up';
        break;
      }
      case 'resting': {
        const t = G.stateT;
        G.fade = t < 1 ? t : t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6));
        if (t >= 1 && !G.restDone) {
          G.restDone = true;
          env.advanceTo(G.restTarget + 0.05);
          env.rollWeather();
          LM.ui.toast(`ひと休みした — ${LM.periodOf(env.hour).name}になった`);
        }
        if (t > 2.6) { G.restDone = false; setState('idle'); }
        tz = 1.08; tcx = 0.52; tcy = 0.58;
        break;
      }
      case 'ending': {
        G.legendGlow = LM.damp(G.legendGlow, 1, 0.8, dt);
        tz = 1.0 + Math.min(0.15, G.stateT * 0.01); tcx = 0.62; tcy = 0.4; tfocus = 140;
        G.player.pose = 'up';
        break;
      }
    }
    if (G.state !== 'ending' && G.state !== 'title') G.legendGlow = LM.damp(G.legendGlow, 0, 1, dt);
    if (G.state !== 'resting') G.fade = LM.damp(G.fade, 0, G.state === 'title' ? 0.8 : 2.5, dt);
    // camera smoothing + shake
    const cam = G.cam;
    cam.zoom = LM.damp(cam.zoom, tz, 2.4, dt);
    cam.cx = LM.damp(cam.cx, tcx, 2.2, dt);
    cam.cy = LM.damp(cam.cy, tcy, 2.2, dt);
    cam.focus = LM.damp(cam.focus, tfocus, 3, dt);
    cam.shake = Math.max(0, cam.shake - dt * 1.8);
    G.flash = Math.max(0, G.flash - dt * 1.4);
    G.player.hop = Math.max(0, G.player.hop - dt * 10);
    if (G.player.hop > 0 && G.player.hop < 0.2) G.player.hop = 0;
    if (G.save && G.state !== 'title') G.save.playTime += dt;
    G.bucketGlint = Math.sin(G.time * 1.5) > 0.95;
  };

  // shared by UI to map world → screen percentage (mid layer)
  G.worldToScreen = function (x, y) {
    const cam = G.cam;
    const u = x / W, v = y / H;
    return { x: cam.cx + (u - cam.cx) * cam.zoom, y: cam.cy + (v - cam.cy) * cam.zoom };
  };

  // ------------------------------------------------------------ title
  G.startGame = function (cont) {
    if (cont) G.continueGame(); else G.newGame();
    LM.audio.init();
    LM.audio.sfx('open');
    LM.env.hour = 14.5;
    G.fade = 1;
    setState('idle');
    G.stateT = -0.4;
    LM.ui.enterGame();
    LM.ui.banner('灯湖ルミナ', cont ? 'おかえりなさい' : '星が還る湖へ、ようこそ');
  };
})(window.LM);
