(() => {
  "use strict";
  // Reflective scenery shares the existing camera, renderer and GLSL pipeline.
  class CabinetWorld {
    constructor(owner) {
      this.owner = owner;
      const T = this.T = owner.THREE;
      this.root = new T.Group();
      owner.scene.add(this.root);
      const faces = Array.from({ length: 6 }, (_, i) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#151d28"; ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = i % 2 ? "#899db0" : "#f5f9ff";
        ctx.fillRect(10, 12, 108, 15); ctx.fillRect(80, 35, 12, 85);
        return canvas;
      });
      this.env = new T.CubeTexture(faces);
      this.env.needsUpdate = true;
      owner.textures.push(this.env);
      const material = options => owner.trackMaterial(new T.MeshPhongMaterial({ envMap: this.env, reflectivity: .48, shininess: 100, ...options }));
      this.steel = material({ color: 0x455569, specular: 0xffffff });
      this.enamel = material({ color: 0xf2f4f2, specular: 0xffffff, reflectivity: .24 });
      this.glass = material({ color: 0x075d86, specular: 0xbbeeff, reflectivity: .65 });
      this.root.add(new T.HemisphereLight(0xe9f5ff, 0x141b24, .8));
      this.key = new T.PointLight(0xc8eaff, 2.5, 65);
      this.key.position.set(-5, 6, 7); this.root.add(this.key);
      this.rim = new T.PointLight(0xffb966, 2, 60);
      this.rim.position.set(6, -1, -4); this.root.add(this.rim);
      this.corridor = new T.Group(); this.root.add(this.corridor);
      const beam = owner.track(new T.BoxGeometry(1, 1, 1));
      this.portals = [];
      for (let i = 0; i < 18; i++) {
        const portal = new T.Group();
        [[-6,0,.3,9],[6,0,.3,9],[0,4.5,12,.3],[0,-4.5,12,.3]].forEach(([x,y,w,h]) => {
          const mesh = new T.Mesh(beam, this.steel);
          mesh.position.set(x,y,0); mesh.scale.set(w,h,.55); portal.add(mesh);
        });
        this.corridor.add(portal); this.portals.push(portal);
      }
      this.createStructures(beam);
      this.createStationDetails(beam);
      // Normal stages: a real island platform for the station and furnished
      // rooms for the hall / lounge (see stage-kit.js). The abstract portal
      // frames stay as a fallback when the kit or its textures are missing.
      if (window.StageKit && window.ShibakuStageTextures) {
        this.stageKit = new window.StageKit(this);
        this.stationStage = this.stageKit.buildStation();
        this.root.add(this.stationStage);
        this.portals.forEach(portal => { portal.visible = false; });
        this.stageKit.dressHall(this.structures.hall.group);
        this.stageKit.dressLounge(this.structures.lounge.group);
      }
      this.createCzLighting();
      this.createNormalCueFrame();
      this.enemy = new T.Group(); this.root.add(this.enemy);
      const oval = new T.Shape(); oval.absellipse(0,0,2.65,2.3,0,Math.PI*2,false,0);
      const extrude = shape => owner.track(new T.ExtrudeGeometry(shape, { depth: .32, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .10, bevelThickness: .10, curveSegments: 32 }));
      const mask = new T.Mesh(extrude(oval), this.enamel); this.enemy.add(mask);
      const star = new T.Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .30 : .72;
        i ? star.lineTo(Math.cos(a)*r,Math.sin(a)*r) : star.moveTo(Math.cos(a)*r,Math.sin(a)*r);
      }
      star.closePath();
      const starGeo = extrude(star);
      for (const x of [-.95,.95]) {
        const eye = new T.Mesh(starGeo,this.glass); eye.position.set(x,.7,.43); eye.scale.z=.35; this.enemy.add(eye);
      }
      const heart = new T.Shape();
      heart.moveTo(0,-.48);
      heart.bezierCurveTo(-1.8,.30,-.65,.92,0,.35);
      heart.bezierCurveTo(.65,.92,1.8,.30,0,-.48);
      const mouthGeometry = extrude(heart);
      mouthGeometry.computeBoundingBox();
      mouthGeometry.translate(-(mouthGeometry.boundingBox.min.x + mouthGeometry.boundingBox.max.x) / 2, 0, 0);
      const mouth = new T.Mesh(mouthGeometry,this.glass);
      mouth.position.set(0,-1.05,.43); mouth.scale.set(1,.78,.35); this.enemy.add(mouth);
      const armour = new T.Shape();
      [[-.55,-.3],[-.3,-.5],[.3,-.5],[.55,-.3],[.55,.3],[.3,.5],[-.3,.5],[-.55,.3]].forEach(([x,y],i) => i ? armour.lineTo(x,y) : armour.moveTo(x,y));
      armour.closePath();
      const armourGeo = extrude(armour);
      this.fists = [-1,1].map(side => {
        const fist = new T.Group();
        const shell = new T.Mesh(armourGeo, this.steel); shell.scale.z=3; fist.add(shell);
        for (let i=0;i<3;i++) {
          const knuckle = new T.Mesh(beam,this.enamel);
          knuckle.scale.set(.23,.28,.18); knuckle.position.set((i-1)*.31,.18,-.15); fist.add(knuckle);
        }
        fist.userData.side = side; this.root.add(fist); return fist;
      });
      this.impactMaterial = owner.trackMaterial(new T.MeshBasicMaterial({ color: 0xc8efff, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      this.impact = new T.Mesh(owner.track(new T.TorusGeometry(1,.035,6,48)),this.impactMaterial);
      this.root.add(this.impact);
      this.beat = -1; this.beatAt = 0; this.favour = 1; this.travel = 0; this.waiting = false; this.outcome = null;
      this.babaCueHits=0;this.babaCueAt=-Infinity;this.babaDolly=0;
      this.combat = new window.CabinetCombat(this);
      this.loadSurfaceTexture();
    }
    createStationDetails(beam) {
      const T=this.T;
      for(const portal of this.portals) {
        const block=(x,y,z,w,h,d)=>{
          const mesh=new T.Mesh(beam,this.steel);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);portal.add(mesh);
        };
        // Bolted knee plates and stepped shoes share the existing metal and
        // geometry. One instance batch replaces the four old beam draw calls.
        for(const side of [-1,1]) {
          block(side*5.8,4.25,.32,.78,.46,.14);
          block(side*5.9,-4.24,.13,.66,.34,.76);
          block(side*5.9,-4.04,.24,.48,.07,.59);
          block(side*6.17,0,.22,.075,7.8,.22);
          for(const dx of [-.25,.25])block(side*5.8+dx,4.25,.43,.075,.075,.08);
        }
        this.surfaces.batch(portal);
      }
    }
    createNormalCueFrame() {
      const T=this.T,o=this.owner,transforms=[];
      // Segmented illumination follows the portal silhouette, leaving the
      // central stage title unobscured. All three depth planes use one draw.
      for(const z of [-1,-6,-12])for(const side of [-1,1])for(const y of [-1.65,1.65]) {
        const x=side*3.7;
        transforms.push([x-side*.475,y,z,.95,.038,.05],[x,y-Math.sign(y)*.28,z,.038,.56,.05]);
      }
      const geometry=o.track(new T.BoxGeometry(1,1,1));
      this.normalCueMaterial=o.trackMaterial(new T.MeshBasicMaterial({color:0x9cabb5,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
      this.normalCueFrame=o.track(new T.InstancedMesh(geometry,this.normalCueMaterial,transforms.length));
      const transform=new T.Object3D();transforms.forEach(([x,y,z,w,h,d],i)=>{transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.updateMatrix();this.normalCueFrame.setMatrixAt(i,transform.matrix);});
      this.normalCueFrame.instanceMatrix.needsUpdate=true;this.normalCueFrame.frustumCulled=false;
      this.normalCueFrame.visible=false;this.root.add(this.normalCueFrame);
      this.normalCueColor=new T.Color();
    }
    updateNormalCue(now) {
      const normal=this.owner.presentation.kind==='normal';
      const cue=normal?this.owner.normalCue?.sample(now):null;
      const amount=cue?.amount||0;
      this.normalCueFrame.visible=amount>.001;
      if(!amount)return;
      this.normalCueColor.set(cue.color);
      this.normalCueMaterial.color.copy(this.normalCueColor);
      this.normalCueMaterial.opacity=amount;
      this.normalCueFrame.scale.x=Math.max(1,this.owner.camera.aspect/2);
      this.normalCueFrame.position.z=amount*.85;
      // Reuse the existing CZ light/probe budget. This is an authored dynamic
      // bounce approximation, not ray-traced GI or screen-space radiance tracing.
      this.babaGiLight.visible=true;this.babaGiLight.color.copy(this.normalCueColor);
      this.babaGiLight.position.set(-4.8,1.25,1.5);this.babaGiLight.intensity=amount*7;
      this.key.intensity*=1-amount*.30;this.rim.intensity*=1-amount*.20;
      this.setCzProbe(this.normalCueColor,amount*.26);
      this.czProbe.sh.coefficients[1].set(-this.normalCueColor.r*amount*.06,-this.normalCueColor.g*amount*.06,-this.normalCueColor.b*amount*.06);
      this.owner.camera.position.z-=amount*.18;
    }
    loadSurfaceTexture() {
      const o = this.owner, T = this.T;
      const source=window.CabinetLocalAssets?.coarseMachinedMetal||'./assets/textures/coarse-machined-metal-v1.png';
      new T.TextureLoader().load(source, texture => {
        if (o.disposed) { texture.dispose(); return; }
        texture.wrapS = texture.wrapT = T.MirroredRepeatWrapping;
        texture.anisotropy = Math.min(4, o.renderer.capabilities.getMaxAnisotropy());
        o.textures.push(texture);
        // The coarse-cut finish belongs to Hashimoto Station only. The hall and
        // lounge retain clean reflective metal, as do CZ/BONUS/BOOST structures.
        const mapped = new Map();
        const normalStages=[this.corridor];
        for (const group of normalStages) group.traverse(mesh => {
          if (!mesh.isMesh) return;
          const sourceMaterial=mesh.material;
          if (!sourceMaterial.isMeshPhongMaterial||sourceMaterial.transparent) return;
          let material=mapped.get(sourceMaterial);
          if(!material) {
            material=o.trackMaterial(sourceMaterial.clone());
            mapped.set(sourceMaterial,material);
            this.surfaces.finish(material);
            material.map=texture;
            material.bumpMap=texture;
            material.bumpScale=.045;
            material.specularMap=texture;
            material.needsUpdate=true;
          }
          mesh.material=material;
        });
      }, undefined, () => console.warn('構造物テクスチャを読めないため素材色で描画します'));
    }
    createRoomFinishTexture() {
      const T = this.T, canvas=document.createElement('canvas');
      canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#9daab2';ctx.fillRect(0,0,256,256);
      // Clean rolled metal: directional brushing and sparse machining passes,
      // deliberately calmer than the cut stock used by Hashimoto Station.
      for(let y=0;y<256;y++) {
        const shade=142+Math.floor(Math.sin(y*.19)*7+Math.sin(y*.053)*5);
        ctx.fillStyle=`rgb(${shade},${shade+7},${shade+10})`;
        ctx.fillRect(0,y,256,1);
      }
      for(let i=0;i<180;i++) {
        const y=(i*47)%256, length=28+(i*37)%170, x=(i*71)%256;
        ctx.fillStyle=i%4===0?'rgba(250,255,255,.14)':'rgba(22,34,42,.11)';
        ctx.fillRect(x,y,length,1);
      }
      const texture=new T.CanvasTexture(canvas);
      texture.wrapS=texture.wrapT=T.MirroredRepeatWrapping;
      texture.repeat.set(2.6,4.8);
      texture.anisotropy=Math.min(4,this.owner.renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate=true;this.owner.textures.push(texture);return texture;
    }
    createRoomBakeTextures() {
      const T=this.T, makeCanvas=()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=128;return [canvas,canvas.getContext('2d')];};
      const [aoCanvas,ao]=makeCanvas();
      ao.fillStyle='#f6f6f6';ao.fillRect(0,0,128,128);
      ao.fillStyle='#b6b6b6';
      for(const edge of [0,31,63,95,127]) { ao.fillRect(edge,0,1,128);ao.fillRect(0,edge,128,1); }
      const [giCanvas,gi]=makeCanvas();
      const fill=gi.createLinearGradient(0,0,128,128);
      fill.addColorStop(0,'#101b25');fill.addColorStop(.48,'#2b4050');fill.addColorStop(1,'#11181f');
      gi.fillStyle=fill;gi.fillRect(0,0,128,128);
      gi.fillStyle='rgba(180,220,236,.28)';gi.fillRect(0,61,128,5);
      const texture=canvas=>{const value=new T.CanvasTexture(canvas);value.wrapS=value.wrapT=T.MirroredRepeatWrapping;value.repeat.set(2.6,4.8);value.anisotropy=Math.min(4,this.owner.renderer.capabilities.getMaxAnisotropy());value.needsUpdate=true;this.owner.textures.push(value);return value;};
      // These authored static maps are the room material bake: seam AO plus a
      // restrained cool indirect fill. They add no render pass or dynamic cost.
      return {ao:texture(aoCanvas),gi:texture(giCanvas)};
    }
    createCzLighting() {
      const T=this.T;
      // Probe-style realtime GI: a low-cost SH indirect term, layered over the
      // authored static bake. It gives CZ flicker a visible bounce without an
      // additional screen-space or voxel render pass.
      this.czProbe=new T.LightProbe();this.czProbe.intensity=1;this.root.add(this.czProbe);
      this.czProbeColor=new T.Color();
      this.czColors={
        none:new T.Color(0x000000),
        baba:new T.Color(0xff251a),
        battle:new T.Color(0xb9e8ff),
        unko:new T.Color(0x53799b)
      };
      this.babaGiLight=new T.PointLight(0xff261c,0,28,2);this.babaGiLight.position.set(0,2.1,-2.8);this.root.add(this.babaGiLight);
      this.battleGiLights=[-3.55,0,3.55].map(x=>{
        const light=new T.PointLight(0xd6efff,0,16,2);
        light.position.set(x,3.12,-3.4);this.root.add(light);return light;
      });
    }
    setCzProbe(color,intensity) {
      const coefficient=Math.max(0,intensity)/.886227;
      this.czProbeColor.copy(color);
      this.czProbe.sh.coefficients.forEach(value=>value.set(0,0,0));
      this.czProbe.sh.coefficients[0].set(this.czProbeColor.r*coefficient,this.czProbeColor.g*coefficient,this.czProbeColor.b*coefficient);
    }
    updateCzLighting(structure,time) {
      const isBaba=structure==='baba', isUnko=structure==='unko', isBattle=structure==='battle';
      this.babaGiLight.visible=isBaba;
      this.battleGiLights.forEach(light=>light.visible=isBattle);
      if(isBaba) {
        this.babaGiLight.color.set(0xff261c);
        this.babaGiLight.position.set(0,2.1,-2.8);
        // Red lamps discharge down a sawtooth, then snap back on the next cycle.
        const saw=1-((time*.92)%1), pulse=.14+saw*.86;
        const progress=Math.min(3,Math.max(this.babaCueHits,this.owner.scenery?.babaHits||0));
        this.babaGiLight.intensity=.35+pulse*(2.4+progress*.65);
        this.babaGiLight.position.x=Math.sin(time*.46)*1.8;
        this.setCzProbe(this.czColors.baba,.07+pulse*(.20+progress*.045));
      } else if(isBattle) {
        let energy=0;
        this.battleTubeMaterials.forEach((material,index)=>{
          const tick=Math.floor(time*(8.4+index*1.37));
          const noise=((Math.sin(tick*91.731+index*47.113)*43758.5453)%1+1)%1;
          const dip=noise>.73 ? .035 : .32+((Math.sin(time*(19+index*3.7)+index*2.3)+1)*.31);
          const flicker=Math.min(1,dip);
          energy+=flicker;
          material.opacity=.10+flicker*.86;
          this.battleGiLights[index].intensity=.08+flicker*2.25;
        });
        energy/=this.battleTubeMaterials.length;
        this.setCzProbe(this.czColors.battle,.055+energy*.22);
      } else if(isUnko) {
        this.setCzProbe(this.czColors.unko,.075);
      } else {
        this.setCzProbe(this.czColors.none,0);
      }
    }
    createStructures(beam) {
      const T = this.T, o = this.owner;
      this.surfaces = new window.CabinetSurfaces(o);
      this.structures = {};
      const glass = o.trackMaterial(new T.MeshPhongMaterial({ color: 0x81bdcd, specular:0xcfefff, envMap: this.env, reflectivity: .65, transparent: true, opacity: .38, shininess: 130, depthWrite: false }));
      const fresnelGlass=(color,specular,opacity,reflectivity,key)=>{
        const material=o.trackMaterial(new T.MeshPhongMaterial({color,specular,envMap:this.env,reflectivity,transparent:true,opacity,shininess:145,depthWrite:false}));
        material.onBeforeCompile=shader=>{
          shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>',`float cabinetRingFresnel = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.25);
            diffuseColor.a *= mix(0.16, 1.0, cabinetRingFresnel);
            #include <output_fragment>`);
        };
        material.customProgramCacheKey=()=>`cabinet-ring-fresnel-${key}-v1`;
        return material;
      };
      const redGlass = fresnelGlass(0xf04436,0xffeee8,.30,.72,'red');
      const regGlass = fresnelGlass(0xd4d9d3,0xffffff,.25,.62,'reg');
      const hallMetal = o.trackMaterial(new T.MeshPhongMaterial({color:0xbac7d0, specular:0xf4faff, shininess:65}));
      const loungeGlass = o.trackMaterial(new T.MeshPhongMaterial({color:0xd9ae78, envMap:this.env, reflectivity:.8, transparent:true, opacity:.46, shininess:130, depthWrite:false}));
      const floorMaterial = o.trackMaterial(new T.MeshPhongMaterial({color:0x38424a, specular:0x718392, shininess:90}));
      const darkMetal = o.trackMaterial(new T.MeshPhongMaterial({color:0x222c34,specular:0xc2ccd3,shininess:85}));
      const lamp = o.trackMaterial(new T.MeshBasicMaterial({color:0xd7e6ed}));
      const warmLamp = o.trackMaterial(new T.MeshBasicMaterial({color:0xae8863}));
      const boostSteel = o.trackMaterial(new T.MeshPhongMaterial({ color: 0x78918a, emissive: 0x10221d, envMap: this.env, reflectivity: .3, shininess: 65 }));
      const roomFinish=this.createRoomFinishTexture();
      const roomBake=this.createRoomBakeTextures();
      const bakedRoom={aoMap:roomBake.ao,aoMapIntensity:.36,lightMap:roomBake.gi,lightMapIntensity:.18};
      const roomMetal=o.trackMaterial(new T.MeshPhongMaterial({color:0xa9b6bf,specular:0xffffff,shininess:94,envMap:this.env,reflectivity:.34,map:roomFinish,bumpMap:roomFinish,bumpScale:.018,...bakedRoom}));
      const roomDark=o.trackMaterial(new T.MeshPhongMaterial({color:0x18232b,specular:0xb8c8d1,shininess:82,envMap:this.env,reflectivity:.24,map:roomFinish,bumpMap:roomFinish,bumpScale:.014,...bakedRoom}));
      const roomFloor=o.trackMaterial(new T.MeshPhongMaterial({color:0x34434d,specular:0xc5d8e2,shininess:72,envMap:this.env,reflectivity:.22,map:roomFinish,bumpMap:roomFinish,bumpScale:.012,...bakedRoom}));
      const czBake=this.createRoomBakeTextures();
      const bakedCz={aoMap:czBake.ao,aoMapIntensity:.48,lightMap:czBake.gi,lightMapIntensity:.11};
      const czSteel=o.trackMaterial(new T.MeshPhongMaterial({color:0x36414c,specular:0xc7d2da,shininess:84,envMap:this.env,reflectivity:.22,...bakedCz}));
      const czDark=o.trackMaterial(new T.MeshPhongMaterial({color:0x10161d,specular:0x8096a8,shininess:66,envMap:this.env,reflectivity:.16,...bakedCz}));
      this.battleTubeMaterials=[0,1,2].map(()=>o.trackMaterial(new T.MeshBasicMaterial({color:0xc9eeff,transparent:true,opacity:.14,depthWrite:false})));
      const arch = o.track(new T.TorusGeometry(4.5,.12,10,48,Math.PI));
      const bonusRing = o.track(new T.TorusGeometry(3.72,.17,14,64));
      const bonusRingInner = o.track(new T.TorusGeometry(3.02,.055,8,56));
      const bonusRingOuter = o.track(new T.TorusGeometry(4.26,.045,8,64));
      const cylinder = o.track(new T.CylinderGeometry(.35,.35,8,32));
      const roomUv=geometry=>{if(geometry.attributes.uv&&!geometry.attributes.uv2)geometry.setAttribute('uv2',geometry.attributes.uv.clone());return o.track(geometry);};
      const columnBand = roomUv(new T.TorusGeometry(.78,.065,8,24));
      const panelBolt = roomUv(new T.CylinderGeometry(.055,.055,.06,8));
      const cube = (group,x,y,z,w,h,d,mat=this.steel,roll=0) => {
        const mesh = new T.Mesh(this.surfaces.box(w,h,d),mat); mesh.position.set(x,y,z); mesh.rotation.z=roll; group.add(mesh); return mesh;
      };
      for (const name of ["hall","lounge","unko","baba","battle","red","blue","reg","boost","upper"]) {
        const group = new T.Group(); group.visible=false; this.root.add(group);
        const cells=[];
        for (let i=0;i<(name==="battle"?5:10);i++) {
          const cell=new T.Group(); group.add(cell); cells.push(cell);
          if (name==="red" || name==="reg") {
            const ringMaterial=name==='red'?redGlass:regGlass;
            const mainRing=new T.Mesh(bonusRing,ringMaterial);mainRing.rotation.z=i*.24;cell.add(mainRing);
            const innerRing=new T.Mesh(bonusRingInner,ringMaterial);innerRing.position.z=.28;innerRing.rotation.z=-i*.17;cell.add(innerRing);
            const outerRing=new T.Mesh(bonusRingOuter,ringMaterial);outerRing.position.z=-.22;outerRing.rotation.z=i*.11;cell.add(outerRing);
            for(let spoke=0;spoke<4;spoke++) {
              const angle=spoke*Math.PI*.5+i*.08;
              const clamp=cube(cell,Math.cos(angle)*3.72,Math.sin(angle)*3.72,.08,.46,.11,.25,hallMetal,angle);
              clamp.rotation.z=angle;
            }
          } else if(name==="blue") {
            const canopy=new T.Mesh(arch,glass); canopy.position.y=-.8; cell.add(canopy);
            const innerCanopy=new T.Mesh(arch,hallMetal); innerCanopy.position.set(0,-.8,.24); innerCanopy.scale.set(.82,.82,1); cell.add(innerCanopy);
            for(const side of [-1,1]) {
              cube(cell,side*4.5,-2,0,.16,3.2,.4,glass);
              cube(cell,side*4.25,-2,.18,.12,3.2,.12,darkMetal);
              cube(cell,side*4.08,-2,.30,.045,2.15,.025,hallMetal);
              cube(cell,side*3.72,1.1,.05,.62,.08,.22,hallMetal);
              cube(cell,side*3.72,.98,.18,.42,.028,.035,lamp);
            }
            cube(cell,0,2.42,.05,5.75,.12,.38,darkMetal);
            cube(cell,0,2.27,.17,4.85,.028,.035,lamp);
          } else if(name==="lounge") {
            for(const side of [-1,1]) {
              const column=new T.Mesh(cylinder,loungeGlass); column.position.set(side*4.4,0,0); column.scale.set(2.2,1,2.2); cell.add(column);
              // Column bands, recessed inlays and plinths give the clean lounge
              // metal a readable construction sequence instead of a bare tube.
              for(const y of [-2.75,2.45]) {
                const band=new T.Mesh(columnBand,roomMetal); band.position.set(side*4.4,y,0); band.rotation.x=Math.PI*.5; cell.add(band);
              }
              if(i<2) {
                // Recessed collar housing: a dark reveal between two machined
                // rims, only on foreground columns where it can be perceived.
                for(const y of [-2.84,2.54]) {
                  const collar=new T.Mesh(columnBand,roomDark);collar.position.set(side*4.4,y,0);collar.rotation.x=Math.PI*.5;collar.scale.set(1.025,1.025,1);cell.add(collar);
                }
                for(const x of [-.46,.46])cube(cell,side*4.4+x,0,.60,.04,4.65,.06,roomMetal);
              }
              cube(cell,side*5.5,0,-1,.2,8,3,loungeGlass);
              cube(cell,side*4.4,3.4,0,1.8,.15,1.8,roomMetal);
              cube(cell,side*4.4,-3.8,0,2,.25,2,roomDark);
              cube(cell,side*4.4,-3.48,.02,1.52,.055,1.52,roomMetal);
              cube(cell,side*4.4,3.12,.02,1.28,.05,1.28,roomDark);
              cube(cell,side*4.4,3.2,0,1.45,.055,1.45,warmLamp);
              cube(cell,side*4.4,0,0,.12,6.4,.12,roomMetal);
              for(const offset of [-.48,.48]) cube(cell,side*4.4+offset*.18,0,.72,.045,5.05,.035,roomMetal);
              for(const y of [-1.65,0,1.65]) {
                cube(cell,side*5.28,y,-.74,.62,.72,.08,roomDark);
                cube(cell,side*5.28,y+.23,-.68,.40,.022,.025,warmLamp);
                for(const dx of [-.22,.22]) for(const dy of [-.22,.22]) {
                  const bolt=new T.Mesh(panelBolt,roomMetal);
                  bolt.rotation.x=Math.PI*.5; bolt.position.set(side*5.28+dx,y+dy,-.65); cell.add(bolt);
                }
              }
              cube(cell,side*6,-2.5,-3,.3,2.8,11,roomDark);
            }
            cube(cell,0,3.65,0,10,.14,.6,roomDark);
            cube(cell,0,3.72,-.75,10.8,.055,3.0,roomDark);
            cube(cell,0,3.66,-.75,8.6,.022,.045,warmLamp);
            for(const side of [-1,1]) cube(cell,side*4.15,3.64,-.72,.05,.025,2.5,roomMetal);
            cube(cell,0,-4,-1,13,.2,11,roomFloor);
            cube(cell,0,-3.88,-.93,.16,.045,11,roomMetal);
            for(const side of [-1,1]) cube(cell,side*3.8,-3.86,-1,.055,.04,11,roomMetal);
            for(const z of [-3.2,2.8]) cube(cell,0,-3.84,z,12.6,.035,.11,roomDark);
            for(const z of [-1.6,1.6]) cube(cell,0,-3.82,z,6.4,.025,.028,warmLamp);
          } else if(name==="baba" || name==="unko") {
            for(const side of [-1,1]) {
              const door=cube(cell,side*3.4,0,0,2.4,7,.65,czSteel);
              door.userData.doorSide=side;
            }
            cube(cell,0,3.6,0,9,.6,1.2,czSteel);
            if(name==="unko")cube(cell,0,-3.7,0,9,.6,2,czDark);
          } else if(name==="battle") {
            cube(cell,0,-3.3,0,18,.35,10,czDark);
            for(const side of [-1,1]) {
              cube(cell,side*6,0,0,.65,7,.9,czSteel);
              cube(cell,side*5.5,1.8,0,.3,5,.5,czSteel,side*.42);
              cube(cell,side*4.6,-2.9,0,.14,.12,9,glass);
              for(let tier=0;tier<3;tier++)cube(cell,side*(6.5+tier*.65),-2.5+tier*.4,0,.6,.4,8,czDark);
            }
            // Ceiling slab and three failing fluorescent fixtures frame the duel.
            cube(cell,0,3.78,-.8,13.4,.18,5.0,czDark);
            cube(cell,0,4,0,12,.35,1,czSteel);
            for(let tube=0;tube<3;tube++) {
              const x=(tube-1)*3.55;
              cube(cell,x,3.58,-.55,2.35,.06,.12,czSteel);
              cube(cell,x,3.48,-.55,1.72,.035,.05,this.battleTubeMaterials[tube]);
            }
            for(const side of [-1,1]) {
              cube(cell,side*5.4,.4,-.35,.2,5.4,1.3,czDark);
              cube(cell,side*5.25,.6,.35,.055,3.2,.10,warmLamp);
              cube(cell,side*4.8,-3.08,-2,.8,.1,6,czDark);
            }
            cube(cell,0,-3.06,0,8,.03,.055,czSteel);
          } else if(name==="hall") {
            for(const side of [-1,1]) {
              cube(cell,side*7,0,0,.3,8,.4,roomMetal);
              cube(cell,side*6.5,1,0,.2,5,.3,roomMetal,side*.22);
              cube(cell,side*6.78,0,.25,.42,6.25,.06,roomDark);
              for(const y of [-2.7,-.6,1.5,3.15]) cube(cell,side*6.78,y,.31,.58,.08,.055,roomMetal);
              cube(cell,side*7,-3.7,0,1,.3,1,roomDark);
              cube(cell,side*7,-3.42,.03,.72,.055,.72,roomMetal);
              cube(cell,side*6.8,-2.8,-1,.25,1.8,11,roomDark);
              cube(cell,side*5,3.65,-1,.6,.12,4,roomDark);
              cube(cell,side*5,3.57,-1,.35,.035,3.6,lamp);
              for(const y of [-1.9,0,1.9]) {
                cube(cell,side*5.95,y,-.66,.82,.62,.10,roomDark);
                cube(cell,side*5.95,y+.18,-.60,.56,.025,.028,lamp);
                if(i<2) {
                  // Service vents sit inside their frame, not floating decoration.
                  for(let slot=0;slot<4;slot++)cube(cell,side*5.95,y-.12+slot*.065,-.592,.46,.018,.018,roomMetal);
                  cube(cell,side*5.95,y-.29,-.58,.62,.026,.04,roomMetal);
                }
                for(const dx of [-.29,.29]) for(const dy of [-.18,.18]) {
                  const bolt=new T.Mesh(panelBolt,roomMetal);
                  bolt.rotation.x=Math.PI*.5; bolt.position.set(side*5.95+dx,y+dy,-.565); cell.add(bolt);
                }
              }
            }
            cube(cell,0,4,0,14,.3,.5,roomMetal);
            cube(cell,0,3.3,0,14,.2,.4,roomMetal);
            for(let brace=-5;brace<=5;brace+=2)cube(cell,brace,3.65,0,.14,1.5,.2,roomMetal,.9);
            cube(cell,0,3.72,-.75,14.6,.06,3.1,roomDark);
            cube(cell,0,3.65,-.75,11.6,.022,.045,lamp);
            for(const side of [-1,1]) cube(cell,side*5.15,3.63,-.72,.05,.025,2.55,roomMetal);
            cube(cell,0,-4,-1,18,.2,11,roomFloor);
            cube(cell,0,-3.88,-.93,.16,.045,11,roomMetal);
            for(const side of [-1,1]) cube(cell,side*4.5,-3.86,-1,.055,.04,11,roomMetal);
            for(const z of [-3.2,2.8]) cube(cell,0,-3.84,z,17.4,.035,.11,roomDark);
            for(const z of [-1.6,1.6]) cube(cell,0,-3.82,z,9.5,.025,.028,lamp);
          } else {
            for(const side of [-1,1]) {
              cube(cell,side*5,0,0,.32,7,.7,boostSteel,side*.14);
              cube(cell,side*2.7,3.5,0,5,.25,.5,boostSteel,side*-.10);
              if(name==="upper")cube(cell,side*5.6,0,-1,.12,8,.3,boostSteel,side*-.1);
              cube(cell,side*4,-3.7,0,.12,.15,7,boostSteel);
            }
          }
        }
        // Thin shared edge geometry follows actual structural edges, not arbitrary decorations.
        const lineMaterial = o.trackMaterial(new T.LineBasicMaterial({color:0xb9d5e0,transparent:true,opacity:.13,depthWrite:false}));
        cells.forEach(cell=>{this.surfaces.edges(cell,lineMaterial);this.surfaces.batch(cell);});
        this.structures[name]={group,cells};
      }
    }
    cue(beat, role) {
      this.beat = beat; this.beatAt = performance.now();
      // Choreography uses the displayed role, never the held success flag.
      this.favour = ["miss", "replay"].includes(role) ? -1 : 1;
      this.combat?.cue(beat,this.favour);
      this.waiting = false; this.outcome = null;
    }
    babaHit(hits) {
      // Public success event only; never inspect the future CZ outcome.
      this.babaCueHits=Math.max(0,Math.min(3,hits));this.babaCueAt=performance.now();
    }
    update(dt, time) {
      const { owner: o } = this;
      const kind = o.presentation.kind, variant = o.presentation.variant;
      const battle = kind === "challenge" && variant === 2 && o.battleEnabled;
      const boost = kind === "boost", bonus = kind === "bonus";
      const speed = boost ? (variant ? 24 : 16) : bonus ? (variant === 1 ? 18 : variant === 2 ? 4 : 10) : battle ? 0 : .15;
      this.travel += dt * speed * (o.speedBoost || 1);
      this.corridor.scale.x = Math.max(1, o.camera.aspect / 1.8);
      this.portals.forEach((p,i) => {
        p.position.z = 7 - ((i*4 + this.travel) % 72);
        p.rotation.z = boost ? Math.sin(i*.25 + time*.65)*.2 : bonus && variant === 0 ? .12*Math.sin(i*.3+time*.2) : 0;
        p.position.x = boost ? Math.sin(p.position.z*.045+time*.4)*2 : 0;
      });
      const stage = o.scenery?.stage;
      const structure = battle ? "battle" : kind === "challenge" ? (variant === 1 ? "unko" : "baba")
        : boost ? (variant ? "upper" : "boost") : bonus ? ["red","blue","reg"][variant]
        : stage === "クラブのラウンジ" ? "lounge" : stage === "同人音楽即売会" ? "hall" : null;
      if(structure!=="baba"){this.babaCueHits=0;this.babaCueAt=-Infinity;this.babaDolly=0;}
      this.corridor.visible = !structure;
      if (this.stationStage) { this.stationStage.visible = !structure; this.stageKit.update(this.travel); }
      this.updateCzLighting(structure,time);
      for(const [name,profile] of Object.entries(this.structures)) {
        const boostBlueLayer=boost&&name==="blue";
        profile.group.visible=name===structure||boostBlueLayer;
        if(!profile.group.visible)continue;
        const normalRoom = name === 'hall' || name === 'lounge';
        profile.group.scale.x=normalRoom ? Math.max(1,o.camera.aspect/3.8) : Math.max(1,o.camera.aspect/2.2);
        profile.cells.forEach((cell,i)=>{
          const moving=bonus||boost;
          cell.visible = !normalRoom || i < (name === 'hall' ? 4 : 5);
          cell.position.z=boostBlueLayer?2-((i*7+this.travel*1.12+3.5)%70):moving?5-((i*7+this.travel)%70):normalRoom?2-i*11:-i*7;
          cell.rotation.z=boostBlueLayer?Math.sin(time*.55+i*.7)*.13:name==="red"?time*.12+i*.2:name==="reg"?time*.08:0;
          // Rings breathe with the BGM kick; the swell fades with distance down the tunnel.
          if(moving){const kick=(o.music?.kick||0)*(o.music?.active||0);cell.scale.setScalar(1+kick*.055*Math.max(0,1-Math.abs(cell.position.z+6)/40));}else if(cell.scale.x!==1)cell.scale.setScalar(1);
          if(name==="baba")cell.children.forEach(part=>{
            if(part.userData.doorSide) {
              const target=part.userData.doorSide*(3.4+(i<Math.max(this.babaCueHits,o.scenery?.babaHits||0)?3:0));
              part.position.x+=(target-part.position.x)*Math.min(1,dt*4);
            }
          });
        });
      }
      this.key.color.copy(o.theme.accent);
      this.rim.color.copy(o.theme.primary);
      this.key.intensity = boost ? 1.55 : 2.5;
      this.rim.intensity = boost ? 1.7 : bonus ? 2.5 : 1.5;
      // Room-specific lights must not leak into the next CZ / BONUS cut.
      this.key.position.set(-5,6,7);
      this.rim.position.set(6,-1,-4);
      if (structure === 'battle') {
        // Reserve headroom for contact light and the failing ceiling tubes.
        this.key.color.set(0xb6cce2);this.key.intensity=1.3;
        this.rim.color.set(0xa8b9ce);this.rim.intensity=.8;
      } else if (structure === 'baba') {
        const hits=Math.min(3,Math.max(this.babaCueHits,o.scenery?.babaHits||0));
        this.babaDolly+=(hits*1.1-this.babaDolly)*Math.min(1,dt*2.2);
        const age=Math.max(0,(performance.now()-this.babaCueAt)/1000),impact=Math.exp(-age*7);
        this.key.color.set(0xc8d4e5);this.key.intensity=1.05;
        this.rim.color.set(0xff3025);this.rim.intensity=1.4+hits*.35+impact*1.2;
        this.rim.position.set(4.8,1,-7);
        o.camera.position.set(Math.sin(time*.16)*.18,.22,8.8-this.babaDolly-impact*.22);
        o.camera.fov=52;o.camera.updateProjectionMatrix();o.camera.lookAt(0,.1,-18);
      } else if (structure === 'unko') {
        this.key.color.set(0x8ba6c5);this.key.intensity=1.12;
        this.rim.color.set(0x697a9d);this.rim.intensity=.72;
        o.camera.position.set(.45+Math.sin(time*.12)*.22,-.4,8.5+Math.sin(time*.16)*.2);
        o.camera.fov=53;o.camera.updateProjectionMatrix();o.camera.lookAt(0,.15,-15);
      } else if (kind === 'normal' && structure === 'hall') {
        const drift=Math.sin(time*.14), lift=Math.sin(time*.19);
        this.key.color.set(0xd9edff); this.key.intensity=2.12; this.key.position.set(-7.6+drift*1.9,4.1,-4.8);
        this.rim.color.set(0x9eb9cf); this.rim.intensity=1.06; this.rim.position.set(7.4,-.35,-3.1);
        o.scene.fog.density=.022;
        o.camera.position.set(drift*1.35,-.3+lift*.24,8.2+Math.cos(time*.11)*.7);
        o.camera.fov=58; o.camera.updateProjectionMatrix(); o.camera.lookAt(drift*.5,.6,-14);
      } else if (kind === 'normal' && structure === 'lounge') {
        const drift=Math.sin(time*.12), lift=Math.cos(time*.16);
        this.key.color.set(0xffd4a0); this.key.intensity=2.42; this.key.position.set(-7.2+drift*1.8,3.8,-4.2);
        this.rim.color.set(0xc7854c); this.rim.intensity=1.88; this.rim.position.set(7.1,-.15,-3.4);
        o.scene.fog.density=.019;
        o.camera.position.set(.5+drift*.82,.28+lift*.16,8.35+Math.sin(time*.09)*.45);
        o.camera.fov=54; o.camera.updateProjectionMatrix(); o.camera.lookAt(drift*.36,-.2,-12);
      } else if (kind === 'normal') {
        // Raking light separates the metal frame's bevel from its broad face;
        // the cooler rear fill keeps the vanishing point legible without a wash.
        this.key.color.set(0xdce9f2); this.key.intensity=2.35; this.key.position.set(-6,3.6,1.5);
        this.rim.color.set(0xa7c4d7); this.rim.intensity=1.65; this.rim.position.set(4.5,1.6,-10);
        o.scene.fog.density=.026;
        o.camera.position.set(-.65+Math.sin(time*.09)*.45,.42+Math.cos(time*.13)*.11,9.7);
        o.camera.fov=52; o.camera.updateProjectionMatrix(); o.camera.lookAt(0,0,-8);
      }
      this.updateNormalCue(performance.now());
      this.enemy.visible = battle;
      this.impact.visible = battle;
      this.fists.forEach(f => { f.visible = battle && !this.waiting && this.outcome === null; });
      if (!battle) { this.combat?.update(false,performance.now()); return; }
      const age = Math.max(0,(performance.now()-this.beatAt)/1000);
      const hit = Math.exp(-age*6);
      const attack = this.beat === 2 || this.beat === 3;
      const recoil = attack ? hit * this.favour : 0;
      this.impact.position.set(0,0,-1);
      this.impact.scale.setScalar(1.2+Math.min(age,1)*5);
      this.impactMaterial.opacity = attack && !this.waiting ? hit*.9 : 0;
      this.impactMaterial.color.set(this.favour > 0 ? 0xacf2ff : 0xff5b27);
      this.enemy.position.set(recoil*.6, .25 + Math.sin(time*1.1)*.09, -3 - Math.max(0,recoil)*2 + (this.favour < 0 && attack ? hit*2 : 0));
      // Keep facial features vertically aligned from the player's viewpoint, including on recoil.
      this.enemy.rotation.set(recoil*.06,recoil*.12,0);
      this.enemy.scale.setScalar(this.outcome === true ? Math.max(.03,1.4-age*2) : 1.4);
      o.camera.position.set(attack && this.favour < 0 ? Math.sin(age*44)*hit*.18 : 0, .3, this.waiting ? 8.5 : 8.5 - (this.beat === 1 ? hit*.8 : 0));
      o.camera.fov = 52; o.camera.updateProjectionMatrix(); o.camera.lookAt(0,0,-4);
      this.fists.forEach((f,i) => {
        const punch = this.beat === 2 && this.favour > 0 && i === 0 ? hit : this.beat === 3 && i === 1 ? hit*.65 : 0;
        f.position.set(f.userData.side * (2.9-punch*1.7),-1.8+punch,4-punch*5);
        f.rotation.set(.15, f.userData.side*-.25, f.userData.side*.3);
      });
      this.combat?.update(true,performance.now());
    }
  }
  window.CabinetWorld = CabinetWorld;
})();
