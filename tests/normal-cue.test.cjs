'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {NormalCue,selectionRate}=require('../app/normal-cue.js');
test('presentation selection does not alter roles and excludes special events',()=>{
  const cue=new NormalCue();
  for(const role of ['middleCherry','reg','big','blueBig','chance','watermelonChance','babaSandwich'])assert.equal(cue.begin(role,0,0),false);
  assert.equal(cue.begin('replay',.099,0),true);
  assert.equal(cue.begin('replay',.1,0),false);
  assert.equal(cue.begin('miss',.05,0),false);
  assert.equal(cue.begin('replay',NaN,0),false);
});
test('first completed stop reveals blue; later stops resolve and expire',()=>{
  const cue=new NormalCue();cue.begin('replay',0,0);
  assert.equal(cue.sample(50).color,0x9cabb5);
  cue.stop(1,200,'replay');assert.equal(cue.sample(200).color,0x218dff);
  cue.stop(1,300,'replay');assert.equal(cue.at,200);
  cue.stop(3,400,'replay');assert.equal(cue.phase,1);
  cue.stop(2,500,'replay');cue.stop(3,700,'replay');
  assert.ok(cue.sample(1000).amount>0);assert.equal(cue.sample(1500).amount,0);
  assert.equal(cue.active,false);
});
test('missed display, cancellation and the next lever clear the old cue',()=>{
  const cue=new NormalCue();cue.begin('cherry',0,0);
  cue.stop(1,10,'cherry');cue.stop(2,20,'cherry');cue.stop(3,30,'miss');
  assert.equal(cue.sample(30).color,0x9cabb5);
  cue.begin('replay',.9,40);assert.equal(cue.sample(40).amount,0);
  cue.begin('bell',0,50);cue.cancel();assert.equal(cue.sample(50).amount,0);
});
test('small-role share of cues is approximately 40% under current normal weights',()=>{
  for(const factor of [.99,1,1.01,1.02]){
    const wins=160+60+2*Math.round(15*factor)+Math.round(6*factor);
    const miss=Math.max(620,780-Math.round((factor-1)*180));
    const ratio=wins*selectionRate('replay')/(wins*selectionRate('replay')+miss*selectionRate('miss'));
    assert.ok(ratio>.39&&ratio<.41,ratio);
  }
});
test('game hooks occur after lottery and completed slip, with a separate visual RNG',()=>{
  const app=fs.readFileSync(require.resolve('../app/app.js'),'utf8');
  const start=app.slice(app.indexOf('function beginPendingSpin('),app.indexOf('async function animateReelSlip('));
  assert.ok(start.indexOf('normalCueBegin')>start.indexOf('ui.pendingSpin ='));
  const stop=app.slice(app.indexOf('async function stopReelChecked('),app.indexOf('function finalizeSpecialPendingState('));
  assert.ok(stop.indexOf('normalCueStop')>stop.indexOf('if (!completedSlip'));
  const visual=fs.readFileSync(require.resolve('../app/visual-effects.js'),'utf8');
  const rng=visual.slice(visual.indexOf('function cueRandom()'),visual.indexOf('const api ='));
  assert.ok(rng.includes('getRandomValues'));assert.ok(!rng.includes('Math.random'));
});
