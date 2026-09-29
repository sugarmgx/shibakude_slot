// PRIVATE_SPEC: bounded diagnostics, never player-facing copy or external traffic.
function reportReelFault(error, phase) {
  const detail = { phase, message: error.message, at: Date.now() };
  window.__SHIBAKU_REEL_FAULTS__ = [...(window.__SHIBAKU_REEL_FAULTS__ || []).slice(-49), detail];
  console.error("[reel-control]", detail);
  window.dispatchEvent(new CustomEvent("shibaku:reel-fault", { detail }));
  if (new URLSearchParams(window.location.search).get("audit") === "1") throw error;
}

try {
const { ReelControlError } = window.ShibakuReelControl;
const BT = window.ShibakuBT;
const SYMBOLS = ["赤7", "BAR", "ベル", "スイカ", "チェリー", "リプレイ", "青7", "ブランク"];
const SYMBOL_ASSETS = Object.freeze({
  "赤7": "assets/symbols/red7.png?v=6",
  "青7": "assets/symbols/blue7.png?v=6",
  BAR: "assets/symbols/bar.png?v=6",
  "ベル": "assets/symbols/bell.png?v=6",
  "スイカ": "assets/symbols/watermelon.png?v=6",
  "チェリー": "assets/symbols/cherry.png?v=6",
  "リプレイ": "assets/symbols/replay.png?v=6",
  "ブランク": "assets/symbols/blank.png?v=1",
});

const BONUS_MUSIC = Object.freeze({
  GOLD_REG: { url: "./assets/audio/red-seven.mp3?v=2", label: "GOLD REG BONUS" },
  BT: { url: "./assets/audio/kaimai-boost-2aa.mp3?v=1", label: "BONUS TRIGGER" },
  RED_BIG: { url: "./assets/audio/red-seven.mp3?v=2", label: "red seven" },
  BLUE_BIG: { url: "./assets/audio/blue-seven.mp3?v=2", label: "blue seven" },
  RED_BIG_V: { url: "./assets/audio/bigred-v.mp3?v=1", label: "red seven V" },
  BLUE_BIG_V: { url: "./assets/audio/bigblue-v.mp3?v=1", label: "blue seven V" },
  REG: { url: "./assets/audio/regtrim.mp3?v=1", label: "REG BONUS" },
  BOOST: { url: "./assets/audio/kaimai-boost-2aa.mp3?v=1", label: "開米ブースト" },
  AT_RETURN: { url: "./assets/audio/wwssflip.mp3?v=1", label: "WWSS Flip", loop: false },
  // These local masters are normalized to -12 LUFS (existing red BIG after its -8 dB trim).
  CZ_BABA: { url: "./assets/audio/baba-cz.mp3?v=1", label: "ババア臭チャレンジ", gainDb: 2 },
  CZ_SHIBAKU: { url: "./assets/audio/shibaku-cz.mp3?v=1", label: "しばくでチャレンジ", gainDb: 8 },
  CZ_UNKO: { url: "./assets/audio/unko-cz.mp3?v=1", label: "うんこ6ゲーム", gainDb: 8 },
});
const BONUS_MUSIC_GAIN = 10 ** (-8 / 20);
const VOLUME_LEVEL_MAX = 5;
const SETTING_RESULT_STORAGE_KEY = "shibaku-bt-setting-result";
const BOOST_TUNING = Object.freeze({
  normal: { gainMin: 27, gainMax: 28, endingDelta: 2400 },
  upper: { gainMin: 36, gainMax: 38, endingDelta: 7000 },
});
const SFX_MAX_CONCURRENT_PER_KEY = 5;
const BEEP_MAX_CONCURRENT = 4;
const SOUND_EFFECTS = Object.freeze({
  btMiss: { url: "./assets/audio/bt-miss.wav?v=1", gain: 1 },
  ichikaku: { url: "./assets/audio/ichikaku.mp3?v=1", gain: 1 },
  fakeReach: { url: "./assets/audio/fake-reach.mp3?v=1", gain: 0.86 },
  reelSpin: { url: "./assets/audio/reelspin.mp3?v=1", gain: 0.92 },
reelStop: {
      url: "./assets/audio/reelstop.wav?v=1",
      gain: 0.78,
      maxConcurrent: 6
    },
  challengeFail: { url: "./assets/audio/shippai.mp3?v=1", gain: 0.88, mixer: "music" },
  bonusResult: { url: "./assets/audio/kyoman.mp3?v=1", gain: 1 },
  payout: { url: "./assets/audio/payout.mp3?v=1", gain: 1, durationMs: 1568, maxConcurrent: 1 },
  roleReplay: { url: "./assets/audio/replay.mp3?v=1", gain: 0.72 },
  roleWatermelon: { url: "./assets/audio/suikaa.mp3?v=1", gain: 1 },
  roleCherry: { url: "./assets/audio/cherry.mp3?v=1", gain: 0.66 },
  tenpai: { url: "./assets/audio/tenpai.mp3?v=1", gain: 1 },
});

const PAYLINES = [
  { index: 0, name: "上段", rows: [0, 0, 0] },
  { index: 1, name: "中段", rows: [1, 1, 1] },
  { index: 2, name: "下段", rows: [2, 2, 2] },
  { index: 3, name: "右下がり", rows: [0, 1, 2] },
  { index: 4, name: "右上がり", rows: [2, 1, 0] },
];

const MAX_REEL_SLIP = 4;
const LEFT_REEL_BOTTOM_ROW = 2;
const CHERRY_TRIGGER_ROWS = Object.freeze([0, 2]);
const BABA_SANDWICH_SYMBOLS = Object.freeze(["BAR", "リプレイ", "BAR"]);
const EXTENDED_STOP_ROLE_KEYS = new Set([
  "cherry",
  "strongCherry",
  "middleCherry",
  "barLine",
  "assistBar",
  "reg",
  "big",
  "blueBig",
  "babaSandwich",
]);
const REEL_STOP_ORDERS = Object.freeze([
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
]);

const REEL_STRIPS = [
  ["リプレイ", "ベル", "スイカ", "リプレイ", "ベル", "スイカ", "リプレイ", "赤7", "ベル", "スイカ", "BAR", "リプレイ", "BAR", "ベル", "スイカ", "青7", "リプレイ", "ベル", "スイカ", "チェリー", "ブランク"],
  ["リプレイ", "ベル", "スイカ", "リプレイ", "ベル", "スイカ", "リプレイ", "赤7", "ベル", "スイカ", "BAR", "リプレイ", "青7", "ベル", "スイカ", "チェリー", "リプレイ", "ベル", "スイカ", "ブランク", "赤7"],
  ["リプレイ", "ベル", "スイカ", "リプレイ", "ベル", "スイカ", "リプレイ", "赤7", "ベル", "スイカ", "BAR", "リプレイ", "青7", "ベル", "スイカ", "チェリー", "リプレイ", "ベル", "スイカ", "ブランク", "赤7"],
];

const ROLE_DEFS = {
  miss: { key: "miss", name: "1枚役", payout: 1, rare: "none" },
  replay: { key: "replay", name: "リプレイ", payout: 3, rare: "none", symbols: ["リプレイ", "リプレイ", "リプレイ"] },
  bell: { key: "bell", name: "ベル", payout: 3, rare: "none", symbols: ["ベル", "ベル", "ベル"] },
  watermelon: { key: "watermelon", name: "スイカ", payout: 5, rare: "weak", symbols: ["スイカ", "スイカ", "スイカ"] },
  watermelonChance: { key: "watermelonChance", name: "スイカハズレ", payout: 0, rare: "strong" },
  cherry: {
    key: "cherry",
    name: "弱チェリー",
    payout: 2,
    rare: "weak",
    triggerRows: CHERRY_TRIGGER_ROWS,
  },
  strongCherry: {
    key: "strongCherry",
    name: "強チェリー",
    payout: 0,
    rare: "strong",
    patterns: [["チェリー", "チェリー", "チェリー"]],
    allowedPaylines: [0, 2, 3, 4],
  },
  barLine: { key: "barLine", name: "BAR揃い", payout: 0, rare: "strong", symbols: ["BAR", "BAR", "BAR"] },
  middleCherry: { key: "middleCherry", name: "中段チェリー", payout: 0, rare: "freeze" },
  chance: { key: "chance", name: "チャンス目", payout: 0, rare: "strong", symbols: ["赤7", "BAR", "青7"] },
  reg: { key: "reg", name: "REG図柄", payout: 0, rare: "bonus", symbols: ["赤7", "赤7", "BAR"] },
  big: { key: "big", name: "赤BIG図柄", payout: 0, rare: "bonus", symbols: ["赤7", "赤7", "赤7"] },
  blueBig: { key: "blueBig", name: "青BIG図柄", payout: 0, rare: "bonus", symbols: ["青7", "青7", "青7"] },
  assistBar: { key: "assistBar", name: "BARナビ", payout: 0, rare: "none", symbols: ["BAR", "BAR", "BAR"] },
  babaSandwich: { key: "babaSandwich", name: "BAR挟み目", payout: 0, rare: "none" },
};

const WIN_ROLE_KEYS = ["replay", "bell", "watermelon", "cherry", "strongCherry", "barLine", "chance", "reg", "big", "blueBig"];
const NORMAL_RANDOM_ROLE_KEYS = Object.freeze([
  "miss", "replay", "bell", "watermelon", "cherry", "strongCherry", "watermelonChance", "chance",
]);
const FORCED_ROLE_BY_ACTION = Object.freeze({
  roleMiss: "miss",
  roleReplay: "replay",
  roleBell: "bell",
  roleWatermelon: "watermelon",
  roleCherry: "cherry",
  roleStrongCherry: "strongCherry",
  roleWatermelonChance: "watermelonChance",
  roleChance: "chance",
  roleBarLine: "barLine",
  middleCherry: "middleCherry",
});

const MAPS = [
  { game: 50, strength: "weak", label: "リセット専用", resetOnly: true },
  { game: 130, strength: "medium", label: "引き戻しの関門" },
  { game: 250, strength: "strong", label: "メインの叩きどころ" },
  { game: 350, strength: "weak", label: "通過点" },
  { game: 450, strength: "medium", label: "中盤の山場" },
  { game: 600, strength: "strong", label: "最強のストッパーゾーン" },
  { game: 660, strength: "weak", label: "天井前の煽り" },
];

const BIG_BONUS_ZONES = [
  { game: 180, rate: 0.025, label: "BIG BONUS専用ゾーン" },
  { game: 390, rate: 0.045, label: "BIG BONUS専用ゾーン" },
  { game: 720, rate: 0.09, label: "BIG BONUS専用ゾーン" },
];

const CZ_TABLE = {
  unko: { name: "うんこ6ゲーム", games: 6, successRate: 0.25 },
  baba: { name: "ババア臭チャレンジ", games: 8, successRate: 0.45 },
  shibaku: { name: "しばくでチャレンジ", games: 10, successRate: 0.70 },
  ura: { name: "裏上位CZ", games: 8, successRate: 0.82 },
  tenjo: { name: "天井CZ", games: 5, successRate: 1 },
};

const SETTING_PROFILES = {
  1: { target: 97.8, normalRole: 0.99, map: 0.68, weakRare: 0.70, strongRare: 0.74, directBonus: 0.60, returnHigh: 0.67, cz: 0.96, bonusAt: 0.00, at: 0.84, style: "荒波・天井A寄り" },
  2: { target: 99.2, normalRole: 1.00, map: 0.70, weakRare: 0.72, strongRare: 0.76, directBonus: 0.62, returnHigh: 0.69, cz: 0.98, bonusAt: 0.00, at: 0.85, style: "低設定・やや底上げ" },
  3: { target: 101.8, normalRole: 1.00, map: 0.74, weakRare: 0.76, strongRare: 0.80, directBonus: 0.70, returnHigh: 0.74, cz: 1.00, bonusAt: 0.00, at: 0.87, style: "中間・バランス" },
  4: { target: 106.1, normalRole: 1.01, map: 1.01, weakRare: 1.00, strongRare: 1.005, directBonus: 1.116, returnHigh: 1.027, cz: 1.03, bonusAt: 0.085, at: 1.013, style: "高設定・初当り優遇" },
  5: { target: 110.4, normalRole: 1.01, map: 1.062, weakRare: 1.035, strongRare: 1.043, directBonus: 1.282, returnHigh: 1.094, cz: 1.06, bonusAt: 0.161, at: 1.046, style: "高設定・AT接続強化" },
  6: { target: 114.9, normalRole: 1.02, map: 1.167, weakRare: 1.118, strongRare: 1.123, directBonus: 1.562, returnHigh: 1.219, cz: 1.08, bonusAt: 0.23, at: 1.101, style: "安定・浅いモード優先" },
};

const NORMAL_MODES = {
  A: { name: "通常A", ceiling: 810 },
  B: { name: "通常B", ceiling: 660 },
  C: { name: "チャンス", ceiling: 450 },
  heaven: { name: "天国", ceiling: 130 },
};

const MODE_WEIGHTS_BY_SETTING = {
  1: [52, 29, 12, 7], 2: [52, 29, 12, 7], 3: [45, 31, 15, 9],
  4: [34, 33, 20, 13], 5: [27, 32, 24, 17], 6: [16, 30, 31, 23],
};

let reelLayoutCatalog = null;
const {wrapIndex, visibleWindowFromStop, visibleWindowFromPosition, matrixFromStops, extractLineSymbols, rolePatterns, matchesRolePattern, evaluateWins, symbolCountInWindow, hasCleanWatermelonDisplay, hasCleanWatermelonChanceDisplay, fixedStopsKey, controlCandidateIndexKey, forEachStopAssignment, controlledDisplayFallbacks, buildReelControlTables, isRobustRolePrefix, indexedControlChoices, decideRoleAwareStop, auditFourSlipControl, summarizeReelAuditInvariants, buildReelLayoutCatalog, layoutFromCatalogEntry, controlCatalogKey} = window.ShibakuReelControl.createReelControl({SYMBOLS, PAYLINES, REEL_STRIPS, ROLE_DEFS, WIN_ROLE_KEYS, NORMAL_RANDOM_ROLE_KEYS, MAX_REEL_SLIP, LEFT_REEL_BOTTOM_ROW, CHERRY_TRIGGER_ROWS, BABA_SANDWICH_SYMBOLS, EXTENDED_STOP_ROLE_KEYS, REEL_STOP_ORDERS});

const dom = {
  modeLabel: document.querySelector("#modeLabel"),
  stageLabel: document.querySelector("#stageLabel"),
  sectionGamesLabel: document.querySelector("#sectionGamesLabel"),
  sectionDeltaLabel: document.querySelector("#sectionDeltaLabel"),
  dataBigCountLabel: document.querySelector("#dataBigCountLabel"),
  dataRegCountLabel: document.querySelector("#dataRegCountLabel"),
  dataCzCountLabel: document.querySelector("#dataCzCountLabel"),
  dataLastBonusGamesLabel: document.querySelector("#dataLastBonusGamesLabel"),
  creditLabel: document.querySelector("#creditLabel"),
  payoutLabel: document.querySelector("#payoutLabel"),
  totalGamesLabel: document.querySelector("#totalGamesLabel"),
  totalDeltaLabel: document.querySelector("#totalDeltaLabel"),
  actualSettingLabel: document.querySelector("#actualSettingLabel"),
  bgmLabel: document.querySelector("#bgmLabel"),
  modeSummary: document.querySelector("#modeSummary"),
  detailBadge: document.querySelector("#detailBadge"),
  banner: document.querySelector("#banner"),
  reels: [...document.querySelectorAll(".reel")],
  roadmapList: document.querySelector("#roadmapList"),
  deltaChart: document.querySelector("#deltaChart"),
  bonusRateLabel: document.querySelector("#bonusRateLabel"),
  bigRateLabel: document.querySelector("#bigRateLabel"),
  regRateLabel: document.querySelector("#regRateLabel"),
  czEntryRateLabel: document.querySelector("#czEntryRateLabel"),
  czSuccessRateLabel: document.querySelector("#czSuccessRateLabel"),
  unkoCzSuccessRateLabel: document.querySelector("#unkoCzSuccessRateLabel"),
  babaCzSuccessRateLabel: document.querySelector("#babaCzSuccessRateLabel"),
  shibakuCzSuccessRateLabel: document.querySelector("#shibakuCzSuccessRateLabel"),
  logList: document.querySelector("#logList"),
  pushNavi: document.querySelector("#pushNavi"),
  pushNaviText: document.querySelector("#pushNaviText"),
  routeLabel: document.querySelector("#routeLabel"),
  nextGateLabel: document.querySelector("#nextGateLabel"),
  ceilingLabel: document.querySelector("#ceilingLabel"),
  normalModeLabel: document.querySelector("#normalModeLabel"),
  settingDesignText: document.querySelector("#settingDesignText"),
  atStatusLabel: document.querySelector("#atStatusLabel"),
  tamaStatusLabel: document.querySelector("#tamaStatusLabel"),
  premiumLabel: document.querySelector("#premiumLabel"),
  detailPanel: document.querySelector("#detailPanel"),
  machineWindow: document.querySelector(".machine-window"),
  spinButton: document.querySelector("#spinButton"),
  autoButton: document.querySelector("#autoButton"),
  speed1Button: document.querySelector("#speed1Button"),
  speed2Button: document.querySelector("#speed2Button"),
  speed3Button: document.querySelector("#speed3Button"),
  debugFastButton: document.querySelector("#debugFastButton"),
  overdriveButton: document.querySelector("#overdriveButton"),
  czGuaranteedButton: document.querySelector("#czGuaranteedButton"),
  soundButton: document.querySelector("#soundButton"),
  soundVolumeDown: document.querySelector("#soundVolumeDown"),
  soundVolumeUp: document.querySelector("#soundVolumeUp"),
  soundVolumeMeter: document.querySelector("#soundVolumeMeter"),
  soundVolumeLabel: document.querySelector("#soundVolumeLabel"),
  musicVolumeDown: document.querySelector("#musicVolumeDown"),
  musicVolumeUp: document.querySelector("#musicVolumeUp"),
  musicVolumeMeter: document.querySelector("#musicVolumeMeter"),
  musicVolumeLabel: document.querySelector("#musicVolumeLabel"),
  resetButton: document.querySelector("#resetButton"),
  settingSelect: document.querySelector("#settingSelect"),
  debugButtons: [...document.querySelectorAll("[data-force]")],
  debugStageButtons: [...document.querySelectorAll("[data-debug-stage]")],
  stopButtons: [],
};

let state = createInitialState();
const ui = {
  counterTamaHits: 0,
  spinning: false,
  spinningReels: [false, false, false],
  deceleratingReels: [false, false, false],
  displayReels: null,
  reelPositions: [0, 0, 0],
  lastFrameAt: 0,
  rafId: null,
  soundEnabled: true,
  soundVolumeLevel: 4,
  soundVolume: 4 / VOLUME_LEVEL_MAX,
  musicVolumeLevel: 5,
  musicVolume: 1,
  audioContext: null,
  musicElements: new Map(),
  musicType: null,
  musicPrimed: false,
  atReturnMusicActive: false,
  sfxElements: new Map(),
  activeSfx: new Set(),
  activeBeepCount: 0,
  sfxPrimed: false,
  payoutEffectToken: 0,
  payoutSound: null,
  tamaFreezeActive: false,
  tamaFreezePromise: null,
  spinInterval: null,
  pendingSpin: null,
  mainActionPromise: null,
  operationGeneration: 0,
  autoGeneration: 0,
  challengeFailure: null,
  czFailedThisGame: false,
  actionLockedUntil: 0,
  actionLockReason: "",
  actionLockTimer: null,
  autoSpeed: 1,
  debugFast: false,
  overdrive: false,
  debugCzGuaranteed: false,
  reelStepMs: 39,
};

function createInitialState() {
  const miss = createRoleLayout("miss");
  const actualSetting = pickSetting(dom.settingSelect.value);
  return {
    mode: "normal",
    totalGames: 0,
    sectionGames: 0,
    normalGames: 0,
    currentGames: 0,
    totalDelta: 0,
    lowestTotalDelta: 0,
    resultDryGames: 0,
    sectionDelta: 0,
    endingTriggerDelta: 2400,
    lastEndingDelta: null,
    stage: "橋本駅",
    normalStage: "橋本駅",
    normalStageBand: 0,
    bgm: "環境音",
    actualSetting,
    normalMode: pickNormalMode(actualSetting),
    showActualSetting: dom.settingSelect.value !== "random",
    route: "通常ルート",
    consumedMaps: new Set(),
    resetHeavenActive: false,
    bonusReturnHighGames: 0,
    returnHighAtLeverOn: false,
    mapCzHighGames: 0,
    mapCzHighRate: 0,
    mapCzHighLabel: "",
    mapCzHighStrength: "",
    czWaveSeed: randomInt(10000, 999999),
    czWaveIndex: 0,
    nextCzWaveGame: 0,
    czEntryWave: { name: "通常", multiplier: 1 },
    czSuccessWave: { name: "通常", multiplier: 1 },
    longWaveSeed: randomInt(10000, 999999),
    longWaveIndex: 0,
    nextLongWaveGame: 0,
    longWave: { name: "並", czEntry: 1, czSuccess: 1, at: 1, bonus: 1 },
    roleStreak: 0,
    pushNaviOrder: null,
    pushNaviText: "",
    bonus: null,
    bonusReady: null,
    regStreak: 0,
    guaranteedBlueRemaining: 0,
    bt: null,
    btView: null,
    cz: null,
    at: null,
    tama: null,
    revival: null,
    banner: "",
    bannerTone: "",
    log: [],
    stats: {
      nextGraphGame: 50,
      normalGames: 0,
      deltaGraph: [{ game: 0, delta: 0 }],
      bigHits: 0,
      regHits: 0,
      czEntries: 0,
      czSuccesses: 0,
      czFails: 0,
      czByType: {
        unko: { entries: 0, successes: 0, fails: 0 },
        baba: { entries: 0, successes: 0, fails: 0 },
        shibaku: { entries: 0, successes: 0, fails: 0 },
      },
    },
    auto: false,
    reels: miss.reels,
    reelStops: miss.stopIndexes,
    lastHit: miss.lastHit,
    internalRoleKey: null,
    internalHit: null,
    presentationRoleKey: "miss",
    displayRoleKey: "miss",
    displayHit: miss.lastHit,
    displayMissedRole: null,
    pendingPayout: null,
    premium489: false,
    vStockAwardedThisGame: false,
    vStockAwardedType: null,
    boostConfirmedThisGame: false,
    czUpgradeRate: 0.02,
  };
}

function pickSetting(selection) {
  if (selection !== "random") {
    return Number(selection);
  }

  return sampleWeighted([
    { value: 1, weight: 34 },
    { value: 2, weight: 25 },
    { value: 3, weight: 19 },
    { value: 4, weight: 12 },
    { value: 5, weight: 7 },
    { value: 6, weight: 3 },
  ]).value;
}

function pickNormalMode(setting) {
  const weights = MODE_WEIGHTS_BY_SETTING[setting] || MODE_WEIGHTS_BY_SETTING[3];
  return sampleWeighted(["A", "B", "C", "heaven"].map((value, index) => ({ value, weight: weights[index] }))).value;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(rate) {
  return Math.random() < rate;
}

function sampleWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

function settingProfile() {
  return SETTING_PROFILES[state.actualSetting] || SETTING_PROFILES[3];
}

function scaledChance(rate, key) {
  return chance(Math.max(0, Math.min(1, rate * settingProfile()[key])));
}

function clampRate(rate) {
  return Math.max(0, Math.min(1, rate));
}

function seededUnit(seed, salt) {
  const raw = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function waveBand(roll, bands) {
  for (const band of bands) {
    if (roll < band.limit) {
      return { name: band.name, multiplier: band.multiplier };
    }
  }
  const last = bands[bands.length - 1];
  return { name: last.name, multiplier: last.multiplier };
}

function updateCzWave(force = false) {
  if (!force && state.totalGames < state.nextCzWaveGame) {
    return;
  }

  const index = state.czWaveIndex;
  const entryRoll = seededUnit(state.czWaveSeed, index * 3 + 1);
  const successRoll = seededUnit(state.czWaveSeed, index * 3 + 2);
  const lengthRoll = seededUnit(state.czWaveSeed, index * 3 + 3);
  const successCap = state.actualSetting >= 6 ? 0.98 : state.actualSetting >= 5 ? 1.06 : 1.18;

  state.czEntryWave = waveBand(entryRoll, [
    { limit: 0.18, name: "冷", multiplier: 0.55 },
    { limit: 0.38, name: "低", multiplier: 0.75 },
    { limit: 0.72, name: "並", multiplier: 1 },
    { limit: 0.9, name: "高", multiplier: 1.3 },
    { limit: 1, name: "超", multiplier: 1.6 },
  ]);

  state.czSuccessWave = waveBand(successRoll, [
    { limit: 0.24, name: "冷", multiplier: 0.62 },
    { limit: 0.5, name: "低", multiplier: 0.78 },
    { limit: 0.8, name: "並", multiplier: 0.94 },
    { limit: 0.94, name: "高", multiplier: 1.06 },
    { limit: 1, name: "超", multiplier: 1.16 },
  ]);
  state.czSuccessWave.multiplier = Math.min(state.czSuccessWave.multiplier, successCap);
  state.czWaveIndex += 1;
  state.nextCzWaveGame = state.totalGames + randomInt(80, 180) + Math.round(lengthRoll * 60);
}

function updateLongWave(force = false) {
  if (!force && state.totalGames < state.nextLongWaveGame) {
    return;
  }

  const index = state.longWaveIndex;
  const roll = seededUnit(state.longWaveSeed, index * 5 + 1);
  const lengthRoll = seededUnit(state.longWaveSeed, index * 5 + 2);
  const highSetting = state.actualSetting >= 4;
  const veryHighSetting = state.actualSetting >= 6;
  const bands = highSetting
    ? [
        { limit: 0.18, name: "強冷遇", czEntry: 0.48, czSuccess: 0.54, at: 0.72, bonus: 0.75 },
        { limit: 0.42, name: "冷遇", czEntry: 0.68, czSuccess: 0.72, at: 0.84, bonus: 0.88 },
        { limit: 0.68, name: "並", czEntry: 0.92, czSuccess: 0.9, at: 0.96, bonus: 0.98 },
        { limit: 0.88, name: "優遇", czEntry: 1.08, czSuccess: veryHighSetting ? 0.98 : 1.04, at: 1.06, bonus: 1.08 },
        { limit: 1, name: "強優遇", czEntry: 1.18, czSuccess: veryHighSetting ? 1 : 1.08, at: 1.12, bonus: 1.14 },
      ]
    : [
        { limit: 0.16, name: "強冷遇", czEntry: 0.62, czSuccess: 0.68, at: 0.82, bonus: 0.82 },
        { limit: 0.36, name: "冷遇", czEntry: 0.78, czSuccess: 0.82, at: 0.9, bonus: 0.9 },
        { limit: 0.72, name: "並", czEntry: 1, czSuccess: 1, at: 1, bonus: 1 },
        { limit: 0.92, name: "優遇", czEntry: 1.24, czSuccess: 1.16, at: 1.08, bonus: 1.12 },
        { limit: 1, name: "強優遇", czEntry: 1.42, czSuccess: 1.24, at: 1.16, bonus: 1.22 },
      ];

  state.longWave = bands.find((band) => roll < band.limit) || bands[bands.length - 1];
  state.longWaveIndex += 1;
  state.nextLongWaveGame = state.totalGames + 300 + Math.round(lengthRoll * 700);
}

function czEntryChance(rate, key) {
  updateCzWave();
  updateLongWave();
  return chance(clampRate(rate * settingProfile()[key] * state.czEntryWave.multiplier * state.longWave.czEntry));
}

function czSuccessChance(rate, key = "cz") {
  updateCzWave();
  updateLongWave();
  return chance(clampRate(rate * settingProfile()[key] * state.czSuccessWave.multiplier * state.longWave.czSuccess));
}

function czRewriteChance(rate) {
  updateCzWave();
  updateLongWave();
  return chance(clampRate(rate * state.czSuccessWave.multiplier * state.longWave.czSuccess));
}

function cloneReels(reels) {
  return reels.map((reel) => [...reel]);
}

function snapshotState(source) {
  return {
    ...source,
    consumedMaps: new Set(source.consumedMaps),
    bonus: source.bonus ? { ...source.bonus, vStockQueue: source.bonus.vStockQueue ? [...source.bonus.vStockQueue] : [] } : null,
    bonusReady: source.bonusReady ? { ...source.bonusReady } : null,
    bt: source.bt ? { ...source.bt } : null,
    btView: source.btView ? { ...source.btView } : null,
    cz: source.cz
      ? {
          ...source.cz,
          babaSandwichSchedule: source.cz.babaSandwichSchedule
            ? [...source.cz.babaSandwichSchedule]
            : [],
        }
      : null,
    at: source.at ? { ...source.at } : null,
    tama: source.tama ? { ...source.tama } : null,
    revival: source.revival ? { ...source.revival } : null,
    stats: source.stats
      ? {
          ...source.stats,
          deltaGraph: source.stats.deltaGraph.map((point) => ({ ...point })),
          czByType: Object.fromEntries(
            Object.entries(source.stats.czByType || {}).map(([key, value]) => [key, { ...value }])
          ),
        }
      : null,
    log: source.log.map((entry) => ({ ...entry })),
    reels: cloneReels(source.reels),
    reelStops: [...source.reelStops],
    lastHit: source.lastHit ? { ...source.lastHit, symbols: source.lastHit.symbols ? [...source.lastHit.symbols] : [] } : null,
    internalHit: source.internalHit
      ? { ...source.internalHit, symbols: source.internalHit.symbols ? [...source.internalHit.symbols] : [] }
      : null,
    displayHit: source.displayHit
      ? { ...source.displayHit, symbols: source.displayHit.symbols ? [...source.displayHit.symbols] : [] }
      : null,
    pushNaviOrder: source.pushNaviOrder ? [...source.pushNaviOrder] : null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function actionLockRemaining() {
  return Math.max(0, ui.actionLockedUntil - Date.now());
}

function lockMainAction(durationMs, reason) {
  const effectiveDurationMs = ui.debugFast ? scaledDelay(durationMs, 1) : durationMs;
  const unlockAt = Date.now() + effectiveDurationMs;
  if (unlockAt < ui.actionLockedUntil) {
    return;
  }
  ui.actionLockedUntil = unlockAt;
  ui.actionLockReason = reason;
  if (ui.actionLockTimer) {
    window.clearTimeout(ui.actionLockTimer);
  }
  document.documentElement.dataset.actionLock = JSON.stringify({ reason, durationMs: effectiveDurationMs, unlockAt });
  renderButtons();
  renderInteractivity();
  ui.actionLockTimer = window.setTimeout(() => {
    ui.actionLockedUntil = 0;
    ui.actionLockReason = "";
    ui.actionLockTimer = null;
    document.documentElement.dataset.actionLock = JSON.stringify({ reason: "", durationMs: 0, unlockAt: 0 });
    render();
  }, effectiveDurationMs);
}


function currentSymbolStepPx() {
  const rootStyle = window.getComputedStyle(document.documentElement);
  const symbolHeight = Number.parseFloat(rootStyle.getPropertyValue("--symbol-h")) || 86;
  const symbolGap = Number.parseFloat(rootStyle.getPropertyValue("--symbol-gap")) || 8;
  return symbolHeight + symbolGap;
}


function ensureReelLayoutCatalog() {
  if (!reelLayoutCatalog) {
    reelLayoutCatalog = buildReelLayoutCatalog({ extendedAuditEnabled: new URLSearchParams(window.location.search).get("audit") === "1" });
    window.__SHIBAKU_REEL_AUDIT__ = reelLayoutCatalog.audit;
    document.documentElement.dataset.reelAudit = JSON.stringify(reelLayoutCatalog.audit);
  }
  return reelLayoutCatalog;
}


function catalogRoleLayout(roleKey, options = {}) {
  const { catalog } = ensureReelLayoutCatalog();
  const lookupKey = roleKey === "assistBar" ? "barLine" : roleKey;
  let candidates = catalog[lookupKey] || [];
  if (options.lineIndex !== undefined && lookupKey !== "middleCherry") {
    candidates = candidates.filter((entry) => {
      const lineIndex = entry.win?.paylineIndex ?? entry.payline?.index;
      return lineIndex === options.lineIndex;
    });
  }
  if (!candidates.length) {
    return null;
  }

  const candidate = candidates[randomInt(0, candidates.length - 1)];
  return layoutFromCatalogEntry(roleKey, candidate);
}

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function createRoleLayout(roleKey, options = {}) {
  const catalogLayout = catalogRoleLayout(roleKey, options);
  if (catalogLayout) {
    return catalogLayout;
  }

  if (roleKey === "miss") {
    for (let attempt = 0; attempt < 800; attempt += 1) {
      const stops = REEL_STRIPS.map((strip) => randomInt(0, strip.length - 1));
      const reels = matrixFromStops(stops);
      if (evaluateWins(reels).length === 0) {
        return {
          reels,
          stopIndexes: stops,
          lastHit: null,
        };
      }
    }

    const fallback = [0, 7, 14];
    return { reels: matrixFromStops(fallback), stopIndexes: fallback, lastHit: null };
  }

  if (roleKey === "watermelonChance") {
    const candidateThirds = ["BAR", "チェリー", "青7"];
    for (const payline of shuffle(PAYLINES)) {
      const thirdSymbol = candidateThirds[randomInt(0, candidateThirds.length - 1)];
      const perReelCandidates = [
        [],
        [],
        [],
      ];

      payline.rows.forEach((rowIndex, reelIndex) => {
        const strip = REEL_STRIPS[reelIndex];
        const targetSymbol = reelIndex < 2 ? "スイカ" : thirdSymbol;
        for (let stopIndex = 0; stopIndex < strip.length; stopIndex += 1) {
          if (visibleWindowFromStop(reelIndex, stopIndex)[rowIndex] === targetSymbol) {
            perReelCandidates[reelIndex].push(stopIndex);
          }
        }
        perReelCandidates[reelIndex] = shuffle(perReelCandidates[reelIndex]);
      });

      for (const left of perReelCandidates[0]) {
        for (const center of perReelCandidates[1]) {
          for (const right of perReelCandidates[2]) {
            const stops = [left, center, right];
            const reels = matrixFromStops(stops);
            const lineSymbols = extractLineSymbols(reels, payline);
            const wins = evaluateWins(reels);
            if (
              wins.length === 0 &&
              lineSymbols[0] === "スイカ" &&
              lineSymbols[1] === "スイカ" &&
              lineSymbols[2] !== "スイカ"
            ) {
              return {
                reels,
                stopIndexes: stops,
                lastHit: {
                  roleKey,
                  roleName: "スイカハズレ",
                  paylineIndex: payline.index,
                  paylineName: payline.name,
                  symbols: [...lineSymbols],
                },
              };
            }
          }
        }
      }
    }
  }

  if (roleKey === "middleCherry") {
    const leftCandidates = [];
    const leftStrip = REEL_STRIPS[0];
    for (let stopIndex = 0; stopIndex < leftStrip.length; stopIndex += 1) {
      if (visibleWindowFromStop(0, stopIndex)[1] === "チェリー") {
        leftCandidates.push(stopIndex);
      }
    }

    for (const left of shuffle(leftCandidates)) {
      for (const center of shuffle([...Array(REEL_STRIPS[1].length).keys()])) {
        for (const right of shuffle([...Array(REEL_STRIPS[2].length).keys()])) {
          const stops = [left, center, right];
          const reels = matrixFromStops(stops);
          if (evaluateWins(reels).length === 0 && reels[0][1] === "チェリー") {
            return {
              reels,
              stopIndexes: stops,
              lastHit: {
                roleKey,
                roleName: ROLE_DEFS[roleKey].name,
                paylineIndex: 1,
                paylineName: "左リール中段",
                symbols: ["チェリー", reels[1][1], reels[2][1]],
              },
            };
          }
        }
      }
    }
  }

  const role = ROLE_DEFS[roleKey];
  const paylines = options.lineIndex !== undefined
    ? [PAYLINES[options.lineIndex]]
    : shuffle(PAYLINES);

  for (const payline of paylines) {
    if (role.allowedPaylines && !role.allowedPaylines.includes(payline.index)) {
      continue;
    }
    for (const pattern of rolePatterns(role)) {
      const perReelCandidates = payline.rows.map((rowIndex, reelIndex) => {
        const strip = REEL_STRIPS[reelIndex];
        const matches = [];
        for (let stopIndex = 0; stopIndex < strip.length; stopIndex += 1) {
          if (visibleWindowFromStop(reelIndex, stopIndex)[rowIndex] === pattern[reelIndex]) {
            matches.push(stopIndex);
          }
        }
        return shuffle(matches);
      });

      for (const left of perReelCandidates[0]) {
        for (const center of perReelCandidates[1]) {
          for (const right of perReelCandidates[2]) {
            const stops = [left, center, right];
            const reels = matrixFromStops(stops);
            const wins = evaluateWins(reels);
            if (
              wins.length === 1 &&
              wins[0].roleKey === roleKey &&
              wins[0].paylineIndex === payline.index &&
              reels[0][1] !== "チェリー"
            ) {
              return {
                reels,
                stopIndexes: stops,
                lastHit: {
                  roleKey,
                  roleName: role.name,
                  paylineIndex: payline.index,
                  paylineName: payline.name,
                  symbols: [...pattern],
                },
              };
            }
          }
        }
      }
    }
  }

  throw new ReelControlError(`5LINE停止テーブルに${roleKey}の候補がありません`);
}

function setRoleLayout(roleKey, options = {}) {
  let layout = createRoleLayout(roleKey, options);
  layout = { reels: cloneReels(layout.reels), stopIndexes: [...layout.stopIndexes], lastHit: layout.lastHit ? { ...layout.lastHit, symbols: [...layout.lastHit.symbols] } : null };
  state.reels = layout.reels;
  state.reelStops = layout.stopIndexes;
  state.lastHit = layout.lastHit;
  state.presentationRoleKey = roleKey;
  state.displayRoleKey = roleKey;
  state.displayHit = layout.lastHit
    ? { ...layout.lastHit, symbols: layout.lastHit.symbols ? [...layout.lastHit.symbols] : [] }
    : null;
  state.displayMissedRole = null;
  return layout;
}

function setSpinRole(roleKey, payout = ROLE_DEFS[roleKey]?.payout ?? 0, options = {}) {
  const originMode = state.mode;
  const layout = setRoleLayout(roleKey, options);
  state.internalRoleKey = roleKey;
  state.internalHit = cloneDisplayHit(layout.lastHit);
  state.pendingPayout = {
    originMode,
    originBonusType: state.bonus?.type || null,
    internalRoleKey: roleKey,
    intendedPayout: payout,
  };
  state.settledPayout = 0;
  addCoins(-3);
  return ROLE_DEFS[roleKey];
}

function addCoins(amount) {
  state.totalDelta += amount;
  state.lowestTotalDelta = Math.min(state.lowestTotalDelta, state.totalDelta);
  state.sectionDelta += amount;
  recordDeltaGraphPoint();
}

const RESULT_DRY_RESET_GAMES = 100;
const RESULT_COUNTING_MODES = new Set(["normal", "cz", "bt"]);

function updateResultCountingWindow(beforeState, afterState) {
  const enteredBonus = beforeState.mode !== "bonus" && afterState.mode === "bonus";
  if (enteredBonus) {
    afterState.resultDryGames = 0;
    return;
  }

  const gamesPlayed = Math.max(0, (afterState.totalGames || 0) - (beforeState.totalGames || 0));
  if (!gamesPlayed || !RESULT_COUNTING_MODES.has(beforeState.mode)) {
    return;
  }

  afterState.resultDryGames = (beforeState.resultDryGames || 0) + gamesPlayed;
  if (afterState.resultDryGames < RESULT_DRY_RESET_GAMES) {
    return;
  }

  afterState.resultDryGames %= RESULT_DRY_RESET_GAMES;
  afterState.lowestTotalDelta = afterState.totalDelta;
  document.documentElement.dataset.resultCountReset = JSON.stringify({
    dryGames: RESULT_DRY_RESET_GAMES,
    baselineDelta: afterState.lowestTotalDelta,
    at: Date.now(),
  });
}

function resetCurrentGamesAfterPayoutMode(beforeState, afterState) {
  const exitedBonus = beforeState.mode === "bonus" && afterState.mode !== "bonus";
  const wasBoost = beforeState.mode === "at" || beforeState.mode === "tama";
  const remainsBoost = afterState.mode === "at" || afterState.mode === "tama";
  if (exitedBonus || (wasBoost && !remainsBoost)) {
    afterState.currentGames = 0;
    afterState.normalStage = "橋本駅";
    afterState.normalStageBand = 0;
    if (afterState.mode === "normal") afterState.stage = "橋本駅";
  }
}

function recordDeltaGraphPoint() {
  if (!state.stats || state.totalGames < state.stats.nextGraphGame) {
    return;
  }

  while (state.totalGames >= state.stats.nextGraphGame) {
    state.stats.deltaGraph.push({
      game: state.stats.nextGraphGame,
      delta: state.totalDelta,
    });
    state.stats.nextGraphGame += 50;
  }
}

function consumeCreditWithRole(roleKey) {
  return setSpinRole(roleKey);
}

function enhancedModePayout(roleKey, bellPayout) {
  return roleKey === "bell" ? bellPayout : ROLE_DEFS[roleKey].payout;
}

function resetNormalCycle() {
  state.normalGames = 0;
  state.normalStage = "橋本駅";
  state.normalStageBand = 0;
  state.consumedMaps = new Set();
  // C3: 50G「リセット専用」マップは真のリセット区間（ゲーム開始/RESET/BB後CZ失敗）でのみ有効化する。
  // BIG成立による区画リセットでは再武装しない。
  state.resetHeavenActive = false;
  state.bonusReturnHighGames = 0;
  state.mapCzHighGames = 0;
  state.mapCzHighRate = 0;
  state.mapCzHighLabel = "";
  state.mapCzHighStrength = "";
  state.roleStreak = 0;
  state.pushNaviOrder = null;
  state.pushNaviText = "";
  state.normalMode = pickNormalMode(state.actualSetting);
}

function resetForRoute() {
  state.sectionGames = 0;
  state.sectionDelta = 0;
  resetNormalCycle();
}

function updateRoleStreak(roleKey) {
  if (roleKey === "miss") {
    state.roleStreak = 0;
    return false;
  }

  state.roleStreak += 1;
  return state.roleStreak >= 7;
}

function updateRareRoleStreak(roleKey) {
  const rare = ROLE_DEFS[roleKey]?.rare;
  if (rare !== "weak" && rare !== "strong" && rare !== "freeze") {
    state.roleStreak = 0;
    return false;
  }

  state.roleStreak += 1;
  return state.roleStreak >= 7;
}

function clearPushNavi() {
  state.pushNaviOrder = null;
  state.pushNaviText = "";
}

function assignPushNavi(label = "ベルナビ") {
  const order = shuffle([0, 1, 2]);
  const names = ["左", "中", "右"];
  state.pushNaviOrder = order;
  state.pushNaviText = `${label} ${order.map((reelIndex) => names[reelIndex]).join("→")}`;
  return order;
}

function modeName() {
  switch (state.mode) {
    case "normal":
      return "通常時";
    case "bt":
      return "BONUS TRIGGER";
    case "cz":
      return state.cz?.name || "CZ";
    case "bonus":
      return bonusDisplayName(state.bonus?.type);
    case "bonusReady":
      return "BONUS確定";
    case "at":
      return state.at?.ura ? "開開米ブースト" : "開米ブースト";
    case "tama":
      return "玉チャレンジ";
    case "ending":
      return "エンディング";
    case "revival":
      return "60G引き戻し";
    default:
      return "通常時";
  }
}

function ceilingGame() {
  return NORMAL_MODES[state.normalMode]?.ceiling || 810;
}

function activeMaps() {
  return [
    ...MAPS.map((map) => ({
      ...map,
      key: `map-${map.game}`,
      active: !map.resetOnly || state.resetHeavenActive,
    })).filter((map) => map.game < ceilingGame()),
    {
      game: ceilingGame(),
      strength: "strong",
      label: "天井（ボーナス確定）",
      key: "map-ceiling",
      active: true,
    },
  ];
}

function displayMaps() {
  return [
    ...MAPS.map((map) => ({ ...map, key: `display-${map.game}`, active: true })),
    { game: 810, strength: "strong", label: "最大天井", key: "display-810", active: true },
  ];
}

function nextDisplayGate() {
  return displayMaps().find((map) => map.game >= state.normalGames) || null;
}

function nextGate() {
  const gate = activeMaps()
    .filter((map) => map.active && !state.consumedMaps.has(map.key) && map.game >= state.normalGames)
    .sort((a, b) => a.game - b.game)[0];

  return gate || null;
}

function updateStageFromRoadmap() {
  // Cosmetic only: stages never change BT lottery probabilities.
  if (state.mode !== "normal") return;
  const band = Math.floor(state.currentGames / 50);
  if (band !== state.normalStageBand) {
    const cycleSeed = state.czWaveSeed ^ Math.imul(state.totalGames - state.currentGames, 0x9e3779b9);
    state.normalStage = BT.stageAt(state.currentGames, cycleSeed);
    state.normalStageBand = band;
  }
  state.stage = state.normalStage || "橋本駅";
}

function showBanner(message, tone = "accent") {
  state.banner = message;
  state.bannerTone = tone;
}

function clearBanner() {
  state.banner = "";
  state.bannerTone = "";
}

function logEvent(message, tone = "") {
  const stamp = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  state.log.unshift({ stamp, message, tone });
  state.log = state.log.slice(0, 48);
}

function storeReloadSettingResult() {
  try {
    sessionStorage.setItem(SETTING_RESULT_STORAGE_KEY, JSON.stringify({ setting: state.actualSetting }));
  } catch {
    // Storageが使えない環境でも離脱確認自体は継続する。
  }
}

function alertSettingResult(setting, source) {
  const result = Number(setting);
  if (!Number.isInteger(result)) return;
  document.documentElement.dataset.lastSettingReveal = JSON.stringify({ setting: result, source, at: Date.now() });
  window.alert(`設定は${result}でした`);
}

function restoreReloadSettingResult() {
  try {
    const raw = sessionStorage.getItem(SETTING_RESULT_STORAGE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(SETTING_RESULT_STORAGE_KEY);
    const saved = JSON.parse(raw);
    window.setTimeout(() => alertSettingResult(saved.setting, "reload"), 0);
  } catch {
    // 壊れた保存値は表示せず通常起動する。
  }
}

function transitionToNormal(note = "") {
  state.mode = "normal";
  state.bt = null;
  state.cz = null;
  state.bonus = null;
  state.bonusReady = null;
  state.tama = null;
  state.revival = null;
  state.at = null;
  state.bgm = "環境音";
  clearPushNavi();
  clearBanner();
  updateStageFromRoadmap();
  if (note) {
    logEvent(note);
  }
}

function startBonusReturnHigh(note = "BONUS終了 -> 0Gスタート / 30G引き戻し高確へ") {
  state.normalGames = 0;
  state.consumedMaps = new Set();
  state.resetHeavenActive = true;
  state.bonusReturnHighGames = 30;
  transitionToNormal(note);
  showBanner("0Gスタート / 30G引き戻し高確", "accent");
}

function awardBonusFromCZ() {
  enterBonusReady(state.cz?.ceilingBonusType || randomBonusType(), "チャレンジ成功");
}

function armCeilingCZ() {
  const cz = state.cz;
  if (!cz || cz.ceilingBonusType) return;
  cz.ceilingBonusType = BT.draw({ RED_BIG:43, BLUE_BIG:12 }, Math.random);
  if (cz.key === "baba") {
    cz.babaWillSucceed = true;
    cz.babaSegmentGame = 0;
    cz.gamesLeft = cz.games;
    cz.babaSandwichSchedule = [1,2,3].slice(0, 3 - cz.babaSandwichHits);
  } else {
    cz.successGame = Math.min(cz.successGame || cz.games, cz.games - cz.gamesLeft + 1);
    if (cz.heldAward) cz.heldAward = {kind:"bonus", type:cz.ceilingBonusType};
  }
}

function ensureCzTypeStats(key) {
  if (!state.stats) {
    return null;
  }
  if (!state.stats.czByType) {
    state.stats.czByType = {};
  }
  if (!state.stats.czByType[key]) {
    state.stats.czByType[key] = { entries: 0, successes: 0, fails: 0 };
  }
  return state.stats.czByType[key];
}

function recordCzResult(key, result) {
  const typeStats = ensureCzTypeStats(key);
  if (!typeStats) {
    return;
  }
  typeStats[result] += 1;
}

function resolveCZSuccess() {
  if (!state.cz) return;
  state.stats.czSuccesses += 1;
  recordCzResult(state.cz.key, "successes");
  awardBonusFromCZ();
}

function createBabaSandwichSchedule(successful, games) {
  if (successful) {
    return [
      randomInt(1, Math.min(2, games)),
      randomInt(3, Math.min(5, games)),
      randomInt(6, games),
    ];
  }

  const targetHits = sampleWeighted([
    { value: 0, weight: 8 },
    { value: 1, weight: 30 },
    { value: 2, weight: 62 },
  ]).value;
  if (targetHits === 0) return [];
  if (targetHits === 1) return [randomInt(1, Math.min(5, games))];
  return [randomInt(1, Math.min(3, games)), randomInt(4, Math.min(7, games))];
}

function enterCZ(czKey, options = {}) {
  if (state.mode === "bonus" && !options.fromBonusEnd) {
    logEvent("BONUS中のCZ移行は無効", "rare");
    return;
  }

  const key = ["unko","baba","shibaku"].includes(czKey) ? czKey : "shibaku";
  const upper = false;
  const promoted = false;

  const def = CZ_TABLE[key];
  const successful = ui.debugCzGuaranteed || chance(def.successRate);
  if (!state.internalRoleKey) setRoleLayout("miss");

  state.mode = "cz";
  state.bt = null;
  state.bonus = null;
  state.bonusReady = null;
  if (state.stats) {
    state.stats.czEntries += 1;
  }
  const czTypeStats = ensureCzTypeStats(key);
  if (czTypeStats) {
    czTypeStats.entries += 1;
  }
  state.cz = {
    key,
    name: def.name,
    upper,
    promoted,
    games: def.games,
    gamesLeft: def.games,
    successRate: def.successRate,
    successGame: key === "baba" ? null : successful ? randomInt(1, def.games) : null,
    postBigReturnHigh: Boolean(options.postBigReturnHigh),
    babaWillSucceed: key === "baba" ? successful : null,
    babaSandwichHits: 0,
    babaSandwichHitThisGame: false,
    babaSandwichSchedule: key === "baba" ? createBabaSandwichSchedule(successful, def.games) : [],
    babaSegmentGame: 0,
    babaGamesLeftAtLeverOn: null,
  };
  if (options.ceiling) armCeilingCZ();
  state.bgm = upper ? "巨万の富" : def.name;
  state.stage = upper || promoted ? "クラブのラウンジ" : "同人音楽即売会";
  showBanner(promoted ? `CZ昇格で${def.name}` : `${def.name} 突入`, upper || promoted ? "hit" : "accent");
  logEvent(promoted ? `通常CZの2%昇格で${def.name}へ` : `${def.name}に突入`, upper || promoted ? "hit" : "");
}

function lowCzWeight() {
  const setting = state.actualSetting || 3;
  return Math.max(10, 22 - setting * 2);
}

function selectNormalCZ() {
  return BT.draw({unko:50,baba:35,shibaku:15}, Math.random);
}

function selectReturnHighCZ() {
  return sampleWeighted([
    { value: "shibaku", weight: 88 },
    { value: "baba", weight: 10 },
    { value: "unko", weight: 2 },
  ]).value;
}

function randomBonusType() {
  return BT.draw({RED_BIG:43,BLUE_BIG:12,REG:45}, Math.random);
}

function randomBigBonusType() {
  return chance(0.5) ? "RED_BIG" : "BLUE_BIG";
}

function bonusAtRate(type) {
  const scale = settingProfile().bonusAt;
  if (type === "REG") {
    return 0.002;
  }

  const base = type === "BLUE_BIG" ? randomInt(45, 80) : randomInt(35, 65);
  return Math.min(0.16, (base / 1000) * scale);
}

function bonusRoleKey(type) {
  return type === "REG" || type === "GOLD_REG" ? "reg" : type === "BLUE_BIG" ? "blueBig" : "big";
}

function bonusDisplayName(type) {
  return type === "GOLD_REG" ? "GOLD REG BONUS" : type === "REG" ? "REG BONUS" : type === "BLUE_BIG" ? "青BIG BONUS" : "赤BIG BONUS";
}

function enterBonus(type, trigger, options = {}) {
  type = BT.promote(type, state.regStreak);
  const isReg = type === "REG";
  const hitGame = state.currentGames;
  state.regStreak = BT.nextStreak(type, state.regStreak);
  resetNormalCycle();
  state.stats[isReg ? "regHits" : "bigHits"] += 1;
  if (!options.preserveReels) setRoleLayout(bonusRoleKey(type), {lineIndex:1});
  state.mode = "bonus";
  state.cz = null;
  state.bt = null;
  state.btView = null;
  state.bonusReady = null;
  clearPushNavi();
  const maxCoins = BT.limits[type];
  state.bonus = {
    type, hitGame, games:Math.ceil(maxCoins/6), gamesLeft:Math.ceil(maxCoins/6),
    coins:0, lastPayout:0, maxCoins, atGame:null, pendingAt:false,
    vStock:0, vStockQueue:[], musicType:type, song:BONUS_MUSIC[type].label
  };
  state.bgm = state.bonus.song;
  state.stage = "クラブのラウンジ";
  showBanner(type === "GOLD_REG" ? "GOLD REG BONUS" : isReg ? "REG BONUS確定" : "BIG BONUS確定", "hit");
  logEvent(bonusDisplayName(type), "hit");
}

function enterBonusReady(type, trigger = "BONUS確定") {
  type = BT.promote(type, state.regStreak);
  state.bt = null;
  const fromReturnHigh = state.bonusReturnHighGames > 0 || Boolean(state.cz?.postBigReturnHigh);
  state.mode = "bonusReady";
  state.cz = null;
  state.bonus = null;
  state.bonusReady = {
    type,
    trigger,
    fromReturnHigh,
    attempts: 0,
    lastResult: "waiting",
  };
  clearPushNavi();
  state.bgm = "BONUS確定";
  state.stage = "クラブのラウンジ";
  showBanner("BONUS確定", "hit");
  logEvent("BONUS確定", "hit");
}

function enterAT(ura = false, options = {}) {
  if (!options.preserveReels) {
    setRoleLayout("assistBar", { lineIndex: 1 });
  }
  state.mode = "at";
  state.roleStreak = 0;
  const tuning = ura ? BOOST_TUNING.upper : BOOST_TUNING.normal;
  state.at = {
    ura,
    rounds: options.rounds ?? (ura ? 4 : 3),
    currentRoundGame: 0,
    totalAtGames: 0,
    gainMin: tuning.gainMin,
    gainMax: tuning.gainMax,
    endingDelta: tuning.endingDelta,
    coins: 0,
    lastPayout: 0,
    tamaCount: 0,
  };
  state.bgm = BONUS_MUSIC.BOOST.label;
  state.stage = "クラブのラウンジ";
  state.bonus = null;
  state.cz = null;
  showBanner(options.banner || `${ura ? "開開米ブースト" : "開米ブースト"} 突入`, "hit");
  logEvent(options.log || `${ura ? "裏上位AT" : "開米ブースト"}に突入`, "hit");
}

function tamaSuccessRate(wasLastRound) {
  if (state.at?.ura) {
    return wasLastRound ? 0.70 : 0.40;
  }
  return wasLastRound ? 0.50 : 0.30;
}

function selectTamaTriggerStep() {
  return sampleWeighted(
    Array.from({ length: 12 }, (_, step) => ({
      value: step,
      weight: 2 ** Math.floor(step / 4),
    })),
  ).value;
}

function enterTama({ wasLastRound = false } = {}) {
  if (!state.at) return;
  const successRate = tamaSuccessRate(wasLastRound);
  const willAcquire = chance(successRate);
  state.mode = "tama";
  clearPushNavi();
  state.tama = {
    games: 3,
    gamesLeft: 3,
    currentGame: 0,
    currentOpportunityBase: null,
    wasLastRound,
    successRate,
    willAcquire,
    triggerStep: willAcquire ? selectTamaTriggerStep() : null,
    acquired: false,
    pendingResolution: false,
  };
  showBanner("玉チャレンジ 3G", "accent");
  logEvent("ラウンド終了 -> 玉チャレンジ3Gに突入", "hit");
}

function startAtReturnMusic() {
  const current = ui.musicElements.get("AT_RETURN");
  if (current) {
    current.pause();
    current.currentTime = 0;
  }
  ui.musicType = null;
  ui.atReturnMusicActive = true;
  state.bgm = BONUS_MUSIC.AT_RETURN.label;
}

function finishTamaChallenge() {
  if (!state.tama || !state.at) return;
  const wasFinalRound = state.at.rounds <= 0;
  const acquired = state.tama.acquired;
  if (acquired) {
    state.at.rounds += 1;
    state.at.tamaCount += 1;
    showBanner("玉獲得 +1R", "hit");
    logEvent("玉チャレンジ成功 -> 玉獲得 +1R", "hit");
  } else {
    showBanner("玉チャレンジ失敗", "warning");
    logEvent("玉チャレンジ3G終了 -> 玉獲得なし", "warning");
  }

  state.tama = null;
  // B3: a last-round award must not bypass the ending threshold via AT return.
  const endingDelta = state.at.endingDelta ?? state.endingTriggerDelta;
  if (wasFinalRound && state.at.coins >= endingDelta) {
    ui.atReturnMusicActive = false;
    enterEnding(endingDelta);
    return;
  }
  if (state.at.rounds > 0) {
    state.mode = "at";
    if (acquired) {
      startAtReturnMusic();
    } else {
      ui.atReturnMusicActive = false;
      state.bgm = BONUS_MUSIC.BOOST.label;
    }
    return;
  }

  ui.atReturnMusicActive = false;
  const endedBoostWasUpper = Boolean(state.at.ura);
  try489();
  // A2: ブースト終了後に at 情報が残留しないよう清算する（CZ/引き戻し中の「開米 0R」表示を防ぐ）
  state.at = null;
  if (state.route === "裏ルート" || !endedBoostWasUpper) {
    enterRevival({ upper: endedBoostWasUpper });
  } else {
    clearPushNavi();
    enterCZ("shibaku", { allowUpgrade: false });
    logEvent("開米ブースト終了 -> しばくでチャレンジ", "hit");
  }
}

function spinTama(force = null) {
  if (!state.tama || !state.at) {
    transitionToNormal();
    return;
  }
  clearBanner();
  clearPushNavi();
  state.totalGames += 1;
  state.sectionGames += 1;
  state.currentGames += 1;
  const roleKey = resolveBoostRole(force);
  const role = ROLE_DEFS[roleKey];
  if (roleKey === "bell") assignPushNavi("玉チャレンジベルナビ");
  const bellNetGain = randomInt(state.at.gainMin, state.at.gainMax);
  const payout = enhancedModePayout(roleKey, bellNetGain + 3);
  setSpinRole(roleKey, payout);
  state.tama.currentGame += 1;
  state.tama.gamesLeft = Math.max(0, state.tama.games - state.tama.currentGame);
  state.tama.currentOpportunityBase = (state.tama.currentGame - 1) * 4;
  state.tama.pendingResolution = state.tama.gamesLeft <= 0;
  showBanner(`玉チャレンジ ${state.tama.currentGame}/3G`, "accent");
  if (roleKey !== "miss" && roleKey !== "bell") logEvent(`玉チャレンジ中 ${role.name}成立`, role.rare !== "none" ? "rare" : "");
}

function enterEnding(crossedDelta = state.endingTriggerDelta) {
  state.lastEndingDelta = crossedDelta;
  state.mode = "ending";
  state.at = null;
  state.bonus = null;
  state.cz = null;
  state.revival = null;
  state.tama = null;
  state.bgm = "エンディング";
  state.stage = "クラブのラウンジ";
  showBanner(`BOOST獲得+${crossedDelta}枚到達`, "hit");
  logEvent(`BOOST獲得+${crossedDelta}枚到達 -> 裏ルート待機`, "hit");
}

function startUraRoute() {
  state.route = "裏ルート";
  resetForRoute();
  enterCZ("ura", { upper: true, fromNormal: false, allowUpgrade: false });
  state.bgm = "裏上位CZ";
  showBanner("裏上位CZへ", "hit");
  logEvent("有利区間リセット後に裏上位CZへ", "hit");
}

function enterRevival({ upper = true } = {}) {
  const overallHit = chance(0.22);
  if (!state.internalRoleKey) setRoleLayout("miss");
  state.mode = "revival";
  state.revival = {
    gamesLeft: 60,
    successGame: overallHit ? randomInt(1, 60) : null,
    upper,
  };
  state.stage = "同人音楽即売会";
  state.bgm = "60G引き戻し";
  showBanner("60G引き戻しゾーン", "accent");
  logEvent(`${upper ? "開開米" : "開米"}ブースト終了 -> 60G引き戻しへ`, "warning");
}

function try489() {
  if (state.premium489) {
    return;
  }

  if (state.actualSetting >= 4 && chance(0.012)) {
    state.premium489 = true;
    state.showActualSetting = true;
    showBanner("489枚OVER", "hit");
    logEvent("489枚OVER表示 -> 設定4・5・6確定", "hit");
  }
}

function symbolClass(symbol) {
  switch (symbol) {
    case "赤7":
      return "red7";
    case "青7":
      return "blue7";
    case "BAR":
      return "bar";
    case "ベル":
      return "bell";
    case "リプレイ":
      return "replay";
    case "スイカ":
      return "fruit watermelon";
    case "チェリー":
      return "fruit";
    default:
      return "";
  }
}

function createSymbolNode(symbol, isCenter = false) {
  const node = document.createElement("div");
  node.className = `symbol ${isCenter ? "center" : ""} ${symbolClass(symbol)}`.trim();
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", `${symbol}図柄`);

  const fallback = document.createElement("span");
  fallback.className = "symbol-fallback";
  fallback.textContent = symbol;
  node.appendChild(fallback);

  const assetPath = SYMBOL_ASSETS[symbol];
  if (!assetPath) {
    return node;
  }

  const image = document.createElement("img");
  image.className = "symbol-image";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.draggable = false;
  image.addEventListener("load", () => node.classList.add("has-image"), { once: true });
  image.addEventListener("error", () => node.classList.add("image-failed"), { once: true });
  image.src = assetPath;
  if (image.complete && image.naturalWidth > 0) {
    node.classList.add("has-image");
  }
  node.appendChild(image);
  return node;
}

function roleFromForce(force) {
  if (FORCED_ROLE_BY_ACTION[force]) {
    return FORCED_ROLE_BY_ACTION[force];
  }
  switch (force) {
    case "middleCherry":
      return "middleCherry";
    case "weakRare":
      return sampleWeighted([
        { value: "watermelon", weight: 45 },
        { value: "cherry", weight: 45 },
        { value: "watermelonChance", weight: 10 },
      ]).value;
    case "strongRare":
      return sampleWeighted([
        { value: "strongCherry", weight: 70 },
        { value: "chance", weight: 15 },
        { value: "watermelonChance", weight: 15 },
      ]).value;
    default:
      return "miss";
  }
}

function resolveNormalRole(force = null) {
  if (FORCED_ROLE_BY_ACTION[force] || force === "weakRare" || force === "strongRare") return roleFromForce(force);
  if (chance(1 / 16384)) return "middleCherry";
  return BT.draw(BT.normalWeights, Math.random);
}

function maybeTriggerMap() {
  const gate = activeMaps()
    .filter((map) => map.active && !state.consumedMaps.has(map.key) && state.normalGames >= map.game)
    .sort((a, b) => b.game - a.game)[0];

  if (!gate) {
    return false;
  }

  state.consumedMaps.add(gate.key);

  if (gate.key === "map-ceiling") {
    enterCZ("tenjo", { allowUpgrade: false });
    return true;
  }

  const baseRate = { weak: 0.040, medium: 0.064, strong: 0.105 }[gate.strength];
  state.mapCzHighGames = 30;
  state.mapCzHighRate = Math.min(0.28, baseRate * settingProfile().map);
  state.mapCzHighLabel = `${gate.game}G ${gate.label}`;
  state.mapCzHighStrength = gate.strength;
  updateStageFromRoadmap();
  logEvent(`${gate.game}G到達 ${gate.label}`, gate.strength === "strong" ? "rare" : "");
  return false;
}

function maybeTriggerBigBonusZone() {
  const zone = BIG_BONUS_ZONES
    .filter((item) => !state.consumedMaps.has(`big-zone-${item.game}`) && state.normalGames >= item.game)
    .sort((a, b) => b.game - a.game)[0];

  if (!zone) {
    return false;
  }

  state.consumedMaps.add(`big-zone-${zone.game}`);
  const rate = Math.min(0.18, zone.rate * settingProfile().map);
  logEvent(`${zone.game}G到達 ${zone.label}`, "rare");
  if (chance(rate)) {
    enterBonus(randomBigBonusType(), `${zone.game}G BIG専用ゾーン`);
    return true;
  }

  return false;
}

function maybeTriggerRare(roleKey) {
  const role = ROLE_DEFS[roleKey];
  if (!role) {
    return false;
  }

  if (role.rare === "weak") {
    if (czEntryChance(0.055, "weakRare")) {
      enterCZ("baba", { fromNormal: true });
      return true;
    }

    if (scaledChance(0.0025, "directBonus")) {
      enterBonus(randomBonusType(), `${role.name}直撃`);
      return true;
    }
  }

  if (role.rare === "strong") {
    if (roleKey === "barLine") {
      logEvent("BAR揃い -> CZ直行", "hit");
      enterCZ("shibaku", { fromNormal: true, allowUpgrade: false });
      return true;
    }

    let strongCzTriggered = false;
    if (roleKey === "strongCherry") {
      updateCzWave();
      updateLongWave();
      const ordinaryStrongRate = clampRate(
        0.13 * settingProfile().strongRare * state.czEntryWave.multiplier * state.longWave.czEntry,
      );
      // 6口のうち2口は、通常時BAR揃い廃止前のCZ直行分を強チェリーへ置換したもの。
      strongCzTriggered = chance((1 / 3) + (2 / 3) * ordinaryStrongRate);
    } else {
      strongCzTriggered = czEntryChance(0.13, "strongRare");
    }
    if (strongCzTriggered) {
      enterCZ("shibaku", { fromNormal: true });
      return true;
    }

    if (scaledChance(0.012, "directBonus")) {
      enterBonus(randomBonusType(), `${role.name}直撃`);
      return true;
    }
  }

  return false;
}

function spinNormal(force = null) {
  clearBanner();
  clearPushNavi();
  state.totalGames += 1;
  state.sectionGames += 1;
  state.normalGames += 1;
  state.currentGames += 1;
  state.stats.normalGames += 1;
  updateStageFromRoadmap();
  const roleKey = resolveNormalRole(force);
  const role = consumeCreditWithRole(roleKey);
  if (roleKey === "middleCherry") {
    state.guaranteedBlueRemaining = 3; // First BLUE_BIG plus three successors.
    enterBonus("BLUE_BIG", "中段チェリー", {preserveReels:true});
    return;
  }
  if (roleKey !== "miss") logEvent(role.name, role.rare !== "none" ? "rare" : "");
  if (state.currentGames >= BT.ceilingGames) enterCZ(selectNormalCZ(), {ceiling:true});
  else if (chance(1 / 2000)) enterBonusReady(randomBonusType(), "BONUS確定");
  else if (chance(BT.entryRate(state.actualSetting, roleKey))) enterCZ(selectNormalCZ(), {allowUpgrade:false});
}

function resolveBonusRole(force = null) {
  if (FORCED_ROLE_BY_ACTION[force] || force === "weakRare" || force === "strongRare") {
    return roleFromForce(force);
  }

  return sampleWeighted([
    { value: "miss", weight: 5 },
    { value: "bell", weight: 945 },
    { value: "replay", weight: 20 },
    { value: "watermelon", weight: 10 },
    { value: "cherry", weight: 7 },
    { value: "watermelonChance", weight: 4 },
    { value: "chance", weight: 3 },
    { value: "strongCherry", weight: 3 },
    { value: "barLine", weight: 3 },
  ]).value;
}

function resolveBoostRole(force = null) {
  if (FORCED_ROLE_BY_ACTION[force] || force === "weakRare" || force === "strongRare") {
    return roleFromForce(force);
  }
  return sampleWeighted([
    { value: "miss", weight: 20 },
    { value: "bell", weight: 903 },
    { value: "replay", weight: 40 },
    { value: "watermelon", weight: 15 },
    { value: "cherry", weight: 10 },
    { value: "watermelonChance", weight: 5 },
    { value: "chance", weight: 4 },
    { value: "barLine", weight: 3 },
  ]).value;
}

function resolveCzRole(force = null) {
  if (FORCED_ROLE_BY_ACTION[force] || force === "weakRare" || force === "strongRare") {
    return roleFromForce(force);
  }
  return sampleWeighted([
    { value: "miss", weight: 710 },
    { value: "replay", weight: 170 },
    { value: "bell", weight: 82 },
    { value: "watermelon", weight: 14 },
    { value: "cherry", weight: 11 },
    { value: "watermelonChance", weight: 3 },
    { value: "strongCherry", weight: 1 },
    { value: "barLine", weight: 1 },
    { value: "chance", weight: 2 },
  ]).value;
}

function awardBonusVStock(reason) {
  if (!state.bonus) {
    return;
  }

  const stockType = state.bonus.type === "REG"
    ? chance(0.20) ? "BLUE_BIG" : "RED_BIG"
    : state.bonus.type;
  state.bonus.vStock += 1;
  state.bonus.vStockQueue.push(stockType);
  state.vStockAwardedThisGame = true;
  state.vStockAwardedType = stockType;
  state.bonus.musicType = `${stockType}_V`;
  state.bonus.song = BONUS_MUSIC[state.bonus.musicType].label;
  state.bgm = state.bonus.song;
  logEvent(`${reason} -> Vストック獲得 (${bonusDisplayName(stockType)})`, "hit");
  showBanner(`V STOCK ${state.bonus.vStock}`, "hit");
}

function maybeAwardBonusVStock(roleKey) {
  if (!state.bonus) {
    return;
  }

  if (roleKey === "replay") {
    state.bonus.replayStreak += 1;
    if (state.bonus.replayStreak >= 5) {
      state.bonus.replayStreak = 0;
      awardBonusVStock("BONUS中リプレイ5連");
    }
    return;
  }

  state.bonus.replayStreak = 0;

  if (roleKey === "barLine") {
    awardBonusVStock("BONUS中BAR揃い");
  } else if (roleKey === "watermelonChance" && chance(0.1)) {
    awardBonusVStock("弱チャンス目10%");
  } else if ((roleKey === "chance" || roleKey === "strongCherry") && chance(0.25)) {
    awardBonusVStock("強チャンス目25%");
  }
}

function releaseBonusVStock() {
  if (!state.bonus || state.bonus.vStock <= 0) {
    return false;
  }

  const nextType = state.bonus.vStockQueue.shift() || randomBigBonusType();
  const remainingQueue = [...state.bonus.vStockQueue];
  const boostAfterStocks = state.bonus.boostAfterStocks || null;
  logEvent(`Vストック放出 -> ${bonusDisplayName(nextType)}`, "hit");
  enterBonus(nextType, "Vストック放出", { boostAfterStocks, preserveReels: true });
  state.bonus.musicType = `${nextType}_V`;
  state.bonus.song = BONUS_MUSIC[state.bonus.musicType].label;
  state.bgm = state.bonus.song;
  state.bonus.vStock = remainingQueue.length;
  state.bonus.vStockQueue = remainingQueue;
  return true;
}

function finalizeBonusPayoutThreshold() {
  if (!state.bonus || state.bonus.coins <= state.bonus.maxCoins) return;
  const type = state.bonus.type;
  if (state.guaranteedBlueRemaining > 0) {
    state.guaranteedBlueRemaining -= 1;
    enterBonusReady("BLUE_BIG", "BONUS確定");
  } else if (type === "REG") transitionToNormal("REG BONUS終了");
  else enterBT(type === "BLUE_BIG");
}

function enterBT(blue = false) {
  state.mode = "bt";
  state.bonus = null;
  state.bonusReady = null;
  state.cz = null;
  state.bt = {blue, misses:0, games:0, pendingResult:null, lastResult:null};
  state.btView = null;
  clearPushNavi();
  state.bgm = "BONUS TRIGGER";
  showBanner("BONUS TRIGGER", "hit");
}

function spinBT(force = null) {
  clearBanner();
  clearPushNavi();
  state.totalGames += 1;
  state.sectionGames += 1;
  state.currentGames += 1;
  state.bt.smallRole = resolveCzRole(force);
  consumeCreditWithRole(state.bt.smallRole);
  state.bt.games += 1;
  state.bt.pendingResult = BT.draw(BT.tables[state.bt.blue ? "blue" : "standard"], Math.random);
  configureBTReels();
}

function configureBTReels() {
  const bt = state.bt;
  const won = ["RED_BIG", "BLUE_BIG", "REG"].includes(bt.pendingResult);
  bt.bonusType = won ? BT.promote(bt.pendingResult, state.regStreak) : null;
  const role = won ? bonusRoleKey(bt.bonusType) : bt.smallRole;
  if (state.internalRoleKey !== role) setRoleLayout(role, won ? {lineIndex:1} : {});
  state.internalRoleKey = role;
  state.internalHit = cloneDisplayHit(state.lastHit);
  state.pendingPayout.internalRoleKey = role;
  state.pendingPayout.intendedPayout = won ? 0 : ROLE_DEFS[role].payout;
  bt.teaseSymbol = bt.pendingResult === "miss" && role === "miss" && chance(.35)
    ? (chance(.5) ? "赤7" : "青7") : null;
}

function settleBTResult() {
  const bt = state.bt;
  const result = bt.pendingResult;
  const next = BT.advance(bt.misses, result);
  bt.pendingResult = null;
  bt.misses = next.misses;
  bt.lastResult = result;
  state.btView = {misses:next.misses, result, rolling:false};
  if (next.bonus) enterBonus(bt.bonusType, "BONUS TRIGGER", {preserveReels:true});
  else if (next.ended) {
    transitionToNormal();
    state.btView = {misses:3, result:"end", rolling:false};
  }
}

function finalizeAtPayoutAndRound() {
  if (!state.at || state.mode !== "at") return;
  const endingDelta = state.at.endingDelta ?? state.endingTriggerDelta;
  if (state.at.coins >= endingDelta) {
    enterEnding(endingDelta);
    return;
  }
  if (state.at.currentRoundGame >= 10) {
    state.at.currentRoundGame = 0;
    state.at.rounds -= 1;
    enterTama({ wasLastRound: state.at.rounds <= 0 });
  }
}

function settleDisplayedPayout(afterState, pending) {
  const settlement = afterState.pendingPayout;
  if (!settlement) {
    afterState.lastHit = cloneDisplayHit(afterState.displayHit);
    return afterState;
  }

  const displayedRoleKey = controlCatalogKey(afterState.displayRoleKey || afterState.displayHit?.roleKey || "miss");
  const displayedPayout = displayedRoleKey === controlCatalogKey(settlement.internalRoleKey)
    ? settlement.intendedPayout
    : displayedRoleKey === "miss"
      ? 0
      : ROLE_DEFS[displayedRoleKey]?.payout ?? 0;
  const previousState = state;
  state = afterState;
  addCoins(displayedPayout);

  if (
    settlement.originMode === "bonus"
    && state.mode === "bonus"
    && state.bonus?.type === settlement.originBonusType
  ) {
    state.bonus.coins += displayedPayout - 3;
    state.bonus.lastPayout = displayedPayout;
    finalizeBonusPayoutThreshold();
  } else if ((settlement.originMode === "at" || settlement.originMode === "tama") && state.at) {
    state.at.coins += displayedPayout - 3;
    state.at.lastPayout = displayedPayout;
    if (settlement.originMode === "at") finalizeAtPayoutAndRound();
  }

  state.lastHit = cloneDisplayHit(state.displayHit);
  state.settledPayout = displayedPayout;
  state.pendingPayout = null;
  const settledState = snapshotState(state);
  state = previousState;
  document.documentElement.dataset.lastPayoutSettlement = JSON.stringify({
    internalRoleKey: settlement.internalRoleKey,
    displayRoleKey: displayedRoleKey,
    missedRoleKey: afterState.displayMissedRole,
    payout: displayedPayout,
    at: Date.now(),
  });
  return settledState;
}

function spinBabaCZ(force = null) {
  clearBanner();
  clearPushNavi();
  state.totalGames += 1;
  state.sectionGames += 1;
  state.currentGames += 1;
  state.cz.babaGamesLeftAtLeverOn = state.cz.gamesLeft;
  state.cz.gamesLeft -= 1;
  state.cz.babaSegmentGame = (state.cz.babaSegmentGame || 0) + 1;
  state.cz.babaSandwichHitThisGame = false;

  const roleKey = resolveCzRole(force);
  const role = consumeCreditWithRole(roleKey);
  const step = state.cz.babaSegmentGame;

  if (roleKey !== "miss") {
    logEvent(`${role.name}成立`, role.rare !== "none" ? "rare" : "");
  }


  if (state.cz.babaSandwichSchedule[0] === step) {
    state.cz.babaSandwichSchedule.shift();
    setRoleLayout("babaSandwich");
    state.cz.babaSandwichHits += 1;
    state.cz.babaSandwichHitThisGame = true;
    state.cz.gamesLeft = state.cz.games;
    state.cz.babaSegmentGame = 0;
    showBanner(`BAR挟み目 ${state.cz.babaSandwichHits}/3`, "hit");
    logEvent(`BAR・リプレイ・BAR停止 ${state.cz.babaSandwichHits}/3`, "hit");
  } else {
    showBanner(`BAR・リプレイ・BARを狙え ${state.cz.babaSandwichHits}/3`, "accent");
  }

  if (state.cz.babaSandwichHits >= 3) {
    return;
  }

  if (state.cz.gamesLeft <= 0) {
    if (state.stats) state.stats.czFails += 1;
    recordCzResult("baba", "fails");
    transitionToNormal(`ババア臭チャレンジ ${state.cz.babaSandwichHits}/3失敗 -> 通常へ`);
  }
}

function spinCZ(force = null) {
  if (!state.cz) {
    transitionToNormal();
    return;
  }

  if (state.currentGames + 1 >= BT.ceilingGames) armCeilingCZ();
  if (state.cz.key === "baba") {
    spinBabaCZ(force);
    return;
  }
  if (state.cz.key === "shibaku") {
    spinShibakuBattle(force);
    return;
  }

  clearBanner();
  clearPushNavi();
  state.totalGames += 1;
  state.sectionGames += 1;
  state.currentGames += 1;
  state.cz.gamesLeft -= 1;

  const roleKey = resolveCzRole(force);
  const role = consumeCreditWithRole(roleKey);
  const step = state.cz.games - state.cz.gamesLeft;

  if (roleKey !== "miss") {
    logEvent(`${role.name}成立`, role.rare !== "none" ? "rare" : "");
  }


  if (state.cz.successGame && step >= state.cz.successGame) {
    resolveCZSuccess();
    return;
  }

  // Resolve the bell rewrite against the line actually stopped by the player.
  state.cz.bellRewritePending = false;
  state.cz.failurePending = state.cz.gamesLeft <= 0;
  if (state.cz.failurePending) return;
  showBanner(`${state.cz.name} 残り${state.cz.gamesLeft}G`, "accent");
}

function failCZ() {
  if (!state.cz) return;
  state.stats.czFails += 1;
  recordCzResult(state.cz.key, "fails");
  transitionToNormal();
}

// PRIVATE_SPEC: awards are held, not redrawn by PUSH or presentation timing.
function spinShibakuBattle(force = null) {
  const cz = state.cz;
  if (cz.pushPending) return;
  clearBanner();
  clearPushNavi();
  state.totalGames += 1;
  state.sectionGames += 1;
  state.currentGames += 1;
  cz.gamesLeft = Math.max(0, cz.gamesLeft - 1);
  const roleKey = resolveCzRole(force);
  consumeCreditWithRole(roleKey);
  if (!cz.heldAward && cz.successGame && cz.games - cz.gamesLeft >= cz.successGame) {
    cz.heldAward = {kind:"bonus", type:cz.ceilingBonusType || randomBonusType()};
  }
  cz.lastBattleRole = roleKey;
}

// 最終G終了 -> 溜め(pushCharge) -> 決定音と同時にPUSH。溜め中はPUSHを受け付けない。
async function chargeBattlePush() {
  const cz = state.cz;
  const generation = ui.operationGeneration;
  ui.battleCharging = true;
  renderInteractivity();
  try {
    await window.ShibakuEffects?.battleCharge?.({ won: Boolean(cz.heldAward) });
  } finally {
    if (generation === ui.operationGeneration && state.cz === cz) {
      ui.battleCharging = false;
      renderInteractivity();
    }
  }
}

async function revealBattlePush() {
  const cz = state.cz;
  if (state.mode !== "cz" || cz?.key !== "shibaku" || !cz.pushPending || ui.battleRevealing || ui.battleCharging) return;
  const generation = ui.operationGeneration;
  ui.battleRevealing = true;
  renderInteractivity();
  const won = Boolean(cz.heldAward);
  // 4: a beat of silence between the press and the answer.
  if (!ui.debugFast) {
    stopAllSoundEffects();
    await window.ShibakuEffects?.silenceBeat?.(380);
    if (generation !== ui.operationGeneration || state.cz !== cz) return;
  }
  // C9: 勝利時の一部は、一度ガラスにヒビが入ってから割れて逆転する(演出側の抽選)。
  const revival = !ui.debugFast && won && Boolean(window.ShibakuEffects?.battleRevivalRoll?.());
  if (revival) {
    await window.ShibakuEffects.battleRevival();
    if (generation !== ui.operationGeneration || state.cz !== cz) return;
  }
  window.ShibakuEffects?.battleReveal?.(won, { revival });
  const revealSound = playSoundEffect(won ? "ichikaku" : "challengeFail");
  if (!won) ui.battleFailureSound = revealSound;
  if (!ui.debugFast) await sleep(won ? 1400 : 650);
  if (generation !== ui.operationGeneration || state.cz !== cz) return;
  const before = snapshotState(state);
  if (won) {
    state.stats.czSuccesses += 1;
    recordCzResult("shibaku", "successes");
    enterBonusReady(cz.heldAward.type, "しばくでチャレンジ勝利");
  } else {
    failCZ();
    // Reuse the established held failure + next-SPIN fade lifecycle.
    ui.challengeFailure = { sound: null, name: cz.name, startedAt: Date.now() };
  }
  ui.battleRevealing = false;
  ui.czFailedThisGame = !won;
  window.ShibakuEffects?.battleEnd?.(!won);
  render();
  playTransitionSounds(before, state);
  if (!won) {
    ui.challengeFailure.sound = ui.battleFailureSound;
    window.ShibakuEffects?.challengeFailed(cz.name, state);
  } else window.ShibakuEffects?.transition(before, state);
  ui.battleWaitResolver?.();
  ui.battleWaitResolver = null;
  ui.battleWaitPromise = null;
}

function spinBonus(force = null) {
  if (!state.bonus) {
    transitionToNormal();
    return;
  }

  clearBanner();
  clearPushNavi();
  state.vStockAwardedThisGame = false;
  state.vStockAwardedType = null;
  state.boostConfirmedThisGame = false;
  state.totalGames += 1;
  state.sectionGames += 1;
  state.bonus.gamesLeft = Math.max(0, state.bonus.gamesLeft - 1);

  const roleKey = resolveBonusRole(force);
  const role = ROLE_DEFS[roleKey];
  if (roleKey === "bell") {
    assignPushNavi("BONUSベルナビ");
  }
  const payout = enhancedModePayout(roleKey, 9);
  setSpinRole(roleKey, payout);

  if (roleKey !== "miss" && roleKey !== "bell") {
    logEvent(`BONUS中 ${role.name}成立`, role.rare !== "none" ? "rare" : "");
  }
  showBanner(`BONUS ${state.bonus.coins}/${state.bonus.maxCoins}枚`, "accent");

}

function spinBonusReady() {
  if (!state.bonusReady) {
    transitionToNormal();
    return;
  }

  clearBanner();
  clearPushNavi();
  state.bonusReady.attempts += 1;
  state.bonusReady.lastResult = "spinning";
  setRoleLayout(bonusRoleKey(state.bonusReady.type), { lineIndex: 1 });
  showBanner("BONUS確定", "hit");
}

function spinAT(force = null) {
  if (!state.at) {
    transitionToNormal();
    return;
  }

  clearBanner();
  clearPushNavi();
  state.totalGames += 1;
  state.sectionGames += 1;
  state.currentGames += 1;

  const roleKey = resolveBoostRole(force);
  const role = ROLE_DEFS[roleKey];
  if (roleKey === "bell") {
    assignPushNavi("BOOSTベルナビ");
  }
  const bellNetGain = randomInt(state.at.gainMin, state.at.gainMax);
  const payout = enhancedModePayout(roleKey, bellNetGain + 3);
  state.at.currentRoundGame += 1;
  state.at.totalAtGames += 1;

  setSpinRole(roleKey, payout);
  if (roleKey !== "miss" && roleKey !== "bell") {
    logEvent(`BOOST中 ${role.name}成立`, role.rare !== "none" ? "rare" : "");
  }

  showBanner(`${state.at.ura ? "開開米" : "開米"} 残り${state.at.rounds}R`, "accent");
}

function spinRevival(force = null) {
  if (!state.revival) {
    transitionToNormal();
    return;
  }

  clearBanner();
  state.totalGames += 1;
  state.sectionGames += 1;
  state.currentGames += 1;
  state.revival.gamesLeft -= 1;

  const roleKey = resolveNormalRole(force);
  consumeCreditWithRole(roleKey);
  const step = 60 - state.revival.gamesLeft;

  if (roleKey === "middleCherry") {
    state.roleStreak = 0;
    logEvent("引き戻し中 左リール中段チェリー -> ロングフリーズ", "hit");
    enterBonus("BLUE_BIG", "引き戻し中段チェリー ロングフリーズ", {
      preserveReels: true,
      afterBonusUpperAt: true,
    });
    showBanner("ロングフリーズ 青7 BIG BONUS確定", "hit");
    return;
  }

  if (state.revival.successGame && step >= state.revival.successGame) {
    const returnToUpper = Boolean(state.revival.upper);
    logEvent(`ステップアップ告知成功 -> ${returnToUpper ? "開開米" : "開米"}ブースト復帰`, "hit");
    enterAT(returnToUpper);
    return;
  }

  if (state.revival.gamesLeft <= 0) {
    state.route = "通常ルート";
    transitionToNormal("60G引き戻し失敗 -> 通常へ");
    return;
  }

  if (step === 20 || step === 40 || step === 55) {
    logEvent(`第${step === 20 ? 1 : step === 40 ? 2 : 3}停止まで煽りが進行`, "rare");
  }

  showBanner(`60G引き戻し 残り${state.revival.gamesLeft}G`, "accent");
}

function executeGameStep(force = null) {
  state.btView = null;
  state.vStockAwardedThisGame = false;
  state.vStockAwardedType = null;
  state.boostConfirmedThisGame = false;
  state.returnHighAtLeverOn = false;
  state.internalRoleKey = null;
  state.internalHit = null;
  state.presentationRoleKey = null;
  state.displayRoleKey = null;
  state.displayMissedRole = null;
  state.pendingPayout = null;
  if (force) {
    handleForce(force);
    return;
  }

  switch (state.mode) {
    case "normal":
      spinNormal();
      break;
    case "cz":
      spinCZ();
      break;
    case "bonus":
      spinBonus();
      break;
    case "bt":
      spinBT();
      break;
    case "bonusReady":
      spinBonusReady();
      break;
    case "at":
      spinAT();
      break;
    case "tama":
      spinTama(force);
      break;
    case "ending":
      startUraRoute();
      break;
    case "revival":
      spinRevival();
      break;
    default:
      transitionToNormal();
  }
}

async function unlockAudio() {
  if (!ui.soundEnabled) {
    return;
  }

  // ユーザー操作の同期区間内でHTMLAudioを起動し、自動再生制限を解除する。
  primeBonusMusic();
  primeSoundEffects();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx) {
    if (!ui.audioContext) {
      ui.audioContext = new AudioCtx();
    }
    if (ui.audioContext.state === "suspended") {
      try {
        await ui.audioContext.resume();
      } catch {
        // BGMはHTMLAudioで継続し、Web AudioのSEのみ無効にする。
      }
    }
  }
}

function ensureBonusMusicElements() {
  for (const [type, config] of Object.entries(BONUS_MUSIC)) {
    if (ui.musicElements.has(type)) {
      continue;
    }
    const audio = new Audio(config.url);
    audio.preload = "auto";
    audio.loop = config.loop ?? true;
    audio.volume = currentMusicGain();
    audio.playsInline = true;
    ui.musicElements.set(type, audio);
  }
}

// Read-only presentation clock: lets the LCD pulse with the BGM that is
// already audible. Never touches audio routing or game state.
window.ShibakuMusicClock = () => {
  const audio = ui.musicType ? ui.musicElements.get(ui.musicType) : null;
  if (!audio || audio.paused) return null;
  return { track: BONUS_MUSIC[ui.musicType].url.split("/").pop().split("?")[0], time: audio.currentTime };
};

function ensureSoundEffectElements() {
  for (const [key, config] of Object.entries(SOUND_EFFECTS)) {
    if (ui.sfxElements.has(key)) {
      continue;
    }
    const audio = new Audio(config.url);
    audio.preload = "auto";
    audio.playsInline = true;
    ui.sfxElements.set(key, audio);
  }
}

function primeSoundEffects() {
  ensureSoundEffectElements();
  if (ui.sfxPrimed) {
    return;
  }
  ui.sfxPrimed = true;
  for (const audio of ui.sfxElements.values()) {
    audio.muted = true;
    const playAttempt = audio.play();
    if (!playAttempt) {
      continue;
    }
    playAttempt.then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }).catch(() => {
      audio.muted = false;
      ui.sfxPrimed = false;
    });
  }
}

function playSoundEffect(key, volumeScale = 1) {
  if (!ui.soundEnabled) {
    return null;
  }
  ensureSoundEffectElements();
  const base = ui.sfxElements.get(key);
  const config = SOUND_EFFECTS[key];
  if (!base || !config) {
    return null;
  }
  const maxConcurrent = config.maxConcurrent ?? SFX_MAX_CONCURRENT_PER_KEY;
  const activeForKey = [...ui.activeSfx].filter((active) => active.slotKey === key).length;
  if (activeForKey >= maxConcurrent) {
    return null;
  }

  const sound = base.cloneNode(true);
  sound.slotKey = key;
  const auditKey = `sfx${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  sound.slotGainScale = config.gain * volumeScale;
  sound.slotMixer = config.mixer || "sound";
  const mixerGain = sound.slotMixer === "music" ? currentMusicGain() : ui.soundVolume;
  sound.volume = Math.max(0, Math.min(1, mixerGain * sound.slotGainScale));
  sound.currentTime = 0;
  document.documentElement.dataset.lastSfx = JSON.stringify({ key, volume: sound.volume, at: Date.now() });
  ui.activeSfx.add(sound);
  const release = () => ui.activeSfx.delete(sound);
  sound.addEventListener("ended", release, { once: true });
  sound.addEventListener("error", release, { once: true });
  const playAttempt = sound.play();
  if (playAttempt) {
    playAttempt.then(() => {
      const audit = JSON.stringify({ key, playing: !sound.paused, at: Date.now() });
      document.documentElement.dataset.lastSfxPlayback = audit;
      document.documentElement.dataset[auditKey] = audit;
    }).catch((error) => {
      const audit = JSON.stringify({ key, playing: false, error: error.name, at: Date.now() });
      document.documentElement.dataset.lastSfxPlayback = audit;
      document.documentElement.dataset[auditKey] = audit;
      release();
    });
  }
  return sound;
}

function fadeOutSound(sound, { delayMs = 0, durationMs = 900, auditKey = "sound" } = {}) {
  if (!sound) {
    return;
  }
  window.setTimeout(() => {
    if (sound.paused || !ui.activeSfx.has(sound)) {
      return;
    }
    const initialVolume = sound.volume;
    const startedAt = performance.now();
    document.documentElement.dataset[`${auditKey}Fade`] = JSON.stringify({
      phase: "start",
      delayMs,
      durationMs,
      at: Date.now(),
    });
    const step = (now) => {
      if (sound.paused || !ui.activeSfx.has(sound)) {
        return;
      }
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      sound.volume = initialVolume * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      sound.pause();
      sound.currentTime = 0;
      ui.activeSfx.delete(sound);
      document.documentElement.dataset[`${auditKey}Fade`] = JSON.stringify({
        phase: "complete",
        delayMs,
        durationMs,
        at: Date.now(),
      });
    };
    requestAnimationFrame(step);
  }, delayMs);
}

function playBellPayoutEffect() {
  const config = SOUND_EFFECTS.payout;
  const holdAfterSoundMs = 400;
  const estimatedDurationMs = config.durationMs + holdAfterSoundMs;
  if (ui.payoutSound) {
    ui.payoutSound.pause();
    ui.activeSfx.delete(ui.payoutSound);
  }
  const sound = playSoundEffect("payout");
  ui.payoutSound = sound;
  const machineWindow = dom.machineWindow;
  const effectToken = ++ui.payoutEffectToken;
  let cleaned = false;
  let releaseTimer = null;

  const cleanup = () => {
    if (cleaned || effectToken !== ui.payoutEffectToken) return;
    cleaned = true;
    if (releaseTimer) window.clearTimeout(releaseTimer);
    machineWindow?.classList.remove("bell-payout-flash");
    if (ui.payoutSound === sound) ui.payoutSound = null;
    document.documentElement.dataset.payoutEffect = JSON.stringify({
      active: false,
      stoppedAt: Date.now(),
      holdAfterSoundMs,
    });
  };
  const finishAfterHold = () => {
    if (cleaned || releaseTimer) return;
    releaseTimer = window.setTimeout(cleanup, holdAfterSoundMs);
  };

  machineWindow?.classList.remove("bell-payout-flash");
  // 同じクラスの連続付与でもアニメーションを確実に先頭から再開する。
  void machineWindow?.offsetWidth;
  machineWindow?.classList.add("bell-payout-flash");
  document.documentElement.dataset.payoutEffect = JSON.stringify({
    active: true,
    blinkIntervalMs: 300,
    holdAfterSoundMs,
    estimatedDurationMs,
    startedAt: Date.now(),
  });

  if (sound) {
    sound.addEventListener("ended", finishAfterHold, { once: true });
    sound.addEventListener("error", finishAfterHold, { once: true });
  } else {
    window.setTimeout(finishAfterHold, config.durationMs);
  }
  window.setTimeout(cleanup, estimatedDurationMs + 300);
}

function dismissChallengeFailure() {
  if (!ui.challengeFailure) {
    return;
  }
  const failure = ui.challengeFailure;
  ui.challengeFailure = null;
  window.ShibakuEffects?.clearChallengeFailure(state);
  fadeOutSound(failure.sound, {
    durationMs: 900,
    auditKey: "challengeFail",
  });
  document.documentElement.dataset.challengeResultDismissed = JSON.stringify({
    result: "dismissed-on-spin",
    at: Date.now(),
  });
}

function stopAllSoundEffects() {
  window.ShibakuFx?.stopAll();
  for (const sound of ui.activeSfx) {
    sound.pause();
    sound.currentTime = 0;
  }
  ui.activeSfx.clear();
}

function currentMusicGain() {
  return Math.max(0, Math.min(1, BONUS_MUSIC_GAIN * ui.musicVolume));
}

function musicTrackGain(type) {
  return Math.min(1, currentMusicGain() * 10 ** ((BONUS_MUSIC[type]?.gainDb || 0) / 20));
}

function currentMusicGainDb() {
  const gain = currentMusicGain();
  return gain > 0 ? Number((20 * Math.log10(gain)).toFixed(2)) : -Infinity;
}

function applySoundVolumeLevel(level) {
  ui.soundVolumeLevel = Math.max(1, Math.min(VOLUME_LEVEL_MAX, Number(level) || 1));
  ui.soundVolume = ui.soundVolumeLevel / VOLUME_LEVEL_MAX;
  for (const sound of ui.activeSfx) {
    if (sound.slotMixer === "music") continue;
    const gainScale = Number(sound.slotGainScale) || 1;
    sound.volume = Math.max(0, Math.min(1, ui.soundVolume * gainScale));
  }
}

function applyMusicVolumeLevel(level) {
  ui.musicVolumeLevel = Math.max(1, Math.min(VOLUME_LEVEL_MAX, Number(level) || 1));
  ui.musicVolume = ui.musicVolumeLevel / VOLUME_LEVEL_MAX;
  const gain = currentMusicGain();
  for (const [type, audio] of ui.musicElements) {
    audio.volume = musicTrackGain(type);
  }
  for (const sound of ui.activeSfx) {
    if (sound.slotMixer !== "music") continue;
    const gainScale = Number(sound.slotGainScale) || 1;
    sound.volume = Math.max(0, Math.min(1, gain * gainScale));
  }
  document.documentElement.dataset.bgmVolume = JSON.stringify({
    level: ui.musicVolumeLevel,
    levels: VOLUME_LEVEL_MAX,
    gain,
    gainDb: currentMusicGainDb(),
  });
}

function primeBonusMusic() {
  ensureBonusMusicElements();
  if (ui.musicPrimed) {
    return;
  }
  ui.musicPrimed = true;
  for (const audio of ui.musicElements.values()) {
    audio.muted = true;
    const playAttempt = audio.play();
    if (playAttempt) {
      playAttempt
        .then(() => {
          if (ui.musicType && ui.musicElements.get(ui.musicType) === audio) {
            audio.muted = false;
            return;
          }
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          audio.muted = false;
          ui.musicPrimed = false;
        });
    }
  }
}

function stopBonusMusic() {
  for (const audio of ui.musicElements.values()) {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = currentMusicGain();
  }
  ui.musicType = null;
  document.documentElement.dataset.bonusMusic = JSON.stringify({
    playing: false,
    level: ui.musicVolumeLevel,
    gainDb: currentMusicGainDb(),
  });
}

function syncBonusMusic() {
  if (ui.atReturnMusicActive && state.mode !== "at" && state.mode !== "tama") {
    ui.atReturnMusicActive = false;
  }
  const babaFinalStopped = ui.pendingSpin?.presentationRoleKey === "babaSandwich"
    && ui.pendingSpin.afterState.cz?.babaSandwichHits >= 3 && !ui.spinningReels[0];
  const desiredType = ui.tamaFreezeActive || state.cz?.pushPending || ui.battleRevealing || babaFinalStopped
    ? null
    : ui.atReturnMusicActive && (state.mode === "at" || state.mode === "tama")
    ? "AT_RETURN"
    : state.mode === "bonus"
    ? state.bonus?.musicType || state.bonus?.type || null
    : state.mode === "bt"
      ? "BT"
    : state.mode === "at" || state.mode === "tama"
      ? "BOOST"
      : state.mode === "cz"
        ? ({ baba: "CZ_BABA", shibaku: "CZ_SHIBAKU", unko: "CZ_UNKO" }[state.cz?.key] || null)
      : null;

  ensureBonusMusicElements();
  if (!desiredType || !ui.soundEnabled) {
    if (ui.musicType) {
      stopBonusMusic();
    }
    return;
  }
  const desiredAudio = ui.musicElements.get(desiredType);
  if (!desiredAudio) {
    return;
  }
  if (ui.musicType === desiredType && !desiredAudio.paused) {
    return;
  }

  stopBonusMusic();
  ui.musicType = desiredType;
  desiredAudio.volume = musicTrackGain(desiredType);
  document.documentElement.dataset.bonusMusic = JSON.stringify({
    playing: false,
    pending: desiredType,
    level: ui.musicVolumeLevel,
    gainDb: currentMusicGainDb(),
  });
  const playAttempt = desiredAudio.play();
  if (!playAttempt) {
    return;
  }
  playAttempt.then(() => {
    if (ui.musicType !== desiredType || !ui.soundEnabled) {
      desiredAudio.pause();
      return;
    }
    document.documentElement.dataset.bonusMusic = JSON.stringify({
      playing: !desiredAudio.paused,
      type: desiredType,
      gain: desiredAudio.volume,
      level: ui.musicVolumeLevel,
      gainDb: currentMusicGainDb(),
      transport: "html-audio",
    });
    if (desiredType === "AT_RETURN") {
      desiredAudio.addEventListener("ended", () => {
        if (ui.musicType !== "AT_RETURN") return;
        ui.atReturnMusicActive = false;
        ui.musicType = null;
        state.bgm = BONUS_MUSIC.BOOST.label;
        syncBonusMusic();
        render();
      }, { once: true });
    }
  }).catch((error) => {
    if (ui.musicType === desiredType) {
      document.documentElement.dataset.bonusMusic = JSON.stringify({
        playing: false,
        type: desiredType,
        level: ui.musicVolumeLevel,
        gainDb: currentMusicGainDb(),
        error: error.name,
      });
      console.warn(`BIG楽曲を再生できませんでした: ${error.message}`);
      if (desiredType === "AT_RETURN") {
        ui.atReturnMusicActive = false;
        ui.musicType = null;
        state.bgm = BONUS_MUSIC.BOOST.label;
        syncBonusMusic();
        render();
      }
    }
  });
}

function playBeep({
  frequency = 660,
  duration = 0.06,
  gain = 0.022,
  type = "square",
  delay = 0,
  rampTo = frequency,
} = {}) {
  if (!ui.soundEnabled || !ui.audioContext || ui.audioContext.state !== "running" || ui.activeBeepCount >= BEEP_MAX_CONCURRENT) {
    return;
  }

  const start = ui.audioContext.currentTime + delay;
  const end = start + duration;
  const oscillator = ui.audioContext.createOscillator();
  const envelope = ui.audioContext.createGain();
  const volumeGain = Math.max(0, Math.min(1, ui.soundVolume));
  const peakGain = Math.max(0.0001, gain * volumeGain);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.linearRampToValueAtTime(rampTo, end);

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(peakGain, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(envelope);
  envelope.connect(ui.audioContext.destination);
  ui.activeBeepCount += 1;
  oscillator.onended = () => {
    ui.activeBeepCount = Math.max(0, ui.activeBeepCount - 1);
    oscillator.disconnect();
    envelope.disconnect();
  };
  oscillator.start(start);
  oscillator.stop(end + 0.01);
}

function playSpinStartSound() {
  playSoundEffect("reelSpin");
}

function playReelStopSound(reelIndex = 0) {
  const sound = playSoundEffect("reelStop");
  if (sound) sound.playbackRate = 1 + reelIndex * 0.035;
}

function playResultSound(afterState) {
  if (afterState.bannerTone === "hit") {
    playBeep({ frequency: 760, rampTo: 910, duration: 0.09, gain: 0.026, type: "triangle" });
    playBeep({ frequency: 990, rampTo: 1170, duration: 0.12, gain: 0.022, delay: 0.07, type: "triangle" });
  } else if (afterState.bannerTone === "warning") {
    playBeep({ frequency: 250, rampTo: 180, duration: 0.14, gain: 0.02, type: "sawtooth" });
  }
}

function playRoleSound(afterState, beforeState = null) {
  if (!afterState.displayHit || afterState.displayRoleKey === "miss" || afterState.displayHit.roleKey === "miss") {
    return;
  }

  const roleKey = afterState.displayHit.roleKey;
  const sampleMap = {
    replay: "roleReplay",
    watermelon: "roleWatermelon",
    cherry: "roleCherry",
    strongCherry: "roleCherry",
  };
  if (sampleMap[roleKey]) {
    playSoundEffect(sampleMap[roleKey]);
    return;
  }
  const roleOriginMode = beforeState?.mode || afterState.mode;
  if (roleKey === "bell" && roleOriginMode !== "normal") {
    return;
  }

  if (roleKey === "bell") {
    playSoundEffect("payout");
    return;
  }

  const toneMap = {
    barLine: { frequency: 940, rampTo: 1080, duration: 0.1, gain: 0.026, type: "sawtooth" },
    middleCherry: { frequency: 520, rampTo: 1320, duration: 0.24, gain: 0.03, type: "sawtooth" },
    watermelonChance: { frequency: 900, rampTo: 1030, duration: 0.1, gain: 0.026, type: "sawtooth" },
    chance: { frequency: 980, rampTo: 1120, duration: 0.1, gain: 0.028, type: "sawtooth" },
  };
  const tone = toneMap[roleKey];
  if (tone) {
    playBeep(tone);
  }
}

function playBonusEntrySound() {
  playBeep({ frequency: 820, rampTo: 980, duration: 0.08, gain: 0.028, type: "triangle" });
  playBeep({ frequency: 1060, rampTo: 1280, duration: 0.12, gain: 0.024, delay: 0.06, type: "triangle" });
}

function playStageShiftSound() {
  playBeep({ frequency: 460, rampTo: 560, duration: 0.08, gain: 0.018, type: "triangle" });
}

function playCZEntrySound() {
  playBeep({ frequency: 700, rampTo: 920, duration: 0.09, gain: 0.025, type: "triangle" });
  playBeep({ frequency: 920, rampTo: 1120, duration: 0.08, gain: 0.02, delay: 0.05, type: "triangle" });
}

function playTransitionSounds(beforeState, afterState) {
  if (beforeState.mode !== "bonus" && afterState.mode === "bonus") {
    playBonusEntrySound();
  }

  if (beforeState.mode !== "cz" && afterState.mode === "cz") {
    playCZEntrySound();
  }

  if (beforeState.stage !== afterState.stage) {
    playStageShiftSound();
  }

  playRoleSound(afterState, beforeState);
}

function shouldAnimateAction(force = null) {
  if (force === "roleBarLine" && (state.mode === "normal" || state.mode === "revival")) {
    return false;
  }
  return force !== "premium489" && state.mode !== "ending";
}

function autoSpeedFactor() {
  return (ui.autoSpeed || 1) * (ui.debugFast ? 18 : 1) * (ui.overdrive ? 100 : 1);
}

function scaledDelay(ms, minimum = 1) {
  return Math.max(ui.debugFast ? 1 : minimum, Math.round(ms / autoSpeedFactor()));
}

function stopSpinLoop() {
  if (ui.rafId) {
    cancelAnimationFrame(ui.rafId);
    ui.rafId = null;
  }
  ui.lastFrameAt = 0;
}

function startSpinLoop() {
  stopSpinLoop();
  const loop = (now) => {
    if (!ui.spinning || !ui.displayReels) {
      return;
    }

    if (!ui.lastFrameAt) {
      ui.lastFrameAt = now;
    }
    const elapsed = now - ui.lastFrameAt;
    ui.lastFrameAt = now;
    const symbolsPerMs = 20 / 780;

    ui.spinningReels.forEach((active, reelIndex) => {
      if (active && !ui.deceleratingReels[reelIndex]) {
        ui.reelPositions[reelIndex] = wrapIndex(
          ui.reelPositions[reelIndex] - elapsed * symbolsPerMs * autoSpeedFactor(),
          REEL_STRIPS[reelIndex].length,
        );
        ui.displayReels[reelIndex] = visibleWindowFromPosition(reelIndex, ui.reelPositions[reelIndex]);
      }
    });

    renderReels();
    ui.rafId = requestAnimationFrame(loop);
  };
  ui.rafId = requestAnimationFrame(loop);
}

function beginPendingSpin(afterState, force = null) {
  const enteringBonus = state.mode !== "bonus" && afterState.mode === "bonus";
  const czBonusEntry = state.mode === "cz" && afterState.mode === "bonus";
  const enteringBig = enteringBonus && afterState.bonus?.type !== "REG";
  const internalRoleKey = afterState.internalRoleKey || afterState.presentationRoleKey || "miss";
  const presentationRoleKey = afterState.presentationRoleKey || internalRoleKey;
  const middleCherryResult = internalRoleKey === "middleCherry";
  const btBonus = state.mode === "bt" && Boolean(afterState.bt?.bonusType);
  const ichikakuProbability = middleCherryResult ? 0.90 : btBonus || enteringBig ? 0.40 : 0;
  const rareKind = ROLE_DEFS[internalRoleKey]?.rare || "none";
  const isRareResult = rareKind !== "none" && rareKind !== "bonus";
  const fakeReachRate = isRareResult ? 0.20 : 0.05;
  const specialPresentation = state.mode === "bt" || afterState.mode === "bonusReady" || presentationRoleKey === "babaSandwich";
  const fakeReach = !specialPresentation && state.mode !== "bonus" && afterState.mode !== "bonus" && chance(fakeReachRate);
  const reelSpinSuppressed = state.mode === "bonus" || state.mode === "at" || state.mode === "tama";
  const bonusAlignment = ["reg", "big", "blueBig"].includes(controlCatalogKey(presentationRoleKey));
  afterState.displayHit = cloneDisplayHit(afterState.displayHit || afterState.lastHit);
  afterState.displayRoleKey = presentationRoleKey;
  afterState.displayMissedRole = null;
  ui.spinning = true;
  window.ShibakuCabinet?.feedback("lever");
  // LCD notice cue: what this game has already resolved to, handed to the
  // presentation layer only. The notice picks its own look with its own
  // random stream; the game lottery is never consumed or changed.
  if (state.mode === "normal" && !middleCherryResult) {
    window.ShibakuEffects?.noticeCue?.({
      win: !["normal", "cz"].includes(afterState.mode),
      cz: afterState.mode === "cz",
      rare: isRareResult ? rareKind : "none",
    });
  }
  ui.spinningReels = [true, true, true];
  ui.deceleratingReels = [false, false, false];
  ui.reelPositions = state.reelStops.map((stopIndex, reelIndex) => wrapIndex(stopIndex, REEL_STRIPS[reelIndex].length));
  ui.displayReels = REEL_STRIPS.map((_, reelIndex) => visibleWindowFromPosition(reelIndex, ui.reelPositions[reelIndex]));
  ui.pendingSpin = {
    afterState,
    force,
    nextStop: 0,
    stopOrder: afterState.pushNaviOrder ? [...afterState.pushNaviOrder] : [0, 1, 2],
    resolving: false,
    internalRoleKey,
    presentationRoleKey,
    displayRoleKey: presentationRoleKey,
    controlCandidates: ensureReelLayoutCatalog().catalog[controlCatalogKey(presentationRoleKey)] || [],
    bonusAlignment,
    czBonusEntry,
    tenpaiPlayed: false,
    ichikaku: ichikakuProbability > 0 && chance(ichikakuProbability),
    ichikakuProbability,
    ichikakuReason: middleCherryResult ? "middleCherry" : btBonus ? "btBonus" : enteringBig ? "bigBonus" : null,
    fakeReach,
    finishPromise: null,
    finishResolver: null,
  };
  ui.pendingSpin.finishPromise = new Promise((resolve) => {
    ui.pendingSpin.finishResolver = resolve;
  });

  // 5: premium reverse freeze on a small share of normal-play wins
  // (presentation-only draw; the result is already fixed).
  const reverseFreeze = state.mode === "normal"
    && afterState.mode === "bonusReady"
    && !middleCherryResult
    && !ui.debugFast
    && Boolean(window.ShibakuEffects?.reverseFreezeRoll?.());
  if (reverseFreeze) {
    runReverseFreeze(ui.pendingSpin, afterState.bonusReady?.type === "BLUE_BIG" ? "青7" : "赤7");
  } else {
    startSpinLoop();
  }
  render();
  if (state.mode === "cz" && state.cz) window.ShibakuEffects?.czLever?.(state.cz.key, state.cz.gamesLeft);
  window.ShibakuEffects?.normalCueBegin?.(state, afterState);
  if (state.mode === "cz" && state.cz?.key === "shibaku") {
    window.ShibakuEffects?.battleBeat?.(0, afterState.cz?.lastBattleRole);
  }
  if (ui.reelFreezeActive) {
    // The reverse freeze plays its own sound and starts the spin sound later.
  } else if (fakeReach) {
    playSoundEffect("fakeReach");
  } else if (!reelSpinSuppressed) {
    playSpinStartSound();
  }
  document.documentElement.dataset.spinEffects = JSON.stringify({
    fakeReach,
    fakeReachRate,
    reelSpinSuppressed,
    ichikakuArmed: ui.pendingSpin.ichikaku,
    ichikakuProbability,
    ichikakuReason: ui.pendingSpin.ichikakuReason,
    enteringBonus,
    czBonusEntry,
    internalRoleKey,
    presentationRoleKey,
    bonusAlignment,
  });

  if (state.mode === "tama") {
    ui.tamaFreezePromise = triggerTamaOpportunity(0);
  }

  if (state.auto && !ui.reelFreezeActive) {
    autoStopPendingSpin();
  }

  return ui.pendingSpin.finishPromise;
}

// Reels crawl backwards and settle with the seven lined up on the middle
// row, hold, then the normal spin starts. Stops are locked meanwhile.
async function runReverseFreeze(pending, symbol) {
  ui.reelFreezeActive = true;
  renderInteractivity();
  const holdMs = window.ShibakuEffects?.reverseFreeze?.() || 0;
  const starts = [...ui.reelPositions];
  const targets = REEL_STRIPS.map((strip, reelIndex) => {
    const index = strip.indexOf(symbol);
    return wrapIndex(index - 1, strip.length);
  });
  const travel = targets.map((target, reelIndex) => {
    const length = REEL_STRIPS[reelIndex].length;
    return wrapIndex(target - Math.floor(starts[reelIndex]), length) + length - (starts[reelIndex] % 1);
  });
  const crawlMs = 2600;
  const began = performance.now();
  await new Promise((resolve) => {
    const frame = (now) => {
      if (ui.pendingSpin !== pending) return resolve();
      const t = Math.min(1, (now - began) / crawlMs);
      // Each reel finishes a little later, easing into the seven.
      ui.reelPositions = starts.map((start, reelIndex) => {
        const local = Math.min(1, t * (1 + (2 - reelIndex) * 0.12));
        const eased = 1 - (1 - local) ** 3;
        return wrapIndex(start + travel[reelIndex] * eased, REEL_STRIPS[reelIndex].length);
      });
      ui.displayReels = REEL_STRIPS.map((_, reelIndex) => visibleWindowFromPosition(reelIndex, ui.reelPositions[reelIndex]));
      renderReels();
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  if (ui.pendingSpin !== pending) return;
  ui.reelPositions = [...targets];
  renderReels();
  window.ShibakuEffects?.reverseFreezeAligned?.();
  await sleep(holdMs);
  if (ui.pendingSpin !== pending) return;
  ui.reelFreezeActive = false;
  ui.lastFrameAt = 0;
  startSpinLoop();
  playSpinStartSound();
  renderInteractivity();
  if (state.auto) autoStopPendingSpin();
}

async function animateReelSlip(reelIndex, targetStop, pendingAtStart = ui.pendingSpin) {
  const stripLength = REEL_STRIPS[reelIndex].length;
  const startPosition = wrapIndex(ui.reelPositions[reelIndex], stripLength);
  const travelSymbols = wrapIndex(startPosition - targetStop, stripLength);
  const duration = scaledDelay(Math.max(1, travelSymbols * ui.reelStepMs), 1);

  const specialForcedStop = ui.pendingSpin?.afterState?.mode === "bonusReady"
    || Boolean(ui.pendingSpin?.afterState?.bt?.bonusType)
    || EXTENDED_STOP_ROLE_KEYS.has(ui.pendingSpin?.presentationRoleKey)
    || ui.pendingSpin?.czBonusEntry;
  if (!specialForcedStop && travelSymbols > MAX_REEL_SLIP + 1.001) {
    throw new ReelControlError(`リール${reelIndex + 1}の滑りが4コマを超えました: ${travelSymbols.toFixed(3)}`);
  }

  if (travelSymbols > 0.001) {
    await new Promise((resolve) => {
      const startedAt = performance.now();
      const step = (now) => {
        if (ui.pendingSpin !== pendingAtStart || !ui.displayReels) {
          resolve();
          return;
        }
        const progress = Math.min(1, (now - startedAt) / duration);
        const currentPosition = wrapIndex(startPosition - travelSymbols * progress, stripLength);
        ui.reelPositions[reelIndex] = currentPosition;
        ui.displayReels[reelIndex] = visibleWindowFromPosition(reelIndex, currentPosition);
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  if (ui.pendingSpin !== pendingAtStart || !ui.displayReels) {
    return false;
  }
  ui.reelPositions[reelIndex] = targetStop;
  ui.displayReels[reelIndex] = visibleWindowFromStop(reelIndex, targetStop);
  renderReels();
  return true;
}


function reachableStopsForReel(reelIndex) {
  const stripLength = REEL_STRIPS[reelIndex].length;
  const currentPosition = wrapIndex(ui.reelPositions[reelIndex], stripLength);
  const baseStop = Math.floor(currentPosition);
  const stops = new Map();
  for (let slip = 0; slip <= MAX_REEL_SLIP; slip += 1) {
    stops.set(wrapIndex(baseStop - slip, stripLength), slip);
  }
  return { currentPosition, baseStop, stops };
}

function allStopsForReel(reelIndex) {
  const stripLength = REEL_STRIPS[reelIndex].length;
  const currentPosition = wrapIndex(ui.reelPositions[reelIndex], stripLength);
  const stops = new Map();
  for (let targetStop = 0; targetStop < stripLength; targetStop += 1) {
    stops.set(targetStop, wrapIndex(currentPosition - targetStop, stripLength));
  }
  return stops;
}

function cloneDisplayHit(hit) {
  return hit ? { ...hit, symbols: hit.symbols ? [...hit.symbols] : [] } : null;
}

function applyControlledLayout(pending, displayRoleKey, candidate, missedRoleKey = null) {
  const layout = layoutFromCatalogEntry(displayRoleKey, candidate);
  pending.afterState.reelStops = [...layout.stopIndexes];
  pending.afterState.reels = cloneReels(layout.reels);
  pending.afterState.displayHit = cloneDisplayHit(layout.lastHit);
  pending.afterState.displayMissedRole = missedRoleKey;
  pending.afterState.displayRoleKey = displayRoleKey;
  pending.displayRoleKey = displayRoleKey;
}

function selectSpecialControlledCandidate(reelIndex, pending, controlTables, stoppedReels, reachable) {
  const bt = state.mode === "bt" ? pending.afterState.bt : null;
  // Prefer a seven only when the remaining reels can still safely miss within four symbols.
  if (bt?.teaseSymbol && pending.presentationRoleKey === "miss" && reelIndex < 2) {
    const fixed = new Map(stoppedReels.map(i => [i, pending.afterState.reelStops[i]]));
    const order = pending.stopOrder.slice(pending.nextStop + 1);
    const choices = indexedControlChoices(controlTables, "miss", reelIndex, fixed, reachable.stops)
      .filter(([stop]) => {
        if (visibleWindowFromStop(reelIndex, stop)[1] !== bt.teaseSymbol) return false;
        const next = new Map(fixed); next.set(reelIndex, stop);
        return isRobustRolePrefix(controlTables, "miss", next, order);
      });
    if (choices.length) {
      const [stop, entries] = choices[0];
      applyControlledLayout(pending, "miss", entries[randomInt(0, entries.length - 1)]);
      return stop;
    }
  }
  const isBabaSandwich = pending.presentationRoleKey === "babaSandwich";
  const isMiddleCherry = pending.presentationRoleKey === "middleCherry";
  const isForcedRoleStop = EXTENDED_STOP_ROLE_KEYS.has(pending.presentationRoleKey);
  const isBonusReady = state.mode === "bonusReady" && pending.afterState.mode === "bonusReady" && pending.afterState.bonusReady;
  const isCzBonusEntry = pending.czBonusEntry && pending.afterState.mode === "bonus" && pending.afterState.bonus;
  const isBTBonus = Boolean(bt?.bonusType);
  if (!isForcedRoleStop && !isBonusReady && !isCzBonusEntry && !isBTBonus) return null;
  if (isBonusReady && pending.displayRoleKey === "miss" && !pending.bonusReadyWrongColor) return null;

  const fixedStops = new Map(stoppedReels.map((index) => [index, pending.afterState.reelStops[index]]));
  const allStops = allStopsForReel(reelIndex);
  const desiredRoleKey = isBabaSandwich
    ? "babaSandwich"
    : isMiddleCherry
      ? "middleCherry"
      : isBTBonus
        ? bonusRoleKey(bt.bonusType)
      : isForcedRoleStop && !isBonusReady && !isCzBonusEntry
        ? controlCatalogKey(pending.presentationRoleKey)
      : bonusRoleKey(isBonusReady ? pending.afterState.bonusReady.type : pending.afterState.bonus.type);
  let displayRoleKey = desiredRoleKey;
  let missedRoleKey = null;
  let choices = [];
  const middleLineOnly = (source) => source
    .map(([targetStop, entries]) => [
      targetStop,
      entries.filter((entry) => entry.win?.paylineIndex === 1),
    ])
    .filter(([, entries]) => entries.length);

  if (isBonusReady && pending.bonusReadyWrongColor) {
    const forcedTarget = pending.afterState.reelStops[reelIndex];
    const forcedChoices = indexedControlChoices(controlTables, "miss", reelIndex, fixedStops, allStops)
      .filter(([targetStop]) => targetStop === forcedTarget);
    if (!forcedChoices.length) return null;
    const [targetStop, selectedGroup] = forcedChoices[0];
    const selected = selectedGroup[randomInt(0, selectedGroup.length - 1)];
    pending.controlCandidates = selectedGroup;
    applyControlledLayout(pending, "miss", selected, desiredRoleKey);
    return targetStop;
  }

  if (isBonusReady && reelIndex === 0 && pending.nextStop === 0 && !["REG", "GOLD_REG"].includes(pending.afterState.bonusReady.type)) {
    const desiredChoices = middleLineOnly(
      indexedControlChoices(controlTables, desiredRoleKey, reelIndex, fixedStops, reachable.stops),
    );
    const desiredSymbol = pending.afterState.bonusReady.type === "BLUE_BIG" ? "青7" : "赤7";
    const wrongSymbol = desiredSymbol === "青7" ? "赤7" : "青7";
    const wrongChoices = indexedControlChoices(controlTables, "miss", reelIndex, fixedStops, reachable.stops)
      .filter(([targetStop]) => visibleWindowFromStop(0, targetStop)[1] === wrongSymbol);
    const nearestDistance = (source) => Math.min(...source.map(([targetStop]) => reachable.stops.get(targetStop)));
    const wrongWasAimed = wrongChoices.length
      && (!desiredChoices.length || nearestDistance(wrongChoices) < nearestDistance(desiredChoices));
    if (wrongWasAimed) {
      choices = wrongChoices;
      displayRoleKey = "miss";
      missedRoleKey = desiredRoleKey;
      pending.bonusReadyWrongColor = true;
    } else {
      choices = desiredChoices;
    }
  }

  if (!choices.length) {
    choices = indexedControlChoices(controlTables, desiredRoleKey, reelIndex, fixedStops, allStops);
    if (isBonusReady || isCzBonusEntry || isBTBonus) choices = middleLineOnly(choices);
  }
  // 強制停止役（BAR揃い等）でも、挟み目非成立Gは左リールにBAR・リプレイ・BARを出さない
  if (reelIndex === 0 && !isBabaSandwich && shouldRejectBabaSandwich(pending)) {
    choices = choices.filter(([targetStop]) => !isBabaSandwichWindow(targetStop));
  }
  if (!choices.length) return null;

  const distanceMap = displayRoleKey === "miss" ? reachable.stops : allStops;
  choices.sort((a, b) => (
    distanceMap.get(a[0]) - distanceMap.get(b[0]) || b[1].length - a[1].length
  ));
  const [targetStop, selectedGroup] = choices[0];
  const selected = selectedGroup[randomInt(0, selectedGroup.length - 1)];
  pending.controlCandidates = selectedGroup;
  applyControlledLayout(pending, displayRoleKey, selected, missedRoleKey);
  document.documentElement.dataset.specialReelControl = JSON.stringify({
    mode: isBabaSandwich
      ? "baba-sandwich"
      : isMiddleCherry
        ? "middle-cherry"
        : isCzBonusEntry
          ? "cz-bonus-entry"
          : isBonusReady
            ? "bonus-ready"
            : "forced-role",
    reelIndex,
    targetStop,
    travelSymbols: allStops.get(targetStop),
    desiredRoleKey,
    displayRoleKey,
    wrongColor: Boolean(pending.bonusReadyWrongColor),
    at: Date.now(),
  });
  return targetStop;
}

// C1: ババアCZの挟み目成立G以外では、通常時も左リールのBAR・リプレイ・BAR挟み目を表示しない
function shouldRejectBabaSandwich(pending) {
  const babaFlagNotSet = state.mode === "cz"
    && state.cz?.key === "baba"
    && !pending.afterState.cz?.babaSandwichHitThisGame;
  return babaFlagNotSet || state.mode === "normal";
}

function isBabaSandwichWindow(targetStop) {
  const rows = visibleWindowFromStop(0, targetStop);
  return BABA_SANDWICH_SYMBOLS.every((symbol, rowIndex) => rows[rowIndex] === symbol);
}

function selectControlledCandidate(reelIndex) {
  const pending = ui.pendingSpin;
  if (!pending || !ui.spinningReels[reelIndex]) {
    return null;
  }

  const { controlTables, normalControlTables } = ensureReelLayoutCatalog();
  const reachable = reachableStopsForReel(reelIndex);
  const stoppedReels = ui.spinningReels
    .map((isSpinning, index) => (!isSpinning ? index : -1))
    .filter((index) => index >= 0);
  const specialTarget = selectSpecialControlledCandidate(reelIndex, pending, controlTables, stoppedReels, reachable);
  if (specialTarget !== null) return specialTarget;
  const fixedStops = new Map(stoppedReels.map((index) => [index, pending.afterState.reelStops[index]]));

  const remainingOrder = pending.stopOrder.slice(pending.nextStop + 1);
  const rejectBabaSandwich = shouldRejectBabaSandwich(pending);
  const decision = decideRoleAwareStop({
    controlTables: rejectBabaSandwich ? normalControlTables : controlTables,
    policyRoleKey: pending.presentationRoleKey,
    displayRoleKey: pending.displayRoleKey,
    missedRoleKey: pending.afterState.displayMissedRole,
    reelIndex,
    fixedStops,
    remainingOrder,
    reachableStops: reachable.stops,
    preferBottomBar: reelIndex === 0 && !state.auto,
    rejectBabaSandwich,
  });

  if (decision.noSafeStop) {
    const audit = {
      result: "no-safe-stop",
      reelIndex,
      baseStop: reachable.baseStop,
      maxSlip: MAX_REEL_SLIP,
      internalRoleKey: pending.internalRoleKey,
      presentationRoleKey: pending.presentationRoleKey,
      stoppedReels,
      trace: decision.trace,
      at: Date.now(),
    };
    document.documentElement.dataset.reelControlError = JSON.stringify(audit);
    throw new ReelControlError(`5LINE上で矛盾しない4コマ停止候補がありません: ${JSON.stringify(audit)}`);
  }
  const {
    targetStop,
    entries: selectedGroup,
    displayRoleKey,
    missedRoleKey,
  } = decision;
  const selected = selectedGroup[randomInt(0, selectedGroup.length - 1)];
  pending.controlCandidates = selectedGroup;
  applyControlledLayout(pending, displayRoleKey, selected, missedRoleKey);

  const audit = {
    result: missedRoleKey ? "pickup-miss" : "controlled-stop",
    reelIndex,
    pressPosition: reachable.currentPosition,
    baseStop: reachable.baseStop,
    reachableStops: [...reachable.stops].map(([stop, slip]) => ({ stop, slip })),
    targetStop,
    slip: reachable.stops.get(targetStop),
    actualTravel: wrapIndex(reachable.currentPosition - targetStop, REEL_STRIPS[reelIndex].length),
    maxSlip: MAX_REEL_SLIP,
    internalRoleKey: pending.internalRoleKey,
    presentationRoleKey: pending.presentationRoleKey,
    displayRoleKey,
    missedRoleKey,
    fallback: displayRoleKey === controlCatalogKey(pending.presentationRoleKey)
      ? null
      : `${pending.presentationRoleKey}->${displayRoleKey}`,
    remainingOrder,
    stoppedReels,
    candidateTrace: decision.trace,
    at: Date.now(),
  };
  document.documentElement.dataset.reelControl = JSON.stringify(audit);
  if (new URLSearchParams(window.location.search).has("reelDebug")) {
    window.__SHIBAKU_REEL_DEBUG__ = [...(window.__SHIBAKU_REEL_DEBUG__ || []).slice(-99), audit];
  }
  if (reelIndex === 0) document.documentElement.dataset.leftBarAim = JSON.stringify(audit);
  return targetStop;
}

function assertDisplayedResultConsistency(afterState) {
  const matrix = afterState.reels;
  const wins = evaluateWins(matrix);
  const hasMiddleCherry = matrix[0][1] === "チェリー";
  const roleKey = afterState.displayRoleKey || afterState.displayHit?.roleKey || "miss";
  const expectedRoleKey = controlCatalogKey(roleKey);
  const valid = roleKey === "babaSandwich"
    ? BABA_SANDWICH_SYMBOLS.every((symbol, rowIndex) => matrix[0][rowIndex] === symbol)
      && wins.length === 0
    : roleKey === "middleCherry"
    ? hasMiddleCherry && wins.length === 0
    : roleKey === "watermelonChance"
      ? !hasMiddleCherry
        && wins.length === 0
        && hasCleanWatermelonChanceDisplay(matrix, PAYLINES[afterState.displayHit?.paylineIndex])
      : roleKey === "miss"
        ? !hasMiddleCherry && wins.length === 0
        : roleKey === "watermelon"
          ? !hasMiddleCherry
            && wins.length === 1
            && wins[0].roleKey === expectedRoleKey
            && hasCleanWatermelonDisplay(matrix)
        : !hasMiddleCherry && wins.length === 1 && wins[0].roleKey === expectedRoleKey;
  if (!valid) {
    const audit = { roleKey, expectedRoleKey, wins, hasMiddleCherry, stops: afterState.reelStops };
    document.documentElement.dataset.reelDisplayMismatch = JSON.stringify(audit);
    throw new ReelControlError(`表示停止形と表示役が一致しません: ${JSON.stringify(audit)}`);
  }
}

async function triggerTamaOpportunity(momentIndex) {
  const pending = ui.pendingSpin;
  const tama = pending?.afterState?.tama;
  if (!pending || !tama || tama.acquired || !Number.isInteger(tama.currentOpportunityBase)) {
    return false;
  }

  const opportunity = tama.currentOpportunityBase + momentIndex;
  if (!tama.willAcquire || tama.triggerStep !== opportunity) {
    return false;
  }

  tama.acquired = true;
  ui.tamaFreezeActive = true;
  stopSpinLoop();
  stopBonusMusic();
  playSoundEffect("ichikaku");

  const machinePanel = dom.machineWindow?.closest(".machine-panel");
  machinePanel?.classList.add("tama-blackout");
  document.documentElement.dataset.tamaAcquisition = JSON.stringify({
    result: "acquired",
    game: tama.currentGame,
    moment: ["spin", "first-stop", "second-stop", "third-stop"][momentIndex],
    opportunity,
    at: Date.now(),
  });
  renderInteractivity();

  await sleep(ui.debugFast ? scaledDelay(800, 1) : 800);

  if (ui.pendingSpin !== pending || !ui.displayReels) {
    machinePanel?.classList.remove("tama-blackout");
    ui.tamaFreezeActive = false;
    renderInteractivity();
    return false;
  }
  pending.afterState.reelStops.forEach((targetStop, reelIndex) => {
    ui.reelPositions[reelIndex] = targetStop;
    ui.displayReels[reelIndex] = visibleWindowFromStop(reelIndex, targetStop);
  });
  pending.nextStop = 3;
  finishPendingSpin();
  machinePanel?.classList.remove("tama-blackout");
  machinePanel?.classList.add("tama-acquired-glow");
  ui.tamaFreezeActive = false;
  window.ShibakuEffects?.tamaAcquired?.();
  syncBonusMusic();
  if (ui.spinning) startSpinLoop();
  renderInteractivity();
  window.setTimeout(() => {
    machinePanel?.classList.remove("tama-acquired-glow");
    window.ShibakuEffects?.update(state);
  }, 1800);
  return true;
}

async function triggerMiddleCherryLongFreeze() {
  const pending = ui.pendingSpin;
  if (!pending || pending.ichikakuReason !== "middleCherry") return;

  const durationMs = ui.debugFast ? scaledDelay(4000, 1) : 4000;
  const machinePanel = dom.machineWindow?.closest(".machine-panel");
  stopSpinLoop();
  machinePanel?.classList.add("middle-cherry-blackout");
  document.documentElement.dataset.middleCherryFreeze = JSON.stringify({
    active: true,
    trigger: "first-stop",
    durationMs,
    startedAt: Date.now(),
  });
  window.ShibakuEffects?.longFreeze(pending.afterState, durationMs);
  renderInteractivity();

  await sleep(durationMs);

  machinePanel?.classList.remove("middle-cherry-blackout");
  if (ui.pendingSpin !== pending) {
    renderInteractivity();
    return false;
  }
  document.documentElement.dataset.middleCherryFreeze = JSON.stringify({
    active: false,
    trigger: "first-stop",
    durationMs,
    endedAt: Date.now(),
  });
  if (ui.spinning) startSpinLoop();
  renderInteractivity();
  return true;
}

function recoverReelSpin(error, beforeState, phase) {
  const resolver = ui.pendingSpin?.finishResolver;
  stopSpinLoop();
  ui.operationGeneration += 1;
  ui.autoGeneration += 1;
  state = beforeState;
  state.auto = false;
  ui.pendingSpin = null;
  ui.spinning = false;
  ui.spinningReels = [false, false, false];
  ui.deceleratingReels = [false, false, false];
  ui.displayReels = null;
  ui.reelPositions = [...state.reelStops];
  ui.tamaFreezeActive = false;
  ui.reelFreezeActive = false;
  ui.tamaFreezePromise = null;
  clearTimeout(ui.actionLockTimer);
  ui.actionLockedUntil = 0;
  ui.actionLockReason = "";
  stopAllSoundEffects();
  window.ShibakuEffects?.reset();
  document.querySelector(".machine-panel")?.classList.remove("middle-cherry-blackout");
  resolver?.();
  render();
  syncBonusMusic();
  reportReelFault(error, phase);
}

async function stopReel(reelIndex) {
  const beforeState = snapshotState(state);
  try {
    return await stopReelChecked(reelIndex);
  } catch (error) {
    if (!(error instanceof ReelControlError)) throw error;
    recoverReelSpin(error, beforeState, "stop");
  }
}

async function stopReelChecked(reelIndex) {
  if (!ui.spinning || !ui.pendingSpin || ui.pendingSpin.resolving || ui.tamaFreezeActive || ui.reelFreezeActive) {
    return;
  }

  const pendingAtStart = ui.pendingSpin;
  const requiredReel = pendingAtStart.stopOrder[pendingAtStart.nextStop];
  if (reelIndex !== requiredReel) {
    return;
  }

  const isFirstStop = pendingAtStart.nextStop === 0;
  const isSecondStop = pendingAtStart.nextStop === 1;
  const isThirdStop = pendingAtStart.nextStop === 2;
  pendingAtStart.resolving = true;
  window.ShibakuCabinet?.feedback("stop", reelIndex);
  const targetStop = selectControlledCandidate(reelIndex);
  if (state.mode === "tama") {
    ui.tamaFreezePromise = triggerTamaOpportunity(pendingAtStart.nextStop + 1);
    await ui.tamaFreezePromise;
    if (ui.pendingSpin !== pendingAtStart) return;
  }
  ui.deceleratingReels[reelIndex] = true;
  const completedSlip = await animateReelSlip(reelIndex, targetStop, pendingAtStart);
  if (!completedSlip || ui.pendingSpin !== pendingAtStart) return;
  ui.spinningReels[reelIndex] = false;
  ui.deceleratingReels[reelIndex] = false;
  playReelStopSound(reelIndex);
  window.ShibakuEffects?.normalCueStop?.(pendingAtStart.nextStop + 1, pendingAtStart.displayRoleKey);
  if (state.mode === "cz" && state.cz?.key === "shibaku") {
    window.ShibakuEffects?.battleBeat?.(pendingAtStart.nextStop + 1, pendingAtStart.afterState.cz?.lastBattleRole, {
      held: Boolean(pendingAtStart.afterState.cz?.heldAward),
    });
  }

  if (reelIndex === 0 && ui.pendingSpin.presentationRoleKey === "babaSandwich") {
    const hitNumber = ui.pendingSpin.afterState.cz?.babaSandwichHits || 0;
    if (hitNumber >= 3) {
      // 4: silence, then the confirm sound.
      stopBonusMusic();
      stopAllSoundEffects();
      const generation = ui.operationGeneration;
      window.setTimeout(() => { if (generation === ui.operationGeneration) playSoundEffect("ichikaku"); }, ui.debugFast ? 0 : 350);
    } else {
      playSoundEffect("tenpai");
    }
    window.ShibakuEffects?.babaSandwichHit?.(hitNumber);
    document.documentElement.dataset.babaSandwichHit = JSON.stringify({
      hitNumber,
      sound: hitNumber >= 3 ? "ichikaku" : "tenpai",
      at: Date.now(),
    });
  }

  const displayedBonusAlignment = !ui.pendingSpin.afterState.displayMissedRole
    && ["reg", "big", "blueBig"].includes(ui.pendingSpin.displayRoleKey);
  if (isSecondStop && displayedBonusAlignment && !ui.pendingSpin.tenpaiPlayed) {
    ui.pendingSpin.tenpaiPlayed = true;
    playSoundEffect("tenpai");
    document.documentElement.dataset.tenpaiSound = JSON.stringify({
      roleKey: ui.pendingSpin.internalRoleKey,
      stopOrder: [...ui.pendingSpin.stopOrder],
      secondStoppedReel: reelIndex,
      at: Date.now(),
    });
  }

  if (isFirstStop && ui.pendingSpin.ichikaku) {
    const bonusType = ui.pendingSpin.ichikakuReason === "middleCherry"
      ? "BLUE_BIG"
      : ui.pendingSpin.afterState.bt?.bonusType || ui.pendingSpin.afterState.bonus?.type;
    playSoundEffect("ichikaku");
    window.ShibakuEffects?.ichikaku(bonusType);
    document.documentElement.dataset.ichikaku = JSON.stringify({
      triggered: true,
      type: bonusType,
      probability: ui.pendingSpin.ichikakuProbability,
      reason: ui.pendingSpin.ichikakuReason,
    });
  }

  if (isFirstStop && ui.pendingSpin.ichikakuReason === "middleCherry") {
    await triggerMiddleCherryLongFreeze();
    if (ui.pendingSpin !== pendingAtStart) return;
  }

  ui.pendingSpin.nextStop += 1;
  ui.pendingSpin.resolving = false;
  // 各リールの停止確定時点で、対応する液晶ベルナビだけを消去する。
  renderPushNavi();
  window.ShibakuEffects?.update(pendingDisplayState());
  renderButtons();
  renderInteractivity();

  if (ui.pendingSpin.nextStop >= 3) {
    assertDisplayedResultConsistency(ui.pendingSpin.afterState);
    finishPendingSpin();
  }
}

function finalizeSpecialPendingState(beforeState, pending, pendingAfterState) {
  let afterState = pendingAfterState;
  if (beforeState.mode === "bt" && afterState.mode === "bt" && afterState.bt?.pendingResult) {
    state = afterState;
    settleBTResult();
    afterState = snapshotState(state);
    state = beforeState;
  }
  if (beforeState.mode === "cz" && beforeState.cz?.key !== "baba" && afterState.mode === "cz") {
    state = afterState;
    if (state.cz.key === "shibaku") {
      if (state.cz.gamesLeft <= 0) state.cz.pushPending = true;
    } else if (state.cz.failurePending) failCZ();
    afterState = snapshotState(state);
    state = beforeState;
  }
  const completedBaba = beforeState.mode === "cz"
    && beforeState.cz?.key === "baba"
    && afterState.mode === "cz"
    && afterState.cz?.babaSandwichHits >= 3;

  if (completedBaba) {
    state = afterState;
    resolveCZSuccess();
    afterState = snapshotState(state);
    state = beforeState;
    return afterState;
  }

  if (beforeState.mode !== "bonusReady" || afterState.mode !== "bonusReady" || !afterState.bonusReady) {
    return afterState;
  }

  const desiredRoleKey = bonusRoleKey(afterState.bonusReady.type);
  const wins = evaluateWins(afterState.reels);
  const aligned = !afterState.displayMissedRole
    && wins.length === 1
    && wins[0].roleKey === desiredRoleKey
    && wins[0].paylineIndex === 1;
  state = afterState;
  if (aligned) {
    enterBonus(afterState.bonusReady.type, afterState.bonusReady.trigger, { preserveReels: true, fromReturnHigh: afterState.bonusReady.fromReturnHigh });
  } else {
    const wrongColor = Boolean(pending.bonusReadyWrongColor);
    state.bonusReady.lastResult = wrongColor ? "wrong-color" : "miss";
    showBanner("BONUS確定", "accent");
  }
  afterState = snapshotState(state);
  state = beforeState;
  return afterState;
}

function finishPendingSpin() {
  stopSpinLoop();

  if (!ui.pendingSpin) {
    return;
  }

  let afterState = ui.pendingSpin.afterState;
  assertDisplayedResultConsistency(afterState);
  const pending = ui.pendingSpin;
  const resolver = pending.finishResolver;
  const beforeState = snapshotState(state);
  const btDrumResult = state.mode === "bt" ? afterState.bt?.pendingResult ?? null : null;
  const stoppedIndexes = [...afterState.reelStops];
  afterState = settleDisplayedPayout(afterState, pending);
  afterState = finalizeSpecialPendingState(beforeState, pending, afterState);
  assertDisplayedResultConsistency(afterState);
  if (JSON.stringify(afterState.reelStops) !== JSON.stringify(stoppedIndexes)) {
    throw new ReelControlError("結果確定処理が停止済みリールを変更しました");
  }
  afterState.auto = state.auto;
  const enteredBonus = beforeState.mode !== "bonus" && afterState.mode === "bonus";
  const enteredBabaBonusReady = beforeState.mode === "cz"
    && beforeState.cz?.key === "baba"
    && afterState.mode === "bonusReady";
  const exitedBonus = beforeState.mode === "bonus" && afterState.mode !== "bonus";
  const btFailed = beforeState.mode === "bt" && afterState.btView?.result === "end";
  const challengeFailed = (beforeState.mode === "cz" && afterState.mode === "normal") || btFailed;
  const anyCzFailed = btFailed || (beforeState.mode === "cz" && (afterState.mode === "normal" || afterState.mode === "revival"));

  updateResultCountingWindow(beforeState, afterState);
  resetCurrentGamesAfterPayoutMode(beforeState, afterState);

  state = afterState;
  ui.czFailedThisGame = anyCzFailed;
  if ((afterState.at?.tamaCount || 0) > (beforeState.at?.tamaCount || 0) && beforeState.mode === "tama") ui.counterTamaHits += 1;
  ui.spinning = false;
  ui.spinningReels = [false, false, false];
  ui.deceleratingReels = [false, false, false];
  ui.displayReels = null;
  ui.pendingSpin = null;
  ui.mainActionPromise = null;
  const enteredCz = beforeState.mode !== "cz" && afterState.mode === "cz";
  if (enteredCz && !ui.debugFast && window.ShibakuEffects?.czDevelop) {
    // "発展": hold the LCD before render() so the CZ scene waits for the
    // rush / title fly-in; the title then breaks into the CZ scene.
    window.ShibakuEffects.czDevelop(beforeState, afterState);
    lockMainAction(1850, "cz-develop");
  }
  // 1 / 4 / 10: reel flash, a beat of silence and the unko reversal ahead of the result.
  const winFromNormal = beforeState.mode === "normal" && ["bonusReady", "bonus"].includes(afterState.mode)
    && afterState.internalRoleKey !== "middleCherry";
  const czFromNormal = beforeState.mode === "normal" && afterState.mode === "cz";
  if (!ui.debugFast && (winFromNormal || czFromNormal)) window.ShibakuEffects?.reelFlash?.(winFromNormal ? "win" : "cz");
  const unkoReversal = !ui.debugFast
    && beforeState.mode === "cz" && beforeState.cz?.key === "unko" && beforeState.cz.gamesLeft === 1
    && afterState.mode === "bonusReady"
    && Boolean(window.ShibakuEffects?.czRevivalRoll?.());
  let resultSoundDelay = 0;
  if (unkoReversal) {
    resultSoundDelay = window.ShibakuEffects.czRevival() || 0;
    lockMainAction(resultSoundDelay + 300, "cz-revival");
  } else if (winFromNormal && !ui.debugFast) {
    stopAllSoundEffects();
    resultSoundDelay = 380;
    window.ShibakuEffects?.silenceBeat?.(resultSoundDelay);
  }
  // D10: the drum lands (slow / slip / overshoot) before the result shows.
  const btLandingMs = btDrumResult && !ui.debugFast
    ? window.ShibakuEffects?.btLanding?.(btDrumResult, beforeState.bt?.misses || 0) || 0
    : 0;
  if (enteredBabaBonusReady) {
    // Hold the LCD before render() so "BONUS確定" enters after the blackout lifts.
    window.ShibakuEffects?.babaBonusReady?.();
    lockMainAction(1100, "baba-bonus-ready");
  }
  render();
  if (resultSoundDelay) {
    const generation = ui.operationGeneration;
    window.setTimeout(() => {
      if (generation !== ui.operationGeneration) return;
      playTransitionSounds(beforeState, afterState);
      playResultSound(afterState);
    }, resultSoundDelay);
  } else {
    playTransitionSounds(beforeState, afterState);
    playResultSound(afterState);
  }
  window.ShibakuEffects?.transition(beforeState, afterState);
  if (beforeState.mode === "bt" && ["miss", "end", "retry"].includes(afterState.btView?.result)) {
    if (afterState.btView.result !== "retry") {
      const generation = ui.operationGeneration;
      window.setTimeout(() => { if (generation === ui.operationGeneration) playSoundEffect("btMiss"); }, btLandingMs);
    }
    lockMainAction(Math.max(1450, btLandingMs + 700), "bt-result");
  }
  if (["bonus", "at", "tama"].includes(beforeState.mode) && afterState.displayRoleKey === "bell") {
    window.ShibakuCabinet?.bellPayout(afterState.settledPayout || 0);
  }

  if (state.mode === "cz" && state.cz?.key === "shibaku" && state.cz.pushPending) {
    ui.battleWaitPromise = new Promise((resolve) => { ui.battleWaitResolver = resolve; });
    stopAllSoundEffects();
    stopBonusMusic();
    if (ui.debugFast) {
      window.ShibakuEffects?.battlePush?.();
      renderInteractivity();
      revealBattlePush();
    } else {
      chargeBattlePush();
    }
  }


  if (afterState.vStockAwardedThisGame) {
    window.ShibakuEffects?.vStockAcquired?.(afterState);
  }
  if (afterState.boostConfirmedThisGame && !exitedBonus) {
    const generation = ui.operationGeneration;
    const showBoostConfirmed = () => window.ShibakuEffects?.boostConfirmed?.(state);
    if (afterState.vStockAwardedThisGame) window.setTimeout(() => {
      if (generation === ui.operationGeneration && state.mode === "bonus") showBoostConfirmed();
    }, ui.debugFast ? scaledDelay(1650, 1) : 1650);
    else showBoostConfirmed();
  }

  const enhancedModeBell = (beforeState.mode === "bonus" || beforeState.mode === "at")
    && !afterState.displayMissedRole
    && afterState.displayRoleKey === "bell";
  if (enhancedModeBell) {
    playBellPayoutEffect();
  }

  if (enteredBonus) {
    if (afterState.internalRoleKey !== "middleCherry") {
      window.ShibakuEffects?.bonusConfirmed(afterState.bonus?.type);
      lockMainAction(1000, "bonus-confirmed");
    }
  }
  if (exitedBonus) {
    const lowestDelta = state.lowestTotalDelta ?? 0;
    const currentDelta = state.totalDelta;
    const resultCoins = Math.max(0, currentDelta - lowestDelta);
    const result = {
      type: beforeState.bonus?.type || "REG",
      coins: resultCoins,
      durationMs: 4000,
    };
    document.documentElement.dataset.lastBonusResult = JSON.stringify(result);
    playSoundEffect("bonusResult");
    window.ShibakuEffects?.showBonusResult(result);
    lockMainAction(4000, "bonus-result");
  }
  if (challengeFailed) {
    const failureName = btFailed ? "BONUS TRIGGER" : beforeState.cz?.name || "チャレンジ";
    const failureSound = playSoundEffect("challengeFail");
    ui.challengeFailure = {
      sound: failureSound,
      name: failureName,
      startedAt: Date.now(),
    };
    window.ShibakuEffects?.challengeFailed(failureName, afterState);
    document.documentElement.dataset.challengeResult = JSON.stringify({
      result: "failed",
      name: failureName,
      at: Date.now(),
    });
    render();
  }

  if (state.mode === "tama" && (state.tama?.acquired || state.tama?.pendingResolution)) {
    const beforeTamaResult = snapshotState(state);
    finishTamaChallenge();
    resetCurrentGamesAfterPayoutMode(beforeTamaResult, state);
    render();
    playTransitionSounds(beforeTamaResult, state);
    window.ShibakuEffects?.transition(beforeTamaResult, state);
  }

  if (resolver) {
    resolver();
  }
}

async function autoStopPendingSpin() {
  const pending = ui.pendingSpin;
  const generation = ui.autoGeneration;
  while (state.auto && ui.pendingSpin === pending && generation === ui.autoGeneration && pending?.nextStop < 3) {
    await sleep(scaledDelay(120, 40));
    if (!state.auto || ui.pendingSpin !== pending || generation !== ui.autoGeneration) {
      break;
    }
    await stopReel(ui.pendingSpin.stopOrder[ui.pendingSpin.nextStop]);
  }
}

async function performMainActionOnce(force = null, operationGeneration = ui.operationGeneration) {
  if (state.cz?.pushPending || ui.battleRevealing) return;
  if (ui.spinning) {
    return ui.pendingSpin?.finishPromise;
  }
  if (actionLockRemaining() > 0) {
    return Promise.resolve();
  }

  dismissChallengeFailure();

  await unlockAudio();
  if (operationGeneration !== ui.operationGeneration) {
    return Promise.resolve();
  }

  if (!shouldAnimateAction(force)) {
    const beforeState = snapshotState(state);
    executeGameStep(force);
    render();
    playTransitionSounds(beforeState, state);
    playResultSound(state);
    window.ShibakuEffects?.transition(beforeState, state);
    return Promise.resolve();
  }

  const beforeState = snapshotState(state);
  executeGameStep(force);
  const afterState = snapshotState(state);
  state = beforeState;

  return beginPendingSpin(afterState, force);
}

async function performMainAction(force = null) {
  if (ui.mainActionPromise) {
    return ui.mainActionPromise;
  }
  const beforeState = snapshotState(state);
  const activePromise = performMainActionOnce(force, ui.operationGeneration);
  ui.mainActionPromise = activePromise;
  try {
    return await activePromise;
  } catch (error) {
    if (!(error instanceof ReelControlError)) throw error;
    recoverReelSpin(error, beforeState, "spin");
  } finally {
    if (ui.mainActionPromise === activePromise) {
      ui.mainActionPromise = null;
    }
  }
}

function handleForce(force) {
  clearBanner();
  const forcedRoleKey = FORCED_ROLE_BY_ACTION[force];
  if (forcedRoleKey) {
    if (forcedRoleKey === "barLine" && (state.mode === "normal" || state.mode === "revival")) {
      showBanner("通常時BAR揃いは禁止されています", "warning");
      logEvent("演出テスト: BAR揃いはBONUS/BOOST中のみ実行可能", "rare");
      return;
    }
    if (state.mode === "bonus") {
      spinBonus(force);
    } else if (state.mode === "at") {
      spinAT(force);
    } else if (state.mode === "tama") {
      spinTama(force);
    } else if (state.mode === "bt") {
      spinBT(force);
    } else if (state.mode === "cz") {
      spinCZ(force);
    } else if (state.mode === "revival") {
      spinRevival(force);
    } else if (state.mode === "normal") {
      spinNormal(force);
    } else {
      showBanner("この状態では役テストを実行できません", "warning");
    }
    return;
  }
  switch (force) {
    case "weakRare": {
      // C7: legacy aggregate role tests are normal-mode only.
      if (state.mode === "normal") {
        spinNormal(force);
        break;
      }
      showBanner("この状態では役テストを実行できません", "warning");
      break;
    }
    case "strongRare": {
      // C7: legacy aggregate role tests are normal-mode only.
      if (state.mode === "normal") {
        spinNormal(force);
        break;
      }
      showBanner("この状態では役テストを実行できません", "warning");
      break;
    }
    case "normalCz":
      enterCZ("baba", { fromNormal: true });
      break;
    case "unkoCz":
      enterCZ("unko", { allowUpgrade: false });
      break;
    case "shibakuCz":
      enterCZ("shibaku", { allowUpgrade: false });
      break;
    case "regBonus":
      enterBonus("REG", "デバッグ");
      break;
    case "bigBonus":
      enterBonus(chance(0.5) ? "RED_BIG" : "BLUE_BIG", "デバッグ");
      break;
    case "redBigBonus":
      enterBonus("RED_BIG", "デバッグ");
      break;
    case "blueBigBonus":
      enterBonus("BLUE_BIG", "デバッグ");
      break;
    case "middleCherry":
      if (state.mode === "bonus") {
        spinBonus(force);
        break;
      }
      spinNormal(force);
      break;
    case "btStandard":
      enterBT(false);
      break;
    case "btBlue":
      enterBT(true);
      break;
    case "goldReg":
      enterBonus("GOLD_REG", "デバッグ");
      break;
    default:
      break;
  }
}

function resetAll() {
  ui.counterTamaHits = 0;
  const resolver = ui.pendingSpin?.finishResolver;
  ui.operationGeneration += 1;
  ui.battleWaitResolver?.();
  ui.battleWaitResolver = null;
  ui.battleWaitPromise = null;
  ui.battleRevealing = false;
  ui.battleCharging = false;
  ui.reelFreezeActive = false;
  ui.battleFailureSound = null;
  ui.autoGeneration += 1;
  ui.mainActionPromise = null;
  state = createInitialState();
  stopSpinLoop();
  ui.spinning = false;
  ui.spinningReels = [false, false, false];
  ui.deceleratingReels = [false, false, false];
  ui.displayReels = null;
  ui.pendingSpin = null;
  ui.challengeFailure = null;
  ui.tamaFreezeActive = false;
  ui.atReturnMusicActive = false;
  ui.czFailedThisGame = false;
  stopAllSoundEffects();
  window.ShibakuEffects?.reset?.();
  window.ShibakuEffects?.clearChallengeFailure(state);
  window.ShibakuEffects?.clearBabaThirdHit?.();
  ui.actionLockedUntil = 0;
  ui.actionLockReason = "";
  if (ui.actionLockTimer) {
    window.clearTimeout(ui.actionLockTimer);
    ui.actionLockTimer = null;
  }
  if (resolver) {
    resolver();
  }
  logEvent("デモを初期化しました");
  render();
}

const reelDomCache = new WeakMap();
let cachedSymbolStep = null;
function renderReels() {
  const visibleReels = ui.displayReels || state.reels;
  const symbolStep = cachedSymbolStep ?? (cachedSymbolStep = currentSymbolStepPx());
  dom.reels.forEach((reelNode, reelIndex) => {
    const displayedPosition = ui.spinning
      ? ui.reelPositions[reelIndex]
      : state.reelStops[reelIndex];
    reelNode.dataset.position = Number(displayedPosition || 0).toFixed(3);
    reelNode.dataset.target = String(ui.pendingSpin?.afterState?.reelStops?.[reelIndex] ?? state.reelStops[reelIndex]);
    reelNode.dataset.phase = ui.deceleratingReels[reelIndex]
      ? "decelerating"
      : ui.spinningReels[reelIndex]
        ? "spinning"
        : "stopped";
    reelNode.classList.toggle("spinning", ui.spinningReels[reelIndex]);

    if (ui.spinningReels[reelIndex]) {
      const strip = REEL_STRIPS[reelIndex];
      const position = ui.reelPositions[reelIndex] || 0;
      const base = Math.floor(position);
      const frac = position - base;
      let cache = reelDomCache.get(reelNode);
      if (!cache?.track || cache.base !== base) {
        const track = document.createElement("div");
        track.className = "reel-track";
        for (let offset = 0; offset <= 5; offset += 1) {
          const symbol = strip[wrapIndex(base + offset, strip.length)];
          track.appendChild(createSymbolNode(symbol, offset === 1));
        }
        reelNode.replaceChildren(track);
        cache = { track, base };
        reelDomCache.set(reelNode, cache);
      }
      const track = cache.track;
      track.style.transform = `translateY(${-frac * symbolStep}px)`;
      return;
    }
    const key = visibleReels[reelIndex].join("|");
    if (reelDomCache.get(reelNode)?.key !== key) {
      reelNode.replaceChildren(...visibleReels[reelIndex].map((symbol, rowIndex) => createSymbolNode(symbol, rowIndex === 1)));
      reelDomCache.set(reelNode, { key });
    }
  });
  dom.machineWindow.classList.toggle("is-spinning", ui.spinning);
}

function renderRoadmap() {
  dom.roadmapList.replaceChildren();
}

function renderLogs() {
  dom.logList.innerHTML = "";
  state.log.forEach((entry) => {
    const li = document.createElement("li");
    li.className = `log-item ${entry.tone}`.trim();
    li.innerHTML = `<span class="log-time">${entry.stamp}</span><strong>${entry.message}</strong>`;
    dom.logList.appendChild(li);
  });
}

function detailRows() {
  const visibleHit = state.displayHit;
  const hitText = state.displayRoleKey === "miss"
    ? "ハズレ"
    : visibleHit
      ? `${visibleHit.roleName} / ${visibleHit.paylineName}`
    : "ハズレ";

  if (state.mode === "normal") return [["現在G", `${state.currentGames}G`], ["成立役", hitText]];
  if (state.mode === "bt") return [["状態", "BONUS TRIGGER"], ["成立役", hitText]];

  if (state.mode === "cz" && state.cz) {
    if (state.cz.key === "baba") {
      return [
        ["CZ名", state.cz.name],
        ["挟み目", `${state.cz.babaSandwichHits || 0}/3回`],
        ["狙い目", "左リール BAR・リプレイ・BAR"],
        ["残りG", `${state.cz.gamesLeft}G`],
        ["突破条件", "挟み目3回成功"],
        ["成立役", hitText],
      ];
    }
    return [
      ["CZ名", state.cz.name],
      ["残りG", `${state.cz.gamesLeft}G`],
      ["突破期待度", "液晶演出で示唆"],
      ["BONUS移行", state.cz.key === "tenjo" ? "突破でBONUS確定" : "成功でBONUS以上"],
      ["成立役", hitText],
    ];
  }

  if (state.mode === "bonus" && state.bonus) {
    return [
      ["ボーナス", bonusDisplayName(state.bonus.type)],
      ["獲得枚数", `${state.bonus.coins}/${state.bonus.maxCoins}枚`],
      ["今回払出", `${state.bonus.lastPayout ?? 0}枚`],
      ["BGM", state.bonus.song],
      ["押し順ナビ", state.pushNaviText || "9枚ベル - 3BET = 純増6枚"],
      ["成立役", hitText],
    ];
  }

  if (state.mode === "bonusReady" && state.bonusReady) {
    return [
      ["状態", "BONUS確定"],
    ];
  }

  if (state.mode === "at" && state.at) {
    return [
      ["AT", state.at.ura ? "開開米ブースト" : "開米ブースト"],
      ["残りR", `${state.at.rounds}R`],
      ["現在R", `${state.at.currentRoundGame}/10G`],
      ["BOOST獲得", `${state.at.coins ?? 0}枚`],
      ["押し順ナビ", state.pushNaviText || "ベルナビ待機"],
      ["今回払出", `${state.at.lastPayout ?? 0}枚`],
      ["玉成功", `${state.at.tamaCount}回`],
      ["成立役", hitText],
    ];
  }

  if (state.mode === "tama") {
    return [
      ["区間", "玉チャレンジ 3G"],
      ["残りG", `${state.tama?.gamesLeft ?? 3}G`],
      ["告知契機", "SPIN / 第1 / 第2 / 第3停止"],
      ["成功時", "玉獲得 +1R"],
      ["成立役", hitText],
    ];
  }

  if (state.mode === "ending") {
    const endingDelta = state.lastEndingDelta ?? state.endingTriggerDelta;
    return [
      ["到達契機", `BOOST獲得+${endingDelta}枚到達`],
      ["獲得管理", "BOOST突入時からの差枚基準"],
      ["次アクション", "SPINで裏ルートへ"],
      ["恩恵", "有利区間リセット後に裏上位CZ"],
      ["備考", "60G引き戻しは裏ルート転落時のみ"],
    ];
  }

  if (state.mode === "revival" && state.revival) {
    return [
      ["救済", "60G引き戻し"],
      ["残りG", `${state.revival.gamesLeft}G`],
      ["直撃率", "約1/120"],
      ["告知", "第1〜第3停止ステップアップ"],
      ["成立役", hitText],
    ];
  }

  return [["状態", "通常待機"]];
}

function renderDetails() {
  dom.detailPanel.innerHTML = "";
  detailRows().forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "detail-row";
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    dom.detailPanel.appendChild(row);
  });
}

function formatOccurrenceRate(count, denominator = state.totalGames) {
  if (!count || denominator <= 0) {
    return "--";
  }
  return `1/${Math.max(1, Math.round(denominator / count))}`;
}

function formatPercentRate(successes, attempts) {
  if (!attempts) {
    return "--";
  }
  return `${Math.round((successes / attempts) * 100)}%`;
}

function renderStats() {
  if (!dom.deltaChart || !state.stats) {
    return;
  }

  const points = state.stats.deltaGraph;
  if (points.length < 2) {
    dom.deltaChart.innerHTML = '<div class="chart-empty">50Gごとに差枚を記録</div>';
  } else {
    const width = 620;
    const height = 180;
    const padding = 18;
    const minDelta = Math.min(...points.map((point) => point.delta), 0);
    const maxDelta = Math.max(...points.map((point) => point.delta), 0);
    const deltaRange = Math.max(1, maxDelta - minDelta);
    const maxGame = points[points.length - 1].game || 50;
    const toX = (game) => padding + (game / maxGame) * (width - padding * 2);
    const toY = (delta) => height - padding - ((delta - minDelta) / deltaRange) * (height - padding * 2);
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.game).toFixed(1)} ${toY(point.delta).toFixed(1)}`).join(" ");
    const zeroY = toY(0).toFixed(1);
    const yTicks = [maxDelta, Math.round((maxDelta + minDelta) / 2), minDelta];
    const xTicks = [0, Math.round(maxGame / 2), maxGame];
    const yTickMarkup = yTicks
      .map((value) => {
        const y = toY(value).toFixed(1);
        return `
          <line class="chart-tick" x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" />
          <text class="chart-label" x="6" y="${y}" dominant-baseline="middle">${value}枚</text>
        `;
      })
      .join("");
    const xTickMarkup = xTicks
      .map((value) => {
        const x = toX(value).toFixed(1);
        return `
          <line class="chart-tick" x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}" />
          <text class="chart-label" x="${x}" y="${height - 4}" text-anchor="middle">${value}G</text>
        `;
      })
      .join("");
    const dots = points
      .slice(-10)
      .map((point) => `<circle class="chart-dot" cx="${toX(point.game).toFixed(1)}" cy="${toY(point.delta).toFixed(1)}" r="3" />`)
      .join("");
    dom.deltaChart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="差枚グラフ">
        ${yTickMarkup}
        ${xTickMarkup}
        <line class="chart-axis" x1="${padding}" y1="${zeroY}" x2="${width - padding}" y2="${zeroY}" />
        <path class="chart-line" d="${path}" />
        ${dots}
      </svg>
    `;
  }

  dom.bonusRateLabel.textContent = formatOccurrenceRate(state.stats.bigHits + state.stats.regHits, state.stats.normalGames);
  dom.bigRateLabel.textContent = formatOccurrenceRate(state.stats.bigHits, state.stats.normalGames);
  dom.regRateLabel.textContent = formatOccurrenceRate(state.stats.regHits, state.stats.normalGames);
  dom.czEntryRateLabel.textContent = formatOccurrenceRate(state.stats.czEntries, state.stats.normalGames);
  const totalCzResults = state.stats.czSuccesses + state.stats.czFails;
  dom.czSuccessRateLabel.textContent = totalCzResults ? `${Math.round((state.stats.czSuccesses / totalCzResults) * 100)}%` : "--";
  const czByType = state.stats.czByType || {};
  if (dom.unkoCzSuccessRateLabel) {
    dom.unkoCzSuccessRateLabel.textContent = formatPercentRate(czByType.unko?.successes || 0, czByType.unko?.entries || 0);
  }
  if (dom.babaCzSuccessRateLabel) {
    dom.babaCzSuccessRateLabel.textContent = formatPercentRate(czByType.baba?.successes || 0, czByType.baba?.entries || 0);
  }
  if (dom.shibakuCzSuccessRateLabel) {
    dom.shibakuCzSuccessRateLabel.textContent = formatPercentRate(czByType.shibaku?.successes || 0, czByType.shibaku?.entries || 0);
  }
}

function renderBanner() {
  dom.banner.textContent = state.banner;
  dom.banner.className = `banner ${state.banner ? "" : "hidden"} ${state.bannerTone}`.trim();
}

function renderPushNavi() {
  const sourceState = pendingDisplayState();
  document.querySelectorAll('[data-navi-reel]').forEach(node => {
    const reel = Number(node.dataset.naviReel);
    const pending = ui.pendingSpin;
    node.classList.toggle('navi-done', Boolean(pending) && !ui.spinningReels[reel]);
    node.classList.toggle('navi-next', Boolean(pending) && pending.stopOrder[pending.nextStop] === reel);
  });
  const visible =
    Boolean(sourceState.pushNaviOrder?.length) &&
    (sourceState.mode === "bonus" || sourceState.mode === "at" || ui.spinning);
  dom.pushNavi.classList.toggle("hidden", !visible);
  dom.pushNaviText.textContent = visible ? sourceState.pushNaviText : "--";
}

function renderSummary() {
  const gate = null;
  const routeBase = "BT";
  const routeText = state.bonusReturnHighGames > 0 ? `${routeBase} / 引き戻し高確` : routeBase;
  dom.modeLabel.textContent = modeName();
  dom.stageLabel.textContent = state.stage;
  dom.sectionGamesLabel.textContent = `${pendingDisplayState().currentGames}G`;
  dom.sectionDeltaLabel.textContent = `${state.totalDelta}枚`;
  if (dom.dataBigCountLabel) {
    dom.dataBigCountLabel.dataset.count = String(state.stats.bigHits + ui.counterTamaHits);
    dom.dataBigCountLabel.textContent = formatOccurrenceRate(state.stats.bigHits + ui.counterTamaHits, state.stats.normalGames);
    dom.dataBigCountLabel.closest(".counter-cell")?.classList.toggle("bonus-running", (state.mode === "bonus" && state.bonus?.type !== "REG") || state.mode === "at" || state.mode === "tama");
  }
  if (dom.dataRegCountLabel) {
    dom.dataRegCountLabel.dataset.count = String(state.stats.regHits);
    dom.dataRegCountLabel.textContent = formatOccurrenceRate(state.stats.regHits, state.stats.normalGames);
    dom.dataRegCountLabel.closest(".counter-cell")?.classList.toggle("bonus-running", state.mode === "bonus" && state.bonus?.type === "REG");
  }
  if (dom.dataCzCountLabel) dom.dataCzCountLabel.textContent = String(state.stats.czEntries);
  if (dom.dataLastBonusGamesLabel) dom.dataLastBonusGamesLabel.textContent = `${state.currentGames}G`;
  if (dom.creditLabel) dom.creditLabel.textContent = "--";
  if (dom.payoutLabel) dom.payoutLabel.textContent = String(ui.spinning ? 0 : state.settledPayout || 0);
  dom.totalGamesLabel.textContent = `${state.totalGames}G`;
  dom.totalDeltaLabel.textContent = `${state.totalDelta}枚`;
  dom.actualSettingLabel.textContent = state.showActualSetting ? `設定${state.actualSetting}` : "?";
  dom.bgmLabel.textContent = state.bgm;
  dom.modeSummary.textContent = routeText;
  const naviState = pendingDisplayState();
  const naviVisible = (naviState.mode === "bonus" || naviState.mode === "at" || ui.spinning) && naviState.pushNaviText;
  if (naviState.mode === "cz" && naviState.cz) {
    dom.detailBadge.textContent = `CZ 残り${naviState.cz.gamesLeft}G`;
  } else if (naviState.mode === "bt") {
    dom.detailBadge.textContent = "BONUS TRIGGER";
  } else if (naviState.mode === "bonusReady" && naviState.bonusReady) {
    dom.detailBadge.textContent = "BONUS確定";
  } else if (naviState.mode === "bonus" && naviState.bonus) {
    dom.detailBadge.textContent = `BONUS 残り${naviState.bonus.gamesLeft}G`;
  } else if (naviState.mode === "tama" && naviState.tama) {
    dom.detailBadge.textContent = `玉チャレンジ 残り${naviState.tama.gamesLeft}G`;
  } else if (naviState.mode === "at" && naviState.at) {
    dom.detailBadge.textContent = `R${naviState.at.rounds} / 残り${Math.max(0, 10 - naviState.at.currentRoundGame)}G`;
  } else {
    dom.detailBadge.textContent = naviVisible ? naviState.pushNaviText : `CURRENT ${state.currentGames}G`;
  }
  if (ui.challengeFailure) {
    dom.modeLabel.textContent = "チャレンジ結果";
    dom.bgmLabel.textContent = "失敗BGM";
    dom.detailBadge.textContent = "次SPINで通常へ";
  }
  dom.routeLabel.textContent = routeText;
  dom.nextGateLabel.textContent = gate ? `${gate.game}G` : "--";
  dom.ceilingLabel.textContent = "";
  dom.normalModeLabel.textContent = "内部非公開";
  dom.settingDesignText.textContent = "";
  dom.atStatusLabel.textContent = state.at ? `${state.at.ura ? "開開米" : "開米"} ${state.at.rounds}R` : "待機中";
  dom.tamaStatusLabel.textContent = state.mode === "tama"
    ? `挑戦中 残り${state.tama?.gamesLeft ?? 3}G`
    : state.at
      ? `${state.at.tamaCount}回成功`
      : "未突入";
  dom.premiumLabel.textContent = state.premium489 ? "出現済" : "未出現";
  document.documentElement.dataset.resultCounter = JSON.stringify({
    dryGames: state.resultDryGames || 0,
    resetAt: RESULT_DRY_RESET_GAMES,
    baselineDelta: state.lowestTotalDelta ?? 0,
    currentDelta: state.totalDelta,
    currentGames: state.currentGames || 0,
  });
}

function renderVolumeMeter(meter, level) {
  if (!meter) return;
  [...meter.children].forEach((segment, index) => {
    segment.classList.toggle("active", index < level);
  });
}

function renderButtons() {
  dom.autoButton.textContent = state.auto ? "AUTO ON" : "AUTO OFF";
  dom.autoButton.classList.toggle("active", state.auto);
  dom.speed1Button.classList.toggle("active", ui.autoSpeed === 1);
  dom.speed2Button.classList.toggle("active", ui.autoSpeed === 2);
  dom.speed3Button.classList.toggle("active", ui.autoSpeed === 3);
  dom.debugFastButton.textContent = ui.debugFast ? "DEBUG FAST ON" : "DEBUG FAST";
  dom.debugFastButton.classList.toggle("active", ui.debugFast);
  dom.overdriveButton.classList.toggle("hidden", !ui.debugFast);
  dom.overdriveButton.classList.toggle("active", ui.overdrive);
  dom.overdriveButton.textContent = ui.overdrive ? "OVERDRIVE x100 ON" : "OVERDRIVE x100";
  dom.czGuaranteedButton.classList.toggle("active", ui.debugCzGuaranteed);
  dom.czGuaranteedButton.textContent = ui.debugCzGuaranteed ? "CZ 100% ON" : "CZ 100% OFF";
  dom.debugStageButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.debugStage === state.stage);
  });
  dom.soundButton.textContent = ui.soundEnabled ? "SOUND ON" : "SOUND OFF";
  dom.soundButton.classList.toggle("active", ui.soundEnabled);
  if (dom.soundVolumeLabel) {
    dom.soundVolumeLabel.textContent = `${ui.soundVolumeLevel} / ${VOLUME_LEVEL_MAX}`;
  }
  if (dom.musicVolumeLabel) {
    dom.musicVolumeLabel.textContent = `${ui.musicVolumeLevel} / ${VOLUME_LEVEL_MAX}`;
  }
  renderVolumeMeter(dom.soundVolumeMeter, ui.soundVolumeLevel);
  renderVolumeMeter(dom.musicVolumeMeter, ui.musicVolumeLevel);
  dom.soundVolumeDown.disabled = ui.soundVolumeLevel <= 1;
  dom.soundVolumeUp.disabled = ui.soundVolumeLevel >= VOLUME_LEVEL_MAX;
  dom.musicVolumeDown.disabled = ui.musicVolumeLevel <= 1;
  dom.musicVolumeUp.disabled = ui.musicVolumeLevel >= VOLUME_LEVEL_MAX;

  if (actionLockRemaining() > 0) {
    dom.spinButton.textContent = ui.actionLockReason === "bonus-result" ? "RESULT表示中" : ui.actionLockReason === "bt-result" ? "WAIT" : "BONUS WAIT";
  } else if (ui.spinning) {
    dom.spinButton.textContent = `第${(ui.pendingSpin?.nextStop || 0) + 1}停止`;
  } else if (state.mode === "tama") {
    dom.spinButton.textContent = "玉チャレンジ実行";
  } else if (state.mode === "bonusReady") {
    dom.spinButton.textContent = "BONUS図柄を狙う";
  } else if (state.mode === "ending") {
    dom.spinButton.textContent = "裏ルートへ";
  } else {
    dom.spinButton.textContent = "SPIN 1G";
  }

  dom.stopButtons.forEach((button, index) => {
    const orderIndex = ui.pendingSpin?.stopOrder?.indexOf(index);
    const orderText = ui.pendingSpin?.stopOrder ? `${orderIndex + 1} ` : "";
    button.textContent = `${orderText}${["左停止", "中停止", "右停止"][index]}`;
    button.classList.toggle("active", ui.spinning && ui.pendingSpin?.stopOrder?.[ui.pendingSpin.nextStop] === index);
  });
}

function renderInteractivity() {
  const maxBet = document.querySelector("#maxBetButton");
  const locked = actionLockRemaining() > 0;
  const frozen = ui.tamaFreezeActive || ui.reelFreezeActive || Boolean(state.cz?.pushPending) || ui.battleRevealing;
  const battlePush = document.querySelector("#battlePushButton");
  if (battlePush) {
    const pushReady = Boolean(state.cz?.pushPending) && !ui.battleRevealing && !ui.battleCharging;
    const noticePush = ui.spinning && Boolean(window.ShibakuEffects?.noticePushArmed?.());
    battlePush.disabled = !pushReady && !noticePush;
    battlePush.classList.toggle("is-ready", pushReady);
  }
  const nonSpinAction = ui.spinning || state.auto || locked || frozen;
  dom.spinButton.disabled = state.auto || locked || frozen || (ui.spinning && Boolean(ui.pendingSpin?.resolving));
  if (maxBet) maxBet.disabled = ui.spinning || dom.spinButton.disabled;
  dom.resetButton.disabled = false;
  dom.settingSelect.disabled = nonSpinAction;
  dom.speed1Button.disabled = false;
  dom.speed2Button.disabled = false;
  dom.speed3Button.disabled = false;
  dom.debugFastButton.disabled = false;
  dom.overdriveButton.disabled = !ui.debugFast;
  dom.czGuaranteedButton.disabled = nonSpinAction;
  dom.debugButtons.forEach((button) => {
    button.disabled = nonSpinAction;
  });
  dom.debugStageButtons.forEach((button) => {
    button.disabled = nonSpinAction || state.mode !== "normal";
  });
  dom.stopButtons.forEach((button, index) => {
    button.disabled = frozen || !ui.spinning || ui.pendingSpin?.resolving || ui.pendingSpin?.stopOrder?.[ui.pendingSpin.nextStop] !== index;
  });
}

function pendingDisplayState() {
  const afterState = ui.pendingSpin?.afterState;
  if (!afterState || afterState.mode !== state.mode) {
    return state;
  }
  if (afterState.mode === "bt") {
    return {...afterState, btView:{misses:state.bt.misses, result:null, rolling:true, stops:ui.pendingSpin.nextStop}};
  }
  if (afterState.mode === "cz" && afterState.cz) {
    const sandwichNotYetStopped = afterState.cz.key === "baba"
      && afterState.cz.babaSandwichHitThisGame
      && ui.pendingSpin?.nextStop === 0;
    return {
      ...afterState,
      cz: {
        ...afterState.cz,
        gamesLeft: sandwichNotYetStopped
          ? afterState.cz.babaGamesLeftAtLeverOn
          : Math.min(afterState.cz.games, afterState.cz.gamesLeft + 1),
        babaSandwichHits: sandwichNotYetStopped
          ? Math.max(0, afterState.cz.babaSandwichHits - 1)
          : afterState.cz.babaSandwichHits,
      },
    };
  }
  return afterState;
}

function render() {
  renderReels();
  renderRoadmap();
  renderLogs();
  renderDetails();
  renderStats();
  renderBanner();
  renderPushNavi();
  renderSummary();
  renderButtons();
  renderInteractivity();
  syncBonusMusic();
  window.ShibakuEffects?.update(pendingDisplayState());
}

async function runAutoLoop(generation = ui.autoGeneration) {
  while (state.auto && generation === ui.autoGeneration) {
    if (ui.battleWaitPromise) {
      if (ui.debugFast) revealBattlePush();
      await ui.battleWaitPromise;
      if (!state.auto || generation !== ui.autoGeneration) break;
      if (ui.czFailedThisGame && !ui.debugFast) await sleep(2000);
      ui.czFailedThisGame = false;
      continue;
    }
    const lockRemaining = actionLockRemaining();
    if (lockRemaining > 0) {
      await sleep(lockRemaining + 20);
      continue;
    }
    await performMainAction();
    if (!state.auto || generation !== ui.autoGeneration) break;
    if (ui.czFailedThisGame && !ui.debugFast) {
      await sleep(2000);
      ui.czFailedThisGame = false;
    } else if (state.mode === "bt" || state.btView?.result === "end") {
      await sleep(scaledDelay(600, 20));
    } else {
      await sleep(scaledDelay(90, 20));
    }
  }
}

function injectStopButtons() {
  const panel = document.createElement("div");
  panel.className = "stop-panel";
  ["左停止", "中停止", "右停止"].forEach((label, index) => {
    const button = document.createElement("button");
    button.className = "stop-button";
    button.dataset.stop = String(index);
    button.textContent = label;
    panel.appendChild(button);
    dom.stopButtons.push(button);
  });
  dom.machineWindow.insertAdjacentElement("afterend", panel);
}

function activateSpinControl() {
  if (dom.spinButton.disabled) return;
  if (ui.spinning) {
    if (ui.pendingSpin && !ui.pendingSpin.resolving) {
      const requiredReel = ui.pendingSpin.stopOrder[ui.pendingSpin.nextStop];
      stopReel(requiredReel);
    }
    return;
  }
  performMainAction();
}

const reelResizeObserver = new ResizeObserver(() => {
  cachedSymbolStep = currentSymbolStepPx();
  const host = document.querySelector("#reels");
  if (!host || dom.reels.length !== 3) return;
  const dx = dom.reels[2].offsetLeft + dom.reels[2].offsetWidth / 2 - dom.reels[0].offsetLeft - dom.reels[0].offsetWidth / 2;
  const angle = Math.atan2(cachedSymbolStep * 2, dx) * 180 / Math.PI;
  host.style.setProperty("--payline-angle", `${angle}deg`);
  host.style.setProperty("--payline-length", `${Math.hypot(dx, cachedSymbolStep * 2)}px`);
});
dom.reels.forEach((reel) => reelResizeObserver.observe(reel));

dom.spinButton.addEventListener("click", activateSpinControl);

window.addEventListener("keydown", (event) => {
  // A4: Enter presses the lit PUSH dome during a spin (Space keeps stopping reels).
  if (event.code === "Enter" && !event.repeat && ui.spinning && !event.target?.closest?.("button, input, select, textarea, .cabinet-drawer")) {
    if (pressNoticePush()) event.preventDefault();
    return;
  }
  const reelKey = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[event.code];
  if ((event.code !== "Space" && reelKey === undefined) || event.repeat) return;
  const target = event.target;
  if (target?.closest?.(".cabinet-drawer, .cabinet-confirm")) return;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) {
    return;
  }
  event.preventDefault();
  if (reelKey !== undefined) {
    if (ui.spinning && ui.pendingSpin && !ui.pendingSpin.resolving) stopReel(reelKey);
    return;
  }
  if (state.cz?.pushPending) {
    revealBattlePush();
    return;
  }
  activateSpinControl();
});

// A4: the lit PUSH dome during a normal spin reveals the notice color.
function pressNoticePush() {
  if (!window.ShibakuEffects?.noticePush?.()) return false;
  renderInteractivity();
  return true;
}

document.querySelector("#battlePushButton")?.addEventListener("click", () => {
  if (pressNoticePush()) return;
  revealBattlePush();
});

dom.autoButton.addEventListener("click", () => {
  state.auto = !state.auto;
  ui.autoGeneration += 1;
  const generation = ui.autoGeneration;
  render();
  if (state.auto) {
    unlockAudio();
    if (ui.spinning) {
      autoStopPendingSpin().then(() => {
        if (state.auto && generation === ui.autoGeneration) {
          runAutoLoop(generation);
        }
      });
      return;
    }
    runAutoLoop(generation);
  }
});

[dom.speed1Button, dom.speed2Button, dom.speed3Button].forEach((button, index) => {
  button.addEventListener("click", () => {
    ui.autoSpeed = index + 1;
    render();
  });
});

dom.debugFastButton.addEventListener("click", () => {
  ui.debugFast = !ui.debugFast;
  if (!ui.debugFast) ui.overdrive = false;
  render();
  if (ui.debugFast && state.cz?.pushPending) revealBattlePush();
});

dom.overdriveButton.addEventListener("click", () => {
  if (!ui.debugFast) return;
  ui.overdrive = !ui.overdrive;
  render();
});

dom.czGuaranteedButton.addEventListener("click", () => {
  ui.debugCzGuaranteed = !ui.debugCzGuaranteed;
  render();
});

dom.resetButton.addEventListener("click", async () => {
  const confirmed = window.ShibakuCabinet?.confirmReset
    ? await window.ShibakuCabinet.confirmReset()
    : window.confirm("本当にリセットしますか？");
  if (!confirmed) {
    return;
  }
  const previousSetting = state.actualSetting;
  alertSettingResult(previousSetting, "reset");
  state.auto = false;
  resetAll();
});

window.addEventListener("beforeunload", (event) => {
  storeReloadSettingResult();
  event.preventDefault();
  event.returnValue = "本当にリセットしますか？";
});

dom.settingSelect.addEventListener("change", () => {
  resetAll();
});

dom.debugButtons.forEach((button) => {
  button.addEventListener("click", () => {
    performMainAction(button.dataset.force);
  });
});

dom.debugStageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (ui.spinning || state.auto || state.mode !== "normal") return;
    const previousStage = state.stage;
    state.stage = button.dataset.debugStage;
    if (previousStage !== state.stage) playStageShiftSound();
    render();
  });
});

dom.soundButton.addEventListener("click", async () => {
  ui.soundEnabled = !ui.soundEnabled;
  if (ui.soundEnabled) {
    await unlockAudio();
    playBeep({ frequency: 520, rampTo: 700, duration: 0.08, gain: 0.022, type: "triangle" });
  } else {
    stopAllSoundEffects();
  }
  render();
});

async function changeSoundVolume(delta) {
  applySoundVolumeLevel(ui.soundVolumeLevel + delta);
  renderButtons();
  if (ui.soundEnabled) {
    await unlockAudio();
    playBeep({ frequency: 600, rampTo: 760, duration: 0.06, gain: 0.022, type: "triangle" });
  }
}

function changeMusicVolume(delta) {
  applyMusicVolumeLevel(ui.musicVolumeLevel + delta);
  renderButtons();
}

dom.soundVolumeDown.addEventListener("click", () => changeSoundVolume(-1));
dom.soundVolumeUp.addEventListener("click", () => changeSoundVolume(1));
dom.musicVolumeDown.addEventListener("click", () => changeMusicVolume(-1));
dom.musicVolumeUp.addEventListener("click", () => changeMusicVolume(1));

injectStopButtons();
dom.stopButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    stopReel(index);
  });
});

ensureReelLayoutCatalog();
logEvent("デモを起動しました");
ensureBonusMusicElements();
ensureSoundEffectElements();
window.ShibakuFx?.configure({
  context: () => ui.audioContext,
  volume: () => ui.soundVolume,
  enabled: () => ui.soundEnabled,
});
if (window.ShibakuEffects) window.ShibakuEffects.onNoticeArmed = () => renderInteractivity();
window.ShibakuEffects?.init(
  document.querySelector("#effectStage"),
  document.querySelector("#lcdStage"),
);
render();
restoreReloadSettingResult();
} catch (error) {
  if (!(error instanceof window.ShibakuReelControl.ReelControlError)) throw error;
  // Invalid startup tables cannot be safely guessed. Fail closed without a crash loop.
  document.querySelectorAll("#spinButton, #autoButton, [data-stop], [data-force]")
    .forEach(button => { button.disabled = true; });
  reportReelFault(error, "startup-disabled");
}
