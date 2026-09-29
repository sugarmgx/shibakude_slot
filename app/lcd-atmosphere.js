(() => {
  "use strict";

  // LCD background depth: far flow particles, mid haze / light shafts,
  // near bokeh. Everything reacts to the BGM that is already audible and to
  // board events the player just made (lever, stops, bell payout). No game
  // state is read beyond the presentation kind and the visible stage.
  const FLOW_COUNT = 12000;
  const BOKEH_COUNT = 56;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const seeded = (index, salt = 0) => {
    const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  class LcdMusicPulse {
    constructor() {
      this.cache = new Map();
      this.kick = 0;
      this.level = 0;
      this.active = 0;
      this.average = 0;
    }

    curve(track) {
      if (!this.cache.has(track)) {
        const data = window.ShibakuBgmPulse?.[track];
        const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
        this.cache.set(track, data ? { rate: data.rate, low: decode(data.low), level: decode(data.level) } : null);
      }
      return this.cache.get(track);
    }

    static sample(values, rate, time) {
      const x = Math.max(0, time * rate), index = Math.floor(x), fraction = x - index;
      const a = values[Math.min(values.length - 1, index)], b = values[Math.min(values.length - 1, index + 1)];
      return (a + (b - a) * fraction) / 230;
    }

    update(dt) {
      let clock = null;
      try { clock = window.ShibakuMusicClock?.() || null; } catch (_) {}
      const data = clock && this.curve(clock.track);
      this.active += ((data ? 1 : 0) - this.active) * Math.min(1, dt * 3);
      if (!data) {
        this.kick = Math.max(0, this.kick - dt * 6);
        this.level += (0 - this.level) * Math.min(1, dt * 2);
        return this;
      }
      const low = LcdMusicPulse.sample(data.low, data.rate, clock.time);
      const level = LcdMusicPulse.sample(data.level, data.rate, clock.time);
      this.average += (low - this.average) * Math.min(1, dt * 1.3);
      const onset = clamp((low - this.average * 1.08) * 3.2, 0, 1);
      this.kick = Math.max(onset, this.kick - dt * 5.5);
      this.level += (level - this.level) * Math.min(1, dt * 10);
      return this;
    }
  }

  // Per-scene light design. Normal stages differ by colour temperature so
  // each reads at a glance; bonus / boost keep the tunnel travel direction.
  const PROFILES = {
    station: { fog: 0.5, fogColor: 0x6b8aa0, beams: 0.5, beamColor: 0xd6ecff, beamSwing: 0.04, beamSlant: 0.16, train: 1, flicker: 1,
      flowA: 0xbfd8ea, flowB: 0x5d84a8, flow: 0.5, speed: 1.3, swirl: 0, bokeh: 0.5, bokehColor: 0xbfe0ff, contrast: 0.2, tint: [0.97, 1.0, 1.04] },
    hall: { fog: 0.7, fogColor: 0x8a5fa8, beams: 1.0, beamColor: 0xff86d8, beamSwing: 0.32, beamSlant: 0.0, train: 0, flicker: 0,
      flowA: 0xff9ad8, flowB: 0x72d4ff, flow: 0.55, speed: 0.8, swirl: 0, bokeh: 0.7, bokehColor: 0xffb3e6, contrast: 0.16, tint: [1.02, 0.98, 1.04] },
    lounge: { fog: 0.5, fogColor: 0x9a6c3e, beams: 0.6, beamColor: 0xffc98a, beamSwing: 0.03, beamSlant: 0.06, train: 0, flicker: 0,
      flowA: 0xffd59c, flowB: 0xa7703e, flow: 0.4, speed: 0.45, swirl: 0, bokeh: 0.95, bokehColor: 0xffc47a, contrast: 0.14, tint: [1.06, 1.0, 0.92] },
    challenge: { fog: 0.5, fogColor: null, beams: 0.3, beamColor: null, beamSwing: 0.08, beamSlant: 0.1, train: 0, flicker: 0,
      flowA: null, flowB: null, flow: 0.55, speed: 1.8, swirl: 0.15, bokeh: 0.45, bokehColor: null, contrast: 0.14, tint: [1, 1, 1] },
    bonus: { fog: 0.3, fogColor: null, beams: 0.18, beamColor: null, beamSwing: 0.1, beamSlant: 0, train: 0, flicker: 0,
      flowA: null, flowB: 0xffffff, flow: 0.72, speed: 5.5, swirl: 1, bokeh: 0.55, bokehColor: null, contrast: 0.12, tint: [1, 1, 1] },
    boost: { fog: 0.3, fogColor: null, beams: 0.14, beamColor: null, beamSwing: 0.06, beamSlant: 0, train: 0, flicker: 0,
      flowA: null, flowB: null, flow: 0.7, speed: 7.5, swirl: 0.4, bokeh: 0.45, bokehColor: null, contrast: 0.12, tint: [1, 1, 1] },
  };
  const NUMERIC = ["fog", "beams", "beamSwing", "beamSlant", "train", "flicker", "flow", "speed", "swirl", "bokeh", "contrast"];

  class LcdAtmosphere {
    constructor(owner) {
      this.owner = owner;
      this.T = owner.THREE;
      const T = this.T;
      this.group = new T.Group();
      owner.scene.add(this.group);
      this.state = {
        fogColor: new T.Color(), beamColor: new T.Color(), flowA: new T.Color(), flowB: new T.Color(), bokehColor: new T.Color(),
        tint: new T.Vector3(1, 1, 1),
      };
      NUMERIC.forEach(key => { this.state[key] = PROFILES.station[key]; });
      this.scratch = new T.Color();
      this.travel = 0;
      this.surge = 0;
      this.spark = 0;
      this.flickerValue = 1;
      this.flickerUntil = 0;
      this.nextTrainAt = 4;
      this.trainStart = -99;
      this.createFlow();
      this.createHaze();
      this.createBokeh();
      for (const key of ["fogColor", "beamColor", "flowA", "flowB", "bokehColor"]) this.state[key].set(PROFILES.station[key]);
      this.state.tint.set(...PROFILES.station.tint);
    }

    createFlow() {
      const T = this.T, owner = this.owner;
      const seeds = new Float32Array(FLOW_COUNT * 4);
      for (let index = 0; index < FLOW_COUNT; index += 1) {
        for (let k = 0; k < 4; k += 1) seeds[index * 4 + k] = seeded(index, 11 + k);
      }
      const geometry = owner.track(new T.BufferGeometry());
      geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(FLOW_COUNT * 3), 3));
      geometry.setAttribute("aSeed", new T.BufferAttribute(seeds, 4));
      this.flowMaterial = owner.trackMaterial(new T.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uTravel: { value: 0 }, uSwirl: { value: 0 }, uKick: { value: 0 }, uSpark: { value: 0 },
          uPixelRatio: { value: 1 }, uCamPos: { value: new T.Vector3() }, uOpacity: { value: 0.5 },
          uColorA: { value: new T.Color() }, uColorB: { value: new T.Color() },
        },
        vertexShader: `
          attribute vec4 aSeed;
          uniform float uTime;
          uniform float uTravel;
          uniform float uSwirl;
          uniform float uKick;
          uniform float uSpark;
          uniform float uPixelRatio;
          uniform vec3 uCamPos;
          varying float vAlpha;
          varying float vTint;
          void main() {
            // Weighted to the outer thirds so the very wide panel is never empty at the sides.
            float side = aSeed.x < 0.5 ? -1.0 : 1.0;
            float spread = mix(1.2, 17.0, pow(fract(aSeed.x * 2.0), 0.65));
            vec3 p = vec3(side * spread, (aSeed.y - 0.5) * 11.0, 0.0);
            p.z = 6.0 - mod(aSeed.z * 64.0 + uTravel * (0.75 + aSeed.w * 0.5), 64.0);
            float t = uTime * 0.35;
            p.x += sin(p.y * 0.42 + t + aSeed.w * 6.283) * 0.9 + sin(p.z * 0.11 - t * 0.7) * 0.6;
            p.y += cos(p.x * 0.21 - t * 0.8 + aSeed.w * 3.1) * 0.7 + sin(p.z * 0.09 + t) * 0.4;
            float angle = uSwirl * (p.z * 0.05 + uTime * 0.3);
            p.xy = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xy;
            p.xy *= mix(1.0, 0.45 + 0.55 * smoothstep(-58.0, 2.0, p.z), uSwirl);
            p += vec3(uCamPos.x * 0.6, uCamPos.y * 0.6, uCamPos.z);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float depth = max(0.4, -mv.z);
            float size = (0.55 + aSeed.w * 1.1) * (1.0 + uKick * 0.45 + uSpark * 0.8);
            gl_PointSize = clamp(size * uPixelRatio * 26.0 / depth, 0.6, 11.0);
            gl_Position = projectionMatrix * mv;
            vAlpha = smoothstep(0.9, 3.8, depth) * (1.0 - smoothstep(34.0, 60.0, depth)) * (0.3 + 0.7 * aSeed.w);
            vTint = aSeed.y;
          }
        `,
        fragmentShader: `
          precision highp float;
          uniform float uOpacity;
          uniform float uKick;
          uniform float uSpark;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          varying float vAlpha;
          varying float vTint;
          void main() {
            float radius = length(gl_PointCoord - 0.5);
            float shape = 1.0 - smoothstep(0.12, 0.5, radius);
            float core = 1.0 - smoothstep(0.0, 0.14, radius);
            vec3 color = mix(uColorB, uColorA, step(0.35, vTint)) * (0.7 + core * 0.8);
            gl_FragColor = vec4(color, shape * vAlpha * uOpacity * (1.0 + uKick * 0.6 + uSpark * 1.2));
          }
        `,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }));
      this.flow = new T.Points(geometry, this.flowMaterial);
      this.flow.frustumCulled = false;
      this.flow.renderOrder = 2;
      this.group.add(this.flow);
    }

    createHaze() {
      const T = this.T, owner = this.owner;
      this.hazeMaterial = owner.trackMaterial(new T.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uHalf: { value: new T.Vector2(1, 1) }, uDepth: { value: 16 }, uAspect: { value: 4 },
          uFog: { value: 0 }, uFogColor: { value: new T.Color() }, uBeams: { value: 0 }, uBeamColor: { value: new T.Color() },
          uSwing: { value: 0 }, uSlant: { value: 0 }, uTrain: { value: 0 }, uTrainPos: { value: -9 }, uFlicker: { value: 1 },
          uKick: { value: 0 }, uLevel: { value: 0 }, uSpark: { value: 0 },
        },
        vertexShader: `
          uniform vec2 uHalf;
          uniform float uDepth;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * vec4(position.xy * uHalf, -uDepth, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform float uTime;
          uniform float uAspect;
          uniform float uFog;
          uniform vec3 uFogColor;
          uniform float uBeams;
          uniform vec3 uBeamColor;
          uniform float uSwing;
          uniform float uSlant;
          uniform float uTrain;
          uniform float uTrainPos;
          uniform float uFlicker;
          uniform float uKick;
          uniform float uLevel;
          uniform float uSpark;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          float fbm(vec2 p) {
            float value = 0.0, amplitude = 0.5;
            for (int i = 0; i < 4; i++) { value += noise(p) * amplitude; p = p * 2.03 + vec2(17.1, 9.2); amplitude *= 0.5; }
            return value;
          }
          void main() {
            vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
            float fog = fbm(p * vec2(0.9, 2.4) + vec2(uTime * 0.035, uTime * 0.01));
            fog = smoothstep(0.32, 0.92, fog) * (0.55 + 0.45 * (1.0 - abs(vUv.y - 0.42) * 1.8));
            vec3 color = uFogColor * fog * uFog * 0.3;
            float beams = 0.0;
            for (int i = 0; i < 5; i++) {
              float fi = float(i);
              float origin = (fi - 2.0) * uAspect * 0.2 + sin(uTime * 0.11 + fi * 1.7) * 0.08;
              float slant = uSlant + sin(uTime * 0.37 + fi * 2.1) * uSwing;
              vec2 q = p - vec2(origin, 0.62);
              float along = -q.y;
              float across = q.x + q.y * slant;
              float width = 0.025 + along * 0.075;
              float beam = exp(-across * across / (width * width)) * smoothstep(0.0, 0.25, along) * (1.0 - smoothstep(0.55, 1.15, along));
              beams += beam * (0.55 + 0.45 * sin(uTime * 0.6 + fi * 2.3)) * (0.75 + fog * 0.5);
            }
            color += uBeamColor * beams * uBeams * 0.55;
            float trainCore = exp(-pow((p.x - uTrainPos) / 0.45, 2.0)) * exp(-pow((vUv.y - 0.36) / 0.07, 2.0));
            float trainWash = exp(-pow((p.x - uTrainPos) / 1.4, 2.0)) * 0.12;
            color += vec3(0.85, 0.95, 1.0) * (trainCore * 0.9 + trainWash) * uTrain;
            color *= uFlicker * (1.0 + uKick * 0.55 + uLevel * 0.2 + uSpark * 0.4);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }));
      this.haze = new T.Mesh(owner.track(new T.PlaneGeometry(2, 2)), this.hazeMaterial);
      this.haze.frustumCulled = false;
      this.haze.renderOrder = 9;
      this.group.add(this.haze);
    }

    createBokeh() {
      const T = this.T, owner = this.owner;
      const seeds = new Float32Array(BOKEH_COUNT * 4);
      for (let index = 0; index < BOKEH_COUNT; index += 1) {
        for (let k = 0; k < 4; k += 1) seeds[index * 4 + k] = seeded(index, 41 + k);
      }
      const geometry = owner.track(new T.BufferGeometry());
      geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(BOKEH_COUNT * 3), 3));
      geometry.setAttribute("aSeed", new T.BufferAttribute(seeds, 4));
      this.bokehMaterial = owner.trackMaterial(new T.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uTanHalf: { value: 0.47 }, uAspect: { value: 4 }, uPixelRatio: { value: 1 },
          uOpacity: { value: 0.5 }, uColor: { value: new T.Color() }, uKick: { value: 0 }, uSpark: { value: 0 }, uHeight: { value: 300 },
        },
        vertexShader: `
          attribute vec4 aSeed;
          uniform float uTime;
          uniform float uTanHalf;
          uniform float uAspect;
          uniform float uPixelRatio;
          uniform float uKick;
          uniform float uSpark;
          uniform float uHeight;
          varying float vAlpha;
          void main() {
            // View space: the near layer stays framed whatever the camera does.
            float depth = 1.6 + aSeed.z * 2.8;
            float x = fract(aSeed.x + uTime * 0.0035 * (0.4 + aSeed.w)) * 2.0 - 1.0;
            float y = (aSeed.y * 2.0 - 1.0) + sin(uTime * 0.05 + aSeed.w * 6.283) * 0.12;
            vec3 view = vec3(x * uTanHalf * depth * uAspect * 1.05, y * uTanHalf * depth, -depth);
            gl_Position = projectionMatrix * vec4(view, 1.0);
            gl_PointSize = uHeight * uPixelRatio * (0.07 + aSeed.w * 0.2) * (1.0 + uSpark * 0.25);
            vAlpha = (0.35 + 0.65 * aSeed.z) * smoothstep(1.0, 0.8, abs(x)) * (1.0 + uKick * 0.7 + uSpark * 1.5);
          }
        `,
        fragmentShader: `
          precision highp float;
          uniform float uOpacity;
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            float radius = length(gl_PointCoord - 0.5);
            float disc = 1.0 - smoothstep(0.44, 0.5, radius);
            float rim = smoothstep(0.3, 0.46, radius) * disc;
            gl_FragColor = vec4(uColor, (disc * 0.28 + rim * 0.38) * vAlpha * uOpacity * 0.16);
          }
        `,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }));
      this.bokeh = new T.Points(geometry, this.bokehMaterial);
      this.bokeh.frustumCulled = false;
      this.bokeh.renderOrder = 10;
      this.group.add(this.bokeh);
    }

    // Board events the player just caused. Visible actions only.
    board(kind) {
      if (kind === "lever") this.surge = 1;
      else if (kind === "stop") this.surge = Math.max(this.surge, 0.35);
      else if (kind === "bell") this.spark = 1;
    }

    applyProfile(profile, weight) {
      const theme = this.owner.theme, s = this.accum;
      const pick = (value, fallback) => (value === null ? fallback : this.scratch.set(value));
      NUMERIC.forEach(key => { s[key] += profile[key] * weight; });
      s.fogColor.add(this.scratch.copy(pick(profile.fogColor, theme.primary)).multiplyScalar(weight));
      s.beamColor.add(this.scratch.copy(pick(profile.beamColor, theme.accent)).multiplyScalar(weight));
      s.flowA.add(this.scratch.copy(pick(profile.flowA, theme.primary)).multiplyScalar(weight));
      s.flowB.add(this.scratch.copy(pick(profile.flowB, theme.secondary)).multiplyScalar(weight));
      s.bokehColor.add(this.scratch.copy(pick(profile.bokehColor, theme.primary)).multiplyScalar(weight));
      s.tint.x += profile.tint[0] * weight; s.tint.y += profile.tint[1] * weight; s.tint.z += profile.tint[2] * weight;
    }

    update(dt, time, music) {
      const T = this.T, owner = this.owner, camera = owner.camera;
      const weights = owner.presentationWeights;
      const stage = owner.scenery?.stage;
      const normal = stage === "同人音楽即売会" ? PROFILES.hall : stage === "クラブのラウンジ" ? PROFILES.lounge : PROFILES.station;
      if (!this.accum) this.accum = { fogColor: new T.Color(), beamColor: new T.Color(), flowA: new T.Color(), flowB: new T.Color(), bokehColor: new T.Color(), tint: new T.Vector3() };
      const s = this.accum;
      NUMERIC.forEach(key => { s[key] = 0; });
      ["fogColor", "beamColor", "flowA", "flowB", "bokehColor"].forEach(key => s[key].setRGB(0, 0, 0));
      s.tint.set(0, 0, 0);
      const total = Math.max(0.0001, weights.normal + weights.challenge + weights.bonus + weights.boost);
      this.applyProfile(normal, weights.normal / total);
      this.applyProfile(PROFILES.challenge, weights.challenge / total);
      this.applyProfile(PROFILES.bonus, weights.bonus / total);
      this.applyProfile(PROFILES.boost, weights.boost / total);
      // Stage changes glide rather than cut.
      const follow = Math.min(1, dt * 2.5);
      NUMERIC.forEach(key => { this.state[key] += (s[key] - this.state[key]) * follow; });
      ["fogColor", "beamColor", "flowA", "flowB", "bokehColor"].forEach(key => this.state[key].lerp(s[key], follow));
      this.state.tint.lerp(s.tint, follow);

      const kick = music.kick * music.active, level = music.level * music.active;
      this.surge = Math.max(0, this.surge - dt * 1.6);
      this.spark = Math.max(0, this.spark - dt * 1.8);
      this.travel += dt * (this.state.speed * (1 + kick * 0.6 + level * 0.3) + this.surge * 9);

      // Fluorescent flicker and the passing train belong to the station only.
      if (this.state.flicker > 0.05 && time > this.flickerUntil && Math.random() < dt * 0.18) this.flickerUntil = time + 0.05 + Math.random() * 0.12;
      const dip = time < this.flickerUntil ? (Math.sin(time * 90) > 0 ? 0.45 : 0.8) : 1;
      this.flickerValue = 1 + (dip - 1) * this.state.flicker;
      if (time > this.nextTrainAt) { this.trainStart = time; this.nextTrainAt = time + 9 + Math.random() * 6; }
      const trainT = (time - this.trainStart) / 1.4;
      const aspect = camera.aspect;
      const trainPos = trainT >= 0 && trainT <= 1 ? (-0.75 + trainT * 1.5) * aspect : -99;

      const ratio = owner.renderer.getPixelRatio();
      const flow = this.flowMaterial.uniforms;
      flow.uTime.value = time;
      flow.uTravel.value = this.travel;
      flow.uSwirl.value = this.state.swirl;
      flow.uKick.value = kick;
      flow.uSpark.value = this.spark;
      flow.uPixelRatio.value = ratio;
      flow.uCamPos.value.copy(camera.position);
      flow.uOpacity.value = this.state.flow;
      flow.uColorA.value.copy(this.state.flowA);
      flow.uColorB.value.copy(this.state.flowB);

      const tanHalf = Math.tan(camera.fov * Math.PI / 360);
      const haze = this.hazeMaterial.uniforms;
      const depth = 8;
      haze.uTime.value = time;
      haze.uHalf.value.set(tanHalf * depth * aspect * 1.04, tanHalf * depth * 1.04);
      haze.uDepth.value = depth;
      haze.uAspect.value = aspect;
      haze.uFog.value = this.state.fog;
      haze.uFogColor.value.copy(this.state.fogColor);
      haze.uBeams.value = this.state.beams;
      haze.uBeamColor.value.copy(this.state.beamColor);
      haze.uSwing.value = this.state.beamSwing;
      haze.uSlant.value = this.state.beamSlant;
      haze.uTrain.value = this.state.train;
      haze.uTrainPos.value = trainPos;
      haze.uFlicker.value = this.flickerValue;
      haze.uKick.value = kick;
      haze.uLevel.value = level;
      haze.uSpark.value = this.spark;

      const bokeh = this.bokehMaterial.uniforms;
      bokeh.uTime.value = time;
      bokeh.uTanHalf.value = tanHalf;
      bokeh.uAspect.value = aspect;
      bokeh.uPixelRatio.value = ratio;
      bokeh.uHeight.value = owner.height || 300;
      bokeh.uOpacity.value = this.state.bokeh * this.flickerValue;
      bokeh.uColor.value.copy(this.state.bokehColor);
      bokeh.uKick.value = kick;
      bokeh.uSpark.value = this.spark;
    }

    get grade() {
      return { contrast: this.state.contrast, tint: this.state.tint };
    }
  }

  window.LcdMusicPulse = LcdMusicPulse;
  window.LcdAtmosphere = LcdAtmosphere;
})();
