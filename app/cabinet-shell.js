(() => {
  "use strict";

  // Cabinet shell: turns the page into one machine standing in a parlor.
  // Adds the physical parts (top lamp, side lamps, speakers, waist panel with
  // the printed pay table, PUSH dome) around the existing game DOM and keeps
  // the whole unit fitted to the window. No game state is read or written.
  const SYMBOL = name => `./assets/symbols/${name}.png`;
  const PAY_TABLE = [
    [["red7", "red7", "red7"], "BIG BONUS"],
    [["blue7", "blue7", "blue7"], "BIG BONUS"],
    [["red7", "red7", "bar"], "REG BONUS"],
    [["watermelon", "watermelon", "watermelon"], "5"],
    [["bell", "bell", "bell"], "3"],
    [["replay", "replay", "replay"], "REPLAY"],
  ];

  window.addEventListener("DOMContentLoaded", () => {
    const root = document.documentElement;
    const shell = document.querySelector(".app-shell");
    const machine = document.querySelector(".machine-panel");
    const console = document.querySelector(".cabinet-console");
    const reelWindow = document.querySelector(".machine-window");
    if (!shell || !machine || !console || !reelWindow) return;
    root.classList.add("cab");

    const parlor = document.createElement("div");
    parlor.className = "parlor";
    parlor.setAttribute("aria-hidden", "true");
    document.body.prepend(parlor);

    // Top lamp: the machine's lit logo sign.
    const marquee = machine.querySelector(".cabinet-marquee");
    if (marquee) {
      marquee.innerHTML = '<div class="toplamp" role="img" aria-label="しばくでスロット"><span class="toplamp-word">しばくでスロット</span></div>';
    }

    // Side lamps: light pipes that carry the colour the LCD is emitting.
    for (const side of ["left", "right"]) {
      const lamp = document.createElement("div");
      lamp.className = `side-lamp is-${side}`;
      lamp.setAttribute("aria-hidden", "true");
      machine.append(lamp);
    }

    // Speakers flanking the reel window.
    const reelBay = document.createElement("div");
    reelBay.className = "reel-bay";
    reelWindow.before(reelBay);
    for (const side of ["left", "right"]) {
      const speaker = document.createElement("div");
      speaker.className = `cabinet-speaker is-${side}`;
      speaker.setAttribute("aria-hidden", "true");
      reelBay.append(speaker);
    }
    reelBay.insertBefore(reelWindow, reelBay.lastElementChild);

    // Deck: lever, MAX BET and the PUSH dome sit on the button deck.
    const push = document.querySelector("#battlePushButton");
    const maxBet = document.querySelector("#maxBetButton");
    const deckLeft = document.createElement("div");
    deckLeft.className = "deck-left";
    const leverBay = console.querySelector(".lever-bay");
    if (leverBay) deckLeft.append(leverBay);
    if (maxBet) { const bay = document.createElement("div"); bay.className = "bet-bay"; bay.append(maxBet); deckLeft.append(bay); }
    console.prepend(deckLeft);
    // PUSH is the big dome at the front centre of the deck.
    if (push) {
      const bay = document.createElement("div");
      bay.className = "push-bay";
      bay.append(push);
      (console.querySelector(".console-service") || console).append(bay);
    }
    document.querySelector(".push-bridge")?.classList.add("is-trim");

    // Waist panel: printed artwork and the pay table.
    const waist = document.createElement("section");
    waist.className = "cabinet-waist";
    waist.innerHTML = `
      <div class="waist-art" aria-hidden="true"><span class="waist-word">しばくでスロット</span></div>
      <div class="pay-table" role="table" aria-label="配当表">
        ${PAY_TABLE.map(([symbols, pay]) => `<div class="pay-row" role="row"><span class="pay-symbols" role="cell">${symbols.map(name => `<img src="${SYMBOL(name)}" alt="">`).join("")}</span><span class="pay-value" role="cell">${/^\d+$/.test(pay) ? `${pay}<small>枚</small>` : pay}</span></div>`).join("")}
        <p class="pay-note">3枚掛け</p>
      </div>`;
    machine.append(waist);

    // Fit the whole unit (counter + cabinet) into the window, no scrolling.
    const fit = () => {
      shell.style.transform = "none";
      const width = shell.offsetWidth, height = shell.offsetHeight;
      const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
      const top = Math.max(0, (window.innerHeight - height * scale) / 2);
      shell.style.transform = `translate(-50%, ${top}px) scale(${scale})`;
      root.style.setProperty("--cab-scale", scale.toFixed(4));
    };
    fit();
    window.addEventListener("resize", fit);
    new ResizeObserver(fit).observe(shell);
    document.fonts?.ready.then(fit);
  }, { once: true });
})();
