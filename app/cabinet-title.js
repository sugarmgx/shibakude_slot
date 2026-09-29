(() => {
  'use strict';
  class CabinetTitle {
    constructor(owner) {
      this.owner=owner;this.T=owner.THREE;this.scene=new this.T.Scene();
      this.camera=new this.T.PerspectiveCamera(35,1,.1,10000);
      this.group=new this.T.Group();this.payoutGroup=new this.T.Group();this.scene.add(this.group,this.payoutGroup);this.cache=new Map();
      this.node=document.querySelector('#lcdTitle');this.payoutNode=document.querySelector('#lcdBellAward');this.screen=document.querySelector('#lcdScreen');
      this.envRotationUniform={value:0};
      const T=this.T;
      this.materials=[
        new T.MeshStandardMaterial({color:0x030407,metalness:.88,roughness:.4,envMapIntensity:.85}),
        new T.MeshStandardMaterial({color:0xbac8d2,emissive:0x35434d,emissiveIntensity:.24,metalness:1,roughness:.23,envMapIntensity:1.35}),
        new T.MeshStandardMaterial({color:0xff4927,emissive:0xff4927,emissiveIntensity:.25,metalness:.82,roughness:.46,envMapIntensity:1.35}),
        new T.MeshStandardMaterial({color:0xf4fbff,emissive:0x647985,emissiveIntensity:.18,metalness:1,roughness:.32,envMapIntensity:1.65}),
      ];
      this.payoutMaterials=[
        new T.MeshStandardMaterial({color:0x120904,metalness:.92,roughness:.34,envMapIntensity:1.05}),
        new T.MeshStandardMaterial({color:0xffd47a,emissive:0x5f2600,emissiveIntensity:.26,metalness:1,roughness:.2,envMapIntensity:1.7}),
        new T.MeshStandardMaterial({color:0xffe5a0,emissive:0xc47812,emissiveIntensity:.20,metalness:.9,roughness:.30,envMapIntensity:1.85}),
        new T.MeshStandardMaterial({color:0xfff4c4,emissive:0xb76c16,emissiveIntensity:.32,metalness:1,roughness:.22,envMapIntensity:2.0}),
      ];
      const metalTextureSource=window.CabinetTitleMetalTextureData||'./assets/textures/title/metal-machined-micro-v1.png';
      new T.TextureLoader().load(metalTextureSource,texture=>{
        if(owner.disposed){texture.dispose();return;}
        texture.wrapS=texture.wrapT=T.MirroredRepeatWrapping;
        texture.repeat.set(.032,.032);
        texture.anisotropy=Math.min(8,owner.renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate=true;this.metalTexture=texture;
        for(const [material,scale] of [[this.materials[2],.30],[this.materials[3],.18],[this.payoutMaterials[2],.34],[this.payoutMaterials[3],.2]]) {
          material.roughnessMap=texture;material.bumpMap=texture;material.bumpScale=scale;material.needsUpdate=true;
        }
      },undefined,error=>console.warn('立体文字の金属素材を読み込めないため手続き質感を維持します',error));
      const key=new T.DirectionalLight(0xffffff,2.6);key.position.set(-100,180,150);this.scene.add(key);
      this.sweep=new T.DirectionalLight(0xffefd9,1.8);this.sweep.position.set(200,30,120);this.scene.add(this.sweep);
      this.scene.add(new T.AmbientLight(0xffffff,.25));
      const machineFinish=(material,strength,key,goldGradient=false)=>{
        material.onBeforeCompile=shader=>{
          shader.uniforms.uTitleEnvRotation=this.envRotationUniform;
          shader.fragmentShader='uniform float uTitleEnvRotation;\n'+shader.fragmentShader;
          // onBeforeCompile runs before Three expands includes. Patch the actual
          // physical environment chunk, not a string absent from the shader.
          shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',T.ShaderChunk.envmap_physical_pars_fragment);
          shader.fragmentShader=shader.fragmentShader.replace(
            'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
            `reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
            float titleEnvCos = cos(uTitleEnvRotation);
            float titleEnvSin = sin(uTitleEnvRotation);
            reflectVec.xz = mat2(titleEnvCos, -titleEnvSin, titleEnvSin, titleEnvCos) * reflectVec.xz;`
          );
          if(strength>0){
            shader.vertexShader='varying vec3 vTitleLocal;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTitleLocal=position;');
            shader.fragmentShader='varying vec3 vTitleLocal;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
            float titleFront = smoothstep(0.72, 0.96, abs(normal.z));
            float titleSide = 1.0 - titleFront;
            float broadCut = sin(vTitleLocal.y * 0.092) + sin(vTitleLocal.y * 0.31 + vTitleLocal.x * 0.047) * 0.36;
            float fineCut = sin(vTitleLocal.z * 1.65 + vTitleLocal.y * 0.19) * sin(vTitleLocal.x * 0.075 - vTitleLocal.z * 0.73);
            normal = normalize(normal + vec3(
              broadCut * titleFront * ${strength.toFixed(3)} + fineCut * titleSide * ${(strength*.54).toFixed(3)},
              fineCut * titleFront * ${(strength*.28).toFixed(3)} + broadCut * titleSide * ${(strength*.32).toFixed(3)},
              0.0
            ));
            float machinedBand = 0.5 + 0.5 * sin(vTitleLocal.y * 0.16 + vTitleLocal.z * 0.82);
            roughnessFactor *= mix(1.0, 0.90 + machinedBand * 0.18, titleFront * 0.72 + titleSide);
          `);
          if(goldGradient){
            shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
            float payoutGoldGradient = smoothstep(-40.0, 40.0, vTitleLocal.y);
            vec3 payoutGoldLow = vec3(0.60, 0.26, 0.025);
            vec3 payoutGoldHigh = vec3(1.0, 0.92, 0.55);
            diffuseColor.rgb *= mix(payoutGoldLow, payoutGoldHigh, payoutGoldGradient);
            diffuseColor.rgb += vec3(0.20, 0.08, 0.005) * pow(1.0 - payoutGoldGradient, 3.0);
            `);
          }
          }
        };
        material.customProgramCacheKey=()=>`cabinet-title-machine-${key}-v5`;
      };
      machineFinish(this.materials[0],0,'back-dark');
      machineFinish(this.materials[1],0,'back-metal');
      machineFinish(this.materials[2],.17,'face');
      machineFinish(this.materials[3],.11,'bevel');
      machineFinish(this.payoutMaterials[0],0,'payout-back-dark');
      machineFinish(this.payoutMaterials[1],0,'payout-back-metal');
      machineFinish(this.payoutMaterials[2],.2,'payout-face',true);
      machineFinish(this.payoutMaterials[3],.13,'payout-bevel',true);
      const installFont=data=>{
        if(owner.disposed||!data)return;
        // The bundled subset contains ASCII +, while the existing payout copy
        // uses its full-width counterpart. Keep the DOM copy and reuse the glyph.
        const glyphs={...data.glyphs};
        if(!glyphs['＋']&&glyphs['+'])glyphs['＋']=glyphs['+'];
        this.font=new window.CabinetAssets.FontLoader().parse({...data,glyphs});
      };
      if(window.LineSeedJPExtraBoldTypeface)installFont(window.LineSeedJPExtraBoldTypeface);
      else if(window.SlotBlackTypeface)installFont(window.SlotBlackTypeface);
      else fetch('./assets/fonts/line-seed-jp-extrabold.typeface.json?v=1').then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(installFont).catch(error=>console.warn('立体文字を読み込めないため既存文字を維持します',error));
    }
    make(text) {
      if(this.cache.has(text))return this.cache.get(text);
      const T=this.T,geometries=[],letters=[],bounds=new T.Box3();let advance=0;
      // Keep every backing layer on the original outline. Wide positive bevels
      // close counters and intersect adjacent strokes in this heavy CJK font.
      // The tiny face bevel is inset, so it never expands into a glyph's holes.
      for(const character of text){
        const shapes=this.font.generateShapes(character,100),parts=[];
        if(shapes.length){
          for(const [depth,bevel] of [[18,0],[9,0],[4,.3],[.8,.12]]) {
            parts.push(new T.ExtrudeGeometry(shapes,{depth,bevelEnabled:bevel>0,bevelThickness:.2,bevelSize:bevel,bevelOffset:-bevel,bevelSegments:4,steps:1,curveSegments:12}));
          }
          parts[2].computeBoundingBox();const box=parts[2].boundingBox,center=box.getCenter(new T.Vector3());
          bounds.union(box.clone().translate(new T.Vector3(advance,0,0)));
          parts.forEach(g=>g.translate(-center.x,-center.y,0));
          letters.push({parts,x:advance+center.x,y:center.y});geometries.push(...parts);
        }
        advance+=this.font.data.glyphs[character].ha*100/this.font.data.resolution;
      }
      const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
      letters.forEach(letter=>{letter.x-=center.x;letter.y-=center.y;});
      const result={geometries,letters,size};this.cache.set(text,result);
      if(this.cache.size>8){
        // Active title / payout meshes still reference their cached geometries.
        const key=[...this.cache.keys()].find(key=>key!==text&&key!==this.node?.textContent.trim()&&key!==this.payoutNode?.textContent.trim());
        if(key!==undefined){this.cache.get(key).geometries.forEach(g=>g.dispose());this.cache.delete(key);}
      }
      return result;
    }
    renderPayout(now,host,w,h,distance,reduced) {
      const node=this.payoutNode;
      const text=node?.textContent.trim()||'';
      const active=Boolean(node?.classList.contains('is-active'));
      const eligible=active&&text&&[...text].every(c=>this.font.data.glyphs[c]);
      node?.classList.toggle('has-3d-payout',Boolean(eligible));
      if(!eligible){this.payoutSignature=null;this.payoutGroup.visible=false;return false;}
      const signature=`${node.dataset.token||''}|${text}`;
      if(signature!==this.payoutSignature){
        this.payoutSignature=signature;this.payoutStarted=now;this.payoutGroup.clear();
        const shape=this.make(text);this.payoutSize=shape.size;
        this.payoutLetters=shape.letters.map(letter=>{
          const pivot=new this.T.Group();this.payoutGroup.add(pivot);
          pivot.position.set(letter.x,letter.y,0);
          letter.parts.forEach((g,i)=>{const material=i>=2?[this.payoutMaterials[2],this.payoutMaterials[3]]:this.payoutMaterials[i];const mesh=new this.T.Mesh(g,material);mesh.position.z=[-18,0,9,12.75][i];pivot.add(mesh);});
          return {pivot,x:letter.x,y:letter.y};
        });
      }
      const age=reduced ? .3 : Math.min(.6,Math.max(0,(now-this.payoutStarted)/1000));
      const smooth=t=>t*t*(3-2*t);
      const first=smooth(Math.min(1,age/.1)),middle=Math.min(1,Math.max(0,(age-.1)/.4)),last=smooth(Math.min(1,Math.max(0,(age-.5)/.1)));
      const x=(1-first)*w*.52+first*((1-middle)*w*.02+middle*((1-last)*-w*.1+last*-w*.54));
      const y=x*.38;
      // Three turns in / a readable, gentle roll / three turns out. Roll around
      // the travel axis (not a flat clock-hand rotation around the camera).
      const turns=reduced?0:age<.1?first*3:age<.5?3+Math.sin(middle*Math.PI)*.055:3+last*3;
      const fit=Math.min(host.width*.36/(this.payoutSize.x+18),host.height*.22/(this.payoutSize.y+18));
      this.payoutGroup.visible=true;this.payoutGroup.scale.setScalar(fit);
      this.payoutGroup.position.set(w*.5+x,h*.43+y,0);
      this.payoutGroup.rotation.set(turns*Math.PI*2,0,Math.atan(.38),'ZYX');
      this.payoutMaterials[2].emissiveIntensity=.20;
      return true;
    }
    render(now) {
      if(!this.node||!this.screen||!this.font)return;
      const host=this.owner.host.getBoundingClientRect();
      if(!host.width||!host.height)return;
      const w=this.owner.width,h=this.owner.height;
      const distance=h/(2*Math.tan(this.camera.fov*Math.PI/360));
      this.camera.aspect=w/h;this.camera.position.set(w/2,h/2,distance);this.camera.updateProjectionMatrix();
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const text=this.node.textContent.trim(),classes=this.screen.className;
      const visible=/(mode-bonus-(red|blue|reg|ready)|mode-boost|mode-ending|battle-win)/.test(classes)||/^(WIN|玉獲得|開米確定|BONUS確定)$/.test(text);
      const eligible=visible&&text&&[...text].every(c=>this.font.data.glyphs[c]);
      this.node.classList.toggle('has-3d-title',Boolean(eligible));
      if(!eligible){this.signature=null;this.group.visible=false;}
      else {
        const signature=text+'|'+(classes.match(/\bmode-[\w-]+/)||[''])[0];
        if(signature!==this.signature) {
          this.signature=signature;this.group.clear();const shape=this.make(text);this.size=shape.size;this.startedAt=performance.now();
          this.entryDelay=document.querySelector('.machine-window.bonus-confirmed') ? .65 : 0;
          this.letters=shape.letters.map((letter,index)=>{
            const pivot=new this.T.Group();this.group.add(pivot);
            letter.parts.forEach((g,i)=>{const material=i>=2?[this.materials[2],this.materials[3]]:this.materials[i];const mesh=new this.T.Mesh(g,material);mesh.position.z=[-18,0,9,12.75][i];pivot.add(mesh);});
            return {pivot,x:letter.x,y:letter.y,phase:index*2.399963,delay:index*.065};
          });
          const color=/mode-bonus-red/.test(classes)?0xe72412:/mode-bonus-blue/.test(classes)?0x158fe8:/mode-boost/.test(classes)?0x19bd70:0xe9a527;
          this.materials[2].color.set(color);this.materials[2].emissive.set(color);
        }
        const box=this.node.getBoundingClientRect();
        if(box.width&&box.height){
          const fit=Math.min(Math.min(box.width*1.10,host.width*.92)/(this.size.x+24),Math.min(box.height*1.18,host.height*.46)/(this.size.y+24));
          const age=Math.max(0,(now-this.startedAt)/1000);
          this.group.visible=true;this.group.scale.setScalar(fit);this.group.position.set(box.left-host.left+box.width/2,h-(box.top-host.top+box.height/2),0);this.group.rotation.set(-.06,.025,0);
          for(const letter of this.letters){const elapsed=age-this.entryDelay-letter.delay;const t=reduced?1:Math.max(0,Math.min(1,elapsed/1.65));const remaining=Math.pow(1-t,6),p=letter.phase;letter.pivot.visible=reduced||elapsed>=0;letter.pivot.position.set(letter.x+Math.cos(p)*90*remaining,letter.y+Math.sin(p)*70*remaining,distance/fit*(.62+.05*Math.sin(p))*remaining);letter.pivot.rotation.set(Math.sin(p+.7)*1.6*remaining,Math.cos(p+.3)*1.8*remaining,Math.sin(p+1.4)*1.0*remaining);}
          if(classes.includes('bt-announcement')){
            const t=reduced?1:Math.max(0,Math.min(1,age/.65)),remaining=Math.pow(1-t,3);
            for(const letter of this.letters){
              letter.pivot.visible=true;
              letter.pivot.position.set(letter.x,letter.y-12*remaining,-distance/fit*.8*remaining);
              letter.pivot.rotation.set(-.35*remaining,0,0);
            }
          }
        }
      }
      this.envRotationUniform.value=(now*.000035)%(Math.PI*2);
      const payoutVisible=this.renderPayout(now,host,w,h,distance,reduced);
      if(!eligible&&!payoutVisible)return;
      const titleAge=this.startedAt ? Math.max(0,(now-this.startedAt)/1000) : 0;
      this.sweep.position.x=reduced?150:Math.sin(Math.min(titleAge,1.2)/1.2*Math.PI-Math.PI/2)*240;
      const renderer=this.owner.renderer,auto=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(this.scene,this.camera);renderer.autoClear=auto;
    }
    dispose(){this.node?.classList.remove('has-3d-title');this.payoutNode?.classList.remove('has-3d-payout');this.cache.forEach(item=>item.geometries.forEach(g=>g.dispose()));this.materials.forEach(m=>m.dispose());this.payoutMaterials.forEach(m=>m.dispose());this.metalTexture?.dispose();}
  }
  window.CabinetTitle=CabinetTitle;
})();
