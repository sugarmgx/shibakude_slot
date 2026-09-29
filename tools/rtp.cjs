// PRIVATE_SPEC: Node-only adapter. Economic functions are loaded from app.js unchanged.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/app.js'), 'utf8');
function region(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw Error(`app.js adapter boundary changed: ${start}`);
  return source.slice(a, b);
}
const program = 'const BT = window.ShibakuBT; const {ReelControlError} = window.ShibakuReelControl;\n' + region('const SYMBOLS =', 'const dom =')
  + '\nconst dom = { settingSelect: {value: String(setting)} };\n'
  + region('const ui =', 'const reelResizeObserver =')
  + `
// Suppress presentation only. Settlement, counters, RNG and transitions remain live.
logEvent = function() {};
recordDeltaGraphPoint = function() {};
render = renderInteractivity = playTransitionSounds = function() {};
playSoundEffect = function() { return null; };
sleep = async function() {};
if (profileOverrides) Object.assign(SETTING_PROFILES[setting], profileOverrides);
let state = createInitialState();
state.auto = true;
const totals = {input:0, payout:0, initialHits:0, initialGames:0, modes:{}, roles:{}, bellLines:[0,0,0,0,0],
  boost:{normal:{starts:0,games:0,input:0,payout:0,net:0},upper:{starts:0,games:0,input:0,payout:0,net:0}}};
async function step(force = null, bases = null, btFixture = null) {
  const before = snapshotState(state);
  executeGameStep(force);
  if (btFixture && state.bt) {
    state.bt.pendingResult = btFixture;
    configureBTReels();
  }
  let after = snapshotState(state);
  state = before;
  const settlement = after.pendingPayout;
  if (!settlement && before.mode === 'ending') { state = after; return; }
  const presentation = after.presentationRoleKey || after.internalRoleKey || 'miss';
  const pending = {afterState:after, nextStop:0,
    stopOrder:after.pushNaviOrder ? [...after.pushNaviOrder] : [0,1,2],
    internalRoleKey:after.internalRoleKey || presentation,
    presentationRoleKey:presentation, displayRoleKey:presentation,
    czBonusEntry:before.mode === 'cz' && after.mode === 'bonus'};
  after.displayRoleKey = presentation;
  ui.pendingSpin = pending;
  ui.spinningReels = [true,true,true];
  ui.reelPositions = [...before.reelStops];
  const tama = after.tama;
  const acquire = moment => {
    if (before.mode === 'tama' && tama?.willAcquire
        && tama.triggerStep === tama.currentOpportunityBase + moment) {
      tama.acquired = true;
      return true;
    }
    return false;
  };
  if (!acquire(0)) for (const reel of pending.stopOrder) {
    ui.reelPositions[reel] = bases ? bases[reel] : Math.floor(pressRandom()*REEL_STRIPS[reel].length);
    selectControlledCandidate(reel);
    if (acquire(pending.nextStop + 1)) break;
    ui.spinningReels[reel] = false;
    pending.nextStop++;
  }
  assertDisplayedResultConsistency(after);
  const stops = after.reelStops.join(',');
  after = settleDisplayedPayout(after, pending);
  if (settlement) {
    totals.input += 3;
    totals.payout += after.settledPayout;
    totals.modes[before.mode] = (totals.modes[before.mode] || 0) + 1;
    const key = settlement.internalRoleKey + '->' + after.displayRoleKey;
    totals.roles[key] = (totals.roles[key] || 0) + 1;
    if (before.mode === 'cz' && after.displayRoleKey === 'bell') totals.bellLines[after.displayHit.paylineIndex]++;
    if ((settlement.originMode === 'at' || settlement.originMode === 'tama') && before.at) {
      const boost = totals.boost[before.at.ura ? 'upper' : 'normal'];
      boost.games++;
      boost.input += 3;
      boost.payout += after.settledPayout;
      boost.net += after.settledPayout - 3;
    }
  }
  after = finalizeSpecialPendingState(before, pending, after);
  assertDisplayedResultConsistency(after);
  if (after.reelStops.join(',') !== stops) throw Error('Settlement changed stopped reels');
  updateResultCountingWindow(before, after);
  resetCurrentGamesAfterPayoutMode(before, after);
  state = after;
  ui.pendingSpin = null;
  if (state.mode === 'tama' && (state.tama.acquired || state.tama.pendingResolution)) {
    const old = snapshotState(state);
    finishTamaChallenge();
    resetCurrentGamesAfterPayoutMode(old,state);
  }
  if (state.cz?.pushPending) await revealBattlePush();
  if (settlement && ['normal','cz'].includes(before.mode)) {
    totals.initialGames++;
    if (['bonus','bonusReady'].includes(state.mode)) totals.initialHits++;
  }
  const beforeInBoost = (before.mode === 'at' || before.mode === 'tama') && before.at;
  const afterInBoost = (state.mode === 'at' || state.mode === 'tama') && state.at;
  if (!beforeInBoost && afterInBoost) totals.boost[state.at.ura ? 'upper' : 'normal'].starts++;
  if (Math.abs(state.totalDelta - (totals.payout-totals.input)) > 1e-9) throw Error('Ledger mismatch');
  if (state.totalGames*3 !== totals.input) throw Error('Paid game counter mismatch');
}
globalThis.adapter = {
  step, state:()=>snapshotState(state), totals,
  // Explicit test fixture setup; never used by the measurement CLI.
  fixture:fn=>fn(state, ui, {enterBonus, enterBT, enterCZ, enterBonusReady}),
  async run(games) {
    let actions=0;
    while (state.totalGames < games) {
      if (++actions > games*10+1000) throw Error('No paid-game progress');
      await step();
    }
    return {setting, games:state.totalGames, ...totals,
      rate:100*totals.payout/totals.input, delta:state.totalDelta,
      finalMode:state.mode, stats:state.stats};
  }
};`;
function rng(seed) {
  let x = seed >>> 0;
  return () => { let t = x = (x + 0x6d2b79f5) >>> 0; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
}
function createAdapter(setting, seed=489, profileOverrides=null) {
  if (!Number.isInteger(setting) || setting<1 || setting>6) throw Error('Invalid setting');
  const math = Object.create(Math); math.random=rng(seed);
  const context = vm.createContext({setting, profileOverrides, Math:math, pressRandom:rng(seed^0xabcdef01), URLSearchParams,
    window:{ShibakuBT:require('../app/bt-rules.js'),ShibakuReelControl:require('../app/reel-control.js'),location:{search:''}},
    document:{documentElement:{dataset:{}}}});
  vm.runInContext(program, context, {filename:'app.js:rtp-adapter'});
  return context.adapter;
}
module.exports = {createAdapter};
if (require.main === module) (async () => {
  const args=process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node tools/rtp.cjs [--games 100000] [--batches 4] [--seed 489] [--setting 1..6]\nUniform press positions; not browser AUTO timing. JSON stdout, progress stderr.');
    return;
  }
  const option=(key, fallback)=>args.includes(key)?Number(args[args.indexOf(key)+1]):fallback;
  const games=option('--games',100000), batches=option('--batches',4), seed=option('--seed',489);
  const selected=option('--setting',0);
  const profileOverrides=process.env.SLOT_RTP_PROFILE_OVERRIDES
    ? JSON.parse(process.env.SLOT_RTP_PROFILE_OVERRIDES) : null;
  if (![games,batches,seed,selected].every(Number.isSafeInteger) || batches<2 || games<batches || selected<0 || selected>6) throw Error('Invalid arguments');
  const results=[];
  for (const setting of selected?[selected]:[1,2,3,4,5,6]) {
    const parts=[];
    for(let b=0;b<batches;b++) {
      const count=Math.floor(games/batches)+(b<games%batches?1:0);
      parts.push(await createAdapter(setting,seed+setting*1000003+b*7919,profileOverrides?.[setting] || null).run(count));
      process.stderr.write('setting '+setting+' batch '+(b+1)+'/'+batches+' complete\n');
    }
    const input=parts.reduce((s,p)=>s+p.input,0),payout=parts.reduce((s,p)=>s+p.payout,0);
    const rates=parts.map(p=>p.rate),mean=rates.reduce((a,b)=>a+b,0)/batches;
    const se=Math.sqrt(rates.reduce((s,r)=>s+(r-mean)**2,0)/(batches-1)/batches);
    const boost = Object.fromEntries(['normal','upper'].map(type => {
      const sum = key => parts.reduce((total, part) => total + part.boost[type][key], 0);
      const net = sum('net');
      return [type, {starts:sum('starts'),games:sum('games'),input:sum('input'),payout:sum('payout'),net,
        rtpPoint:100*net/input,averageNetPerStart:sum('starts') ? net/sum('starts') : null}];
    }));
    results.push({setting,games,input,payout,rate:100*payout/input,batchStandardError:se,boost,parts});
  }
  console.log(JSON.stringify({method:'app.js functions + reel-control.js; uniform independent press positions; immediate PUSH',
    limitations:['Not browser AUTO frame timing','Presentation RNG calls omitted','Finite run; final bonus/BT not completed'],
    sourceHashes:Object.fromEntries(['app.js','reel-control.js','bt-rules.js'].map(f=>[f,crypto.createHash('sha256').update(f==='app.js'?source:fs.readFileSync(path.join(root,'app',f))).digest('hex')])),
    seed,batches,results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
