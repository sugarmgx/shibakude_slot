(() => {
  'use strict';
  // PRIVATE_SPEC: render-only helpers for the pinned Three r149 WebGL pipeline.
  class CabinetSurfaces {
    constructor(owner) { this.owner=owner; this.T=owner.THREE; this.boxes=new Map(); }
    box(w,h,d) {
      const key=`${w}/${h}/${d}`;
      if(this.boxes.has(key))return this.boxes.get(key);
      const T=this.T, bevel=Math.min(.065,w*.12,h*.12,d*.16);
      const x=w/2-bevel,y=h/2-bevel,cut=Math.min(x,y,.12)*.45;
      const outline=new T.Shape();
      [[-x+cut,-y],[x-cut,-y],[x,-y+cut],[x,y-cut],[x-cut,y],[-x+cut,y],[-x,y-cut],[-x,-y+cut]]
        .forEach(([a,b],i)=>i?outline.lineTo(a,b):outline.moveTo(a,b));
      outline.closePath();
      const geometry=new T.ExtrudeGeometry(outline,{depth:d-2*bevel,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1,curveSegments:1});
      geometry.translate(0,0,-d/2+bevel);
      // Projection in physical units prevents stretched panel texture on long beams.
      const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
      for(let i=0;i<p.count;i++) {
        const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
        uv.setXY(i,(ax>ay&&ax>az?p.getZ(i):p.getX(i))*.32,(ay>az&&ay>=ax?p.getZ(i):p.getY(i))*.32);
      }
      uv.needsUpdate=true;
      // Room-only AO/light maps use this stable secondary channel; the primary
      // channel remains the physical-size projection used by surface textures.
      geometry.setAttribute('uv2',uv.clone());
      geometry.clearGroups();
      this.owner.track(geometry); this.boxes.set(key,geometry); return geometry;
    }
    finish(material) {
      if(material.userData.cabinetFinish)return;
      material.userData.cabinetFinish=true;
      const glass=material.transparent;
      material.envMap=this.owner.hdri?.phong||this.environment();
      if(this.owner.hdri)material.reflectivity=material.transparent?.25:.18;
      material.combine=this.T.MixOperation;
      if (!glass) material.extensions = {...material.extensions, derivatives:true};
      material.onBeforeCompile=shader=>{
        if (!glass) shader.fragmentShader=shader.fragmentShader.replace('#include <lights_phong_fragment>', `
          #include <lights_phong_fragment>
          #if defined(USE_UV) && !defined(UVS_VERTEX_ONLY)
            // Brushed highlights: broad finish variation plus filtered machining
            // lines. Fade below pixel size rather than shimmering with the camera.
            float brushPhase = vUv.y * 86.0;
            float brushVisibility = 1.0 - smoothstep(0.35, 1.4, fwidth(brushPhase));
            float brush = sin(brushPhase * 6.2831853) * brushVisibility;
            float finishVariation = 0.5 + 0.5 * sin(vUv.x * 5.1 + sin(vUv.y * 3.7));
            material.specularShininess *= mix(0.64, 1.18, finishVariation) + brush * 0.055;
            material.specularStrength *= 0.92 + brush * 0.055;
          #endif
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_fragment>', `
          float grazing = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
          float originalStrength = specularStrength;
          specularStrength *= ${glass?'0.30 + grazing * 0.70':'0.22 + grazing * 0.58'};
          #include <envmap_fragment>
          specularStrength = originalStrength;
          ${glass?'diffuseColor.a *= 0.80 + grazing * 0.20; outgoingLight += diffuse * grazing * 0.12;':''}
          float peak = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));
          if (peak > 0.80) outgoingLight *= (0.80 + 0.20 * (1.0 - exp(-(peak - 0.80) * 5.0))) / peak;
        `);
      };
      material.customProgramCacheKey=()=>`cabinet-fresnel-brushed-r149-${glass?1:0}`;
      material.needsUpdate=true;
    }
    environment() {
      if(this.env)return this.env;
      const faces=[];
      // Continuous direction-space light rig avoids hard cube-face seams in the old atlas.
      const ray=[(u,v)=>[1,-v,-u],(u,v)=>[-1,-v,u],(u,v)=>[u,1,v],(u,v)=>[u,-1,-v],(u,v)=>[u,-v,1],(u,v)=>[-u,-v,-1]];
      for(let face=0;face<6;face++) {
        const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
        const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);
        for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
          let [dx,dy,dz]=ray[face]((x+.5)/64-1,(y+.5)/64-1);
          const length=Math.hypot(dx,dy,dz);dx/=length;dy/=length;dz/=length;
          const ceiling=Math.exp(-Math.pow((dy-.68)*19,2))*Math.pow(Math.abs(dz),4);
          const side=Math.exp(-Math.pow((Math.abs(dx)-.85)*22,2))*Math.exp(-Math.pow((dy-.12)*3,2));
          const top=Math.pow(Math.max(0,dy),6)*.13;
          const light=ceiling*.68+side*.3+top;
          const at=(y*128+x)*4;
          pixels.data[at]=Math.min(255,10+light*219);
          pixels.data[at+1]=Math.min(255,14+light*225);
          pixels.data[at+2]=Math.min(255,19+light*230);
          pixels.data[at+3]=255;
        }
        ctx.putImageData(pixels,0,0);faces.push(canvas);
      }
      this.env=new this.T.CubeTexture(faces);this.env.needsUpdate=true;this.owner.textures.push(this.env);return this.env;
    }
    edges(group,material) {
      // One edge draw per cell. Only the independently sliding doors remain separate.
      const T=this.T,positions=[],meshes=[],cache=new Map(),point=new T.Vector3();
      group.traverse(node=>{if(node.isMesh)meshes.push(node);});
      meshes.forEach(mesh=>{
        let edges=cache.get(mesh.geometry);
        if(!edges){edges=new T.EdgesGeometry(mesh.geometry,28);cache.set(mesh.geometry,edges);}
        if(mesh.userData.doorSide){mesh.add(new T.LineSegments(this.owner.track(edges.clone()),material));return;}
        mesh.updateMatrix();
        const p=edges.attributes.position;
        for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrix);positions.push(point.x,point.y,point.z);}
      });
      cache.forEach(geometry=>geometry.dispose());
      if(positions.length){const geometry=this.owner.track(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));group.add(new T.LineSegments(geometry,material));}
    }
    batch(group) {
      const buckets=new Map();
      for(const mesh of [...group.children]) {
        if(!mesh.isMesh||mesh.userData.doorSide)continue;
        const key=`${mesh.geometry.uuid}/${mesh.material.uuid}`;
        if(!buckets.has(key))buckets.set(key,[]);
        buckets.get(key).push(mesh);
      }
      for(const meshes of buckets.values()) {
        if(meshes.length<2)continue;
        const batch=new this.T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);
        // Three r149 does not derive transformed instance bounds. Whole-cell lifetime is controlled by its parent.
        batch.frustumCulled=false;
        meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);group.remove(mesh);});
        batch.instanceMatrix.needsUpdate=true;group.add(batch);
        this.owner.track(batch);
      }
    }
  }
  window.CabinetSurfaces=CabinetSurfaces;
})();
