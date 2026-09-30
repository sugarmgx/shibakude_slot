// Notices (normal play). The look is chosen from the game's already-resolved
// result with the presentation's own random stream; the game lottery is never
// consumed. Colors follow the usual ladder:
// white < blue < yellow < green < red < gold < rainbow.
(() => {
  "use strict";

  const TIER_COLORS = ["#f4f7fa", "#2f8bff", "#ffd23a", "#2fdc6f", "#ff2a2a", "#ffc53a", "#ffffff"];
  const TIER_HEX = [0xf4f7fa, 0x2f8bff, 0xffd23a, 0x2fdc6f, 0xff2a2a, 0xffc53a, 0xffffff];
  const RAINBOW = 6;
  const GOLD = 5;
  // Station departure board: service types, in the same ladder.
  const BOARD_TYPES = ["普通", "快速", "区間急行", "急行", "特急", "臨時", "臨時"];
  // Doujin music fair: the booth's hand-written CD sales POP, same ladder.
  const SALES = ["0枚", "10枚", "30枚", "100枚", "1000枚", "完売", "増刷決定"];
  // Club lounge: the floor-condition ticker, same ladder.
  const FLOOR = ["床の状態：異常なし", "床がきしんでいます", "床が1cm沈んでいます", "床が5cm沈んでいます", "床が10cm沈んでいます", "床が抜けそうです", "床が抜けました"];

  // PRIVATE_SPEC: rates / weights for the presentation lottery.
  const OUTCOMES = {
    none: { rate: 0.05, tiers: [62, 30, 8, 0, 0, 0, 0], kinds: { step: 40, board: 25, push: 15, train: 20, blackout: 0 } },
    weak: { rate: 0.10, tiers: [40, 36, 18, 6, 0, 0, 0], kinds: { step: 35, board: 25, push: 20, train: 20, blackout: 0 } },
    strong: { rate: 0.18, tiers: [22, 34, 26, 15, 3, 0, 0], kinds: { step: 30, board: 20, push: 25, train: 15, blackout: 10 } },
    cz: { rate: 0.55, tiers: [4, 14, 24, 26, 24, 8, 0], kinds: { step: 25, board: 20, push: 20, train: 15, blackout: 20 } },
    win: { rate: 0.70, tiers: [2, 8, 14, 20, 32, 18, 6], kinds: { step: 20, board: 20, push: 20, train: 15, blackout: 25 } },
  };
  const PREMIUM_RATE_ON_WIN = 0.04;

  function create(env) {
    const { random, fx, schedule } = env;
    const scene = () => env.scene();
    const screen = () => document.querySelector("#lcdScreen");
    const panel = () => document.querySelector(".machine-panel");
    const machineWindow = () => document.querySelector(".machine-window");
    const pushButton = () => document.querySelector("#battlePushButton");

    const layer = document.createElement("div");
    layer.className = "lcd-notice";
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    screen()?.append(layer);

    let active = null;
    let serial = 0;

    const pick = (weights) => {
      const entries = Array.isArray(weights) ? weights.map((w, i) => [i, w]) : Object.entries(weights);
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = random() * total;
      for (const [key, weight] of entries) {
        if (roll < weight) return key;
        roll -= weight;
      }
      return entries[entries.length - 1][0];
    };
    const venueOf = (stage) => (stage === "同人音楽即売会" ? "hall" : stage === "クラブのラウンジ" ? "lounge" : "station");
    const isStation = (stage) => venueOf(stage) === "station";
    const colorOf = (tier) => TIER_COLORS[tier];
    const trainGrade = (tier) => (tier >= GOLD ? "gold" : tier >= 3 ? "express" : "normal");
    const tierSound = (tier) => (tier >= RAINBOW ? "noticePremium" : tier >= 4 ? "noticeHot" : "noticeStep");

    function setColor(node, tier) {
      node?.style.setProperty("--notice-color", colorOf(tier));
      node?.classList.toggle("notice-rainbow", tier === RAINBOW);
    }

    function lamps(tier, ms = 1100) {
      const win = machineWindow();
      if (!win) return;
      setColor(win, tier);
      win.classList.remove("notice-lamps");
      void win.offsetWidth;
      win.classList.add("notice-lamps");
      const id = serial;
      schedule(() => { if (id === serial) win.classList.remove("notice-lamps"); }, ms);
    }

    function burst(tier) {
      const node = document.createElement("i");
      node.className = "notice-burst";
      setColor(node, tier);
      layer.append(node);
      layer.hidden = false;
      schedule(() => node.remove(), 950);
      scene()?.impact?.({ strength: 0.18 + tier * 0.07, hold: 0, color: TIER_HEX[tier], rays: tier >= 4 ? 0.5 : 0.1, disturb: false });
    }

    function step(tier, level = tier) {
      burst(tier);
      lamps(tier);
      fx(tierSound(tier), { level });
      scene()?.pulse?.(0.4 + tier * 0.15);
    }

    // Station step-up pieces
    function flicker() {
      const node = panel();
      node?.classList.remove("notice-flicker");
      void node?.offsetWidth;
      node?.classList.add("notice-flicker");
      schedule(() => node?.classList.remove("notice-flicker"), 760);
    }
    function board(tier, flip = false) {
      let node = layer.querySelector(".notice-board");
      if (!node) {
        node = document.createElement("div");
        node.className = "notice-board";
        node.innerHTML = "<b></b><span>橋本</span><em>まもなく</em>";
        layer.append(node);
      }
      layer.hidden = false;
      setColor(node, tier);
      node.querySelector("b").textContent = BOARD_TYPES[tier];
      if (flip) {
        node.classList.remove("is-flip");
        void node.offsetWidth;
        node.classList.add("is-flip");
      }
      fx("stationBoard");
    }
    // Hall: the count rolls, then lands on the tier's figure.
    function salesPop(tier, roll = true) {
      let node = layer.querySelector(".notice-sales");
      if (!node) {
        node = document.createElement("div");
        node.className = "notice-sales";
        node.innerHTML = "<small>新譜CD</small><strong>0枚</strong><em>頒布数</em>";
        layer.append(node);
      }
      layer.hidden = false;
      setColor(node, tier);
      const figure = node.querySelector("strong");
      const id = serial;
      const land = () => {
        if (id !== serial) return;
        figure.textContent = SALES[tier];
        node.classList.toggle("is-hot", tier >= 4);
        node.classList.remove("is-land");
        void node.offsetWidth;
        node.classList.add("is-land");
        fx("salesRegister", { level: tier });
      };
      if (!roll || env.reduced()) return land();
      node.classList.add("is-rolling");
      const ticks = 8 + tier * 2;
      for (let i = 0; i < ticks; i += 1) {
        schedule(() => {
          if (id !== serial) return;
          figure.textContent = `${Math.floor(random() * (tier >= 4 ? 9999 : 120))}枚`;
          fx("salesTick");
        }, i * 45);
      }
      schedule(() => { node.classList.remove("is-rolling"); land(); }, ticks * 45);
    }
    // Lounge: the LED ticker announces the floor; the floor sinks with it.
    function floorTicker(tier) {
      let node = layer.querySelector(".notice-floor");
      if (!node) {
        node = document.createElement("div");
        node.className = "notice-floor";
        node.innerHTML = "<span></span>";
        layer.append(node);
      }
      layer.hidden = false;
      setColor(node, tier);
      const text = node.querySelector("span");
      text.textContent = FLOOR[tier];
      node.classList.remove("is-new");
      void node.offsetWidth;
      node.classList.add("is-new");
      fx("floorChime");
    }
    function floorQuake(tier) {
      if (tier <= 0) return;
      fx(tier >= 3 ? "floorThud" : "floorCreak", { level: tier });
      scene()?.floorSink?.(Math.min(1, tier / 5));
      const node = panel();
      node?.style.setProperty("--quake", String(Math.min(1, tier / 5)));
      node?.classList.remove("notice-quake");
      void node?.offsetWidth;
      node?.classList.add("notice-quake");
      schedule(() => node?.classList.remove("notice-quake"), 900);
    }
    function crowd(tier) {
      scene()?.crowdSurge?.(0.25 + tier * 0.12);
    }
    // One "board" per venue.
    function venueBoard(venue, tier, flip) {
      if (venue === "hall") salesPop(tier);
      else if (venue === "lounge") floorTicker(tier);
      else board(tier, flip);
    }

    function alarm(tier) {
      for (const side of ["left", "right"]) {
        const node = document.createElement("i");
        node.className = `notice-alarm ${side}`;
        setColor(node, tier);
        layer.append(node);
      }
      layer.hidden = false;
    }
    function train(tier) {
      scene()?.notice?.(trainGrade(tier), random() < 0.5 ? 1 : -1, tier);
    }

    function clear() {
      serial += 1;
      active = null;
      layer.replaceChildren();
      layer.hidden = true;
      panel()?.classList.remove("notice-blackout", "notice-release", "notice-flicker", "notice-premium", "notice-quake");
      machineWindow()?.classList.remove("notice-lamps", "notice-premium");
      const button = pushButton();
      if (button?.classList.contains("is-notice")) {
        button.classList.remove("is-notice");
        button.style.removeProperty("--notice-color");
      }
    }

    // Tier path lever -> stop1 -> stop2 -> stop3, ending on the final tier.
    function ladder(final) {
      const path = [0, 0, 0, final];
      let current = Math.min(final, random() < 0.3 ? 1 : 0);
      path[0] = current;
      for (let i = 1; i < 3; i += 1) {
        const remaining = final - current;
        if (remaining > 0 && random() < 0.65) current += Math.max(1, Math.round(remaining * (i === 1 ? 0.34 : 0.5) + (random() - 0.5)));
        current = Math.min(current, final);
        path[i] = current;
      }
      return path;
    }

    function lever(cue = {}, stage = "") {
      clear();
      if (env.reduced()) return;
      const key = cue.win ? "win" : cue.cz ? "cz" : ["strong", "freeze"].includes(cue.rare) ? "strong" : cue.rare === "weak" ? "weak" : "none";
      if (cue.win && random() < PREMIUM_RATE_ON_WIN) return premium(stage);
      const outcome = OUTCOMES[key];
      if (random() >= outcome.rate) return;
      const venue = venueOf(stage);
      const station = venue === "station";
      const kind = pick(outcome.kinds);
      const tier = Number(pick(outcome.tiers));
      const id = serial;
      active = { id, kind, tier, stage, venue, station, path: ladder(tier), revealed: false };

      if (kind === "train") {
        train(tier);
        if (tier >= 4) fx(tierSound(tier), { level: tier });
        active = null;
        return;
      }
      if (kind === "step") {
        if (station) flicker();
        step(active.path[0]);
        return;
      }
      if (kind === "board") {
        venueBoard(venue, active.path[0], true);
        return;
      }
      if (kind === "push") {
        const button = pushButton();
        button?.classList.add("is-notice");
        button?.style.setProperty("--notice-color", "#ffffff");
        fx("pushButtonLit");
        env.onArmed?.();
        return;
      }
      if (kind === "blackout") {
        panel()?.classList.add("notice-blackout");
        fx("blackout");
      }
    }

    function stop(order) {
      const notice = active;
      if (!notice || notice.id !== serial) return;
      const tier = notice.path[order];
      if (notice.kind === "step") {
        // Station: flicker -> departure board -> alarm lamps -> train.
        // Hall: sales POP -> crowd jumps -> final count.
        // Lounge: floor ticker -> floor shakes -> final announcement.
        if (order === 1) venueBoard(notice.venue, tier, true);
        if (order === 2) {
          if (notice.station) alarm(tier);
          else if (notice.venue === "hall") crowd(tier);
          else floorQuake(Math.min(tier, 2));
        }
        if (order === 3) {
          if (notice.station) train(tier);
          else if (notice.venue === "hall") { salesPop(tier, tier !== notice.path[2]); crowd(tier); }
          else { if (tier !== notice.path[2]) floorTicker(tier); floorQuake(tier); }
        }
        if (tier !== notice.path[order - 1] || order === 3) step(tier);
      } else if (notice.kind === "board") {
        if (tier !== notice.path[order - 1]) venueBoard(notice.venue, tier, true);
        if (order === 3) {
          if (notice.station) train(tier);
          else if (notice.venue === "hall") crowd(tier);
          else floorQuake(tier);
          lamps(tier);
          if (tier >= 4) fx(tierSound(tier), { level: tier });
        }
      } else if (notice.kind === "push" && order === 3 && !notice.revealed) {
        reveal();
      } else if (notice.kind === "blackout" && order === 3) {
        const node = panel();
        node?.classList.remove("notice-blackout");
        node?.classList.add("notice-release");
        schedule(() => node?.classList.remove("notice-release"), 760);
        step(notice.tier);
      }
      if (order === 3) {
        const id = notice.id;
        schedule(() => { if (id === serial) clear(); }, 1500);
      }
    }

    function reveal() {
      const notice = active;
      if (!notice || notice.kind !== "push" || notice.revealed) return false;
      notice.revealed = true;
      const button = pushButton();
      button?.style.setProperty("--notice-color", colorOf(notice.tier));
      fx("pushButtonReveal", { level: notice.tier });
      step(notice.tier);
      // The dome keeps the revealed color until the notice clears after the
      // third stop; it just stops taking presses.
      env.onArmed?.();
      return true;
    }

    function premium(stage) {
      const id = serial;
      active = { id, kind: "premium", tier: RAINBOW, path: [RAINBOW, RAINBOW, RAINBOW, RAINBOW] };
      panel()?.classList.add("notice-premium");
      machineWindow()?.classList.add("notice-premium");
      fx("premiumHit");
      const venue = venueOf(stage);
      if (venue === "station") train(RAINBOW);
      else if (venue === "hall") { salesPop(RAINBOW, false); crowd(RAINBOW); }
      else { floorTicker(RAINBOW); floorQuake(RAINBOW); }
      scene()?.impact?.({ strength: 1, hold: 0.08, color: 0xffffff, rays: 1.2, disturb: false });
      schedule(() => {
        if (id !== serial) return;
        panel()?.classList.remove("notice-premium");
        machineWindow()?.classList.remove("notice-premium");
      }, 2600);
    }

    return {
      lever,
      stop,
      reveal,
      clear,
      pushArmed: () => Boolean(active && active.kind === "push" && !active.revealed),
    };
  }

  window.ShibakuNoticeDirector = { create };
})();
