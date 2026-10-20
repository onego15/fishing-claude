/* Lumina Mere — core utilities
 * Shared namespace, math helpers, seeded RNG and colour helpers.
 */
'use strict';

window.LM = window.LM || {};

(function (LM) {
  // Internal (pixel) resolution of the world. Everything world-side is drawn
  // at this size, then composited and upscaled by the post-processing pass.
  LM.W = 480;
  LM.H = 270;
  LM.HORIZON = 118; // screen row where the far shore meets the lake

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  // Frame-rate independent exponential approach
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

  // Mulberry32 seeded RNG so procedural art is identical every run.
  function rng(seed) {
    let s = seed >>> 0;
    const f = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  }

  // 1D value noise (smooth), used for terrain silhouettes and wind.
  function noise1(seed) {
    const r = rng(seed);
    const N = 256;
    const tab = new Float32Array(N);
    for (let i = 0; i < N; i++) tab[i] = r();
    return function (x) {
      const i = Math.floor(x), f = x - i;
      const a = tab[((i % N) + N) % N], b = tab[(((i + 1) % N) + N) % N];
      return lerp(a, b, smooth(f));
    };
  }

  // ---- colour helpers -----------------------------------------------------
  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }
  function scale(c, k) {
    return [c[0] * k, c[1] * k, c[2] * k];
  }
  function css(c, a) {
    const r = clamp(Math.round(c[0]), 0, 255), g = clamp(Math.round(c[1]), 0, 255), b = clamp(Math.round(c[2]), 0, 255);
    return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  }
  // Quantise to a coarse grid so gradients read as pixel-art bands.
  function q(c, step) {
    step = step || 6;
    return [Math.round(c[0] / step) * step, Math.round(c[1] / step) * step, Math.round(c[2] / step) * step];
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    return { c, ctx, w, h };
  }

  Object.assign(LM, {
    clamp, lerp, invLerp, smooth, easeOutCubic, easeInOut, easeOutBack, damp,
    rng, noise1, hex, mix, scale, css, q, makeCanvas,
  });
})(window.LM);
