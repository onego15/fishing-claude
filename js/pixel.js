/* Lumina Mere — procedural pixel art
 * Every sprite in the game is authored here, either as a hand-drawn pixel map
 * or generated with hard-edged, palette-limited rules (no anti-aliasing).
 */
'use strict';

(function (LM) {
  const P = {};

  P.rect = function (ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  // Bresenham line, 1px crisp
  P.line = function (ctx, x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    ctx.fillStyle = col;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 2000; i++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  // Quadratic bezier as connected pixels
  P.curve = function (ctx, x0, y0, cx, cy, x1, y1, col, steps) {
    steps = steps || 24;
    let px = x0, py = y0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      P.line(ctx, px, py, x, y, col);
      px = x; py = y;
    }
  };

  // Pixel-perfect ellipse outline (for ripples)
  P.ellipse = function (ctx, cx, cy, rx, ry, col) {
    ctx.fillStyle = col;
    const n = Math.max(12, Math.floor((rx + ry) * 2));
    let lx = null, ly = null;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
      if (x !== lx || y !== ly) ctx.fillRect(x, y, 1, 1);
      lx = x; ly = y;
    }
  };

  P.disc = function (ctx, cx, cy, r, col) {
    ctx.fillStyle = col;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  };

  // Build a sprite from rows of palette characters.
  P.fromMap = function (rows, pal) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const s = LM.makeCanvas(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.' || ch === ' ' || !pal[ch]) continue;
        s.ctx.fillStyle = pal[ch];
        s.ctx.fillRect(x, y, 1, 1);
      }
    }
    return s.c;
  };

  P.flipH = function (src) {
    const s = LM.makeCanvas(src.width, src.height);
    s.ctx.translate(src.width, 0);
    s.ctx.scale(-1, 1);
    s.ctx.drawImage(src, 0, 0);
    return s.c;
  };

  // Silhouette/tint copy of a sprite (used for shadows, reflections, glow masks)
  P.tint = function (src, col) {
    const s = LM.makeCanvas(src.width, src.height);
    s.ctx.drawImage(src, 0, 0);
    s.ctx.globalCompositeOperation = 'source-in';
    s.ctx.fillStyle = col;
    s.ctx.fillRect(0, 0, src.width, src.height);
    return s.c;
  };

  // Foliage blob: a hard-edged disc with ordered-dither shading, lit from the upper left.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  P.bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16;

  P.blob = function (r, cols, seed, opts) {
    opts = opts || {};
    const R = LM.rng(seed);
    const size = r * 2 + 3;
    const s = LM.makeCanvas(size, size);
    const c = r + 1;
    // lumpy radius
    const bumps = [];
    for (let i = 0; i < 7; i++) bumps.push({ a: R() * Math.PI * 2, k: R.range(0.08, 0.22) });
    const radAt = (ang) => {
      let k = 1;
      for (const b of bumps) k += Math.cos(ang - b.a) * b.k * 0.5;
      return r * LM.clamp(k, 0.75, 1.1);
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - c, dy = y - c;
        const d = Math.sqrt(dx * dx + dy * dy);
        const rr = radAt(Math.atan2(dy, dx));
        if (d > rr) continue;
        // light from upper-left
        let l = 0.55 - (dx * 0.55 + dy * 0.8) / (r * 2.2) + (1 - d / rr) * 0.15;
        l += (P.bayer(x, y) - 0.5) * 0.28;
        let idx = l > 0.82 ? 3 : l > 0.55 ? 2 : l > 0.3 ? 1 : 0;
        if (d > rr - 1.1 && idx > 1) idx = 1; // rim
        s.ctx.fillStyle = cols[idx];
        s.ctx.fillRect(x, y, 1, 1);
      }
    }
    // sprinkle highlight specks (leaf clusters / blossoms)
    if (opts.specks) {
      for (let i = 0; i < r * 1.6; i++) {
        const a = R() * Math.PI * 2, d = R() * r * 0.8;
        const x = Math.round(c + Math.cos(a) * d - r * 0.15), y = Math.round(c + Math.sin(a) * d - r * 0.2);
        s.ctx.fillStyle = opts.specks[i % opts.specks.length];
        s.ctx.fillRect(x, y, 1, 1);
      }
    }
    return s.c;
  };

  // Stylised pixel cloud built from flat bands
  P.cloud = function (w, h, seed) {
    const R = LM.rng(seed);
    const s = LM.makeCanvas(w, h);
    const puffs = [];
    const n = Math.floor(w / 9) + 2;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      puffs.push({ x: LM.lerp(h * 0.5, w - h * 0.5, t) + R.range(-3, 3), y: h * 0.62 - Math.sin(t * Math.PI) * h * R.range(0.15, 0.35), r: h * R.range(0.28, 0.48) * (0.6 + Math.sin(t * Math.PI) * 0.5) });
    }
    const data = s.ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let inside = false, lit = 0;
        for (const p of puffs) {
          const dx = x - p.x, dy = y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < p.r) { inside = true; lit = Math.max(lit, (p.y - y) / p.r * 0.5 + 0.5 - d / p.r * 0.2); }
        }
        if (!inside || y > h * 0.8) continue;
        lit += (P.bayer(x, y) - 0.5) * 0.25;
        // encode light level into red channel (0,85,170,255) -> recoloured at draw time
        const lv = lit > 0.62 ? 3 : lit > 0.42 ? 2 : lit > 0.22 ? 1 : 0;
        const i4 = (y * w + x) * 4;
        data.data[i4] = lv * 85; data.data[i4 + 1] = lv * 85; data.data[i4 + 2] = lv * 85; data.data[i4 + 3] = 255;
      }
    }
    s.ctx.putImageData(data, 0, 0);
    return s.c;
  };

  // ---- Character: "Sui", apprentice lamp-keeper angler ---------------------
  const CHAR_PAL = {
    K: '#1a1630', H: '#33405f', h: '#4d6187', g: '#6f86ad', b: '#d8a644',
    S: '#f3cba4', s: '#cf9573', R: '#6a3b33', r: '#8a5245', E: '#1a1630',
    Y: '#ecbf54', y: '#b98432', C: '#2e7472', c: '#1f4b54', L: '#4fa7a0', l: '#7cc9bd',
    P: '#463a5e', p: '#5d4f7a', B: '#5b3a2c', W: '#f6efe2',
  };
  const BODY = [
    '........KKKK........',
    '......KKghhhKK......',
    '.....KhhghhhhhK.....',
    '.....KHhhhhhhhK.....',
    '....KbbbbbbbbbbK....',
    '..KKHHHHHHHHHHHHKK..',
    '.KHHHHHHHHHHHHHHHHK.',
    '..KKKRRRRSSSSSKKK...',
    '....KRrRSSSSESSK....',
    '....KRRSSSSSSSsK....',
    '.....KYYYYYYYYK.....',
    '....KYYYYYYYYYYK....',
    '...KCCYyYCCCCCCK....',
    '...KCCCyCCCCLlCK....',
    '..KcCCCCCCCLLlCCK...',
    '..KcCCCCCCCCKSSSSK..',
    '..KcCCCCCCCCCLLKK...',
    '..KccCCCCCCCCClK....',
    '..KccCCCCCCCCCLK....',
    '..KcccCCCCCCCCCK....',
    '...KcccCCCCCCCK.....',
    '...KKccccCCCCCK.....',
    '....KKKKKKKKKK......',
    '.....KPpKKPpK.......',
    '.....KPPK.KPPK......',
    '.....KPPK.KPPK......',
    '.....KBBK.KBBK......',
    '....KBBBKKBBBBK.....',
    '....KKKKK.KKKKK.....',
  ];
  // Arms raised (cast wind-up / triumphant pose)
  const BODY_UP = BODY.slice();
  BODY_UP[1] = '......KKghhhKK.KK...';
  BODY_UP[2] = '.....KhhghhhhhKSSK..';
  BODY_UP[3] = '.....KHhhhhhhhKSSK..';
  BODY_UP[4] = '....KbbbbbbbbbbKCK..';
  BODY_UP[5] = '..KKHHHHHHHHHHHHCK..';
  BODY_UP[6] = '.KHHHHHHHHHHHHHHHHK.';
  BODY_UP[13] = '...KCCCyCCCCLLCK....';
  BODY_UP[14] = '..KcCCCCCCCLLLCK....';
  BODY_UP[15] = '..KcCCCCCCCCCLLK....';
  BODY_UP[16] = '..KcCCCCCCCCCLLK....';

  P.makeCharacter = function () {
    const hold = P.fromMap(BODY, CHAR_PAL);
    const up = P.fromMap(BODY_UP, CHAR_PAL);
    return {
      hold, up,
      handHold: { x: 16, y: 15 },
      handUp: { x: 16, y: 2 },
      neck: { x: 6, y: 11 },
      lantern: { x: 4, y: 19 },
      w: 20, h: 29,
      pal: CHAR_PAL,
    };
  };

  // ---- Fish generator -----------------------------------------------------
  P.makeFish = function (spec) {
    const R = LM.rng(spec.seed || 1);
    const len = spec.len, ht = spec.ht;
    const tail = spec.tail === 'eel' ? 2 : Math.max(3, Math.round(len * 0.2));
    const finH = Math.ceil(ht * (spec.dorsal || 0.4) * 0.7) + 1;
    const w = len + tail + 3, h = ht + finH * 2 + 4;
    const cy = Math.floor(h / 2);
    const grid = []; // per pixel colour or null
    for (let i = 0; i < w * h; i++) grid.push(null);
    const glow = [];
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) grid[y * w + x] = c; };
    const get = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? grid[y * w + x] : null);
    const top = spec.top, mid = spec.mid, belly = spec.belly, fin = spec.fin;
    const bodyX0 = tail + 1, bodyX1 = bodyX0 + len - 1;
    const half = (t) => {
      if (spec.tail === 'eel') return (ht / 2) * Math.min(1, t * 4, (1 - t) * 3 + 0.35);
      const k = Math.sin(Math.PI * (0.12 + 0.88 * t));
      return (ht / 2) * Math.pow(Math.max(0, k), spec.blunt || 0.65) * (t > 0.9 ? 1 - (t - 0.9) * 2.5 : 1);
    };
    // dorsal & tail fins first (body drawn over them)
    const dorsalStart = spec.dorsalAt || 0.32, dorsalEnd = dorsalStart + 0.32;
    for (let x = bodyX0; x <= bodyX1; x++) {
      const t = (x - bodyX0) / (len - 1);
      if (spec.dorsal && t > dorsalStart && t < dorsalEnd) {
        const ft = (t - dorsalStart) / (dorsalEnd - dorsalStart);
        const fh = Math.round(finH * Math.sin(ft * Math.PI * 0.85 + 0.25) * (1.1 - ft * 0.5));
        const yTop = Math.round(cy - half(t));
        for (let k = 1; k <= fh; k++) set(x - Math.floor(k * 0.6), yTop - k, k === fh ? spec.finHi || fin : fin);
      }
      if (t > 0.45 && t < 0.62) { // ventral fin
        const yb = Math.round(cy + half(t));
        const fh = Math.max(1, Math.round(finH * 0.55 * Math.sin(((t - 0.45) / 0.17) * Math.PI)));
        for (let k = 1; k <= fh; k++) set(x - k, yb + k - 1, fin);
      }
    }
    // tail
    const tx = bodyX0;
    const jointH = Math.max(1, Math.round(half(0.02)));
    if (spec.tail === 'eel') {
      for (let x = 0; x < bodyX0 + 3; x++) set(x, cy, fin);
    } else {
      for (let x = 0; x < tail + 1; x++) {
        const k = 1 - x / (tail + 1); // 1 at tip, 0 at joint
        let spread;
        if (spec.tail === 'round') spread = jointH + Math.sin((1 - k) * Math.PI) * ht * 0.32 + k * ht * 0.2;
        else if (spec.tail === 'long') spread = jointH + k * ht * 0.55;
        else spread = jointH + k * ht * 0.45;
        for (let y = -Math.round(spread); y <= Math.round(spread); y++) {
          if (spec.tail === 'fork' && Math.abs(y) < spread * (k * 0.7) && x < tail * 0.55) continue;
          set(tx - (tail + 1) + x + 1, cy + y, (Math.abs(y) + x) % 3 === 0 ? spec.finHi || fin : fin);
        }
      }
    }
    // body
    for (let x = bodyX0; x <= bodyX1; x++) {
      const t = (x - bodyX0) / (len - 1);
      const hh = half(t);
      const y0 = Math.round(cy - hh), y1 = Math.round(cy + hh * (spec.bellyK || 1.05));
      for (let y = y0; y <= y1; y++) {
        const v = (y - y0) / Math.max(1, y1 - y0);
        const d = P.bayer(x, y) * 0.16 - 0.08;
        let col = v + d < 0.34 ? top : v + d < 0.68 ? mid : belly;
        if (y === y0 + 1 && x % 2 === 0) col = spec.hi || col;
        // pattern
        const pt = spec.pattern;
        if (pt === 'spots' && v < 0.7 && R() < 0.12) col = spec.patCol;
        if (pt === 'stripes' && v > 0.15 && v < 0.75 && Math.floor(x * 0.5 + v * 2) % 3 === 0) col = spec.patCol;
        if (pt === 'band' && v > 0.38 && v < 0.6) col = spec.patCol;
        if (pt === 'scales' && v < 0.72 && (x + y * 2) % 4 === 0) col = spec.patCol;
        if (pt === 'koi' && v < 0.75) {
          const n = Math.sin(x * 0.5 + R() * 0.3) + Math.cos(y * 0.9 + x * 0.2);
          if (n > 0.6) col = spec.patCol;
        }
        set(x, y, col);
        if (spec.glow && (pt === 'glowdots' ? R() < 0.08 && v < 0.75 : pt === 'glowline' ? Math.abs(v - 0.5) < 0.09 : false)) {
          set(x, y, spec.glow);
          glow.push([x, y]);
        }
      }
      // gill line
      if (Math.abs(t - 0.74) < 0.5 / len) for (let y = y0 + 2; y <= y1 - 2; y++) set(x, y, spec.gill || top);
    }
    // whiskers
    if (spec.whisker) {
      for (let k = 0; k < 4; k++) { set(bodyX1 + 1 + k, cy + 1 + Math.floor(k / 2), fin); set(bodyX1 + k, cy + 3 + k, fin); }
    }
    // eye
    const et = 0.86, ex = Math.round(bodyX0 + et * (len - 1)), ey = Math.round(cy - half(et) * 0.25);
    const eyeBig = ht >= 9;
    set(ex, ey, '#14101e');
    if (eyeBig) { set(ex - 1, ey, '#14101e'); set(ex, ey + 1, '#14101e'); set(ex - 1, ey + 1, '#14101e'); set(ex, ey, '#14101e'); }
    set(ex - (eyeBig ? 1 : 0), ey - (eyeBig ? 0 : 0), eyeBig ? '#f2f0ff' : '#14101e');
    // outline
    const out = spec.outline || '#141024';
    const filled = grid.map((c) => c !== null);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (filled[y * w + x]) continue;
        if ((x > 0 && filled[y * w + x - 1]) || (x < w - 1 && filled[y * w + x + 1]) || (y > 0 && filled[(y - 1) * w + x]) || (y < h - 1 && filled[(y + 1) * w + x])) grid[y * w + x] = out;
      }
    }
    const s = LM.makeCanvas(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = grid[y * w + x];
      if (c) { s.ctx.fillStyle = c; s.ctx.fillRect(x, y, 1, 1); }
    }
    return { canvas: s.c, w, h, glow, cy };
  };

  // Simple twinkle star sprite for UI
  P.star4 = function (col) {
    return P.fromMap(['..x..', '..x..', 'xxXxx', '..x..', '..x..'], { x: col, X: '#ffffff' });
  };

  LM.P = P;
})(window.LM);
