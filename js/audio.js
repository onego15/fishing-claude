/* Lumina Mere — generative audio (WebAudio, no sample files)
 * Ambient lake bed, weather layers, a slow generative score and all SFX.
 */
'use strict';

(function (LM) {
  const A = { ready: false, muted: false };
  let ctx, master, musicBus, sfxBus, ambBus, reverb, delay;
  let waterGain, rainGain, windGain, noiseBuf;
  let nextChordAt = 0, chordIdx = 0, nextNoteAt = 0, noteStep = 0, nextCricket = 0;

  const CHORDS = [
    [53, 57, 60, 64], // Fmaj7
    [52, 55, 59, 62], // Em7
    [50, 53, 57, 64], // Dm9-ish
    [48, 52, 55, 59], // Cmaj7
    [46, 50, 53, 57], // Bbmaj7
    [48, 52, 55, 62], // Cadd9
  ];
  const SCALE = [0, 2, 4, 7, 9]; // pentatonic over C
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function makeNoise() {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brownish
      d[i] = w * 0.5 + last * 3.5;
    }
    return b;
  }
  function makeImpulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  function noiseSrc(loop) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = !!loop;
    return s;
  }

  A.init = function () {
    if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = A.muted ? 0 : 0.8; master.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(3.2, 2.6);
    const revGain = ctx.createGain(); revGain.gain.value = 0.55; reverb.connect(revGain); revGain.connect(master);
    delay = ctx.createDelay(1.0); delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38; delay.connect(fb); fb.connect(delay);
    const dl = ctx.createGain(); dl.gain.value = 0.35; delay.connect(dl); dl.connect(reverb); dl.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master); musicBus.connect(reverb);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.75; sfxBus.connect(master); sfxBus.connect(reverb);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
    noiseBuf = makeNoise();
    // lapping water
    const w = noiseSrc(true); const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
    waterGain = ctx.createGain(); waterGain.gain.value = 0.18;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.17; const lg = ctx.createGain(); lg.gain.value = 0.08; lfo.connect(lg); lg.connect(waterGain.gain); lfo.start();
    w.connect(wf); wf.connect(waterGain); waterGain.connect(ambBus); w.start();
    // rain
    const r = noiseSrc(true); const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    r.connect(rf); rf.connect(rainGain); rainGain.connect(ambBus); r.start(0, 0.7);
    // wind
    const wi = noiseSrc(true); const wif = ctx.createBiquadFilter(); wif.type = 'bandpass'; wif.frequency.value = 700; wif.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0.05;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07; const lg2 = ctx.createGain(); lg2.gain.value = 300; lfo2.connect(lg2); lg2.connect(wif.frequency); lfo2.start();
    wi.connect(wif); wif.connect(windGain); windGain.connect(ambBus); wi.start(0, 1.3);
    A.ready = true;
    nextChordAt = ctx.currentTime + 0.3;
    nextNoteAt = ctx.currentTime + 2;
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.1);
  };

  function tone(freq, t0, dur, opt) {
    opt = opt || {};
    const o = ctx.createOscillator();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opt.glide) o.frequency.exponentialRampToValueAtTime(opt.glide, t0 + dur);
    if (opt.detune) o.detune.value = opt.detune;
    const g = ctx.createGain();
    const a = opt.attack || 0.005, v = opt.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (opt.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opt.lp; o.connect(f); node = f; }
    node.connect(g);
    g.connect(opt.bus || sfxBus);
    if (opt.send) g.connect(delay);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  function noiseHit(t0, dur, freq, vol, type, sweepTo) {
    const s = noiseSrc(false);
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t0, Math.random() * 1.5, dur + 0.1);
  }

  // called every frame
  A.update = function (dt) {
    if (!A.ready) return;
    const env = LM.env, now = ctx.currentTime;
    rainGain.gain.setTargetAtTime(env.rain * 0.22, now, 0.5);
    windGain.gain.setTargetAtTime(0.03 + env.rain * 0.05 + env.fog * 0.03, now, 0.8);
    const night = env.c.night || 0;
    // pad chords
    if (now > nextChordAt - 0.05) {
      const ch = CHORDS[chordIdx % CHORDS.length];
      chordIdx++;
      const dur = 7.5;
      for (const m of ch) {
        const f = mtof(m - (night > 0.5 ? 12 : 0) + 12);
        tone(f, nextChordAt, dur, { type: 'triangle', attack: 2.2, vol: 0.035, lp: 1400, bus: musicBus, detune: -6 });
        tone(f, nextChordAt, dur, { type: 'sine', attack: 2.6, vol: 0.03, bus: musicBus, detune: 7 });
      }
      tone(mtof(ch[0] - 12), nextChordAt, dur, { type: 'sine', attack: 1.5, vol: 0.05, bus: musicBus });
      nextChordAt += 6.4;
    }
    // sparse pentatonic melody (music box / harp)
    if (now > nextNoteAt) {
      noteStep += Math.random() < 0.5 ? 1 : -1 + (Math.random() < 0.3 ? 2 : 0);
      noteStep = LM.clamp(noteStep, -2, 9);
      const oct = Math.floor(noteStep / 5), deg = ((noteStep % 5) + 5) % 5;
      const m = 72 + oct * 12 + SCALE[deg] - (night > 0.5 ? 0 : 0);
      if (Math.random() < 0.8) {
        tone(mtof(m), now + 0.02, 1.8, { type: 'sine', vol: 0.05, attack: 0.004, bus: musicBus, send: true });
        tone(mtof(m) * 2, now + 0.02, 0.8, { type: 'sine', vol: 0.012, attack: 0.002, bus: musicBus });
      }
      nextNoteAt = now + [0.4, 0.8, 0.8, 1.2, 1.6][Math.floor(Math.random() * 5)];
    }
    // crickets at night
    if (night > 0.4 && env.rain < 0.5 && now > nextCricket) {
      for (let i = 0; i < 3; i++) tone(4300 + Math.random() * 200, now + i * 0.06, 0.04, { vol: 0.012 * night, bus: ambBus });
      nextCricket = now + 0.6 + Math.random() * 1.8;
    }
  };

  // ---- SFX -----------------------------------------------------------------
  A.sfx = function (name, p) {
    if (!A.ready) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'ui': tone(880, t, 0.08, { vol: 0.08, type: 'triangle' }); tone(1320, t + 0.04, 0.1, { vol: 0.05, type: 'triangle' }); break;
      case 'open': tone(660, t, 0.12, { vol: 0.07, type: 'triangle' }); tone(990, t + 0.06, 0.18, { vol: 0.06, type: 'triangle' }); break;
      case 'close': tone(990, t, 0.1, { vol: 0.06, type: 'triangle' }); tone(660, t + 0.05, 0.14, { vol: 0.05, type: 'triangle' }); break;
      case 'charge': tone(300 + (p || 0) * 500, t, 0.05, { vol: 0.025, type: 'square', lp: 1200 }); break;
      case 'cast': noiseHit(t, 0.35, 600, 0.25, 'bandpass', 3000); tone(500, t, 0.25, { vol: 0.03, glide: 1200 }); break;
      case 'plop': noiseHit(t, 0.18, 900, 0.3, 'lowpass', 200); tone(380, t, 0.12, { vol: 0.08, glide: 160 }); break;
      case 'nibble': tone(240, t, 0.06, { vol: 0.05, glide: 180 }); break;
      case 'bite': tone(520, t, 0.1, { vol: 0.12, type: 'square', lp: 2000 }); tone(780, t + 0.08, 0.16, { vol: 0.1, type: 'square', lp: 2400 }); noiseHit(t, 0.3, 1200, 0.35, 'lowpass', 300); break;
      case 'hook': noiseHit(t, 0.25, 2000, 0.3, 'bandpass', 500); tone(200, t, 0.2, { vol: 0.12, glide: 90, type: 'triangle' }); break;
      case 'reel': tone(1800 + Math.random() * 200, t, 0.02, { vol: 0.02, type: 'square', lp: 3000 }); break;
      case 'warn': tone(1100, t, 0.07, { vol: 0.05, type: 'square', lp: 2000 }); break;
      case 'tele': tone(700, t, 0.1, { vol: 0.06, type: 'triangle', glide: 1100 }); break;
      case 'jump': noiseHit(t, 0.4, 1500, 0.35, 'lowpass', 300); break;
      case 'just': tone(1046, t, 0.12, { vol: 0.08, type: 'triangle' }); tone(1568, t + 0.06, 0.2, { vol: 0.07, type: 'triangle', send: true }); break;
      case 'snap': tone(300, t, 0.4, { vol: 0.15, type: 'sawtooth', glide: 60, lp: 1500 }); noiseHit(t, 0.2, 3000, 0.2, 'highpass'); break;
      case 'escape': tone(440, t, 0.3, { vol: 0.07, type: 'triangle', glide: 220 }); break;
      case 'catch': {
        const seq = [72, 76, 79, 84, 88];
        seq.forEach((m, i) => tone(mtof(m), t + i * 0.08, 0.6, { vol: 0.08, type: 'triangle', send: true }));
        noiseHit(t, 0.6, 1500, 0.3, 'lowpass', 200);
        break;
      }
      case 'new': {
        const seq = [79, 84, 88, 91, 96];
        seq.forEach((m, i) => tone(mtof(m), t + 0.4 + i * 0.1, 0.9, { vol: 0.06, type: 'sine', send: true }));
        break;
      }
      case 'buy': [76, 83, 88].forEach((m, i) => tone(mtof(m), t + i * 0.07, 0.5, { vol: 0.07, type: 'triangle', send: true })); break;
      case 'deny': tone(200, t, 0.15, { vol: 0.07, type: 'square', lp: 800 }); break;
      case 'rest': [60, 64, 67, 72].forEach((m, i) => tone(mtof(m), t + i * 0.25, 1.6, { vol: 0.05, type: 'sine', send: true })); break;
      case 'legend': {
        [48, 55, 60, 64, 67, 72, 76, 79].forEach((m, i) => tone(mtof(m), t + i * 0.18, 3.0, { vol: 0.05, type: 'triangle', attack: 0.3, send: true }));
        tone(mtof(36), t, 4, { vol: 0.1, type: 'sine', attack: 1 });
        break;
      }
      case 'thunder': noiseHit(t, 2.2, 300, 0.6, 'lowpass', 60); break;
    }
  };

  LM.audio = A;
})(window.LM);
