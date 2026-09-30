// Presentation sound slots.
// Every slot plays assets/audio/fx/<name>.mp3 when that file exists and falls
// back to a small Web Audio synth otherwise, so a synth placeholder is
// replaced just by dropping a file with the same name into assets/audio/fx/.
// "Hot" slots (the near-certain variants) fall back to their normal slot's
// file before the synth, so they sound right until their own file arrives.
(() => {
  "use strict";

  const FX_DIR = "./assets/audio/fx/";
  const SLOTS = {
    punchSmall: {},
    punchLarge: {},
    pushCharge: {},
    pushChargeHot: { fallback: "pushCharge" },
    decideButton: {},
    decideButtonHot: { fallback: "decideButton" },
    // Shipped file that must always play (no synth stand-in).
    pushKankutsu: { required: true },
    glassBreak: {},
    glassBreak2: {},
    revival: {},
    czBuild: {},
    noticeStep: {},
    noticeHot: {},
    noticePremium: {},
    stationBoard: {},
    pushButtonLit: {},
    pushButtonReveal: {},
    blackout: {},
    rouletteTick: { gain: 0.6 },
    rouletteStop: {},
    lastLamp: {},
    premiumHit: {},
    reverseFreeze: {},
    allRotation: {},
    salesTick: { gain: 0.7 },
    salesRegister: {},
    floorChime: {},
    floorCreak: {},
    floorThud: {},
  };

  const files = new Map();   // name -> HTMLAudioElement (only when the file loaded)
  const probing = new Map(); // name -> Promise<boolean>
  const active = new Set();
  let host = { context: () => null, volume: () => 0.8, enabled: () => true };
  let ownContext = null;

  function probe(name) {
    if (probing.has(name)) return probing.get(name);
    const promise = new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "auto";
      const done = (ok) => {
        audio.removeEventListener("canplaythrough", onOk);
        audio.removeEventListener("loadedmetadata", onOk);
        audio.removeEventListener("loadeddata", onOk);
        audio.removeEventListener("error", onError);
        if (ok) files.set(name, audio);
        resolve(ok);
      };
      const onOk = () => done(true);
      const onError = () => done(false);
      // Many media elements on the page can downgrade preload to metadata,
      // so metadata is enough to know the file exists.
      audio.addEventListener("canplaythrough", onOk);
      audio.addEventListener("loadedmetadata", onOk);
      audio.addEventListener("loadeddata", onOk);
      audio.addEventListener("error", onError);
      // No timeout: on a busy page the request can queue behind the BGM, and
      // a missing file always ends in "error".
      audio.src = `${FX_DIR}${name}.mp3`;
    });
    probing.set(name, promise);
    return promise;
  }

  function context() {
    const shared = host.context?.();
    if (shared) return shared;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ownContext ||= new AudioCtx();
    return ownContext;
  }

  function track(handle) {
    active.add(handle);
    handle.ended.then(() => active.delete(handle));
    return handle;
  }

  function playFile(name, gainScale) {
    const base = files.get(name);
    const sound = base.cloneNode(true);
    sound.volume = Math.max(0, Math.min(1, host.volume() * gainScale));
    let resolveEnded;
    const ended = new Promise((resolve) => { resolveEnded = resolve; });
    const finish = () => resolveEnded();
    sound.addEventListener("ended", finish, { once: true });
    sound.addEventListener("error", finish, { once: true });
    sound.play()?.catch?.(finish);
    return track({
      name,
      source: "file",
      get duration() { return Number.isFinite(sound.duration) ? sound.duration : base.duration || 0; },
      ended,
      stop() { sound.pause(); finish(); },
    });
  }

  // ---- Synth kit ---------------------------------------------------------
  let noiseBuffer = null;
  function noise(ctx) {
    if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }
  function env(ctx, out, t, attack, peak, decay, sustainTo = 0.0001) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustainTo), t + attack + decay);
    g.connect(out);
    return g;
  }
  function tone(ctx, out, { type = "sine", f0, f1 = f0, t, dur, peak = 0.3, attack = 0.004, detune = 0 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(env(ctx, out, t, attack, peak, dur));
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }
  function hiss(ctx, out, { t, dur, peak = 0.3, attack = 0.002, type = "bandpass", freq = 2000, freq1 = freq, q = 0.8 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (freq1 !== freq) filter.frequency.exponentialRampToValueAtTime(freq1, t + attack + dur);
    src.connect(filter);
    filter.connect(env(ctx, out, t, attack, peak, dur));
    src.start(t, Math.random());
    src.stop(t + attack + dur + 0.05);
    return src;
  }
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);

  // Each recipe schedules its voices on `out` from time t and returns its length (s).
  const RECIPES = {
    punchSmall(ctx, out, t) {
      tone(ctx, out, { f0: 150, f1: 55, t, dur: 0.16, peak: 0.9 });
      hiss(ctx, out, { t, dur: 0.06, peak: 0.5, type: "lowpass", freq: 2400 });
      return 0.25;
    },
    punchLarge(ctx, out, t) {
      tone(ctx, out, { f0: 120, f1: 36, t, dur: 0.42, peak: 1 });
      tone(ctx, out, { type: "triangle", f0: 240, f1: 60, t, dur: 0.2, peak: 0.5 });
      hiss(ctx, out, { t, dur: 0.12, peak: 0.8, type: "lowpass", freq: 3200, freq1: 600 });
      hiss(ctx, out, { t: t + 0.02, dur: 0.5, peak: 0.18, type: "bandpass", freq: 900, freq1: 200 });
      return 0.6;
    },
    pushCharge(ctx, out, t, o) {
      const dur = o.hot ? 2.8 : 2.4;
      const o1 = tone(ctx, out, { type: "sawtooth", f0: 90, f1: o.hot ? 1300 : 880, t, dur, peak: 0.16, attack: 0.3 });
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.setValueAtTime(6, t);
      lfo.frequency.linearRampToValueAtTime(o.hot ? 34 : 22, t + dur);
      depth.gain.value = 30;
      lfo.connect(depth).connect(o1.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.1);
      hiss(ctx, out, { t, dur, peak: 0.22, attack: dur * 0.9, type: "highpass", freq: 400, freq1: 6000, q: 0.5 });
      if (o.hot) tone(ctx, out, { type: "square", f0: 45, f1: 180, t, dur, peak: 0.1, attack: 0.5 });
      return dur + 0.05;
    },
    pushChargeHot(ctx, out, t, o) { return RECIPES.pushCharge(ctx, out, t, { ...o, hot: true }); },
    decideButton(ctx, out, t) {
      tone(ctx, out, { type: "square", f0: midi(84), t, dur: 0.07, peak: 0.16 });
      tone(ctx, out, { type: "square", f0: midi(91), t: t + 0.07, dur: 0.28, peak: 0.16 });
      tone(ctx, out, { f0: midi(103), t: t + 0.07, dur: 0.4, peak: 0.1 });
      return 0.5;
    },
    decideButtonHot(ctx, out, t) {
      [84, 88, 91, 96].forEach((n, i) => tone(ctx, out, { type: "square", f0: midi(n), t: t + i * 0.05, dur: 0.5, peak: 0.12 }));
      tone(ctx, out, { f0: 60, f1: 30, t, dur: 0.5, peak: 0.8 });
      hiss(ctx, out, { t, dur: 0.9, peak: 0.2, type: "highpass", freq: 5000 });
      return 1;
    },
    glassBreak(ctx, out, t, o) {
      const big = o.big ? 1.4 : 1;
      hiss(ctx, out, { t, dur: 0.09, peak: 0.9, type: "highpass", freq: 2500 });
      tone(ctx, out, { f0: 90, f1: 40, t, dur: 0.18, peak: 0.6 * big });
      for (let i = 0; i < (o.big ? 22 : 14); i += 1) {
        const at = t + 0.01 + Math.random() ** 1.6 * 0.7 * big;
        tone(ctx, out, { f0: 2400 + Math.random() * 5200, t: at, dur: 0.05 + Math.random() * 0.18, peak: 0.05 + Math.random() * 0.08, attack: 0.001 });
      }
      hiss(ctx, out, { t: t + 0.05, dur: 0.6 * big, peak: 0.16, type: "bandpass", freq: 6000, freq1: 3000, q: 2 });
      return 0.9 * big;
    },
    glassBreak2(ctx, out, t, o) { return RECIPES.glassBreak(ctx, out, t, { ...o, big: true }); },
    revival(ctx, out, t) {
      [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(ctx, out, { type: "sawtooth", f0: midi(n), t: t + i * 0.045, dur: 0.9, peak: 0.07 }));
      tone(ctx, out, { f0: midi(36), t, dur: 1.2, peak: 0.5 });
      hiss(ctx, out, { t, dur: 1.4, peak: 0.12, type: "highpass", freq: 7000 });
      return 1.4;
    },
    czBuild(ctx, out, t, o) {
      const dur = o.duration || 1.6;
      hiss(ctx, out, { t, dur, peak: 0.24, attack: dur * 0.95, type: "bandpass", freq: 300, freq1: 5000, q: 1.2 });
      let at = t;
      for (let gap = 0.24; at < t + dur; gap *= 0.82) {
        tone(ctx, out, { type: "square", f0: 1800, t: at, dur: 0.02, peak: 0.07 });
        at += Math.max(0.03, gap);
      }
      return dur;
    },
    noticeStep(ctx, out, t, o) {
      const level = Math.max(0, Math.min(6, o.level || 0));
      const root = 72 + [0, 2, 4, 5, 7, 9, 12][level];
      tone(ctx, out, { type: "triangle", f0: midi(root), t, dur: 0.35, peak: 0.22 });
      tone(ctx, out, { f0: midi(root + 12), t, dur: 0.25, peak: 0.08 });
      return 0.4;
    },
    noticeHot(ctx, out, t) {
      [67, 71, 74, 79].forEach((n) => tone(ctx, out, { type: "sawtooth", f0: midi(n), t, dur: 0.5, peak: 0.07 }));
      tone(ctx, out, { f0: 70, f1: 40, t, dur: 0.35, peak: 0.7 });
      return 0.6;
    },
    noticePremium(ctx, out, t) {
      for (let i = 0; i < 12; i += 1) tone(ctx, out, { f0: midi(84 + i * 2), t: t + i * 0.035, dur: 0.6, peak: 0.07 });
      hiss(ctx, out, { t, dur: 1, peak: 0.1, type: "highpass", freq: 8000 });
      return 1.1;
    },
    stationBoard(ctx, out, t) {
      tone(ctx, out, { f0: midi(76), t, dur: 0.55, peak: 0.2 });
      tone(ctx, out, { f0: midi(72), t: t + 0.32, dur: 0.8, peak: 0.2 });
      for (let i = 0; i < 6; i += 1) hiss(ctx, out, { t: t + i * 0.03, dur: 0.012, peak: 0.1, type: "highpass", freq: 3000 });
      return 1.2;
    },
    pushButtonLit(ctx, out, t) {
      tone(ctx, out, { type: "square", f0: midi(79), t, dur: 0.06, peak: 0.1 });
      tone(ctx, out, { type: "square", f0: midi(79), t: t + 0.12, dur: 0.06, peak: 0.1 });
      tone(ctx, out, { f0: 110, t, dur: 0.6, peak: 0.12, attack: 0.05 });
      return 0.7;
    },
    pushButtonReveal(ctx, out, t, o) {
      const tier = Math.max(0, Math.min(6, o.level || 0));
      tone(ctx, out, { f0: 80, f1: 38, t, dur: 0.3, peak: 0.7 });
      [0, 4, 7].forEach((step) => tone(ctx, out, { type: "sawtooth", f0: midi(64 + tier * 2 + step), t, dur: 0.5, peak: 0.06 }));
      return 0.6;
    },
    blackout(ctx, out, t) {
      tone(ctx, out, { f0: 70, f1: 28, t, dur: 0.7, peak: 0.9 });
      tone(ctx, out, { type: "sawtooth", f0: 900, f1: 60, t, dur: 0.25, peak: 0.08 });
      return 0.8;
    },
    rouletteTick(ctx, out, t) {
      hiss(ctx, out, { t, dur: 0.018, peak: 0.35, type: "bandpass", freq: 3200, q: 4 });
      return 0.05;
    },
    rouletteStop(ctx, out, t) {
      tone(ctx, out, { f0: 160, f1: 70, t, dur: 0.18, peak: 0.7 });
      hiss(ctx, out, { t, dur: 0.05, peak: 0.3, type: "lowpass", freq: 1800 });
      return 0.25;
    },
    lastLamp(ctx, out, t) {
      tone(ctx, out, { f0: 62, f1: 44, t, dur: 0.14, peak: 0.8 });
      tone(ctx, out, { f0: 58, f1: 40, t: t + 0.2, dur: 0.18, peak: 0.6 });
      return 0.45;
    },
    reverseFreeze(ctx, out, t) {
      // Reverse swell: noise and a detuned drone rising into a cut.
      hiss(ctx, out, { t, dur: 2.4, peak: 0.28, attack: 2.3, type: "bandpass", freq: 6000, freq1: 400, q: 0.9 });
      tone(ctx, out, { type: "sawtooth", f0: 55, f1: 110, t, dur: 2.5, peak: 0.12, attack: 2.2 });
      tone(ctx, out, { type: "sawtooth", f0: 55.6, f1: 111, t, dur: 2.5, peak: 0.12, attack: 2.2 });
      return 2.6;
    },
    allRotation(ctx, out, t) {
      // A rising, accelerating arpeggio under a bright shimmer.
      let at = t, gap = 0.14, step = 0;
      while (at < t + 3.1) {
        tone(ctx, out, { type: "square", f0: midi(72 + [0, 4, 7, 12][step % 4] + Math.floor(step / 8) * 2), t: at, dur: 0.1, peak: 0.07 });
        at += gap; gap = Math.max(0.05, gap * 0.95); step += 1;
      }
      hiss(ctx, out, { t, dur: 3.2, peak: 0.12, attack: 3, type: "highpass", freq: 6000 });
      return 3.3;
    },
    salesTick(ctx, out, t) {
      hiss(ctx, out, { t, dur: 0.015, peak: 0.3, type: "bandpass", freq: 2600, q: 5 });
      return 0.04;
    },
    salesRegister(ctx, out, t, o) {
      // "Cha-ching": a bell pair, brighter and fuller the hotter the count.
      const level = Math.max(0, Math.min(6, o.level || 0));
      tone(ctx, out, { type: "triangle", f0: midi(88 + level), t, dur: 0.25, peak: 0.18 });
      tone(ctx, out, { type: "triangle", f0: midi(95 + level), t: t + 0.08, dur: 0.6, peak: 0.16 + level * 0.02 });
      hiss(ctx, out, { t, dur: 0.08, peak: 0.2, type: "highpass", freq: 5000 });
      if (level >= 4) tone(ctx, out, { f0: 70, f1: 40, t, dur: 0.3, peak: 0.5 });
      return 0.8;
    },
    floorChime(ctx, out, t) {
      // Public-address chime: four descending notes.
      [79, 76, 72, 67].forEach((n, i) => tone(ctx, out, { f0: midi(n), t: t + i * 0.22, dur: 0.5, peak: 0.16 }));
      return 1.3;
    },
    floorCreak(ctx, out, t, o) {
      const level = Math.max(0, Math.min(6, o.level || 0));
      const o1 = tone(ctx, out, { type: "sawtooth", f0: 120 + level * 8, f1: 70, t, dur: 0.5 + level * 0.08, peak: 0.08 + level * 0.02, attack: 0.05 });
      o1.detune.linearRampToValueAtTime(-300, t + 0.4);
      hiss(ctx, out, { t, dur: 0.5, peak: 0.08, type: "bandpass", freq: 600, q: 6 });
      return 0.7;
    },
    floorThud(ctx, out, t, o) {
      const level = Math.max(0, Math.min(6, o.level || 0));
      tone(ctx, out, { f0: 60, f1: 28, t, dur: 0.5 + level * 0.1, peak: 0.6 + level * 0.07 });
      hiss(ctx, out, { t, dur: 0.4 + level * 0.1, peak: 0.25, type: "lowpass", freq: 900, freq1: 200 });
      return 0.9;
    },
    premiumHit(ctx, out, t) {
      [72, 76, 79, 84, 88].forEach((n, i) => tone(ctx, out, { type: "triangle", f0: midi(n), t: t + i * 0.06, dur: 1.2, peak: 0.12 }));
      tone(ctx, out, { f0: 50, f1: 30, t, dur: 0.6, peak: 0.8 });
      hiss(ctx, out, { t, dur: 1.4, peak: 0.12, type: "highpass", freq: 9000 });
      return 1.5;
    },
  };

  function playSynth(name, gainScale, options) {
    const ctx = context();
    const recipe = RECIPES[name];
    if (!ctx || !recipe) return null;
    ctx.resume?.().catch?.(() => {});
    const out = ctx.createGain();
    out.gain.value = Math.max(0, Math.min(1.5, host.volume() * gainScale));
    out.connect(ctx.destination);
    const t = ctx.currentTime + 0.01;
    const length = recipe(ctx, out, t, options || {});
    let resolveEnded;
    const ended = new Promise((resolve) => { resolveEnded = resolve; });
    const timer = window.setTimeout(() => { out.disconnect(); resolveEnded(); }, (length + 0.1) * 1000);
    return track({
      name,
      source: "synth",
      duration: length,
      ended,
      stop() {
        window.clearTimeout(timer);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        window.setTimeout(() => out.disconnect(), 120);
        resolveEnded();
      },
    });
  }

  function silent(name) {
    return { name, source: "none", duration: 0, ended: Promise.resolve(), stop() {} };
  }

  const api = {
    slots: Object.keys(SLOTS),
    configure(options = {}) { host = { ...host, ...options }; },
    preload() { api.slots.forEach(probe); },
    // Returns a handle: { source: "file"|"synth"|"none", duration, ended, stop() }.
    play(name, options = {}) {
      const slot = SLOTS[name];
      if (!slot || !host.enabled()) return silent(name);
      const gain = (slot.gain ?? 1) * (options.gain ?? 1);
      if (files.has(name)) return playFile(name, gain);
      if (slot.required) {
        // Not probed yet (e.g. still queued behind the BGM): play it directly.
        const audio = new Audio(`${FX_DIR}${name}.mp3`);
        files.set(name, audio);
        return playFile(name, gain);
      }
      if (slot.fallback && files.has(slot.fallback)) return playFile(slot.fallback, gain);
      return playSynth(name, gain, options) || silent(name);
    },
    source(name) {
      const slot = SLOTS[name];
      if (!slot) return "none";
      return files.has(name) ? "file" : slot.fallback && files.has(slot.fallback) ? "fallback-file" : "synth";
    },
    stopAll() { [...active].forEach((handle) => handle.stop()); active.clear(); },
  };
  window.ShibakuFx = api;
  api.preload();
})();
