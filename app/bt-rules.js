// PRIVATE_SPEC: BT economy. No DOM, clocks, or implicit randomness.
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ShibakuBT = api;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";
  const limits = Object.freeze({ RED_BIG:200, BLUE_BIG:280, REG:80, GOLD_REG:320 });
  const ceilingGames = 918;
  const normalStages = Object.freeze(["橋本駅", "同人音楽即売会", "クラブのラウンジ"]);
  // Cosmetic hash stream: never consume lottery RNG or depend on the chosen stage.
  function stageAt(games, seed) {
    let index = 0;
    for (let band = 1; band <= Math.floor(Math.max(0, games) / 50); band++) {
      let h = (seed ^ Math.imul(band, 0x9e3779b9)) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
      index = (index + 1 + ((h ^ (h >>> 16)) & 1)) % 3;
    }
    return normalStages[index];
  }
  const czDenominators = Object.freeze([0,78,75.37254777346,71.66740952765,65.00242064111,59.17504139355,54.03670737093]);
  const normalWeights = Object.freeze({miss:782,replay:160,bell:60,watermelon:15,cherry:15,strongCherry:6,watermelonChance:3,chance:2});
  const entryFactors = Object.freeze({miss:.5,replay:1.4,bell:2,watermelon:10,cherry:10,strongCherry:30,watermelonChance:30,chance:30});
  const entryMean = Object.entries(normalWeights).reduce((n,[k,w])=>n+w*entryFactors[k],0)/1043;
  const tables = Object.freeze({
    standard:Object.freeze({RED_BIG:.08273159753890003,BLUE_BIG:.03545639894524286,REG:.10189840708480592,retry:.1,miss:.6799135964310512}),
    blue:Object.freeze({RED_BIG:.09911620079720601,BLUE_BIG:.055752862948428364,REG:.06521733982331444,retry:.1,miss:.6799135964310512})
  });
  function draw(table, random) {
    const entries=Object.entries(table);
    let cursor=random()*entries.reduce((n,[,w])=>n+w,0);
    for(const [key,weight] of entries) { cursor-=weight; if(cursor<0) return key; }
    return entries[entries.length-1][0];
  }
  function entryRate(setting, role) {
    // Conditional on neither middle cherry nor direct bonus: aggregate CZ rate stays 1/N.
    return (entryFactors[role]||0)/entryMean/czDenominators[setting]/((1-1/16384)*(1-1/2000));
  }
  function promote(type, streak) { return type==="REG" && streak>=2 ? "GOLD_REG" : type; }
  function nextStreak(type, streak) { return type==="REG" ? streak+1 : 0; }
  function advance(misses, outcome) {
    if(outcome==="retry") return {misses:0,ended:false,bonus:null};
    if(outcome==="miss") return {misses:Math.min(3,misses+1),ended:misses>=2,bonus:null};
    if(!["RED_BIG","BLUE_BIG","REG"].includes(outcome)) throw Error("Invalid BT outcome");
    return {misses,ended:false,bonus:outcome};
  }
  return Object.freeze({limits,ceilingGames,normalStages,stageAt,czDenominators,normalWeights,tables,draw,entryRate,promote,nextStreak,advance});
});
