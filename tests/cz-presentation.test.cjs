'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const THREE=require('../assets/vendor/three-r149.min.js');
const context={window:{},performance:{now:()=>1000},document:{createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})}};
vm.createContext(context);
for(const file of ['cabinet-combat.js','cabinet-world.js','cabinet-surfaces.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../app',file),'utf8'),context);
function fixture(){
  const world={owner:{THREE,track:x=>x,trackMaterial:x=>x,textures:[]},root:new THREE.Group(),enemy:new THREE.Group(),env:null,waiting:false,outcome:null,rim:{color:new THREE.Color(),intensity:1},setCzProbe(){}};
  return {world,combat:new context.window.CabinetCombat(world)};
}
test('impact transforms stay finite and use a fixed instance budget',()=>{
  for(const favour of [-1,1]){
    const {combat}=fixture();combat.cue(2,favour);
    for(const age of [0,100,180,400,649]){
      combat.update(true,1000+age);
      assert.equal(combat.streaks.visible,true);
      assert.equal(combat.streaks.count,16);
      assert.ok([...combat.streaks.instanceMatrix.array].every(Number.isFinite));
      assert.ok(combat.streakMaterial.opacity>=0&&combat.streakMaterial.opacity<=1);
    }
    combat.update(true,1650);assert.equal(combat.streaks.visible,false);
  }
});
test('no impact leaks into PUSH wait, results, other scenes or non-contact beats',()=>{
  const {world,combat}=fixture();
  for(const beat of [0,1]){combat.cue(beat,1);combat.update(true,1100);assert.equal(combat.streaks.visible,false);}
  combat.cue(3,1);world.waiting=true;combat.update(true,1100);assert.equal(combat.streaks.visible,false);
  world.waiting=false;world.outcome=true;combat.update(true,1100);assert.equal(combat.streaks.visible,false);
  combat.update(false,1100);assert.equal(combat.root.visible,false);
});
test('baba presentation receives bounded public hit counts, independently of game state',()=>{
  const view={};
  for(const [value,expected] of [[1,1],[2,2],[3,3],[5,3],[-1,0]]){
    context.window.CabinetWorld.prototype.babaHit.call(view,value);
    assert.equal(view.babaCueHits,expected);assert.equal(view.babaCueAt,1000);
  }
});
test('brushed finish initializes Phong extensions and preserves the base lighting chunks',()=>{
  const surfaces=new context.window.CabinetSurfaces({THREE,hdri:{phong:new THREE.CubeTexture()}});
  const material=new THREE.MeshPhongMaterial();
  surfaces.finish(material);
  assert.equal(material.extensions.derivatives,true);
  const shader={fragmentShader:THREE.ShaderLib.phong.fragmentShader};
  material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('fwidth(brushPhase)'));
  assert.ok(shader.fragmentShader.includes('#include <lights_phong_fragment>'));
  assert.ok(shader.fragmentShader.includes('#include <envmap_fragment>'));
  const hook=material.onBeforeCompile;surfaces.finish(material);
  assert.equal(material.onBeforeCompile,hook);
});
