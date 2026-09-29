(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const normalCue = new window.ShibakuNormalCue.NormalCue();
  const cueRandomBuffer = new Uint32Array(1);
  // Separate, local PRNG fallback for file/offline environments without crypto.
  let cueSeed = (Date.now() ^ 0x6d2b79f5) >>> 0;
  function cueRandom() {
    if(window.crypto?.getRandomValues){window.crypto.getRandomValues(cueRandomBuffer);return cueRandomBuffer[0]/4294967296;}
    cueSeed ^= cueSeed << 13;cueSeed ^= cueSeed >>> 17;cueSeed ^= cueSeed << 5;
    return (cueSeed >>> 0)/4294967296;
  }
  const api = {
    ready: false,
    intensity: 0.25,
    targetIntensity: 0.25,
    burst: 0,
    hue: "normal",
    lcdMode: "normal",
    bonusType: null,
    resultUntil: 0,
    challengeFailureHeld: false,
    latestState: null,
    abstractScene: null,
    reelStageController: null,
  };

  let effectGeneration = 0;
  let presentationToken = 0;
  const effectTimers = new Set();
  function scheduleEffect(callback, delay) {
    const generation = effectGeneration;
    const timer = window.setTimeout(() => {
      effectTimers.delete(timer);
      if (generation === effectGeneration) callback();
    }, delay);
    effectTimers.add(timer);
    return timer;
  }
  function holdPresentation(duration) {
    api.resultUntil = Date.now() + duration;
    return ++presentationToken;
  }
  function schedulePresentation(token, callback, delay) {
    return scheduleEffect(() => {
      if (token === presentationToken) callback();
    }, delay);
  }
  api.reset = () => {
    window.ShibakuBTPresentation?.hide();
    normalCue.cancel();
    effectGeneration += 1;
    presentationToken += 1;
    effectTimers.forEach((timer) => window.clearTimeout(timer));
    effectTimers.clear();
    api.resultUntil = 0;
    api.challengeFailureHeld = false;
    api.latestState = null;
    api.burst = 0;
    api.battleHeld = false;
    notices?.clear();
    api.battleEnd?.();
    document.querySelector(".machine-panel")?.classList.remove("baba-third-hit-blackout", "baba-bonus-blackout", "tama-blackout", "middle-cherry-blackout", "tama-acquired-glow", "cz-final", "last-lamp");
    document.querySelector(".machine-panel")?.classList.remove("silence-beat", "reel-freeze");
    document.querySelector(".machine-window")?.classList.remove("reel-flash-blackout", "reel-flash-one", "reel-flash-blink", "reel-flash-fanfare", "lamp-fanfare");
    document.querySelector(".machine-window")?.classList.remove("bell-payout-flash", "baba-sandwich-clear", "baba-bonus-ready-glow", "bonus-confirmed", "bonus-confirm-red", "bonus-confirm-blue", "bonus-confirm-reg", "long-freeze");
    document.querySelector("#effectFlash")?.classList.remove("fire");
  };

  const palettes = {
    normal: [0xffb43b, 0x4b73ff],
    challenge: [0xff315f, 0x9b4dff],
    bonusReady: [0xffd84a, 0xffffff],
    bonusRed: [0xff3028, 0xffd34e],
    bonusBlue: [0x1687ff, 0xd8f3ff],
    bonusReg: [0xffcf3f, 0xef3159],
    boost: [0x32f6a0, 0x26a8ff],
    ending: [0xffffff, 0xffb51e],
  };

  function abstractTheme(mode) {
    const palette = palettes[mode] || palettes.normal;
    const profiles = {
      normal: { emissionIntensity: 0.92, saturation: 0.92, exposure: 0.9, effectIntensity: 0.72 },
      challenge: { emissionIntensity: 1.1, saturation: 1.12, exposure: 1.04, effectIntensity: 1.04 },
      bonusReady: { emissionIntensity: 1.2, saturation: 0.88, exposure: 1.12, effectIntensity: 1.08 },
      bonusRed: { emissionIntensity: 1.16, saturation: 1.08, exposure: 1.05, effectIntensity: 0.94 },
      bonusBlue: { emissionIntensity: 1.13, saturation: 1.02, exposure: 1.04, effectIntensity: 0.92 },
      bonusReg: { emissionIntensity: 1.06, saturation: 1.0, exposure: 1.0, effectIntensity: 0.88 },
      boost: { emissionIntensity: 0.78, saturation: 0.90, exposure: 0.86, effectIntensity: 0.48 },
      ending: { emissionIntensity: 0.86, saturation: 0.82, exposure: 0.92, effectIntensity: 0.55 },
    };
    return {
      primaryColor: palette[0],
      secondaryColor: palette[1],
      accentColor: mode === "ending" ? 0xfff4c4 : 0xffffff,
      backgroundColor: mode === "bonusRed" || mode === "bonusReg" ? 0x080102 : 0x010208,
      ...(profiles[mode] || profiles.normal),
    };
  }

  function syncAbstractTheme(mode, options = {}) {
    api.abstractScene?.setTheme(abstractTheme(mode), options);
  }

  // 10: the unko stage warms and intensifies game by game toward the last.
  function unkoTheme(cz) {
    const progress = cz?.games ? Math.min(1, Math.max(0, 1 - (cz.gamesLeft - 1) / cz.games)) : 0;
    const mix = (a, b) => {
      const ch = (shift) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * progress);
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    };
    return {
      primaryColor: mix(0x85949b, 0xd08a3a),
      secondaryColor: mix(0x4d6472, 0x7a3f1a),
      emissionIntensity: .8 + progress * .55,
      effectIntensity: .6 + progress * .7,
    };
  }

  function syncAbstractStateTheme(mode, state) {
    if (state.mode === "cz") {
      const key = state.cz?.key;
      api.abstractScene?.setTheme({
        ...abstractTheme(mode),
        ...(key === "unko" ? unkoTheme(state.cz)
          : key === "shibaku" ? { primaryColor: 0xe04427, secondaryColor: 0x83c4df, effectIntensity: .65 }
          : { primaryColor: 0xffae30, secondaryColor: 0xda3b23, emissionIntensity: 1 + (state.cz?.babaSandwichHits || 0) * .12 }),
      });
      return;
    }
    if (state.mode !== "tama") {
      syncAbstractTheme(mode);
      return;
    }
    api.abstractScene?.setTheme({
      ...abstractTheme(mode),
      primaryColor: 0xffffff,
      secondaryColor: 0x9a9a9a,
      accentColor: 0xffffff,
      backgroundColor: 0x010101,
      saturation: 0,
    });
  }

  function abstractPresentation(state) {
    if (state.mode === "bt" || state.btView?.result === "end") return {kind:"bonus", variant:1};
    if (state.mode === "cz") {
      const variant = state.cz?.key === "unko" ? 1 : state.cz?.key === "shibaku" ? 2 : 0;
      return { kind: "challenge", variant };
    }
    if (state.mode === "revival") return { kind: "challenge", variant: 2 };
    if (state.mode === "bonusReady") return { kind: "normal", variant: 0 };
    if (state.mode === "bonus") {
      const type = state.bonus?.type || state.bonusReady?.type;
      return { kind: "bonus", variant: type === "BLUE_BIG" ? 1 : type === "REG" ? 2 : 0 };
    }
    if (state.mode === "at" || state.mode === "tama" || state.mode === "ending") {
      return { kind: "boost", variant: state.at?.ura || state.mode === "ending" ? 1 : 0 };
    }
    return { kind: "normal", variant: 0 };
  }

  function syncAbstractPresentation(state, options = {}) {
    const presentation = abstractPresentation(state);
    api.abstractScene?.setPresentation(presentation.kind, presentation.variant, options);
  }

  function flash(tone = "accent") {
    const node = document.querySelector("#effectFlash");
    if (!node) return;
    node.className = `effect-flash fire ${tone}`;
    scheduleEffect(() => { node.className = "effect-flash"; }, reducedMotion.matches ? 80 : 620);
  }

  function visualMode(state) {
    if (state.mode === "bt" || state.btView?.result === "end") return "bonusBlue";
    if (state.mode === "bonusReady") {
      return "bonusReady";
    }
    if (state.mode === "bonus") {
      if (state.bonus?.type === "BLUE_BIG") return "bonusBlue";
      if (state.bonus?.type === "RED_BIG") return "bonusRed";
      if (state.bonus?.type === "GOLD_REG") return "ending";
      return "bonusReg";
    }
    if (state.mode === "cz" || state.mode === "revival") return "challenge";
    if (state.mode === "at" || state.mode === "tama") return "boost";
    if (state.mode === "ending") return "ending";
    return "normal";
  }

  function lcdCopy(state) {
    if (state.mode === "bt" || state.btView?.result === "end") {
      const view = state.btView || {result:state.bt?.lastResult, misses:state.bt?.misses || 0};
      const title = view.rolling ? "BONUS TRIGGER"
        : view.result === "retry" ? "RETRY"
        : view.result === "miss" || view.result === "end" ? `ハズレ 残り${Math.max(0, 3-view.misses)}回`
        : "BONUS TRIGGER";
      return {kicker:"", title, subtitle:"", meter:0};
    }
    if (state.mode === "bonusReady") {
      return {
        kicker: "BONUS CONFIRMED",
        title: "BONUS確定",
        subtitle: "",
        meter: 100,
      };
    }
    if (state.mode === "cz") {
      if (state.cz?.key === "shibaku") {
        return { kicker: "しばくでチャレンジ", title: "しばくでクルー", subtitle: `残り ${state.cz.gamesLeft}G`, meter: 0 };
      }
      if (state.cz?.key === "baba") {
        return {
          kicker: "BABA CHALLENGE / BAR SANDWICH",
          title: `挟み目 ${state.cz.babaSandwichHits || 0} / 3`,
          subtitle: `左リール BAR・リプレイ・BARを狙え　残り ${state.cz.gamesLeft ?? "--"}G`,
          meter: Math.min(100, ((state.cz.babaSandwichHits || 0) / 3) * 100),
        };
      }
      return {
        kicker: "CHALLENGE / 発展",
        title: state.cz?.name || "チャレンジ",
        subtitle: `残り ${state.cz?.gamesLeft ?? "--"}G　運命の瞬間を掴め`,
        meter: Math.max(18, Math.min(100, ((state.cz?.games - state.cz?.gamesLeft + 1) / Math.max(1, state.cz?.games || 1)) * 100)),
      };
    }
    if (state.mode === "bonus") {
      const type = state.bonus?.type;
      const title = type === "GOLD_REG" ? "GOLD REG BONUS" : type === "REG" ? "REG BONUS" : "BIG BONUS";
      return {
        kicker: "",
        title,
        subtitle: `${state.bonus?.coins ?? 0} / ${state.bonus?.maxCoins ?? 0}枚`,
        meter: Math.max(4, Math.min(100, ((state.bonus?.coins || 0) / Math.max(1, state.bonus?.maxCoins || 1)) * 100)),
      };
    }
    if (state.mode === "at" || state.mode === "tama") {
      const roundGamesLeft = Math.max(0, 10 - (state.at?.currentRoundGame || 0));
      const tamaGames = state.tama?.games || 3;
      const tamaGamesLeft = state.tama?.gamesLeft ?? tamaGames;
      return {
        kicker: state.mode === "tama" ? "TAMA CHALLENGE" : "",
        title: state.mode === "tama" ? "玉チャレンジ" : state.at?.ura ? "開開米ブースト" : "開米ブースト",
        subtitle: state.mode === "tama" ? `残り ${tamaGamesLeft}G　SPIN / 第1 / 第2 / 第3停止` : `ROUND ${state.at?.rounds ?? 0}　残り ${roundGamesLeft}G`,
        meter: state.mode === "tama" ? Math.max(8, ((tamaGames - tamaGamesLeft) / tamaGames) * 100) : Math.min(100, 28 + (state.at?.rounds || 0) * 14),
      };
    }
    if (state.mode === "ending") {
      return { kicker: "ENDING", title: "完走到達", subtitle: "裏ルートへの扉が開く", meter: 100 };
    }
    if (state.mode === "revival") {
      return {
        kicker: "REVIVAL CHALLENGE",
        title: "60G 引き戻し",
        subtitle: `残り ${state.revival?.gamesLeft ?? 60}G　復帰を掴め`,
        meter: Math.max(5, ((60 - (state.revival?.gamesLeft ?? 60)) / 60) * 100),
      };
    }
    const zoneBanner = /(?:^|\s)\d+G|CZ高確|BIG専用ゾーン/.test(state.banner || "");
    const hotBanner = state.banner && state.bannerTone && !zoneBanner;
    return {
      kicker: hotBanner ? (state.bannerTone === "warning" ? "WARNING" : "CHANCE") : "",
      title: hotBanner ? state.banner : state.stage || "通常ステージ",
      subtitle: state.bannerTone === "hit" ? "期待度上昇中" : `CURRENT ${state.currentGames || 0}G　レバーオンで抽選`,
      meter: state.bannerTone === "hit" ? 82 : state.bannerTone === "warning" ? 64 : 24,
    };
  }

    function updateLcdDom(state) {
      const screen = document.querySelector("#lcdScreen");
      const kicker = document.querySelector("#lcdKicker");
      const title = document.querySelector("#lcdTitle");
      const subtitle = document.querySelector("#lcdSubtitle");
      const meter = document.querySelector("#lcdMeterFill");

      // 液晶ベルナビ
      const lcdPushNavi = document.querySelector("#lcdPushNavi");
      const naviNumbers = document.querySelectorAll("[data-navi-reel]");

      if (!screen || !kicker || !title || !subtitle || !meter) return;

      const mode = visualMode(state);
      const copy = lcdCopy(state);

      const classMode = mode.replace(
        /[A-Z]/g,
        (letter) => `-${letter.toLowerCase()}`
      );

      // -----------------------------
      // ベルナビ表示判定
      // -----------------------------

      const order = state.pushNaviOrder;

      // Bell order occupies the LCD footer without replacing the 3D title.
      const naviVisible = ["bonus", "at", "tama"].includes(state.mode) && Array.isArray(order) && order.length === 3 && Boolean(document.querySelector(".machine-window.is-spinning"));

      // -----------------------------
      // 液晶本体のclass更新
      // -----------------------------

      screen.className =
        `lcd-screen mode-${classMode}` +
        `${state.bannerTone ? ` tone-${state.bannerTone}` : ""}` +
        `${state.mode === "tama" ? " is-tama" : ""}` +
        `${naviVisible ? " bell-navi-active" : ""}` +
        // Reserve the navi footer for the whole bonus so the title never jumps per game.
        `${["bonus", "at", "tama"].includes(state.mode) ? " bell-navi-zone" : ""}`;
      syncRegMovie(screen, state);

      screen.dataset.visualMode = mode;

      // -----------------------------
      // 通常液晶テキスト
      // -----------------------------

      kicker.textContent = copy.kicker;
      title.textContent = copy.title;
      subtitle.textContent = copy.subtitle;
      let sessionInfo = document.querySelector("#lcdSessionInfo");
      if (!sessionInfo) { sessionInfo = document.createElement("div"); sessionInfo.id = "lcdSessionInfo"; screen.append(sessionInfo); }
      const payoutMode = ["bonus", "at", "tama"].includes(state.mode);
      sessionInfo.hidden = !payoutMode;
      if (payoutMode) {
        if (state.mode === "bonus") {
          if (sessionInfo.textContent !== copy.subtitle && sessionInfo.textContent) {
            // 8: the coin figure hops when it changes.
            sessionInfo.classList.remove("bump");
            void sessionInfo.offsetWidth;
            sessionInfo.classList.add("bump");
          }
          sessionInfo.textContent = copy.subtitle;
          subtitle.textContent = "";
        } else {
          // ブーストは獲得中の枚数だけを表示し、到達上限はプレイヤー画面に出さない。
          sessionInfo.textContent = `${state.at?.coins ?? 0}枚`;
        }
      }
      meter.style.width = `${copy.meter}%`;
      window.ShibakuBTPresentation?.update(state);

      const showingNormalStage=state.mode==="normal"&&copy.title===(state.stage||"通常ステージ");
      if(showingNormalStage){
        if(api.lastNormalStage&&api.lastNormalStage!==copy.title&&!reducedMotion.matches){
          api.abstractScene?.stageTravel?.();
          title.classList.remove("stage-enter");
          void title.offsetWidth;
          title.classList.add("stage-enter");
          scheduleEffect(()=>title.classList.remove("stage-enter"),1050);
        }
        api.lastNormalStage=copy.title;
      }

      // -----------------------------
      // ベルナビ
      //
      // pushNaviOrder が
      //
      // [0, 2, 1]
      //
      // なら
      //
      // 左 = 1
      // 中 = 3
      // 右 = 2
      //
      // と表示する
      // -----------------------------

      if (lcdPushNavi) {
        lcdPushNavi.classList.toggle("hidden", !naviVisible);
      }

      if (naviVisible) {
        naviNumbers.forEach((node) => {
          const reelIndex = Number(node.dataset.naviReel);

          const stopNumber = order.indexOf(reelIndex) + 1;

          node.textContent = String(stopNumber);
        });
      } else {
        // 非表示中も一応初期値へ戻す
        naviNumbers.forEach((node, index) => {
          node.textContent = String(index + 1);
        });
      }

      // -----------------------------
      // HTML全体へ現在の液晶モードを通知
      // -----------------------------

      document.documentElement.dataset.lcdMode = mode;
    }
  // REG bonus: the LCD shows the looped REG movie (muted; the BGM plays on).
  let regMovie = null;
  function syncRegMovie(screen, state) {
    const on = state.mode === "bonus" && ["REG", "GOLD_REG"].includes(state.bonus?.type);
    if (on && !regMovie) {
      regMovie = document.createElement("video");
      regMovie.className = "lcd-reg-video";
      regMovie.muted = true;
      regMovie.loop = true;
      regMovie.playsInline = true;
      regMovie.preload = "auto";
      regMovie.setAttribute("aria-hidden", "true");
      regMovie.src = "./assets/video/reg-movie.mp4";
      document.querySelector("#lcdStage")?.after(regMovie);
      const overlay = document.createElement("div");
      overlay.className = "lcd-reg-fx";
      overlay.setAttribute("aria-hidden", "true");
      regMovie.after(overlay);
    }
    if (!regMovie) return;
    screen.classList.toggle("reg-movie", on);
    if (on) {
      regMovie.hidden = false;
      if (regMovie.paused) regMovie.play()?.catch?.(() => {});
    } else if (!regMovie.hidden) {
      regMovie.hidden = true;
      regMovie.pause();
    }
  }

  api.update = (state) => {
    if (!state) return;
    if(state.mode!=="normal"||(api.latestState&&api.latestState.stage!==state.stage))normalCue.cancel();
    api.latestState = state;
    if (api.abstractScene) api.abstractScene.scenery = { stage: state.stage, babaHits: state.cz?.babaSandwichHits || 0 };
    if (api.abstractScene) api.abstractScene.battleEnabled = state.mode === "cz" && state.cz?.key === "shibaku";
    api.abstractScene?.bonusProgress?.(state.mode === "bonus" && state.bonus ? (state.bonus.coins || 0) / Math.max(1, state.bonus.maxCoins || 1) : 0);
    if (api.battleHeld) return;
    if (api.challengeFailureHeld) return;
    if (Date.now() < api.resultUntil) return;
    api.lcdMode = visualMode(state);
    api.hue = api.lcdMode;
    api.bonusType = state.bonus?.type || null;
    updateLcdDom(state);
    syncAbstractStateTheme(api.lcdMode, state);
    syncAbstractPresentation(state);
  };

  api.normalCueBegin = (before, after) => {
    normalCue.cancel();
    // CZ / BONUS / freezes and their held announcements always take priority.
    if(before.mode!=="normal"||after.mode!=="normal"||api.battleHeld||Date.now()<api.resultUntil||reducedMotion.matches)return;
    normalCue.begin(after.internalRoleKey||after.presentationRoleKey||"miss",cueRandom(),performance.now());
  };
  api.normalCueStop = (order, displayedRole) => {
    normalCue.stop(order,performance.now(),displayedRole);
    notices?.stop(order);
  };

  const lcdGlass = window.ShibakuLcdGlass ? new window.ShibakuLcdGlass(document.querySelector("#lcdScreen")) : null;
  const glass = {
    crack: () => lcdGlass?.crack(),
    shatter: () => lcdGlass?.shatter(),
    clear: () => lcdGlass?.clear(),
  };
  const fx = (name, options) => window.ShibakuFx?.play(name, options);
  const pushButton = () => document.querySelector("#battlePushButton");
  const setScreen = (className, title = "") => {
    const screen = document.querySelector("#lcdScreen");
    if (screen) screen.className = className;
    const kicker = document.querySelector("#lcdKicker");
    const titleNode = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    if (kicker) kicker.textContent = "";
    if (titleNode) titleNode.textContent = title;
    if (subtitle) subtitle.textContent = "";
    return screen;
  };

  // PRIVATE_SPEC: presentation-only draws (cueRandom), never the game lottery.
  // Punch size leans on the held result: large punches mostly while winning.
  api.battleBeat = (beat, role, hint = {}) => {
    glass.clear();
    api.abstractScene?.cabinetWorld?.cue(beat, role);
    if (beat >= 2) api.abstractScene?.pulse(beat === 3 ? 1.25 : .6);
    if (beat === 2 || beat === 3) {
      const rare = !["miss", "replay", "bell"].includes(role);
      const large = cueRandom() < (hint.held ? .58 : .12) + (rare ? .22 : 0);
      fx(large ? "punchLarge" : "punchSmall");
      // 11: the enemy takes the hit by its size and staggers when it is going badly for it.
      if (!["miss", "replay"].includes(role)) api.abstractScene?.cabinetWorld?.enemyHit?.(large ? 1 : .45);
      api.abstractScene?.cabinetWorld?.enemyStagger?.(Boolean(hint.held));
      if (large) api.abstractScene?.impact?.({ strength: .35, hold: 0, color: 0xffd9a0, rays: .3, disturb: false });
    }
  };

  // After the final game: a charge (pushCharge) and then, together with the
  // decide sound, PUSH. An abnormal PUSH (huge or red) mostly means a win.
  const PUSH_ABNORMAL_RATE = { won: 0.30, lost: 0.02 };
  // PRIVATE_SPEC: the kankutsu plate replaces PUSH on 20% of wins only.
  const PUSH_KANKUTSU_RATE_ON_WIN = 0.20;
  // Infinite concentric rings flowing outward from the centre, accelerating
  // for as long as the charge lasts. Returns a stop function.
  function chargeRings(screen) {
    if (!screen || reducedMotion.matches) return () => {};
    const canvas = document.createElement("canvas");
    canvas.className = "lcd-charge-rings";
    canvas.setAttribute("aria-hidden", "true");
    screen.append(canvas);
    const ctx = canvas.getContext("2d");
    const rect = screen.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const cx = canvas.width * 0.5, cy = canvas.height * 0.52;
    const reach = Math.hypot(canvas.width, canvas.height) * 0.55;
    const spacing = 34 * dpr;
    const start = performance.now();
    let last = start, offset = 0, raf = 0;
    const tick = (now) => {
      if (!canvas.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      const speed = 45 * dpr * Math.pow(2.3, t);
      offset = (offset + speed * dt) % spacing;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const heat = Math.min(1, t / 3.4);
      for (let r = offset; r < reach; r += spacing) {
        const edge = 1 - r / reach;
        ctx.strokeStyle = `rgba(255,${Math.round(225 - heat * 60)},${Math.round(150 - heat * 90)},${(Math.min(1, r / (spacing * 2)) * edge * (0.35 + heat * 0.55)).toFixed(3)})`;
        ctx.lineWidth = (1.5 + heat * 3) * dpr * (0.6 + edge * 0.6);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); canvas.remove(); };
  }
  let stopChargeRings = () => {};
  const kankutsuPlate = () => document.querySelector("#lcdScreen .lcd-kankutsu");
  api.battleCharge = ({ won } = {}) => new Promise((resolve) => {
    const generation = effectGeneration;
    api.battleHeld = true;
    const world = api.abstractScene?.cabinetWorld;
    if (world) world.waiting = true;
    const kankutsu = Boolean(won) && cueRandom() < PUSH_KANKUTSU_RATE_ON_WIN;
    const abnormal = kankutsu || cueRandom() < (won ? PUSH_ABNORMAL_RATE.won : PUSH_ABNORMAL_RATE.lost);
    const style = kankutsu ? "kankutsu" : abnormal ? (cueRandom() < 0.5 ? "huge" : "red") : "normal";
    const screen = setScreen("lcd-screen mode-challenge battle-charge");
    stopChargeRings();
    stopChargeRings = chargeRings(screen);
    pushButton()?.classList.add("is-charging");
    const charge = fx(abnormal ? "pushChargeHot" : "pushCharge");
    const started = performance.now();
    // Gathering beats: short pulses that tighten as the charge builds.
    const beat = (index) => {
      if (generation !== effectGeneration || !api.battleHeld) return;
      const elapsed = performance.now() - started;
      api.abstractScene?.pulse(.35 + index * .08);
      if (index < 24) scheduleEffect(() => beat(index + 1), Math.max(70, 260 - elapsed * .06));
    };
    beat(0);
    const minimum = new Promise((done) => window.setTimeout(done, 1600));
    const ceiling = new Promise((done) => window.setTimeout(done, 5200));
    Promise.race([Promise.all([charge?.ended || Promise.resolve(), minimum]), ceiling]).then(() => {
      pushButton()?.classList.remove("is-charging");
      stopChargeRings();
      if (generation !== effectGeneration) return resolve(null);
      // The kankutsu plate always comes with its own success sound.
      fx(kankutsu ? "pushKankutsu" : abnormal ? "decideButtonHot" : "decideButton");
      api.battlePush(style);
      resolve(style);
    });
  });
  api.battlePush = (style = "normal") => {
    api.battleHeld = true;
    const world = api.abstractScene?.cabinetWorld;
    if (world) world.waiting = true;
    const screen = setScreen(`lcd-screen mode-challenge battle-push${style === "huge" ? " push-huge" : style === "red" ? " push-red" : style === "kankutsu" ? " push-kankutsu" : ""}`, "PUSH");
    kankutsuPlate()?.remove();
    if (style === "kankutsu" && screen) {
      const plate = document.createElement("img");
      plate.className = "lcd-kankutsu";
      plate.src = "./assets/images/kankutsu.png";
      plate.alt = "";
      screen.append(plate);
    }
    pushButton()?.classList.toggle("is-hot", style === "red" || style === "kankutsu");
    flash(style === "red" ? "warning" : "accent");
    api.abstractScene?.impact?.({
      strength: style === "normal" ? .25 : .6,
      hold: 0,
      color: style === "red" ? 0xff2a1f : style === "kankutsu" ? 0xffe600 : 0xfff0c0,
      rays: style === "normal" ? .15 : .7,
      disturb: false,
    });
  };

  // C9: a win that first looks like the loss (the glass cracks), then the
  // glass shatters and the win breaks through.
  const REVIVAL_RATE = 0.2;
  api.battleRevivalRoll = () => !reducedMotion.matches && cueRandom() < REVIVAL_RATE;
  api.battleRevival = () => new Promise((resolve) => {
    kankutsuPlate()?.remove();
    const generation = effectGeneration;
    api.battleHeld = true;
    const world = api.abstractScene?.cabinetWorld;
    if (world) { world.outcome = false; world.beatAt = performance.now(); }
    setScreen("lcd-screen mode-challenge battle-loss battle-revival");
    pushButton()?.classList.remove("is-hot");
    glass.crack();
    fx("glassBreak");
    api.abstractScene?.impact?.({ strength: .4, hold: .05, color: 0xbfe6ff, rays: .2, disturb: false });
    scheduleEffect(() => {
      glass.shatter();
      fx("glassBreak2");
      fx("revival");
      flash("hit");
      api.abstractScene?.impact?.({ strength: 1.2, hold: .1, color: 0xffd76a, rays: 1.3 });
    }, 1150);
    window.setTimeout(() => resolve(generation === effectGeneration), 1500);
  });
  api.battleReveal = (won, options = {}) => {
    kankutsuPlate()?.remove();
    api.battleHeld = true;
    const world = api.abstractScene?.cabinetWorld;
    if (world) { world.outcome = won; world.beatAt = performance.now(); }
    setScreen(`lcd-screen mode-challenge ${won ? "battle-win" : "battle-loss"}`, won ? "WIN" : "");
    pushButton()?.classList.remove("is-hot");
    if (won) {
      if (!options.revival) glass.clear();
      flash("hit");
      api.abstractScene?.pulse(4);
      api.abstractScene?.impact?.({ strength: 1, hold: 0.12, color: 0xffc247, rays: 1 });
    } else {
      glass.crack();
      fx("glassBreak");
      api.abstractScene?.impact?.({ strength: .45, hold: .06, color: 0xbfe6ff, rays: 0, disturb: false });
    }
  };
  api.battleEnd = (preserveGlass = false) => {
    api.battleHeld = false;
    api.resultUntil = 0;
    const world = api.abstractScene?.cabinetWorld;
    if (world) { world.waiting = false; world.outcome = null; }
    pushButton()?.classList.remove("is-charging", "is-hot");
    stopChargeRings();
    kankutsuPlate()?.remove();
    if (!preserveGlass) glass.clear();
  };

  api.ichikaku = (bonusType) => {
    const isBlue = bonusType === "BLUE_BIG";
    const machineWindow = document.querySelector(".machine-window");
    const screen = document.querySelector("#lcdScreen");
    const kicker = document.querySelector("#lcdKicker");
    const title = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    if (machineWindow) {
      machineWindow.classList.remove("ichikaku-red", "ichikaku-blue");
      machineWindow.classList.add(isBlue ? "ichikaku-blue" : "ichikaku-red");
    }
    if (screen && kicker && title && subtitle) {
      screen.classList.add("ichikaku-signal", isBlue ? "ichikaku-blue" : "ichikaku-red");
      kicker.textContent = "ONE STOP CONFIRMED";
      title.textContent = "1確";
      subtitle.textContent = isBlue ? "青の衝撃――BIG BONUS濃厚" : "赤の衝撃――BIG BONUS濃厚";
    }
    api.burst = 2.6;
    api.abstractScene?.pulse(2.4);
    api.abstractScene?.impact?.({ strength: 0.7, hold: 0.05, color: isBlue ? 0x2f8fff : 0xff3322, rays: 0.6 });
    flash("hit");
    scheduleEffect(() => {
      machineWindow?.classList.remove("ichikaku-red", "ichikaku-blue");
      screen?.classList.remove("ichikaku-signal", "ichikaku-red", "ichikaku-blue");
    }, reducedMotion.matches ? 200 : 1800);
  };

  // Notices: the look (train / travel, and its grade) is picked from the
  // already-resolved result with a presentation-only random stream, so the
  // game lottery is never consumed. Gold appears only with CZ or a win.
  let noticeSeed = (Date.now() ^ 0x5bd1e995) >>> 0 || 1;
  const noticeRandom = () => {
    noticeSeed ^= noticeSeed << 13; noticeSeed >>>= 0;
    noticeSeed ^= noticeSeed >>> 17;
    noticeSeed ^= noticeSeed << 5; noticeSeed >>>= 0;
    return noticeSeed / 4294967296;
  };
  const notices = window.ShibakuNoticeDirector?.create({
    random: noticeRandom,
    fx: (name, options) => fx(name, options),
    schedule: scheduleEffect,
    scene: () => api.abstractScene,
    reduced: () => reducedMotion.matches,
    onArmed: () => api.onNoticeArmed?.(),
  });
  api.noticeCue = (cue = {}) => {
    if (!api.abstractScene?.notice) return;
    notices?.lever(cue, api.latestState?.stage || "");
  };
  api.noticePush = () => Boolean(notices?.reveal());
  api.noticePushArmed = () => Boolean(notices?.pushArmed());

  // CZ entry "発展": rush forward, black hold, the title flies into the
  // camera, then the CZ scene breaks in. Kept under two seconds.
  api.czDevelop = (before) => {
    const ceiling = (before?.currentGames || 0) + 1 >= (window.ShibakuBT?.ceilingGames || Infinity);
    const screen = document.querySelector("#lcdScreen");
    const kicker = document.querySelector("#lcdKicker");
    const title = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    const rushMs = ceiling ? 800 : 650;
    api.developing = true;
    const token = holdPresentation(1800);
    api.abstractScene?.develop?.({ rushMs });
    if (screen && kicker && title && subtitle) {
      screen.classList.add("develop-rush");
      kicker.textContent = "";
      title.textContent = "";
      subtitle.textContent = "";
    }
    schedulePresentation(token, () => {
      if (title) title.textContent = "発展";
      screen?.classList.add("develop-title");
    }, rushMs);
    schedulePresentation(token, () => {
      screen?.classList.remove("develop-rush", "develop-title");
      if (ceiling && !reducedMotion.matches) { glass.shatter(); fx("glassBreak2"); }
      api.developing = false;
      api.resultUntil = 0;
      if (api.latestState) api.update(api.latestState);
    }, rushMs + 800);
    scheduleEffect(() => { api.developing = false; }, 2200);
  };

  // D10: hold the LCD while the drum lands, then show the result.
  api.btLanding = (result, misses = 0) => {
    const ms = window.ShibakuBTPresentation?.land?.(result, misses) || 0;
    if (!ms) return 0;
    const total = ms + 200;
    const token = holdPresentation(total);
    schedulePresentation(token, () => {
      api.resultUntil = 0;
      if (api.latestState) api.update(api.latestState);
    }, total);
    return total;
  };

  // 1: reel backlight patterns. Win / CZ pick a pattern with the
  // presentation stream; the fanfare has its own.
  const REEL_FLASH_MS = { blackout: 1300, one: 1300, blink: 1000, fanfare: 1500 };
  api.reelFlash = (kind = "win") => {
    const machineWindow = document.querySelector(".machine-window");
    if (!machineWindow || reducedMotion.matches) return;
    const pattern = kind === "fanfare" ? "fanfare" : kind === "cz" ? "blink" : ["blackout", "one", "blink"][Math.floor(cueRandom() * 3)];
    machineWindow.classList.remove("reel-flash-blackout", "reel-flash-one", "reel-flash-blink", "reel-flash-fanfare");
    void machineWindow.offsetWidth;
    machineWindow.classList.add(`reel-flash-${pattern}`);
    scheduleEffect(() => machineWindow.classList.remove(`reel-flash-${pattern}`), REEL_FLASH_MS[pattern]);
  };

  // 4: a beat of silence (sound is stopped by the caller); the LCD dims and
  // is held, then comes back with a flash.
  api.silenceBeat = (ms = 380) => new Promise((resolve) => {
    const panel = document.querySelector(".machine-panel");
    const token = holdPresentation(ms);
    panel?.classList.add("silence-beat");
    window.setTimeout(() => {
      panel?.classList.remove("silence-beat");
      if (token === presentationToken) {
        api.resultUntil = 0;
        if (api.latestState) api.update(api.latestState);
      }
      resolve();
    }, ms);
  });

  // 5: premium reverse freeze. Returns how long the aligned sevens hold (ms).
  const REVERSE_FREEZE_RATE_ON_WIN = 0.03;
  api.reverseFreezeRoll = () => !reducedMotion.matches && cueRandom() < REVERSE_FREEZE_RATE_ON_WIN;
  api.reverseFreeze = () => {
    notices?.clear();
    document.querySelector(".machine-panel")?.classList.add("reel-freeze");
    fx("reverseFreeze");
    api.abstractScene?.impact?.({ strength: .5, hold: .6, color: 0xffffff, rays: 0, disturb: false });
    return 1100;
  };
  api.reverseFreezeAligned = () => {
    const panel = document.querySelector(".machine-panel");
    panel?.classList.remove("reel-freeze");
    panel?.classList.add("notice-premium");
    document.querySelector(".machine-window")?.classList.add("notice-premium");
    fx("premiumHit");
    api.reelFlash("fanfare");
    flash("hit");
    api.abstractScene?.impact?.({ strength: 1.2, hold: .05, color: 0xffffff, rays: 1.4 });
    scheduleEffect(() => {
      panel?.classList.remove("notice-premium");
      document.querySelector(".machine-window")?.classList.remove("notice-premium");
    }, 2600);
  };

  // 10: the last-game unko win first looks lost (the glass cracks), then
  // the glass bursts. Returns the hold length (ms).
  const CZ_REVIVAL_RATE = 0.4;
  api.czRevivalRoll = () => !reducedMotion.matches && cueRandom() < CZ_REVIVAL_RATE;
  api.czRevival = () => {
    const total = 1700;
    const token = holdPresentation(total);
    setScreen("lcd-screen mode-challenge battle-loss battle-revival");
    glass.crack();
    fx("glassBreak");
    schedulePresentation(token, () => {
      glass.shatter();
      fx("glassBreak2");
      fx("revival");
      flash("hit");
      api.abstractScene?.impact?.({ strength: 1.2, hold: .1, color: 0xffd76a, rays: 1.3 });
    }, 1150);
    schedulePresentation(token, () => {
      api.resultUntil = 0;
      if (api.latestState) api.update(api.latestState);
    }, total);
    return total;
  };

  // 3 / 8: cabinet lamps (and the REG movie overlay) breathe with the BGM kick.
  let lampLoop = 0, lastKick = -1;
  function lampSync() {
    lampLoop = requestAnimationFrame(lampSync);
    const state = api.latestState;
    const on = ["bonus", "at", "tama", "bt"].includes(state?.mode) && !reducedMotion.matches;
    const machineWindow = document.querySelector(".machine-window");
    machineWindow?.classList.toggle("lamp-sync", on);
    const music = api.abstractScene?.music;
    const kick = on && music ? Math.min(1, (music.kick || 0) * (music.active || 0)) : 0;
    if (Math.abs(kick - lastKick) < 0.01) return;
    lastKick = kick;
    document.documentElement.style.setProperty("--lamp-kick", kick.toFixed(3));
  }
  lampLoop = requestAnimationFrame(lampSync);

  // C8: each CZ tightens toward its last game; the last game darkens and shakes.
  const CZ_BUILD_COLORS = { unko: 0x9fb0bb, baba: 0xffb43b, shibaku: 0xff5a2a };
  api.czLever = (key, remaining) => {
    const panel = document.querySelector(".machine-panel");
    panel?.classList.remove("cz-final");
    if (reducedMotion.matches || !Number.isFinite(remaining)) return;
    const color = CZ_BUILD_COLORS[key] || 0xffb43b;
    if (remaining > 1 && remaining <= 3) {
      api.abstractScene?.pulse(.5 + (3 - remaining) * .5);
      api.abstractScene?.impact?.({ strength: .15 + (3 - remaining) * .1, hold: 0, color, rays: 0, disturb: false });
      fx("noticeStep", { level: 4 - remaining });
    } else if (remaining === 1) {
      panel?.classList.add("cz-final");
      fx("czBuild", { duration: 1.8 });
      api.abstractScene?.impact?.({ strength: .55, hold: .2, color, rays: .25, disturb: false });
      api.abstractScene?.pulse(1.6);
    }
  };

  api.bonusConfirmed = (bonusType) => {
    const screen = document.querySelector("#lcdScreen");
    const machineWindow = document.querySelector(".machine-window");
    const className = bonusType === "BLUE_BIG" ? "bonus-confirm-blue" : bonusType === "RED_BIG" ? "bonus-confirm-red" : "bonus-confirm-reg";
    screen?.classList.add("bonus-confirmed", className);
    machineWindow?.classList.add("bonus-confirmed", className);
    // 9: LCD, lamps and reels go off together on the fanfare.
    api.reelFlash("fanfare");
    machineWindow?.classList.remove("lamp-fanfare");
    void machineWindow?.offsetWidth;
    machineWindow?.classList.add("lamp-fanfare");
    scheduleEffect(() => machineWindow?.classList.remove("lamp-fanfare"), 1700);
    api.burst = 3;
    api.abstractScene?.pulse(2.8);
    api.abstractScene?.impact?.({
      strength: bonusType === "REG" ? 0.7 : 1.1,
      hold: 0.07,
      color: bonusType === "BLUE_BIG" ? 0x2f8fff : bonusType === "RED_BIG" ? 0xff2a1f : 0xffc86a,
      rays: bonusType === "REG" ? 0.5 : 1.2,
    });
    flash("hit");
    scheduleEffect(() => {
      screen?.classList.remove("bonus-confirmed", className);
      machineWindow?.classList.remove("bonus-confirmed", className);
    }, reducedMotion.matches ? 160 : 1000);
  };

  api.babaSandwichHit = (hitNumber) => {
    api.abstractScene?.cabinetWorld?.babaHit(hitNumber);
    const machinePanel = document.querySelector(".machine-panel");
    const machineWindow = document.querySelector(".machine-window");
    const className = hitNumber >= 3 ? "baba-sandwich-clear" : "bell-payout-flash";
    machineWindow?.classList.remove("bell-payout-flash", "baba-sandwich-clear");
    void machineWindow?.offsetWidth;
    machineWindow?.classList.add(className);
    if (hitNumber >= 3) {
      machinePanel?.classList.add("baba-third-hit-blackout");
      document.documentElement.dataset.babaThirdHit = JSON.stringify({
        phase: "left-stop-blackout",
        at: Date.now(),
      });
    }
    api.burst = hitNumber >= 3 ? 4.2 : 1.9;
    api.abstractScene?.pulse(hitNumber >= 3 ? 4 : 1.4);
    flash("hit");
    scheduleEffect(() => machineWindow?.classList.remove(className), hitNumber >= 3 ? 1800 : 1200);
  };

  // The third sandwich blackout lifts shortly after the last stop; the LCD is
  // held until then so the "BONUS確定" title plays its entry in full view.
  const BABA_BLACKOUT_RELEASE_MS = 320;
  api.babaBonusReady = () => {
    const token = holdPresentation(BABA_BLACKOUT_RELEASE_MS);
    schedulePresentation(token, () => {
      api.clearBabaThirdHit();
      api.resultUntil = 0;
      if (api.latestState) api.update(api.latestState);
      // 6: the LCD glass bursts as the light comes back.
      if (!reducedMotion.matches) { glass.shatter(); fx("glassBreak2"); }
      flash("hit");
      api.abstractScene?.impact?.({ strength: .9, hold: .04, color: 0xffd84a, rays: 1 });
      document.querySelector(".machine-window")?.classList.add("baba-bonus-ready-glow");
      scheduleEffect(() => document.querySelector(".machine-window")?.classList.remove("baba-bonus-ready-glow"), 1800);
    }, BABA_BLACKOUT_RELEASE_MS);
  };

  api.clearBabaThirdHit = () => {
    document.querySelector(".machine-panel")?.classList.remove("baba-third-hit-blackout", "baba-bonus-blackout");
  };

  api.longFreeze = (nextState, durationMs = 4000) => {
    const screen = document.querySelector("#lcdScreen");
    const machineWindow = document.querySelector(".machine-window");
    const kicker = document.querySelector("#lcdKicker");
    const title = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    const meter = document.querySelector("#lcdMeterFill");
    const token = holdPresentation(durationMs);
    api.lcdMode = "bonusBlue";
    api.hue = "bonusBlue";
    api.targetIntensity = 1;
    api.burst = 4.2;
    api.abstractScene?.setPresentation("bonus", 1, { duration: 0.22, pulse: 3.5, clearFeedback: true });
    api.abstractScene?.impact?.({ strength: 1.2, hold: 0.45, color: 0x2f8fff, rays: 1.3 });
    if (screen && kicker && title && subtitle && meter) {
      screen.className = "lcd-screen mode-bonus-blue long-freeze";
      screen.dataset.visualMode = "longFreeze";
      kicker.textContent = "LONG FREEZE";
      title.textContent = "中段チェリー";
      subtitle.textContent = "青7 BIG BONUS";
      meter.style.width = "100%";
    }
    machineWindow?.classList.add("long-freeze");
    document.documentElement.dataset.lcdMode = "longFreeze";
    flash("hit");
    schedulePresentation(token, () => {
      machineWindow?.classList.remove("long-freeze");
      screen?.classList.remove("long-freeze");
      api.resultUntil = 0;
      if (nextState) api.update(nextState);
    }, reducedMotion.matches ? Math.min(800, durationMs) : durationMs);
  };

  api.showBonusResult = ({ type, coins, durationMs = 4000 }) => {
    window.ShibakuBTPresentation?.hide();
    const sessionInfo = document.querySelector("#lcdSessionInfo");
    if (sessionInfo) sessionInfo.hidden = true;
    const isBlue = type === "BLUE_BIG";
    const isReg = type === "REG";
    const screen = document.querySelector("#lcdScreen");
    const kicker = document.querySelector("#lcdKicker");
    const title = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    const meter = document.querySelector("#lcdMeterFill");
    const token = holdPresentation(durationMs);
    api.lcdMode = isBlue ? "bonusBlue" : isReg ? "bonusReg" : "bonusRed";
    if (screen && kicker && title && subtitle && meter) {
      screen.className = `lcd-screen bonus-result mode-${isBlue ? "bonus-blue" : isReg ? "bonus-reg" : "bonus-red"}`;
      screen.dataset.visualMode = "result";
      kicker.textContent = "BONUS RESULT";
      subtitle.textContent = `${isBlue ? "青7 BIG" : isReg ? "REG BONUS" : "赤7 BIG"}　獲得枚数`;
      // Count up in a handful of ticks, then stamp the final figure.
      const steps = reducedMotion.matches ? 1 : 9;
      title.dataset.count = steps === 1 ? "final" : "run";
      title.textContent = steps === 1 ? `${coins} 枚` : "0 枚";
      for (let step = 1; step <= steps; step += 1) {
        const value = Math.round(coins * (step / steps) ** 0.6);
        schedulePresentation(token, () => {
          title.dataset.count = step === steps ? "final" : "run";
          title.textContent = `${value} 枚`;
        }, 120 + (step - 1) * 110);
      }
      meter.style.width = "100%";
    }
    document.documentElement.dataset.lcdMode = "result";
    api.burst = 2.2;
    api.abstractScene?.setPresentation("bonus", isBlue ? 1 : isReg ? 2 : 0, { duration: 0.3, pulse: 2 });
    api.abstractScene?.pulse(2);
    api.abstractScene?.resultPullout?.(durationMs);
    api.abstractScene?.impact?.({ strength: 0.45, hold: 0, color: isBlue ? 0x2f8fff : isReg ? 0xffc86a : 0xff2a1f, flash: 0.5 });
    flash("hit");
    schedulePresentation(token, () => {
      api.resultUntil = 0;
      if (api.latestState) api.update(api.latestState);
    }, durationMs);
  };

  api.tamaAcquired = (durationMs = 1800) => {
    const screen = document.querySelector("#lcdScreen");
    const kicker = document.querySelector("#lcdKicker");
    const title = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    const meter = document.querySelector("#lcdMeterFill");
    const token = holdPresentation(durationMs);
    api.lcdMode = "boost";
    api.hue = "boost";
    api.targetIntensity = 1;
    api.burst = 4;
    api.abstractScene?.setPresentation("boost", api.latestState?.at?.ura ? 1 : 0, { duration: 0.2, pulse: 3.6 });
    api.abstractScene?.pulse(3.8);
    if (screen && kicker && title && subtitle && meter) {
      screen.className = "lcd-screen mode-boost tama-acquired";
      screen.dataset.visualMode = "tamaAcquired";
      kicker.textContent = "TAMA GET";
      title.textContent = "玉獲得";
      subtitle.textContent = "+1 ROUND / BOOST RETURN";
      meter.style.width = "100%";
    }
    document.documentElement.dataset.lcdMode = "tamaAcquired";
    flash("hit");
    schedulePresentation(token, () => {
      api.resultUntil = 0;
    }, durationMs);
  };

  api.vStockAcquired = (nextState, durationMs = 1600) => {
    const screen = document.querySelector("#lcdScreen");
    const kicker = document.querySelector("#lcdKicker");
    const title = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    const meter = document.querySelector("#lcdMeterFill");
    api.latestState = nextState || api.latestState;
    const token = holdPresentation(durationMs);
    api.lcdMode = "bonusReg";
    api.hue = "bonusReg";
    api.targetIntensity = 1;
    api.burst = 3.8;
    api.abstractScene?.setPresentation("bonus", nextState?.bonus?.type === "BLUE_BIG" ? 1 : nextState?.bonus?.type === "REG" ? 2 : 0, { duration: 0.28, pulse: 3 });
    api.abstractScene?.pulse(3.3);
    if (screen && kicker && title && subtitle && meter) {
      screen.className = "lcd-screen mode-bonus-reg v-stock-acquired";
      screen.dataset.visualMode = "vStockAcquired";
      kicker.textContent = "BONUS STOCK";
      title.textContent = "V獲得";
      subtitle.textContent = "NEXT BONUS STOCKED";
      meter.style.width = "100%";
    }
    document.documentElement.dataset.lcdMode = "vStockAcquired";
    flash("hit");
    schedulePresentation(token, () => {
      api.resultUntil = 0;
      if (api.latestState) api.update(api.latestState);
    }, durationMs);
  };

  api.boostConfirmed = (nextState, durationMs = 1900) => {
    const screen = document.querySelector("#lcdScreen");
    const kicker = document.querySelector("#lcdKicker");
    const title = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    const meter = document.querySelector("#lcdMeterFill");
    api.latestState = nextState || api.latestState;
    const token = holdPresentation(durationMs);
    api.lcdMode = "boost";
    api.hue = "boost";
    api.targetIntensity = 1;
    api.burst = 4.4;
    api.abstractScene?.setPresentation("boost", nextState?.at?.ura ? 1 : 0, { duration: 0.2, pulse: 4 });
    api.abstractScene?.pulse(4);
    if (screen && kicker && title && subtitle && meter) {
      screen.className = "lcd-screen mode-boost boost-confirmed";
      screen.dataset.visualMode = "boostConfirmed";
      kicker.textContent = "BOOST CONFIRMED";
      title.textContent = "開米確定";
      subtitle.textContent = "Vストック全消化後 開米ブースト突入";
      meter.style.width = "100%";
    }
    document.documentElement.dataset.lcdMode = "boostConfirmed";
    flash("hit");
    schedulePresentation(token, () => {
      api.resultUntil = 0;
      if (api.latestState) api.update(api.latestState);
    }, durationMs);
  };

  api.challengeFailed = (challengeName = "チャレンジ", nextState = null) => {
    window.ShibakuBTPresentation?.hide();
    const screen = document.querySelector("#lcdScreen");
    const kicker = document.querySelector("#lcdKicker");
    const title = document.querySelector("#lcdTitle");
    const subtitle = document.querySelector("#lcdSubtitle");
    const meter = document.querySelector("#lcdMeterFill");
    presentationToken += 1;
    api.resultUntil = 0;
    api.challengeFailureHeld = true;
    api.lcdMode = "challenge";
    if (screen && kicker && title && subtitle && meter) {
      screen.className = "lcd-screen mode-challenge challenge-failed";
      screen.dataset.visualMode = "challengeFailed";
      kicker.textContent = "CHALLENGE RESULT";
      title.textContent = "失敗";
      subtitle.textContent = `${challengeName} 終了`;
      meter.style.width = "0%";
    }
    document.documentElement.dataset.lcdMode = "challengeFailed";
    api.burst = 0.35;
    api.abstractScene?.setPresentation("challenge", 0, { duration: 0.5, pulse: 0.35 });
    flash("warning");
  };

  api.clearChallengeFailure = (nextState = null) => {
    api.challengeFailureHeld = false;
    glass.clear();
    if (nextState) {
      api.lcdMode = visualMode(nextState);
      api.hue = api.lcdMode;
      api.bonusType = nextState.bonus?.type || null;
      updateLcdDom(nextState);
    }
  };

  api.transition = (before, after) => {
    document.querySelector(".machine-panel")?.classList.remove("cz-final");
    api.update(after);
    const modeChanged = before.mode !== after.mode || before.bonus?.type !== after.bonus?.type;
    const cruisingBell = before.mode === "at" && after.mode === "at" && after.displayRoleKey === "bell";
    const hit = after.bannerTone === "hit" && !cruisingBell;
    api.targetIntensity = after.mode === "at" || after.mode === "tama" ? 0.42 : after.mode === "bonus" || after.mode === "bonusReady" ? 0.82 : after.mode === "cz" ? (after.cz?.key === "unko" ? .32 : .68) : .22;
    if (before.mode !== "cz" && after.mode === "cz" && !api.developing) {
      // Reaching the ceiling earns a longer blackout before the release.
      const ceiling = (before.currentGames || 0) + 1 >= (window.ShibakuBT?.ceilingGames || Infinity);
      api.abstractScene?.impact?.({ strength: ceiling ? 0.95 : 0.6, hold: ceiling ? 0.6 : 0.22, color: 0xffa24a, rays: ceiling ? 0.9 : 0.3 });
    }
    if (modeChanged || hit) {
      api.burst = hit ? 1.9 : 1.15;
      api.abstractScene?.pulse(hit ? 2 : 1.15);
      flash(hit ? "hit" : after.bannerTone || "accent");
    } else if (after.displayHit?.roleKey && after.displayHit.roleKey !== "miss") {
      api.burst = Math.max(api.burst, 0.5);
    }
  };

  function initReelStage(host, THREE) {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05020a, 0.075);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 0, 8);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: palettes.normal[0], wireframe: true, transparent: true, opacity: 0.28 });
    const ring = new THREE.Mesh(new THREE.TorusKnotGeometry(2.5, 0.42, 80, 10, 2, 5), ringMaterial);
    ring.rotation.x = 1.15;
    scene.add(ring);

    const count = 360;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 2.5 + Math.random() * 8;
      const angle = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = -Math.random() * 14;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({ color: palettes.normal[1], size: 0.065, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
    const particles = new THREE.Points(geometry, particleMaterial);
    scene.add(particles);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let previous = performance.now();
    const colorA = new THREE.Color();
    const colorB = new THREE.Color();
    let disposed = false;
    let rafId = 0;
    const animate = (now) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      api.intensity += (api.targetIntensity - api.intensity) * Math.min(1, dt * 3.8);
      api.burst = Math.max(0, api.burst - dt * 1.9);
      const energy = api.intensity + api.burst;
      const palette = palettes[api.hue] || palettes.normal;
      colorA.setHex(palette[0]);
      colorB.setHex(palette[1]);
      ringMaterial.color.lerp(colorA, Math.min(1, dt * 6));
      particleMaterial.color.lerp(colorB, Math.min(1, dt * 6));
      ringMaterial.opacity = 0.14 + Math.min(0.56, energy * 0.34);
      ring.rotation.y += dt * (0.22 + energy * 0.62);
      ring.rotation.z -= dt * (0.08 + energy * 0.18);
      ring.scale.setScalar(1 + Math.sin(now * 0.003) * 0.025 + api.burst * 0.08);
      particles.rotation.z += dt * (0.025 + energy * 0.06);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return {
      dispose() {
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        ring.geometry.dispose();
        ringMaterial.dispose();
        geometry.dispose();
        particleMaterial.dispose();
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer.domElement.remove();
      },
    };
  }

  function initLcdStage(host, THREE) {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x02030a, 6, 24);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
    camera.position.set(0, 0, 9.5);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setClearColor(0x010208, 0.82);
    host.appendChild(renderer.domElement);

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.3 },
        uBurst: { value: 0 },
        uColorA: { value: new THREE.Color(palettes.normal[0]) },
        uColorB: { value: new THREE.Color(palettes.normal[1]) },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uBurst;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec2 uResolution;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          p.x *= uResolution.x / max(1.0, uResolution.y);
          float t = uTime;
          float radius = length(p);
          float angle = atan(p.y, p.x);
          float rings = 0.5 + 0.5 * sin(radius * 20.0 - t * 4.4 + sin(angle * 5.0 + t));
          float ribbons = 0.5 + 0.5 * sin(p.x * 8.0 + sin(p.y * 6.0 - t * 2.2) * 2.4 + t * 3.1);
          vec2 cell = floor((p + t * vec2(0.14, -0.09)) * 7.0);
          float sparks = step(0.84 - min(0.18, uBurst * 0.04), hash(cell));
          float beams = pow(max(0.0, sin(angle * 9.0 + t * 2.7)), 7.0) * (1.0 - smoothstep(0.1, 1.25, radius));
          float energy = clamp(0.24 + uIntensity * 0.42 + uBurst * 0.11, 0.0, 1.5);
          float pattern = rings * 0.34 + ribbons * 0.32 + beams * 0.8 + sparks * 0.34;
          vec3 color = mix(uColorB, uColorA, clamp(rings * 0.7 + beams, 0.0, 1.0));
          color *= (0.18 + pattern * energy) * (1.25 - radius * 0.22);
          gl_FragColor = vec4(color, clamp(0.42 + energy * 0.24, 0.0, 0.88));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const shaderBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial);
    shaderBackdrop.renderOrder = -100;
    scene.add(shaderBackdrop);

    const tunnel = new THREE.Group();
    const tunnelMaterial = new THREE.LineBasicMaterial({ color: palettes.normal[1], transparent: true, opacity: 0.3 });
    for (let i = 0; i < 9; i += 1) {
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(7.6, 3.8, 0.12));
      const frame = new THREE.LineSegments(edges, tunnelMaterial);
      frame.position.z = 2 - i * 2.2;
      frame.scale.setScalar(0.62 + i * 0.12);
      frame.userData.baseScale = 0.62 + i * 0.12;
      tunnel.add(frame);
    }
    scene.add(tunnel);

    const targetGroup = new THREE.Group();
    const targetMaterial = new THREE.MeshBasicMaterial({ color: palettes.challenge[0], wireframe: true, transparent: true, opacity: 0.7 });
    [1.45, 2.2, 3.05].forEach((radius, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.08 + index * 0.018, 8, 72), targetMaterial);
      ring.userData.direction = index % 2 ? -1 : 1;
      targetGroup.add(ring);
    });
    scene.add(targetGroup);

    const sevenMaterial = new THREE.MeshBasicMaterial({ color: palettes.bonusRed[0], transparent: true, opacity: 0.92 });
    const sevenGroup = new THREE.Group();
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.62, 0.66), sevenMaterial);
    topBar.position.set(-0.2, 1.45, 0);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.2, 0.66), sevenMaterial);
    stem.position.set(0.82, -0.35, 0);
    stem.rotation.z = -0.48;
    sevenGroup.add(topBar, stem);
    scene.add(sevenGroup);

    const boostMaterial = new THREE.MeshBasicMaterial({ color: palettes.boost[0], wireframe: true, transparent: true, opacity: 0.72 });
    const boost = new THREE.Mesh(new THREE.TorusKnotGeometry(1.8, 0.42, 88, 10, 3, 5), boostMaterial);
    boost.rotation.x = 1.05;
    scene.add(boost);

    const shardMaterial = new THREE.MeshBasicMaterial({ color: palettes.normal[0], transparent: true, opacity: 0.55 });
    const shards = new THREE.Group();
    for (let i = 0; i < 24; i += 1) {
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55 + Math.random() * 0.9, 0.08), shardMaterial);
      const angle = (i / 24) * Math.PI * 2;
      const radius = 2.7 + Math.random() * 1.9;
      shard.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -0.5 - Math.random() * 2);
      shard.rotation.z = angle;
      shard.userData.speed = 0.4 + Math.random() * 0.8;
      shards.add(shard);
    }
    scene.add(shards);

    const count = 420;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 13;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 2] = -Math.random() * 18;
    }
    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particlesMaterial = new THREE.PointsMaterial({ color: palettes.normal[1], size: 0.075, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      shaderMaterial.uniforms.uResolution.value.set(width, height);
    };
    new ResizeObserver(resize).observe(host);
    resize();

    const colorA = new THREE.Color();
    const colorB = new THREE.Color();
    let previous = performance.now();
    const animate = (now) => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      const mode = api.lcdMode;
      const palette = palettes[mode] || palettes.normal;
      colorA.setHex(palette[0]);
      colorB.setHex(palette[1]);
      shaderMaterial.uniforms.uTime.value = now * 0.001;
      shaderMaterial.uniforms.uIntensity.value = api.intensity;
      shaderMaterial.uniforms.uBurst.value = api.burst;
      shaderMaterial.uniforms.uColorA.value.copy(colorA);
      shaderMaterial.uniforms.uColorB.value.copy(colorB);
      tunnelMaterial.color.lerp(colorB, Math.min(1, dt * 7));
      targetMaterial.color.lerp(colorA, Math.min(1, dt * 7));
      sevenMaterial.color.lerp(colorA, Math.min(1, dt * 7));
      boostMaterial.color.lerp(colorA, Math.min(1, dt * 7));
      shardMaterial.color.lerp(colorB, Math.min(1, dt * 7));
      particlesMaterial.color.lerp(colorB, Math.min(1, dt * 7));

      const challengeOn = mode === "challenge";
      const bonusOn = mode === "bonusRed" || mode === "bonusBlue" || mode === "bonusReg";
      const boostOn = mode === "boost" || mode === "ending";
      targetGroup.visible = challengeOn;
      sevenGroup.visible = bonusOn;
      boost.visible = boostOn;
      tunnel.visible = !bonusOn;

      tunnel.children.forEach((frame, index) => {
        frame.position.z += dt * (1.1 + api.intensity * 1.5);
        if (frame.position.z > 3.5) frame.position.z -= 19.8;
        frame.rotation.z = Math.sin(now * 0.00035 + index) * 0.07;
      });
      targetGroup.children.forEach((ring, index) => {
        ring.rotation.z += dt * ring.userData.direction * (0.45 + index * 0.22);
        ring.rotation.x = Math.sin(now * 0.0012 + index) * 0.18;
      });
      targetGroup.scale.setScalar(1 + Math.sin(now * 0.006) * 0.06 + api.burst * 0.12);
      sevenGroup.rotation.y = Math.sin(now * 0.0016) * 0.34;
      sevenGroup.rotation.x = Math.sin(now * 0.0011) * 0.08;
      sevenGroup.scale.setScalar(1 + Math.sin(now * 0.004) * 0.04 + api.burst * 0.13);
      boost.rotation.x += dt * 0.32;
      boost.rotation.y -= dt * 0.5;
      boost.scale.setScalar(1 + Math.sin(now * 0.0045) * 0.08);
      shards.rotation.z += dt * (challengeOn ? 0.32 : bonusOn ? 0.18 : 0.08);
      particles.rotation.z -= dt * 0.025;
      particles.position.z = (particles.position.z + dt * 0.8) % 3;
      camera.position.z = 9.5 - Math.min(1.2, api.burst * 0.55) + Math.sin(now * 0.0007) * 0.12;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  api.init = (reelHost, lcdHost) => {
    if (api.ready) return;
    const hosts = [reelHost, lcdHost].filter(Boolean);
    hosts.forEach((host) => host.classList.add(window.THREE && !reducedMotion.matches ? "webgl-ready" : "css-fallback"));
    if (!window.THREE || reducedMotion.matches) {
      api.ready = true;
      return;
    }

    try {
      const THREE = window.THREE;
      if (reelHost) api.reelStageController = initReelStage(reelHost, THREE);
      if (lcdHost && window.DigitalAbstractScene) {
        api.abstractScene = new window.DigitalAbstractScene(lcdHost, THREE, {
          ...abstractTheme(api.lcdMode),
          getDynamics: () => ({ intensity: api.intensity, burst: api.burst }),
        });
        api.abstractScene.normalCue = normalCue;
        api.abstractScene.start();
      } else if (lcdHost) {
        lcdHost.classList.remove("webgl-ready");
        lcdHost.classList.add("css-fallback");
      }
      api.ready = true;
    } catch (error) {
      api.abstractScene?.dispose();
      api.reelStageController?.dispose?.();
      api.abstractScene = null;
      api.reelStageController = null;
      hosts.forEach((host) => {
        host.classList.remove("webgl-ready");
        host.classList.add("css-fallback");
      });
      console.warn("Three.js演出をCSSへフォールバックしました", error);
      api.ready = true;
    }
  };

  api.setAbstractTheme = (theme, options = {}) => {
    api.abstractScene?.setTheme(theme, options);
  };

  api.setAbstractPresentation = (kind, variant = 0, options = {}) => {
    api.abstractScene?.setPresentation(kind, variant, options);
  };

  api.getAbstractMetrics = () => api.abstractScene?.getMetrics() || null;

  api.setAbstractTime = (seconds = 0) => {
    api.abstractScene?.setTimelineTime(seconds);
  };

  api.dispose = () => {
    api.abstractScene?.dispose();
    api.reelStageController?.dispose?.();
    api.abstractScene = null;
    api.reelStageController = null;
    api.ready = false;
  };

  window.addEventListener("pagehide", api.dispose, { once: true });

  window.ShibakuEffects = api;
})();
