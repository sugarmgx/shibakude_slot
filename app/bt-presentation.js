// PLAYER_VISIBLE: roulette results and three remaining lamps only.
(() => {
  let panel, lastKey = "";
  const choices = [["RED_BIG","赤7"],["BLUE_BIG","青7"],["REG","REG"],["retry","RETRY"],["miss","×"]];
  window.ShibakuBTPresentation = {
    hide() {
      if (panel) { panel.hidden = true; panel.classList.remove("rolling"); }
      document.querySelector("#lcdScreen")?.classList.remove("bt-roulette-active", "bt-announcement");
      lastKey = "";
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
      if (!visible) {lastKey="";return;}
      const view=state.btView || {misses:state.bt?.misses || 0, result:state.bt?.lastResult, rolling:false};
      screen.classList.toggle("bt-announcement", !view.rolling && ["miss","end","retry"].includes(view.result));
      [...panel.querySelector(".bt-lamps").children].forEach((lamp,i)=>lamp.classList.toggle("lit",i<3-view.misses));
      panel.classList.toggle("rolling",Boolean(view.rolling));
      // The landing animation must not outlive the landing: a new spin rolls.
      if (view.rolling) panel.classList.remove("settled");
      panel.style.setProperty("--bt-speed",view.stops>=2?"0.85s":view.stops===1?"0.55s":"0.3s");
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
