// PLAYER_VISIBLE: roulette results and three remaining lamps only.
(() => {
  let panel, lastKey = "", crawlGame = null, crawl = false, landedKey = "";
  const choices = [["RED_BIG","赤7"],["BLUE_BIG","青7"],["REG","REG"],["retry","RETRY"],["miss","×"]];
  // Presentation-only random stream; the game lottery is never consumed.
  const buffer = new Uint32Array(1);
  let seed = (Date.now() ^ 0x2545f491) >>> 0 || 1;
  const random = () => {
    if (window.crypto?.getRandomValues) { window.crypto.getRandomValues(buffer); return buffer[0] / 4294967296; }
    seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const isWin = (result) => ["RED_BIG","BLUE_BIG","REG"].includes(result);
  // PRIVATE_SPEC: D10 landing styles, weighted by the already-resolved result.
  const LANDING = {
    win: [["normal", 40], ["slow", 30], ["slip", 30]],
    miss: [["normal", 70], ["slow", 12], ["overshoot", 18]],
    other: [["normal", 85], ["slow", 15]],
  };
  const LANDING_MS = { normal: 550, slow: 1300, slip: 1350, overshoot: 1350 };
  const pickLanding = (result) => {
    const table = isWin(result) ? LANDING.win : result === "miss" ? LANDING.miss : LANDING.other;
    let roll = random() * table.reduce((sum, [, w]) => sum + w, 0);
    for (const [style, weight] of table) { if (roll < weight) return style; roll -= weight; }
    return "normal";
  };
  const fx = (name, options) => window.ShibakuFx?.play(name, options);
  const lastLamp = (on) => document.querySelector(".machine-panel")?.classList.toggle("last-lamp", on);
  window.ShibakuBTPresentation = {
    hide() {
      if (panel) { panel.hidden = true; panel.classList.remove("rolling", "crawl"); }
      document.querySelector("#lcdScreen")?.classList.remove("bt-roulette-active", "bt-announcement");
      lastLamp(false);
      lastKey = "";
    },
    // D10: land the drum on the resolved face with an expectation-linked
    // stop (slow crawl, slip into the face, or overshoot and fall back).
    // Returns how long the landing takes, in ms.
    land(result, misses = 0) {
      if (!panel || !result) return 0;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const style = reduced ? "normal" : pickLanding(result);
      const screen = document.querySelector("#lcdScreen");
      screen?.classList.add("bt-roulette-active");
      screen?.classList.remove("bt-announcement");
      panel.hidden = false;
      panel.classList.remove("rolling", "crawl", "settled", "land-slow", "land-slip", "land-overshoot");
      [...panel.querySelector(".bt-lamps").children].forEach((lamp, i) => lamp.classList.toggle("lit", i < 3 - misses));
      const idx = Math.max(0, choices.findIndex(([v]) => v === result));
      panel.querySelector(".bt-track").style.setProperty("--bt-angle", (-idx * 18) + "deg");
      void panel.offsetWidth;
      panel.classList.add(style === "normal" ? "settled" : `land-${style}`);
      const ms = LANDING_MS[style];
      if (style !== "normal") {
        const ticks = style === "slow" ? 6 : 4;
        for (let i = 0; i < ticks; i += 1) window.setTimeout(() => fx("rouletteTick"), (ms * 0.8) * (1 - (1 - i / ticks) ** 2));
      }
      window.setTimeout(() => fx("rouletteStop"), style === "slip" || style === "overshoot" ? ms * 0.5 : ms * 0.85);
      if (style === "slip" || style === "overshoot") window.setTimeout(() => fx("rouletteStop"), ms * 0.95);
      landedKey = String(result);
      return ms;
    },
    update(state) {
      const visible = state.mode === "bt";
      const screen = document.querySelector("#lcdScreen");
      if (!screen) return;
      screen.classList.toggle("bt-roulette-active", visible);
      if (!panel) {
        panel = document.createElement("div");
        panel.className = "bt-roulette";
        panel.innerHTML = '<div class="bt-lamps" aria-label="残りランプ"><i></i><i></i><i></i></div><div class="bt-window"><div class="bt-track"></div><span class="bt-cursor"></span></div><strong class="bt-result"></strong>';
        const track = panel.querySelector(".bt-track");
        // Twenty faces around a vertical drum (18 degrees apart).
        let face = 0;
        for (let repeat=0; repeat<4; repeat++) for (const [key,label] of choices) {
          const cell=document.createElement("span"); cell.className="bt-choice bt-"+key;
          cell.style.setProperty("--bt-face", String(face++));
          if (key==="RED_BIG" || key==="BLUE_BIG") {
            const img=document.createElement("img");
            img.src="./assets/symbols/"+(key==="RED_BIG"?"red7":"blue7")+".png";
            img.alt=label;cell.append(img);
          } else cell.textContent=label;
          track.append(cell);
        }
        screen.append(panel);
      }
      panel.hidden = !visible;
      screen.classList.remove("bt-announcement");
      if (!visible) {lastKey="";lastLamp(false);return;}
      const view=state.btView || {misses:state.bt?.misses || 0, result:state.bt?.lastResult, rolling:false};
      screen.classList.toggle("bt-announcement", !view.rolling && ["miss","end","retry"].includes(view.result));
      [...panel.querySelector(".bt-lamps").children].forEach((lamp,i)=>lamp.classList.toggle("lit",i<3-view.misses));
      // D11: one lamp left drains the LCD color and adds a heartbeat.
      const lastOne = 3 - view.misses === 1;
      lastLamp(lastOne);
      panel.querySelector(".bt-lamps").classList.toggle("last-one", lastOne);
      panel.classList.toggle("rolling",Boolean(view.rolling));
      // The landing animation must not outlive the landing: a new spin rolls.
      if (view.rolling) panel.classList.remove("settled", "land-slow", "land-slip", "land-overshoot");
      if (view.rolling && crawlGame !== state.bt?.games) {
        crawlGame = state.bt?.games;
        const pending = state.bt?.pendingResult;
        crawl = random() < (isWin(pending) ? 0.55 : state.bt?.teaseSymbol ? 0.3 : 0.08);
        if (lastOne && view.stops === 0) fx("lastLamp");
      }
      // After the second stop the drum crawls when the game looks promising.
      const crawling = view.rolling && crawl && view.stops >= 2;
      panel.classList.toggle("crawl", crawling);
      panel.style.setProperty("--bt-speed",crawling?"2.1s":view.stops>=2?"0.85s":view.stops===1?"0.55s":"0.3s");
      if (!view.rolling && landedKey && landedKey === String(view.result)) { landedKey = ""; lastKey=[state.bt?.games,view.result,view.rolling].join(":"); return; }
      const result=panel.querySelector(".bt-result");
      result.textContent="";
      const key=[state.bt?.games,view.result,view.rolling].join(":");
      if (lastKey!==key && !view.rolling) {
        const idx=Math.max(0,choices.findIndex(([v])=>v===(view.result==="end"||!view.result?"miss":view.result)));
        // Turn the drum so the selected face sits under the centre cursor.
        panel.querySelector(".bt-track").style.setProperty("--bt-angle", (-idx*18)+"deg");
        panel.classList.remove("settled");void panel.offsetWidth;panel.classList.add("settled");
      }
      lastKey=key;
    }
  };
})();
