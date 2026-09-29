(() => {
  'use strict';
  // PRIVATE_SPEC: presentation lottery only. Never draw from the game's RNG.
  const COLORS=Object.freeze({replay:0x218dff,bell:0xffca43,watermelon:0x35dc83,cherry:0xff3547,strongCherry:0xff3547});
  const selectionRate=role=>Object.hasOwn(COLORS,role)?.10:role==='miss'?.05:0;
  class NormalCue {
    constructor(){this.cancel();}
    cancel(){this.active=false;this.phase=0;this.role=null;this.at=0;}
    begin(role,random,now){
      this.cancel();
      if(!(random>=0&&random<selectionRate(role)))return false;
      this.active=true;this.role=role;this.at=now;return true;
    }
    stop(order,now,displayedRole){
      if(!this.active||order!==this.phase+1)return;
      this.phase=order;this.at=now;
      // The final visible role wins over the forecast, including a missed role.
      if(order===3)this.role=Object.hasOwn(COLORS,displayedRole)?displayedRole:'miss';
    }
    sample(now){
      if(!this.active)return {amount:0,color:0x9cabb5,phase:0};
      const age=Math.max(0,(now-this.at)/1000);
      if(this.phase===3&&age>=.8){this.cancel();return {amount:0,color:0x9cabb5,phase:0};}
      const hit=Object.hasOwn(COLORS,this.role);
      const reveal=this.phase>0;
      const envelope=this.phase===3?Math.pow(1-age/.8,2):.58+.42*Math.exp(-age*5);
      return {amount:envelope*(reveal?(hit?1:.22):.4),color:reveal&&hit?COLORS[this.role]:0x9cabb5,phase:this.phase};
    }
  }
  const api={NormalCue,selectionRate};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else window.ShibakuNormalCue=api;
})();
