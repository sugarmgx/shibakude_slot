(() => {
  "use strict";

  for (const selector of ["#lcdTitle", "#lcdSubtitle", "#lcdKicker"]) {
    const node = document.querySelector(selector);
    if (!node) continue;
    const sync = () => {
      if (node.childNodes.length === 1 && node.firstElementChild?.className === "lcd-ink-face") return;
      const value = node.textContent;
      node.dataset.ink = value;
      const face = document.createElement("span");
      face.className = "lcd-ink-face";
      face.textContent = value;
      node.replaceChildren(face);
    };
    sync();
    new MutationObserver(sync).observe(node, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener("DOMContentLoaded", () => {
    const machine = document.querySelector(".machine-panel");
    const stopPanel = document.querySelector(".stop-panel");
    const spin = document.querySelector(".spin-fixed");
    const segmentBank = document.querySelector(".segment-bank");
    const controls = document.querySelector(".controls-panel");
    if (!machine || !stopPanel || !spin || !segmentBank || !controls) return;
    const move = (selector, target) => document.querySelectorAll(selector).forEach(node => target.append(node));

    const chart = document.querySelector("#deltaChart");
    const chartSlot = document.querySelector("#counterChartSlot");
    if (chart && chartSlot) chartSlot.append(chart);

    const consolePanel = document.createElement("section");
    consolePanel.className = "cabinet-console";
    consolePanel.innerHTML = `
      <div class="lever-bay"><button type="button" id="maxBetButton">MAX BET</button><span class="hardware-label">LEVER</span></div>
      <div class="console-center"><span class="hardware-label">REEL CONTROL</span></div>
      <div class="dpad-bay">
        <span class="hardware-label">AV CONTROL</span>
        <div class="cabinet-dpad" aria-label="画面と音量の調整">
          <button type="button" data-dpad="up" aria-label="上：項目選択／光量を上げる">▲</button>
          <button type="button" data-dpad="left" aria-label="選択した音量を下げる">◀</button>
          <button type="button" data-dpad="ok" class="dpad-ok" aria-label="決定"></button>
          <button type="button" data-dpad="right" aria-label="選択した音量を上げる">▶</button>
          <button type="button" data-dpad="down" aria-label="下：項目選択／光量を下げる">▼</button>
        </div>
      </div>
      <div class="console-service">
        <div class="service-switches"></div>
        <div class="service-speeds"></div>
        <nav class="cabinet-nav"></nav>
      </div>`;
    machine.append(consolePanel);
    consolePanel.querySelector(".lever-bay").append(spin);
    consolePanel.querySelector(".console-center").append(stopPanel, segmentBank);
    consolePanel.querySelector(".console-service").append(consolePanel.querySelector(".dpad-bay"));
    // PLACEHOLDER: replace the wordmark contents with a local alpha image.
    const marquee = document.createElement("div");
    marquee.className = "cabinet-marquee";
    marquee.innerHTML = '<div class="cabinet-logo" aria-label="しばくでスロット BT">しばくでスロット BT</div>';
    machine.prepend(marquee);
    stopPanel.querySelectorAll(".stop-button").forEach((button, index) => { button.dataset.face = String(index + 1); });
    move("#autoButton, #soundButton", consolePanel.querySelector(".service-switches"));
    move("#speed1Button, #speed2Button, #speed3Button", consolePanel.querySelector(".service-speeds"));

    const avOverlay = document.createElement("div");
    avOverlay.className = "lcd-av-overlay hidden";
    avOverlay.innerHTML = `
      <span class="av-kicker">AV CONTROL</span>
      <div class="av-row" data-av="brightness"><span>BRIGHTNESS</span><strong>●●●●○</strong></div>
      <div class="av-row is-selected" data-av="music"><span>BGM</span><strong>5 / 5</strong></div>
      <div class="av-row" data-av="sound"><span>SE</span><strong>4 / 5</strong></div>
      <small>上下で選択・左右で調整　赤ボタンで決定</small>`;
    document.querySelector("#lcdScreen")?.append(avOverlay);

    let storedBrightness = 4;
    try { storedBrightness = Number(localStorage.getItem("shibakuBrightness")) || 4; } catch (_) {}
    let brightness = Number.isFinite(storedBrightness) ? Math.min(5, Math.max(1, Math.round(storedBrightness))) : 4;
    let selectedAudio = "music";
    let avMode = "audio";
    const lcd = document.querySelector("#lcdScreen");
    const volumeLabel = key => document.querySelector(key === "music" ? "#musicVolumeLabel" : "#soundVolumeLabel");
    const syncAv = () => {
      avOverlay.querySelectorAll("[data-av]").forEach(row => { row.hidden = avMode === "audio" ? row.dataset.av === "brightness" : row.dataset.av !== "brightness"; });
      avOverlay.querySelector("small").textContent = avMode === "audio" ? "上下で選択・左右で調整　赤ボタンで決定" : "上下で光量調整　赤ボタンで決定";
      lcd?.style.setProperty("--lcd-user-brightness", String(0.7 + brightness * 0.075));
      avOverlay.querySelector('[data-av="brightness"] strong').textContent = "●".repeat(brightness) + "○".repeat(5 - brightness);
      for (const channel of ["music", "sound"]) {
        const level = Math.max(1, Math.min(5, parseInt(volumeLabel(channel)?.textContent, 10) || 1));
        avOverlay.querySelector(`[data-av="${channel}"] strong`).textContent = "●".repeat(level) + "○".repeat(5 - level);
      }
      avOverlay.querySelectorAll("[data-av]").forEach(row => row.classList.toggle("is-selected", row.dataset.av === selectedAudio));
    };
    const showAv = () => {
      avOverlay.classList.remove("hidden");
      syncAv();
    };
    const adjustVolume = direction => {
      const id = selectedAudio === "music"
        ? (direction < 0 ? "#musicVolumeDown" : "#musicVolumeUp")
        : (direction < 0 ? "#soundVolumeDown" : "#soundVolumeUp");
      document.querySelector(id)?.click();
      requestAnimationFrame(syncAv);
    };
    consolePanel.querySelector(".cabinet-dpad").addEventListener("click", event => {
      const key = event.target.closest("button")?.dataset.dpad;
      if (!key) return;
      if (key === "ok") { avOverlay.classList.add("hidden"); return; }
      if (key === "up" || key === "down") {
        if (!avOverlay.classList.contains("hidden") && avMode === "audio") {
          selectedAudio = key === "up" ? "music" : "sound";
          showAv(); return;
        }
        avMode = "brightness";
        brightness = Math.min(5, Math.max(1, brightness + (key === "up" ? 1 : -1)));
        try { localStorage.setItem("shibakuBrightness", String(brightness)); } catch (_) {}
      } else if (key === "left" || key === "right") {
        avMode = "audio";
        adjustVolume(key === "left" ? -1 : 1);
      }
      showAv();
    });
    syncAv();

    let active = null;
    let returnFocus = null;
    function drawer(label, selectors, className = "") {
      const dialog = document.createElement("dialog");
      dialog.className = `cabinet-drawer ${className}`.trim();
      const header = document.createElement("header");
      header.innerHTML = `<h2>${label}</h2>`;
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "CLOSE";
      close.addEventListener("click", () => dialog.close());
      header.append(close);
      dialog.append(header);
      move(selectors, dialog);
      document.body.append(dialog);
      const toggle = () => {
        if (dialog.open) { dialog.close(); return; }
        active?.close();
        returnFocus = document.activeElement;
        dialog.show();
        active = dialog;
        close.focus({ preventScroll: true });
      };
      dialog.addEventListener("close", () => {
        if (active === dialog) { active = null; returnFocus?.focus?.({ preventScroll: true }); }
      });
      return toggle;
    }

    const data = drawer("DATA", ".stats-panel", "data-drawer");
    const settings = drawer("MENU", "#resetButton, .settings-row", "settings-drawer");
    const debug = drawer("DEBUG", "#debugFastButton, #overdriveButton, .debug-head, .debug-grid, .roadmap-panel, .right-column, .log-panel", "debug-drawer");
    controls.hidden = true;

    const nav = consolePanel.querySelector(".cabinet-nav");
    for (const [label, action] of [["DATA", data], ["MENU", settings], ["DEBUG", debug]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      nav.append(button);
    }

    window.addEventListener("keydown", event => {
      if (event.repeat) return;
      if (event.target.closest?.(".cabinet-confirm")) return;
      if (event.code === "Escape") { active ? active.close() : settings(); event.preventDefault(); return; }
      if (event.code === "F1") { debug(); event.preventDefault(); return; }
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.code === "Tab" && !active) { data(); event.preventDefault(); }
    });

    const recentHistory = document.createElement("section");
    recentHistory.className = "recent-bonus-history";
    recentHistory.innerHTML = '<h2>BONUS HISTORY</h2><ol></ol>';
    document.querySelector(".data-drawer")?.append(recentHistory);
    const big = document.querySelector("#dataBigCountLabel");
    const reg = document.querySelector("#dataRegCountLabel");
    let previousBig = Number(big?.textContent) || 0;
    let previousReg = Number(reg?.textContent) || 0;
    const addHistoryLamp = type => {
      const row = document.createElement("li");
      row.textContent = `${type === "big" ? "BIG BONUS" : "REG BONUS"}　${document.querySelector("#totalGamesLabel")?.textContent || ""}`;
      recentHistory.querySelector("ol").prepend(row);
      while (recentHistory.querySelector("ol").children.length > 8) recentHistory.querySelector("ol").lastElementChild.remove();
    };
    const watchCounter = (node, type) => node && new MutationObserver(() => {
      const value = Number(node.dataset.count) || 0;
      const previous = type === "big" ? previousBig : previousReg;
      if (value < previous) recentHistory.querySelector("ol").replaceChildren();
      if (value > previous) addHistoryLamp(type);
      if (type === "big") previousBig = value; else previousReg = value;
    }).observe(node, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["data-count"] });
    watchCounter(big, "big");
    watchCounter(reg, "reg");

    // SVG segments remain separate from app-owned text nodes, so rendering never
    // modifies game state or creates a MutationObserver feedback loop.
    const glyphs = {0:"abcdef",1:"bc",2:"abdeg",3:"abcdg",4:"bcfg",5:"acdfg",6:"acdefg",7:"abc",8:"abcdefg",9:"abcdfg","-":"g"};
    const paths = ["5,2 23,2 26,5 22,8 6,8 2,5", "24,9 28,5 28,25 25,28 22,25 22,12", "25,30 28,33 28,53 24,49 22,46 22,33", "6,50 22,50 26,54 23,57 5,57 2,54", "2,31 6,34 6,46 2,50 0,53 0,33", "0,5 4,9 6,12 6,25 3,28 0,25", "6,26 22,26 25,29 22,32 6,32 3,29"];
    document.querySelectorAll(".counter-cell strong, .segment-bank .machine-bottom-item strong").forEach(source => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("segment-display"); svg.setAttribute("aria-hidden", "true");
      source.classList.add("digit-source"); source.after(svg);
      let previous = null;
      const draw = () => {
        const raw = source.textContent.replace(/[^0-9/\-]/g, "") || "--";
        const deltaValue = source.id === "sectionDeltaLabel" && raw !== "--"
          ? `${raw.startsWith("-") ? "-" : ""}${raw.replace("-", "").padStart(4, "0")}`
          : null;
        const value = deltaValue ?? (raw.includes("/") || raw === "--" || raw.startsWith("-") || !source.closest(".counter-cell") ? raw : raw.padStart(source.id === "sectionGamesLabel" ? 4 : 3, "0"));
        if (previous === value) return;
        previous = value;
        svg.setAttribute("viewBox", `0 0 ${value.length * 36} 59`);
        svg.innerHTML = [...value].map((digit, index) => `<g transform="translate(${index * 36},0)">${digit === "/" ? '<path class="segment-on" d="M4 55 L23 4 L27 4 L8 55 Z"/>' : paths.map((points, segment) => `<polygon class="${glyphs[digit]?.includes("abcdefg"[segment]) ? "segment-on" : "segment-off"}" points="${points}"/>`).join("")}</g>`).join("");
      };
      draw();
      new MutationObserver(draw).observe(source, {childList:true,characterData:true,subtree:true});
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.ShibakuCabinet = {
      bellPayout(amount) {
        if (!(amount > 0)) return;
        const award = document.querySelector("#lcdBellAward");
        if (!award) return;
        award.textContent = `＋${amount}枚`;
        const token = String((Number(award.dataset.token) || 0) + 1);
        award.dataset.token = token;
        award.classList.remove("is-active");
        void award.offsetWidth;
        award.classList.add("is-active");
        window.setTimeout(() => {
          if (award.dataset.token === token) award.classList.remove("is-active");
        }, 640);
      },
      confirmReset() {
        const focused = document.activeElement;
        return new Promise(resolve => {
          const dialog = document.createElement("dialog");
          dialog.className = "cabinet-confirm";
          dialog.innerHTML = '<h2>RESET</h2><p>本当にリセットしますか？</p><div><button type="button" data-answer="no">キャンセル</button><button type="button" data-answer="yes">OK</button></div>';
          let accepted = false;
          dialog.addEventListener("click", event => {
            const answer = event.target.closest("button")?.dataset.answer;
            if (!answer) return;
            accepted = answer === "yes";
            dialog.close();
          });
          dialog.addEventListener("close", () => { dialog.remove(); focused?.focus?.(); resolve(accepted); }, {once:true});
          document.body.append(dialog);
          dialog.showModal();
          dialog.querySelector('[data-answer="no"]').focus();
        });
      },
      feedback(kind, reelIndex) {
        if (kind === "lever") consolePanel.querySelector("#maxBetButton").classList.remove("bet-prepared");
        if (reducedMotion.matches) return;
        const button = kind === "lever" ? spin.querySelector("button") : stopPanel.querySelector(`[data-stop="${reelIndex}"]`);
        if (!button) return;
        button.getAnimations({subtree:true}).forEach(animation => animation.cancel());
        // The housing stays fixed: only the lever shaft/ball or lens travels.
        const timing={duration:kind === "lever" ? 240 : 150,easing:"cubic-bezier(.2,.8,.3,1)"};
        if(kind === "lever") {
          button.animate([{transform:"rotate(-12deg)"},{transform:"rotate(10deg)",offset:.3},{transform:"rotate(-14deg)",offset:.8},{transform:"rotate(-12deg)"}],{...timing,pseudoElement:"::before"});
          button.animate([{transform:"none"},{transform:"translate(18px,7px) rotate(12deg)",offset:.3},{transform:"translate(-2px,-1px)",offset:.8},{transform:"none"}],{...timing,pseudoElement:"::after"});
        } else {
          for(const pseudoElement of ["::before","::after"])button.animate([{transform:"none"},{transform:"translateY(4px) scale(.96)",offset:.25},{transform:"none"}],{...timing,pseudoElement});
        }
      }
    };
    consolePanel.querySelector("#maxBetButton").addEventListener("click", event => {
      event.currentTarget.classList.add("bet-prepared");
      segmentBank.animate([{filter:"brightness(1)"},{filter:"brightness(1.7)"},{filter:"brightness(1)"}],{duration:250});
    });

    document.addEventListener("pointerdown", event => {
      const button = event.target.closest?.("button");
      if (!button || button.disabled) return;
      button.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.2)" }, { filter: "brightness(1)" }], { duration: 150 });
    });
  }, { once: true });
})();
