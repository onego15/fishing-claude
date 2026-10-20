/* Lumina Mere — time of day & weather
 * Produces an interpolated "environment" every frame that every renderer reads.
 */
'use strict';

(function (LM) {
  const H = LM.hex;

  // Keyframes keyed by hour (0..24). Colours are authored by hand per mood.
  const KEYS = [
    { h: 0,    top: '#070b24', mid: '#131a44', hor: '#2a3166', mf: '#1a2048', mn: '#121634', fo: '#0b0f22', wat: '#0c1430', amb: [0.40, 0.46, 0.78], fog: '#2c3670', star: 1.0, glow: '#6f7fd8' },
    { h: 4.4,  top: '#0b1030', mid: '#1d2152', hor: '#3e3a72', mf: '#252652', mn: '#191a3c', fo: '#0e1026', wat: '#111838', amb: [0.46, 0.48, 0.78], fog: '#3a3a78', star: 0.9, glow: '#7a74d0' },
    { h: 5.4,  top: '#262f6e', mid: '#7c5a96', hor: '#e5917f', mf: '#6d5a8e', mn: '#433f6e', fo: '#252846', wat: '#3a3a6c', amb: [0.72, 0.62, 0.78], fog: '#c58fa8', star: 0.35, glow: '#ff9f86' },
    { h: 6.4,  top: '#4a6cb4', mid: '#c995b0', hor: '#ffd3a0', mf: '#9b93b8', mn: '#64729a', fo: '#2e4656', wat: '#6a7fae', amb: [0.92, 0.84, 0.84], fog: '#f0c8c4', star: 0.0, glow: '#ffd09a' },
    { h: 8.5,  top: '#3d7fd6', mid: '#86bce8', hor: '#d6eef4', mf: '#94b6d4', mn: '#5d88aa', fo: '#2c5a58', wat: '#3f78b0', amb: [1.0, 0.98, 0.94], fog: '#dfeef4', star: 0.0, glow: '#fff4d0' },
    { h: 12,   top: '#3580de', mid: '#7ab8ec', hor: '#c8eaf6', mf: '#98bedc', mn: '#6390b2', fo: '#2e625a', wat: '#3a7cb8', amb: [1.03, 1.02, 1.0], fog: '#e2f2f8', star: 0.0, glow: '#ffffff' },
    { h: 15.6, top: '#4078cc', mid: '#8eb4dc', hor: '#f0e2bc', mf: '#a8b2c8', mn: '#6d8298', fo: '#33584a', wat: '#4a78a8', amb: [1.02, 0.95, 0.84], fog: '#f2e4c8', star: 0.0, glow: '#ffe2a8' },
    { h: 17.4, top: '#3b3f86', mid: '#c46a86', hor: '#ffb062', mf: '#8f5f80', mn: '#56416a', fo: '#2a2742', wat: '#6a4a78', amb: [1.0, 0.70, 0.60], fog: '#f2a088', star: 0.05, glow: '#ff9c58' },
    { h: 18.4, top: '#22225a', mid: '#6c3f7c', hor: '#d0687a', mf: '#4c3a66', mn: '#33294e', fo: '#1c1a34', wat: '#3a2c5c', amb: [0.74, 0.58, 0.78], fog: '#9a5a88', star: 0.4, glow: '#e07a8a' },
    { h: 19.6, top: '#0e1236', mid: '#222a5c', hor: '#463f7a', mf: '#262754', mn: '#191a3c', fo: '#0f1128', wat: '#141c40', amb: [0.46, 0.48, 0.80], fog: '#3a3e7a', star: 0.85, glow: '#7a7ed8' },
    { h: 24,   top: '#070b24', mid: '#131a44', hor: '#2a3166', mf: '#1a2048', mn: '#121634', fo: '#0b0f22', wat: '#0c1430', amb: [0.40, 0.46, 0.78], fog: '#2c3670', star: 1.0, glow: '#6f7fd8' },
  ];
  // pre-parse
  for (const k of KEYS) {
    for (const p of ['top', 'mid', 'hor', 'mf', 'mn', 'fo', 'wat', 'fog', 'glow']) k[p] = H(k[p]);
  }

  const PERIODS = [
    { id: 'dawn', name: '夜明け', from: 5, to: 7 },
    { id: 'day', name: '昼', from: 7, to: 17 },
    { id: 'dusk', name: '夕暮れ', from: 17, to: 19 },
    { id: 'night', name: '夜', from: 19, to: 29 },
  ];
  function periodOf(hour) {
    const h = hour < 5 ? hour + 24 : hour;
    for (const p of PERIODS) if (h >= p.from && h < p.to) return p;
    return PERIODS[3];
  }

  const WEATHER = {
    clear: { id: 'clear', name: '晴れ', icon: '☀' },
    rain: { id: 'rain', name: '雨', icon: '☂' },
    fog: { id: 'fog', name: '霧', icon: '≋' },
  };

  // Semi-scripted forecast so every weather appears during a short session.
  const FORECAST = ['clear', 'clear', 'rain', 'clear', 'fog', 'clear', 'clear', 'rain', 'fog', 'clear'];

  const env = {
    hour: 14.0,
    secondsPerHour: 30,
    weather: 'clear',
    forecastIdx: 0,
    nextWeatherAt: 16.5,
    rain: 0, // smoothed intensities 0..1
    fog: 0,
    cloud: 0.25,
    lightning: 0,
    // derived, filled by update()
    c: {},
  };

  function sample(hour) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    const t = LM.smooth((hour - a.h) / (b.h - a.h || 1));
    const out = {};
    for (const p of ['top', 'mid', 'hor', 'mf', 'mn', 'fo', 'wat', 'fog', 'glow', 'amb']) out[p] = LM.mix(a[p], b[p], t);
    out.star = LM.lerp(a.star, b.star, t);
    return out;
  }

  // Sun/moon screen positions (internal pixels). Sun arcs 6h..18h, moon 18h..6h.
  function celestial(hour) {
    const sunT = (hour - 5.6) / 13; // 0..1 across the day
    const moonH = hour < 12 ? hour + 24 : hour;
    const moonT = (moonH - 18.2) / 12.4;
    const arc = (t, x0, x1) => ({
      x: LM.lerp(x0, x1, t),
      y: LM.HORIZON + 6 - Math.sin(LM.clamp(t, 0, 1) * Math.PI) * 96,
      vis: t > -0.02 && t < 1.02,
    });
    return { sun: arc(sunT, 70, 430), moon: arc(moonT, 420, 80) };
  }

  env.setWeather = function (w) { env.weather = w; };

  env.advanceTo = function (hour) {
    // used by "rest": jump forward, wrap at 24
    env.hour = hour % 24;
  };

  env.update = function (dt, opts) {
    const prevHour = env.hour;
    if (!opts || !opts.freezeTime) env.hour = (env.hour + dt / env.secondsPerHour) % 24;
    // weather schedule every ~2.5 in-game hours
    const crossed = (from, to, mark) => (from <= to ? mark > from && mark <= to : mark > from || mark <= to);
    if (crossed(prevHour, env.hour, env.nextWeatherAt)) env.rollWeather();

    const targetRain = env.weather === 'rain' ? 1 : 0;
    const targetFog = env.weather === 'fog' ? 1 : env.weather === 'rain' ? 0.25 : 0.0;
    env.rain = LM.damp(env.rain, targetRain, 0.5, dt);
    env.fog = LM.damp(env.fog, targetFog, 0.45, dt);
    env.cloud = LM.damp(env.cloud, env.weather === 'clear' ? 0.25 : 0.85, 0.4, dt);
    env.lightning = Math.max(0, env.lightning - dt * 3);

    const c = sample(env.hour);
    // Weather grading: rain greys and darkens, fog lifts & washes out.
    const grey = (col, k) => {
      const l = col[0] * 0.3 + col[1] * 0.55 + col[2] * 0.15;
      return LM.mix(col, [l * 0.92, l * 0.98, l * 1.08], k);
    };
    const r = env.rain * 0.75, f = env.fog * 0.55;
    for (const p of ['top', 'mid', 'hor', 'mf', 'mn', 'fo', 'wat']) {
      c[p] = grey(c[p], r);
      c[p] = LM.scale(c[p], 1 - env.rain * 0.22);
      c[p] = LM.mix(c[p], c.fog, f * (p === 'top' ? 0.4 : p === 'fo' ? 0.75 : 0.6));
    }
    c.amb = LM.scale(grey(c.amb, r * 0.5), 1 - env.rain * 0.12);
    c.star *= 1 - Math.max(env.rain, env.fog * 0.8, env.cloud > 0.5 ? 0.6 : 0);
    const cel = celestial(env.hour);
    c.sun = cel.sun;
    c.moon = cel.moon;
    c.night = LM.clamp(c.star * 1.1, 0, 1);
    c.sunny = (1 - c.night) * (1 - env.rain) * (1 - env.fog * 0.7) * (cel.sun.vis ? 1 : 0);
    env.c = c;
    env.period = periodOf(env.hour);
  };

  env.rollWeather = function () {
    let w;
    if (env.forecastIdx < FORECAST.length) w = FORECAST[env.forecastIdx++];
    else {
      const r = Math.random();
      w = r < 0.55 ? 'clear' : r < 0.78 ? 'rain' : 'fog';
    }
    env.weather = w;
    env.nextWeatherAt = (env.hour + 2.2 + Math.random() * 0.8) % 24;
    if (LM.ui) LM.ui.toast(`天候が変わった — ${WEATHER[w].name}`);
  };

  env.clockText = function () {
    const h = Math.floor(env.hour), m = Math.floor((env.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(Math.floor(m / 10) * 10).padStart(2, '0')}`;
  };

  LM.env = env;
  LM.PERIODS = PERIODS;
  LM.WEATHER = WEATHER;
  LM.periodOf = periodOf;
})(window.LM);
