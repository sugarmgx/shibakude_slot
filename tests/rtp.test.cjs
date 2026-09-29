const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createAdapter} = require('../tools/rtp.cjs');
const BT = require('../app/bt-rules.js');

test('A table sums, next-bonus 60%, blue BIG advantage and stationary entry', () => {
  for(const table of Object.values(BT.tables)) {
    assert.ok(Math.abs(Object.values(table).reduce((a,b)=>a+b,0)-1)<1e-12);
    const q=table.miss, bonus=table.RED_BIG+table.BLUE_BIG+table.REG;
    const prob=bonus*(1+q+q*q)/(1-table.retry*(1+q+q*q));
    assert.ok(Math.abs(prob-.6)<1e-12);
    assert.equal(BT.draw(table,()=>0),'RED_BIG');
    assert.equal(BT.draw(table,()=>.999999),'miss');
  }
  assert.ok(BT.tables.blue.RED_BIG+BT.tables.blue.BLUE_BIG>BT.tables.standard.RED_BIG+BT.tables.standard.BLUE_BIG);
  for(let setting=1;setting<=6;setting++) {
    const rate=Object.entries(BT.normalWeights).reduce((sum,[role,w])=>sum+w/1043*BT.entryRate(setting,role),0);
    assert.ok(Math.abs(rate*(1-1/16384)*(1-1/2000)-1/BT.czDenominators[setting])<1e-12);
  }
});
test('normal guaranteed rare payouts remain intact', async () => {
  for(const [force,pay] of [['roleCherry',2],['roleWatermelon',5],['roleStrongCherry',0]]) {
    const a=createAdapter(1,1); await a.step(force,[20,0,10]);assert.equal(a.totals.payout,pay);
  }
});

test('918G ceiling enters existing CZ, guarantees only red/blue BIG and preserves the triggering payout', async () => {
  for (const seed of [1,7,17,38,71,99]) {
    const a=createAdapter(1,seed);
    a.fixture(s=>{s.currentGames=916;});
    await a.step('roleMiss',[0,0,0]);
    assert.equal(a.state().cz?.ceilingBonusType,undefined);
    a.fixture(s=>{s.mode='normal';s.cz=null;s.bonusReady=null;s.currentGames=917;});
    await a.step('roleWatermelon',[0,0,0]);
    assert.equal(a.state().currentGames,918);
    assert.equal(a.state().mode,'cz');
    assert.equal(a.state().settledPayout,5);
    assert.ok(['RED_BIG','BLUE_BIG'].includes(a.state().cz.ceilingBonusType));
    const promised=a.state().cz.ceilingBonusType;
    for(let i=0;a.state().mode==='cz'&&i<30;i++) await a.step('roleMiss',[0,0,0]);
    assert.equal(a.state().mode,'bonusReady');
    assert.equal(a.state().bonusReady.type,promised);
  }
});

test('ceiling crossed inside all CZs rescues final-game failure, including held REG and partial sandwiches', async () => {
  for (const key of ['unko','baba','shibaku']) for (const hits of [0,1,2]) {
    const a=createAdapter(1,40+hits);
    a.fixture((s,u,api)=>{
      api.enterCZ(key);s.currentGames=917;s.cz.gamesLeft=1;s.cz.successGame=null;
      s.cz.babaSandwichSchedule=[];s.cz.babaSandwichHits=hits;
      if(key==='shibaku')s.cz.heldAward={kind:'bonus',type:'REG'};
    });
    for(let i=0; a.state().mode==='cz'&&i<25;i++)await a.step('roleMiss',[0,0,0]);
    assert.equal(a.state().mode,'bonusReady');
    assert.ok(['RED_BIG','BLUE_BIG'].includes(a.state().bonusReady.type));
  }
});

test('50G stages switch without repetition, without consuming the lottery stream', async () => {
  for (const seed of [1,456,785432]) {
    let last=BT.stageAt(0,seed);
    assert.equal(last,'橋本駅');
    for(let g=50;g<=900;g+=50){
      assert.equal(BT.stageAt(g-1,seed),last);
      const next=BT.stageAt(g,seed);assert.notEqual(next,last);
      assert.ok(BT.normalStages.includes(next));last=next;
    }
  }
  const a=createAdapter(1,55),b=createAdapter(1,55);
  a.fixture(s=>{s.currentGames=49;});
  b.fixture(s=>{s.currentGames=48;});
  await a.step('roleMiss',[0,0,0]);await b.step('roleMiss',[0,0,0]);
  assert.equal(a.state().mode,b.state().mode);
  assert.deepEqual(a.state().cz,b.state().cz);
  assert.deepEqual(a.state().bonusReady,b.state().bonusReady);
  assert.notEqual(a.state().stage,'橋本駅');assert.equal(b.state().stage,'橋本駅');
  a.fixture((s,u,api)=>{api.enterBonus('REG');s.bonus.coins=80;});
  await a.step('roleBell',[0,0,0]);
  assert.equal(a.state().currentGames,0);assert.equal(a.state().stage,'橋本駅');
});
test('strict bonus thresholds and final bell settlement, all four types', async () => {
  for(const [type,limit] of Object.entries(BT.limits)) {
    const a=createAdapter(1,2);
    a.fixture((s,u,api)=>{api.enterBonus(type);s.bonus.coins=limit-6;});
    await a.step('roleBell',[0,0,0]);
    assert.equal(a.state().bonus.coins,limit);assert.equal(a.state().mode,'bonus');
    await a.step('roleBell',[20,20,20]);
    assert.equal(a.state().mode,type==='REG'?'normal':'bt');
    if(type!=='REG') assert.equal(a.state().bt.blue,type==='BLUE_BIG');
    assert.equal(a.totals.payout,18);assert.equal(a.totals.input,6);
  }
});
test('three REGs promote on reservation, count once, use REG reel alignment; BIG resets', async () => {
  const a=createAdapter(1,71);
  for(let n=1;n<=3;n++) {
    a.fixture((s,u,api)=>api.enterBonusReady('REG','test'));
    const reserved=a.state().bonusReady.type;
    assert.equal(reserved,n===3?'GOLD_REG':'REG');
    for(let i=0;a.state().mode==='bonusReady'&&i<30;i++) await a.step();
    assert.equal(a.state().bonus.type,reserved);
    assert.equal(a.state().displayRoleKey,'reg');
    a.fixture(s=>{s.bonus.coins=s.bonus.maxCoins;});
    await a.step('roleBell',[0,0,0]);
  }
  assert.equal(a.state().mode,'bt');assert.equal(a.state().regStreak,0);
  assert.equal(a.state().stats.regHits,2);assert.equal(a.state().stats.bigHits,1);
  a.fixture((s,u,api)=>{s.regStreak=2;api.enterBonus('RED_BIG');});
  assert.equal(a.state().regStreak,0);
});
test('middle cherry guarantees exactly four BLUE BIGs, then improved BT', async () => {
  const a=createAdapter(1,9);
  await a.step('middleCherry',[0,0,0]);
  assert.equal(a.state().displayRoleKey,'middleCherry');
  assert.equal(a.state().guaranteedBlueRemaining,3);
  for(let n=1;n<=4;n++) {
    assert.equal(a.state().bonus.type,'BLUE_BIG');
    a.fixture(s=>{s.bonus.coins=280;});
    await a.step('roleBell',[0,0,0]);
    if(n<4) {
      assert.equal(a.state().mode,'bonusReady');
      for(let i=0;a.state().mode==='bonusReady'&&i<50;i++) await a.step();
      assert.equal(a.state().mode,'bonus');
    }
  }
  assert.equal(a.state().stats.bigHits,4);
  assert.equal(a.state().mode,'bt');assert.equal(a.state().bt.blue,true);
  assert.equal(a.state().guaranteedBlueRemaining,0);
});
test('BT miss/miss/retry resets lamps; third consecutive miss ends, counters and payout once', async () => {
  const a=createAdapter(1,14);
  a.fixture((s,u,api)=>api.enterBT());
  await a.step('btBlue',[0,0,0]);
  assert.equal(a.state().bt.blue,true);
  assert.equal(a.totals.input,0);
  const outcomes=['miss','miss','retry','miss','miss','miss'];
  for(let i=0;i<outcomes.length;i++) {
    const prior=a.state().currentGames;
    await a.step('roleWatermelon',[0,0,0],outcomes[i]);
    assert.equal(a.state().currentGames,prior+1);
    if(i<5) assert.equal(a.state().bt.misses,[1,2,0,1,2][i]);
  }
  assert.equal(a.state().mode,'normal');assert.equal(a.state().btView.result,'end');
  assert.equal(a.totals.payout,30);assert.equal(a.totals.input,18);
  for(const outcome of ['RED_BIG','BLUE_BIG','REG']) {
    a.fixture((s,u,api)=>api.enterBT());
    await a.step('roleWatermelon',[0,0,0],outcome);
    assert.equal(a.state().mode,'bonus');
    assert.equal(a.state().bonus.type,outcome);
    assert.equal(a.state().displayRoleKey,{RED_BIG:'big',BLUE_BIG:'blueBig',REG:'reg'}[outcome]);
    assert.equal(a.state().settledPayout,0);
  }
});
test('unko success does not replace the paid small role with a bonus alignment',async()=>{
  const a=createAdapter(1,7);
  a.fixture((s,u,api)=>{api.enterCZ('unko');s.cz.successGame=1;});
  await a.step('roleWatermelon',[0,0,0]);
  assert.equal(a.state().mode,'bonusReady');
  assert.equal(a.state().displayRoleKey,'watermelon');assert.equal(a.totals.payout,5);
});

test('BT seven teases remain misses in every line and all stop positions remain valid',async()=>{
  const a=createAdapter(1,81);
  let teases=0, doubles=0;
  for(let i=0;i<240;i++){
    a.fixture((s,u,api)=>api.enterBT());
    await a.step('roleMiss',[i%21,(i*7)%21,(i*11)%21],'miss');
    const s=a.state();
    assert.equal(s.mode,'bt');
    assert.equal(s.displayRoleKey,'miss');
    assert.equal(s.settledPayout,1);
    assert.ok(s.reelStops.every(v=>v>=0&&v<21));
    const rows=[[0,0,0],[1,1,1],[2,2,2],[0,1,2],[2,1,0]];
    for(const line of rows){
      const symbols=line.map((r,j)=>s.reels[j][r]);
      assert.ok(!symbols.every(v=>v==='赤7')&&!symbols.every(v=>v==='青7'));
      assert.notDeepEqual(symbols,['赤7','赤7','BAR']);
    }
    if(['赤7','青7'].includes(s.reels[0][1])){
      teases++;
      if(s.reels[0][1]===s.reels[1][1]) doubles++;
    }
  }
  assert.ok(teases>0);
  assert.ok(doubles>0);
});

test('BT third REG promotes directly to GOLD on the same paid spin',async()=>{
  const a=createAdapter(1,38);
  a.fixture((s,u,api)=>{s.regStreak=2;api.enterBT();});
  await a.step('roleMiss',[20,8,2],'REG');
  const s=a.state();
  assert.equal(s.mode,'bonus');assert.equal(s.bonus.type,'GOLD_REG');
  assert.equal(s.displayRoleKey,'reg');assert.equal(s.displayHit.paylineIndex,1);
  assert.equal(s.stats.bigHits,1);assert.equal(s.stats.regHits,0);
  assert.equal(a.totals.input,3);assert.equal(a.totals.payout,0);
});
test('Shibaku holds win until ten paid games and PUSH; bonus alignment remains free', async()=>{
  const a=createAdapter(1,4);
  a.fixture((s,u,api)=>{api.enterCZ('shibaku');s.cz.successGame=1;});
  for(let i=0;i<9;i++){await a.step('roleMiss',[0,0,0]);assert.equal(a.state().mode,'cz');}
  await a.step('roleMiss',[0,0,0]);assert.equal(a.state().mode,'bonusReady');assert.equal(a.totals.input,30);
  for(let i=0;a.state().mode==='bonusReady'&&i<50;i++) await a.step();
  assert.equal(a.state().mode,'bonus');assert.equal(a.totals.input,30);
});
test('Baba third sandwich remains stopped and failure cannot become success through rare roles',async()=>{
  const a=createAdapter(1,17);
  a.fixture((s,u,api)=>{api.enterCZ('baba');s.cz.babaSandwichSchedule=[1,1,1];});
  for(let i=0;i<3;i++) await a.step('roleMiss',[0,0,0]);
  assert.equal(a.state().mode,'bonusReady');
  assert.equal(a.state().displayRoleKey,'babaSandwich');
  for(const key of ['unko','baba','shibaku']) {
    a.fixture((s,u,api)=>{api.enterCZ(key);s.cz.successGame=null;s.cz.babaSandwichSchedule=[];});
    for(let i=0;a.state().mode==='cz'&&i<10;i++) await a.step('roleStrongCherry',[0,0,0]);
    assert.equal(a.state().mode,'normal');
  }
});
test('seeded actual stop/settlement runs reconcile, remain deterministic and never enter Boost',async()=>{
  const a=await createAdapter(6,12345).run(10000);
  const b=await createAdapter(6,12345).run(10000);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.equal(a.input,30000);assert.equal(a.payout-a.input,a.delta);
  assert.ok(a.modes.bt>0 && a.modes.cz>0 && a.modes.bonus>0);
  assert.equal(a.boost.normal.starts+a.boost.upper.starts,0);
  assert.ok(Object.keys(a.modes).every(m=>['normal','cz','bonus','bt'].includes(m)));
});
