/* Lumina Mere — the lake
 * Builds and animates the scene into four low-resolution layers:
 *   back : sky, mountains, far shore, the crystal spire island and the lake
 *   mid  : the bank, lantern tree, pier, the angler, rod & line, reeds
 *   fg   : out-of-focus foliage close to the camera
 *   glow : emissive light (lanterns, fireflies, crystal, sparkles) at half res
 */
'use strict';

(function (LM) {
  const W = LM.W, H = LM.H, HZ = LM.HORIZON;
  const P = LM.P;
  const css = LM.css, mix = LM.mix, hex = LM.hex;

  const World = {};
  const L = {}; // layers
  let scratch;

  // particles & dynamic things
  const ripples = [], splashes = [], fireflies = [], petals = [], drops = [], birds = [], shadows = [], sparks = [], lanterns = [];
  let stars = [], shimmer = [], clouds = [];
  let masks = {};
  let tree = null, char = null, reedsBack = [], reedsFront = [], lilies = [];
  let moonSprite, wakeT = 0;

  // ------------------------------------------------------------------ build
  function maskFromFn(w, h, fn) {
    const s = LM.makeCanvas(w, h);
    const img = s.ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (fn(x, y)) { const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = 255; }
    }
    s.ctx.putImageData(img, 0, 0);
    return s.c;
  }

  function buildMountains() {
    const n1 = LM.noise1(7), n2 = LM.noise1(19), n3 = LM.noise1(31), n4 = LM.noise1(43);
    const ridge = (n, x) => 1 - Math.abs(n(x) * 2 - 1);
    const far = [], midM = [], hills = [];
    for (let x = 0; x < W; x++) {
      // a tall central massif framed by lower ranges
      const env = 0.55 + 0.45 * Math.exp(-Math.pow((x - 250) / 120, 2));
      far[x] = HZ - 10 - (ridge(n1, x / 46) * 0.6 + ridge(n2, x / 17) * 0.25 + n4(x / 6) * 0.06) * 62 * env;
      midM[x] = HZ - 4 - (ridge(n2, x / 30 + 9) * 0.55 + n3(x / 11) * 0.3 + n4(x / 4) * 0.05) * 34 * (0.6 + 0.4 * Math.exp(-Math.pow((x - 140) / 140, 2)));
      hills[x] = HZ - 1 - (n3(x / 24 + 3) * 0.7 + n4(x / 7) * 0.3) * 14;
    }
    // cast-shadow shading: a pixel is lit unless terrain to its right blocks
    // a light ray travelling up-right (sun low over the western ridge)
    const litFn = (arr, slope, reach) => (x, y) => {
      if (y < arr[x]) return false;
      for (let k = 1; k < reach; k++) {
        const xx = x + k;
        if (xx >= W) break;
        if (arr[xx] < y - k * slope) return false;
      }
      return (y - arr[x]) < reach * 0.6 + P.bayer(x, y) * 6;
    };
    masks.farBase = maskFromFn(W, HZ, (x, y) => y >= far[x]);
    masks.farLit = maskFromFn(W, HZ, litFn(far, 0.75, 40));
    masks.farSnow = maskFromFn(W, HZ, (x, y) => y >= far[x] && y < HZ - 50 + Math.sin(x * 0.7) * 2 + P.bayer(x, y) * 4 && (y - far[x]) < 10 + P.bayer(x + 1, y) * 6);
    masks.midBase = maskFromFn(W, HZ, (x, y) => y >= midM[x]);
    masks.midLit = maskFromFn(W, HZ, litFn(midM, 0.8, 26));
    masks.hillBase = maskFromFn(W, HZ + 2, (x, y) => y >= hills[x]);
    // conifer forest line along the far shore
    const R = LM.rng(5);
    const trees = [];
    for (let x = -4; x < W + 4; x += R.int(2, 4)) trees.push({ x, h: R.int(4, 10) * (x > 300 && x < 380 ? 0.4 : 1) });
    const inTree = (x, y) => {
      for (const t of trees) {
        const top = HZ + 1 - t.h;
        if (y < top || y > HZ + 1) continue;
        const half = ((y - top) / t.h) * 2.6;
        if (Math.abs(x - t.x) <= half) return true;
      }
      return false;
    };
    masks.forest = maskFromFn(W, HZ + 3, (x, y) => inTree(x, y) || y >= HZ);
    masks.forestLit = maskFromFn(W, HZ + 3, (x, y) => inTree(x, y) && !inTree(x - 1, y) === false && !inTree(x + 1, y));
    buildIsland();
  }

  function buildIsland() {
    // crystal spire on a small rocky island, right of centre
    const cx = 344;
    masks.islandBase = maskFromFn(W, HZ + 3, (x, y) => {
      const rock = y > HZ - 6 && Math.abs(x - cx) < 26 - (HZ - y) * 2.2 + Math.sin(x * 0.9) * 1.2;
      // spire: tapering shaft with a broken arch ring
      const sy = HZ - 6 - y; // height above island
      const sw = sy < 0 ? 0 : sy < 44 ? 3.6 - sy * 0.045 : sy < 56 ? 1.6 : 0;
      const shaft = sy >= 0 && sy < 56 && Math.abs(x - cx) <= sw;
      const ring = sy > 26 && sy < 30 && Math.abs(x - cx) < 8 && Math.abs(x - cx) > 1;
      const ringPosts = (Math.abs(x - (cx - 7)) < 1 || Math.abs(x - (cx + 7)) < 1) && sy > 18 && sy < 30;
      const ruin = (x > cx - 16 && x < cx - 11 && sy >= 0 && sy < 9 - (x - cx + 16)) || (x > cx + 10 && x < cx + 13 && sy >= 0 && sy < 6);
      const treeL = y > HZ - 12 && Math.abs(x - (cx - 20)) < (y - (HZ - 12)) * 0.5;
      const treeR = y > HZ - 9 && Math.abs(x - (cx + 19)) < (y - (HZ - 9)) * 0.55;
      return rock || shaft || ring || ringPosts || ruin || treeL || treeR;
    });
    masks.islandLit = maskFromFn(W, HZ + 3, (x, y) => {
      const sy = HZ - 6 - y;
      const sw = sy < 44 ? 3.6 - sy * 0.045 : 1.6;
      return (sy >= 0 && sy < 56 && x - cx > sw - 1.5 && x - cx <= sw) || (y > HZ - 6 && y < HZ - 3 && x > cx && x < cx + 18 - (HZ - y));
    });
    World.crystal = { x: cx, y: HZ - 66 };
  }

  function buildTree() {
    const R = LM.rng(77);
    const pals = [
      ['#10222a', '#18343a', '#244a48', '#336650'],
      ['#18343a', '#244c4a', '#357058', '#5a9a66'],
      ['#244a48', '#357058', '#5a9a66', '#9cd084'],
    ];
    const bloom = [
      ['#2a2246', '#46386e', '#6c5596', '#9c7cc0'],
      ['#3a2d58', '#5e4888', '#9474bc', '#d6b4ec'],
    ];
    const clusters = [];
    const N = 70;
    for (let i = 0; i < N; i++) {
      // canopy mass: wide ellipse leaning right, denser at the top
      const a = R() * Math.PI * 2, d = Math.sqrt(R());
      const x = 66 + Math.cos(a) * d * 84, y = 40 + Math.sin(a) * d * 44 - (1 - d) * 6;
      if (x < -16) continue;
      const hgt = LM.clamp((80 - y) / 110, 0, 1); // 1 at top
      const z = R();
      const tone = LM.clamp(Math.round(hgt * 1.6 + z * 0.9 - 0.3), 0, 2);
      const isBloom = R() < 0.3;
      const pal = isBloom ? bloom[tone > 0 ? 1 : 0] : pals[tone];
      const r = Math.round(R.range(6, 12) * (1 - z * 0.25));
      clusters.push({
        x, y, r, z: z + hgt * 0.5,
        spr: P.blob(r, pal, R.int(1, 99999), { specks: isBloom ? ['#f6dcff', '#ffffff'] : tone === 2 ? ['#c4ec9a', '#e6f8b0'] : ['#5a9a66'] }),
        ph: x * 0.05 + R() * 0.8, sway: 0.4 + (1 - hgt) * 0.6,
      });
    }
    clusters.sort((a, b) => a.z - b.z);
    // silhouette that fills gaps between clusters so the canopy reads as one mass
    const sil = [];
    for (const c of clusters) sil.push({ x: c.x, y: c.y, r: c.r * 0.92 });
    // hanging blossom strands (wisteria-like)
    const strands = [];
    for (let i = 0; i < 16; i++) {
      const c = clusters[R.int(0, clusters.length - 1)];
      if (c.y < 40) { i--; continue; }
      strands.push({ c, dx: R.range(-c.r * 0.6, c.r * 0.6), len: R.int(8, 22), ph: R() * 6.28 });
    }
    const fruits = [];
    for (let i = 0; i < 10; i++) {
      const c = clusters[R.int(Math.floor(clusters.length * 0.2), clusters.length - 1)];
      fruits.push({ c, dx: R.range(-c.r * 0.5, c.r * 0.5), len: R.int(3, 8), ph: R() * 6.28 });
    }
    tree = { clusters, fruits, strands, sil, baseX: 34, baseY: 188 };
  }

  function buildMisc() {
    const R = LM.rng(3);
    for (let i = 0; i < 170; i++) stars.push({ x: R.int(0, W - 1), y: R.int(0, HZ - 20), b: R(), tw: R.range(0.5, 3), ph: R() * 6.28, big: R() < 0.06 });
    for (let i = 0; i < 120; i++) {
      const y = R.int(HZ + 2, H - 1);
      shimmer.push({ x: R.range(0, W), y, len: R.int(2, 3 + Math.floor((y - HZ) / 22)), ph: R() * 6.28, sp: R.range(0.8, 1.6) });
    }
    for (let i = 0; i < 7; i++) {
      const w = R.int(40, 90), h = R.int(14, 22);
      const lv = P.cloud(w, h, R.int(1, 9999));
      // split into 4 level masks
      const levels = [];
      for (let l = 0; l < 4; l++) {
        const s = LM.makeCanvas(w, h);
        const src = lv.getContext('2d').getImageData(0, 0, w, h);
        const out = s.ctx.createImageData(w, h);
        for (let p = 0; p < w * h; p++) if (src.data[p * 4 + 3] && Math.round(src.data[p * 4] / 85) === l) { out.data[p * 4] = out.data[p * 4 + 1] = out.data[p * 4 + 2] = out.data[p * 4 + 3] = 255; }
        s.ctx.putImageData(out, 0, 0);
        levels.push(s.c);
      }
      clouds.push({ x: R.range(-40, W), y: R.int(8, HZ - 40), w, h, levels, sp: R.range(1.2, 3.2) });
    }
    moonSprite = P.fromMap([
      '...wwww...',
      '..wwwwgw..',
      '.wwgwwwww.',
      'wwwwwwgwww',
      'wgwwwwwwww',
      'wwwwwgwwww',
      'wwwgwwwwgw',
      '.wwwwwwww.',
      '..wwgwww..',
      '...wwww...',
    ], { w: '#f4f1e2', g: '#c8c6d8' });
    // reeds (right side) & lilies (left shallows)
    for (let i = 0; i < 26; i++) reedsBack.push({ x: R.range(404, 482), y: R.range(206, 236), h: R.int(16, 34), ph: R() * 6.28, cat: R() < 0.5 });
    for (let i = 0; i < 14; i++) reedsFront.push({ x: R.range(430, 486), y: R.range(244, 274), h: R.int(30, 56), ph: R() * 6.28, cat: R() < 0.4 });
    reedsBack.sort((a, b) => a.y - b.y);
    for (const [x, y, s] of [[108, 236, 4], [122, 246, 5], [100, 254, 6], [206, 232, 4], [226, 241, 5], [214, 258, 6], [250, 252, 5], [140, 262, 6], [380, 236, 4], [392, 250, 5]]) {
      lilies.push({ x, y, s, flower: R() < 0.6, ph: R() * 6.28 });
    }
    for (let i = 0; i < 26; i++) fireflies.push({ x: R.range(0, W), y: R.range(120, 250), ph: R() * 6.28, sp: R.range(0.3, 0.9), hx: R.range(-1, 1), hy: R.range(-1, 1) });
    for (let i = 0; i < 18; i++) petals.push({ x: R.range(0, W), y: R.range(-20, H), vx: R.range(4, 12), vy: R.range(5, 12), ph: R() * 6.28, fg: R() < 0.25 });
    for (let i = 0; i < 4; i++) shadows.push({ x: R.range(180, 460), y: R.range(150, 250), dir: R() < 0.5 ? -1 : 1, sp: R.range(3, 8), size: R.range(4, 9), t: R() * 10 });
  }

  World.init = function () {
    L.back = LM.makeCanvas(W, H);
    L.sky = LM.makeCanvas(W, H);
    L.mid = LM.makeCanvas(W, H);
    L.fg = LM.makeCanvas(W, H);
    L.glow = LM.makeCanvas(W / 2, H / 2);
    scratch = LM.makeCanvas(W, H);
    char = P.makeCharacter();
    buildMountains();
    buildTree();
    buildMisc();
    World.layers = { back: L.back.c, mid: L.mid.c, fg: L.fg.c, glow: L.glow.c };
    World.char = char;
  };

  // draw a white mask recoloured with a flat colour
  function tinted(ctx, mask, col, x, y, alpha) {
    const s = scratch;
    s.ctx.globalCompositeOperation = 'source-over';
    s.ctx.clearRect(0, 0, mask.width, mask.height);
    s.ctx.drawImage(mask, 0, 0);
    s.ctx.globalCompositeOperation = 'source-in';
    s.ctx.fillStyle = col;
    s.ctx.fillRect(0, 0, mask.width, mask.height);
    s.ctx.globalCompositeOperation = 'source-over';
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(s.c, 0, 0, mask.width, mask.height, Math.round(x || 0), Math.round(y || 0), mask.width, mask.height);
    ctx.globalAlpha = 1;
  }

  // glow helper (drawn at half resolution)
  function glow(x, y, r, col, a) {
    const g = L.glow.ctx;
    const gx = x / 2, gy = y / 2, gr = Math.max(0.5, r / 2);
    const grad = g.createRadialGradient(gx, gy, 0, gx, gy, gr);
    grad.addColorStop(0, css(col, a));
    grad.addColorStop(0.35, css(col, a * 0.45));
    grad.addColorStop(1, css(col, 0));
    g.fillStyle = grad;
    g.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
  }
  World.glow = glow;

  // ------------------------------------------------------------- effects api
  World.ripple = function (x, y, size, strong) {
    ripples.push({ x, y, r: 0.5, max: size || 10, life: 0, strong: !!strong });
  };
  World.splash = function (x, y, n, power, col) {
    for (let i = 0; i < (n || 8); i++) {
      splashes.push({ x, y, vx: (Math.random() - 0.5) * 40 * (power || 1), vy: -Math.random() * 60 * (power || 1) - 20, life: 0, max: 0.5 + Math.random() * 0.5, y0: y, col: col || null });
    }
  };
  World.sparkBurst = function (x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 60;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0, max: 0.6 + Math.random() * 0.8, col: col || [255, 240, 180] });
    }
  };
  World.releaseLanterns = function (n) {
    for (let i = 0; i < n; i++) lanterns.push({ x: 60 + Math.random() * 400, y: 230 + Math.random() * 40, vy: -(6 + Math.random() * 8), ph: Math.random() * 6.28, life: 0 });
  };

  // ------------------------------------------------------------------ update
  World.update = function (dt, G) {
    const t = G.time;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.life += dt;
      r.r += dt * (r.strong ? 16 : 10);
      if (r.r > r.max) ripples.splice(i, 1);
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.life += dt; s.vy += 200 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > s.y0 + 2 || s.life > s.max) { if (Math.random() < 0.3) World.ripple(s.x, s.y0, 3); splashes.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life += dt; s.vx *= 0.96; s.vy = s.vy * 0.96 + 10 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life > s.max) sparks.splice(i, 1);
    }
    for (const l of lanterns) { l.life += dt; l.y += l.vy * dt; l.x += Math.sin(t * 0.5 + l.ph) * 3 * dt; }
    for (let i = lanterns.length - 1; i >= 0; i--) if (lanterns[i].y < -20) lanterns.splice(i, 1);
    const wind = World.wind = 0.6 + 0.4 * Math.sin(t * 0.23) + LM.env.rain * 0.8;
    for (const f of fireflies) {
      f.ph += dt * f.sp;
      f.x += (Math.sin(f.ph * 1.3) * 6 + f.hx * 2) * dt;
      f.y += (Math.cos(f.ph * 0.9) * 4 + f.hy) * dt;
      if (f.x < -5) f.x = W + 5; if (f.x > W + 5) f.x = -5;
      if (f.y < 110) f.hy = Math.abs(f.hy); if (f.y > 262) f.hy = -Math.abs(f.hy);
    }
    for (const p of petals) {
      p.ph += dt;
      p.x += (p.vx * wind + Math.sin(p.ph * 2) * 6) * dt;
      p.y += (p.vy + Math.cos(p.ph * 3) * 4) * dt;
      if (p.x > W + 10 || p.y > H + 10) { p.x = Math.random() * 160 - 20; p.y = -10 - Math.random() * 30; }
    }
    // rain
    const rainN = Math.floor(LM.env.rain * 140);
    while (drops.length < rainN) drops.push({ x: Math.random() * (W + 60) - 30, y: Math.random() * -H, sp: 260 + Math.random() * 120, z: Math.random(), y1: HZ + 4 + Math.random() * (H - HZ) });
    if (drops.length > rainN) drops.length = rainN;
    for (const d of drops) {
      d.y += d.sp * dt; d.x -= d.sp * 0.18 * dt;
      if (d.y > d.y1) {
        if (Math.random() < 0.5) World.ripple(d.x, d.y1, 2 + Math.random() * 3);
        d.y = -10 - Math.random() * 40; d.x = Math.random() * (W + 60) - 10; d.y1 = HZ + 4 + Math.random() * (H - HZ);
      }
    }
    // ambient birds by day
    if (LM.env.c.night < 0.3 && LM.env.rain < 0.3 && Math.random() < dt * 0.06 && birds.length < 3) {
      const n = 2 + Math.floor(Math.random() * 3), y = 30 + Math.random() * 40;
      for (let i = 0; i < n; i++) birds.push({ x: -10 - i * 8, y: y + (i % 2) * 4 + i * 2, sp: 22 + Math.random() * 4, ph: Math.random() * 6 });
    }
    for (let i = birds.length - 1; i >= 0; i--) { birds[i].x += birds[i].sp * dt; birds[i].ph += dt * 9; if (birds[i].x > W + 20) birds.splice(i, 1); }
    // ambient fish shadows & surface rises
    for (const s of shadows) {
      s.t += dt;
      s.x += s.dir * s.sp * dt * (0.5 + 0.5 * Math.sin(s.t * 0.8));
      s.y += Math.sin(s.t * 0.5) * 2 * dt;
      if (s.x < 150 || s.x > 470) s.dir *= -1;
      if (Math.random() < dt * 0.05) World.ripple(s.x + s.dir * s.size, s.y, 6);
    }
    for (const c of clouds) {
      c.x += c.sp * dt * (0.5 + wind * 0.5);
      if (c.x > W + 10) { c.x = -c.w - 10; c.y = 8 + Math.random() * (HZ - 50); }
    }
  };

  // ------------------------------------------------------------------ render
  World.render = function (G) {
    const env = LM.env, c = env.c, t = G.time;
    renderMid(G, env, c, t);
    renderSky(G, env, c, t);
    renderBack(G, env, c, t);
    renderFg(G, env, c, t);
    renderGlow(G, env, c, t);
  };

  function renderSky(G, env, c, t) {
    const ctx = L.sky.ctx;
    ctx.clearRect(0, 0, W, H);
    // banded gradient sky
    for (let y = 0; y < HZ + 2; y++) {
      const k = y / HZ;
      const col = k < 0.55 ? mix(c.top, c.mid, k / 0.55) : mix(c.mid, c.hor, (k - 0.55) / 0.45);
      ctx.fillStyle = css(LM.q(col, 3));
      ctx.fillRect(0, y, W, 1);
      // dither row between bands for a pixel-art gradient
      if (y % 2 === 0 && y > 0) {
        const nxt = LM.q(k < 0.55 ? mix(c.top, c.mid, (k + 0.02) / 0.55) : mix(c.mid, c.hor, (k + 0.02 - 0.55) / 0.45), 3);
        ctx.fillStyle = css(nxt);
        for (let x = (y / 2) % 2; x < W; x += 4) ctx.fillRect(x, y, 1, 1);
      }
    }
    // milky way + stars
    if (c.star > 0.02) {
      for (const s of stars) {
        const tw = 0.6 + 0.4 * Math.sin(t * s.tw + s.ph);
        const a = c.star * s.b * tw;
        if (a < 0.05) continue;
        ctx.fillStyle = `rgba(255,250,235,${Math.min(1, a * 1.3)})`;
        ctx.fillRect(s.x, s.y, 1, 1);
        if (s.big && a > 0.4) {
          ctx.fillStyle = `rgba(200,220,255,${a * 0.5})`;
          ctx.fillRect(s.x - 1, s.y, 1, 1); ctx.fillRect(s.x + 1, s.y, 1, 1); ctx.fillRect(s.x, s.y - 1, 1, 1); ctx.fillRect(s.x, s.y + 1, 1, 1);
        }
      }
      // diagonal band of faint dust
      ctx.fillStyle = `rgba(190,200,255,${c.star * 0.06})`;
      for (let x = 0; x < W; x += 1) {
        const yc = 10 + x * 0.12, wv = 10 + Math.sin(x * 0.05) * 6;
        for (let y = yc - wv; y < yc + wv; y += 1) if (P.bayer(x, Math.floor(y)) < 0.2 + 0.25 * Math.sin(x * 0.11 + y * 0.07)) ctx.fillRect(x, Math.floor(y), 1, 1);
      }
      // occasional shooting star
      const sp = (t * 0.11) % 1;
      if (c.star > 0.5 && sp < 0.06) {
        const k = sp / 0.06;
        const sx = 380 - k * 140, sy = 14 + k * 40;
        for (let i = 0; i < 10; i++) { ctx.fillStyle = `rgba(255,255,240,${(1 - i / 10) * c.star * (1 - k)})`; ctx.fillRect(Math.round(sx + i * 2.2), Math.round(sy - i * 0.6), 1, 1); }
      }
    }
    // sun & moon
    const sun = c.sun, moon = c.moon;
    if (sun.vis && sun.y < HZ + 4) {
      const sc = mix(hex('#fff6d8'), c.glow, 0.4);
      P.disc(ctx, sun.x, sun.y, 6, css(mix(sc, c.hor, 0.3)));
      P.disc(ctx, sun.x, sun.y, 5, css(sc));
    }
    if (moon.vis && moon.y < HZ + 4) {
      ctx.globalAlpha = LM.clamp(c.night * 1.4, 0.15, 1);
      ctx.drawImage(moonSprite, Math.round(moon.x - 5), Math.round(moon.y - 5));
      ctx.globalAlpha = 1;
    }
    // clouds, recoloured by light level
    const cl = [mix(c.top, c.mid, 0.5), mix(c.mid, c.hor, 0.4), mix(c.hor, [255, 255, 255], 0.25 * (1 - c.night)), mix(mix(c.glow, [255, 255, 255], 0.6), c.mid, c.night * 0.6)];
    const cAlpha = 0.55 + env.cloud * 0.45;
    for (const cd of clouds) {
      for (let l = 0; l < 4; l++) tinted(ctx, cd.levels[l], css(LM.q(mix(cl[l], [120, 128, 140], env.rain * 0.5), 4)), cd.x, cd.y, cAlpha);
    }
    // birds
    ctx.fillStyle = css(mix(c.mn, [20, 20, 30], 0.5));
    for (const b of birds) {
      const up = Math.sin(b.ph) > 0;
      const x = Math.round(b.x), y = Math.round(b.y);
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(x - 1, y + (up ? -1 : 0), 1, 1); ctx.fillRect(x + 1, y + (up ? -1 : 0), 1, 1);
      ctx.fillRect(x - 2, y + (up ? -1 : 1), 1, 1); ctx.fillRect(x + 2, y + (up ? -1 : 1), 1, 1);
    }
    // mountains — far range with snow
    const farCol = LM.q(mix(c.mf, c.hor, 0.32), 4);
    tinted(ctx, masks.farBase, css(farCol));
    tinted(ctx, masks.farLit, css(LM.q(mix(farCol, c.glow, 0.28), 4)));
    tinted(ctx, masks.farSnow, css(LM.q(mix(mix([240, 244, 255], c.hor, 0.3), farCol, 0.2 + c.night * 0.55), 4)));
    const midCol = LM.q(mix(c.mn, c.hor, 0.18), 4);
    tinted(ctx, masks.midBase, css(midCol));
    tinted(ctx, masks.midLit, css(LM.q(mix(midCol, c.glow, 0.22), 4)));
    tinted(ctx, masks.hillBase, css(LM.q(mix(c.fo, c.mn, 0.45), 4)));
    // island & crystal spire
    tinted(ctx, masks.islandBase, css(LM.q(mix(c.fo, c.mn, 0.25), 4)));
    tinted(ctx, masks.islandLit, css(LM.q(mix(c.mn, c.glow, 0.35), 4)));
    const cr = World.crystal;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
    const crystalCol = mix(hex('#8ff0ff'), hex('#ffffff'), pulse * 0.4 + (G.legendGlow || 0) * 0.5);
    ctx.fillStyle = css(crystalCol);
    ctx.fillRect(cr.x - 1, cr.y - 3, 3, 6); ctx.fillRect(cr.x, cr.y - 5, 1, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cr.x, cr.y - 2, 1, 2);
    // far shore forest
    tinted(ctx, masks.forest, css(LM.q(c.fo, 4)));
    tinted(ctx, masks.forestLit, css(LM.q(mix(c.fo, c.glow, 0.25), 4)));
  }

  function renderBack(G, env, c, t) {
    const ctx = L.back.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(L.sky.c, 0, 0, W, HZ + 1, 0, 0, W, HZ + 1);
    // lake: mirrored reflection with rolling waves
    const rain = env.rain;
    for (let y = HZ + 1; y < H; y++) {
      const d = (y - HZ) / (H - HZ);
      const amp = 0.4 + d * 2.6 + rain * 1.2;
      const off = Math.round(Math.sin(y * 0.62 + t * 1.7 + Math.sin(y * 0.11 + t * 0.6) * 2.2) * amp);
      const ry = Math.max(0, Math.round(HZ - (y - HZ) * 1.15));
      ctx.drawImage(L.sky.c, 0, ry, W, 1, off, y, W, 1);
      if (off > 0) ctx.drawImage(L.sky.c, 0, ry, 1, 1, 0, y, off, 1);
    }
    // water body tint: more reflective near the horizon (fresnel), deeper near camera
    for (let y = HZ + 1; y < H; y++) {
      const d = (y - HZ) / (H - HZ);
      const a = 0.18 + Math.pow(d, 0.8) * 0.55 + rain * 0.12;
      ctx.fillStyle = css(LM.q(mix(c.wat, c.top, 0.15 * (1 - d)), 3), a);
      ctx.fillRect(0, y, W, 1);
    }
    // shoreline foam line under the far shore
    ctx.fillStyle = css(mix(c.hor, [255, 255, 255], 0.3), 0.35);
    for (let x = 0; x < W; x += 1) if ((x + Math.floor(t * 4)) % 7 < 4) ctx.fillRect(x, HZ + 1, 1, 1);
    // sun / moon glitter path
    const src = c.sun.vis && c.sunny > 0.05 ? c.sun : c.moon.vis && c.night > 0.3 ? c.moon : null;
    if (src) {
      const isSun = src === c.sun;
      const col = isSun ? mix(c.glow, [255, 255, 255], 0.5) : [230, 236, 255];
      const strength = isSun ? c.sunny : c.night * (1 - env.fog * 0.6) * (1 - rain * 0.7);
      const tick = Math.floor(t * 6);
      for (let y = HZ + 2; y < H; y += 1) {
        const d = (y - HZ) / (H - HZ);
        const spread = 3 + d * 34;
        const n = 1 + Math.floor(d * 3);
        for (let i = 0; i < n; i++) {
          const h = Math.sin(y * 91.3 + i * 17.7 + tick * 3.1) * 43758.5;
          const r = h - Math.floor(h);
          if (r > 0.55) continue;
          const x = src.x + (r * 2 - 0.55) * spread * 1.8;
          const len = 1 + Math.floor(r * 3 + d * 3);
          ctx.fillStyle = css(col, strength * (0.5 + r));
          ctx.fillRect(Math.round(x), y, len, 1);
        }
      }
    }
    // shimmering wave highlights
    const hiCol = mix(c.hor, [255, 255, 255], 0.35);
    for (const s of shimmer) {
      const a = Math.sin(t * s.sp + s.ph);
      if (a < 0.2) continue;
      const x = Math.round((s.x + t * 2.5 * s.sp) % (W + 10)) - 5;
      ctx.fillStyle = css(hiCol, a * 0.35 * (1 - env.fog * 0.5));
      ctx.fillRect(x, s.y, s.len, 1);
    }
    // fish shadows (ambient)
    for (const s of shadows) drawShadow(ctx, s.x, s.y, s.size, 0.22, s.dir);
    if (G.fishVis && G.fishVis.shadow) {
      const fs = G.fishVis.shadow;
      drawShadow(ctx, fs.x, fs.y, fs.size, fs.alpha, fs.dir || 1);
    }
    // lily pads
    for (const l of lilies) {
      const bob = Math.round(Math.sin(t * 1.2 + l.ph) * 0.6);
      const x = Math.round(l.x), y = Math.round(l.y + bob);
      ctx.fillStyle = '#1f4a3a';
      ctx.fillRect(x - l.s, y, l.s * 2 + 1, 2);
      ctx.fillRect(x - l.s + 1, y - 1, l.s * 2 - 1, 1);
      ctx.fillRect(x - l.s + 1, y + 2, l.s * 2 - 1, 1);
      ctx.fillStyle = '#3f7a52';
      ctx.fillRect(x - l.s + 1, y, l.s * 2 - 2, 1);
      ctx.fillStyle = '#6aa868';
      ctx.fillRect(x - l.s + 2, y - 1, l.s, 1);
      ctx.fillStyle = css(c.wat);
      ctx.fillRect(x + 1, y, 1, 2); // notch
      if (l.flower) {
        ctx.fillStyle = '#f2b6d8'; ctx.fillRect(x - 1, y - 2, 3, 2);
        ctx.fillStyle = '#ffe6f4'; ctx.fillRect(x, y - 3, 1, 2);
        ctx.fillStyle = '#ffd86a'; ctx.fillRect(x, y - 1, 1, 1);
      }
    }
    // reflection of the pier, angler & tree from the mid layer
    reflectMid(ctx, t, env);
    // ripples
    for (const r of ripples) {
      const k = r.r / r.max;
      const a = (1 - k) * (r.strong ? 0.9 : 0.55);
      P.ellipse(ctx, r.x, r.y, r.r, Math.max(0.6, r.r * 0.32), css(mix(c.hor, [255, 255, 255], 0.55), a));
    }
    // wake trail behind the bobber
    if (G.bobber && G.bobber.visible && G.bobber.onWater) {
      ctx.fillStyle = css([255, 255, 255], 0.25);
      const bx = Math.round(G.bobber.x), by = Math.round(G.bobber.y);
      ctx.fillRect(bx - 3, by + 1, 7, 1);
    }
  }

  function drawShadow(ctx, x, y, size, alpha, dir) {
    const len = Math.round(size * 2.2), ht = Math.max(1, Math.round(size * 0.45));
    ctx.fillStyle = `rgba(6,10,26,${alpha})`;
    for (let i = -len; i <= len; i++) {
      const k = 1 - Math.pow(Math.abs(i) / len, 2);
      const h = Math.max(0, Math.round(ht * Math.sqrt(k)));
      ctx.fillRect(Math.round(x + i), Math.round(y - h), 1, h * 2 + 1);
    }
    // tail
    ctx.fillRect(Math.round(x - dir * (len + 2)), Math.round(y - ht), 2, ht * 2 + 1);
  }

  // mirror the bottom of the mid layer (pier & angler) into the water
  function reflectMid(ctx, t, env) {
    const wl = 226; // waterline at the pier posts
    ctx.globalAlpha = 0.38 - env.rain * 0.12;
    for (let y = wl; y < H; y++) {
      const sy = 2 * wl - y - 18; // pier deck sits above posts
      if (sy < 140) break;
      const off = Math.round(Math.sin(y * 0.7 + t * 2.1) * (1 + (y - wl) * 0.05));
      ctx.drawImage(L.mid.c, 60, sy, 160, 1, 60 + off, y, 160, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- mid layer
  function renderMid(G, env, c, t) {
    const ctx = L.mid.ctx;
    ctx.clearRect(0, 0, W, H);
    const wind = World.wind || 1;
    drawPier(ctx, t, G);
    drawCharacter(ctx, G, t);
    drawRodAndLine(ctx, G, t);
    // fish leaping / held
    if (G.fishVis) {
      const fv = G.fishVis;
      if (fv.jump) {
        const s = fv.jump;
        ctx.save();
        ctx.translate(Math.round(s.x), Math.round(s.y));
        ctx.rotate(s.rot || 0);
        ctx.drawImage(s.sprite, -Math.round(s.sprite.width / 2), -Math.round(s.sprite.height / 2));
        ctx.restore();
      }
    }
    drawBank(ctx, t, c);
    drawTree(ctx, t, wind, c);
    // reeds (back row) on the right shallows
    for (const r of reedsBack) drawReed(ctx, r, t, wind, 0);
    // splashes & sparks
    for (const s of splashes) {
      ctx.fillStyle = s.col ? css(s.col) : css(mix(c.hor, [255, 255, 255], 0.7), 1 - s.life / s.max);
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, s.vy > 0 ? 2 : 1);
    }
    for (const s of sparks) {
      ctx.fillStyle = css(s.col, 1 - s.life / s.max);
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    // fireflies (dusk & night), petals (day)
    const ffA = LM.clamp(c.night * 1.4 - 0.1, 0, 1) * (1 - env.rain * 0.8);
    if (ffA > 0.02) {
      for (const f of fireflies) {
        const b = 0.5 + 0.5 * Math.sin(f.ph * 4);
        ctx.fillStyle = `rgba(240,255,170,${ffA * b})`;
        ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
      }
    }
    const pA = (1 - c.night) * (1 - env.rain);
    if (pA > 0.05) {
      for (const p of petals) {
        if (p.fg) continue;
        ctx.fillStyle = css(Math.sin(p.ph * 3) > 0 ? [246, 200, 236] : [214, 160, 214], pA);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.sin(p.ph * 3) > 0 ? 2 : 1, 1);
      }
    }
    // rain streaks
    for (const d of drops) {
      if (d.z > 0.75) continue;
      ctx.fillStyle = `rgba(200,215,240,${0.25 + d.z * 0.35})`;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
    }
    // lanterns released at the ending
    for (const l of lanterns) {
      ctx.fillStyle = '#ffcf7a';
      ctx.fillRect(Math.round(l.x), Math.round(l.y), 2, 3);
      ctx.fillStyle = '#fff2c8';
      ctx.fillRect(Math.round(l.x), Math.round(l.y) + 1, 1, 1);
    }
  }

  function drawBank(ctx, t, c) {
    // grassy bank bottom-left, rendered with day colours (lit by the shader)
    const top = (x) => 176 + Math.pow(x / 108, 2.2) * 40 + Math.sin(x * 0.4) * 1.2;
    const edge = (x) => Math.round(292 - x * 0.82 + Math.sin(x * 0.3) * 1.5); // where the bank meets the lake
    for (let x = 0; x < 116; x++) {
      const y0 = Math.round(top(x)), e = edge(x);
      if (y0 >= e - 2) continue;
      for (let y = y0; y < Math.min(H, e); y++) {
        const d = y - y0, toEdge = e - y;
        const b = P.bayer(x, y);
        let col;
        if (toEdge <= 7) {
          // earthen lip with stones
          col = toEdge <= 1 ? '#1e2a2a' : ((x * 3 + y * 5) % 13 < 3 ? '#6a6e7a' : b > 0.55 ? '#5a3e30' : '#46302a');
          if (toEdge === 7 || toEdge === 6) col = b > 0.5 ? '#3a6a3a' : '#2e5634';
        } else if (d < 2) col = (x + y) % 3 === 0 ? '#a8d870' : '#86c05e';
        else {
          // mown-grass texture with soft light patches
          const patch = Math.sin(x * 0.21 + y * 0.13) + Math.sin(x * 0.07 - y * 0.31);
          const l = 0.55 - d / 70 + patch * 0.12 + (b - 0.5) * 0.25;
          col = l > 0.62 ? '#86c05e' : l > 0.45 ? '#6aa850' : l > 0.3 ? '#528c44' : l > 0.15 ? '#3f7040' : '#2f5638';
        }
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
      // foam where the lake laps the bank
      if (e < H && (x + Math.floor(t * 3)) % 7 < 2) { ctx.fillStyle = 'rgba(230,245,255,0.75)'; ctx.fillRect(x, e, 1, 1); }
    }
    // clover, flowers and tufts
    const R = LM.rng(12);
    for (let i = 0; i < 46; i++) {
      const x = R.int(2, 100), y = Math.round(top(x)) + R.int(1, 40);
      if (y > edge(x) - 9) continue;
      const sw = Math.round(Math.sin(t * 2 + x) * 0.7 * (World.wind || 1));
      const kind = R();
      if (kind < 0.45) { ctx.fillStyle = '#a8d870'; ctx.fillRect(x + sw, y - 2, 1, 2); ctx.fillRect(x + 1, y - 1, 1, 1); ctx.fillStyle = '#3f7040'; ctx.fillRect(x - 1, y, 3, 1); }
      else if (kind < 0.7) { ctx.fillStyle = '#f6e6a0'; ctx.fillRect(x + sw, y - 1, 1, 1); ctx.fillStyle = '#5a9a50'; ctx.fillRect(x, y, 1, 1); }
      else if (kind < 0.88) { ctx.fillStyle = '#c9a2f0'; ctx.fillRect(x + sw, y - 1, 1, 1); ctx.fillStyle = '#f2dcff'; ctx.fillRect(x + sw + 1, y - 2, 1, 1); }
      else { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + sw, y - 1, 1, 1); }
    }
    for (let x = 2; x < 104; x += 4) {
      const y = Math.round(top(x));
      const sw = Math.round(Math.sin(t * 2 + x) * 0.7 * (World.wind || 1));
      ctx.fillStyle = '#a8d870';
      ctx.fillRect(x + sw, y - 2, 1, 2); ctx.fillRect(x + 2, y - 1, 1, 1);
    }
    // stones
    const rock = (x, y, w, h) => {
      ctx.fillStyle = '#2a2e3a'; ctx.fillRect(x - 1, y + h - 1, w + 2, 1);
      ctx.fillStyle = '#3c4250'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#5c6474'; ctx.fillRect(x + 1, y, w - 2, 1); ctx.fillRect(x, y + 1, 2, h - 2);
      ctx.fillStyle = '#8a94a4'; ctx.fillRect(x + 1, y, 2, 1);
      ctx.fillStyle = '#4f7a46'; ctx.fillRect(x + w - 3, y, 2, 1);
    };
    rock(14, 214, 8, 5); rock(56, 236, 9, 5); rock(30, 252, 7, 4);
  }

  function drawTree(ctx, t, wind, c) {
    const bx = tree.baseX, by = tree.baseY;
    // trunk: tapered, leaning right, with bark shading
    for (let y = by; y > 40; y--) {
      const k = (by - y) / (by - 40);
      const cx = bx + Math.sin(k * 2.2) * 14 + k * 10;
      const w = Math.round(9 - k * 5 + (y > by - 6 ? (6 - (by - y)) * 1.5 : 0));
      for (let i = -w; i <= w; i++) {
        const s = i / w;
        const col = s < -0.45 ? '#2a1c24' : s < 0.1 ? '#4a3036' : s < 0.6 ? '#6a4640' : '#8a6050';
        ctx.fillStyle = (y * 3 + i) % 11 === 0 ? '#3a262c' : col;
        ctx.fillRect(Math.round(cx + i), y, 1, 1);
      }
    }
    // branches
    const br = (x0, y0, x1, y1, th) => {
      for (let i = 0; i <= 20; i++) {
        const k = i / 20;
        const x = LM.lerp(x0, x1, k), y = LM.lerp(y0, y1, k) - Math.sin(k * Math.PI) * 6;
        const w = Math.max(1, Math.round(th * (1 - k * 0.7)));
        ctx.fillStyle = '#4a3036'; ctx.fillRect(Math.round(x), Math.round(y), w, w);
        ctx.fillStyle = '#7a5448'; ctx.fillRect(Math.round(x), Math.round(y), w, 1);
      }
    };
    br(52, 92, 108, 62, 4); br(48, 110, 12, 78, 4); br(56, 70, 86, 34, 3); br(46, 76, 30, 30, 3);
    // canopy: dark unified mass, then swaying leaf clusters
    const swayAt = (cl) => Math.sin(t * 1.1 + cl.ph) * 1.4 * cl.sway * wind + Math.sin(t * 2.7 + cl.ph * 2) * 0.35;
    ctx.fillStyle = '#0c1a20';
    for (const s of tree.sil) P.disc(ctx, s.x + Math.sin(t * 1.1 + s.x * 0.05) * 0.8 * wind, s.y, Math.round(s.r), '#0c1a20');
    for (const st of tree.strands) {
      const sw = swayAt(st.c);
      const x0 = st.c.x + st.dx + sw, y0 = st.c.y + st.c.r * 0.4;
      for (let i = 0; i < st.len; i++) {
        const k = i / st.len;
        const x = Math.round(x0 + Math.sin(t * 1.6 + st.ph + k * 2) * k * 2.2 * wind), y = Math.round(y0 + i);
        ctx.fillStyle = i % 3 === 0 ? '#b590d8' : i % 3 === 1 ? '#8a68b8' : '#d8baf0';
        ctx.fillRect(x, y, i % 2 ? 2 : 1, 1);
      }
      st.tx = Math.round(x0 + Math.sin(t * 1.6 + st.ph + 2) * 2.2 * wind); st.ty = Math.round(y0 + st.len);
    }
    for (const cl of tree.clusters) {
      const sw = swayAt(cl);
      ctx.drawImage(cl.spr, Math.round(cl.x - cl.r - 1 + sw), Math.round(cl.y - cl.r - 1 + Math.abs(sw) * 0.2));
    }
    // lantern fruits
    for (const f of tree.fruits) {
      const sw = Math.sin(t * 1.1 + f.c.ph) * 1.6 * f.c.sway * wind;
      const fx = Math.round(f.c.x + f.dx + sw + Math.sin(t * 1.7 + f.ph) * 0.8), fy = Math.round(f.c.y + f.c.r * 0.5 + f.len);
      ctx.fillStyle = '#2a1c24';
      ctx.fillRect(fx, fy - f.len + 2, 1, f.len - 2);
      ctx.fillStyle = '#f2a640'; ctx.fillRect(fx - 1, fy, 3, 3);
      ctx.fillStyle = '#ffe28a'; ctx.fillRect(fx, fy + 1, 1, 1);
      ctx.fillStyle = '#8a4a2a'; ctx.fillRect(fx - 1, fy + 3, 3, 1);
      f.gx = fx; f.gy = fy + 1;
    }
  }

  function drawReed(ctx, r, t, wind, layer) {
    const sw = Math.sin(t * 1.3 + r.ph) * 2 * wind;
    const x0 = Math.round(r.x), y0 = Math.round(r.y);
    for (let i = 0; i < r.h; i++) {
      const k = i / r.h;
      const x = Math.round(x0 + sw * k * k);
      ctx.fillStyle = i < 2 ? '#2a4a3a' : k < 0.6 ? '#4f7a46' : '#7aa858';
      ctx.fillRect(x, y0 - i, 1, 1);
    }
    // leaf blade
    for (let i = 0; i < r.h * 0.6; i++) {
      const k = i / r.h;
      ctx.fillStyle = '#5d8a4a';
      ctx.fillRect(Math.round(x0 + i * 0.5 + sw * k), Math.round(y0 - i * 0.9), 1, 1);
    }
    if (r.cat) {
      const x = Math.round(x0 + sw), y = y0 - r.h;
      ctx.fillStyle = '#5a3a28'; ctx.fillRect(x - 1, y, 2, 5);
      ctx.fillStyle = '#7a5038'; ctx.fillRect(x - 1, y, 1, 4);
      ctx.fillStyle = '#7aa858'; ctx.fillRect(x, y - 2, 1, 2);
    }
  }

  function drawPier(ctx, t, G) {
    const x0 = 66, x1 = 194, top = 203, bot = 211;
    // posts into the water
    for (const px of [78, 106, 134, 162, 190]) {
      ctx.fillStyle = '#2a1c22'; ctx.fillRect(px, bot, 3, 16);
      ctx.fillStyle = '#5a3c34'; ctx.fillRect(px, bot, 1, 15);
      ctx.fillStyle = 'rgba(220,240,255,0.55)'; ctx.fillRect(px - 1 + Math.round(Math.sin(t * 2 + px) * 0.6), bot + 15, 5, 1);
    }
    // deck planks (seen from above at an angle)
    for (let x = x0; x <= x1; x++) {
      const plank = Math.floor((x - x0) / 6);
      const base = plank % 2 ? '#8a6248' : '#9a7054';
      for (let y = top; y < bot; y++) {
        let col = base;
        if ((x - x0) % 6 === 0) col = '#5a3c34';
        else if (y === top) col = '#c09070';
        else if ((x * 7 + y * 3 + plank * 5) % 23 === 0) col = '#6a4a3a';
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.fillStyle = '#4a2e2a'; ctx.fillRect(x, bot, 1, 2);
      ctx.fillStyle = '#2a1a1e'; ctx.fillRect(x, bot + 2, 1, 1);
    }
    // bucket & coiled rope on deck
    ctx.fillStyle = '#2a1c22'; ctx.fillRect(118, 196, 9, 9);
    ctx.fillStyle = '#6a7e8e'; ctx.fillRect(119, 197, 7, 7);
    ctx.fillStyle = '#9ab0c0'; ctx.fillRect(119, 197, 7, 1);
    ctx.fillStyle = '#3a4a5a'; ctx.fillRect(119, 200, 7, 1);
    if (G.bucketGlint) { ctx.fillStyle = '#e8f8ff'; ctx.fillRect(121, 197, 2, 1); }
    ctx.fillStyle = '#c8a46a'; ctx.fillRect(98, 203, 8, 3);
    ctx.fillStyle = '#a07e48'; ctx.fillRect(99, 204, 6, 1);
    // lantern post at the end of the pier
    const lx = 192;
    ctx.fillStyle = '#2a1c22'; ctx.fillRect(lx, 162, 3, 44);
    ctx.fillStyle = '#6a4a3a'; ctx.fillRect(lx, 162, 1, 44);
    ctx.fillStyle = '#2a1c22'; ctx.fillRect(lx - 9, 162, 12, 2);
    const sway = Math.round(Math.sin(t * 1.4) * 0.8);
    ctx.fillRect(lx - 8 + sway, 164, 1, 3);
    ctx.fillStyle = '#3a2a2a'; ctx.fillRect(lx - 10 + sway, 167, 5, 1);
    ctx.fillStyle = '#ffd47a'; ctx.fillRect(lx - 10 + sway, 168, 5, 5);
    ctx.fillStyle = '#fff4c8'; ctx.fillRect(lx - 9 + sway, 169, 3, 3);
    ctx.fillStyle = '#3a2a2a'; ctx.fillRect(lx - 10 + sway, 173, 5, 1); ctx.fillRect(lx - 10 + sway, 168, 1, 5); ctx.fillRect(lx - 6 + sway, 168, 1, 5);
    World.lampPos = { x: lx - 8 + sway, y: 170 };
  }

  function charPos(G) {
    return { x: 158, y: 176 + (G.player && G.player.hop ? -Math.round(G.player.hop) : 0) };
  }
  World.charPos = charPos;

  function drawCharacter(ctx, G, t) {
    const pl = G.player || {};
    const p = charPos(G);
    const spr = pl.pose === 'up' ? char.up : char.hold;
    const breathe = Math.sin(t * 2.2) > 0.6 ? 1 : 0;
    const lean = Math.round(pl.lean || 0);
    // scarf tail streaming in the wind
    const wind = World.wind || 1;
    for (let i = 1; i <= 7; i++) {
      const sx = p.x + char.neck.x - i * 1.3 + lean;
      const sy = p.y + char.neck.y + Math.sin(t * 6 - i * 0.9) * i * 0.22 * wind + i * 0.25;
      ctx.fillStyle = i % 3 === 0 ? '#b98432' : '#ecbf54';
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
    }
    // draw body in two halves so the upper half can breathe / lean
    ctx.drawImage(spr, 0, 0, 20, 15, p.x + lean, p.y + breathe, 20, 15);
    ctx.drawImage(spr, 0, 15, 20, 14, p.x, p.y + 15, 20, 14);
    // belt lantern
    const lx = p.x + char.lantern.x, ly = p.y + char.lantern.y + Math.round(Math.sin(t * 3) * 0.5);
    ctx.fillStyle = '#2a1c22'; ctx.fillRect(lx, ly - 1, 1, 1);
    ctx.fillStyle = '#ffcf6a'; ctx.fillRect(lx - 1, ly, 3, 3);
    ctx.fillStyle = '#fff2c0'; ctx.fillRect(lx, ly + 1, 1, 1);
    World.beltLamp = { x: lx, y: ly + 1 };
    // held fish over the head
    if (G.fishVis && G.fishVis.held) {
      const s = G.fishVis.held;
      ctx.drawImage(s, Math.round(p.x + 16 - s.width / 2), Math.round(p.y - s.height + 4 - Math.sin(t * 3) * 1));
    }
  }

  function rodTip(G) {
    const p = charPos(G);
    const pl = G.player || {};
    const hand = pl.pose === 'up' ? char.handUp : char.handHold;
    const hx = p.x + hand.x + Math.round(pl.lean || 0), hy = p.y + hand.y;
    const ang = (G.rod && G.rod.angle !== undefined) ? G.rod.angle : -0.7;
    const len = 36;
    const bend = (G.rod && G.rod.bend) || 0;
    // bent rod: tip drops with tension
    const tx = hx + Math.cos(ang) * len, ty = hy + Math.sin(ang) * len + bend * 10;
    return { hx, hy, tx, ty, ang, bend };
  }
  World.rodTip = rodTip;

  function drawRodAndLine(ctx, G, t) {
    if (G.hideRod) return;
    const r = rodTip(G);
    const midx = (r.hx + r.tx) / 2 - Math.sin(r.ang) * r.bend * 3, midy = (r.hy + r.ty) / 2 + Math.abs(Math.cos(r.ang)) * r.bend * 6;
    // handle (cork) then shaft
    const hx2 = r.hx - Math.cos(r.ang) * 5, hy2 = r.hy - Math.sin(r.ang) * 5;
    P.line(ctx, hx2, hy2, r.hx, r.hy, '#5a3424');
    P.curve(ctx, r.hx, r.hy, midx, midy, r.tx, r.ty, '#3a2418', 14);
    P.curve(ctx, r.hx, r.hy - 1, midx, midy - 1, r.tx, r.ty, '#b07a4a', 14);
    ctx.fillStyle = '#e8d8b0'; ctx.fillRect(Math.round(r.tx), Math.round(r.ty), 1, 1);
    // reel
    ctx.fillStyle = '#2a1c22'; ctx.fillRect(Math.round(r.hx) - 2, Math.round(r.hy) + 1, 3, 3);
    ctx.fillStyle = '#c0c8d0'; ctx.fillRect(Math.round(r.hx) - 1, Math.round(r.hy) + 1, 1, 2);
    // line
    const b = G.bobber;
    if (b && b.visible) {
      const taut = G.line ? G.line.taut : 0;
      const sag = (1 - taut) * 14;
      const cx = (r.tx + b.x) / 2, cy = Math.max(r.ty, b.y) + sag - (b.y - r.ty) * 0.1;
      ctx.globalAlpha = 0.7;
      P.curve(ctx, r.tx, r.ty, cx, cy, b.x, b.y - (b.h || 0), taut > 0.5 ? '#ffffff' : '#dfe8ff', 28);
      ctx.globalAlpha = 1;
      if (!b.hidden) drawBobber(ctx, b, t);
    }
  }

  function drawBobber(ctx, b, t) {
    const x = Math.round(b.x), y = Math.round(b.y - (b.h || 0) + (b.dip || 0));
    ctx.fillStyle = '#1a1630'; ctx.fillRect(x - 1, y - 4, 3, 6);
    ctx.fillStyle = '#e8463a'; ctx.fillRect(x - 1, y - 3, 3, 2); ctx.fillRect(x, y - 4, 1, 1);
    ctx.fillStyle = '#ff9a7a'; ctx.fillRect(x - 1, y - 3, 1, 1);
    ctx.fillStyle = '#f4efe2'; ctx.fillRect(x - 1, y - 1, 3, 2);
    if (b.onWater) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x - 2, y + 1, 5, 1);
    }
  }

  // --------------------------------------------------------------- fg layer
  let fgBlobs = null;
  function renderFg(G, env, c, t) {
    const ctx = L.fg.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!fgBlobs) {
      const R = LM.rng(901);
      fgBlobs = [];
      const leaf = ['#13282c', '#1f4040', '#2c5a4c', '#4a805a'];
      const bloom = ['#3a2a52', '#5a4078', '#8a68a8', '#c4a2d8'];
      for (const [x, y, r] of [[-6, -6, 24], [30, -14, 20], [60, -18, 16], [-14, 30, 18], [8, 14, 14], [90, -16, 12]]) {
        fgBlobs.push({ x, y, r, spr: P.blob(r, R() < 0.4 ? bloom : leaf, R.int(1, 9999)), ph: R() * 6 });
      }
    }
    const wind = World.wind || 1;
    for (const b of fgBlobs) {
      const sw = Math.sin(t * 0.9 + b.ph) * 2.2 * wind;
      ctx.drawImage(b.spr, Math.round(b.x - b.r + sw), Math.round(b.y - b.r + Math.abs(sw) * 0.3));
    }
    for (const r of reedsFront) drawReed(ctx, r, t, wind, 1);
    // large grass blades bottom-right
    for (let i = 0; i < 12; i++) {
      const x0 = 396 + i * 8, h = 22 + (i * 37) % 26;
      const sw = Math.sin(t * 1.2 + i) * 3 * wind;
      for (let k = 0; k < h; k++) {
        const kk = k / h;
        ctx.fillStyle = kk < 0.5 ? '#2a4a2e' : '#4a7a3e';
        ctx.fillRect(Math.round(x0 + sw * kk * kk + kk * (i % 2 ? 6 : -4)), H - k, 2, 1);
      }
    }
    // big out-of-focus petals and raindrops near the camera
    const pA = (1 - c.night) * (1 - env.rain);
    for (const p of petals) {
      if (!p.fg || pA < 0.05) continue;
      ctx.fillStyle = css([250, 210, 240], pA);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 2);
    }
    for (const d of drops) {
      if (d.z <= 0.75) continue;
      ctx.fillStyle = 'rgba(210,225,250,0.5)';
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 6);
    }
  }

  // --------------------------------------------------------------- glow layer
  function renderGlow(G, env, c, t) {
    const g = L.glow.ctx;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W / 2, H / 2);
    g.globalCompositeOperation = 'lighter';
    const lampOn = LM.clamp(c.night * 1.3 + env.rain * 0.5 + env.fog * 0.3, 0.12, 1);
    const flick = 0.9 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.05;
    const warm = [255, 176, 88];
    if (World.lampPos) {
      glow(World.lampPos.x, World.lampPos.y, 64, warm, 0.36 * lampOn * flick);
      glow(World.lampPos.x, World.lampPos.y, 10, [255, 230, 170], 0.55 * lampOn);
      // its reflection in the lake
      glow(World.lampPos.x, 258, 26, warm, 0.25 * lampOn);
    }
    if (World.beltLamp) glow(World.beltLamp.x, World.beltLamp.y, 18, warm, 0.35 * lampOn * flick);
    for (const f of tree.fruits) if (f.gx) glow(f.gx, f.gy, 14, [255, 170, 80], 0.5 * lampOn * (0.8 + 0.2 * Math.sin(t * 2 + f.ph)));
    // crystal spire
    const cr = World.crystal;
    const pulse = 0.6 + 0.4 * Math.sin(t * 1.4);
    const lg = G.legendGlow || 0;
    glow(cr.x, cr.y, 20 + lg * 22, [120, 230, 255], (0.35 + c.night * 0.4) * pulse + lg * 0.35);
    glow(cr.x, HZ + (HZ - cr.y) * 1.1, 14 + lg * 12, [120, 230, 255], (0.15 + c.night * 0.2) * pulse + lg * 0.18);
    if (lg > 0.05) {
      // beam of light from the spire
      const gg = g.createLinearGradient(cr.x / 2, 0, cr.x / 2, cr.y / 2);
      gg.addColorStop(0, `rgba(140,230,255,0)`);
      gg.addColorStop(1, `rgba(170,240,255,${lg * 0.5})`);
      g.fillStyle = gg;
      g.fillRect(cr.x / 2 - 2, 0, 4, cr.y / 2);
    }
    // fireflies
    const ffA = LM.clamp(c.night * 1.4 - 0.1, 0, 1) * (1 - env.rain * 0.8);
    if (ffA > 0.02) for (const f of fireflies) {
      const b = 0.5 + 0.5 * Math.sin(f.ph * 4);
      glow(f.x, f.y, 8, [200, 255, 120], ffA * b * 0.8);
    }
    // lotus glow at night
    for (const l of lilies) if (l.flower) glow(l.x, l.y - 2, 8, [255, 160, 220], c.night * 0.35);
    // sun glitter sparkle bloom
    if (c.sunny > 0.1 && c.sun.vis) {
      for (let i = 0; i < 6; i++) {
        const h = Math.sin(i * 12.9 + Math.floor(t * 5) * 7.1) * 43758.5; const r = h - Math.floor(h);
        glow(c.sun.x + (r - 0.5) * 60, HZ + 8 + r * 80, 3, [255, 240, 200], c.sunny * 0.35);
      }
    }
    // bobber glow (star lure)
    if (G.bobber && G.bobber.visible && G.bobber.glow) glow(G.bobber.x, G.bobber.y - 2, 12, [180, 220, 255], G.bobber.glow);
    // glowing fish
    if (G.fishVis && G.fishVis.glowAt) {
      const ga = G.fishVis.glowAt;
      glow(ga.x, ga.y, ga.r, ga.col, ga.a);
    }
    for (const s of sparks) glow(s.x, s.y, 5, s.col, (1 - s.life / s.max) * 0.8);
    for (const l of lanterns) glow(l.x + 1, l.y + 1, 7, [255, 180, 90], 0.5);
    if (G.extraGlow) for (const e of G.extraGlow) glow(e.x, e.y, e.r, e.col, e.a);
    g.globalCompositeOperation = 'source-over';
  }

  LM.World = World;
})(window.LM);
