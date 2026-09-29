(() => {
  "use strict";

  // Keep fine geometry at CSS-pixel resolution; the canvas DPR is capped separately.
  const FEEDBACK_SCALE = 1;
  const CYCLE_SECONDS = 24;
  const RAIL_COUNT = 72;
  const DEBRIS_COUNT = 260;
  const FAR_FIELD_COUNT = 720;
  const DUST_COUNT = 120;
  const CHALLENGE_PARTICLE_COUNT = 540;
  const BONUS_TUNNEL_FRAMES = 30;
  const BOOST_STREAK_COUNT = 96;
  const PRESENTATION_KEYS = ["normal", "challenge", "bonus", "boost"];
  // Normal-stage camera angles: [pos x, y, z, look x, y, z, fov, dolly x, y, z].
  const SHOT_SECONDS = 15;
  // Bonus tunnel shots: [x, y, z, lookX, lookY, fov]
  const BONUS_SHOTS = [
    [-1.2, 0.55, 7.4, 0.7, -0.2, 54],
    [1.4, -0.8, 6.8, -0.6, 0.4, 70],
    [0, 0.1, 5.6, 0, 0, 46],
    [-0.4, 1.3, 7.8, 0.3, -0.9, 60],
    [2.0, 0.3, 7.0, -1.2, -0.1, 58],
  ];
  const NORMAL_SHOTS = {
    station: [
      [0, -0.6, 10, 0, -0.3, -30, 50, 0, 0, -3],
      [3.4, -1.65, 8, -0.6, 0.2, -25, 58, 0, 0, -1.5],
      [-3.6, -0.9, 6, 1.6, -0.9, -18, 50, 0, 0, -2.5],
      [0.25, 2.95, 9, -0.4, -1.5, -14, 55, -0.5, 0, -1],
      [-1.7, -0.9, 4, 2.2, -0.6, -22, 34, 0, 0, -1.5],
    ],
    hall: [
      [0, -1.6, 8, 0, -1.3, -30, 50, 0, 0, -3],
      [-2.5, 2.1, 6, 1, -2.5, -16, 55, 1.2, 0, -1],
      [1.1, -2.7, 6, -0.6, -2.2, -22, 50, 0, 0.2, -2],
      [0, -2.0, 9, 0, -1.6, -24, 62, 0, 0, -2],
      [-2.9, -1.8, 3, -3.2, -2.2, -25, 32, 0, 0, -1.5],
    ],
    lounge: [
      [0, -1.8, 8, 0, -2.1, -30, 50, 0, 0, -3],
      [1.2, -3.3, 5, -0.5, -2.7, -20, 55, -0.6, 0, -1.5],
      [-2.4, -2.6, 3, 2.3, -2.9, -14, 45, 0, 0, -1.5],
      [0, 2.4, 7, 0, -3.0, -16, 60, 0, 0, -1.2],
      [3.0, -1.3, 2, 4.4, -1.1, -24, 30, 0, 0, -1.5],
    ],
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const smooth = (value) => value * value * (3 - 2 * value);
  const seeded = (index, salt = 0) => {
    const value = Math.sin(index * 91.731 + salt * 47.113) * 43758.5453;
    return value - Math.floor(value);
  };

  const PHASES = [
    { end: 0.12, density: 0.24, speed: 0.16, feedback: 0.02, exposure: 0.74, disorder: 0.03 },
    { end: 0.25, density: 0.43, speed: 0.34, feedback: 0.08, exposure: 0.78, disorder: 0.08 },
    { end: 0.40, density: 0.62, speed: 1.0, feedback: 0.14, exposure: 0.94, disorder: 0.15 },
    { end: 0.56, density: 0.84, speed: 0.72, feedback: 0.28, exposure: 1.05, disorder: 0.42 },
    { end: 0.69, density: 1.0, speed: 1.24, feedback: 0.58, exposure: 1.24, disorder: 0.78 },
    { end: 0.74, density: 0.28, speed: 0.04, feedback: 0.82, exposure: 0.82, disorder: 1.0 },
    { end: 0.87, density: 0.09, speed: 0.12, feedback: 0.34, exposure: 0.48, disorder: 0.12 },
    { end: 1.0, density: 0.48, speed: 0.42, feedback: 0.11, exposure: 0.74, disorder: 0.06 },
  ];

  function phaseAt(cycleProgress) {
    let start = 0;
    for (let index = 0; index < PHASES.length; index += 1) {
      const phase = PHASES[index];
      if (cycleProgress <= phase.end || index === PHASES.length - 1) {
        return {
          ...phase,
          index,
          local: clamp((cycleProgress - start) / Math.max(0.0001, phase.end - start), 0, 1),
        };
      }
      start = phase.end;
    }
    return { ...PHASES[0], index: 0, local: 0 };
  }

  class DigitalAbstractScene {
    constructor(host, THREE, options = {}) {
      this.host = host;
      this.THREE = THREE;
      this.options = options;
      this.disposed = false;
      this.running = false;
      this.rafId = 0;
      this.startedAt = performance.now();
      this.previousAt = this.startedAt;
      this.lastMetricsAt = this.startedAt;
      this.metricsFrames = 0;
      this.lastPhase = -1;
      this.cutPulse = 0;
      this.eventPulse = 0;
      this.feedbackRead = null;
      this.feedbackWrite = null;
      this.sceneTarget = null;
      this.resources = [];
      this.materials = [];
      this.textures = [];
      this.renderTargets = [];
      this.theme = {
        primary: new THREE.Color(options.primaryColor ?? 0xffb43b),
        secondary: new THREE.Color(options.secondaryColor ?? 0x4b73ff),
        accent: new THREE.Color(options.accentColor ?? 0xffffff),
        background: new THREE.Color(options.backgroundColor ?? 0x010208),
        emission: options.emissionIntensity ?? 1,
        saturation: options.saturation ?? 1,
        exposure: options.exposure ?? 1,
        effect: options.effectIntensity ?? 1,
      };
      this.themeFrom = this.cloneTheme(this.theme);
      this.themeTarget = this.cloneTheme(this.theme);
      this.themeStartedAt = this.startedAt;
      this.themeDuration = 0;
      this.energy = { intensity: 0.3, burst: 0 };
      this.presentation = { kind: "normal", variant: 0 };
      this.presentationWeights = { normal: 1, challenge: 0, bonus: 0, boost: 0 };
      this.presentationTargets = { normal: 1, challenge: 0, bonus: 0, boost: 0 };
      this.presentationResponse = 7;
      this.init();
    }

    cloneTheme(source) {
      const { THREE } = this;
      return {
        primary: new THREE.Color(source.primary),
        secondary: new THREE.Color(source.secondary),
        accent: new THREE.Color(source.accent),
        background: new THREE.Color(source.background),
        emission: source.emission,
        saturation: source.saturation,
        exposure: source.exposure,
        effect: source.effect,
      };
    }

    track(resource) {
      if (resource) this.resources.push(resource);
      return resource;
    }

    trackMaterial(material) {
      if (material) this.materials.push(material);
      return material;
    }

    init() {
      const { THREE } = this;
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        premultipliedAlpha: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setClearColor(this.theme.background, 1);
      this.renderer.autoClear = true;
      this.renderer.info.autoReset = false;
      this.host.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(this.theme.background, 0.034);
      this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 90);
      this.camera.position.set(-1.8, 0.7, 11);
      this.camera.lookAt(0, 0, -8);

      this.world = new THREE.Group();
      this.scene.add(this.world);
      this.createOrderedRails();
      this.createDepthSlabs();
      this.createSignalVeils();
      this.createDebris();
      this.createDepthParticles();
      this.createChallengeField();
      this.createBonusTunnel();
      this.createBoostStreaks();
      this.createForegroundShutters();
      this.music = window.LcdMusicPulse ? new window.LcdMusicPulse() : { update() { return this; }, kick: 0, level: 0, active: 0 };
      this.cabinetWorld = new window.CabinetWorld(this);
      this.atmosphere = window.LcdAtmosphere ? new window.LcdAtmosphere(this) : null;
      this.createPostPipeline();
      this.title3D = window.CabinetTitle ? new window.CabinetTitle(this) : null;
      window.loadCabinetHDRI?.(this);

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host);
      this.resize();
      this.clearFeedback();
    }

    createOrderedRails() {
      const { THREE } = this;
      const geometry = this.track(new THREE.BoxGeometry(0.12, 3.6, 0.1));
      const material = this.trackMaterial(new THREE.MeshBasicMaterial({
        color: this.theme.secondary,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.rails = new THREE.InstancedMesh(geometry, material, RAIL_COUNT);
      this.rails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.railSeeds = [];
      this.railMatrix = new THREE.Matrix4();
      this.railQuaternion = new THREE.Quaternion();
      this.railEuler = new THREE.Euler();
      this.railScale = new THREE.Vector3();
      this.railPosition = new THREE.Vector3();
      for (let index = 0; index < RAIL_COUNT; index += 1) {
        this.railSeeds.push({
          column: (index % 9) - 4,
          layer: Math.floor(index / 9),
          offset: seeded(index, 2),
          lean: seeded(index, 4) - 0.5,
        });
      }
      this.world.add(this.rails);

      const linePositions = [];
      for (let layer = 0; layer < 14; layer += 1) {
        const z = 2 - layer * 2.25;
        const width = 3.4 + layer * 0.42;
        const y = (layer % 3 - 1) * 0.78;
        linePositions.push(-width, y, z, width, y, z);
        if (layer % 2 === 0) linePositions.push(-width * 0.55, -2.8, z, -width * 0.55, 2.8, z);
      }
      const lineGeometry = this.track(new THREE.BufferGeometry());
      lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
      const lineMaterial = this.trackMaterial(new THREE.LineBasicMaterial({
        color: this.theme.accent,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.guideLines = new THREE.LineSegments(lineGeometry, lineMaterial);
      this.world.add(this.guideLines);
    }

    createDepthSlabs() {
      const { THREE } = this;
      const geometry = this.track(new THREE.BoxGeometry(1, 1, 1));
      const material = this.trackMaterial(new THREE.MeshBasicMaterial({
        color: this.theme.primary,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.slabs = [];
      for (let index = 0; index < 18; index += 1) {
        const slab = new THREE.Mesh(geometry, material);
        const side = index % 3 === 0 ? -1 : 1;
        slab.userData = {
          baseX: side * (3.2 + seeded(index, 8) * 6.5),
          baseY: (seeded(index, 9) - 0.5) * 7,
          baseZ: -2 - index * 1.7,
          width: 0.7 + seeded(index, 10) * 3.4,
          height: 0.08 + seeded(index, 11) * 0.62,
          phase: seeded(index, 12) * Math.PI * 2,
        };
        slab.scale.set(slab.userData.width, slab.userData.height, 0.08);
        slab.rotation.z = (seeded(index, 13) - 0.5) * 0.34;
        this.slabs.push(slab);
        this.world.add(slab);
      }
    }

    createSignalVeils() {
      const { THREE } = this;
      const geometry = this.track(new THREE.PlaneGeometry(14, 8, 1, 1));
      const material = this.trackMaterial(new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDensity: { value: 0.3 },
          uDisorder: { value: 0 },
          uPrimary: { value: this.theme.primary.clone() },
          uSecondary: { value: this.theme.secondary.clone() },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform float uTime;
          uniform float uDensity;
          uniform float uDisorder;
          uniform vec3 uPrimary;
          uniform vec3 uSecondary;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
          }

          float detailNoise(vec2 p) {
            float detail = noise(p);
            detail += noise(p * 2.07 + 13.7) * 0.5;
            detail += noise(p * 4.13 - 8.2) * 0.25;
            return detail / 1.75;
          }

          void main() {
            vec2 p = vUv;
            vec2 macroUv = p * vec2(3.7, 2.1) + vec2(uTime * 0.035, -uTime * 0.021);
            vec2 warp = vec2(
              detailNoise(macroUv + 5.3),
              detailNoise(macroUv.yx - 9.1)
            ) - 0.5;
            vec2 warped = p + warp * (0.018 + uDisorder * 0.055);
            float macroWave = sin(warped.x * 8.0 + uTime * 0.23);
            float midWave = sin(warped.x * 23.0 - uTime * 0.41 + warp.y * 7.0);
            float band = abs(warped.y - 0.5 + macroWave * 0.075 * uDisorder + midWave * 0.012);
            float erosion = detailNoise(warped * vec2(8.0, 3.0) + vec2(uTime * 0.08, -uTime * 0.03));
            float edge = 1.0 - smoothstep(0.08, 0.47, band);
            float edgeFilament = 1.0 - smoothstep(0.012, 0.045, abs(band - 0.115 - warp.x * 0.025));
            float broken = smoothstep(0.56 - uDensity * 0.16, 0.78, erosion + edge * 0.22);
            float micro = noise(warped * vec2(46.0, 17.0) + vec2(-uTime * 0.19, uTime * 0.11));
            float scan = 0.62 + 0.38 * step(0.48, fract(p.y * 74.0 + uTime * 0.7));
            vec3 color = mix(uSecondary, uPrimary, clamp(p.x + erosion * 0.18 + warp.x, 0.0, 1.0));
            color *= 0.82 + micro * 0.28;
            float alpha = (edge * broken + edgeFilament * (0.08 + uDisorder * 0.16)) * scan * (0.08 + uDensity * 0.28);
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      this.veilMaterial = material;
      this.veils = [];
      for (let index = 0; index < 7; index += 1) {
        const veil = new THREE.Mesh(geometry, material);
        veil.position.set((index % 2 ? 1 : -1) * (1.8 + index * 0.22), (index - 3) * 0.42, -3 - index * 3.2);
        veil.rotation.z = (index % 2 ? 1 : -1) * (0.08 + index * 0.025);
        veil.rotation.y = (index % 2 ? -1 : 1) * 0.22;
        veil.scale.setScalar(0.72 + index * 0.1);
        this.veils.push(veil);
        this.world.add(veil);
      }
    }

    createDebris() {
      const { THREE } = this;
      const positions = new Float32Array(DEBRIS_COUNT * 3);
      for (let index = 0; index < DEBRIS_COUNT; index += 1) {
        const lane = (index % 13) - 6;
        positions[index * 3] = lane * 0.72 + (seeded(index, 20) - 0.5) * 0.28;
        positions[index * 3 + 1] = ((Math.floor(index / 13) % 7) - 3) * 0.58 + (seeded(index, 21) - 0.5) * 0.18;
        positions[index * 3 + 2] = -seeded(index, 22) * 38;
      }
      const geometry = this.track(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = this.trackMaterial(new THREE.PointsMaterial({
        color: this.theme.secondary,
        size: 0.055,
        transparent: true,
        opacity: 0.46,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.debris = new THREE.Points(geometry, material);
      this.world.add(this.debris);
    }

    createDepthParticles() {
      const { THREE } = this;
      const count = FAR_FIELD_COUNT + DUST_COUNT;
      const positions = new Float32Array(count * 3);
      const seeds = new Float32Array(count);
      const layers = new Float32Array(count);
      for (let index = 0; index < count; index += 1) {
        const foreground = index >= FAR_FIELD_COUNT ? 1 : 0;
        const spreadX = foreground ? 8.5 : 15;
        const spreadY = foreground ? 5.2 : 9;
        positions[index * 3] = (seeded(index, 61) - 0.5) * spreadX * 2;
        positions[index * 3 + 1] = (seeded(index, 62) - 0.5) * spreadY * 2;
        positions[index * 3 + 2] = 3 - seeded(index, 63) * (foreground ? 34 : 62);
        seeds[index] = seeded(index, 64);
        layers[index] = foreground;
      }
      const geometry = this.track(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
      geometry.setAttribute("aLayer", new THREE.BufferAttribute(layers, 1));
      const material = this.trackMaterial(new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFlow: { value: 0 },
          uDensity: { value: 0 },
          uPulse: { value: 0 },
          uOpacity: { value: 0 },
          uPrimary: { value: this.theme.primary.clone() },
          uSecondary: { value: this.theme.secondary.clone() },
        },
        vertexShader: `
          attribute float aSeed;
          attribute float aLayer;
          varying float vSeed;
          varying float vLayer;
          varying float vDepth;
          uniform float uTime;
          uniform float uFlow;
          uniform float uDensity;
          uniform float uPulse;

          void main() {
            vec3 p = position;
            float span = mix(62.0, 34.0, aLayer);
            float speed = mix(0.42, 1.25, aLayer) + uFlow * mix(1.7, 3.8, aLayer);
            float travel = mod(3.0 - p.z + uTime * speed + aSeed * 3.0, span);
            p.z = 3.0 - travel;
            p.x += sin(uTime * (0.07 + aSeed * 0.05) + p.z * 0.055) * mix(0.24, 0.62, aLayer);
            p.y += cos(uTime * 0.09 + aSeed * 19.0) * mix(0.10, 0.28, aLayer);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float safeDepth = max(0.8, -mv.z);
            float proximity = clamp(7.0 / safeDepth, 0.18, 3.8);
            float baseSize = mix(0.8 + aSeed * 1.2, 1.8 + aSeed * 2.5, aLayer);
            gl_PointSize = clamp(baseSize * proximity * (0.72 + uDensity * 0.5 + uPulse * 0.08), 0.7, 8.0);
            gl_Position = projectionMatrix * mv;
            vSeed = aSeed;
            vLayer = aLayer;
            vDepth = proximity;
          }
        `,
        fragmentShader: `
          precision highp float;
          varying float vSeed;
          varying float vLayer;
          varying float vDepth;
          uniform float uOpacity;
          uniform vec3 uPrimary;
          uniform vec3 uSecondary;

          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float radius = length(p);
            float dotShape = 1.0 - smoothstep(0.18, 0.5, radius);
            float shard = 1.0 - smoothstep(0.10, 0.34, abs(p.x) + abs(p.y) * 0.42);
            float shape = mix(dotShape, max(dotShape * 0.45, shard), vLayer);
            float core = 1.0 - smoothstep(0.0, 0.13, radius);
            vec3 color = mix(uSecondary, uPrimary, step(0.68, vSeed));
            color *= 0.68 + core * 0.48 + min(vDepth, 2.0) * 0.08;
            gl_FragColor = vec4(color, shape * uOpacity * mix(0.42, 1.0, vLayer));
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.depthParticleMaterial = material;
      this.depthParticles = new THREE.Points(geometry, material);
      this.world.add(this.depthParticles);
    }

    createChallengeField() {
      const { THREE } = this;
      const positions = new Float32Array(CHALLENGE_PARTICLE_COUNT * 3);
      const seeds = new Float32Array(CHALLENGE_PARTICLE_COUNT);
      for (let index = 0; index < CHALLENGE_PARTICLE_COUNT; index += 1) {
        const ring = index % 18;
        const lane = Math.floor(index / 18);
        const angle = (ring / 18) * Math.PI * 2 + lane * 0.17;
        const radius = 0.9 + (lane % 11) * 0.34;
        positions[index * 3] = Math.cos(angle) * radius;
        positions[index * 3 + 1] = Math.sin(angle) * radius * 0.56;
        positions[index * 3 + 2] = -2 - (lane % 15) * 1.35;
        seeds[index] = seeded(index, 41);
      }
      const geometry = this.track(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
      const material = this.trackMaterial(new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uVariant: { value: 0 },
          uOpacity: { value: 0 },
          uProgress: { value: 0 },
          uPrimary: { value: this.theme.primary.clone() },
          uSecondary: { value: this.theme.secondary.clone() },
        },
        vertexShader: `
          attribute float aSeed;
          varying float vSeed;
          varying float vHeat;
          varying float vFade;
          uniform float uTime;
          uniform float uEnergy;
          uniform float uVariant;
          uniform float uProgress;

          void main() {
            vec3 p = position;
            float speed = uVariant < 0.5 ? 1.6 + uProgress * 0.6 : (uVariant < 1.5 ? 0.42 : 2.1);
            float travel = mod(-p.z + uTime * speed + aSeed * 5.0, 24.0);
            p.z = 3.0 - travel;
            float inward = 0.72 + 0.28 * sin(uTime * 1.7 + aSeed * 12.0);
            if (uVariant < 0.5) {
              // Embers rise beside the doorway, keeping the title axis clear.
              p.x = sign(position.x) * (2.2 + abs(position.x) * 0.55) * inward;
              p.y = mod(position.y + uTime * (0.32 + aSeed * 0.5), 6.0) - 3.0;
            } else if (uVariant < 1.5) {
              p.x *= 1.65;
              p.x += sin(uTime * 0.21 + aSeed * 18.0) * 0.28;
              p.y = mod(position.y - uTime * (0.06 + aSeed * 0.12), 5.0) - 2.5;
            } else {
              p.x = sign(position.x) * (2.0 + abs(position.x));
              p.y += cos(uTime * 0.4 + aSeed * 15.0) * 0.35;
            }
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float proximity = clamp(8.0 / max(1.0, -mv.z), 0.4, 3.2);
            gl_PointSize = min(22.0, (1.8 + aSeed * aSeed * 5.0 + uEnergy * 0.7) * proximity);
            gl_Position = projectionMatrix * mv;
            vSeed = aSeed;
            vHeat = proximity;
            vFade = smoothstep(0.0, 1.5, travel) * (1.0 - smoothstep(20.0, 24.0, travel));
            if (uVariant > 0.5 && uVariant < 1.5) vFade *= step(0.58, aSeed) * 0.45;
          }
        `,
        fragmentShader: `
          precision highp float;
          varying float vSeed;
          varying float vHeat;
          varying float vFade;
          uniform vec3 uPrimary;
          uniform vec3 uSecondary;
          uniform float uOpacity;
          uniform float uVariant;

          void main() {
            vec2 p = gl_PointCoord - 0.5;
            vec2 facet = uVariant < 0.5 ? vec2(2.8, 0.9) : (uVariant < 1.5 ? vec2(1.0) : vec2(0.85, 3.2));
            float shape = 1.0 - smoothstep(0.08, 0.48, length(p * facet));
            float core = 1.0 - smoothstep(0.0, 0.22, length(p));
            vec3 color = mix(uSecondary, uPrimary, step(0.58, vSeed));
            color += core * 0.45 * vHeat;
            gl_FragColor = vec4(color, shape * uOpacity * vFade);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.challengeMaterial = material;
      this.challengeField = new THREE.Points(geometry, material);
      this.world.add(this.challengeField);
    }

    createBonusTunnel() {
      const { THREE } = this;
      const positions = new Float32Array(BONUS_TUNNEL_FRAMES * 8 * 3);
      const geometry = this.track(new THREE.BufferGeometry());
      const attribute = new THREE.BufferAttribute(positions, 3);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", attribute);
      const material = this.trackMaterial(new THREE.LineBasicMaterial({
        color: this.theme.primary,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.bonusTunnelPositions = positions;
      this.bonusTunnelAttribute = attribute;
      this.bonusTunnelMaterial = material;
      this.bonusTunnel = new THREE.LineSegments(geometry, material);
      this.world.add(this.bonusTunnel);
    }

    createBoostStreaks() {
      const { THREE } = this;
      const geometry = this.track(new THREE.BoxGeometry(0.035, 0.035, 3.6));
      const material = this.trackMaterial(new THREE.MeshBasicMaterial({
        color: this.theme.secondary,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.boostStreaks = new THREE.InstancedMesh(geometry, material, BOOST_STREAK_COUNT);
      this.boostStreaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.boostStreakMatrix = new THREE.Matrix4();
      this.boostStreakPosition = new THREE.Vector3();
      this.boostStreakScale = new THREE.Vector3();
      this.boostStreakQuaternion = new THREE.Quaternion();
      this.boostSeeds = Array.from({ length: BOOST_STREAK_COUNT }, (_, index) => ({
        x: (seeded(index, 51) - 0.5) * 16,
        y: (seeded(index, 52) - 0.5) * 9,
        z: seeded(index, 53) * 52,
        length: 0.65 + seeded(index, 54) * 2.5,
      }));
      this.world.add(this.boostStreaks);
    }

    createForegroundShutters() {
      const { THREE } = this;
      const geometry = this.track(new THREE.PlaneGeometry(1, 1));
      const material = this.trackMaterial(new THREE.MeshBasicMaterial({
        color: this.theme.background,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      }));
      this.shutters = [];
      for (let index = 0; index < 4; index += 1) {
        const shutter = new THREE.Mesh(geometry, material);
        shutter.scale.set(4.4 + index * 1.25, 0.8 + index * 0.46, 1);
        shutter.position.set(index % 2 ? 6.8 : -6.8, (index - 1.5) * 1.72, 3.5 - index * 0.18);
        shutter.rotation.z = (index % 2 ? -1 : 1) * 0.28;
        shutter.userData.phase = index * 1.7;
        this.shutters.push(shutter);
        this.scene.add(shutter);
      }
    }

    createPostPipeline() {
      const { THREE } = this;
      this.feedbackScene = new THREE.Scene();
      this.displayScene = new THREE.Scene();
      this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quadGeometry = this.track(new THREE.PlaneGeometry(2, 2));

      this.feedbackMaterial = this.trackMaterial(new THREE.ShaderMaterial({
        uniforms: {
          uCurrent: { value: null },
          uPrevious: { value: null },
          uTime: { value: 0 },
          uFeedback: { value: 0 },
          uDisorder: { value: 0 },
          uCut: { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uCurrent;
          uniform sampler2D uPrevious;
          uniform float uTime;
          uniform float uFeedback;
          uniform float uDisorder;
          uniform float uCut;
          uniform vec2 uResolution;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3))) * 9513.1337); }

          void main() {
            vec2 center = vUv - 0.5;
            float angle = (0.002 + uDisorder * 0.009) * sin(uTime * 0.37);
            mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
            vec2 previousUv = rotation * center * (0.994 - uFeedback * 0.012) + 0.5;
            float stripe = floor(vUv.y * max(1.0, uResolution.y * 0.22));
            previousUv.x += (hash(vec2(stripe, floor(uTime * 5.0))) - 0.5) * uDisorder * 0.018;
            previousUv += vec2(sin(vUv.y * 17.0 + uTime) * 0.002, cos(vUv.x * 13.0 - uTime) * 0.001) * uFeedback;
            previousUv = clamp(previousUv, vec2(0.001), vec2(0.999));
            vec2 wideUv = rotation * center * (0.982 - uFeedback * 0.018) + 0.5;
            wideUv += vec2(
              sin(vUv.y * 7.0 - uTime * 0.31),
              cos(vUv.x * 5.0 + uTime * 0.23)
            ) * uFeedback * 0.0035;
            wideUv = clamp(wideUv, vec2(0.001), vec2(0.999));
            vec4 current = texture2D(uCurrent, vUv);
            vec4 previous = texture2D(uPrevious, previousUv);
            vec3 previousWide = texture2D(uPrevious, wideUv).rgb;
            float retainMask = smoothstep(0.08, 0.92, hash(floor(vUv * vec2(43.0, 17.0)) + floor(uTime * 0.7)) + uFeedback * 0.42);
            // Echoes zoom toward the vanishing point; keep them from stacking into a white core.
            float centreGuard = mix(0.2, 1.0, smoothstep(0.03, 0.3, length(center * vec2(1.6, 1.0))));
            float retain = uFeedback * (0.44 + retainMask * 0.45) * (1.0 - uCut * 0.86) * centreGuard;
            vec3 echo = previous.rgb * (0.91 - uFeedback * 0.12);
            float wideRetain = uFeedback * uFeedback * (0.10 + retainMask * 0.12) * (1.0 - uCut);
            vec3 color = current.rgb + echo * retain + previousWide * wideRetain;
            color += abs(current.rgb - previous.rgb) * uDisorder * 0.13;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false,
      }));
      this.feedbackQuad = new THREE.Mesh(quadGeometry, this.feedbackMaterial);
      this.feedbackScene.add(this.feedbackQuad);

      this.displayMaterial = this.trackMaterial(new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: null },
          uDepth: { value: null },
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uNearFar: { value: new THREE.Vector2(this.camera.near, this.camera.far) },
          uPrimary: { value: this.theme.primary.clone() },
          uSecondary: { value: this.theme.secondary.clone() },
          uExposure: { value: 1 },
          uSaturation: { value: 1 },
          uDisorder: { value: 0 },
          uDensity: { value: 0 },
          uCut: { value: 0 },
          uClarity: { value: 0 },
          // The cabinet has a final optical layer shared with DOM lettering.
          // Standalone scene previews retain the shader's native LCD mask.
          uPanelFx: { value: this.host.closest('.lcd-screen')?.querySelector('.lcd-post-fx') ? 0 : 1 },
          uFocus: { value: 0.12 },
          uFocusRange: { value: 0.35 },
          uDof: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uTexture;
          uniform sampler2D uDepth;
          uniform float uTime;
          uniform vec2 uResolution;
          uniform vec2 uNearFar;
          uniform vec3 uPrimary;
          uniform vec3 uSecondary;
          uniform float uExposure;
          uniform float uSaturation;
          uniform float uDisorder;
          uniform float uDensity;
          uniform float uCut;
          uniform float uClarity;
          uniform float uPanelFx;
          uniform float uFocus;
          uniform float uFocusRange;
          uniform float uDof;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float rect(vec2 p, vec2 center, vec2 size) {
            vec2 d = abs(p - center) - size;
            return 1.0 - step(0.0, max(d.x, d.y));
          }
          float linearDepth(float depth) {
            float z = depth * 2.0 - 1.0;
            return (2.0 * uNearFar.x * uNearFar.y) /
              max(0.0001, uNearFar.y + uNearFar.x - z * (uNearFar.y - uNearFar.x)) / uNearFar.y;
          }
          float depthOcclusion(float centerDepth, vec2 sampleUv) {
            float neighbour = texture2D(uDepth, clamp(sampleUv, vec2(0.001), vec2(0.999))).r;
            float separation = centerDepth - linearDepth(neighbour);
            // Reject distant silhouettes: darkening must belong to a contact,
            // not to an unrelated object across the corridor.
            float rangeWeight = 1.0 - smoothstep(0.012, 0.055, abs(separation));
            return smoothstep(0.0008, 0.012, separation) * rangeWeight * (1.0 - step(0.9995, neighbour));
          }

          vec3 lcdSubpixelMask(vec2 cellUv) {
            vec2 cell = fract(cellUv);
            float stripe = floor(cell.x * 3.0);
            vec3 selector = vec3(
              1.0 - step(1.0, stripe),
              step(1.0, stripe) * (1.0 - step(2.0, stripe)),
              step(2.0, stripe)
            );
            float stripeCore = 1.0 - smoothstep(0.31, 0.49, abs(fract(cell.x * 3.0) - 0.5));
            float cellX = smoothstep(0.025, 0.13, cell.x) * (1.0 - smoothstep(0.87, 0.975, cell.x));
            float cellY = smoothstep(0.035, 0.16, cell.y) * (1.0 - smoothstep(0.84, 0.965, cell.y));
            return (vec3(0.17) + selector * stripeCore * 2.48) * mix(0.76, 1.0, cellX * cellY);
          }

          void main() {
            vec2 uv = vUv;
            vec2 safeResolution = max(uResolution, vec2(1.0));
            float scanId = floor(uv.y * max(1.0, safeResolution.y * 0.32));
            float tear = (hash(vec2(scanId, floor(uTime * 3.0))) - 0.5) * uDisorder;
            float distortion = mix(1.0, 0.20, uClarity);
            uv.x += (tear * 0.022 + sin(uv.y * 19.0 + uTime * 0.8) * uDisorder * 0.002) * distortion;
            uv = mix(uv, vec2(uv.x, floor(uv.y * 96.0) / 96.0), uCut * 0.72 * distortion);
            uv = clamp(uv, vec2(0.001), vec2(0.999));
            // A virtual native panel exposes discrete RGB cells only when they
            // occupy enough screen pixels. Derivatives fade the structure out
            // before sub-pixel aliasing can introduce a colour cast.
            vec2 panelResolution = max(floor(safeResolution / vec2(2.0, 1.8)), vec2(1.0));
            vec2 panelUv = uv * panelResolution;
            vec2 panelDx = dFdx(panelUv);
            vec2 panelDy = dFdy(panelUv);
            float panelFootprint = max(dot(panelDx, panelDx), dot(panelDy, panelDy));
            float panelLod = 0.5 * log2(max(panelFootprint, 0.000001));
            float removePixels = smoothstep(-1.80, -0.65, panelLod);
            vec2 pixelizedUv = (floor(panelUv) + 0.5) / panelResolution;
            vec2 contentUv = mix(uv, mix(pixelizedUv, uv, removePixels), uPanelFx);
            vec3 color = texture2D(uTexture, contentUv).rgb;
            // Depth of field: the background past the focus plane melts into a
            // soft disc blur so foreground structure and lettering stand out.
            float dofDepth = linearDepth(texture2D(uDepth, uv).r);
            float coc = clamp((dofDepth - uFocus) / max(0.001, uFocusRange), 0.0, 1.0) * uDof;
            if (coc > 0.02) {
              vec2 radius = coc * 5.5 / safeResolution;
              vec3 blurred = color;
              for (int i = 0; i < 10; i++) {
                float angle = float(i) * 2.39996 + 0.4;
                float ring = mix(0.45, 1.0, mod(float(i), 2.0));
                blurred += texture2D(uTexture, clamp(contentUv + vec2(cos(angle), sin(angle)) * ring * radius, vec2(0.001), vec2(0.999))).rgb;
              }
              color = blurred / 11.0;
            }
            float maskVisibility = (1.0 - removePixels) * 0.22 * uPanelFx;
            vec3 lcdMask = mix(vec3(1.0), lcdSubpixelMask(panelUv), maskVisibility);
            color *= lcdMask;
            // Two local scales create material halation without a whole-screen wash.
            vec2 px = 1.6 / safeResolution;
            vec3 sampleR = texture2D(uTexture, clamp(uv + vec2(px.x, 0.0), vec2(0.001), vec2(0.999))).rgb;
            vec3 sampleL = texture2D(uTexture, clamp(uv - vec2(px.x, 0.0), vec2(0.001), vec2(0.999))).rgb;
            vec3 sampleU = texture2D(uTexture, clamp(uv + vec2(0.0, px.y), vec2(0.001), vec2(0.999))).rgb;
            vec3 sampleD = texture2D(uTexture, clamp(uv - vec2(0.0, px.y), vec2(0.001), vec2(0.999))).rgb;
            vec2 widePx = px * 3.2;
            vec3 wideR = texture2D(uTexture, clamp(uv + vec2(widePx.x, 0.0), vec2(0.001), vec2(0.999))).rgb;
            vec3 wideL = texture2D(uTexture, clamp(uv - vec2(widePx.x, 0.0), vec2(0.001), vec2(0.999))).rgb;
            vec3 wideU = texture2D(uTexture, clamp(uv + vec2(0.0, widePx.y), vec2(0.001), vec2(0.999))).rgb;
            vec3 wideD = texture2D(uTexture, clamp(uv - vec2(0.0, widePx.y), vec2(0.001), vec2(0.999))).rgb;
            vec3 haloNear = max(sampleR - 0.68, 0.0) + max(sampleL - 0.68, 0.0)
                          + max(sampleU - 0.68, 0.0) + max(sampleD - 0.68, 0.0);
            vec3 haloWide = max(wideR - 0.76, 0.0) + max(wideL - 0.76, 0.0)
                          + max(wideU - 0.76, 0.0) + max(wideD - 0.76, 0.0);
            color += haloNear * (0.022 + uDensity * 0.008) + haloWide * (0.010 + uDisorder * 0.006);
            vec3 edgeDelta = abs(sampleR - sampleL) + abs(sampleU - sampleD);
            color += edgeDelta * mix(0.026, 0.012, uClarity) * (0.35 + uDensity * 0.65);
            // Shared screen-space AO anchors every scene without adding geometry passes.
            float rawDepth = texture2D(uDepth, uv).r;
            float centerDepth = linearDepth(rawDepth);
            vec2 aoPx = clamp(0.65 / max(centerDepth, 0.025), 2.0, 8.0) / safeResolution;
            float occlusion = depthOcclusion(centerDepth, uv + vec2(aoPx.x, 0.0));
            occlusion += depthOcclusion(centerDepth, uv - vec2(aoPx.x, 0.0));
            occlusion += depthOcclusion(centerDepth, uv + vec2(0.0, aoPx.y));
            occlusion += depthOcclusion(centerDepth, uv - vec2(0.0, aoPx.y));
            occlusion += depthOcclusion(centerDepth, uv + aoPx);
            occlusion += depthOcclusion(centerDepth, uv - aoPx);
            occlusion *= 0.125 * (1.0 - step(0.9995, rawDepth));
            float ambientVisibility = 1.0 - occlusion * 0.72;
            color *= ambientVisibility;
            // Wide neighbouring radiance supplies a restrained low-frequency GI bounce.
            vec3 indirect = max((wideR + wideL + wideU + wideD) * 0.25 - color * 0.42, 0.0);
            // A bounded screen-space fill, not full GI: do not bleed bright
            // foreground reflections into the empty background.
            color += min(indirect, vec3(0.22)) * (0.06 + uDensity * 0.015)
                   * ambientVisibility * (1.0 - step(0.9995, rawDepth));
            vec3 localAverage = (sampleR + sampleL + sampleU + sampleD) * 0.25;
            color += clamp(color - localAverage, vec3(-0.10), vec3(0.10)) * mix(0.20, 0.10, uDisorder);
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luminance), color, uSaturation);
            color *= uExposure;
            color = max((color - 0.035) * 1.09 + 0.035, 0.0);
            vec3 contrastCurve = clamp(color, 0.0, 1.0);
            contrastCurve = contrastCurve * contrastCurve * (3.0 - 2.0 * contrastCurve);
            color = mix(color, contrastCurve, 0.18);
            float vignetteDistance = length((vUv - 0.5) * vec2(safeResolution.x / safeResolution.y, 1.0));
            float vignette = 1.0 - smoothstep(0.18, 1.15, vignetteDistance);
            float panelGlass = 0.91 + 0.09 * vignette;
            color *= panelGlass;

            float signal = 0.0;
            signal += rect(vUv, vec2(0.085, 0.79), vec2(0.055 + uDensity * 0.09, 0.003));
            signal += rect(vUv, vec2(0.86, 0.19), vec2(0.11, 0.0025));
            signal += rect(vUv, vec2(0.72, 0.88), vec2(0.002, 0.035 + uDensity * 0.08));
            float chopped = step(0.72, hash(floor(vUv * vec2(29.0, 13.0)) + floor(uTime * 0.45)));
            signal += chopped * step(0.985, fract(vUv.x * 7.0 + vUv.y * 3.0)) * uDensity;
            color += mix(uSecondary, uPrimary, vUv.x) * signal * (0.12 + uDensity * 0.2);
            float blockNoise = hash(floor(vUv * vec2(87.0, 31.0)) + floor(uTime * 2.0));
            float interference = sin(vUv.y * 173.0 + uTime * 1.7 + blockNoise * 4.0)
                               * sin(vUv.x * 41.0 - uTime * 0.61);
            color += mix(uSecondary, uPrimary, blockNoise) * interference * uDisorder * uDensity * 0.007;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
        extensions: { derivatives: true },
        depthTest: false,
        depthWrite: false,
      }));
      this.displayQuad = new THREE.Mesh(quadGeometry, this.displayMaterial);
      this.displayScene.add(this.displayQuad);
      this.createImpactPipeline(quadGeometry);
    }

    // Final optical stage: the finished LCD frame (scene + 3D lettering) is
    // bloomed from its own highlights, then an impact layer adds the
    // hold / release beat (darken, whiteout, shockwave, colour fringing).
    createImpactPipeline(quadGeometry) {
      const { THREE } = this;
      const renderer = this.renderer;
      this.hdrTargets = Boolean(renderer.capabilities.isWebGL2 && renderer.extensions.has("EXT_color_buffer_float"));
      this.bloomTargets = [];
      this.impactFx = null;
      this.fxScene = new THREE.Scene();
      this.fxQuad = new THREE.Mesh(quadGeometry, null);
      this.fxQuad.frustumCulled = false;
      this.fxScene.add(this.fxQuad);
      const vertexShader = `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `;
      this.bloomDownMaterial = this.trackMaterial(new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: null },
          uTexel: { value: new THREE.Vector2(1, 1) },
          uThreshold: { value: 0.74 },
          uPrefilter: { value: 1 },
        },
        vertexShader,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uTexture;
          uniform vec2 uTexel;
          uniform float uThreshold;
          uniform float uPrefilter;
          vec3 tap(vec2 offset) { return texture2D(uTexture, clamp(vUv + offset * uTexel, vec2(0.0005), vec2(0.9995))).rgb; }
          void main() {
            vec3 color = tap(vec2(0.0)) * 0.5
              + (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.125;
            if (uPrefilter > 0.5) {
              float brightness = max(color.r, max(color.g, color.b));
              float knee = uThreshold * 0.5;
              float soft = clamp(brightness - uThreshold + knee, 0.0, 2.0 * knee);
              soft = soft * soft / (4.0 * knee + 0.0001);
              color *= max(soft, brightness - uThreshold) / max(brightness, 0.0001);
            }
            gl_FragColor = vec4(min(color, vec3(6.0)), 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false,
      }));
      this.bloomUpMaterial = this.trackMaterial(new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: null },
          uTexel: { value: new THREE.Vector2(1, 1) },
          uWeight: { value: 1 },
        },
        vertexShader,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uTexture;
          uniform vec2 uTexel;
          uniform float uWeight;
          vec3 tap(vec2 offset) { return texture2D(uTexture, clamp(vUv + offset * uTexel, vec2(0.0005), vec2(0.9995))).rgb; }
          void main() {
            vec3 color = tap(vec2(0.0)) * 4.0
              + (tap(vec2(-1.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, -1.0)) + tap(vec2(0.0, 1.0))) * 2.0
              + tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
            gl_FragColor = vec4(color / 16.0 * uWeight, 1.0);
          }
        `,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }));
      this.impactMaterial = this.trackMaterial(new THREE.ShaderMaterial({
        uniforms: {
          uScene: { value: null },
          uBloom: { value: null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uCenter: { value: new THREE.Vector2(0.5, 0.52) },
          uShake: { value: new THREE.Vector2(0, 0) },
          uZoom: { value: 1 },
          uBloomStrength: { value: 0.2 },
          uImpactAge: { value: 99 },
          uImpactStrength: { value: 0 },
          uImpactColor: { value: new THREE.Color(1, 1, 1) },
          uWarp: { value: 1 },
          uHold: { value: 0 },
          uFlash: { value: 0 },
          uRays: { value: 0 },
          uRipple: { value: new THREE.Vector2(99, 0) },
          uStop: { value: new THREE.Vector3(0.5, 99, 0) },
          uContrast: { value: 0 },
          uTint: { value: new THREE.Vector3(1, 1, 1) },
          uPulse: { value: 0 },
          uStreak: { value: null },
          uAnamorphic: { value: 0.3 },
          uFloor: { value: 0 },
          uTime: { value: 0 },
          uPrev: { value: null },
          uWipe: { value: 1 },
          uWipeType: { value: 0 },
        },
        vertexShader,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uScene;
          uniform sampler2D uBloom;
          uniform vec2 uResolution;
          uniform vec2 uCenter;
          uniform vec2 uShake;
          uniform float uZoom;
          uniform float uBloomStrength;
          uniform float uImpactAge;
          uniform float uImpactStrength;
          uniform vec3 uImpactColor;
          uniform float uWarp;
          uniform float uHold;
          uniform float uFlash;
          uniform float uRays;
          uniform vec2 uRipple;
          uniform vec3 uStop;
          uniform float uContrast;
          uniform vec3 uTint;
          uniform float uPulse;
          uniform sampler2D uStreak;
          uniform float uAnamorphic;
          uniform float uFloor;
          uniform float uTime;
          uniform sampler2D uPrev;
          uniform float uWipe;
          uniform float uWipeType;
          float hash12(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

          vec3 sampleScene(vec2 uv) { return texture2D(uScene, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb; }
          vec3 sampleBloom(vec2 uv) { return texture2D(uBloom, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb; }
          // Untouched below the knee, so ordinary frames keep their grade;
          // only whiteouts and stacked glow roll off instead of clipping flat.
          vec3 shoulder(vec3 color) {
            vec3 over = max(color - 0.9, 0.0);
            return min(color, vec3(0.9)) + 0.1 * (1.0 - exp(-over * 6.0));
          }

          void main() {
            vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
            vec2 uv = (vUv - uCenter) / uZoom + uCenter + uShake;
            vec2 delta = (uv - uCenter) * aspect;
            float dist = length(delta);
            vec2 dir = dist > 0.0001 ? delta / dist / aspect : vec2(0.0);
            float live = uImpactStrength * (1.0 - smoothstep(0.0, 1.15, uImpactAge));
            float radius = uImpactAge * 2.1;
            float ring = exp(-pow((dist - radius) / 0.075, 2.0)) * live;
            // Lever-on: a thin, quick ripple runs outward from the centre.
            float rippleLive = uRipple.y * (1.0 - smoothstep(0.0, 0.8, uRipple.x));
            float ripple = exp(-pow((dist - uRipple.x * 1.7) / 0.045, 2.0)) * rippleLive;
            vec2 warped = uv - dir * (ring * 0.032 + ripple * 0.01) * uWarp;
            float fringe = (0.0042 * live * exp(-uImpactAge * 3.2) + ring * 0.006) * uWarp + uHold * 0.0014;
            vec3 color = vec3(
              sampleScene(warped + dir * fringe).r,
              sampleScene(warped).g,
              sampleScene(warped - dir * fringe).b
            );
            color *= 1.0 - uHold * (0.5 + 0.42 * smoothstep(0.12, 0.85, dist));
            vec3 graded = clamp(color, 0.0, 1.0);
            graded = graded * graded * (3.0 - 2.0 * graded);
            color = mix(color, graded, uContrast) * uTint * (1.0 + uPulse);
            color += sampleBloom(warped) * uBloomStrength;
            // Anamorphic flare: bright points stretch into thin horizontal streaks.
            vec3 streak = vec3(0.0);
            for (int i = -7; i <= 7; i++) {
              float fi = float(i);
              streak += texture2D(uStreak, clamp(warped + vec2(fi * 0.021, 0.0), vec2(0.0005), vec2(0.9995))).rgb * exp(-abs(fi) * 0.3);
            }
            streak *= 0.15;
            float streakLuma = dot(streak, vec3(0.3, 0.5, 0.2));
            color += mix(vec3(0.55, 0.78, 1.0) * streakLuma, streak, 0.4) * uAnamorphic;
            // Glossy floor: the lower band mirrors the tunnel above it.
            if (uFloor > 0.001) {
              float horizon = 0.32;
              float below = horizon - vUv.y;
              if (below > 0.0) {
                vec2 mirror = vec2(warped.x + sin(vUv.y * 140.0 + uTime * 2.0) * 0.0015, horizon + below * 1.2);
                color += sampleScene(mirror) * (1.0 - smoothstep(0.0, horizon, below)) * 0.12 * uFloor;
              }
            }
            if (uRays > 0.001) {
              vec3 rays = vec3(0.0);
              vec2 stepUv = (warped - uCenter) * 0.055;
              vec2 cursor = warped;
              float weight = 1.0;
              for (int index = 0; index < 10; index++) {
                cursor -= stepUv;
                rays += sampleBloom(cursor) * weight;
                weight *= 0.85;
              }
              color += rays * 0.08 * uRays;
            }
            color += uImpactColor * ring * 0.5;
            color += vec3(0.75, 0.88, 1.0) * ripple * 0.07;
            // Reel stop: a soft light column over the reel that just stopped.
            float column = exp(-pow((vUv.x - uStop.x) / 0.075, 2.0)) * uStop.z * exp(-uStop.y * 7.0);
            color += color * column * 0.32 + vec3(1.0, 0.96, 0.9) * column * 0.035;
            color += mix(vec3(1.0), uImpactColor, 0.35) * uFlash;
            // Scene-change wipe over the last frame of the previous scene.
            if (uWipe < 0.999) {
              float p = uWipe;
              float reveal = 1.0;
              float edge = 0.0;
              vec2 prevUv = vUv;
              if (uWipeType < 0.5) {
                float slats = 9.0;
                float slat = floor(vUv.y * slats);
                float local = abs(fract(vUv.y * slats) - 0.5) * 2.0;
                float open = p * 1.35 - hash12(vec2(slat, 3.0)) * 0.3;
                reveal = step(local, open);
                edge = (1.0 - smoothstep(0.0, 0.06, abs(local - open))) * (1.0 - p);
              } else if (uWipeType < 1.5) {
                vec2 grid = vec2(16.0, 5.0);
                vec2 cell = floor(vUv * grid);
                vec2 cellCentre = (cell + 0.5) / grid;
                float delay = hash12(cell) * 0.35 + length((cellCentre - 0.5) * vec2(1.6, 1.0)) * 0.45;
                float t = clamp((p - delay) / 0.4, 0.0, 1.0);
                reveal = step(0.999, t);
                prevUv = cellCentre + (vUv - cellCentre) * (1.0 + t * 0.35) + vec2((hash12(cell + 7.0) - 0.5) * t * 0.08, -t * t * 0.28);
                vec2 inCell = abs(fract(vUv * grid) - 0.5);
                edge = (1.0 - smoothstep(0.44, 0.5, max(inCell.x, inCell.y))) < 0.5 ? (1.0 - p) * 0.8 : 0.0;
              } else if (uWipeType < 2.5) {
                float line = vUv.x + (vUv.y - 0.5) * 0.35;
                float front = p * 1.5 - 0.25;
                reveal = step(line, front);
                edge = 1.0 - smoothstep(0.0, 0.025, abs(line - front));
              } else {
                // Travel: fly into the old stage until it streams past, then arrive.
                vec2 fromCentre = vUv - 0.5;
                prevUv = 0.5 + fromCentre / (1.0 + p * p * 3.0);
                reveal = smoothstep(0.35, 0.8, p);
                float angleId = floor(atan(fromCentre.y, fromCentre.x * 1.8) * 40.0);
                edge = step(0.82, hash12(vec2(angleId, 5.0))) * smoothstep(0.12, 0.6, length(fromCentre * vec2(1.8, 1.0))) * sin(3.14159 * p) * 0.5;
              }
              vec3 previous = texture2D(uPrev, clamp(prevUv, vec2(0.0005), vec2(0.9995))).rgb;
              if (uWipeType > 2.5) previous *= 1.0 + p * 1.2;
              color = mix(previous, color, reveal) + vec3(1.0, 0.95, 0.88) * edge * 0.6;
            }
            // Photographic grain: a faint per-frame sensor noise.
            color += (hash12(vUv * uResolution + fract(uTime * 7.13) * 91.0) - 0.5) * 0.018;
            gl_FragColor = vec4(shoulder(color), 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false,
      }));
    }

    makeFxTarget(width, height, { depth = false, samples = 0 } = {}) {
      const { THREE } = this;
      const target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: this.hdrTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
        depthBuffer: depth,
        stencilBuffer: false,
      });
      target.texture.generateMipmaps = false;
      if (samples && this.renderer.capabilities.isWebGL2) target.samples = samples;
      this.renderTargets.push(target);
      return target;
    }

    // Visible board actions (lever, reel stops, bell payout) nudge the panel.
    boardBeat(kind, reelIndex = 0) {
      const now = performance.now();
      this.board ||= {};
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (kind === "lever") {
        this.board.rippleAt = now;
        this.board.stops = 0;
        this.cutTarget = null;
      } else if (kind === "stop") {
        this.board.stopAt = now;
        this.board.stopX = [0.27, 0.5, 0.73][reelIndex] ?? 0.5;
        this.board.stops = (this.board.stops || 0) + 1;
        // The picture never holds on a stop: the LCD keeps running.
      }
      this.atmosphere?.board(kind);
    }

    // Notice at lever-on. At the station it is a train (grade = look);
    // elsewhere the camera dashes forward down the stage and back.
    notice(grade = "normal", direction = 1, tier = null) {
      const stage = this.scenery?.stage;
      const station = this.presentation.kind === "normal" && stage !== "同人音楽即売会" && stage !== "クラブのラウンジ";
      if (station && this.atmosphere) this.atmosphere.runTrain(grade, direction, tier);
      else this.rush({ duration: grade === "normal" ? 0.8 : 1.0, strength: grade === "normal" ? 0.55 : grade === "express" ? 0.85 : 1.05, returns: true });
      if (grade === "gold") {
        window.setTimeout(() => this.impact({ strength: 0.6, hold: 0, color: 0xffc247, rays: 0.8, flash: 0.35, disturb: false }), station ? 620 : 420);
      }
    }

    rush({ duration = 0.8, strength = 1, returns = true } = {}) {
      this.rushFx = { at: performance.now(), duration, strength, returns };
    }

    develop({ rushMs = 650 } = {}) {
      this.rush({ duration: rushMs / 1000 + 0.85, strength: 1.25, returns: false });
      this.nextWipeType = 1;
      // Black hold while "発展" flies in; the release lands with the title.
      window.setTimeout(() => this.impact({ strength: 0.45, hold: 0.3, color: 0xffb43b, rays: 0.2, flash: 0.35 }), rushMs);
    }

    // 50G stage change: travel through the old stage into the new one.
    stageTravel() {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      this.captureTransition(3);
      this.arriveFx = { at: performance.now() };
    }

    // BIG progress (coins / limit, already on screen): an orbit at the
    // halfway mark and a faster tunnel over the final stretch.
    bonusProgress(ratio = 0) {
      const previous = this.lastBonusRatio ?? 0;
      if (ratio < previous - 0.05) this.halfwayDone = false;
      if (!this.halfwayDone && previous < 0.5 && ratio >= 0.5 && ratio < 1) {
        this.halfwayDone = true;
        this.orbitFx = { at: performance.now() };
        this.impact({ strength: 0.5, hold: 0, color: this.theme.primary.getHex(), rays: 0.7, flash: 0.3 });
      }
      this.finalStretch = ratio >= 0.85 && ratio < 1;
      this.lastBonusRatio = ratio;
    }

    // Bonus result: the camera pulls back out of the tunnel while counting.
    resultPullout(durationMs = 4000) {
      this.pulloutFx = { at: performance.now(), duration: Math.min(4, durationMs / 1000) };
    }

    // Normal stages: five authored angles per stage, cut every 15 seconds on
    // the wall clock alone (no lever / button input involved), each with a
    // slow dolly across its 15 seconds.
    applyNormalShot(now) {
      if (this.presentation.kind !== "normal" || this.presentationWeights.normal < 0.5 || !this.cabinetWorld?.stageKit) return;
      const stage = this.scenery?.stage;
      const key = stage === "同人音楽即売会" ? "hall" : stage === "クラブのラウンジ" ? "lounge" : "station";
      const shots = NORMAL_SHOTS[key];
      const slot = Math.floor(now / SHOT_SECONDS / 1000);
      const [px, py, pz, lx, ly, lz, fov, dx, dy, dz] = shots[slot % shots.length];
      const t = smooth((now / 1000 % SHOT_SECONDS) / SHOT_SECONDS);
      const sx = key === "station" ? 1 : this.cabinetWorld.structures[key]?.group.scale.x || 1;
      this.camera.position.set((px + dx * t) * sx, py + dy * t, pz + dz * t);
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt((lx + dx * t * 0.5) * sx, ly + dy * t * 0.5, lz + dz * t);
    }

    applyCameraMoves(now, dt) {
      const camera = this.camera;
      let fov = 0, rushAmount = 0;
      const rush = this.rushFx;
      if (rush) {
        const t = (now - rush.at) / 1000 / rush.duration;
        if (t >= 1) this.rushFx = null;
        else {
          const envelope = rush.returns ? Math.sin(Math.PI * Math.min(1, t)) : Math.min(1, t * 2.2);
          rushAmount = envelope * rush.strength;
          // A returning dash nudges forward and back; a develop rush keeps
          // accelerating down the stage until the cut.
          camera.position.z -= rush.returns ? rushAmount * 4.5 : rush.strength * 22 * t * t;
          fov += rushAmount * 24;
        }
      }
      const arrive = this.arriveFx;
      if (arrive) {
        const t = (now - arrive.at) / 900;
        if (t >= 1) this.arriveFx = null;
        else { const k = (1 - t) ** 2; camera.position.z += k * 7; fov += k * 18; rushAmount = Math.max(rushAmount, k * 0.9); }
      }
      const orbit = this.orbitFx;
      if (orbit) {
        const t = (now - orbit.at) / 1700;
        if (t >= 1) this.orbitFx = null;
        else {
          const angle = smooth(t) * Math.PI * 2, reach = Math.sin(Math.PI * t);
          camera.position.x += Math.sin(angle) * 3.2 * reach;
          camera.position.y += (1 - Math.cos(angle)) * 0.5 * reach;
          camera.lookAt(0.4, -0.2, -16);
        }
      }
      const pullout = this.pulloutFx;
      if (pullout) {
        const t = (now - pullout.at) / 1000 / pullout.duration;
        if (t >= 1.2) this.pulloutFx = null;
        else { const k = smooth(clamp(t, 0, 1)); camera.position.z += k * 9; fov -= k * 8; }
      }
      this.rushAmount = rushAmount;
      this.speedBoost = 1 + rushAmount * 6 + (this.finalStretch && this.presentation.kind === "bonus" ? 0.7 : 0);
      if (fov) { camera.fov = clamp(camera.fov + fov, 20, 110); camera.updateProjectionMatrix(); }
    }

    // Starts a hold → release beat. `hold` seconds of darkening and a slow
    // push-in precede the hit; the hit itself whites out, rings and settles.
    impact(options = {}) {
      const { THREE } = this;
      const now = performance.now();
      const hold = clamp(Number(options.hold) || 0, 0, 1.2);
      const strength = clamp(Number(options.strength) || 1, 0, 1.5);
      if (this.impactFx && now < this.impactFx.releaseAt + 180 && this.impactFx.strength > strength) return;
      this.impactFx = {
        startedAt: now,
        releaseAt: now + hold * 1000,
        hold,
        strength,
        color: new THREE.Color(options.color ?? 0xffffff),
        rays: clamp(Number(options.rays) || 0, 0, 1.5),
        flash: clamp(options.flash ?? 1, 0, 1.5),
        disturb: options.disturb ?? true,
        released: false,
      };
      // DOM lettering sits above the canvas; let it sink with the hold too.
      if (hold > 0) this.host.closest(".lcd-screen")?.setAttribute("data-impact-hold", "");
    }

    updateImpact(now) {
      const uniforms = this.impactMaterial.uniforms;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const weights = this.presentationWeights;
      let bloom = 0.1 * weights.normal + 0.15 * weights.challenge + 0.15 * weights.bonus + 0.17 * weights.boost
        + this.eventPulse * 0.02;
      let hold = 0, zoom = 1, flash = 0, rays = 0, age = 99, strength = 0, shake = 0;
      const fx = this.impactFx;
      if (fx) {
        if (now < fx.releaseAt) {
          const progress = clamp((now - fx.startedAt) / Math.max(1, fx.releaseAt - fx.startedAt), 0, 1);
          hold = smooth(clamp(progress * 2.4, 0, 1)) * Math.min(1, 0.55 + fx.hold);
          zoom = 1 + progress * progress * 0.03 * fx.strength;
        } else {
          if (!fx.released) {
            fx.released = true;
            this.host.closest(".lcd-screen")?.removeAttribute("data-impact-hold");
            if (fx.disturb) this.pulse(2.2 * fx.strength);
          }
          age = (now - fx.releaseAt) / 1000;
          strength = fx.strength;
          hold = Math.min(1, 0.55 + fx.hold) * Math.exp(-age * 22);
          flash = fx.flash * fx.strength * Math.exp(-age * 11) * 0.9;
          zoom = 1 + fx.strength * 0.055 * Math.exp(-age * 5.5) * (1 - Math.exp(-age * 40));
          rays = fx.rays * fx.strength * Math.exp(-age * 2.1);
          shake = fx.strength * 0.0055 * Math.exp(-age * 8);
          bloom += fx.strength * 0.42 * Math.exp(-age * 3);
          if (age > 2.6) this.impactFx = null;
        }
        uniforms.uImpactColor.value.copy(fx.color);
      }
      const kick = this.music.kick * this.music.active;
      bloom += kick * 0.1;
      const board = this.board || {};
      const rippleAge = board.rippleAt ? (now - board.rippleAt) / 1000 : 99;
      const stopAge = board.stopAt ? (now - board.stopAt) / 1000 : 99;
      uniforms.uRipple.value.set(rippleAge, rippleAge < 1 ? 1 : 0);
      uniforms.uStop.value.set(board.stopX ?? 0.5, stopAge, stopAge < 1 ? 1 : 0);
      const grade = this.atmosphere?.grade;
      uniforms.uContrast.value = grade ? grade.contrast : 0;
      if (grade) uniforms.uTint.value.copy(grade.tint);
      uniforms.uPulse.value = kick * 0.05;
      uniforms.uTime.value = now / 1000;
      uniforms.uAnamorphic.value = 0.22 * weights.normal + 0.26 * weights.challenge + 0.24 * weights.bonus + 0.3 * weights.boost
        + (fx && fx.released ? fx.strength * 0.5 * Math.exp(-age * 2.5) : 0) + kick * 0.12 + (this.rushAmount || 0) * 0.35;
      uniforms.uFloor.value = this.lowQuality ? 0 : weights.bonus;
      if (this.lowQuality) uniforms.uAnamorphic.value *= 0.5;
      const wipeAge = this.wipe ? (now - this.wipe.at) / 1000 : 99;
      uniforms.uWipe.value = reduced ? 1 : clamp(wipeAge / (this.wipe?.type === 3 ? 0.8 : 0.55), 0, 1);
      if (this.wipe) uniforms.uWipeType.value = this.wipe.type;
      const display = this.displayMaterial.uniforms;
      display.uDof.value = reduced || this.lowQuality ? 0 : 0.45 * weights.normal + 0.6 * weights.challenge + 0.75 * weights.bonus + 0.5 * weights.boost;
      display.uFocus.value = 0.1 * weights.normal + 0.09 * weights.challenge + 0.06 * weights.bonus + 0.08 * weights.boost;
      if (reduced) { zoom = 1; shake = 0; flash *= 0.4; uniforms.uRipple.value.y = 0; }
      uniforms.uWarp.value = reduced ? 0 : 1;
      uniforms.uBloomStrength.value = bloom;
      uniforms.uImpactAge.value = age;
      uniforms.uImpactStrength.value = strength;
      uniforms.uHold.value = hold;
      uniforms.uFlash.value = flash;
      uniforms.uRays.value = rays;
      uniforms.uZoom.value = zoom;
      uniforms.uShake.value.set(Math.sin(now * 0.093) * shake, Math.cos(now * 0.117) * shake * 0.7);
    }

    renderImpact(now) {
      const renderer = this.renderer;
      const autoClear = renderer.autoClear;
      this.updateImpact(now);
      // Bloom mip chain: threshold into the first level, then downsample.
      let source = this.compositeTarget;
      this.fxQuad.material = this.bloomDownMaterial;
      this.bloomTargets.forEach((target, index) => {
        this.bloomDownMaterial.uniforms.uTexture.value = source.texture;
        this.bloomDownMaterial.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
        this.bloomDownMaterial.uniforms.uPrefilter.value = index === 0 ? 1 : 0;
        renderer.setRenderTarget(target);
        renderer.render(this.fxScene, this.postCamera);
        source = target;
      });
      // Tent upsample accumulates each coarser level into the finer one.
      renderer.autoClear = false;
      this.fxQuad.material = this.bloomUpMaterial;
      for (let index = this.bloomTargets.length - 1; index > 0; index -= 1) {
        const from = this.bloomTargets[index];
        this.bloomUpMaterial.uniforms.uTexture.value = from.texture;
        this.bloomUpMaterial.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
        this.bloomUpMaterial.uniforms.uWeight.value = 0.85;
        renderer.setRenderTarget(this.bloomTargets[index - 1]);
        renderer.render(this.fxScene, this.postCamera);
      }
      renderer.autoClear = autoClear;
      this.fxQuad.material = this.impactMaterial;
      this.impactMaterial.uniforms.uScene.value = this.compositeTarget.texture;
      this.impactMaterial.uniforms.uBloom.value = this.bloomTargets[0].texture;
      this.impactMaterial.uniforms.uStreak.value = this.bloomTargets[2].texture;
      this.impactMaterial.uniforms.uPrev.value = this.transitionTarget.texture;
      renderer.setRenderTarget(null);
      renderer.render(this.fxScene, this.postCamera);
      this.sampleGlow(now);
    }

    // Colour the cabinet lamps with the light the panel is actually emitting:
    // a tiny left / centre / right read of the bloom chain every few frames.
    // Colour the cabinet lamps with the light the panel is actually emitting:
    // a tiny left / centre / right read of the bloom chain. The read is
    // asynchronous (pixel-pack buffer + fence) so the GPU never stalls the
    // frame; without WebGL2 the lamps follow the theme colour instead.
    sampleGlow(now) {
      const renderer = this.renderer, gl = renderer.getContext();
      const async = renderer.capabilities.isWebGL2 && typeof gl.fenceSync === "function";
      if (this.glowFence) {
        const status = gl.clientWaitSync(this.glowFence, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) return;
        gl.deleteSync(this.glowFence);
        this.glowFence = null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.glowPbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.glowPixels);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        this.applyGlow();
      }
      if (now - (this.glowSampledAt || 0) < 120) return;
      this.glowSampledAt = now;
      if (!async) { this.glowPixels.fill(0); this.applyGlow(); return; }
      this.fxQuad.material = this.bloomDownMaterial;
      const source = this.bloomTargets[3];
      this.bloomDownMaterial.uniforms.uTexture.value = source.texture;
      this.bloomDownMaterial.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
      this.bloomDownMaterial.uniforms.uPrefilter.value = 0;
      renderer.setRenderTarget(this.glowTarget);
      renderer.render(this.fxScene, this.postCamera);
      if (!this.glowPbo) {
        this.glowPbo = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.glowPbo);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, this.glowPixels.byteLength, gl.STREAM_READ);
      }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.glowPbo);
      gl.readPixels(0, 0, 8, 2, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.glowFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      renderer.setRenderTarget(null);
      this.fxQuad.material = this.impactMaterial;
    }

    applyGlow() {
      const px = this.glowPixels, base = this.theme.primary;
      const zone = (from, to) => {
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < 2; y += 1) for (let x = from; x < to; x += 1) { const i = (y * 8 + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n += 1; }
        const k = 2.6 / n;
        return [r * k + base.r * 46, g * k + base.g * 46, b * k + base.b * 46].map(v => Math.round(clamp(v, 0, 255)));
      };
      const root = document.documentElement.style;
      const left = zone(0, 3), centre = zone(3, 5), right = zone(5, 8);
      const level = clamp((centre[0] + centre[1] + centre[2]) / 420, 0.15, 1);
      root.setProperty("--glow-l", left.join(" "));
      root.setProperty("--glow-c", centre.join(" "));
      root.setProperty("--glow-r", right.join(" "));
      root.setProperty("--glow-i", level.toFixed(3));
    }

    // Compile every shader and upload every texture up front, once per light
    // configuration a stage can show, so no scene change stalls on first use.
    warmup() {
      if (this.disposed) return;
      const renderer = this.renderer, world = this.cabinetWorld;
      const hidden = [];
      const reveal = object => { if (!object.visible) { hidden.push(object); object.visible = true; } };
      try {
        // Light-free presentation layers can be visible for every pass.
        [this.world, this.challengeField, this.bonusTunnel, this.boostStreaks, this.atmosphere?.group].forEach(o => o && reveal(o));
        this.atmosphere?.group.traverse(reveal);
        const structures = Object.values(world?.structures || {}).map(profile => profile.group);
        const configurations = [world?.stationStage, ...structures].filter(Boolean);
        for (const active of configurations) {
          for (const group of configurations) group.visible = group === active;
          active.traverse(object => { if (object !== active && !object.visible) { hidden.push(object); object.visible = true; } });
          renderer.compile(this.scene, this.camera);
        }
        for (const texture of this.textures) renderer.initTexture?.(texture);
        this.title3D?.warm?.(renderer);
      } catch (error) {
        console.warn("描画の事前準備に失敗しました", error);
      } finally {
        hidden.forEach(object => { object.visible = false; });
      }
    }

    // Keep the LCD fluid on slower GPUs: step the render resolution down once
    // frames run long, then drop the costliest optical passes.
    adaptQuality(now, frameMs) {
      this.qualitySamples ||= [];
      this.qualitySamples.push(frameMs);
      if (now - (this.qualityCheckedAt || 0) < 2500) return;
      this.qualityCheckedAt = now;
      const samples = this.qualitySamples.sort((a, b) => a - b);
      this.qualitySamples = [];
      const typical = samples[Math.floor(samples.length * 0.75)] || 0;
      if (typical < 24 || document.hidden) return;
      const ratio = this.renderer.getPixelRatio();
      if (ratio > 1.01) {
        this.renderer.setPixelRatio(Math.max(1, ratio - 0.25));
        this.forceResize = true;
        this.resize();
      } else if (!this.lowQuality) {
        this.lowQuality = true;
      }
    }

    captureTransition(type) {
      if (!this.transitionTarget || !this.compositeTarget) return;
      const renderer = this.renderer;
      const previousTarget = renderer.getRenderTarget();
      this.fxQuad.material = this.bloomDownMaterial;
      this.bloomDownMaterial.uniforms.uTexture.value = this.compositeTarget.texture;
      this.bloomDownMaterial.uniforms.uTexel.value.set(0.25 / this.compositeTarget.width, 0.25 / this.compositeTarget.height);
      this.bloomDownMaterial.uniforms.uPrefilter.value = 0;
      renderer.setRenderTarget(this.transitionTarget);
      renderer.render(this.fxScene, this.postCamera);
      renderer.setRenderTarget(previousTarget);
      this.fxQuad.material = this.impactMaterial;
      this.wipe = { at: performance.now(), type };
    }

    makeRenderTarget(width, height, depthBuffer = false) {
      const { THREE } = this;
      const target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer,
        stencilBuffer: false,
      });
      if (depthBuffer) {
        target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedShortType);
        target.depthTexture.format = THREE.DepthFormat;
      }
      target.texture.generateMipmaps = false;
      if (depthBuffer && this.renderer.capabilities.isWebGL2) target.samples = 2;
      this.renderTargets.push(target);
      return target;
    }

    resize() {
      if (this.disposed) return;
      const width = Math.max(1, this.host.clientWidth);
      const height = Math.max(1, this.host.clientHeight);
      this.width = width;
      this.height = height;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);

      const bufferWidth = Math.max(2, Math.floor(width * FEEDBACK_SCALE));
      const bufferHeight = Math.max(2, Math.floor(height * FEEDBACK_SCALE));
      if (this.forceResize || !this.sceneTarget || this.sceneTarget.width !== bufferWidth || this.sceneTarget.height !== bufferHeight) {
        this.forceResize = false;
        this.renderTargets.forEach((target) => target.dispose());
        this.renderTargets = [];
        this.sceneTarget = this.makeRenderTarget(bufferWidth, bufferHeight, true);
        this.feedbackRead = this.makeRenderTarget(bufferWidth, bufferHeight);
        this.feedbackWrite = this.makeRenderTarget(bufferWidth, bufferHeight);
        this.feedbackMaterial.uniforms.uResolution.value.set(bufferWidth, bufferHeight);
        this.displayMaterial.uniforms.uResolution.value.set(width, height);
        const ratio = this.renderer.getPixelRatio();
        const fullWidth = Math.max(2, Math.floor(width * ratio));
        const fullHeight = Math.max(2, Math.floor(height * ratio));
        this.compositeTarget = this.makeFxTarget(fullWidth, fullHeight, { depth: true, samples: 4 });
        this.bloomTargets = [];
        for (let level = 1; level <= 5; level += 1) {
          this.bloomTargets.push(this.makeFxTarget(
            Math.max(2, Math.floor(fullWidth / 2 ** level)),
            Math.max(2, Math.floor(fullHeight / 2 ** level)),
          ));
        }
        this.impactMaterial.uniforms.uResolution.value.set(fullWidth, fullHeight);
        this.transitionTarget = this.makeFxTarget(fullWidth, fullHeight);
        this.glowTarget = this.makeRenderTarget(8, 2);
        this.glowPixels = new Uint8Array(8 * 2 * 4);
        this.clearFeedback();
      }
    }

    clearFeedback() {
      if (!this.renderer || !this.feedbackRead || !this.feedbackWrite) return;
      const previousTarget = this.renderer.getRenderTarget();
      const previousColor = this.renderer.getClearColor(new this.THREE.Color());
      const previousAlpha = this.renderer.getClearAlpha();
      this.renderer.setClearColor(0x000000, 1);
      [this.sceneTarget, this.feedbackRead, this.feedbackWrite].forEach((target) => {
        this.renderer.setRenderTarget(target);
        this.renderer.clear(true, true, true);
      });
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setClearColor(previousColor, previousAlpha);
    }

    setEnergy(intensity, burst = 0) {
      this.energy.intensity = clamp(Number(intensity) || 0, 0, 1.5);
      this.energy.burst = clamp(Number(burst) || 0, 0, 6);
    }

    pulse(strength = 1) {
      this.eventPulse = Math.max(this.eventPulse, clamp(strength, 0, 5));
      this.cutPulse = Math.max(this.cutPulse, clamp(strength * 0.32, 0, 1));
    }

    setPresentation(kind = "normal", variant = 0, options = {}) {
      const nextKind = PRESENTATION_KEYS.includes(kind) ? kind : "normal";
      const changed = this.presentation.kind !== nextKind || this.presentation.variant !== variant;
      if (this.presentation.kind !== nextKind && !options.immediate) {
        this.captureTransition(this.nextWipeType ?? (nextKind === "challenge" ? 0 : nextKind === "bonus" ? 1 : 2));
        this.nextWipeType = null;
      }
      this.presentation = { kind: nextKind, variant: Number(variant) || 0 };
      PRESENTATION_KEYS.forEach((key) => {
        this.presentationTargets[key] = key === nextKind ? 1 : 0;
        if (options.immediate) this.presentationWeights[key] = this.presentationTargets[key];
      });
      this.presentationResponse = Math.max(1, 4 / Math.max(0.12, options.duration ?? 0.58));
      if (changed) {
        this.pulse(options.pulse ?? 1.35);
        if (options.clearFeedback) this.clearFeedback();
      }
    }

    updatePresentation(dt) {
      const response = 1 - Math.exp(-dt * this.presentationResponse);
      PRESENTATION_KEYS.forEach((key) => {
        this.presentationWeights[key] += (this.presentationTargets[key] - this.presentationWeights[key]) * response;
      });
    }

    setTheme(theme = {}, options = {}) {
      const signature = JSON.stringify(theme);
      if (!options.immediate && signature === this.themeSignature) return;
      this.themeSignature = signature;
      const { THREE } = this;
      const now = performance.now();
      this.updateTheme(now);
      this.themeFrom = this.cloneTheme(this.theme);
      const color = (value, fallback) => value instanceof THREE.Color ? value : new THREE.Color(value ?? fallback);
      this.themeTarget = {
        primary: color(theme.primaryColor, this.theme.primary),
        secondary: color(theme.secondaryColor, this.theme.secondary),
        accent: color(theme.accentColor, this.theme.accent),
        background: color(theme.backgroundColor, this.theme.background),
        emission: theme.emissionIntensity ?? this.theme.emission,
        saturation: theme.saturation ?? this.theme.saturation,
        exposure: theme.exposure ?? this.theme.exposure,
        effect: theme.effectIntensity ?? this.theme.effect,
      };
      this.themeStartedAt = now;
      this.themeDuration = options.immediate ? 0 : Math.max(0, (options.duration ?? 0.65) * 1000);
      this.themeEasing = options.easing || "smooth";
      if (this.themeDuration === 0) this.updateTheme(now);
    }

    updateTheme(now) {
      const linearProgress = this.themeDuration <= 0
        ? 1
        : clamp((now - this.themeStartedAt) / this.themeDuration, 0, 1);
      const progress = this.themeEasing === "linear" ? linearProgress : smooth(linearProgress);
      ["primary", "secondary", "accent", "background"].forEach((key) => {
        this.theme[key].copy(this.themeFrom[key]).lerp(this.themeTarget[key], progress);
      });
      ["emission", "saturation", "exposure", "effect"].forEach((key) => {
        this.theme[key] = this.themeFrom[key] + (this.themeTarget[key] - this.themeFrom[key]) * progress;
      });
    }

    updateCamera(phase, time) {
      const variant = this.presentation.variant;
      if (this.presentation.kind === "challenge") {
        const side = variant === 1 ? 1 : variant === 2 ? -1 : 0.35;
        this.camera.position.set(
          side * (2.3 + Math.sin(time * 0.55) * 0.8),
          Math.cos(time * 0.38 + variant) * 0.7,
          8.2 - Math.sin(time * 0.7) * 0.7,
        );
        this.camera.fov = 54 + Math.sin(time * 1.4) * 3 + this.cutPulse * 8;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(variant === 2 ? 1.4 : -0.6, variant === 1 ? -0.5 : 0.25, -10);
        return;
      }
      if (this.presentation.kind === "bonus") {
        // E12: cut between tunnel shots on bar heads of the playing BGM.
        const shot = BONUS_SHOTS[this.bonusBarCut(time)];
        this.camera.position.set(
          shot[0] + Math.sin(time * 0.48 + variant) * 0.35,
          shot[1] + Math.cos(time * 0.39) * 0.18,
          shot[2] - phase.speed * phase.local * 1.8,
        );
        this.camera.fov = shot[5] + (variant === 2 ? 10 : 0) + this.cutPulse * 7;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(shot[3], shot[4], -16);
        return;
      }
      if (this.presentation.kind === "boost") {
        const upper = variant > 0 ? 1.15 : 1;
        this.camera.position.set(
          Math.sin(time * 0.34 * upper) * (0.62 + variant * 0.12),
          Math.cos(time * 0.27) * (0.20 + variant * 0.05),
          6.35 + Math.sin(time * 0.41) * 0.16,
        );
        this.camera.fov = 66 + upper * 3.5 + this.cutPulse * 2;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(Math.sin(time * 0.28) * (0.75 + variant * 0.25), Math.cos(time * 0.22) * 0.18, -24);
        return;
      }
      const local = smooth(phase.local);
      const cameraCuts = [
        [-2.8, 1.1, 12.8, 46],
        [2.4, -0.7, 10.6, 50],
        [-1.1, 0.4, 7.4, 58],
        [3.2, 1.5, 8.8, 44],
        [-3.7, -1.0, 5.2, 66],
        [0.4, 0.1, 4.1, 78],
        [4.6, -1.8, 13.5, 39],
        [-1.9, 0.8, 10.8, 52],
      ];
      const current = cameraCuts[phase.index];
      const travel = phase.speed * local;
      this.camera.position.set(
        current[0] + Math.sin(time * 0.21 + phase.index) * (0.08 + phase.disorder * 0.42),
        current[1] + Math.cos(time * 0.17) * (0.05 + phase.disorder * 0.22),
        current[2] - travel * 3.8,
      );
      this.camera.fov = current[3] + this.cutPulse * 9;
      this.camera.updateProjectionMatrix();
      const targetX = phase.index === 6 ? -2.5 : phase.index % 2 ? -0.8 : 1.2;
      const targetY = phase.index === 4 ? 1.1 : 0;
      this.camera.lookAt(targetX, targetY, -9 - travel * 5);
    }

    // Picks the bonus shot. With BGM playing, a cut lands on the first kick
    // after two bars (or one bar of a slow track); without it, on a timer.
    bonusBarCut(time) {
      const music = this.music;
      const cut = this.bonusCut ||= { at: -Infinity, shot: 0, clock: null };
      const beat = music.active > 0.5 && music.beat > 0 ? music.beat : 0;
      const now = beat ? music.time : time;
      const interval = beat ? ([4, 8, 16].map((n) => n * beat).find((s) => s >= 2.8) || 16 * beat) : 4.5;
      const since = now - cut.at;
      const onBeat = beat && since > interval * 0.9 && (music.onset || 0) > 0.35;
      if (cut.clock !== Boolean(beat) || since < 0 || since > interval * 1.35 || onBeat || (!beat && since >= interval)) {
        const first = cut.clock === null;
        cut.clock = Boolean(beat);
        cut.at = now;
        if (!first) {
          // Local xorshift: presentation only, never the game's random source.
          let seed = (cut.seed ||= (Date.now() >>> 0) || 1);
          seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
          cut.seed = seed;
          cut.shot = (cut.shot + 1 + (seed % (BONUS_SHOTS.length - 1))) % BONUS_SHOTS.length;
          this.cutPulse = Math.max(this.cutPulse, 0.55);
        }
      }
      return cut.shot;
    }

    updatePresentationScenes(phase, time) {
      const challengeWeight = this.presentationWeights.challenge;
      const bonusWeight = this.presentationWeights.bonus;
      const boostWeight = this.presentationWeights.boost;
      const variant = this.presentation.variant;

      this.challengeField.visible = challengeWeight > 0.008;
      if (this.challengeField.visible) {
      this.challengeMaterial.uniforms.uTime.value = time;
      this.challengeMaterial.uniforms.uEnergy.value = clamp(phase.density + this.energy.intensity * 0.5 + this.eventPulse * 0.14, 0, 2);
      this.challengeMaterial.uniforms.uVariant.value = variant;
      this.challengeMaterial.uniforms.uProgress.value = Math.min(3, Math.max(this.scenery?.babaHits || 0, this.cabinetWorld?.babaCueHits || 0));
      this.challengeMaterial.uniforms.uOpacity.value = challengeWeight * (0.46 + phase.density * 0.5);
      this.challengeMaterial.uniforms.uPrimary.value.copy(this.theme.primary);
      this.challengeMaterial.uniforms.uSecondary.value.copy(this.theme.secondary);
      if(variant===0) {
        this.challengeMaterial.uniforms.uPrimary.value.set(0xff482e);
        this.challengeMaterial.uniforms.uSecondary.value.set(0x851b18);
      } else if(variant===1) {
        this.challengeMaterial.uniforms.uPrimary.value.set(0x8aaac8);
        this.challengeMaterial.uniforms.uSecondary.value.set(0x415671);
      }
      this.challengeField.rotation.z = Math.sin(time * 0.18) * 0.018;
      this.challengeField.scale.setScalar(1 + this.eventPulse * 0.015);
      }

      this.bonusTunnel.visible = bonusWeight > 0.008;
      if (this.bonusTunnel.visible) {
      this.bonusTunnelMaterial.color.copy(variant === 2 ? this.theme.secondary : this.theme.primary);
      this.bonusTunnelMaterial.opacity = bonusWeight * (0.28 + phase.density * 0.55);
      const tunnelSpeed = 8.2 + phase.speed * 6.4 + this.energy.intensity * 2.8;
      const tunnelPositions = this.bonusTunnelPositions;
      let cursor = 0;
      for (let index = 0; index < BONUS_TUNNEL_FRAMES; index += 1) {
        const travel = ((index * 1.62 + time * tunnelSpeed) % 45 + 45) % 45;
        const z = 4.2 - travel;
        const depth = travel / 45;
        const bigWidth = variant === 2 ? 1 : 1.42;
        const halfWidth = (2.25 + depth * 5.4) * bigWidth;
        const halfHeight = 1.12 + depth * 2.7;
        const roll = Math.sin(index * 0.57 + time * 0.7) * (0.08 + variant * 0.025);
        const centerX = Math.sin(index * 0.31 + variant * 1.7) * (0.18 + depth * 0.52);
        const centerY = Math.cos(index * 0.23 + time * 0.31) * 0.18;
        const corners = [
          [-halfWidth, -halfHeight], [halfWidth, -halfHeight],
          [halfWidth, -halfHeight], [halfWidth, halfHeight],
          [halfWidth, halfHeight], [-halfWidth, halfHeight],
          [-halfWidth, halfHeight], [-halfWidth, -halfHeight],
        ];
        for (let point = 0; point < corners.length; point += 1) {
          const x = corners[point][0];
          const y = corners[point][1];
          tunnelPositions[cursor++] = centerX + x - y * roll;
          tunnelPositions[cursor++] = centerY + y + x * roll;
          tunnelPositions[cursor++] = z;
        }
      }
      this.bonusTunnelAttribute.needsUpdate = true;
      }

      this.boostStreaks.visible = boostWeight > 0.008;
      if (this.boostStreaks.visible) {
      this.boostStreaks.material.color.copy(this.theme.secondary);
      this.boostStreaks.material.opacity = boostWeight * (0.12 + phase.density * 0.22);
      this.boostStreaks.count = Math.floor(BOOST_STREAK_COUNT * (variant > 0 ? .66 : .48));
      const boostSpeed = (variant > 0 ? 18 : 12) + this.energy.intensity * 2;
      for (let index = 0; index < BOOST_STREAK_COUNT; index += 1) {
        const seed = this.boostSeeds[index];
        const travel = ((seed.z + time * boostSpeed) % 52 + 52) % 52;
        const z = 5 - travel;
        const bend = Math.sin(time * 0.74 + seed.z * 0.12) * (0.35 + variant * 0.22);
        this.boostStreakPosition.set(seed.x + bend, seed.y + Math.cos(time * 0.51 + index) * 0.18, z);
        const proximity = 0.7 + clamp((5 - z) / 52, 0, 1) * 1.8;
        this.boostStreakScale.set(proximity, proximity, seed.length * (1 + this.eventPulse * 0.06));
        this.boostStreakMatrix.compose(this.boostStreakPosition, this.boostStreakQuaternion, this.boostStreakScale);
        this.boostStreaks.setMatrixAt(index, this.boostStreakMatrix);
      }
      this.boostStreaks.instanceMatrix.needsUpdate = true;
      }
    }

    updateWorld(phase, time, dt) {
      const density = clamp(phase.density * (0.84 + this.energy.intensity * 0.24) + this.eventPulse * 0.04, 0, 1);
      const disorder = clamp(phase.disorder + this.eventPulse * 0.12, 0, 1.35);
      const travel = time * phase.speed;
      for (let index = 0; index < RAIL_COUNT; index += 1) {
        const seed = this.railSeeds[index];
        const visible = seeded(index, 31) < density;
        const zCycle = ((seed.layer * 4.1 + travel * 5.2 + seed.offset * 2.4) % 35 + 35) % 35;
        const z = 4 - zCycle;
        const orderedX = seed.column * (0.72 + Math.max(0, -z) * 0.013);
        const phaseSlip = Math.sin(time * (0.31 + seed.offset * 0.1) + seed.layer * 0.82) * disorder;
        this.railPosition.set(
          orderedX + phaseSlip * (0.5 + Math.abs(seed.column) * 0.08),
          (seed.layer % 3 - 1) * 1.36 + Math.cos(time * 0.27 + index) * disorder * 0.34,
          z,
        );
        this.railEuler.set(
          disorder * seed.lean * 0.48,
          disorder * phaseSlip * 0.16,
          seed.column * 0.035 + disorder * seed.lean,
        );
        this.railQuaternion.setFromEuler(this.railEuler);
        const depthScale = 0.7 + clamp((4 - z) / 35, 0, 1) * 1.6;
        this.railScale.set(
          visible ? depthScale * (1 + disorder * seed.offset * 1.8) : 0.0001,
          visible ? depthScale : 0.0001,
          visible ? depthScale : 0.0001,
        );
        this.railMatrix.compose(this.railPosition, this.railQuaternion, this.railScale);
        this.rails.setMatrixAt(index, this.railMatrix);
      }
      this.rails.instanceMatrix.needsUpdate = true;
      this.rails.material.opacity = 0.2 + density * 0.56;
      this.rails.material.color.copy(this.theme.secondary);
      this.guideLines.material.color.copy(this.theme.accent);
      this.guideLines.material.opacity = 0.08 + density * 0.3;
      this.guideLines.position.z = ((travel * 2.2) % 2.25);
      this.guideLines.rotation.z = disorder * Math.sin(time * 0.19) * 0.12;

      this.slabs.forEach((slab, index) => {
        const data = slab.userData;
        const z = 5 - (((-data.baseZ + travel * (3.4 + index % 3)) % 38 + 38) % 38);
        slab.position.set(
          data.baseX + Math.sin(time * 0.23 + data.phase) * disorder * 1.8,
          data.baseY + Math.cos(time * 0.17 + data.phase) * disorder * 0.9,
          z,
        );
        slab.visible = seeded(index, 32) < density * 1.12;
        slab.scale.x = data.width * (1 + disorder * Math.sin(time * 0.4 + index) * 0.7);
      });
      if (this.slabs[0]) {
        this.slabs[0].material.color.copy(this.theme.primary);
        // Solid slabs read as clutter over the ring tunnel; thin them out there.
        this.slabs[0].material.opacity = (0.05 + density * 0.19) * (1 - this.presentationWeights.bonus * 0.7);
      }

      this.veilMaterial.uniforms.uTime.value = time;
      this.veilMaterial.uniforms.uDensity.value = density;
      this.veilMaterial.uniforms.uDisorder.value = disorder;
      this.veilMaterial.uniforms.uPrimary.value.copy(this.theme.primary);
      this.veilMaterial.uniforms.uSecondary.value.copy(this.theme.secondary);
      this.veils.forEach((veil, index) => {
        veil.visible = index / this.veils.length < density + 0.1;
        veil.position.z = -2 - index * 3.2 + Math.sin(time * 0.18 + index) * disorder * 1.2;
        veil.rotation.z += dt * (index % 2 ? -1 : 1) * disorder * 0.035;
      });

      this.debris.material.color.copy(this.theme.secondary);
      this.debris.material.opacity = 0.12 + density * 0.5;
      this.debris.position.z = (travel * 3.8) % 5.2;
      this.debris.rotation.z = Math.sin(time * 0.09) * disorder * 0.18;

      this.depthParticleMaterial.uniforms.uTime.value = time;
      this.depthParticleMaterial.uniforms.uFlow.value = phase.speed;
      this.depthParticleMaterial.uniforms.uDensity.value = density;
      this.depthParticleMaterial.uniforms.uPulse.value = this.eventPulse;
      this.depthParticleMaterial.uniforms.uOpacity.value = 0.05 + density * 0.24;
      this.depthParticleMaterial.uniforms.uPrimary.value.copy(this.theme.primary);
      this.depthParticleMaterial.uniforms.uSecondary.value.copy(this.theme.secondary);
      this.depthParticles.rotation.z = Math.sin(time * 0.055) * disorder * 0.045;

      const baseWeight = this.presentationWeights.normal
        + this.presentationWeights.challenge * 0.24
        + this.presentationWeights.bonus * 0.18
        + this.presentationWeights.boost * 0.42;
      this.rails.material.opacity *= baseWeight;
      this.guideLines.material.opacity *= baseWeight;
      this.debris.material.opacity *= 0.36 + baseWeight * 0.64;
      this.depthParticleMaterial.uniforms.uOpacity.value *= 0.28 + baseWeight * 0.72;
      this.veilMaterial.uniforms.uDensity.value *= 0.5 + baseWeight * 0.5;
      this.updatePresentationScenes(phase, time);

      this.shutters.forEach((shutter, index) => {
        const active = phase.index === 5 || phase.index === 6 || (phase.index === 4 && index < 2);
        shutter.visible = active;
        shutter.material.color.copy(this.theme.background);
        const edgeDistance = phase.index === 5
          ? 7.0 - phase.local * 6.2
          : phase.index === 6
            ? 6.5 - phase.local * 0.4
            : 7.4 - phase.local * 1.2;
        shutter.position.x = (index % 2 ? 1 : -1) * edgeDistance;
        shutter.position.y = (index - 1.5) * 1.45 + Math.sin(time * 0.8 + shutter.userData.phase) * disorder;
      });

      this.world.rotation.z = phase.index === 5
        ? (phase.local < 0.45 ? -0.32 : 0.21)
        : Math.sin(time * 0.07) * 0.025 + disorder * 0.03;
      this.world.scale.set(1 + this.cutPulse * 0.1, 1 - this.cutPulse * 0.04, 1);
      this.scene.fog.color.copy(this.theme.background);
      this.renderer.setClearColor(this.theme.background, 1);
      return { density, disorder };
    }

    renderFrame(now) {
      if (!this.running || this.disposed) return;
      const frozen = Boolean(this.freezeUntil && now < this.freezeUntil);
      this.adaptQuality(now, now - this.previousAt);
      const frameDt = Math.min(0.05, Math.max(0.001, (now - this.previousAt) / 1000));
      if (frozen) this.frozenMs = (this.frozenMs || 0) + frameDt * 1000;
      const dt = frozen ? 0.0001 : frameDt;
      this.previousAt = now;
      const runningTime = (now - this.startedAt - (this.frozenMs || 0)) / 1000;
      if (!this.cabinetWorld?.waiting) this.battleHeldTime = null;
      else if (this.battleHeldTime == null) this.battleHeldTime = runningTime;
      const elapsed = this.battleHeldTime ?? runningTime;
      const cycleProgress = (elapsed % CYCLE_SECONDS) / CYCLE_SECONDS;
      const quiet = this.presentation.kind === "normal" && this.energy.intensity < .45 && this.eventPulse < .2;
      const cruising = this.presentation.kind === "boost";
      const bonusActive = this.presentation.kind === "bonus";
      const upperBoost = cruising && this.presentation.variant > 0;
      // BONUS is a continuous one-shot composition: no shared 24-second phase cuts.
      // Boost also holds one visual language, but uses denser parallax and travel.
      const phase = bonusActive
        ? {
          ...phaseAt(.40),
          index: 2,
          local: .68,
          density: this.presentation.variant === 2 ? .52 : .72,
          disorder: this.presentation.variant === 2 ? .11 : .17,
          speed: this.presentation.variant === 2 ? .56 : 1.0,
          feedback: this.presentation.variant === 2 ? .16 : .22,
          exposure: this.presentation.variant === 2 ? .94 : 1.02,
        }
        : cruising
          ? {
            ...phaseAt(.40),
            index: 3,
            local: .72,
            density: upperBoost ? .64 : .48,
            disorder: upperBoost ? .12 : .08,
            speed: upperBoost ? .95 : .72,
            feedback: upperBoost ? .24 : .18,
            exposure: upperBoost ? .98 : .92,
          }
          : phaseAt(quiet || (this.presentation.kind === "normal" && this.cabinetWorld?.stageKit) ? .04 : cycleProgress);
      if (phase.index !== this.lastPhase) {
        if (phase.index === 5) this.cutPulse = 1;
        if (phase.index === 6) this.clearFeedback();
        this.lastPhase = phase.index;
      }
      this.cutPulse = Math.max(0, this.cutPulse - dt * 2.8);
      this.eventPulse = Math.max(0, this.eventPulse - dt * 1.4);
      this.updateTheme(now);
      this.updatePresentation(dt);
      this.music.update(dt);
      const dynamics = this.options.getDynamics?.();
      if (dynamics) this.setEnergy(dynamics.intensity, dynamics.burst);
      this.updateCamera(phase, quiet ? elapsed * .03 : elapsed);
      const visual = this.updateWorld(phase, quiet ? elapsed * .03 : elapsed, quiet ? dt * .03 : dt);
      // Distinct room silhouettes must not be obscured by the station's abstract rails/veils.
      // The furnished stages carry the normal screen; the abstract rails / veils
      // stay for CZ, bonus and boost (and as a fallback without the stage kit).
      this.world.visible = !(this.presentation.kind === 'normal' && (this.cabinetWorld?.stageKit || ['同人音楽即売会', 'クラブのラウンジ'].includes(this.scenery?.stage)));
      if (this.battleEnabled) visual.disorder *= .3;
      this.cabinetWorld?.update(dt, elapsed);
      this.applyNormalShot(now);
      // Camera moves run after the world, which re-frames the camera per room.
      if (this.cutOffset) {
        // Hard cut in on the third stop, ease back out after the next lever.
        if (!this.cutTarget) this.cutOffset.multiplyScalar(Math.exp(-dt * 3));
        this.camera.position.add(this.cutOffset);
        if (this.cutOffset.lengthSq() < 0.0004 && !this.cutTarget) this.cutOffset = null;
      }
      this.applyCameraMoves(now, dt);
      const musicKick = this.music.kick * this.music.active;
      if (musicKick > 0.01 && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        this.camera.fov -= musicKick * 1.3;
        this.camera.updateProjectionMatrix();
      }
      this.atmosphere?.update(dt, runningTime, this.music);
      const structureClarity = this.presentation.kind === 'normal'
        ? (['同人音楽即売会','クラブのラウンジ'].includes(this.scenery?.stage) ? 1 : 0)
        : this.presentation.kind === 'boost' ? .65 : .82;

      const feedback = clamp((phase.feedback + this.energy.burst * 0.035) * this.theme.effect, 0, 0.88);
      const exposure = phase.exposure * this.theme.exposure * (1 + this.energy.intensity * 0.11 + this.eventPulse * 0.05);
      this.renderer.info.reset();
      this.renderer.setRenderTarget(this.sceneTarget);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, this.camera);

      this.feedbackMaterial.uniforms.uCurrent.value = this.sceneTarget.texture;
      this.feedbackMaterial.uniforms.uPrevious.value = this.feedbackRead.texture;
      this.feedbackMaterial.uniforms.uTime.value = elapsed;
      this.feedbackMaterial.uniforms.uFeedback.value = feedback;
      this.feedbackMaterial.uniforms.uDisorder.value = visual.disorder * (1 - structureClarity * .65);
      this.feedbackMaterial.uniforms.uCut.value = this.cutPulse;
      this.renderer.setRenderTarget(this.feedbackWrite);
      this.renderer.render(this.feedbackScene, this.postCamera);

      this.displayMaterial.uniforms.uTexture.value = this.feedbackWrite.texture;
      this.displayMaterial.uniforms.uDepth.value = this.sceneTarget.depthTexture;
      this.displayMaterial.uniforms.uTime.value = elapsed;
      this.displayMaterial.uniforms.uPrimary.value.copy(this.theme.primary);
      this.displayMaterial.uniforms.uSecondary.value.copy(this.theme.secondary);
      this.displayMaterial.uniforms.uExposure.value = exposure * this.theme.emission;
      this.displayMaterial.uniforms.uSaturation.value = this.theme.saturation;
      this.displayMaterial.uniforms.uDisorder.value = visual.disorder;
      this.displayMaterial.uniforms.uDensity.value = visual.density;
      this.displayMaterial.uniforms.uCut.value = this.cutPulse;
      this.displayMaterial.uniforms.uClarity.value = structureClarity;
      this.renderer.setRenderTarget(this.compositeTarget);
      this.renderer.render(this.displayScene, this.postCamera);
      this.title3D?.render(now);
      this.renderImpact(now);

      const swap = this.feedbackRead;
      this.feedbackRead = this.feedbackWrite;
      this.feedbackWrite = swap;
      this.metricsFrames += 1;
      if (now - this.lastMetricsAt >= 1000) {
        const elapsedMetrics = (now - this.lastMetricsAt) / 1000;
        const info = this.renderer.info;
        document.documentElement.dataset.abstractSceneMetrics = JSON.stringify({
          fps: Math.round(this.metricsFrames / elapsedMetrics),
          frameTimeMs: Number((elapsedMetrics * 1000 / Math.max(1, this.metricsFrames)).toFixed(2)),
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          points: info.render.points,
          renderTargets: this.renderTargets.length,
          feedbackScale: FEEDBACK_SCALE,
          phase: phase.index,
        });
        this.metricsFrames = 0;
        this.lastMetricsAt = now;
      }
      this.rafId = requestAnimationFrame((time) => this.renderFrame(time));
    }

    start() {
      if (this.running || this.disposed) return;
      if (!this.warmedUp) { this.warmedUp = true; window.setTimeout(() => this.warmup(), 600); }
      this.running = true;
      this.previousAt = performance.now();
      this.rafId = requestAnimationFrame((time) => this.renderFrame(time));
    }

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    getMetrics() {
      try {
        return JSON.parse(document.documentElement.dataset.abstractSceneMetrics || "null");
      } catch {
        return null;
      }
    }

    setTimelineTime(seconds = 0) {
      const now = performance.now();
      this.startedAt = now - Math.max(0, Number(seconds) || 0) * 1000;
      this.previousAt = now;
      this.lastPhase = -1;
      this.clearFeedback();
    }

    dispose() {
      if (this.disposed) return;
      this.stop();
      this.title3D?.dispose();
      this.resizeObserver?.disconnect();
      this.renderTargets.forEach((target) => target.dispose());
      this.materials.forEach((material) => material.dispose());
      this.resources.forEach((resource) => resource.dispose?.());
      this.textures.forEach((texture) => texture.dispose());
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.renderer.domElement.remove();
      this.disposed = true;
    }
  }

  window.DigitalAbstractScene = DigitalAbstractScene;
})();
