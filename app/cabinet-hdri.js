(() => {
  'use strict';
  window.loadCabinetHDRI = async owner => {
    if(!window.CabinetAssets)return;
    const T=owner.THREE;
    try {
      const loader=new window.CabinetAssets.EXRLoader().setDataType(T.HalfFloatType);
      let texture;
      const embedded=window.CabinetLocalAssets?.studioHdriBase64;
      if(embedded) {
        const binary=atob(embedded),bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        const parsed=loader.parse(bytes.buffer);
        texture=new T.DataTexture(parsed.data,parsed.width,parsed.height,parsed.format,parsed.type);
        texture.encoding=parsed.encoding;
        texture.minFilter=texture.magFilter=T.LinearFilter;
        texture.generateMipmaps=false;
        texture.flipY=false;
        texture.needsUpdate=true;
      } else {
        texture=await loader.loadAsync('./assets/environment/studio_small_09_2k.exr');
      }
      if(owner.disposed){texture.dispose();return;}
      texture.mapping=T.EquirectangularReflectionMapping;
      const generator=new T.PMREMGenerator(owner.renderer);
      // Pachislot-like title reflection: repeat and mirror the studio panorama
      // horizontally so several hard highlights travel across every glyph.
      const {width,height,data:sourceData}=texture.image;
      const patternData=new sourceData.constructor(sourceData.length);
      const repeats=3;
      // Rotate the title-only environment away from the camera-facing studio
      // softbox. This leaves a hard highlight on one side and a dark reflected
      // field on the other instead of lighting every letter uniformly.
      const titleAzimuth=.29;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const scaled=(x+Math.floor(width*titleAzimuth))*repeats;
        const tile=Math.floor(scaled/width);
        const local=scaled%width;
        const sourceX=tile%2===0?local:width-1-local;
        const source=(y*width+sourceX)*4,target=(y*width+x)*4;
        patternData[target]=sourceData[source];
        patternData[target+1]=sourceData[source+1];
        patternData[target+2]=sourceData[source+2];
        patternData[target+3]=sourceData[source+3];
      }
      const titlePattern=new T.DataTexture(patternData,width,height,T.RGBAFormat,T.HalfFloatType);
      titlePattern.mapping=T.EquirectangularReflectionMapping;
      titlePattern.encoding=texture.encoding;
      titlePattern.needsUpdate=true;
      const filtered=generator.fromEquirectangular(titlePattern);
      titlePattern.dispose();generator.dispose();
      // Phong scenery renders into an LDR target: compress only its reflection source.
      // The physical title retains the full HDR PMREM above.
      const data=new Float32Array(texture.image.data.length);
      // Stage metal faces forward; move the studio key 65° off-axis so the
      // panorama reads as a long side reflection instead of a circular hotspot.
      const sceneryAzimuth=.18;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const sourceX=(x+Math.floor(width*sceneryAzimuth))%width;
        const source=(y*width+sourceX)*4,target=(y*width+x)*4;
        const rgb=[0,1,2].map(c=>Math.max(0,T.DataUtils.fromHalfFloat(texture.image.data[source+c])));
        const peak=Math.max(...rgb)*.65,scale=.65/(1+peak);
        for(let c=0;c<3;c++)data[target+c]=rgb[c]*scale;
        data[target+3]=1;
      }
      const scenery=new T.DataTexture(data,texture.image.width,texture.image.height,T.RGBAFormat,T.FloatType);
      scenery.mapping=T.EquirectangularReflectionMapping;scenery.needsUpdate=true;
      const cube=new T.WebGLCubeRenderTarget(256,{type:T.HalfFloatType});
      cube.fromEquirectangularTexture(owner.renderer,scenery);scenery.dispose();texture.dispose();
      owner.resources.push(filtered,cube);
      owner.hdri={physical:filtered.texture,phong:cube.texture};
      owner.cabinetWorld.root.traverse(object=>{
        if(!object.isMesh)return;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials)if(material.isMeshPhongMaterial){
          material.envMap=cube.texture;material.combine=T.MixOperation;
          material.reflectivity=material.transparent?.25:.18;material.needsUpdate=true;
        }
      });
      owner.cabinetWorld.surfaces.env=cube.texture;
      if(owner.title3D)owner.title3D.scene.environment=filtered.texture;
      owner.host.dataset.hdri='studio_small_09_2k';
    } catch(error) {
      console.warn('HDRIを読み込めないため既存の反射を維持します',error);
    }
  };
})();
