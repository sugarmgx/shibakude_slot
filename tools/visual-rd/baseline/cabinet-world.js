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
      this.loadSurfaceTexture();
    }
    loadSurfaceTexture() {
      const o = this.owner, T = this.T;
      new T.TextureLoader().load('./assets/textures/precision-panel-v1.png', texture => {
        if (o.disposed) { texture.dispose(); return; }
        texture.wrapS = texture.wrapT = T.MirroredRepeatWrapping;
        texture.anisotropy = Math.min(4, o.renderer.capabilities.getMaxAnisotropy());
        o.textures.push(texture);
        // The station retains its original untextured frames. Only variant scenery is mapped.
        const mapped = new Set();
        for (const {group} of Object.values(this.structures)) group.traverse(mesh => {
          if (!mesh.isMesh) return;
          let mat = mesh.material;
          if (mat === this.steel) {
            if (!this.detailSteel) this.detailSteel = o.trackMaterial(this.steel.clone());
            mesh.material = mat = this.detailSteel;
          }
          if (mapped.has(mat)) return;
          mapped.add(mat);
          mat.bumpMap = texture;
          mat.bumpScale = mat.transparent ? .018 : .045;
          mat.specularMap = texture;
          if (!mat.transparent) mat.map = texture;
          mat.needsUpdate = true;
        });
      }, undefined, () => console.warn('構造物テクスチャを読めないため素材色で描画します'));
    }
    createStructures(beam) {
      const T = this.T, o = this.owner;
      this.structures = {};
      const glass = o.trackMaterial(new T.MeshPhongMaterial({ color: 0x81bdcd, envMap: this.env, reflectivity: .65, transparent: true, opacity: .30, shininess: 130, depthWrite: false }));
      const redGlass = o.trackMaterial(new T.MeshPhongMaterial({ color: 0xe64d42, specular: 0xffddd2, envMap: this.env, reflectivity: .5, transparent: true, opacity: .48, shininess: 110, depthWrite: false }));
      const regGlass = o.trackMaterial(new T.MeshPhongMaterial({ color: 0xc3cabf, specular: 0xffffff, envMap: this.env, reflectivity: .32, transparent: true, opacity: .36, shininess: 48, depthWrite: false }));
      const hallMetal = o.trackMaterial(new T.MeshPhongMaterial({color:0xbac7d0, specular:0xf4faff, shininess:65}));
      const loungeGlass = o.trackMaterial(new T.MeshPhongMaterial({color:0xd9ae78, envMap:this.env, reflectivity:.8, transparent:true, opacity:.46, shininess:130, depthWrite:false}));
      const floorMaterial = o.trackMaterial(new T.MeshPhongMaterial({color:0x38424a, specular:0x718392, shininess:90}));
      const boostSteel = o.trackMaterial(new T.MeshPhongMaterial({ color: 0x78918a, emissive: 0x10221d, envMap: this.env, reflectivity: .3, shininess: 65 }));
      const ring = o.track(new T.TorusGeometry(4.3,.28,8,40));
      const arch = o.track(new T.TorusGeometry(4.5,.12,6,32,Math.PI));
      const cylinder = o.track(new T.CylinderGeometry(.35,.35,8,8));
      const cube = (group,x,y,z,w,h,d,mat=this.steel,roll=0) => {
        const mesh = new T.Mesh(beam,mat); mesh.position.set(x,y,z); mesh.scale.set(w,h,d); mesh.rotation.z=roll; group.add(mesh); return mesh;
      };
      for (const name of ["hall","lounge","unko","baba","battle","red","blue","reg","boost","upper"]) {
        const group = new T.Group(); group.visible=false; this.root.add(group);
        const cells=[];
        for (let i=0;i<(name==="battle"?5:10);i++) {
          const cell=new T.Group(); group.add(cell); cells.push(cell);
          if (name==="red" || name==="reg") {
            const rotorMaterial = name === 'red' ? redGlass : regGlass;
            const rotor=new T.Mesh(ring,rotorMaterial); cell.add(rotor);
            const blades=name==="red"?8:4;
            for(let b=0;b<blades;b++) { const a=b*Math.PI*2/blades; cube(cell,Math.cos(a)*4,Math.sin(a)*4,0,.8,1.8,.6,rotorMaterial,a); }
            if(name==="reg")cell.scale.setScalar(.75);
          } else if(name==="blue") {
            const canopy=new T.Mesh(arch,glass); canopy.position.y=-.8; cell.add(canopy);
            for(const side of [-1,1])cube(cell,side*4.5,-2,0,.16,3.2,.4,glass);
          } else if(name==="lounge") {
            for(const side of [-1,1]) {
              const column=new T.Mesh(cylinder,loungeGlass); column.position.set(side*4.4,0,0); column.scale.set(2.2,1,2.2); cell.add(column);
              cube(cell,side*5.5,0,-1,.2,8,3,loungeGlass);
              cube(cell,side*4.4,3.4,0,1.8,.15,1.8,hallMetal);
            }
            cube(cell,0,-4,0,13,.2,7,floorMaterial);
          } else if(name==="baba" || name==="unko") {
            for(const side of [-1,1]) {
              const door=cube(cell,side*3.4,0,0,2.4,7,.65);
              door.userData.doorSide=side;
            }
            cube(cell,0,3.6,0,9,.6,1.2);
            if(name==="unko")cube(cell,0,-3.7,0,9,.6,2);
          } else if(name==="battle") {
            cube(cell,0,-3.3,0,18,.35,10);
            for(const side of [-1,1]) {
              cube(cell,side*6,0,0,.65,7,.9);
              cube(cell,side*5.5,1.8,0,.3,5,.5,hallMetal,side*.42);
              cube(cell,side*4.6,-2.9,0,.14,.12,9,glass);
              for(let tier=0;tier<3;tier++)cube(cell,side*(6.5+tier*.65),-2.5+tier*.4,0,.6,.4,8);
            }
            cube(cell,0,4,0,12,.35,1,hallMetal);
          } else if(name==="hall") {
            for(const side of [-1,1]) {
              cube(cell,side*7,0,0,.3,8,.4,hallMetal);
              cube(cell,side*6.5,1,0,.2,5,.3,hallMetal,side*.22);
            }
            cube(cell,0,4,0,14,.3,.5,hallMetal);
            cube(cell,0,3.3,0,14,.2,.4,hallMetal);
            for(let brace=-5;brace<=5;brace+=2)cube(cell,brace,3.65,0,.14,1.5,.2,hallMetal,.9);
            cube(cell,0,-4,0,18,.2,9,floorMaterial);
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
        const edges = new Map();
        const lineMaterial = o.trackMaterial(new T.LineBasicMaterial({color:0xb9d5e0,transparent:true,opacity:.13,depthWrite:false}));
        const meshes=[]; group.traverse(part=>{if(part.isMesh)meshes.push(part);});
        meshes.forEach(mesh=>{
          if(!edges.has(mesh.geometry))edges.set(mesh.geometry,o.track(new T.EdgesGeometry(mesh.geometry,28)));
          mesh.add(new T.LineSegments(edges.get(mesh.geometry),lineMaterial));
        });
        this.structures[name]={group,cells};
      }
    }
    cue(beat, role) {
      this.beat = beat; this.beatAt = performance.now();
      // Choreography uses the displayed role, never the held success flag.
      this.favour = ["miss", "replay"].includes(role) ? -1 : 1;
      this.waiting = false; this.outcome = null;
    }
    update(dt, time) {
      const { owner: o } = this;
      const kind = o.presentation.kind, variant = o.presentation.variant;
      const battle = kind === "challenge" && variant === 2 && o.battleEnabled;
      const boost = kind === "boost", bonus = kind === "bonus";
      const speed = boost ? (variant ? 24 : 16) : bonus ? (variant === 1 ? 18 : variant === 2 ? 4 : 10) : battle ? 0 : .15;
      this.travel += dt * speed;
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
      this.corridor.visible = !structure;
      for(const [name,profile] of Object.entries(this.structures)) {
        profile.group.visible=name===structure;
        if(!profile.group.visible)continue;
        const normalRoom = name === 'hall' || name === 'lounge';
        profile.group.scale.x=normalRoom ? Math.max(1,o.camera.aspect/3.8) : Math.max(1,o.camera.aspect/2.2);
        profile.cells.forEach((cell,i)=>{
          const moving=bonus||boost;
          cell.visible = !normalRoom || i < (name === 'hall' ? 4 : 5);
          cell.position.z=moving?5-((i*7+this.travel)%70):normalRoom?2-i*11:-i*7;
          cell.rotation.z=name==="red"?time*.12+i*.2:name==="reg"?time*.08:0;
          if(name==="baba")cell.children.forEach(part=>{
            if(part.userData.doorSide) {
              const target=part.userData.doorSide*(3.4+(i<(o.scenery?.babaHits||0)?3:0));
              part.position.x+=(target-part.position.x)*Math.min(1,dt*4);
            }
          });
        });
      }
      this.key.color.copy(o.theme.accent);
      this.rim.color.copy(o.theme.primary);
      this.key.intensity = boost ? 1.2 : 2.5;
      this.rim.intensity = boost ? 1.1 : bonus ? 2.5 : 1.5;
      if (kind === 'normal' && structure === 'hall') {
        this.key.color.set(0xd9edff); this.key.intensity=2.25;
        this.rim.color.set(0xc7d6df); this.rim.intensity=.9;
        o.camera.position.set(Math.sin(time*.17)*1.8,-.5+Math.sin(time*.23)*.35,7+Math.sin(time*.13)*2);
        o.camera.fov=60; o.camera.updateProjectionMatrix(); o.camera.lookAt(Math.sin(time*.11)*.8,1,-14);
      } else if (kind === 'normal' && structure === 'lounge') {
        this.key.color.set(0xffd4a0); this.key.intensity=3.2;
        this.rim.color.set(0xc7854c); this.rim.intensity=3;
        o.camera.position.set(.5,.3,8); o.camera.fov=52; o.camera.updateProjectionMatrix(); o.camera.lookAt(0,-.3,-12);
      }
      this.enemy.visible = battle;
      this.impact.visible = battle;
      this.fists.forEach(f => { f.visible = battle && !this.waiting && this.outcome === null; });
      if (!battle) return;
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
    }
  }
  window.CabinetWorld = CabinetWorld;
})();
