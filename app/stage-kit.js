(() => {
  "use strict";

  // Normal-stage scenery kit. Replaces the abstract station frames with an
  // island platform (two tracks, so the notice train can run on either side)
  // and dresses the hall / lounge rooms with props. Surfaces are PBR
  // (albedo + normal + roughness) lit by per-stage CC0 HDRIs; repeated parts
  // are instanced so the whole stage stays at a handful of draw calls.
  // Presentation only: no game state is read here.
  const UV = 0.32; // cabinet-surfaces convention: uv = metres * 0.32
  const STATION_PERIOD = 18; // props repeat every 18 units; the strip loops by this
  const STATION_NEAR = 22, STATION_FAR = -96;

  class StageKit {
    constructor(world) {
      this.world = world;
      this.owner = world.owner;
      this.T = world.T;
      this.sources = window.ShibakuStageTextures || {};
      this.textureCache = new Map();
      this.envTargets = { station: [], hall: [], lounge: [] };
      this.dummy = new this.T.Object3D();
      const T = this.T;
      // Per-stage light rigs: rows of line lights running along z (fluorescent
      // tubes / ceiling strips / pendant rows). Evaluated analytically in the
      // material shader, so every surface gets real falloff and the polished
      // floors get proper reflections of the lights without extra passes.
      const rig = (rows, y, color, strength, floorY, segment) => ({
        uStageOffset: { value: new T.Vector3() },
        uRows: { value: new T.Vector4(...[...rows, 1e4, 1e4, 1e4, 1e4].slice(0, 4)) },
        uRowY: { value: y },
        uLightColor: { value: new T.Color(color) },
        uLightStrength: { value: strength },
        uFloorY: { value: floorY },
        uSegment: { value: new T.Vector3(...segment) },
      });
      this.rigs = {
        station: rig([-5.2, -1.15, 1.15, 5.2], 3.03, 0xeaf4ff, 1.35, -2.2, [STATION_NEAR - 2.5 - 1.15, 3, 2.3 / 3]),
        hall: rig([-5, 0, 5], 3.55, 0xf4f2ff, 1.0, -3.89, [0, 1, 1]),
        lounge: rig([-1.3, 1.3], 1.25, 0xffc98a, 1.1, -3.89, [0, 1, 1]),
      };
      this.loadEnvironments();
    }

    texture(name, worldSize = 1, options = {}) {
      const T = this.T, source = this.sources[name];
      if (!source) return null;
      const key = `${name}/${worldSize}/${options.ratio || 1}`;
      if (this.textureCache.has(key)) return this.textureCache.get(key);
      const texture = new T.TextureLoader().load(source);
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(1 / (worldSize * UV), 1 / (worldSize * (options.ratio || 1) * UV));
      texture.anisotropy = Math.min(8, this.owner.renderer.capabilities.getMaxAnisotropy());
      this.owner.textures.push(texture);
      this.textureCache.set(key, texture);
      return texture;
    }

    material(stage, options = {}) {
      const T = this.T;
      const { map, normal, size = 1, ratio = 1, normalScale = 1, photo, ...rest } = options;
      const material = this.owner.trackMaterial(new T.MeshStandardMaterial({
        roughness: 0.6, metalness: 0, envMapIntensity: 0.45, ...rest,
      }));
      if (map) material.map = this.texture(map, size, { ratio });
      if (normal) { material.normalMap = this.texture(normal, size, { ratio }); material.normalScale.set(normalScale, normalScale); }
      if (options.emissiveMap) material.emissiveMap = this.texture(options.emissiveMap, size, { ratio });
      this.envTargets[stage]?.push(material);
      if (this.rigs[stage]) this.photoreal(material, stage, options.photo || {});
      return material;
    }

    // Shader additions for stage surfaces: line-light irradiance, glossy
    // reflections of the light rows on floors, grime where walls meet the
    // floor, and low-frequency variation that breaks visible tiling.
    photoreal(material, stage, { gloss = 0, grime = 0.6, macro = 0.6 } = {}) {
      const rig = this.rigs[stage];
      const local = { uGloss: { value: gloss }, uGrime: { value: grime }, uMacro: { value: macro } };
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, rig, local);
        shader.vertexShader = "varying vec3 vStagePos;\n" + shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
          vec4 stagePos = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            stagePos = instanceMatrix * stagePos;
          #endif
          vStagePos = (modelMatrix * stagePos).xyz;`);
        shader.fragmentShader = `varying vec3 vStagePos;
          uniform vec3 uStageOffset;
          uniform vec4 uRows;
          uniform float uRowY;
          uniform vec3 uLightColor;
          uniform float uLightStrength;
          uniform float uFloorY;
          uniform vec3 uSegment;
          uniform float uGloss;
          uniform float uGrime;
          uniform float uMacro;
          float stageHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float stageNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
            return mix(mix(stageHash(i), stageHash(i + vec2(1.0, 0.0)), u.x), mix(stageHash(i + vec2(0.0, 1.0)), stageHash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          float stageRow(int i) { return i == 0 ? uRows.x : i == 1 ? uRows.y : i == 2 ? uRows.z : uRows.w; }
        ` + shader.fragmentShader
          .replace("#include <map_fragment>", `#include <map_fragment>
            vec3 stageP = vStagePos - uStageOffset;
            float stageMacro = stageNoise(stageP.xz * 0.11 + stageP.y * 0.07) * 0.65 + stageNoise(stageP.xz * 0.53 + 3.1) * 0.35;
            diffuseColor.rgb *= mix(1.0, 0.8 + stageMacro * 0.35, uMacro);
            float stageFoot = 1.0 - smoothstep(0.0, 0.85, stageP.y - uFloorY);
            diffuseColor.rgb *= 1.0 - stageFoot * uGrime * 0.4;`)
          .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
            roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.75 + stageMacro * 0.55, uMacro), 0.04, 1.0);`)
          .replace("#include <aomap_fragment>", `{
              vec3 Nw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
              vec3 Vw = normalize(cameraPosition - vStagePos);
              vec3 lineLight = vec3(0.0);
              for (int i = 0; i < 4; i++) {
                vec2 d = vec2(stageRow(i) - stageP.x, uRowY - stageP.y);
                float lambert = max(dot(Nw, normalize(vec3(d, 0.0))), 0.0);
                lineLight += vec3(lambert / (1.0 + dot(d, d) * 0.32));
              }
              reflectedLight.directDiffuse += diffuseColor.rgb * uLightColor * lineLight * uLightStrength;
              if (uGloss > 0.0 && Nw.y > 0.7) {
                vec3 R = reflect(-Vw, Nw);
                if (R.y > 0.015) {
                  float travel = (uRowY - stageP.y) / R.y;
                  vec3 hit = stageP + R * travel;
                  float width = 0.0015 + roughnessFactor * roughnessFactor * 0.6 + travel * 0.0015;
                  float lit = uSegment.y > 1.5 ? step(fract((hit.z - uSegment.x) / uSegment.y), uSegment.z) : 1.0;
                  float streak = 0.0;
                  for (int i = 0; i < 4; i++) { float dx = hit.x - stageRow(i); streak += exp(-dx * dx / width); }
                  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(Nw, Vw), 0.0), 5.0);
                  reflectedLight.indirectSpecular += uLightColor * streak * lit * fresnel * uGloss * 3.0 / (1.0 + travel * 0.04);
                }
              }
            }
            #include <aomap_fragment>`);
      };
      material.customProgramCacheKey = () => `stage-photoreal-${stage}`;
    }

    // A plane whose UVs follow the same physical-size convention as boxes.
    plane(w, h) {
      const geometry = this.owner.track(new this.T.PlaneGeometry(w, h));
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * UV, uv.getY(i) * h * UV);
      uv.needsUpdate = true;
      return geometry;
    }

    // A plane showing one whole picture (signs, posters, machine faces).
    card(w, h) {
      return this.owner.track(new this.T.PlaneGeometry(w, h));
    }

    // Material for a single picture: its own texture object, no tiling.
    picture(stage, name, glow, extra = {}) {
      const T = this.T, source = this.sources[name];
      const texture = source ? new T.TextureLoader().load(source) : null;
      if (texture) { texture.anisotropy = Math.min(8, this.owner.renderer.capabilities.getMaxAnisotropy()); this.owner.textures.push(texture); }
      const material = this.owner.trackMaterial(new T.MeshStandardMaterial({
        map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.3, envMapIntensity: 0.8, ...extra,
      }));
      this.envTargets[stage]?.push(material);
      return material;
    }

    // Instanced set of one geometry/material: [x, y, z, sx, sy, sz, ry, rx].
    instances(group, geometry, material, transforms) {
      if (!transforms.length) return null;
      const mesh = new this.T.InstancedMesh(geometry, material, transforms.length);
      transforms.forEach(([x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0], index) => {
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(rx, ry, 0);
        this.dummy.scale.set(sx, sy, sz);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      this.owner.track(mesh);
      group.add(mesh);
      return mesh;
    }

    loadEnvironments() {
      const T = this.T, hdri = window.ShibakuStageHDRI, Loader = window.CabinetAssets?.EXRLoader;
      if (!hdri || !Loader) return;
      const pmrem = new T.PMREMGenerator(this.owner.renderer);
      for (const stage of ["station", "hall", "lounge"]) {
        if (!hdri[stage]) continue;
        new Loader().setDataType(T.HalfFloatType).load(hdri[stage], texture => {
          if (this.owner.disposed) { texture.dispose(); return; }
          const env = pmrem.fromEquirectangular(texture).texture;
          texture.dispose();
          this.owner.textures.push(env);
          for (const material of this.envTargets[stage]) { material.envMap = env; material.needsUpdate = true; }
        }, undefined, () => console.warn("ステージ用HDRIを読めないため環境光なしで描画します"));
      }
    }

    // ---------------------------------------------------------------- Station
    buildStation() {
      const T = this.T, group = new T.Group(), s = "station";
      const box = (w, h, d) => this.world.surfaces.box(w, h, d);
      const length = STATION_NEAR - STATION_FAR, midZ = (STATION_NEAR + STATION_FAR) / 2;
      const floorY = -2.2, bedY = -3.45, ceilingY = 3.6, platformHalf = 4.2, trackX = 6.25, wallX = 8.55;

      const floor = this.material(s, { map: "floorMap", normal: "floorNormal", size: 3.2, roughness: 0.2, normalScale: 0.5, color: 0x7a7f83, envMapIntensity: 0.55, photo: { gloss: 1, grime: 0, macro: 0.9 } });
      const tactile = this.material(s, { map: "tactileMap", normal: "tactileNormal", size: 0.4, roughness: 0.55 });
      const edgeWhite = this.material(s, { color: 0xbfc3c0, roughness: 0.5 });
      const concrete = this.material(s, { map: "concreteMap", normal: "concreteNormal", size: 3.2, roughness: 0.78, normalScale: 0.35, color: 0x8f9193 });
      const darkConcrete = this.material(s, { map: "concreteMap", normal: "concreteNormal", size: 3.2, roughness: 0.9, color: 0x6a6d70 });
      const ballast = this.material(s, { map: "ballastMap", normal: "ballastNormal", size: 1.4, roughness: 0.95 });
      const wallTile = this.material(s, { map: "wallTileMap", normal: "wallTileNormal", size: 4.8, roughness: 0.28, color: 0x74716c, envMapIntensity: 0.5, photo: { grime: 0.9, macro: 0.7 } });
      const ceiling = this.material(s, { map: "ceilingMap", normal: "ceilingNormal", size: 0.8, roughness: 0.55, metalness: 0.6, photo: { grime: 0, macro: 0.4 } });
      const steel = this.material(s, { color: 0x8c979e, roughness: 0.32, metalness: 0.85, normal: "metalPanelNormal", size: 1, normalScale: 0.4 });
      const darkSteel = this.material(s, { color: 0x2a3036, roughness: 0.45, metalness: 0.7 });
      const rail = this.material(s, { color: 0xb8c0c4, roughness: 0.22, metalness: 1 });
      const sleeper = this.material(s, { map: "concreteMap", size: 1, roughness: 0.9, color: 0x8a8580 });
      const benchSeat = this.material(s, { color: 0xd8641e, roughness: 0.38 });
      const tube = this.owner.trackMaterial(new T.MeshBasicMaterial({ color: 0xf4fbff }));
      const sign = this.picture(s, "stationSign", 0.9);
      const vending = this.picture(s, "vendingMap", 0.55);
      const ads = ["adGame", "adCity", "adSoda"].map(name => this.picture(s, name, 0.85, { roughness: 0.2 }));

      // Platform deck, tactile strips, edge lines and edge faces.
      const deck = new T.Mesh(this.plane(platformHalf * 2, length), floor);
      deck.rotation.x = -Math.PI / 2; deck.position.set(0, floorY, midZ); group.add(deck);
      for (const side of [-1, 1]) {
        const strip = new T.Mesh(this.plane(0.4, length), tactile);
        strip.rotation.x = -Math.PI / 2; strip.position.set(side * 3.45, floorY + 0.004, midZ); group.add(strip);
        const line = new T.Mesh(this.plane(0.12, length), edgeWhite);
        line.rotation.x = -Math.PI / 2; line.position.set(side * 3.98, floorY + 0.004, midZ); group.add(line);
        const lip = new T.Mesh(box(0.34, 0.22, length), concrete); lip.position.set(side * (platformHalf - 0.06), floorY - 0.1, midZ); group.add(lip);
        const face = new T.Mesh(this.plane(length, bedY - floorY + 0.1), darkConcrete);
        face.rotation.y = side * Math.PI / 2; face.position.set(side * (platformHalf + 0.05), (floorY + bedY) / 2 - 0.05, midZ); group.add(face);
        // Track bed, sleepers and rails.
        const bed = new T.Mesh(this.plane(wallX - platformHalf, length), ballast);
        bed.rotation.x = -Math.PI / 2; bed.position.set(side * (platformHalf + wallX) / 2, bedY, midZ); group.add(bed);
        const sleepers = [];
        for (let z = STATION_NEAR; z > STATION_FAR; z -= 0.62) sleepers.push([side * trackX, bedY + 0.06, z]);
        this.instances(group, box(2.5, 0.16, 0.26), sleeper, sleepers);
        for (const offset of [-0.72, 0.72]) {
          const r = new T.Mesh(box(0.1, 0.18, length), rail); r.position.set(side * trackX + offset, bedY + 0.23, midZ); group.add(r);
        }
        // Tiled side walls with lit advertising panels.
        const wall = new T.Mesh(this.plane(length, ceilingY - bedY), wallTile);
        wall.rotation.y = -side * Math.PI / 2; wall.position.set(side * wallX, (ceilingY + bedY) / 2, midZ); group.add(wall);
        let index = side > 0 ? 1 : 0;
        for (let z = STATION_NEAR - 4; z > STATION_FAR; z -= 9) {
          const panel = new T.Mesh(this.card(3.3, 1.65), ads[index++ % ads.length]);
          panel.rotation.y = -side * Math.PI / 2; panel.position.set(side * (wallX - 0.09), 0.4, z); group.add(panel);
        }
        const frames = [];
        for (let z = STATION_NEAR - 4; z > STATION_FAR; z -= 9) frames.push([side * (wallX - 0.035), 0.4, z]);
        this.instances(group, box(0.07, 1.85, 3.5), darkSteel, frames);
      }

      // Columns (concrete with steel corner guards) every 6 units.
      const columns = [], guards = [], plinths = [];
      for (let z = STATION_NEAR - 1; z > STATION_FAR; z -= 6) for (const side of [-1, 1]) {
        columns.push([side * 2.4, (floorY + ceilingY) / 2, z]);
        plinths.push([side * 2.4, floorY + 0.14, z]);
        for (const cx of [-1, 1]) for (const cz of [-1, 1]) guards.push([side * 2.4 + cx * 0.36, floorY + 1.0, z + cz * 0.36]);
      }
      this.instances(group, box(0.72, ceilingY - floorY, 0.72), concrete, columns);
      this.instances(group, box(0.8, 0.28, 0.8), darkSteel, plinths);
      this.instances(group, box(0.06, 2.0, 0.06), steel, guards);

      // Ceiling: louvred panels, cross beams, twin rows of fluorescent fixtures.
      const roof = new T.Mesh(this.plane(wallX * 2, length), ceiling);
      roof.rotation.x = Math.PI / 2; roof.position.set(0, ceilingY, midZ); group.add(roof);
      const beams = [], housings = [], tubes = [];
      for (let z = STATION_NEAR - 1; z > STATION_FAR; z -= 6) beams.push([0, ceilingY - 0.22, z]);
      for (let z = STATION_NEAR - 2.5; z > STATION_FAR; z -= 3) for (const x of [-1.15, 1.15, -5.2, 5.2]) {
        housings.push([x, ceilingY - 0.5, z]);
        tubes.push([x, ceilingY - 0.57, z]);
      }
      this.instances(group, box(wallX * 2, 0.42, 0.34), darkSteel, beams);
      this.instances(group, box(0.26, 0.1, 2.5), steel, housings);
      this.instances(group, box(0.1, 0.04, 2.3), tube, tubes);

      // Every 18 units: hanging station sign, benches; vending machines every 36.
      const hangers = [], seats = [], legs = [], backs = [];
      for (let z = STATION_NEAR - 7; z > STATION_FAR; z -= STATION_PERIOD) {
        const board = new T.Mesh(box(3.5, 0.94, 0.12), darkSteel); board.position.set(0, ceilingY - 1.35, z); group.add(board);
        for (const face of [1, -1]) {
          const card = new T.Mesh(this.card(3.36, 0.84), sign);
          card.position.set(0, ceilingY - 1.35, z + face * 0.065); card.rotation.y = face > 0 ? 0 : Math.PI; group.add(card);
        }
        for (const x of [-1.4, 1.4]) hangers.push([x, ceilingY - 0.45, z]);
        for (const side of [-1, 1]) {
          seats.push([side * 1.05, floorY + 0.46, z - 5.5]);
          backs.push([side * 1.3, floorY + 0.78, z - 5.5]);
          for (const dz of [-0.8, 0.8]) legs.push([side * 1.05, floorY + 0.22, z - 5.5 + dz]);
        }
      }
      this.instances(group, box(0.04, 0.9, 0.04), steel, hangers);
      this.instances(group, box(0.5, 0.08, 2.0), benchSeat, seats);
      this.instances(group, box(0.08, 0.5, 2.0), benchSeat, backs);
      this.instances(group, box(0.42, 0.44, 0.06), darkSteel, legs);
      const vendingBodies = [];
      for (let z = STATION_NEAR - 16; z > STATION_FAR; z -= STATION_PERIOD * 2) {
        const front = new T.Mesh(this.card(1.05, 1.95), vending); front.position.set(-1.0, floorY + 0.98, z + 0.41); group.add(front);
        vendingBodies.push([-1.0, floorY + 0.98, z]);
      }
      this.instances(group, box(1.12, 2.0, 0.8), edgeWhite, vendingBodies);

      // Fluorescent wash from above; lives inside the group so it only lights
      // the station while the station is on screen.
      const wash = new T.DirectionalLight(0xe6f2ff, 0.22); wash.position.set(0.5, 6, 2); group.add(wash);
      group.userData.period = STATION_PERIOD;
      this.station = group;
      return group;
    }

    // ------------------------------------------------------------ Hall props
    dressHall(group) {
      const T = this.T, s = "hall", box = (w, h, d) => this.world.surfaces.box(w, h, d);
      const floorY = -3.89;
      const carpet = this.material(s, { map: "carpetMap", normal: "carpetNormal", size: 1.6, roughness: 0.95 });
      const cloth = this.material(s, { color: 0x1d2b4f, roughness: 0.85 });
      const tableTop = this.material(s, { color: 0xd9dcdf, roughness: 0.5 });
      const stand = this.material(s, { color: 0x30363c, roughness: 0.4, metalness: 0.8 });
      const posters = ["posterA", "posterB", "posterC"].map(name => this.picture(s, name, 0.45, { roughness: 0.4 }));
      const itemColors = [0xff5fa2, 0x2ad4ff, 0xffd166, 0xf4f4f4, 0x8f44ad, 0x2a9d4b].map(color => this.material(s, { color, roughness: 0.35 }));
      const floor = new T.Mesh(this.plane(13, 60), carpet);
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, floorY, -24); group.add(floor);
      const tables = [], tops = [], poles = [];
      const items = itemColors.map(() => []);
      let seed = 5;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let z = 1; z > -46; z -= 2.6) for (const side of [-1, 1]) {
        tables.push([side * 3.4, floorY + 0.4, z]);
        tops.push([side * 3.4, floorY + 0.81, z]);
        for (let k = 0; k < 4; k++) items[Math.floor(rand() * items.length)].push([side * (3.1 + rand() * 0.6), floorY + 0.9 + rand() * 0.12, z + (rand() - 0.5) * 1.8, 1, 0.6 + rand() * 1.4, 1, rand() * 0.5]);
        poles.push([side * 4.25, floorY + 1.0, z]);
        const poster = new T.Mesh(this.card(1.05, 1.55), posters[Math.floor(rand() * posters.length)]);
        poster.rotation.y = -side * Math.PI / 2; poster.position.set(side * 4.2, floorY + 1.55, z); group.add(poster);
      }
      this.instances(group, box(0.95, 0.78, 2.2), cloth, tables);
      this.instances(group, box(1.0, 0.04, 2.25), tableTop, tops);
      this.instances(group, box(0.05, 2.0, 0.05), stand, poles);
      items.forEach((list, i) => this.instances(group, box(0.22, 0.18, 0.3), itemColors[i], list));
      // Hanging banners across the hall.
      for (let z = -4; z > -46; z -= 8) {
        const banner = new T.Mesh(this.card(2.2, 1.1), posters[Math.floor(rand() * posters.length)]);
        banner.position.set((rand() - 0.5) * 4, 2.3, z); group.add(banner);
      }
      group.add(new T.AmbientLight(0xb8a8d8, 0.12));
    }

    // ---------------------------------------------------------- Lounge props
    dressLounge(group) {
      const T = this.T, s = "lounge", box = (w, h, d) => this.world.surfaces.box(w, h, d);
      const floorY = -3.89;
      const wood = this.material(s, { map: "woodMap", normal: "woodNormal", size: 2.4, roughness: 0.3, color: 0x6e5240, envMapIntensity: 0.5, photo: { gloss: 0.7, grime: 0, macro: 0.8 } });
      const velvet = this.material(s, { map: "velvetMap", size: 0.8, roughness: 0.9, envMapIntensity: 0.4 });
      const brass = this.material(s, { color: 0xc89b54, roughness: 0.25, metalness: 1 });
      const marble = this.material(s, { color: 0x1a1d20, roughness: 0.15, metalness: 0.1, envMapIntensity: 1.4, photo: { gloss: 0.8, grime: 0, macro: 0.3 } });
      const glow = this.owner.trackMaterial(new T.MeshBasicMaterial({ color: 0xffd9a0 }));
      const bottleColors = [0x2e7d32, 0x8d5524, 0xb71c1c, 0x90caf9, 0xf5f5f5].map(color => this.material(s, { color, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.8 }));
      const floor = new T.Mesh(this.plane(13, 60), wood);
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, floorY, -24); group.add(floor);
      const seats = [], backs = [], arms = [], tables = [], candles = [], shades = [], cords = [];
      const bottles = bottleColors.map(() => []), shelves = [];
      let seed = 9;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const nearColumn = z => [0, 1, 2, 3, 4].some(i => Math.abs(z - (2 - i * 11)) < 1.9);
      for (let z = -1; z > -50; z -= 5.5) {
        if (nearColumn(z)) z -= 2.2;
        for (const side of [-1, 1]) {
          seats.push([side * 3.25, floorY + 0.28, z]);
          backs.push([side * 3.72, floorY + 0.75, z]);
          for (const dz of [-1.15, 1.15]) arms.push([side * 3.25, floorY + 0.48, z + dz]);
          tables.push([side * 2.1, floorY + 0.42, z]);
          candles.push([side * 2.1, floorY + 0.9, z]);
          // Back-bar shelves with lit bottles on the side walls.
          for (const y of [-1.2, 0.2]) {
            shelves.push([side * 5.05, y, z]);
            for (let k = 0; k < 6; k++) bottles[Math.floor(rand() * bottles.length)].push([side * 5.0, y + 0.3, z - 1.6 + k * 0.62, 1, 0.8 + rand() * 0.5, 1]);
          }
        }
        shades.push([(rand() - 0.5) * 2.4, 1.2 + rand() * 0.6, z - 2.2]);
      }
      shades.forEach(([x, y, z]) => cords.push([x, (y + 3.6) / 2, z, 1, 3.6 - y, 1]));
      this.instances(group, box(1.1, 0.34, 2.5), velvet, seats);
      this.instances(group, box(0.26, 0.9, 2.5), velvet, backs);
      this.instances(group, box(1.1, 0.5, 0.22), velvet, arms);
      this.instances(group, box(0.8, 0.84, 0.8), marble, tables);
      this.instances(group, box(0.07, 0.14, 0.07), glow, candles);
      this.instances(group, box(0.4, 0.05, 3.6), brass, shelves);
      bottles.forEach((list, i) => this.instances(group, box(0.1, 0.5, 0.1), bottleColors[i], list));
      this.instances(group, box(0.5, 0.26, 0.5), brass, shades);
      this.instances(group, box(0.18, 0.08, 0.18), glow, shades.map(([x, y, z]) => [x, y - 0.16, z]));
      this.instances(group, box(0.012, 1, 0.012), brass, cords);
      group.add(new T.AmbientLight(0xffc98a, 0.1));
    }

    update(travel) {
      if (this.station) {
        this.station.position.z = ((travel % STATION_PERIOD) + STATION_PERIOD) % STATION_PERIOD;
        this.rigs.station.uStageOffset.value.copy(this.station.position);
      }
    }
  }

  window.StageKit = StageKit;
})();
