'use strict';
// PRIVATE_SPEC: geometry / presentation only; no lottery or game state.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const THREE=require('../assets/vendor/three-r149.min.js');
const nodes={};
const context={window:{THREE},document:{querySelector:key=>nodes[key]},console,performance};
context.window.matchMedia=()=>({matches:false});
vm.createContext(context);
for(const file of ['assets/vendor/cabinet-assets.js','assets/fonts/line-seed-jp-extrabold.typeface.js','app/cabinet-title.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
// Loading image data is browser QA; use real Three geometry and materials here.
THREE.TextureLoader.prototype.load=function(){};
function fixture(){
  const title={textContent:'BIG BONUS'};
  const classes=new Set(['is-active']);
  const payout={textContent:'＋15枚',dataset:{token:'1'},classList:{contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}};
  nodes['#lcdTitle']=title;nodes['#lcdBellAward']=payout;
  const owner={THREE,renderer:{capabilities:{getMaxAnisotropy:()=>1}}};
  return {view:new context.window.CabinetTitle(owner),payout};
}
test('payout glyphs keep individual placement and stay in front of the camera',()=>{
  const {view}=fixture(),host={width:1706,height:356};
  for(const t of [0,50,100,300,499,550,600]){
    view.renderPayout(t,host,1706,356,564,false);
    assert.equal(view.payoutLetters.length,4);
    assert.ok(new Set(view.payoutLetters.map(l=>l.pivot.position.x)).size>1);
    assert.ok(view.payoutGroup.position.z<564);
    assert.ok([...view.payoutGroup.position,...view.payoutGroup.quaternion].every(Number.isFinite));
  }
  assert.ok(Math.abs(view.payoutGroup.position.x-(-.04*1706))<1e-6);
});
test('reduced motion payout remains visible at the reading position',()=>{
  const {view}=fixture();view.renderPayout(100,{width:1706,height:356},1706,356,564,true);
  assert.ok(view.payoutGroup.position.x>1706*.3&&view.payoutGroup.position.x<1706*.7);
  assert.equal(view.payoutGroup.rotation.x,0);
});
test('active title geometry survives bounded cache eviction',()=>{
  const {view}=fixture();const active=view.make('BIG BONUS');let disposed=0;
  active.geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
  for(let i=0;i<12;i++)view.make(`＋${i}枚`);
  assert.equal(disposed,0);assert.equal(view.cache.size,8);
});
test('HDR rotation is injected into the expanded physical shader chunk',()=>{
  const {view}=fixture();
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  view.materials[2].onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('reflectVec.xz = mat2('));
  assert.equal(shader.uniforms.uTitleEnvRotation,view.envRotationUniform);
});
