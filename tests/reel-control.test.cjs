const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createReelControl, ReelControlError } = require('../app/reel-control.js');
const source = fs.readFileSync(path.join(__dirname, '../app/app.js'), 'utf8');
const keys = 'SYMBOLS PAYLINES REEL_STRIPS ROLE_DEFS WIN_ROLE_KEYS NORMAL_RANDOM_ROLE_KEYS MAX_REEL_SLIP LEFT_REEL_BOTTOM_ROW CHERRY_TRIGGER_ROWS BABA_SANDWICH_SYMBOLS EXTENDED_STOP_ROLE_KEYS REEL_STOP_ORDERS'.split(' ');
const config = vm.runInNewContext(source.slice(source.indexOf('const SYMBOLS ='), source.indexOf('const MAPS =')) + `\n({${keys.join(',')}})`);
const control = createReelControl(config);
let auditedCatalog;

function functionSource(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function \w+\(/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test('21-symbol / 5-line catalog and exhaustive six-order invariants', () => {
  assert.deepEqual(Array.from(config.REEL_STRIPS, s => s.length), [21, 21, 21]);
  assert.equal(config.PAYLINES.length, 5);
  auditedCatalog = control.buildReelLayoutCatalog({ extendedAuditEnabled: true });
  const { audit } = auditedCatalog;
  for (const [name, passed] of Object.entries(audit.invariants)) assert.equal(passed, true, name);
  for (const [role, result] of Object.entries(audit.normalControlAudit)) {
    for (const [order, counts] of Object.entries(result.byStopOrder)) {
      assert.equal(counts.noLegalStops, 0, `C1 ${role} ${order}`);
      assert.equal(counts.falseVisibleWins, 0, `C1 ${role} ${order}`);
      assert.equal(counts.overFour, 0, `C1 ${role} ${order}`);
    }
  }
});







test('D1: unsafe decision is data, invalid config is a typed strict error', () => {
  const tables = { candidateIndex: { miss: [new Map(), new Map(), new Map()] } };
  const input = { controlTables: tables, policyRoleKey: 'miss', displayRoleKey: 'miss', reelIndex: 0, fixedStops: new Map(), remainingOrder: [], reachableStops: new Map([[0, 0]]) };
  assert.equal(control.decideRoleAwareStop(input).noSafeStop, true);
  assert.equal(input.fixedStops.size, 0);
  const broken = createReelControl({ ...config, NORMAL_RANDOM_ROLE_KEYS: ['barLine'] });
  assert.throws(() => broken.buildReelLayoutCatalog(), ReelControlError);
});

test('D1: production rollback releases waiters; audit=1 records and throws', () => {
  for (const strict of [false, true]) {
    let released = 0, events = 0;
    const context = { URLSearchParams, Date, clearTimeout, console: { error() {} },
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      window: { location: { search: strict ? '?audit=1' : '' }, dispatchEvent() { events++; }, ShibakuEffects: { reset() {} } },
      document: { querySelector: () => null },
      ui: { pendingSpin: { finishResolver: () => released++ }, operationGeneration: 0, autoGeneration: 0 },
      stopSpinLoop() {}, stopAllSoundEffects() {}, render() {}, syncBonusMusic() {} };
    vm.createContext(context);
    // report is before the startup try block; keep that boundary out of the unit fixture.
    vm.runInContext(source.slice(0, source.indexOf('\ntry {')) + '\n' + functionSource('recoverReelSpin'), context);
    const before = { auto: true, reelStops: [0, 1, 2], totalDelta: 123, currentGames: 9 };
    const invoke = () => context.recoverReelSpin(new ReelControlError('injected'), before, 'test');
    if (strict) assert.throws(invoke, ReelControlError); else invoke();
    assert.equal(context.state.totalDelta, 123);
    assert.equal(context.state.currentGames, 9);
    assert.equal(context.state.auto, false);
    assert.equal(context.ui.pendingSpin, null);
    assert.equal(context.ui.spinning, false);
    assert.equal(released, 1);
    assert.equal(events, 1);
    assert.equal(context.window.__SHIBAKU_REEL_FAULTS__.length, 1);
  }
});

test('D1: invalid startup disables controls in production and remains fatal in audit', () => {
  for (const strict of [false, true]) {
    const buttons = [{ disabled: false }, { disabled: false }];
    const context = { URLSearchParams, CustomEvent: class {}, console: { error() {} },
      document: { querySelectorAll: () => buttons },
      window: { location: { search: strict ? '?audit=1' : '' }, dispatchEvent() {},
        ShibakuReelControl: { ReelControlError, createReelControl() { throw new ReelControlError('bad table'); } } } };
    const run = () => vm.runInNewContext(source, context);
    if (strict) assert.throws(run, ReelControlError); else run();
    assert.ok(buttons.every(b => b.disabled));
    assert.equal(context.window.__SHIBAKU_REEL_FAULTS__[0].phase, 'startup-disabled');
  }
});





test('C7: aggregate weak/strong tests are normal-only; individual bonus role test is preserved', () => {
  const calls = [];
  const ctx = { FORCED_ROLE_BY_ACTION: { roleBell: 'bell' }, clearBanner() {}, showBanner() {},
    spinNormal: f => calls.push('normal:' + f), spinBonus: f => calls.push('bonus:' + f) };
  vm.createContext(ctx); vm.runInContext(functionSource('handleForce'), ctx);
  for (const mode of ['normal', 'bonus', 'cz', 'at', 'tama', 'revival', 'bonusReady', 'ending']) {
    for (const force of ['weakRare', 'strongRare']) {
      ctx.state = { mode }; calls.length = 0; ctx.handleForce(force);
      assert.deepEqual(calls, mode === 'normal' ? ['normal:' + force] : []);
    }
  }
  ctx.state = { mode: 'bonus' }; ctx.handleForce('roleBell');
  assert.deepEqual(calls, ['bonus:roleBell']);
});

test('D1: index boundaries, deterministic stop decisions and unchanged inputs', () => {
  for (const reel of [0, 1, 2]) for (const index of [-43, -21, -1, 0, 20, 21, 42]) {
    const row = control.visibleWindowFromStop(reel, index);
    assert.equal(row.length, 3);
    assert.ok(row.every(s => config.SYMBOLS.includes(s)));
    assert.deepEqual(row, control.visibleWindowFromStop(reel, control.wrapIndex(index, 21)));
  }
  const input = { controlTables: auditedCatalog.normalControlTables, policyRoleKey: 'bell', displayRoleKey: 'bell',
    reelIndex: 0, fixedStops: new Map(), remainingOrder: [1, 2], reachableStops: new Map([[0, 0], [20, 1], [19, 2], [18, 3], [17, 4]]) };
  const first = control.decideRoleAwareStop(input), second = control.decideRoleAwareStop(input);
  assert.equal(first.noSafeStop, false); assert.deepEqual(first, second);
  assert.equal(input.fixedStops.size, 0); assert.deepEqual(input.remainingOrder, [1, 2]);
  assert.equal(input.reachableStops.size, 5);
});

test('D1: actual displayed-role settlement matches payout and is idempotent', () => {
  const ctx = { ...control, ROLE_DEFS: config.ROLE_DEFS, state: {}, Date,
    snapshotState: s => structuredClone(s), recordDeltaGraphPoint() {},
    finalizeBonusPayoutThreshold() {}, finalizeAtPayoutAndRound() {}, document: { documentElement: { dataset: {} } } };
  vm.createContext(ctx);
  vm.runInContext(['cloneDisplayHit', 'addCoins', 'enhancedModePayout', 'settleDisplayedPayout'].map(functionSource).join('\n'), ctx);
  for (const mode of ['normal', 'bonus', 'at', 'tama']) for (const key of ['miss', 'replay', 'bell', 'watermelon', 'cherry', 'strongCherry', 'middleCherry', 'chance']) {
    const layout = control.layoutFromCatalogEntry(key, auditedCatalog.catalog[key][0]);
    const expected = ctx.enhancedModePayout(key, mode === 'normal' ? 3 : 30);
    const after = { mode, reels: layout.reels, displayRoleKey: key, displayHit: layout.lastHit,
      totalDelta: -3, sectionDelta: -3, lowestTotalDelta: -3,
      bonus: mode === 'bonus' ? { type: 'RED_BIG', coins: 0 } : null,
      at: ['at', 'tama'].includes(mode) ? { coins: 0 } : null,
      pendingPayout: { internalRoleKey: key, intendedPayout: expected, originMode: mode, originBonusType: 'RED_BIG' } };
    const settled = ctx.settleDisplayedPayout(after, {});
    assert.equal(settled.settledPayout, expected, mode + ':' + key);
    assert.equal(settled.totalDelta, expected - 3);
    if (settled.bonus) assert.equal(settled.bonus.coins, expected - 3);
    if (settled.at) assert.equal(settled.at.coins, expected - 3);
    assert.equal(ctx.settleDisplayedPayout(settled, {}).totalDelta, expected - 3);
  }
  const missed = { mode: 'normal', totalDelta: -3, sectionDelta: -3, lowestTotalDelta: -3, displayRoleKey: 'miss',
    pendingPayout: { internalRoleKey: 'chance', intendedPayout: 0, originMode: 'normal' } };
  assert.equal(ctx.settleDisplayedPayout(missed, {}).settledPayout, 0);
});

test('UI/LCD: BONUS, AT and Tama copy consumes the settled state counters', () => {
  const effects = fs.readFileSync(path.join(__dirname, '../app/visual-effects.js'), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(effects.slice(effects.indexOf('  function visualMode('), effects.indexOf('    function updateLcdDom(')), ctx);
  assert.equal(ctx.visualMode({ mode: 'bonus', bonus: { type: 'BLUE_BIG' } }), 'bonusBlue');
  assert.match(ctx.lcdCopy({ mode: 'bonus', bonus: { coins: 37, maxCoins: 300, type: 'BLUE_BIG' } }).subtitle, /^37 \/ 300枚/);
  assert.match(ctx.lcdCopy({ mode: 'at', at: { rounds: 2, currentRoundGame: 9 } }).subtitle, /ROUND 2　残り 1G/);
  assert.match(ctx.lcdCopy({ mode: 'tama', at: {}, tama: { games: 3, gamesLeft: 1 } }).subtitle, /^残り 1G/);
  assert.match(ctx.lcdCopy({ mode: 'normal', currentGames: 12, totalGames: 999 }).subtitle, /^CURRENT 12G/);
});
