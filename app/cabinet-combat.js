(() => {
  'use strict';
  // Cosmetic deterministic debris; never reads or alters an award / game RNG.
  class CabinetCombat {
    constructor(world) {
      this.world=world;const o=world.owner,T=o.THREE;
      this.T=T;this.startedAt=-Infinity;this.direction=1;
      this.root=new T.Group();world.root.add(this.root);
      this.matrix=new T.Matrix4();this.position=new T.Vector3();this.scale=new T.Vector3();this.rotation=new T.Quaternion();this.euler=new T.Euler();
      const geometry=o.track(new T.TetrahedronGeometry(1,0));
      this.material=o.trackMaterial(new T.MeshPhongMaterial({color:0xe9bc82,emissive:0x39220c,specular:0xffffff,shininess:120,envMap:world.env,transparent:true,opacity:0,depthWrite:false}));
      this.chips=new T.InstancedMesh(geometry,this.material,28);this.chips.frustumCulled=false;this.chips.instanceMatrix.setUsage(T.DynamicDrawUsage);this.root.add(this.chips);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
      const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,3,32,32,31);
      gradient.addColorStop(0,'rgba(0,0,0,.7)');gradient.addColorStop(.5,'rgba(0,0,0,.3)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
      const texture=new T.CanvasTexture(canvas);o.textures.push(texture);
      const shadowMaterial=o.trackMaterial(new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
      this.shadow=new T.Mesh(o.track(new T.PlaneGeometry(7,5)),shadowMaterial);this.shadow.rotation.x=-Math.PI/2;this.shadow.position.set(0,-3.04,-3);this.root.add(this.shadow);
      const traceMaterial=o.trackMaterial(new T.MeshBasicMaterial({color:0xb1d5e0,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
      this.trace=new T.Mesh(o.track(new T.RingGeometry(.94,1,48)),traceMaterial);this.trace.rotation.x=-Math.PI/2;this.trace.position.set(0,-3.035,-3);this.root.add(this.trace);
      this.streakMaterial=o.trackMaterial(new T.MeshBasicMaterial({color:0xd4efff,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
      this.streaks=o.track(new T.InstancedMesh(o.track(new T.BoxGeometry(1,1,1)),this.streakMaterial,16));
      this.streaks.frustumCulled=false;this.streaks.instanceMatrix.setUsage(T.DynamicDrawUsage);this.root.add(this.streaks);
    }
    cue(beat,favour) {
      if(beat!==2&&beat!==3){this.startedAt=-Infinity;return;}
      this.startedAt=performance.now();this.direction=favour;
    }
    update(active,now) {
      const w=this.world;this.root.visible=active;
      if(!active)return;
      this.shadow.position.x=w.enemy.position.x;this.shadow.position.z=w.enemy.position.z;
      this.shadow.material.opacity=w.outcome===true?.2:.65;
      const age=(now-this.startedAt)/1000;
      const live=age>=0&&age<.65&&!w.waiting&&w.outcome===null;
      this.chips.visible=this.trace.visible=this.streaks.visible=live;
      if(!live)return;
      const impact=Math.exp(-age*9);
      this.streakMaterial.color.set(this.direction>0?0xb9e9ff:0xff7947);
      this.streakMaterial.opacity=Math.pow(1-age/.65,2)*.9;
      // One short local bounce at contact, not a full-screen flash. The next
      // world update restores the normal lights before this contribution.
      w.rim.color.copy(this.streakMaterial.color);w.rim.intensity+=impact*1.8;
      w.setCzProbe(this.streakMaterial.color,.09+impact*.16);
      this.material.opacity=Math.pow(1-age/.65,1.6)*.8;
      this.trace.scale.setScalar(1+age*12);this.trace.material.opacity=(1-age/.65)*.11;
      for(let i=0;i<28;i++) {
        const angle=i*2.399963229728653,speed=8+(i%7)*1.2;
        this.position.set(Math.cos(angle)*age*speed,.1+Math.sin(angle)*age*speed-age*age*5,-1+age*(this.direction>0?2:-3));
        this.euler.set(age*(i%5+1)*5,angle+age*7,age*9);this.rotation.setFromEuler(this.euler);
        const size=.04+(i%4)*.016;this.scale.set(size*2.8,size,size*.7);
        this.matrix.compose(this.position,this.rotation,this.scale);this.chips.setMatrixAt(i,this.matrix);
      }
      this.chips.instanceMatrix.needsUpdate=true;
      for(let i=0;i<16;i++) {
        const angle=i*Math.PI/8+.14,reach=1.65+age*(15+i%3);
        this.position.set(Math.cos(angle)*reach,Math.sin(angle)*reach*.68,-1+age*(this.direction>0?3:-2));
        this.euler.set(0,0,angle);this.rotation.setFromEuler(this.euler);
        this.scale.set((.75+(i%4)*.2)*(1+age*2),.055+(i%3)*.018,.018);
        this.matrix.compose(this.position,this.rotation,this.scale);this.streaks.setMatrixAt(i,this.matrix);
      }
      this.streaks.instanceMatrix.needsUpdate=true;
    }
  }
  window.CabinetCombat=CabinetCombat;
})();
